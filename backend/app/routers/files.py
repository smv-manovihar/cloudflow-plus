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
from typing import Optional, List, Dict, Any
import os

from app.services.s3_service import minio_s3_client, aws_s3_client
from app.database import get_db
from app.models import SharedLink
from app.core.config import BUCKET_NAME

import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/files", tags=["Files"])


def is_synced_via_etag(bucket_name: str, object_key: str) -> bool:
    """
    Checks if an object in MinIO is synced to AWS by comparing ETags via head calls.

    Args:
        bucket_name: Name of the bucket
        object_key: Key of the object to check

    Returns:
        bool: True if the object exists in AWS S3 with the same ETag, False otherwise
    """
    try:
        # Get ETag from MinIO
        minio_response = minio_s3_client.head_object(Bucket=bucket_name, Key=object_key)
        minio_etag = minio_response["ETag"].strip('"')

        # Get ETag from AWS S3
        aws_response = aws_s3_client.head_object(Bucket=bucket_name, Key=object_key)
        aws_etag = aws_response["ETag"].strip('"')

        # Compare ETags
        return minio_etag == aws_etag

    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        if error_code in ["NoSuchKey", "404"]:
            return False  # Object not found in AWS S3, so not synced
        if error_code == "NoSuchBucket":
            return False  # Bucket not found in AWS S3, so not synced
        raise HTTPException(status_code=500, detail=f"AWS S3 check error: {error_code}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sync check error: {str(e)}")


def is_synced_via_metadata(
    bucket_name: str, object_key: str, head_response: Optional[Dict[str, Any]] = None
) -> bool:
    """
    Checks if an object in MinIO is synced to AWS by inspecting the 'synced' metadata flag.
    Reuses provided head_response to avoid duplicate calls.

    Args:
        bucket_name: Name of the bucket
        object_key: Key of the object to check
        head_response: Optional MinIO head_object response to reuse metadata from

    Returns:
        bool: True if the object's metadata has "synced": "true", False otherwise
    """
    response = head_response
    if response is None:
        try:
            response = minio_s3_client.head_object(Bucket=bucket_name, Key=object_key)
        except ClientError as e:
            error_code = e.response["Error"]["Code"]
            if error_code in ["NoSuchKey", "404"]:
                return False  # Object not found, so not synced
            if error_code == "NoSuchBucket":
                return False  # Bucket not found, so not synced
            raise HTTPException(
                status_code=500, detail=f"MinIO metadata check error: {error_code}"
            )
        except Exception as e:
            raise HTTPException(
                status_code=500, detail=f"Sync status check error: {str(e)}"
            )

    user_metadata = response.get("Metadata", {})
    return user_metadata.get("synced") == "true"


from datetime import datetime, timezone


@router.get("/")
async def list_files_in_bucket(
    page_size: int = Query(default=12, ge=1, le=1000, description="Items per page"),
    cursor: Optional[str] = Query(
        default=None, description="Pagination cursor for next page"
    ),
    prefix: Optional[str] = Query(default=None, description="Filter by prefix/folder"),
) -> JSONResponse:
    """
    Lists files in a bucket with cursor-based pagination and alphabetical sorting.
    Folders (CommonPrefixes) are returned first, followed by files (Contents),
    each group sorted alphabetically by the immediate-name (relative to prefix).
    """
    if not minio_s3_client:
        raise HTTPException(status_code=503, detail="S3 client not initialized")

    try:
        params = {
            "Bucket": BUCKET_NAME,
            "MaxKeys": page_size,
            "Delimiter": "/",  # return CommonPrefixes for "folders"
        }

        if prefix:
            params["Prefix"] = prefix

        if cursor:
            params["ContinuationToken"] = cursor

        response = minio_s3_client.list_objects_v2(**params)

        # Build folders (CommonPrefixes) and files (Contents) lists separately
        common_prefixes = response.get("CommonPrefixes", [])
        contents = response.get("Contents", [])

        def relative_name(key: str) -> str:
            base = prefix or ""
            if base and key.startswith(base):
                return key[len(base) :]
            return key

        folders = []
        for cp in common_prefixes:
            p = cp.get("Prefix")
            if not p:
                continue
            name = relative_name(p).rstrip("/")
            folders.append(
                {
                    "key": p,
                    "last_modified": datetime.now(timezone.utc).isoformat(),
                    "size_bytes": 0,
                    "synced": False,
                    "last_synced": None,
                }
            )

        files = []
        for obj in contents:
            if prefix and obj["Key"] == prefix:
                continue
            head_response = minio_s3_client.head_object(
                Bucket=BUCKET_NAME, Key=obj["Key"]
            )
            user_metadata = head_response.get("Metadata", {})
            last_synced = user_metadata.get("last_synced")
            files.append(
                {
                    "key": obj["Key"],
                    "last_modified": (
                        obj["LastModified"].isoformat()
                        if obj.get("LastModified")
                        else datetime.now(timezone.utc).isoformat()
                    ),
                    "size_bytes": obj.get("Size", 0),
                    "synced": is_synced_via_metadata(
                        BUCKET_NAME, obj["Key"], head_response
                    ),
                    "last_synced": last_synced,
                }
            )

        # Sort each group alphabetically by their immediate (relative) name (case-insensitive)
        folders.sort(key=lambda f: relative_name(f["key"]).rstrip("/").lower())
        files.sort(key=lambda f: relative_name(f["key"]).lower())

        combined = folders + files

        result = {
            "files": combined,
            "pagination": {
                "count": len(combined),
                "page_size": page_size,
                "has_more": response.get("IsTruncated", False),
            },
            "bucket": BUCKET_NAME,
        }

        if prefix:
            result["prefix"] = prefix

        if response.get("NextContinuationToken"):
            result["pagination"]["next_cursor"] = response["NextContinuationToken"]

        return result

    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        if error_code == "NoSuchBucket":
            raise HTTPException(
                status_code=404, detail=f"Bucket '{BUCKET_NAME}' not found."
            )
        elif error_code == "InvalidToken":
            raise HTTPException(
                status_code=400, detail="Invalid cursor token provided."
            )
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/search")
async def search_files_in_bucket(
    prefix: str = Query(
        ...,
        description="Search term to filter objects by prefix (case-sensitive by default)",
    ),
    case_insensitive: bool = Query(
        default=False,
        description="Enable case-insensitive search (less efficient for large buckets)",
    ),
    page_size: int = Query(default=12, ge=1, le=1000, description="Items per page"),
    cursor: Optional[str] = Query(
        default=None, description="Pagination cursor for next page"
    ),
    db: Session = Depends(get_db),
) -> JSONResponse:
    """
    Searches for files and folders in a bucket where the object key starts with the search query as a prefix.
    By default, case-sensitive (S3 native). Set case_insensitive=True for case-insensitive matching via client-side filter.
    Results are paginated and sorted alphabetically (case-insensitive). Folders first, then files.
    """
    if not minio_s3_client:
        raise HTTPException(status_code=503, detail="S3 client not initialized")

    if not prefix.strip("/"):
        raise HTTPException(status_code=400, detail="Search query cannot be empty")

    try:
        query_lower = prefix.lower().strip("/")
        folders = []
        files = []
        has_more = False
        next_cursor = None

        if case_insensitive:
            # Client-side case-insensitive filter: Paginate through bucket until enough matches
            # Warning: Inefficient for large buckets; use only if necessary
            current_cursor = cursor
            collected_count = 0
            max_fetches = 10  # Safety limit: max 10k objects scanned per request
            fetch_count = 0

            while len(folders + files) < page_size and fetch_count < max_fetches:
                params = {
                    "Bucket": BUCKET_NAME,
                    "MaxKeys": 1000,
                    "Delimiter": "/",
                }
                if current_cursor:
                    params["ContinuationToken"] = current_cursor

                response = minio_s3_client.list_objects_v2(**params)
                common_prefixes = response.get("CommonPrefixes", [])
                contents = response.get("Contents", [])

                # Filter folders case-insensitively
                for cp in common_prefixes:
                    p = cp.get("Prefix", "").strip("/")
                    if p.lower().startswith(query_lower):
                        rel_name = (
                            p[len(query_lower) :]
                            if p.lower().startswith(query_lower)
                            else p
                        )
                        folders.append(
                            {
                                "key": cp["Prefix"],
                                "last_modified": datetime.now(timezone.utc).isoformat(),
                                "size_bytes": 0,
                                "synced": False,
                                "is_shared": False,
                                "last_synced": None,
                            }
                        )
                        collected_count += 1

                # Filter files case-insensitively
                for obj in contents:
                    key = obj["Key"].strip("/")
                    if key.lower().startswith(query_lower):
                        try:
                            share_count = (
                                db.query(SharedLink)
                                .filter(
                                    SharedLink.object_key == obj["Key"],
                                    SharedLink.bucket == BUCKET_NAME,
                                )
                                .count()
                            )
                            is_shared = share_count > 0
                        except Exception as db_err:
                            logger.warning(f"DB error for {obj['Key']}: {db_err}")
                            is_shared = False

                        head_response = minio_s3_client.head_object(
                            Bucket=BUCKET_NAME, Key=obj["Key"]
                        )
                        user_metadata = head_response.get("Metadata", {})
                        last_synced = user_metadata.get("last_synced")
                        files.append(
                            {
                                "key": obj["Key"],
                                "last_modified": obj["LastModified"].isoformat(),
                                "size_bytes": obj.get("Size", 0),
                                "synced": is_synced_via_metadata(
                                    BUCKET_NAME, obj["Key"], head_response
                                ),
                                "is_shared": is_shared,
                                "last_synced": last_synced,
                            }
                        )
                        collected_count += 1

                if not response.get("IsTruncated"):
                    break

                current_cursor = response.get("NextContinuationToken")
                fetch_count += 1

            if fetch_count >= max_fetches:
                logger.warning("Search hit fetch limit; results may be incomplete")
            has_more = bool(current_cursor) and len(folders + files) == page_size
            next_cursor = current_cursor

        else:
            # Native case-sensitive prefix search (efficient)
            prefix = prefix.strip("/")
            params = {
                "Bucket": BUCKET_NAME,
                "Prefix": prefix,
                "MaxKeys": page_size,
                "Delimiter": "/",
            }
            if cursor:
                params["ContinuationToken"] = cursor

            response = minio_s3_client.list_objects_v2(**params)
            common_prefixes = response.get("CommonPrefixes", [])
            contents = response.get("Contents", [])

            def relative_name(key: str) -> str:
                # Extract relative to prefix for display/sorting
                return (
                    key[len(prefix) :].lstrip("/")
                    if key.startswith(prefix)
                    else key.lstrip("/")
                )

            # Process folders
            for cp in common_prefixes:
                p = cp.get("Prefix")
                if not p:
                    continue
                folders.append(
                    {
                        "key": p,
                        "last_modified": datetime.now(timezone.utc).isoformat(),
                        "size_bytes": 0,
                        "synced": False,
                        "is_shared": False,
                        "last_synced": None,
                    }
                )

            # Process files
            for obj in contents:
                if obj["Key"] == prefix or obj["Key"] == prefix + "/":
                    continue  # Skip folder placeholders
                try:
                    share_count = (
                        db.query(SharedLink)
                        .filter(
                            SharedLink.object_key == obj["Key"],
                            SharedLink.bucket == BUCKET_NAME,
                        )
                        .count()
                    )
                    is_shared = share_count > 0
                except Exception as db_err:
                    logger.warning(f"DB error for {obj['Key']}: {db_err}")
                    is_shared = False

                head_response = minio_s3_client.head_object(
                    Bucket=BUCKET_NAME, Key=obj["Key"]
                )
                user_metadata = head_response.get("Metadata", {})
                last_synced = user_metadata.get("last_synced")
                files.append(
                    {
                        "key": obj["Key"],
                        "last_modified": obj["LastModified"].isoformat(),
                        "size_bytes": obj.get("Size", 0),
                        "synced": is_synced_via_metadata(
                            BUCKET_NAME, obj["Key"], head_response
                        ),
                        "is_shared": is_shared,
                        "last_synced": last_synced,
                    }
                )

            has_more = response.get("IsTruncated", False)
            next_cursor = response.get("NextContinuationToken")

        # Sort case-insensitively (folders by relative name, files by key)
        def sort_key(item):
            rel = (
                relative_name(item["key"])
                if "relative_name" in locals()
                else item["key"].lower()
            )
            return rel.lower().rstrip("/")

        folders.sort(key=sort_key)
        files.sort(key=lambda f: f["key"].lower())

        combined = (
            folders + files[: page_size - len(folders)]
        )  # Ensure total <= page_size

        result = {
            "files": combined,
            "pagination": {
                "count": len(combined),
                "page_size": page_size,
                "has_more": has_more,
            },
            "bucket": BUCKET_NAME,
            "prefix": prefix,
            "case_insensitive": case_insensitive,
        }
        if next_cursor:
            result["pagination"]["next_cursor"] = next_cursor

        return result

    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        if error_code == "NoSuchBucket":
            raise HTTPException(
                status_code=404, detail=f"Bucket '{BUCKET_NAME}' not found."
            )
        elif error_code == "InvalidToken":
            raise HTTPException(
                status_code=400, detail="Invalid cursor token provided."
            )
        raise HTTPException(status_code=500, detail=f"S3 Error: {error_code}")
    except Exception as e:
        logger.error(f"Search error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Search error: {str(e)}")


@router.post("/", status_code=status.HTTP_201_CREATED)
async def upload_file_to_bucket(files: List[UploadFile] = File(...)) -> JSONResponse:
    """
    Upload one or more files to the MinIO bucket.
    Sets initial metadata for sync tracking (synced: false, last_synced: null).
    """
    if not minio_s3_client:
        raise HTTPException(status_code=503, detail="S3 client not initialized")

    results = []
    errors = []

    for file in files:
        try:
            # Upload with initial metadata (synced: false, last_synced: null)
            minio_s3_client.upload_fileobj(
                file.file,
                BUCKET_NAME,
                file.filename,
                ExtraArgs={
                    "ContentType": file.content_type or "application/octet-stream",
                    "Metadata": {
                        "bucket": BUCKET_NAME,
                        "synced": "false",
                        "aws_bucket": "",
                        "last_synced": "",
                    },
                },
            )

            try:
                metadata = minio_s3_client.head_object(
                    Bucket=BUCKET_NAME, Key=file.filename
                )
                size_bytes = metadata["ContentLength"]
                last_modified = metadata["LastModified"].isoformat()
                user_meta = metadata.get("Metadata", {})
                confirmed_synced = user_meta.get("synced") == "true"
                last_synced = user_meta.get("last_synced")
            except ClientError as meta_err:
                logger.warning(
                    f"Failed to head uploaded file {file.filename}: {meta_err}"
                )
                size_bytes = 0
                last_modified = datetime.now(timezone.utc).isoformat()
                confirmed_synced = False
                last_synced = None

            results.append(
                {
                    "filename": file.filename,
                    "size_bytes": size_bytes,
                    "last_modified": last_modified,
                    "synced": confirmed_synced,
                    "last_synced": last_synced,
                    "message": "File uploaded successfully",
                    "bucket": BUCKET_NAME,
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
            logger.error(f"Unexpected upload error for {file.filename}: {e}")
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
        "uploads": results,
    }


@router.get("/{object_key:path}/info")
async def get_file_info(
    object_key: str,
    db: Session = Depends(get_db),
) -> JSONResponse:
    """
    Get file info (metadata) for a specific file (object) in a bucket.
    Includes sync status, AWS bucket (if synced), and whether it's shared.
    """
    if not minio_s3_client:
        raise HTTPException(status_code=503, detail="S3 client not initialized")

    try:
        head = minio_s3_client.head_object(Bucket=BUCKET_NAME, Key=object_key)
        synced = is_synced_via_metadata(BUCKET_NAME, object_key, head)

        try:
            share_count = (
                db.query(SharedLink)
                .filter(
                    SharedLink.object_key == object_key,
                    SharedLink.bucket == BUCKET_NAME,
                )
                .count()
            )
            is_shared = share_count > 0
        except Exception as db_err:
            logger.warning(
                f"DB error checking shared status for {object_key}: {db_err}"
            )
            is_shared = False

        # Serialize LastModified to ISO string for JSON compatibility
        last_modified = None
        if head.get("LastModified"):
            last_modified = head["LastModified"].isoformat()
        user_metadata = head.get("Metadata", {})
        bucket = user_metadata.get("bucket") or BUCKET_NAME
        aws_bucket = user_metadata.get("aws_bucket") if synced else None
        last_synced = user_metadata.get("last_synced")

        return JSONResponse(
            content={
                "bucket": bucket,
                "object_key": object_key,
                "content_length": head.get("ContentLength"),
                "last_modified": last_modified,
                "synced": synced,
                "aws_bucket": aws_bucket,
                "last_synced": last_synced,
                "is_shared": is_shared,
            }
        )
    except ClientError as exc:
        error_code = exc.response["Error"]["Code"]
        if error_code in ["NoSuchKey", "NoSuchBucket"]:
            raise HTTPException(
                status_code=404,
                detail=f"Object '{object_key}' or bucket '{BUCKET_NAME}' not found",
            )
        raise HTTPException(status_code=500, detail=f"S3 Error: {error_code}")


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


async def handle_file_request(
    object_key: str, request: Request, is_head: bool = False
) -> Response:
    """
    Shared logic for GET and HEAD requests to retrieve or validate a file from a bucket.
    Supports range requests for streaming.
    """
    if not minio_s3_client:
        raise HTTPException(status_code=503, detail="S3 client not initialized")

    try:
        # Get object metadata to determine file size and content type
        head_response = minio_s3_client.head_object(Bucket=BUCKET_NAME, Key=object_key)
        file_size = head_response["ContentLength"]
        content_type = head_response.get(
            "ContentType", get_content_type(get_file_extension(object_key))
        )
        filename = object_key.split("/")[-1]
        synced = is_synced_via_metadata(
            bucket_name=BUCKET_NAME, object_key=object_key, head_response=head_response
        )

        headers = {
            "Content-Disposition": f"attachment; filename={filename}",
            "X-Synced-To-AWS": str(synced).lower(),
            "Accept-Ranges": "bytes",
        }

        if is_head:
            # HEAD request: return headers only
            headers.update(
                {
                    "Content-Length": str(file_size),
                    "Content-Type": content_type,
                }
            )
            return Response(status_code=200, headers=headers)

        # GET request: handle range or full file
        range_header = request.headers.get("range")
        if range_header:
            range_str = range_header.replace("bytes=", "")
            start, end = 0, file_size - 1
            if "-" in range_str:
                range_parts = range_str.split("-")
                start = int(range_parts[0]) if range_parts[0] else 0
                end = int(range_parts[1]) if range_parts[1] else file_size - 1

            if start >= file_size or end >= file_size or start > end:
                raise HTTPException(status_code=416, detail="Range Not Satisfiable")

            range_spec = f"bytes={start}-{end}"
            s3_response = minio_s3_client.get_object(
                Bucket=BUCKET_NAME, Key=object_key, Range=range_spec
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
                s3_response["Body"],
                media_type=content_type,
                headers=headers,
                status_code=206,
            )
        else:
            s3_response = minio_s3_client.get_object(Bucket=BUCKET_NAME, Key=object_key)
            headers.update(
                {
                    "Content-Length": str(file_size),
                    "Content-Type": content_type,
                }
            )

            return StreamingResponse(
                s3_response["Body"],
                media_type=content_type,
                headers=headers,
                status_code=200,
            )

    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        if error_code == "NoSuchKey":
            raise HTTPException(
                status_code=404,
                detail=f"File '{object_key}' not found in bucket '{BUCKET_NAME}'.",
            )
        if error_code == "NoSuchBucket":
            raise HTTPException(
                status_code=404, detail=f"Bucket '{BUCKET_NAME}' not found."
            )
        raise HTTPException(status_code=500, detail=f"S3 Error: {error_code}")


@router.get("/{object_key:path}")
async def get_file_from_bucket(object_key: str, request: Request) -> StreamingResponse:
    """
    Downloads or streams a specific file from a bucket, supporting range requests for video streaming.
    """
    return await handle_file_request(object_key, request, is_head=False)


@router.head("/{object_key:path}")
async def head_file_from_bucket(object_key: str, request: Request) -> Response:
    """
    Retrieves metadata for a specific file from a bucket (HEAD request).
    """
    return await handle_file_request(object_key, request, is_head=True)


@router.delete("/{object_key:path}", status_code=status.HTTP_200_OK)
async def delete_file_from_bucket(object_key: str, sync: bool) -> JSONResponse:
    """
    Deletes a specific file (object) from a bucket.
    """
    if not minio_s3_client:
        raise HTTPException(status_code=503, detail="S3 client not initialized")
    try:
        synced = is_synced_via_metadata(BUCKET_NAME, object_key)
        minio_s3_client.delete_object(Bucket=BUCKET_NAME, Key=object_key)
        if sync:
            aws_s3_client.delete_object(Bucket=BUCKET_NAME, Key=object_key)
        return {
            "message": "File deleted successfully",
            "bucket": BUCKET_NAME,
            "filename": object_key,
            "synced": synced,
        }
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))
