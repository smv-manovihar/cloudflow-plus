import logging
from typing import Optional
import uuid

from fastapi import (
    APIRouter,
    HTTPException,
    status,
    BackgroundTasks,
    Depends,
)
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db, SessionLocal
from app.models import User as UserModel, SyncJob, FileRecord, SystemConfig
from app.oauth2 import get_current_user
from app.schemas import User, SyncToggleRequest, SyncStatusResponse
from app.services.storage_service import StorageService
from app.services.sync_service import run_user_sync_job, sync_single_file_record
from app.utils import validate_uuid, to_utc_iso

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sync", tags=["Sync"])


# ------------------- REQUEST/RESPONSE SCHEMAS -------------------


class SyncSingleFileRequest(BaseModel):
    object_key: str


class SyncJobResponse(BaseModel):
    job_id: str
    status: str
    total_files: int
    synced_files: int
    failed_files: int
    started_at: str
    completed_at: Optional[str] = None
    error_message: Optional[str] = None


# ------------------- BACKGROUND WORKER HELPER -------------------


def _background_sync_worker(user_id: str, job_id: str):
    db = SessionLocal()
    try:
        run_user_sync_job(user_id=user_id, job_id=job_id, db=db)
    finally:
        db.close()


# ------------------- ENDPOINTS -------------------


@router.get("/status", response_model=SyncStatusResponse)
def get_sync_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns the user's sync toggle state and whether a sync target is configured on the platform.
    Also returns the latest sync job status if any.
    """
    validate_uuid(current_user.id)
    user = db.query(UserModel).filter(UserModel.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    system_config = db.query(SystemConfig).filter(SystemConfig.id == 1).first()
    system_sync_enabled = system_config.sync_enabled if system_config else True
    has_sync_target = bool(system_sync_enabled and StorageService.has_sync_target())

    latest_job = (
        db.query(SyncJob)
        .filter(SyncJob.user_id == current_user.id)
        .order_by(SyncJob.started_at.desc())
        .first()
    )

    return SyncStatusResponse(
        sync_enabled=bool(user.sync_enabled and has_sync_target),
        has_sync_target=has_sync_target,
        last_sync_job_id=latest_job.id if latest_job else None,
        last_sync_job_status=latest_job.status if latest_job else None,
        last_sync_completed_at=latest_job.completed_at if latest_job else None,
    )


@router.post("/toggle", response_model=SyncStatusResponse)
def toggle_sync(
    payload: SyncToggleRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Enables or disables automatic backup sync for the current user's files.
    """
    validate_uuid(current_user.id)
    user = db.query(UserModel).filter(UserModel.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    system_config = db.query(SystemConfig).filter(SystemConfig.id == 1).first()
    system_sync_enabled = system_config.sync_enabled if system_config else True
    has_sync_target = bool(system_sync_enabled and StorageService.has_sync_target())

    if payload.enabled and not has_sync_target:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sync feature is disabled by administrator or no secondary target is configured.",
        )

    user.sync_enabled = payload.enabled
    db.commit()

    latest_job = (
        db.query(SyncJob)
        .filter(SyncJob.user_id == current_user.id)
        .order_by(SyncJob.started_at.desc())
        .first()
    )

    return SyncStatusResponse(
        sync_enabled=bool(user.sync_enabled and has_sync_target),
        has_sync_target=has_sync_target,
        last_sync_job_id=latest_job.id if latest_job else None,
        last_sync_job_status=latest_job.status if latest_job else None,
        last_sync_completed_at=latest_job.completed_at if latest_job else None,
    )


@router.post("/trigger", status_code=status.HTTP_202_ACCEPTED)
def trigger_full_sync(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Triggers an asynchronous full sync job for all of the current user's files.
    """
    validate_uuid(current_user.id)

    system_config = db.query(SystemConfig).filter(SystemConfig.id == 1).first()
    if system_config and not system_config.sync_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sync feature is currently disabled by the platform administrator.",
        )

    if not StorageService.has_sync_target():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sync target is not configured by the platform operator.",
        )

    job = SyncJob(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        status="queued",
    )
    db.add(job)
    db.commit()

    background_tasks.add_task(_background_sync_worker, current_user.id, job.id)

    return {
        "message": "Sync job initiated successfully.",
        "job_id": job.id,
        "status": "queued",
    }


@router.get("/job/{job_id}", response_model=SyncJobResponse)
def get_sync_job_status(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Check status and progress of a specific sync job.
    """
    validate_uuid(current_user.id)
    job = (
        db.query(SyncJob)
        .filter(SyncJob.id == job_id, SyncJob.user_id == current_user.id)
        .first()
    )
    if not job:
        raise HTTPException(status_code=404, detail="Sync job not found")

    return SyncJobResponse(
        job_id=job.id,
        status=job.status,
        total_files=job.total_files,
        synced_files=job.synced_files,
        failed_files=job.failed_files,
        started_at=to_utc_iso(job.started_at),
        completed_at=to_utc_iso(job.completed_at) if job.completed_at else None,
        error_message=job.error_message,
    )


@router.post("/file")
def sync_single_file(
    payload: SyncSingleFileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Synchronize a single file immediately.
    """
    validate_uuid(current_user.id)

    system_config = db.query(SystemConfig).filter(SystemConfig.id == 1).first()
    if system_config and not system_config.sync_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sync feature is currently disabled by the platform administrator.",
        )

    primary_client, primary_bucket = StorageService.get_primary_client()
    sync_client, sync_bucket = StorageService.get_sync_target_client()

    if not sync_client or not sync_bucket:
        raise HTTPException(
            status_code=400,
            detail="Sync target is not configured on the platform.",
        )

    user_object_key = f"{current_user.id}/{payload.object_key.removeprefix(f'{current_user.id}/')}"

    record = (
        db.query(FileRecord)
        .filter(
            FileRecord.user_id == current_user.id,
            FileRecord.object_key == user_object_key,
        )
        .first()
    )

    if not record:
        raise HTTPException(status_code=404, detail="File record not found.")

    result = sync_single_file_record(
        db=db,
        file_record=record,
        source_client=primary_client,
        source_bucket=primary_bucket,
        target_client=sync_client,
        target_bucket=sync_bucket,
    )

    if result["status"] == "failed":
        raise HTTPException(status_code=500, detail=result.get("error", "Sync failed."))

    return {
        "message": f"File '{payload.object_key}' synced successfully.",
        "status": result["status"],
    }
