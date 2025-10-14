from app.services.sync_service import (
    sync_single_bucket,
    sync_single_file as sync_file_service,
    S3SyncError,
)
from app.core.config import BUCKET_NAME
from fastapi import (
    APIRouter,
    HTTPException,
    status,
    BackgroundTasks,
)
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sync", tags=["Sync"])


# ------------------- PYDANTIC MODELS -------------------


class SyncFileRequest(BaseModel):
    """Request model for single file sync with source and destination buckets."""

    source_bucket: str = BUCKET_NAME
    destination_bucket: str = BUCKET_NAME
    object_key: str


class ErrorResponse(BaseModel):
    """Standard error response model."""

    error: str
    detail: str
    status_code: int


# ------------------- ENDPOINTS -------------------


@router.post("/", status_code=status.HTTP_200_OK)
def sync_bucket():
    """
    Synchronize the configured bucket from source to destination.

    Returns:
        - Summary of sync operation for the bucket including file counts and failures

    Raises:
        - HTTPException 404: If source bucket not found
        - HTTPException 502: If sync operation fails
        - HTTPException 500: For unexpected errors
    """
    try:
        result = sync_single_bucket(BUCKET_NAME)

        # Check for bucket-level errors
        if "error" in result:
            logger.error(f"Bucket sync failed for '{BUCKET_NAME}': {result['error']}")

            # Check if it's a "not found" error
            if (
                "not found" in result["error"].lower()
                or "nosuchbucket" in result["error"].lower()
            ):
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Bucket '{BUCKET_NAME}' not found: {result['error']}",
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Failed to sync bucket '{BUCKET_NAME}': {result['error']}",
                )

        # Warn if some files failed
        if result.get("failed_files"):
            logger.warning(
                f"Bucket '{BUCKET_NAME}' synced with {len(result['failed_files'])} file failures"
            )

        return result

    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except S3SyncError as e:
        logger.error(f"S3 sync error for bucket '{BUCKET_NAME}': {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to sync bucket '{BUCKET_NAME}': {str(e)}",
        )
    except Exception as e:
        logger.exception(f"Unexpected error syncing bucket '{BUCKET_NAME}': {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred: {str(e)}",
        )


@router.post("/file", status_code=status.HTTP_200_OK)
def sync_file(payload: SyncFileRequest):
    """
    Synchronize a single file from the configured source bucket to destination bucket.

    Args:
        payload: Request containing destination_bucket and object_key

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
            BUCKET_NAME, payload.destination_bucket, payload.object_key
        )

        # Check if the operation failed
        if result.get("status") == "failed":
            error_detail = result.get("error", "Unknown error")
            logger.error(
                f"File sync failed: {payload.object_key} from {BUCKET_NAME} "
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


@router.post("/async", status_code=status.HTTP_202_ACCEPTED)
async def sync_bucket_async(background_tasks: BackgroundTasks):
    """
    Asynchronously synchronize the configured bucket in the background.

    Returns immediately with 202 Accepted status.
    Useful for large sync operations that may take a long time.

    Note: Consider using Celery or similar for production long-running tasks.
    """
    background_tasks.add_task(sync_single_bucket, BUCKET_NAME)
    return {
        "status": "accepted",
        "message": f"Sync operation for bucket '{BUCKET_NAME}' started in background. Check logs for progress.",
    }
