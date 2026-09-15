from pydantic import BaseModel, Field, ConfigDict
from typing import Dict, Optional
from datetime import datetime


# ──────────────────────────────────────────────────────────────────────────────
# Auth / User schemas
# ──────────────────────────────────────────────────────────────────────────────


class Login(BaseModel):
    email: str
    password: str


class User(BaseModel):
    name: str
    email: str
    password: str


class ShowUser(BaseModel):
    id: str
    name: str
    email: str
    role: str = "user"

    model_config = ConfigDict(from_attributes=True)


class UpdateUser(BaseModel):
    name: str | None = None
    email: str | None = None


class ChangePassword(BaseModel):
    old_password: str
    new_password: str


# ──────────────────────────────────────────────────────────────────────────────
# Admin & Platform Config Schemas
# ──────────────────────────────────────────────────────────────────────────────


class SystemSettingsResponse(BaseModel):
    sync_enabled: bool
    share_target_preference: str
    has_sync_target: bool
    primary_bucket: str
    sync_target_bucket: str | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class SystemSettingsUpdate(BaseModel):
    sync_enabled: bool | None = None
    share_target_preference: str | None = None


class PublicPlatformConfig(BaseModel):
    sync_enabled: bool
    share_target_preference: str
    has_sync_target: bool


# ──────────────────────────────────────────────────────────────────────────────
# Sync schemas (user-facing - user personal toggle + status)
# ──────────────────────────────────────────────────────────────────────────────


class SyncToggleRequest(BaseModel):
    enabled: bool


class SyncStatusResponse(BaseModel):
    sync_enabled: bool
    has_sync_target: bool
    last_sync_job_id: Optional[str]
    last_sync_job_status: Optional[str]
    last_sync_completed_at: Optional[datetime]


# ──────────────────────────────────────────────────────────────────────────────
# Legacy bucket schemas (kept for any remaining references)
# ──────────────────────────────────────────────────────────────────────────────


class VersioningConfig(BaseModel):
    enabled: bool


class BucketUpdatePayload(BaseModel):
    versioning: Optional[VersioningConfig] = Field(
        None, description="Enable or suspend bucket versioning."
    )
    tags: Optional[Dict[str, str]] = Field(
        None, description="A dictionary of key-value tags to apply to the bucket."
    )
    policy: Optional[dict] = Field(
        None, description="A valid S3 bucket policy in JSON (as a Python dictionary)."
    )
