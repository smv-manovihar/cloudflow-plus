"""
StorageService — Dynamic S3 client factory.

Storage configuration is managed via server environment variables.
End users never manage providers directly.
"""

import logging
from typing import Optional, Tuple, Dict, Any

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError, NoCredentialsError
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import (
    PRIMARY_STORAGE_ENDPOINT,
    PRIMARY_STORAGE_ACCESS_KEY,
    PRIMARY_STORAGE_SECRET_KEY,
    PRIMARY_STORAGE_BUCKET,
    PRIMARY_STORAGE_REGION,
    SYNC_TARGET_ENDPOINT,
    SYNC_TARGET_ACCESS_KEY,
    SYNC_TARGET_SECRET_KEY,
    SYNC_TARGET_BUCKET,
    SYNC_TARGET_REGION,
)
from app.models import FileRecord

logger = logging.getLogger(__name__)


def _get_optimized_config() -> Config:
    """Returns an optimized botocore Config suitable for streaming."""
    return Config(
        max_pool_connections=50,
        retries={"total_max_attempts": 4, "mode": "adaptive"},
        connect_timeout=2,
        read_timeout=10,
        tcp_keepalive=True,
    )


class StorageService:
    """
    Platform-level S3 client factory.
    Creates boto3 clients for primary storage and optional sync target.
    """

    @staticmethod
    def get_primary_client() -> Tuple:
        """
        Returns (boto3_client, bucket_name) for primary storage.
        Raises HTTP 503 if credentials or bucket are missing.
        """
        if not all([PRIMARY_STORAGE_ACCESS_KEY, PRIMARY_STORAGE_SECRET_KEY, PRIMARY_STORAGE_BUCKET]):
            raise HTTPException(
                status_code=503,
                detail="Storage not configured. Set PRIMARY_STORAGE_* environment variables.",
            )

        kwargs = {
            "service_name": "s3",
            "aws_access_key_id": PRIMARY_STORAGE_ACCESS_KEY,
            "aws_secret_access_key": PRIMARY_STORAGE_SECRET_KEY,
            "region_name": PRIMARY_STORAGE_REGION or "us-east-1",
            "config": _get_optimized_config(),
        }
        if PRIMARY_STORAGE_ENDPOINT:
            kwargs["endpoint_url"] = PRIMARY_STORAGE_ENDPOINT

        client = boto3.client(**kwargs)
        return client, PRIMARY_STORAGE_BUCKET

    @staticmethod
    def get_primary_bucket() -> str:
        """Returns the primary storage bucket name."""
        return PRIMARY_STORAGE_BUCKET

    @staticmethod
    def has_sync_target() -> bool:
        """Returns True if a secondary sync target is configured in the environment."""
        return bool(SYNC_TARGET_ACCESS_KEY and SYNC_TARGET_BUCKET)

    @staticmethod
    def get_sync_target_client() -> Tuple:
        """
        Returns (boto3_client, bucket_name) for sync target storage.
        Returns (None, None) if no sync target is configured.
        """
        if not StorageService.has_sync_target():
            return None, None

        kwargs = {
            "service_name": "s3",
            "aws_access_key_id": SYNC_TARGET_ACCESS_KEY,
            "aws_secret_access_key": SYNC_TARGET_SECRET_KEY,
            "region_name": SYNC_TARGET_REGION or "us-east-1",
            "config": _get_optimized_config(),
        }
        if SYNC_TARGET_ENDPOINT:
            kwargs["endpoint_url"] = SYNC_TARGET_ENDPOINT

        client = boto3.client(**kwargs)
        return client, SYNC_TARGET_BUCKET

    @staticmethod
    def get_sync_target_bucket() -> Optional[str]:
        """Returns the sync target bucket name if configured, otherwise None."""
        return SYNC_TARGET_BUCKET if StorageService.has_sync_target() else None

    @staticmethod
    def test_connection() -> dict:
        """
        Validates connection to the primary bucket by calling head_bucket.
        """
        try:
            client, bucket = StorageService.get_primary_client()
            client.head_bucket(Bucket=bucket)
            return {
                "success": True,
                "message": f"Connected to bucket '{bucket}'.",
            }
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "Error")
            if code in ("404", "NoSuchBucket"):
                return {
                    "success": False,
                    "message": f"Bucket '{PRIMARY_STORAGE_BUCKET}' not found.",
                }
            if code in ("403", "AccessDenied"):
                return {"success": False, "message": "Access denied - check credentials."}
            return {"success": False, "message": f"Connection failed: {code}"}
        except NoCredentialsError:
            return {"success": False, "message": "Invalid credentials."}
        except Exception as e:
            return {"success": False, "message": f"Unexpected error: {str(e)}"}

    @staticmethod
    def reconcile_user_catalog(user_id: str, db: Session) -> int:
        """
        Reconciles FileRecord catalog with actual objects in primary storage for user.
        Returns the number of newly indexed files.
        """
        added_count = 0
        try:
            s3_client, bucket_name = StorageService.get_primary_client()
            prefix = f"{user_id}/"
            paginator = s3_client.get_paginator("list_objects_v2")
            for page in paginator.paginate(Bucket=bucket_name, Prefix=prefix):
                for obj in page.get("Contents", []):
                    full_key = obj.get("Key", "")
                    rel_path = full_key[len(prefix):]
                    if not rel_path:
                        continue
                    is_folder = rel_path.endswith("/")
                    clean_rel = rel_path.rstrip("/")
                    if "/" in clean_rel:
                        parent_path = clean_rel.rsplit("/", 1)[0] + "/"
                        display_name = clean_rel.rsplit("/", 1)[1]
                    else:
                        parent_path = ""
                        display_name = clean_rel

                    existing = (
                        db.query(FileRecord)
                        .filter(
                            FileRecord.user_id == user_id,
                            FileRecord.object_key == full_key,
                        )
                        .first()
                    )
                    if not existing:
                        rec = FileRecord(
                            user_id=user_id,
                            object_key=full_key,
                            display_name=display_name,
                            parent_path=parent_path,
                            size_bytes=obj.get("Size", 0),
                            content_type="application/octet-stream" if not is_folder else "application/x-directory",
                            etag=obj.get("ETag", "").strip('"'),
                            is_folder=is_folder,
                            sync_status="none",
                        )
                        db.add(rec)
                        added_count += 1

                    # Ensure all ancestor folder records exist in the database catalog
                    if parent_path:
                        curr_path = ""
                        for segment in parent_path.strip("/").split("/"):
                            if not segment:
                                continue
                            curr_parent = curr_path
                            curr_path += f"{segment}/"
                            folder_key = f"{user_id}/{curr_path}"
                            folder_rec = (
                                db.query(FileRecord)
                                .filter(
                                    FileRecord.user_id == user_id,
                                    FileRecord.object_key == folder_key,
                                )
                                .first()
                            )
                            if not folder_rec:
                                f_rec = FileRecord(
                                    user_id=user_id,
                                    object_key=folder_key,
                                    display_name=f"{segment}/",
                                    parent_path=curr_parent,
                                    size_bytes=0,
                                    content_type="application/x-directory",
                                    is_folder=True,
                                    sync_status="none",
                                )
                                db.add(f_rec)
                                added_count += 1
            if added_count > 0:
                db.commit()
        except Exception as e:
            logger.error(f"Catalog reconciliation error for user {user_id}: {e}")
            db.rollback()
        return added_count
