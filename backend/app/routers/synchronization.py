from fastapi import (
    APIRouter,
    HTTPException,
    status,
    BackgroundTasks,
    Depends,
)
from pydantic import BaseModel
import logging
from app.services.sync_service import (
    sync_single_bucket,
    sync_single_file as sync_file_service,
    S3SyncError,
)
from app.services.s3_service import minio_s3_client
from app.core.config import BUCKET_NAME
from app.schemas import User
from app.oauth2 import get_current_user
import uuid
from urllib.parse import unquote
from botocore.exceptions import ClientError


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


# ------------------- HELPER FUNCTIONS -------------------


def validate_uuid(user_id: str) -> None:
    """
    Validate that the provided user_id is a valid UUID.

    Args:
        user_id: The user ID to validate.

    Raises:
        HTTPException: If the user_id is not a valid UUID.
    """
    try:
        uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid user ID format: must be a valid UUID",
        )


def get_user_prefix(user_id: str) -> str:
    """
    Construct the user-specific prefix for S3 keys.

    Args:
        user_id: The authenticated user's ID.

    Returns:
        The user prefix (e.g., 'user_id/').
    """
    return f"{user_id}/"


def strip_user_prefix(full_key: str, user_prefix: str) -> str:
    """
    Strip the user prefix from a full S3 key to get the relative key.

    Args:
        full_key: The full S3 key (e.g., 'user_id/path/to/file.txt').
        user_prefix: The user-specific prefix (e.g., 'user_id/').

    Returns:
        The relative key (e.g., 'path/to/file.txt').
    """
    if full_key.startswith(user_prefix):
        return full_key[len(user_prefix) :]
    return full_key


# ------------------- ENDPOINTS -------------------


@router.post("/", status_code=status.HTTP_200_OK)
def sync_bucket(current_user: User = Depends(get_current_user)):
    """
    Synchronize the authenticated user's files in the configured bucket from source to destination.

    Returns:
        - Summary of sync operation for the user's files including file counts and failures.

    Raises:
        - HTTPException 404: If source bucket or user prefix not found.
        - HTTPException 502: If sync operation fails.
        - HTTPException 500: For unexpected errors.
    """
    # Validate user_id as UUID
    validate_uuid(current_user.id)

    user_prefix = get_user_prefix(current_user.id)

    try:
        # Sync only the files under the user's prefix
        result = sync_single_bucket(BUCKET_NAME, prefix=user_prefix)

        # Process result to avoid exposing full keys
        if "failed_files" in result:
            result["failed_files"] = [
                {
                    "key": strip_user_prefix(file["key"], user_prefix),
                    "error": file["error"],
                }
                for file in result["failed_files"]
            ]

        # Check for bucket-level errors
        if "error" in result:
            logger.error(
                f"Bucket sync failed for '{BUCKET_NAME}/{user_prefix}': {result['error']}"
            )
            if (
                "not found" in result["error"].lower()
                or "nosuchbucket" in result["error"].lower()
            ):
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Bucket '{BUCKET_NAME}' or user prefix '{user_prefix}' not found: {result['error']}",
                )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to sync bucket '{BUCKET_NAME}' for user: {result['error']}",
            )

        # Warn if some files failed
        if result.get("failed_files"):
            logger.warning(
                f"Bucket '{BUCKET_NAME}/{user_prefix}' synced with {len(result['failed_files'])} file failures"
            )

        return result

    except HTTPException:
        raise
    except S3SyncError as e:
        logger.error(
            f"S3 sync error for bucket '{BUCKET_NAME}/{user_prefix}': {str(e)}"
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to sync bucket for user: {str(e)}",
        )
    except Exception as e:
        logger.exception(
            f"Unexpected error syncing bucket '{BUCKET_NAME}/{user_prefix}': {str(e)}"
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred: {str(e)}",
        )


@router.post("/file", status_code=status.HTTP_200_OK)
def sync_file(payload: SyncFileRequest, current_user: User = Depends(get_current_user)):
    """
    Synchronously synchronize a single file from the authenticated user's prefix in the source bucket to destination bucket.

    Args:
        payload: Request containing destination_bucket and object_key.

    Returns:
        - Status of sync operation: "synced", "updated", "skipped", or "failed".
        - Relative object key and error details if failed.

    Raises:
        - HTTPException 400: If request parameters are invalid.
        - HTTPException 404: If source file not found.
        - HTTPException 502: If sync operation fails.
        - HTTPException 500: For unexpected errors.
    """
    # Validate user_id as UUID
    validate_uuid(current_user.id)

    # Validate inputs
    if not payload.destination_bucket or payload.destination_bucket.strip() == "":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Destination bucket name cannot be empty",
        )

    if not payload.object_key or payload.object_key.strip() == "":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Object key cannot be empty",
        )

    # Decode object_key and construct full user-specific key
    object_key = unquote(payload.object_key)
    user_object_key = f"{current_user.id}/{object_key}"

    # Check if file exists
    try:
        minio_s3_client.head_object(Bucket=BUCKET_NAME, Key=user_object_key)
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code")
        if error_code in ["NoSuchKey", "404"]:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"File '{object_key}' not found in bucket '{BUCKET_NAME}'",
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to access file: {e}",
        )

    try:
        result = sync_file_service(
            BUCKET_NAME, payload.destination_bucket, user_object_key, current_user.id
        )

        # Update result to use relative key
        if "key" in result:
            result["key"] = strip_user_prefix(
                result["key"], get_user_prefix(current_user.id)
            )

        # Check if the operation failed
        if result.get("status") == "failed":
            error_detail = result.get("error", "Unknown error")
            logger.error(
                f"File sync failed: {object_key} from {BUCKET_NAME} "
                f"to {payload.destination_bucket}: {error_detail}"
            )

            # Determine appropriate HTTP status code based on error
            if (
                "not found" in error_detail.lower()
                or "nosuchkey" in error_detail.lower()
            ):
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"File '{object_key}' not found: {error_detail}",
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
        raise
    except S3SyncError as e:
        logger.error(f"S3 sync error for file '{object_key}': {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to sync file '{object_key}': {str(e)}",
        )
    except Exception as e:
        logger.exception(f"Unexpected error syncing file '{object_key}': {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred: {str(e)}",
        )


@router.post("/async/file", status_code=status.HTTP_202_ACCEPTED)
async def sync_file_async(
    payload: SyncFileRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    """
    Asynchronously synchronize a single file from the authenticated user's prefix in the source bucket to destination bucket.

    Args:
        payload: Request containing destination_bucket and object_key.
        background_tasks: FastAPI BackgroundTasks for async execution.

    Returns:
        - Confirmation that the sync operation has been queued.

    Raises:
        - HTTPException 400: If request parameters are invalid.
        - HTTPException 404: If source file not found.
        - HTTPException 500: If metadata update or other unexpected errors occur.
    """
    # Validate user_id as UUID
    validate_uuid(current_user.id)

    # Validate inputs
    if not payload.destination_bucket or payload.destination_bucket.strip() == "":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Destination bucket name cannot be empty",
        )

    if not payload.object_key or payload.object_key.strip() == "":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Object key cannot be empty",
        )

    # Decode object_key and construct full user-specific key
    object_key = unquote(payload.object_key)
    user_object_key = f"{current_user.id}/{object_key}"

    # Check if file exists
    try:
        minio_s3_client.head_object(Bucket=BUCKET_NAME, Key=user_object_key)
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code")
        if error_code in ["NoSuchKey", "404"]:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"File '{object_key}' not found in bucket '{BUCKET_NAME}'",
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to access file: {e}",
        )

    # Queue the sync task
    background_tasks.add_task(
        sync_file_service,
        BUCKET_NAME,
        payload.destination_bucket,
        user_object_key,
        current_user.id,
    )

    return {
        "status": "accepted",
        "message": f"Sync operation for file '{object_key}' in bucket '{BUCKET_NAME}' started in background. Check logs for progress.",
        "key": object_key,
    }


@router.post("/async", status_code=status.HTTP_202_ACCEPTED)
async def sync_bucket_async(
    background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user)
):
    """
    Asynchronously synchronize the authenticated user's files in the configured bucket.

    Returns immediately with 202 Accepted status.
    Useful for large sync operations that may take a long time.

    Note: Consider using Celery or similar for production long-running tasks.
    """
    # Validate user_id as UUID
    validate_uuid(current_user.id)

    user_prefix = get_user_prefix(current_user.id)
    background_tasks.add_task(sync_single_bucket, BUCKET_NAME, prefix=user_prefix)
    return {
        "status": "accepted",
        "message": f"Sync operation for bucket '{BUCKET_NAME}' under user prefix '{user_prefix}' started in background. Check logs for progress.",
    }
