from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy import or_, asc
from datetime import datetime, timezone
import uuid
from botocore.exceptions import ClientError
import io
import base64
import qrcode
from urllib.parse import unquote

from app.core.config import FRONTEND_URL, BUCKET_NAME
from app.services.s3_service import aws_s3_client
from app.hashing import Hash
from app.database import get_db
from app.oauth2 import get_current_user
from app.models import SharedLink, User


# ============================================================================
# Helper Functions
# ============================================================================


def to_utc_iso(dt: datetime) -> Optional[str]:
    """
    Convert datetime to UTC ISO 8601 format with 'Z' suffix.

    Args:
        dt: datetime object (can be timezone-aware or naive)

    Returns:
        ISO 8601 string with 'Z' suffix (e.g., '2025-10-20T18:39:00Z')
        or None if dt is None
    """
    if dt is None:
        return None

    # If datetime is naive, assume it's UTC
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)

    # Convert to UTC if it's in a different timezone
    dt_utc = dt.astimezone(timezone.utc)

    # Format as ISO string and replace +00:00 with Z
    return dt_utc.isoformat().replace("+00:00", "Z")


def validate_uuid(user_id: str) -> None:
    """
    Validate that the provided user_id is a valid UUID.

    Args:
        user_id: The user ID to validate.

    Raises:
        HTTPException: If the user_id is not a valid UUID.
    """
    try:
        uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid user ID format: must be a valid UUID",
        )


def generate_presigned_url(bucket: str, key: str, expires_seconds: int = 60) -> str:
    """Generate a presigned URL for S3 object access."""
    try:
        url = aws_s3_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=expires_seconds,
        )
        return url
    except ClientError as exc:
        raise HTTPException(status_code=502, detail="Error generating presigned URL")


# ============================================================================
# Pydantic Models
# ============================================================================


class CreateSharedLinkIn(BaseModel):
    bucket: str
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
    expires_at: Optional[str]  # Changed to str for ISO format
    updated_at: str  # Changed to str for ISO format
    created_at: str  # Changed to str for ISO format
    enabled: bool
    has_password: bool
    qr_code: Optional[str]
    user_id: Optional[str]


class SharedLinkListItemOut(BaseModel):
    id: uuid.UUID
    name: str
    bucket: str
    size_bytes: Optional[int]
    expires_at: Optional[str]  # Changed to str for ISO format
    updated_at: str  # Changed to str for ISO format
    created_at: str  # Changed to str for ISO format
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

    # Decode object_key and prepend user_id
    object_key = unquote(payload.object_key)
    user_object_key = f"{current_user.id}/{object_key}"

    # Ensure expires_at is timezone-aware UTC
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

    # Fetch object metadata to get size
    try:
        head = aws_s3_client.head_object(Bucket=BUCKET_NAME, Key=user_object_key)
        size_bytes = head.get("ContentLength")
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        if code in ("404", "NotFound", "NoSuchKey", "NoSuchBucket"):
            raise HTTPException(status_code=404, detail="Object or bucket not found")
        raise HTTPException(status_code=502, detail="Error accessing storage")

    # Generate new UUID
    new_id = str(uuid.uuid4())
    name = object_key.split("/")[-1]

    # Hash password if provided
    hashed_password = None
    if payload.password:
        if len(payload.password) < 4:
            raise HTTPException(
                status_code=400, detail="Password must be at least 4 characters"
            )
        hashed_password = Hash.encrypt(payload.password)

    # Generate QR code and encode to base64
    download_url = f"{FRONTEND_URL}/shared/{new_id}/download"
    qr_img = qrcode.make(download_url)
    buf = io.BytesIO()
    qr_img.save(buf, format="PNG")
    buf.seek(0)
    qr_code_b64 = base64.b64encode(buf.getvalue()).decode()

    # Create new shared link
    link = SharedLink(
        id=new_id,
        bucket=payload.bucket,
        name=name,
        object_key=user_object_key,
        size_bytes=size_bytes,
        password=hashed_password,
        expires_at=expires_at,
        enabled=bool(payload.enabled),
        qr_code=qr_code_b64,
        user_id=current_user.id,
    )

    db.add(link)
    db.commit()
    db.refresh(link)

    return SharedLinkOut(
        id=uuid.UUID(link.id),
        name=link.name,
        bucket=link.bucket,
        object_key=object_key,
        full_key=user_object_key,
        size_bytes=link.size_bytes,
        expires_at=to_utc_iso(link.expires_at),
        updated_at=to_utc_iso(link.updated_at),
        created_at=to_utc_iso(link.created_at),
        enabled=link.enabled,
        has_password=bool(link.password),
        qr_code=link.qr_code,
        user_id=link.user_id,
    )


@router.get("/{link_id}/qr")
def generate_qr(
    link_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve and serve the QR code for a shared link."""
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

    if not link.qr_code:
        raise HTTPException(status_code=404, detail="QR code not found for this link.")

    image_bytes = base64.b64decode(link.qr_code)
    return StreamingResponse(io.BytesIO(image_bytes), media_type="image/png")


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

    # Extract object_key without user_id prefix for response
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
        qr_code=link.qr_code,
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

    query = db.query(SharedLink).filter(SharedLink.user_id == current_user.id)

    if enabled is not None:
        query = query.filter(SharedLink.enabled == enabled)

    if not include_expired:
        now = datetime.now(timezone.utc)
        query = query.filter(
            or_(SharedLink.expires_at == None, SharedLink.expires_at > now)
        )

    if q:
        user_prefix = f"{current_user.id}/"
        query = query.filter(SharedLink.object_key.ilike(f"{user_prefix}%{q}%"))

    total = query.count()

    items = (
        query.order_by(asc(SharedLink.expires_at).nulls_first())
        .offset((page - 1) * page_size)
        .limit(page_size)
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
        items=out_items, total=total, page=page, page_size=page_size
    )


@router.put("/{link_id}", response_model=SharedLinkOut)
def update_shared_link(
    link_id: str,
    payload: UpdateSharedLinkIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an existing shared link with explicit boolean flags."""
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

    # ✅ FIXED: Explicitly mark as modified when setting to None
    if payload.remove_expiry:
        link.expires_at = None
        flag_modified(link, "expires_at")  # Mark attribute as modified
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

    # ✅ FIXED: Also mark password as modified when removing
    if payload.remove_password:
        link.password = None
        flag_modified(link, "password")  # Mark attribute as modified
        has_changes = True
    elif payload.password is not None:
        password_value = payload.password.strip()
        if len(password_value) == 0:
            raise HTTPException(
                status_code=400,
                detail="Password cannot be empty. Use remove_password flag to remove protection.",
            )
        if len(password_value) < 4:
            raise HTTPException(
                status_code=400, detail="Password must be at least 4 characters"
            )
        link.password = Hash.encrypt(password_value)
        has_changes = True

    # SQLAlchemy's onupdate parameter handles updated_at automatically
    if has_changes:
        db.add(link)
        db.commit()
        db.refresh(link)

    # Extract object_key without user_id prefix for response
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
        qr_code=link.qr_code,
        user_id=link.user_id,
    )


@router.get("/link/{object_key}")
def get_shared_link_id(
    object_key: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the shared link ID for a given object key if it exists."""
    validate_uuid(current_user.id)

    # Decode object_key and prepend user_id
    decoded_object_key = unquote(object_key)
    user_object_key = f"{current_user.id}/{decoded_object_key}"

    # Find the most recent enabled shared link for this object
    link = (
        db.query(SharedLink)
        .filter(
            SharedLink.user_id == current_user.id,
            SharedLink.object_key == user_object_key,
            SharedLink.enabled == True,
        )
        .order_by(SharedLink.created_at.desc())
        .first()
    )

    if not link:
        return {"link_id": None}

    return {"link_id": link.id}


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
    password: Optional[str] = None,
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
            # If still naive (old data), assume it's UTC
            expires_at_utc = expires_at_utc.replace(tzinfo=timezone.utc)
        else:
            expires_at_utc = expires_at_utc.astimezone(timezone.utc)

        if now > expires_at_utc:
            raise HTTPException(status_code=410, detail="Link expired")

    if link.password:
        if not password:
            raise HTTPException(status_code=401, detail="Password required")
        if not Hash.verify(password, link.password):
            raise HTTPException(status_code=401, detail="Invalid password")

    short_lived_seconds = 60
    presigned = generate_presigned_url(
        link.bucket, link.object_key, expires_seconds=short_lived_seconds
    )

    return {"url": presigned, "expires_in": short_lived_seconds}


@router.get("/{link_id}/public")
def get_file_info(link_id: str, db: Session = Depends(get_db)):
    """Get S3 object metadata for a shared link."""
    try:
        uid = uuid.UUID(link_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid link id")

    link = db.query(SharedLink).filter(SharedLink.id == str(uid)).first()
    print(link)
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
        "bucket": link.bucket,
        "size_bytes": link.size_bytes,
        "has_password": bool(link.password),
    }

    return info
