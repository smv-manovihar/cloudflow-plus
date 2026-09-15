from datetime import datetime, timezone
import logging
from typing import Optional, List, Any
from urllib.parse import unquote
import uuid

from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, Header, HTTPException, status, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import or_, asc
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.database import get_db
from app.hashing import Hash
from app.models import SharedLink, User, SystemConfig, FileRecord
from app.oauth2 import get_current_user
from app.services.storage_service import StorageService
from app.utils import to_utc_iso, validate_uuid

logger = logging.getLogger(__name__)

MIN_SHARE_PASSWORD_LENGTH = 8
MAX_PASSWORD_ATTEMPTS = 5
PASSWORD_BLOCK_SECONDS = 15 * 60

_pwd_attempts: dict[str, tuple[int, float]] = {}

# ============================================================================
# Helper Functions
# ============================================================================


def _is_password_blocked(key: str, now_ts: float) -> bool:
    entry = _pwd_attempts.get(key)
    if not entry:
        return False
    count, blocked_until = entry
    if count < MAX_PASSWORD_ATTEMPTS:
        return False
    if now_ts < blocked_until:
        return True
    _pwd_attempts.pop(key, None)
    return False


def _record_password_failure(key: str, now_ts: float) -> None:
    count, _ = _pwd_attempts.get(key, (0, 0.0))
    count += 1
    blocked_until = now_ts + PASSWORD_BLOCK_SECONDS if count >= MAX_PASSWORD_ATTEMPTS else 0.0
    _pwd_attempts[key] = (count, blocked_until)


def generate_presigned_url(
    s3_client: Any,
    bucket: str,
    key: str,
    expires_seconds: int = 60,
    filename: Optional[str] = None,
) -> str:
    """Generate a presigned URL for S3 object access with forced attachment download."""
    try:
        params: dict[str, Any] = {"Bucket": bucket, "Key": key}
        if filename:
            safe_filename = filename.replace('"', '\\"')
            params["ResponseContentDisposition"] = f'attachment; filename="{safe_filename}"'
        url = s3_client.generate_presigned_url(
            "get_object",
            Params=params,
            ExpiresIn=expires_seconds,
        )
        return str(url)
    except ClientError as exc:
        logger.error(f"Error generating presigned URL for {bucket}/{key}: {exc}")
        raise HTTPException(status_code=502, detail="Error generating presigned URL")


# ============================================================================
# Pydantic Models
# ============================================================================


class CreateSharedLinkIn(BaseModel):
    bucket: Optional[str] = None
    object_key: str
    password: Optional[str] = None
    expires_at: Optional[datetime] = None
    enabled: Optional[bool] = True


class SharedLinkOut(BaseModel):
    id: uuid.UUID
    name: str
    bucket: str
    object_key: str
    full_key: str
    size_bytes: Optional[int]
    expires_at: Optional[str]
    updated_at: str
    created_at: str
    enabled: bool
    has_password: bool
    user_id: Optional[str]


class SharedLinkListItemOut(BaseModel):
    id: uuid.UUID
    name: str
    bucket: str
    size_bytes: Optional[int]
    expires_at: Optional[str]
    updated_at: str
    created_at: str
    enabled: bool
    user_id: Optional[str]


class SharedLinkListOut(BaseModel):
    items: List[SharedLinkListItemOut]
    total: int
    page: int
    page_size: int


class UpdateSharedLinkIn(BaseModel):
    enabled: Optional[bool] = None
    remove_expiry: bool = Field(
        default=False, description="Set to true to remove expiration"
    )
    expires_at: Optional[datetime] = Field(
        default=None,
        description="New expiration date in UTC (ignored if remove_expiry is true)",
    )
    remove_password: bool = Field(
        default=False, description="Set to true to remove password protection"
    )
    password: Optional[str] = Field(
        default=None, description="New password (ignored if remove_password is true)"
    )


# ============================================================================
# Router
# ============================================================================

router = APIRouter(prefix="/share", tags=["Share Files"])


# ============================================================================
# Endpoints
# ============================================================================


@router.post(
    "/create", response_model=SharedLinkOut, status_code=status.HTTP_201_CREATED
)
def create_shared_link(
    payload: CreateSharedLinkIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new shared link for an S3 object under the user's prefix."""
    validate_uuid(current_user.id)

    raw_key = unquote(payload.object_key).lstrip("/")
    user_prefix = f"{current_user.id}/"
    if raw_key.startswith(user_prefix):
        relative_key = raw_key[len(user_prefix) :]
        user_object_key = raw_key
    else:
        relative_key = raw_key
        user_object_key = f"{user_prefix}{relative_key}"

    # Determine storage source based on platform SystemConfig
    sys_config = db.query(SystemConfig).filter(SystemConfig.id == 1).first()
    share_pref = sys_config.share_target_preference if sys_config else "primary"

    if share_pref == "sync_target":
        if not StorageService.has_sync_target():
            raise HTTPException(
                status_code=400,
                detail="Secondary sync storage is not configured on the platform.",
            )

        # Gate on synced file status
        file_rec = (
            db.query(FileRecord)
            .filter(
                FileRecord.user_id == current_user.id,
                FileRecord.object_key == user_object_key,
            )
            .first()
        )
        if not file_rec or file_rec.sync_status != "synced":
            raise HTTPException(
                status_code=400,
                detail="This file is not synced to secondary storage. Under platform policy, only synced files can be shared.",
            )

        s3_client, bucket_name = StorageService.get_sync_target_client()
    else:
        s3_client, default_bucket = StorageService.get_primary_client()
        bucket_name = payload.bucket or default_bucket

    expires_at = payload.expires_at
    if expires_at:
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        else:
            expires_at = expires_at.astimezone(timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            raise HTTPException(
                status_code=400, detail="Expiration time must be in the future (UTC)"
            )

    try:
        head = s3_client.head_object(Bucket=bucket_name, Key=user_object_key)
        size_bytes = head.get("ContentLength")
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        if code in ("404", "NotFound", "NoSuchKey", "NoSuchBucket"):
            raise HTTPException(status_code=404, detail="Object or bucket not found")
        raise HTTPException(status_code=502, detail="Error accessing storage")

    new_id = str(uuid.uuid4())
    name = relative_key.split("/")[-1]

    hashed_password = None
    if payload.password:
        if len(payload.password) < MIN_SHARE_PASSWORD_LENGTH:
            raise HTTPException(
                status_code=400,
                detail=f"Password must be at least {MIN_SHARE_PASSWORD_LENGTH} characters",
            )
        hashed_password = Hash.encrypt(payload.password)

    link = SharedLink(
        id=new_id,
        user_id=current_user.id,
        bucket=bucket_name,
        name=name,
        object_key=user_object_key,
        size_bytes=size_bytes,
        password=hashed_password,
        expires_at=expires_at,
        enabled=True if payload.enabled is None else bool(payload.enabled),
    )

    db.add(link)
    db.commit()
    db.refresh(link)

    return SharedLinkOut(
        id=uuid.UUID(link.id),
        name=link.name,
        bucket=link.bucket,
        object_key=relative_key,
        full_key=user_object_key,
        size_bytes=link.size_bytes,
        expires_at=to_utc_iso(link.expires_at),
        updated_at=to_utc_iso(link.updated_at),
        created_at=to_utc_iso(link.created_at),
        enabled=link.enabled,
        has_password=bool(link.password),
        user_id=link.user_id,
    )


@router.get("/me/{link_id}", response_model=SharedLinkOut)
def get_link_info_for_owner(
    link_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get detailed information about a shared link (owner only)."""
    validate_uuid(current_user.id)

    try:
        uid = uuid.UUID(link_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid link id")

    link = db.query(SharedLink).filter(SharedLink.id == str(uid)).first()
    if not link:
        raise HTTPException(status_code=404, detail="Shared link not found")

    if link.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    object_key = link.object_key
    user_prefix = f"{current_user.id}/"
    if object_key.startswith(user_prefix):
        object_key = object_key[len(user_prefix) :]

    return SharedLinkOut(
        id=uuid.UUID(link.id),
        name=link.name,
        bucket=link.bucket,
        object_key=object_key,
        full_key=link.object_key,
        size_bytes=link.size_bytes,
        expires_at=to_utc_iso(link.expires_at),
        updated_at=to_utc_iso(link.updated_at),
        created_at=to_utc_iso(link.created_at),
        enabled=link.enabled,
        has_password=bool(link.password),
        user_id=link.user_id,
    )


@router.get("/me", response_model=SharedLinkListOut)
def list_my_shared_links(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    enabled: Optional[bool] = Query(None),
    include_expired: bool = Query(False),
    q: Optional[str] = Query(None, description="search in object_key"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all shared links created by the current user."""
    validate_uuid(current_user.id)

    page_num = page if isinstance(page, int) and page >= 1 else 1
    limit_num = page_size if isinstance(page_size, int) and page_size >= 1 else 20
    is_enabled = enabled if isinstance(enabled, bool) else None
    inc_expired = include_expired if isinstance(include_expired, bool) else False
    search_q = q.strip() if isinstance(q, str) and q.strip() else None

    query = db.query(SharedLink).filter(SharedLink.user_id == current_user.id)

    if is_enabled is not None:
        query = query.filter(SharedLink.enabled == is_enabled)

    if not inc_expired:
        now = datetime.now(timezone.utc)
        query = query.filter(
            or_(SharedLink.expires_at == None, SharedLink.expires_at > now)  # noqa: E711
        )

    if search_q:
        user_prefix = f"{current_user.id}/"
        query = query.filter(SharedLink.object_key.ilike(f"{user_prefix}%{search_q}%"))

    total = query.count()

    items = (
        query.order_by(asc(SharedLink.expires_at).nulls_first())
        .offset((page_num - 1) * limit_num)
        .limit(limit_num)
        .all()
    )

    out_items = [
        {
            "id": uuid.UUID(item.id),
            "name": item.name,
            "bucket": item.bucket,
            "size_bytes": item.size_bytes,
            "expires_at": to_utc_iso(item.expires_at),
            "updated_at": to_utc_iso(item.updated_at),
            "created_at": to_utc_iso(item.created_at),
            "enabled": item.enabled,
            "user_id": item.user_id,
        }
        for item in items
    ]

    return SharedLinkListOut(
        items=out_items, total=total, page=page_num, page_size=limit_num
    )


@router.get("/link/{object_key:path}")
def get_shared_link_id(
    object_key: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the shared link ID for a given object key if it exists."""
    validate_uuid(current_user.id)

    raw_key = unquote(object_key).lstrip("/")
    user_prefix = f"{current_user.id}/"
    if raw_key.startswith(user_prefix):
        user_object_key = raw_key
    else:
        user_object_key = f"{user_prefix}{raw_key}"

    link = (
        db.query(SharedLink)
        .filter(
            SharedLink.user_id == current_user.id,
            SharedLink.object_key == user_object_key,
            SharedLink.enabled == True,  # noqa: E712
        )
        .order_by(SharedLink.created_at.desc())
        .first()
    )

    if not link:
        return {"link_id": None}

    return {"link_id": link.id}


@router.put("/{link_id}", response_model=SharedLinkOut)
def update_shared_link(
    link_id: str,
    payload: UpdateSharedLinkIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an existing shared link."""
    validate_uuid(current_user.id)

    try:
        uid = uuid.UUID(link_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid link id")

    link = db.query(SharedLink).filter(SharedLink.id == str(uid)).first()
    if link is None:
        raise HTTPException(status_code=404, detail="Shared link not found")

    if link.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    has_changes = False

    if payload.enabled is not None:
        link.enabled = payload.enabled
        has_changes = True

    if payload.remove_expiry:
        link.expires_at = None
        flag_modified(link, "expires_at")
        has_changes = True
    elif payload.expires_at is not None:
        expires_at = payload.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        else:
            expires_at = expires_at.astimezone(timezone.utc)
        if expires_at <= datetime.now(timezone.utc):
            raise HTTPException(
                status_code=400, detail="Expiration time must be in the future (UTC)"
            )
        link.expires_at = expires_at
        has_changes = True

    if payload.remove_password:
        link.password = None
        flag_modified(link, "password")
        has_changes = True
    elif payload.password is not None:
        password_value = payload.password.strip()
        if len(password_value) == 0:
            raise HTTPException(
                status_code=400,
                detail="Password cannot be empty. Use remove_password flag to remove protection.",
            )
        if len(password_value) < MIN_SHARE_PASSWORD_LENGTH:
            raise HTTPException(
                status_code=400,
                detail=f"Password must be at least {MIN_SHARE_PASSWORD_LENGTH} characters",
            )
        link.password = Hash.encrypt(password_value)
        has_changes = True

    if has_changes:
        db.add(link)
        db.commit()
        db.refresh(link)

    object_key = link.object_key
    user_prefix = f"{current_user.id}/"
    if object_key.startswith(user_prefix):
        object_key = object_key[len(user_prefix) :]

    return SharedLinkOut(
        id=uuid.UUID(link.id),
        name=link.name,
        bucket=link.bucket,
        object_key=object_key,
        full_key=link.object_key,
        size_bytes=link.size_bytes,
        expires_at=to_utc_iso(link.expires_at),
        updated_at=to_utc_iso(link.updated_at),
        created_at=to_utc_iso(link.created_at),
        enabled=link.enabled,
        has_password=bool(link.password),
        user_id=link.user_id,
    )


@router.delete("/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_shared_link(
    link_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a shared link."""
    validate_uuid(current_user.id)

    try:
        uid = uuid.UUID(link_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid link id")

    link = db.query(SharedLink).filter(SharedLink.id == str(uid)).first()
    if not link:
        raise HTTPException(status_code=404, detail="Shared link not found")

    if link.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    db.delete(link)
    db.commit()

    return None


@router.get("/{link_id}/download")
def get_download_link(
    link_id: str,
    request: Request,
    password: Optional[str] = Query(default=None),
    x_share_password: Optional[str] = Header(default=None, alias="X-Share-Password"),
    db: Session = Depends(get_db),
):
    """Get a presigned download URL for a shared link."""
    try:
        uid = uuid.UUID(link_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid link id")

    link = db.query(SharedLink).filter(SharedLink.id == str(uid)).first()
    if not link:
        raise HTTPException(status_code=404, detail="Shared link not found")

    if not link.enabled:
        raise HTTPException(status_code=403, detail="Link is disabled")

    now = datetime.now(timezone.utc)
    if link.expires_at:
        expires_at_utc = link.expires_at
        if expires_at_utc.tzinfo is None:
            expires_at_utc = expires_at_utc.replace(tzinfo=timezone.utc)
        else:
            expires_at_utc = expires_at_utc.astimezone(timezone.utc)

        if now > expires_at_utc:
            raise HTTPException(status_code=410, detail="Link expired")

    if link.password:
        effective_password = None
        if isinstance(x_share_password, str) and x_share_password.strip():
            effective_password = x_share_password.strip()
        elif isinstance(password, str) and password.strip():
            effective_password = password.strip()

        if not effective_password:
            raise HTTPException(status_code=401, detail="Password required")
        client_ip = request.client.host if request.client else "unknown"
        rate_key = f"{link.id}:{client_ip}"
        now_ts = now.timestamp()
        if _is_password_blocked(rate_key, now_ts):
            raise HTTPException(
                status_code=429, detail="Too many attempts. Try again later."
            )
        if not Hash.verify(effective_password, link.password):
            _record_password_failure(rate_key, now_ts)
            raise HTTPException(status_code=401, detail="Invalid password")
        _pwd_attempts.pop(rate_key, None)

    sync_bucket = StorageService.get_sync_target_bucket()
    if link.bucket == sync_bucket and StorageService.has_sync_target():
        s3_client, _ = StorageService.get_sync_target_client()
    else:
        s3_client, _ = StorageService.get_primary_client()

    short_lived_seconds = 60
    presigned = generate_presigned_url(
        s3_client,
        link.bucket,
        link.object_key,
        expires_seconds=short_lived_seconds,
        filename=link.name,
    )

    return {"url": presigned, "expires_in": short_lived_seconds}


@router.get("/{link_id}/public")
def get_file_info(link_id: str, db: Session = Depends(get_db)):
    """Get public metadata for a shared link."""
    try:
        uid = uuid.UUID(link_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid link id")

    link = db.query(SharedLink).filter(SharedLink.id == str(uid)).first()
    if not link:
        raise HTTPException(status_code=404, detail="Shared link not found")

    if not link.enabled:
        raise HTTPException(status_code=403, detail="Link is disabled")
    if link.expires_at is not None:
        now = datetime.now(timezone.utc)

        expires_at_utc = link.expires_at
        if expires_at_utc.tzinfo is None:
            expires_at_utc = expires_at_utc.replace(tzinfo=timezone.utc)
        else:
            expires_at_utc = expires_at_utc.astimezone(timezone.utc)

        if now > expires_at_utc:
            raise HTTPException(status_code=410, detail="Link expired")

    info = {
        "name": link.name,
        "size_bytes": link.size_bytes,
        "has_password": bool(link.password),
    }

    return info
