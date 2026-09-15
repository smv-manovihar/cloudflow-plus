from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    Boolean,
    ForeignKey,
    BigInteger,
    Text,
    Index,
)
from sqlalchemy.orm import relationship
from app.database import Base
import uuid
from datetime import datetime, timezone


def _now():
    return datetime.now(timezone.utc)


# ──────────────────────────────────────────────────────────────────────────────
# User
# ──────────────────────────────────────────────────────────────────────────────


class User(Base):
    __tablename__ = "users"

    id = Column(String, default=lambda: str(uuid.uuid4()), primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, nullable=False, unique=True, index=True)
    password = Column(String, nullable=False)

    # User role: 'user' or 'admin'
    role = Column(String, nullable=False, default="user")

    # User personal auto-sync toggle
    sync_enabled = Column(Boolean, nullable=False, default=False)

    # Relationships
    shared_links = relationship(
        "SharedLink", back_populates="user", cascade="all, delete-orphan"
    )
    file_records = relationship(
        "FileRecord", back_populates="user", cascade="all, delete-orphan"
    )
    sync_jobs = relationship(
        "SyncJob", back_populates="user", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<User {self.id} role={self.role}>"


# ──────────────────────────────────────────────────────────────────────────────
# SystemConfig (Platform/Admin Settings)
# ──────────────────────────────────────────────────────────────────────────────


class SystemConfig(Base):
    __tablename__ = "system_config"

    id = Column(Integer, primary_key=True, default=1)
    sync_enabled = Column(Boolean, nullable=False, default=True)
    share_target_preference = Column(String, nullable=False, default="primary")
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)

    def __repr__(self):
        return f"<SystemConfig sync={self.sync_enabled} share_target={self.share_target_preference}>"


# ──────────────────────────────────────────────────────────────────────────────
# FileRecord
# ──────────────────────────────────────────────────────────────────────────────


class FileRecord(Base):
    """
    File catalog metadata source of truth.
    S3 remains the storage source of truth for object content.
    """

    __tablename__ = "file_records"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # S3 object identity
    object_key = Column(String, nullable=False)  # Full S3 key (user_id/path/to/file)
    display_name = Column(String, nullable=False)  # Filename or folder name
    parent_path = Column(
        String, nullable=False, default=""
    )  # e.g. "" (root) or "photos/vacation/"

    # File attributes
    size_bytes = Column(BigInteger, nullable=False, default=0)
    content_type = Column(String, nullable=False, default="application/octet-stream")
    etag = Column(String, nullable=True)
    is_folder = Column(Boolean, nullable=False, default=False)

    # Sync tracking (stored in DB)
    sync_status = Column(
        String, nullable=False, default="none"
    )  # none | pending | synced | failed
    last_synced_at = Column(DateTime(timezone=True), nullable=True)
    sync_error = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), nullable=False, default=_now)
    updated_at = Column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )

    # Relationships
    user = relationship("User", back_populates="file_records")

    def __repr__(self):
        return f"<FileRecord {self.object_key}>"


# Composite indexes for fast listing and searching
Index("ix_file_records_user_parent", FileRecord.user_id, FileRecord.parent_path, FileRecord.is_folder)
Index("ix_file_records_user_name", FileRecord.user_id, FileRecord.display_name)
Index("ix_file_records_user_sync", FileRecord.user_id, FileRecord.sync_status)
Index("ix_file_records_user_key", FileRecord.user_id, FileRecord.object_key)


# ──────────────────────────────────────────────────────────────────────────────
# SyncJob
# ──────────────────────────────────────────────────────────────────────────────


class SyncJob(Base):
    """Tracks asynchronous sync batches for a user."""

    __tablename__ = "sync_jobs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    status = Column(
        String, nullable=False, default="queued"
    )  # queued | running | completed | completed_with_errors | failed
    total_files = Column(Integer, nullable=False, default=0)
    synced_files = Column(Integer, nullable=False, default=0)
    failed_files = Column(Integer, nullable=False, default=0)
    error_message = Column(Text, nullable=True)

    started_at = Column(DateTime(timezone=True), nullable=False, default=_now)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    user = relationship("User", back_populates="sync_jobs")

    def __repr__(self):
        return f"<SyncJob {self.id} status={self.status}>"


# ──────────────────────────────────────────────────────────────────────────────
# SharedLink
# ──────────────────────────────────────────────────────────────────────────────


class SharedLink(Base):
    __tablename__ = "shared_links"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"))

    name = Column(String, nullable=False)
    bucket = Column(String, nullable=False)
    object_key = Column(String, nullable=False)
    size_bytes = Column(BigInteger, nullable=True)
    password = Column(String)
    enabled = Column(Boolean, nullable=False, default=True)
    updated_at = Column(
        DateTime(timezone=True),
        default=_now,
        onupdate=_now,
    )
    created_at = Column(DateTime(timezone=True), default=_now)
    expires_at = Column(DateTime(timezone=True))

    user = relationship("User", back_populates="shared_links")

    def __repr__(self):
        return f"<SharedLink {self.id}>"
