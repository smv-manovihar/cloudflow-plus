import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import SystemConfig, User
from app.oauth2 import get_current_admin_user
from app.schemas import (
    SystemSettingsResponse,
    SystemSettingsUpdate,
    PublicPlatformConfig,
)
from app.services.storage_service import StorageService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["Admin Settings"])


def _get_or_create_system_config(db: Session) -> SystemConfig:
    """Retrieves the singleton system config or initializes default."""
    config = db.query(SystemConfig).filter(SystemConfig.id == 1).first()
    if not config:
        config = SystemConfig(
            id=1,
            sync_enabled=True,
            share_target_preference="primary",
        )
        db.add(config)
        db.commit()
        db.refresh(config)
    return config


@router.get("/public-config", response_model=PublicPlatformConfig)
def get_public_platform_config(db: Session = Depends(get_db)):
    """
    Returns platform-wide public settings (share link target preference and sync availability)
    accessible to client applications.
    """
    config = _get_or_create_system_config(db)
    has_sync_target = StorageService.has_sync_target()

    return PublicPlatformConfig(
        sync_enabled=bool(config.sync_enabled and has_sync_target),
        share_target_preference=config.share_target_preference,
        has_sync_target=has_sync_target,
    )


@router.get("/settings", response_model=SystemSettingsResponse)
def get_admin_settings(
    db: Session = Depends(get_db),
    _admin_user: User = Depends(get_current_admin_user),
):
    """
    Returns system infrastructure settings and storage statuses (Admin only).
    """
    config = _get_or_create_system_config(db)
    has_sync_target = StorageService.has_sync_target()

    return SystemSettingsResponse(
        sync_enabled=config.sync_enabled,
        share_target_preference=config.share_target_preference,
        has_sync_target=has_sync_target,
        primary_bucket=StorageService.get_primary_bucket(),
        sync_target_bucket=StorageService.get_sync_target_bucket(),
        updated_at=config.updated_at,
    )


@router.put("/settings", response_model=SystemSettingsResponse)
def update_admin_settings(
    payload: SystemSettingsUpdate,
    db: Session = Depends(get_db),
    _admin_user: User = Depends(get_current_admin_user),
):
    """
    Updates system infrastructure settings (Admin only).
    """
    config = _get_or_create_system_config(db)

    if payload.sync_enabled is not None:
        config.sync_enabled = payload.sync_enabled

    if payload.share_target_preference is not None:
        val = payload.share_target_preference.strip().lower()
        if val not in ("primary", "sync_target"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="share_target_preference must be 'primary' or 'sync_target'",
            )
        if val == "sync_target" and not StorageService.has_sync_target():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot set share target to 'sync_target' because no secondary sync target is configured in the environment.",
            )
        config.share_target_preference = val

    db.commit()
    db.refresh(config)

    has_sync_target = StorageService.has_sync_target()

    return SystemSettingsResponse(
        sync_enabled=config.sync_enabled,
        share_target_preference=config.share_target_preference,
        has_sync_target=has_sync_target,
        primary_bucket=StorageService.get_primary_bucket(),
        sync_target_bucket=StorageService.get_sync_target_bucket(),
        updated_at=config.updated_at,
    )
