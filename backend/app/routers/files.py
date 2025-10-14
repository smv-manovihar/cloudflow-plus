from botocore.exceptions import ClientError
from fastapi import UploadFile, File, HTTPException, status, Query
from fastapi.responses import JSONResponse, StreamingResponse
from app.services.s3_service import minio_s3_client, aws_s3_client
from fastapi.routing import APIRouter
from typing import Optional, List

from app.core.config import BUCKET_NAME

router = APIRouter(tags=["Files"])


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


@router.get("/files")
async def list_files_in_bucket(
    page_size: int = Query(default=12, ge=1, le=1000, description="Items per page"),
    cursor: Optional[str] = Query(
        default=None, description="Pagination cursor for next page"
    ),
    prefix: Optional[str] = Query(default=None, description="Filter by prefix/folder"),
) -> JSONResponse:
    """
    Lists files in a bucket with cursor-based pagination and alphabetical sorting.

    Args:
        page_size: Number of items per page (1-1000)
        cursor: Pagination cursor from previous response
        prefix: Optional prefix to filter objects

    Returns:
        JSON with files list, pagination info, and sync status
    """
    if not minio_s3_client:
        raise HTTPException(status_code=503, detail="S3 client not initialized")

    try:
        # Build parameters
        params = {
            "Bucket": BUCKET_NAME,
            "MaxKeys": page_size,
        }

        if prefix:
            params["Prefix"] = prefix

        if cursor:
            params["ContinuationToken"] = cursor

        # Make the request
        response = minio_s3_client.list_objects_v2(**params)

        # Format files
        files = []
        for file in response.get("Contents", []):
            synced = is_synced_to_aws(BUCKET_NAME, file["Key"])
            files.append(
                {
                    "key": file["Key"],
                    "last_modified": file["LastModified"].isoformat(),
                    "size_bytes": file["Size"],
                    "synced": synced,
                }
            )

        # Build response
        result = {
            "files": files,
            "pagination": {
                "count": len(files),
                "page_size": page_size,
                "has_more": response.get("IsTruncated", False),
            },
            "bucket": BUCKET_NAME,
        }

        if prefix:
            result["prefix"] = prefix

        # Add next cursor if more results available
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


@router.post("/files", status_code=status.HTTP_201_CREATED)
async def upload_file_to_bucket(files: List[UploadFile] = File(...)) -> JSONResponse:
    """
    Uploads multiple files to the specified bucket.

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
            minio_s3_client.upload_fileobj(file.file, BUCKET_NAME, file.filename)
            synced = is_synced_to_aws(BUCKET_NAME, file.filename)
            results.append(
                {
                    "filename": file.filename,
                    "message": "File uploaded successfully",
                    "bucket": BUCKET_NAME,
                    "synced": synced,
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
            await file.close()  # Ensure file is closed after processing

    # If there are any errors, raise an HTTPException with details
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


@router.get("/files/{object_key:path}")
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


@router.delete("/files/{object_key:path}", status_code=status.HTTP_200_OK)
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
