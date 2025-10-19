from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, List
from sqlalchemy.orm import Session
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
    size_bytes: Optional[int]
    expires_at: Optional[datetime]
    updated_at: datetime
    created_at: datetime
    enabled: bool
    has_password: bool
    qr_code: Optional[str]
    user_id: Optional[int]


class SharedLinkListItemOut(BaseModel):
    id: uuid.UUID
    name: str
    bucket: str
    size_bytes: Optional[int]
    expires_at: Optional[datetime]
    updated_at: datetime
    created_at: datetime
    enabled: bool
    user_id: Optional[int]


class SharedLinkListOut(BaseModel):
    items: List[SharedLinkListItemOut]
    total: int
    page: int
    page_size: int


class UpdateSharedLinkIn(BaseModel):
    enabled: Optional[bool] = None
    expires_at: Optional[datetime] = None
    password: Optional[str] = None


# ============================================================================
# Helper Functions
# ============================================================================


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
    """Create a new shared link for an S3 object."""
    # Decode object_key if URL-encoded
    object_key = unquote(payload.object_key)

    # Ensure expires_at is timezone-aware
    expires_at = payload.expires_at
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    # Validate expires_at is in the future
    if expires_at and expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=400, detail="Expiration time must be in the future"
        )

    # Fetch object metadata to get size
    try:
        head = aws_s3_client.head_object(Bucket=BUCKET_NAME, Key=object_key)
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

    # Create new shared link, including the qr_code and size
    link = SharedLink(
        id=new_id,
        bucket=payload.bucket,
        name=name,
        object_key=object_key,
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
        object_key=link.object_key,
        size_bytes=link.size_bytes,
        expires_at=link.expires_at,
        updated_at=link.updated_at,
        created_at=link.created_at,
        enabled=link.enabled,
        has_password=bool(link.password),
        qr_code=link.qr_code,
        user_id=link.user_id,
    )


@router.get("/{link_id}/download")
def get_download_link(
    link_id: str,
    password: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Get a presigned download URL for a shared link."""
    # Validate UUID
    try:
        uid = uuid.UUID(link_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid link id")

    # Fetch link from database
    link = db.query(SharedLink).filter(SharedLink.id == str(uid)).first()
    if not link:
        raise HTTPException(status_code=404, detail="Shared link not found")

    # Check if link is enabled
    if not link.enabled:
        raise HTTPException(status_code=403, detail="Link is disabled")

    # Check if link has expired
    now = datetime.now(timezone.utc)
    if link.expires_at and now > link.expires_at:
        raise HTTPException(status_code=410, detail="Link expired")

    # Verify password if required
    if link.password:
        if not password:
            raise HTTPException(status_code=401, detail="Password required")
        if not Hash.verify(password, link.password):
            raise HTTPException(status_code=401, detail="Invalid password")

    short_lived_seconds = 60

    # Generate presigned URL
    presigned = generate_presigned_url(
        link.bucket, link.object_key, expires_seconds=short_lived_seconds
    )

    return {"url": presigned, "expires_in": short_lived_seconds}


@router.get("/{link_id}/qr")
def generate_qr(
    link_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve and serve the QR code for a shared link."""
    # Validate UUID
    try:
        uid = uuid.UUID(link_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid link id")

    # Fetch link from database
    link = db.query(SharedLink).filter(SharedLink.id == str(uid)).first()
    if not link:
        raise HTTPException(status_code=404, detail="Shared link not found")

    # Check ownership
    if link.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    # Check if QR code exists in the database
    if not link.qr_code:
        raise HTTPException(status_code=404, detail="QR code not found for this link.")

    # Decode the base64 string and return the image
    image_bytes = base64.b64decode(link.qr_code)
    return StreamingResponse(io.BytesIO(image_bytes), media_type="image/png")


@router.get("/me/{link_id}", response_model=SharedLinkOut)
def get_link_info_for_owner(
    link_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get detailed information about a shared link (owner only)."""
    # Validate UUID
    try:
        uid = uuid.UUID(link_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid link id")

    # Fetch link from database
    link = db.query(SharedLink).filter(SharedLink.id == str(uid)).first()
    if not link:
        raise HTTPException(status_code=404, detail="Shared link not found")

    # Check ownership
    if link.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    return SharedLinkOut(
        id=uuid.UUID(link.id),
        name=link.name,
        bucket=link.bucket,
        object_key=link.object_key,
        size_bytes=link.size_bytes,
        expires_at=link.expires_at,
        updated_at=link.updated_at,
        created_at=link.created_at,
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
    # Base query
    query = db.query(SharedLink).filter(SharedLink.user_id == current_user.id)

    # Filter by enabled status
    if enabled is not None:
        query = query.filter(SharedLink.enabled == enabled)

    # Filter expired links
    if not include_expired:
        now = datetime.now(timezone.utc)
        query = query.filter(
            or_(SharedLink.expires_at == None, SharedLink.expires_at > now)
        )

    # Search by object_key
    if q:
        query = query.filter(SharedLink.object_key.ilike(f"%{q}%"))

    # Get total count
    total = query.count()

    # Get paginated items
    items = (
        query.order_by(asc(SharedLink.expires_at).nulls_first())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    # Convert to output models
    out_items = [
        {
            "id": uuid.UUID(item.id),
            "name": item.name,
            "bucket": item.bucket,
            "size_bytes": item.size_bytes,
            "expires_at": item.expires_at,
            "updated_at": item.updated_at,
            "created_at": item.created_at,
            "enabled": item.enabled,
            "user_id": item.user_id,
        }
        for item in items
    ]

    return SharedLinkListOut(
        items=out_items, total=total, page=page, page_size=page_size
    )


@router.get("/{link_id}/public")
def get_file_info(link_id: str, db: Session = Depends(get_db)):
    """Get S3 object metadata for a shared link."""
    # Validate UUID
    try:
        uid = uuid.UUID(link_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid link id")

    # Fetch link from database
    link = db.query(SharedLink).filter(SharedLink.id == str(uid)).first()
    if not link:
        raise HTTPException(status_code=404, detail="Shared link not found")

    # Check if link is enabled
    if not link.enabled:
        raise HTTPException(status_code=403, detail="Link is disabled")

    # Check if link has expired
    now = datetime.now(timezone.utc)
    if link.expires_at and now > link.expires_at:
        raise HTTPException(status_code=410, detail="Link expired")

    # Return file information
    info = {
        "name": link.name,
        "bucket": link.bucket,
        "size_bytes": link.size_bytes,
    }

    return info


@router.put("/{link_id}", response_model=SharedLinkOut)
def update_shared_link(
    link_id: str,
    payload: UpdateSharedLinkIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an existing shared link."""
    # Validate UUID
    try:
        uid = uuid.UUID(link_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid Link")

    # Fetch link from database
    link = db.query(SharedLink).filter(SharedLink.id == str(uid)).first()
    if not link:
        raise HTTPException(status_code=404, detail="Shared link not found")

    # Check ownership
    if link.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    # Update enabled status
    if payload.enabled is not None:
        link.enabled = bool(payload.enabled)

    # Update expiration time
    if payload.expires_at is not None:
        expires_at = payload.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            raise HTTPException(
                status_code=400, detail="Expiration time must be in the future"
            )
        link.expires_at = expires_at

    # Update password
    if payload.password is not None:
        if payload.password == "":
            # Empty string removes password
            link.password = None
        else:
            # Validate and hash new password
            if len(payload.password) < 4:
                raise HTTPException(
                    status_code=400, detail="Password must be at least 4 characters"
                )
            link.password = Hash.encrypt(payload.password)

    link.updated_at = datetime.now(timezone.utc)
    # Save changes
    db.add(link)
    db.commit()
    db.refresh(link)

    return SharedLinkOut(
        id=uuid.UUID(link.id),
        name=link.name,
        bucket=link.bucket,
        object_key=link.object_key,
        size_bytes=link.size_bytes,
        expires_at=link.expires_at,
        updated_at=link.updated_at,
        created_at=link.created_at,
        enabled=link.enabled,
        has_password=bool(link.password),
        qr_code=link.qr_code,
        user_id=link.user_id,
    )


@router.delete("/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_shared_link(
    link_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a shared link (bonus endpoint for completeness)."""
    # Validate UUID
    try:
        uid = uuid.UUID(link_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid link id")

    # Fetch link from database
    link = db.query(SharedLink).filter(SharedLink.id == str(uid)).first()
    if not link:
        raise HTTPException(status_code=404, detail="Shared link not found")

    # Check ownership
    if link.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    # Delete link
    db.delete(link)
    db.commit()

    return None
