from app.services.sync_service import (
    sync_all_buckets,
    sync_single_bucket,
    sync_single_file as sync_file_service,  # Renamed to avoid conflict
    S3SyncError,  # Import the custom exception
)
from fastapi import (
    APIRouter,
    HTTPException,
    status,
    Request,
    BackgroundTasks,
)
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sync", tags=["Sync"])


# ------------------- PYDANTIC MODELS -------------------


class SyncFileRequest(BaseModel):
    """Request model for single file sync with source and destination buckets."""

    source_bucket: str
    destination_bucket: str
    object_key: str


class ErrorResponse(BaseModel):
    """Standard error response model."""

    error: str
    detail: str
    status_code: int


# ------------------- EXCEPTION HANDLER -------------------


# ------------------- ENDPOINTS -------------------


@router.post("/all", status_code=status.HTTP_200_OK)
def sync_all():
    """
    Synchronize all buckets from source to destination.

    Returns:
        - Summary of sync operation including counts and any failures

    Raises:
        - HTTPException 502: If unable to list source buckets or critical failure
        - HTTPException 500: For unexpected errors
    """
    try:
        result = sync_all_buckets()

        # Check if there were any failures
        if result.get("failed_buckets"):
            logger.warning(
                f"Sync completed with failures. Failed buckets: {len(result['failed_buckets'])}"
            )

        return result

    except S3SyncError as e:
        logger.error(f"S3 sync error in sync_all: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to sync all buckets: {str(e)}",
        )
    except Exception as e:
        logger.exception(f"Unexpected error in sync_all: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred: {str(e)}",
        )


@router.post("/{bucket_name}", status_code=status.HTTP_200_OK)
def sync_bucket(bucket_name: str):
    """
    Synchronize a single bucket from source to destination.

    Args:
        bucket_name: Name of the bucket to sync

    Returns:
        - Summary of sync operation for the bucket including file counts and failures

    Raises:
        - HTTPException 400: If bucket_name is invalid
        - HTTPException 404: If source bucket not found
        - HTTPException 502: If sync operation fails
        - HTTPException 500: For unexpected errors
    """
    if not bucket_name or bucket_name.strip() == "":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bucket name cannot be empty",
        )

    try:
        result = sync_single_bucket(bucket_name)

        # Check for bucket-level errors
        if "error" in result:
            logger.error(f"Bucket sync failed for '{bucket_name}': {result['error']}")

            # Check if it's a "not found" error
            if (
                "not found" in result["error"].lower()
                or "nosuchbucket" in result["error"].lower()
            ):
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Bucket '{bucket_name}' not found: {result['error']}",
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Failed to sync bucket '{bucket_name}': {result['error']}",
                )

        # Warn if some files failed
        if result.get("failed_files"):
            logger.warning(
                f"Bucket '{bucket_name}' synced with {len(result['failed_files'])} file failures"
            )

        return result

    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except S3SyncError as e:
        logger.error(f"S3 sync error for bucket '{bucket_name}': {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to sync bucket '{bucket_name}': {str(e)}",
        )
    except Exception as e:
        logger.exception(f"Unexpected error syncing bucket '{bucket_name}': {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred: {str(e)}",
        )


@router.post("/file", status_code=status.HTTP_200_OK)
def sync_file(payload: SyncFileRequest):
    """
    Synchronize a single file from source bucket to destination bucket.

    Args:
        payload: Request containing source_bucket, destination_bucket, and object_key

    Returns:
        - Status of sync operation: "synced", "updated", "skipped", or "failed"
        - Object key and error details if failed

    Raises:
        - HTTPException 400: If request parameters are invalid
        - HTTPException 404: If source file not found
        - HTTPException 502: If sync operation fails
        - HTTPException 500: For unexpected errors
    """
    # Validate inputs
    if not payload.source_bucket or payload.source_bucket.strip() == "":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source bucket name cannot be empty",
        )

    if not payload.destination_bucket or payload.destination_bucket.strip() == "":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Destination bucket name cannot be empty",
        )

    if not payload.object_key or payload.object_key.strip() == "":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Object key cannot be empty"
        )

    try:
        result = sync_file_service(
            payload.source_bucket, payload.destination_bucket, payload.object_key
        )

        # Check if the operation failed
        if result.get("status") == "failed":
            error_detail = result.get("error", "Unknown error")
            logger.error(
                f"File sync failed: {payload.object_key} from {payload.source_bucket} "
                f"to {payload.destination_bucket}: {error_detail}"
            )

            # Determine appropriate HTTP status code based on error
            if (
                "not found" in error_detail.lower()
                or "nosuchkey" in error_detail.lower()
            ):
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"File not found: {error_detail}",
                )
            elif "access denied" in error_detail.lower():
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Access denied: {error_detail}",
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Sync failed: {error_detail}",
                )

        return result

    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except S3SyncError as e:
        logger.error(f"S3 sync error for file '{payload.object_key}': {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to sync file: {str(e)}",
        )
    except Exception as e:
        logger.exception(
            f"Unexpected error syncing file '{payload.object_key}': {str(e)}"
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred: {str(e)}",
        )


# ------------------- ALTERNATIVE: PATH PARAMETER VERSION -------------------


@router.post(
    "/{source_bucket}/{destination_bucket}/files/{object_key:path}",
    status_code=status.HTTP_200_OK,
)
def sync_file_by_path(source_bucket: str, destination_bucket: str, object_key: str):
    """
    Alternative endpoint: Synchronize a single file using path parameters.

    Args:
        source_bucket: Source bucket name
        destination_bucket: Destination bucket name
        object_key: Object key (supports paths with slashes)

    Returns:
        - Status of sync operation
    """
    # Validate inputs
    if not source_bucket or source_bucket.strip() == "":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source bucket name cannot be empty",
        )

    if not destination_bucket or destination_bucket.strip() == "":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Destination bucket name cannot be empty",
        )

    if not object_key or object_key.strip() == "":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Object key cannot be empty"
        )

    try:
        result = sync_file_service(source_bucket, destination_bucket, object_key)

        if result.get("status") == "failed":
            error_detail = result.get("error", "Unknown error")

            if (
                "not found" in error_detail.lower()
                or "nosuchkey" in error_detail.lower()
            ):
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"File not found: {error_detail}",
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Sync failed: {error_detail}",
                )

        return result

    except HTTPException:
        raise
    except S3SyncError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to sync file: {str(e)}",
        )
    except Exception as e:
        logger.exception(f"Unexpected error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred: {str(e)}",
        )


# ------------------- BACKGROUND TASK VERSION (FOR LONG-RUNNING SYNCS) -------------------


@router.post("/all/async", status_code=status.HTTP_202_ACCEPTED)
async def sync_all_async(background_tasks: BackgroundTasks):
    """
    Asynchronously synchronize all buckets in the background.

    Returns immediately with 202 Accepted status.
    Useful for large sync operations that may take a long time.

    Note: Consider using Celery or similar for production long-running tasks.
    """
    background_tasks.add_task(sync_all_buckets)
    return {
        "status": "accepted",
        "message": "Sync operation started in background. Check logs for progress.",
    }
