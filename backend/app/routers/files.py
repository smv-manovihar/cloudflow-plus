from botocore.exceptions import ClientError
from fastapi import UploadFile, File, HTTPException, status, Query
from fastapi.responses import JSONResponse, StreamingResponse
from app.services.s3_service import minio_s3_client, aws_s3_client
from fastapi.routing import APIRouter
from typing import Optional, List

from app.core.config import BUCKET_NAME

router = APIRouter(prefix="/files", tags=["Files"])


def is_synced_to_aws(bucket_name: str, object_key: str) -> bool:
    """
    Checks if an object in MinIO is synced to AWS S3 by comparing ETags.

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
                }
            )

        files = []
        for obj in contents:
            # Skip the "folder placeholder" object that equals the prefix itself (if present)
            if prefix and obj["Key"] == prefix:
                continue
            files.append(
                {
                    "key": obj["Key"],
                    "last_modified": (
                        obj["LastModified"].isoformat()
                        if obj.get("LastModified")
                        else datetime.now(timezone.utc).isoformat()
                    ),
                    "size_bytes": obj.get("Size", 0),
                    "synced": is_synced_to_aws(BUCKET_NAME, obj["Key"]),
                }
            )

        # Sort each group alphabetically by their immediate (relative) name (case-insensitive)
        folders.sort(key=lambda f: relative_name(f["key"]).rstrip("/").lower())
        files.sort(key=lambda f: relative_name(f["key"]).lower())

        # Combine: folders first, then files
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


@router.post("/", status_code=status.HTTP_201_CREATED)
async def upload_file_to_bucket(files: List[UploadFile] = File(...)) -> JSONResponse:
    """
    Uploads multiple files to the specified S3 bucket using boto3.

    Args:
        files: List of files to upload

    Returns:
        JSON with upload results for each file
    """
    if not minio_s3_client:
        raise HTTPException(status_code=503, detail="S3 client not initialized")

    results = []
    errors = []

    for file in files:
        try:
            # Upload the file to S3
            minio_s3_client.upload_fileobj(
                file.file,
                BUCKET_NAME,
                file.filename,
                ExtraArgs={
                    "ContentType": file.content_type or "application/octet-stream"
                },
            )

            # Fetch metadata for the uploaded file
            try:
                metadata = minio_s3_client.head_object(
                    Bucket=BUCKET_NAME, Key=file.filename
                )
                size_bytes = metadata["ContentLength"]
                last_modified = metadata["LastModified"].isoformat()
            except ClientError as meta_err:
                # If head_object fails, provide fallback values
                size_bytes = 0
                last_modified = datetime.now(timezone.utc).isoformat()

            results.append(
                {
                    "filename": file.filename,
                    "size_bytes": size_bytes,
                    "last_modified": last_modified,
                    "synced": False,
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
            status_code=207,  # Multi-Status
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


@router.get("/{object_key:path}")
async def get_file_from_bucket(object_key: str) -> StreamingResponse:
    """
    Downloads or views a specific file (object) from a bucket.
    """
    if not minio_s3_client:
        raise HTTPException(status_code=503, detail="S3 client not initialized")
    try:
        s3_response = minio_s3_client.get_object(Bucket=BUCKET_NAME, Key=object_key)

        filename = object_key.split("/")[-1]
        synced = is_synced_to_aws(BUCKET_NAME, object_key)
        headers = {
            "Content-Disposition": f"attachment; filename={filename}",
            "X-Synced-To-AWS": str(synced).lower(),
        }

        return StreamingResponse(
            s3_response["Body"],
            media_type=s3_response.get("ContentType", "application/octet-stream"),
            headers=headers,
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


@router.get("/{object_key:path}/info")
async def get_file_info(object_key: str) -> JSONResponse:
    """
    Get file info (metadata) for a specific file (object) in a bucket.
    """
    if not minio_s3_client:
        raise HTTPException(status_code=503, detail="S3 client not initialized")
    try:
        head = minio_s3_client.head_object(Bucket=BUCKET_NAME, Key=object_key)
        return JSONResponse(
            content={
                "bucket": head.get("Bucket"),
                "object_key": object_key,
                "content_length": head.get("ContentLength"),
                "last_modified": head.get("LastModified"),
                "synced": is_synced_to_aws(BUCKET_NAME, object_key),
            }
        )
    except ClientError as exc:
        error_code = exc.response["Error"]["Code"]
        if error_code in ["NoSuchKey", "NoSuchBucket"]:
            raise HTTPException(status_code=404, detail=f"Object or bucket not found")
        raise HTTPException(status_code=500, detail=f"S3 Error: {error_code}")


@router.delete("/{object_key:path}", status_code=status.HTTP_200_OK)
async def delete_file_from_bucket(object_key: str, sync: bool) -> JSONResponse:
    """
    Deletes a specific file (object) from a bucket.
    """
    if not minio_s3_client:
        raise HTTPException(status_code=503, detail="S3 client not initialized")
    try:
        synced = is_synced_to_aws(BUCKET_NAME, object_key)
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
