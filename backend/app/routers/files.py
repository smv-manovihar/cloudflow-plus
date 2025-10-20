from botocore.exceptions import ClientError
from fastapi import (
    UploadFile,
    File,
    Request,
    Response,
    HTTPException,
    status,
    Query,
    Depends,
)
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session
from fastapi.routing import APIRouter
from typing import Optional, List, Dict, Any, Generator, Union
import os
from urllib.parse import unquote
import uuid
import logging
from datetime import datetime, timezone

from app.services.s3_service import minio_s3_client, aws_s3_client
from app.database import get_db
from app.models import SharedLink
from app.schemas import User
from app.core.config import BUCKET_NAME
from app.oauth2 import get_current_user

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/files", tags=["Files"])


# ============================================================================
# Helper Functions
# ============================================================================


def to_utc_iso(dt: datetime) -> str:
    """
    Convert datetime to UTC ISO 8601 format with 'Z' suffix.

    Args:
        dt: datetime object (can be timezone-aware or naive)

    Returns:
        ISO 8601 string with 'Z' suffix (e.g., '2025-10-20T18:39:00Z')
    """
    if dt is None:
        return None

    # If datetime is naive, assume it's UTC
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)

    # Convert to UTC if it's in a different timezone
    dt_utc = dt.astimezone(timezone.utc)

    # Format as ISO string and replace +00:00 with Z
    return dt_utc.isoformat().replace("+00:00", "Z")


def validate_uuid(user_id: Union[str, int]) -> None:
    """
    Validate that the provided user_id is a valid UUID.

    Args:
        user_id: The user ID to validate.

    Raises:
        HTTPException: If the user_id is not a valid UUID.
    """
    try:
        if isinstance(user_id, int):
            user_id = str(user_id)
        uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid user ID format: must be a valid UUID",
        )


def is_synced_via_etag(bucket_name: str, object_key: str) -> bool:
    """
    Checks if an object in MinIO is synced to AWS by comparing ETags via head calls.
    """
    try:
        minio_response = minio_s3_client.head_object(Bucket=bucket_name, Key=object_key)
        minio_etag = minio_response["ETag"].strip('"')
        aws_response = aws_s3_client.head_object(Bucket=bucket_name, Key=object_key)
        aws_etag = aws_response["ETag"].strip('"')
        return minio_etag == aws_etag
    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        if error_code in ["NoSuchKey", "404", "NoSuchBucket"]:
            return False
        raise HTTPException(status_code=500, detail=f"AWS S3 check error: {error_code}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sync check error: {str(e)}")


def is_synced_via_metadata(
    bucket_name: str, object_key: str, head_response: Optional[Dict[str, Any]] = None
) -> str:
    """
    Retrieves the sync status from the 'synced' metadata flag ('pending', 'true', or 'false').

    Args:
        bucket_name: The bucket name.
        object_key: The object key.
        head_response: Optional pre-fetched head response to avoid redundant calls.

    Returns:
        str: The sync status ('pending', 'true', 'false', or 'false' if metadata is missing).

    Raises:
        HTTPException: On S3 errors other than not found.
    """
    response = head_response
    if response is None:
        try:
            response = minio_s3_client.head_object(Bucket=bucket_name, Key=object_key)
        except ClientError as e:
            error_code = e.response["Error"]["Code"]
            if error_code in ["NoSuchKey", "404", "NoSuchBucket"]:
                return "false"
            raise HTTPException(
                status_code=500, detail=f"MinIO metadata check error: {error_code}"
            )
        except Exception as e:
            raise HTTPException(
                status_code=500, detail=f"Sync status check error: {str(e)}"
            )
    user_metadata = response.get("Metadata", {})
    return user_metadata.get("synced", "false")


def relative_name(key: str, user_prefix: str, prefix: Optional[str] = None) -> str:
    """
    Compute the relative path for a key, preserving slashes for folders.

    Args:
        key: The full S3 key or prefix.
        user_prefix: The user-specific prefix (e.g., 'user_id/').
        prefix: Optional prefix filter (e.g., 'folder/').

    Returns:
        The relative path with trailing slash for folders.
    """
    base = user_prefix
    if prefix:
        base += prefix
    if base and key.startswith(base):
        relative = key[len(base) :]
        if key.endswith("/"):
            return relative
        return relative.rstrip("/")
    return key.rstrip("/") if key.endswith("/") else key


# ============================================================================
# Endpoints
# ============================================================================


@router.get("/")
async def list_files_in_bucket(
    page_size: int = Query(default=12, ge=1, le=1000, description="Items per page"),
    cursor: Optional[str] = Query(
        default=None, description="Pagination cursor for next page"
    ),
    prefix: Optional[str] = Query(default=None, description="Filter by prefix/folder"),
    q: Optional[str] = Query(
        default=None, description="Search term for filtering files"
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JSONResponse:
    """
    Lists files in a bucket under the user's prefix with cursor-based pagination and alphabetical sorting.
    """
    if not minio_s3_client:
        raise HTTPException(status_code=503, detail="S3 client not initialized")

    # Validate user_id as UUID
    validate_uuid(current_user.id)

    try:
        # Construct user-specific prefix: user_id/prefix
        user_prefix = f"{current_user.id}/"
        search_prefix = user_prefix
        if prefix:
            search_prefix += prefix
        if q:
            search_prefix += q

        params = {
            "Bucket": BUCKET_NAME,
            "MaxKeys": page_size,
            "Delimiter": "/",
            "Prefix": search_prefix,
        }

        if cursor:
            params["ContinuationToken"] = cursor

        response = minio_s3_client.list_objects_v2(**params)

        common_prefixes = response.get("CommonPrefixes", [])
        contents = response.get("Contents", [])

        folders = []
        for cp in common_prefixes:
            p = cp.get("Prefix")
            if not p:
                continue
            name = relative_name(p, user_prefix, prefix)
            folders.append(
                {
                    "key": name,
                    "display_key": name,
                    "last_modified": to_utc_iso(datetime.now(timezone.utc)),
                    "size_bytes": 0,
                    "synced": "false",  # Folders don't have sync status
                    "last_synced": None,
                }
            )

        files = []
        for obj in contents:
            if obj["Key"] == search_prefix:
                continue
            head_response = minio_s3_client.head_object(
                Bucket=BUCKET_NAME, Key=obj["Key"]
            )
            user_metadata = head_response.get("Metadata", {})
            last_synced = user_metadata.get("last_synced")
            name = relative_name(obj["Key"], user_prefix, prefix)
            files.append(
                {
                    "key": obj["Key"].removeprefix(user_prefix),
                    "display_key": name,
                    "last_modified": (
                        to_utc_iso(obj["LastModified"])
                        if obj.get("LastModified")
                        else to_utc_iso(datetime.now(timezone.utc))
                    ),
                    "size_bytes": obj.get("Size", 0),
                    "synced": is_synced_via_metadata(
                        BUCKET_NAME, obj["Key"], head_response
                    ),
                    "last_synced": last_synced,
                }
            )

        folders.sort(key=lambda f: f["display_key"].lower())
        files.sort(key=lambda f: f["display_key"].lower())

        combined = folders + files

        result = {
            "files": combined,
            "pagination": {
                "count": len(combined),
                "page_size": page_size,
                "has_more": response.get("IsTruncated", False),
            },
            "bucket": BUCKET_NAME,
            "user_id": current_user.id,
        }

        if prefix:
            result["prefix"] = prefix
        if q:
            result["search_term"] = q

        if response.get("NextContinuationToken"):
            result["pagination"]["next_cursor"] = response["NextContinuationToken"]

        return result

    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        http_status = e.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        if http_status == 404 or error_code in ["NoSuchBucket", "NoSuchKey", "404"]:
            raise HTTPException(
                status_code=404,
                detail=f"Bucket '{BUCKET_NAME}' or user prefix not found.",
            )
        elif error_code == "InvalidToken":
            raise HTTPException(
                status_code=400, detail="Invalid cursor token provided."
            )
        raise HTTPException(status_code=500, detail=f"S3 Error: {error_code}")


@router.post("/", status_code=status.HTTP_201_CREATED)
async def upload_file_to_bucket(
    files: List[UploadFile] = File(...), current_user: User = Depends(get_current_user)
) -> JSONResponse:
    """
    Upload one or more files to the MinIO bucket under the user's prefix.
    """
    if not minio_s3_client:
        raise HTTPException(status_code=503, detail="S3 client not initialized")

    # Validate user_id as UUID
    validate_uuid(current_user.id)

    results = []
    errors = []

    for file in files:
        user_object_key = f"{current_user.id}/{file.filename}"
        try:
            minio_s3_client.upload_fileobj(
                file.file,
                BUCKET_NAME,
                user_object_key,
                ExtraArgs={
                    "ContentType": file.content_type or "application/octet-stream",
                    "Metadata": {
                        "bucket": BUCKET_NAME,
                        "synced": "false",
                        "aws_bucket": "",
                        "last_synced": "",
                        "user_id": str(current_user.id),
                    },
                },
            )

            try:
                metadata = minio_s3_client.head_object(
                    Bucket=BUCKET_NAME, Key=user_object_key
                )
                size_bytes = metadata["ContentLength"]
                last_modified = to_utc_iso(metadata["LastModified"])
                user_metadata = metadata.get("Metadata", {})
                confirmed_synced = user_metadata.get("synced", "false")
                last_synced = user_metadata.get("last_synced")
            except ClientError as meta_err:
                size_bytes = 0
                last_modified = to_utc_iso(datetime.now(timezone.utc))
                confirmed_synced = "false"
                last_synced = None

            results.append(
                {
                    "filename": file.filename,
                    "key": file.filename,
                    "size_bytes": size_bytes,
                    "last_modified": last_modified,
                    "synced": confirmed_synced,
                    "last_synced": last_synced,
                    "message": "File uploaded successfully",
                    "bucket": BUCKET_NAME,
                    "user_id": current_user.id,
                }
            )
        except ClientError as e:
            error_code = e.response["Error"]["Code"]
            error_detail = (
                f"Bucket '{BUCKET_NAME}' not found."
                if error_code == "NoSuchBucket"
                else str(e)
            )
            errors.append(
                {
                    "filename": file.filename,
                    "error": error_detail,
                    "status_code": 404 if error_code == "NoSuchBucket" else 500,
                }
            )
        except Exception as e:
            errors.append(
                {
                    "filename": file.filename,
                    "error": f"An unexpected error occurred: {str(e)}",
                    "status_code": 500,
                }
            )
        finally:
            await file.close()

    if errors:
        raise HTTPException(
            status_code=207,
            detail={
                "message": "Some files failed to upload",
                "successful_uploads": results,
                "failed_uploads": errors,
            },
        )

    return {
        "message": "All files uploaded successfully",
        "bucket": BUCKET_NAME,
        "user_id": current_user.id,
        "uploads": results,
    }


@router.get("/{object_key:path}/info")
async def get_file_info(
    object_key: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JSONResponse:
    """
    Get file info (metadata) for a specific file under the user's prefix.
    """
    if not minio_s3_client:
        raise HTTPException(status_code=503, detail="S3 client not initialized")

    # Validate user_id as UUID
    validate_uuid(current_user.id)

    # Decode URL-encoded object_key
    object_key = unquote(object_key)
    user_object_key = f"{current_user.id}/{object_key}"

    # Log the keys for debugging
    logger.info(f"Requested object_key: {object_key}")
    logger.info(f"Constructed user_object_key: {user_object_key}")

    try:
        # Check if the object exists
        head = minio_s3_client.head_object(Bucket=BUCKET_NAME, Key=user_object_key)
        synced = is_synced_via_metadata(BUCKET_NAME, user_object_key, head)

        # Check for shared link
        shared_link_id = None
        try:
            shared_link = (
                db.query(SharedLink)
                .filter(
                    SharedLink.object_key == user_object_key,
                    SharedLink.bucket == BUCKET_NAME,
                    SharedLink.user_id == current_user.id,
                )
                .first()
            )
            shared_link_id = shared_link.id if shared_link else None
            is_shared = shared_link_id is not None
        except Exception as db_err:
            logger.error(f"Database error while checking shared link: {db_err}")
            is_shared = False

        last_modified = None
        if head.get("LastModified"):
            last_modified = to_utc_iso(head["LastModified"])
        user_metadata = head.get("Metadata", {})
        bucket = user_metadata.get("bucket") or BUCKET_NAME
        aws_bucket = user_metadata.get("aws_bucket") if synced == "true" else None
        last_synced = user_metadata.get("last_synced")

        return JSONResponse(
            content={
                "bucket": bucket,
                "key": object_key,
                "content_length": head.get("ContentLength"),
                "last_modified": last_modified,
                "synced": synced,
                "aws_bucket": aws_bucket,
                "last_synced": last_synced,
                "is_shared": is_shared,
                "shared_link_id": shared_link_id,
                "user_id": current_user.id,
            }
        )
    except ClientError as exc:
        error_code = exc.response["Error"]["Code"]
        error_message = exc.response["Error"].get("Message", str(exc))
        logger.error(
            f"S3 Error: Code={error_code}, Message={error_message}, Key={user_object_key}"
        )
        if error_code in ["NoSuchKey", "404"]:
            # List objects to help diagnose key mismatch
            try:
                user_prefix = f"{current_user.id}/"
                response = minio_s3_client.list_objects_v2(
                    Bucket=BUCKET_NAME, Prefix=user_prefix, MaxKeys=10
                )
                available_keys = [obj["Key"] for obj in response.get("Contents", [])]
                logger.info(f"Available keys under {user_prefix}: {available_keys}")
            except Exception as list_err:
                logger.error(f"Error listing objects: {list_err}")
                available_keys = []
            raise HTTPException(
                status_code=404,
                detail={
                    "message": f"Object '{object_key}' not found in bucket '{BUCKET_NAME}' for user",
                    "available_keys": available_keys,
                },
            )
        if error_code == "NoSuchBucket":
            raise HTTPException(
                status_code=404, detail=f"Bucket '{BUCKET_NAME}' not found."
            )
        raise HTTPException(status_code=500, detail=f"S3 Error: {error_code}")
    except Exception as e:
        logger.error(f"Unexpected error for key {user_object_key}: {e}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


def get_file_extension(object_key: str) -> str:
    """Extract file extension from object key."""
    return os.path.splitext(object_key)[1].lower()


def get_content_type(extension: str) -> str:
    """Map file extension to Content-Type for common video formats."""
    mime_types = {
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".mov": "video/quicktime",
        ".avi": "video/x-msvideo",
        ".mkv": "video/x-matroska",
    }
    return mime_types.get(extension, "application/octet-stream")


STREAMING_CHUNK_SIZE = 8 * 1024 * 1024  # 8 MB


def iter_s3_stream(
    s3_body, chunk_size: int = STREAMING_CHUNK_SIZE
) -> Generator[bytes, None, None]:
    """
    Generator to stream S3 object in optimized chunks.
    """
    try:
        while True:
            data = s3_body.read(chunk_size)
            if not data:
                break
            yield data
    finally:
        s3_body.close()


async def handle_file_request(
    object_key: str, request: Request, current_user: User, is_head: bool = False
) -> Response:
    """
    Optimized GET/HEAD handler with improved streaming performance.
    """
    if not minio_s3_client:
        raise HTTPException(status_code=503, detail="S3 client not initialized")

    # Validate user_id as UUID
    validate_uuid(current_user.id)

    object_key = unquote(object_key)
    user_object_key = f"{current_user.id}/{object_key}"

    try:
        head_response = minio_s3_client.head_object(
            Bucket=BUCKET_NAME, Key=user_object_key
        )
        file_size = head_response["ContentLength"]
        content_type = head_response.get(
            "ContentType", get_content_type(get_file_extension(user_object_key))
        )
        filename = object_key.split("/")[-1]
        synced = is_synced_via_metadata(
            bucket_name=BUCKET_NAME,
            object_key=user_object_key,
            head_response=head_response,
        )

        headers = {
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Synced-To-AWS": synced,  # Reflects 'pending', 'true', or 'false'
            "Accept-Ranges": "bytes",
            "X-User-Id": str(current_user.id),
            "Cache-Control": "public, max-age=3600",
        }

        if is_head:
            headers.update(
                {
                    "Content-Length": str(file_size),
                    "Content-Type": content_type,
                }
            )
            return Response(status_code=200, headers=headers)

        range_header = request.headers.get("range")
        if range_header:
            range_str = range_header.replace("bytes=", "")
            start, end = 0, file_size - 1
            if "-" in range_str:
                range_parts = range_str.split("-")
                start = int(range_parts[0]) if range_parts[0] else 0
                end = int(range_parts[1]) if range_parts[1] else file_size - 1

            if start >= file_size or end >= file_size or start > end:
                raise HTTPException(
                    status_code=416,
                    detail="Range Not Satisfiable",
                    headers={"Content-Range": f"bytes */{file_size}"},
                )

            range_spec = f"bytes={start}-{end}"
            s3_response = minio_s3_client.get_object(
                Bucket=BUCKET_NAME, Key=user_object_key, Range=range_spec
            )
            content_length = end - start + 1

            headers.update(
                {
                    "Content-Length": str(content_length),
                    "Content-Range": f"bytes {start}-{end}/{file_size}",
                    "Content-Type": content_type,
                }
            )

            return StreamingResponse(
                iter_s3_stream(s3_response["Body"], STREAMING_CHUNK_SIZE),
                media_type=content_type,
                headers=headers,
                status_code=206,
            )
        else:
            s3_response = minio_s3_client.get_object(
                Bucket=BUCKET_NAME, Key=user_object_key
            )
            headers.update(
                {
                    "Content-Length": str(file_size),
                    "Content-Type": content_type,
                }
            )
            return StreamingResponse(
                iter_s3_stream(s3_response["Body"], STREAMING_CHUNK_SIZE),
                media_type=content_type,
                headers=headers,
                status_code=200,
            )

    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        if error_code in ["NoSuchKey", "404"]:
            raise HTTPException(
                status_code=404,
                detail=f"File '{object_key}' not found in bucket '{BUCKET_NAME}' for user",
            )
        if error_code == "NoSuchBucket":
            raise HTTPException(
                status_code=404, detail=f"Bucket '{BUCKET_NAME}' not found."
            )
        logger.error(f"S3 Error for {user_object_key}: {error_code} - {e}")
        raise HTTPException(status_code=500, detail=f"S3 Error: {error_code}")

    except Exception as e:
        logger.error(f"Unexpected error streaming {user_object_key}: {e}")
        raise HTTPException(
            status_code=500, detail="Internal server error during file streaming"
        )


@router.get("/{object_key:path}")
async def get_file_from_bucket(
    object_key: str, request: Request, current_user: User = Depends(get_current_user)
) -> StreamingResponse:
    """
    Downloads or streams a specific file from a bucket under the user's prefix.
    """
    return await handle_file_request(object_key, request, current_user, is_head=False)


@router.head("/{object_key:path}")
async def head_file_from_bucket(
    object_key: str, request: Request, current_user: User = Depends(get_current_user)
) -> Response:
    """
    Retrieves metadata for a specific file under the user's prefix (HEAD request).
    """
    return await handle_file_request(object_key, request, current_user, is_head=True)


@router.delete("/{object_key:path}", status_code=status.HTTP_200_OK)
async def delete_file_from_bucket(
    object_key: str,
    sync: bool,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JSONResponse:
    """
    Deletes a specific file (object) from a bucket under the user's prefix.
    """
    if not minio_s3_client:
        raise HTTPException(status_code=503, detail="S3 client not initialized")

    # Validate user_id as UUID
    validate_uuid(current_user.id)

    object_key = unquote(object_key)
    user_object_key = f"{current_user.id}/{object_key}"

    try:
        head_response = minio_s3_client.head_object(
            Bucket=BUCKET_NAME, Key=user_object_key
        )
        synced = is_synced_via_metadata(BUCKET_NAME, user_object_key, head_response)
        minio_s3_client.delete_object(Bucket=BUCKET_NAME, Key=user_object_key)
        if sync:
            aws_s3_client.delete_object(Bucket=BUCKET_NAME, Key=user_object_key)

        link = (
            db.query(SharedLink)
            .filter(SharedLink.object_key == user_object_key)
            .first()
        )

        if link:
            db.delete(link)
            db.commit()

        return {
            "message": "File deleted successfully",
            "bucket": BUCKET_NAME,
            "filename": object_key,
            "key": object_key,
            "synced": synced,
            "user_id": current_user.id,
        }
    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        if error_code in ["NoSuchKey", "404"]:
            raise HTTPException(
                status_code=404,
                detail=f"File '{object_key}' not found for user",
            )
        if error_code == "NoSuchBucket":
            raise HTTPException(
                status_code=404, detail=f"Bucket '{BUCKET_NAME}' not found."
            )
        raise HTTPException(status_code=500, detail=f"S3 Error: {error_code}")
