"""
SyncService — Asynchronous synchronization between primary storage and sync target.
"""

import logging
from datetime import datetime, timezone
from botocore.exceptions import ClientError
from sqlalchemy.orm import Session
from typing import Optional

from app.models import FileRecord, SyncJob
from app.services.storage_service import StorageService

logger = logging.getLogger(__name__)


class S3SyncError(Exception):
    """Custom exception for sync failures."""
    pass


def _ensure_bucket_exists(client, bucket_name: str) -> None:
    """Ensure the target bucket exists, creating it if permissions allow."""
    try:
        client.head_bucket(Bucket=bucket_name)
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code")
        if code in ["404", "NoSuchBucket"]:
            try:
                client.create_bucket(Bucket=bucket_name)
                logger.info(f"Created sync destination bucket: {bucket_name}")
            except ClientError as ce:
                raise S3SyncError(f"Could not create destination bucket '{bucket_name}': {ce}") from ce
        else:
            raise S3SyncError(f"Could not access destination bucket '{bucket_name}': {e}") from e


def sync_single_file_record(
    db: Session,
    file_record: FileRecord,
    source_client,
    source_bucket: str,
    target_client,
    target_bucket: str,
) -> dict:
    """
    Syncs a single file from primary storage to the sync target.
    Updates file_record.sync_status and timestamps in the database.
    """
    if file_record.is_folder:
        return {"status": "skipped", "key": file_record.object_key}

    key = file_record.object_key

    try:
        source_obj = source_client.get_object(Bucket=source_bucket, Key=key)
        content_type = source_obj.get("ContentType", file_record.content_type)

        target_client.upload_fileobj(
            source_obj["Body"],
            target_bucket,
            key,
            ExtraArgs={"ContentType": content_type},
        )

        file_record.sync_status = "synced"
        file_record.last_synced_at = datetime.now(timezone.utc)
        file_record.sync_error = None
        db.commit()

        return {"status": "synced", "key": key}

    except Exception as e:
        logger.error(f"Failed to sync file '{key}': {e}")
        file_record.sync_status = "failed"
        file_record.sync_error = str(e)
        db.commit()
        return {"status": "failed", "key": key, "error": str(e)}


def run_user_sync_job(user_id: str, job_id: str, db: Session) -> None:
    """
    Background worker that runs a full sync of all files for a user.
    """
    job = db.query(SyncJob).filter(SyncJob.id == job_id).first()
    if not job:
        return

    primary_client, primary_bucket = StorageService.get_primary_client()
    sync_client, sync_bucket = StorageService.get_sync_target_client()

    if not primary_client or not sync_client or not sync_bucket:
        job.status = "failed"
        job.error_message = "Sync target not configured on platform."
        job.completed_at = datetime.now(timezone.utc)
        db.commit()
        return

    job.status = "running"
    db.commit()

    try:
        _ensure_bucket_exists(sync_client, sync_bucket)

        files = (
            db.query(FileRecord)
            .filter(
                FileRecord.user_id == user_id,
                FileRecord.is_folder == False,  # noqa: E712
            )
            .all()
        )

        job.total_files = len(files)
        job.synced_files = 0
        job.failed_files = 0
        db.commit()

        for rec in files:
            result = sync_single_file_record(
                db=db,
                file_record=rec,
                source_client=primary_client,
                source_bucket=primary_bucket,
                target_client=sync_client,
                target_bucket=sync_bucket,
            )
            if result["status"] == "synced":
                job.synced_files += 1
            elif result["status"] == "failed":
                job.failed_files += 1
            db.commit()

        job.status = "completed" if job.failed_files == 0 else "completed_with_errors"
        job.completed_at = datetime.now(timezone.utc)
        db.commit()

    except Exception as e:
        logger.error(f"SyncJob {job_id} failed: {e}")
        job.status = "failed"
        job.error_message = str(e)
        job.completed_at = datetime.now(timezone.utc)
        db.commit()
