from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import or_
from datetime import datetime, timedelta, timezone
import uuid
from botocore.exceptions import ClientError
import io
import base64
import qrcode

from app.core.config import FRONTEND_URL
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
    expires_in_minutes: Optional[int] = Field(default=60, ge=1, le=60 * 24 * 30)
    enabled: Optional[bool] = True


class SharedLinkOut(BaseModel):
    id: uuid.UUID
    bucket: str
    object_key: str
    expires_at: Optional[datetime]
    enabled: bool
    has_password: bool
    qr_code: Optional[str]
    user_id: Optional[int]


class SharedLinkListOut(BaseModel):
    items: List[SharedLinkOut]
    total: int
    page: int
    page_size: int


class UpdateSharedLinkIn(BaseModel):
    enabled: Optional[bool] = None
    expires_in_minutes: Optional[int] = Field(default=None, ge=1, le=60 * 24 * 30)
    password: Optional[str] = None  # FIXED: Removed duplicate Optional


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
    # Calculate expiration time
    expires_at = None
    if payload.expires_in_minutes:
        expires_at = datetime.now(timezone.utc) + timedelta(
            minutes=payload.expires_in_minutes
        )

    # Generate new UUID
    new_id = str(uuid.uuid4())

    # Hash password if provided
    hashed_password = None
    if payload.password:
        if len(payload.password) < 4:
            raise HTTPException(
                status_code=400, detail="Password must be at least 4 characters"
            )
        hashed_password = Hash.encrypt(payload.password)

    # Create new shared link
    link = SharedLink(
        id=new_id,
        bucket=payload.bucket,
        object_key=payload.object_key,
        password=hashed_password,
        expires_at=expires_at,
        enabled=bool(payload.enabled),
        qr_code=None,
        user_id=current_user.id,
    )

    db.add(link)
    db.commit()
    db.refresh(link)

    return SharedLinkOut(
        id=link.id,
        bucket=link.bucket,
        object_key=link.object_key,
        expires_at=link.expires_at,
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
    """Generate a QR code for a shared link."""
    # Validate UUID
    try:
        uid = uuid.UUID(link_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid link id")

    # Fetch link from database
    link = db.query(SharedLink).filter(SharedLink.id == str(uid)).first()
    if not link:
        raise HTTPException(status_code=404, detail="Shared link not found")

    # ADDED: Check ownership
    if link.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    download_url = f"{FRONTEND_URL}/shared/{str(link.id)}/download"

    # Generate QR code
    qr_img = qrcode.make(download_url)
    buf = io.BytesIO()
    qr_img.save(buf, format="PNG")
    buf.seek(0)

    # Encode to base64 and save to database
    b64 = base64.b64encode(buf.getvalue()).decode()
    link.qr_code = b64
    db.add(link)
    db.commit()
    db.refresh(link)

    # Return QR code image
    return StreamingResponse(io.BytesIO(base64.b64decode(b64)), media_type="image/png")


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
        id=link.id,
        bucket=link.bucket,
        object_key=link.object_key,
        expires_at=link.expires_at,
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
        # FIXED: Use or_() instead of or
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
        query.order_by(SharedLink.expires_at.asc().nullsfirst())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    # Convert to output models
    out_items = [
        SharedLinkOut(
            id=item.id,
            bucket=item.bucket,
            object_key=item.object_key,
            expires_at=item.expires_at,
            enabled=item.enabled,
            has_password=bool(item.password),
            qr_code=item.qr_code,
            user_id=item.user_id,
        )
        for item in items
    ]

    return SharedLinkListOut(
        items=out_items, total=total, page=page, page_size=page_size
    )


@router.get("/{link_id}/fileinfo")
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

    try:
        head = aws_s3_client.head_object(Bucket=link.bucket, Key=link.object_key)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        if code in ("404", "NotFound", "NoSuchKey", "NoSuchBucket"):
            raise HTTPException(status_code=404, detail="Object or bucket not found")
        raise HTTPException(status_code=502, detail="Error accessing storage")

    # Return file information
    info = {
        "bucket": link.bucket,
        "object_key": link.object_key,
        "content_length": head.get("ContentLength"),
        "last_modified": head.get("LastModified"),
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
        raise HTTPException(status_code=400, detail="Invalid link id")

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
    if payload.expires_in_minutes is not None:
        link.expires_at = datetime.now(timezone.utc) + timedelta(
            minutes=payload.expires_in_minutes
        )

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

    # Save changes
    db.add(link)
    db.commit()
    db.refresh(link)

    return SharedLinkOut(
        id=link.id,
        bucket=link.bucket,
        object_key=link.object_key,
        expires_at=link.expires_at,
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
