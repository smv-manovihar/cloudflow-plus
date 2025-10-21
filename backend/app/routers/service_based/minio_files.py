from botocore.exceptions import ClientError
from fastapi import UploadFile, File, HTTPException, status, Query
from fastapi.responses import JSONResponse, StreamingResponse
from app.services.s3_service import minio_s3_client
from fastapi.routing import APIRouter
from typing import Optional


router = APIRouter(prefix="/minio/buckets", tags=["Minio Files"])


@router.get("/{bucket_name}/files")
async def list_files_in_bucket(
    bucket_name: str,
    page_size: int = Query(default=12, ge=1, le=1000, description="Items per page"),
    cursor: Optional[str] = Query(
        default=None, description="Pagination cursor for next page"
    ),
    prefix: Optional[str] = Query(default=None, description="Filter by prefix/folder"),
) -> JSONResponse:
    """
    Lists files in a bucket with cursor-based pagination and alphabetical sorting.

    Args:
        bucket_name: Name of the bucket
        page_size: Number of items per page (1-1000)
        cursor: Pagination cursor from previous response
        prefix: Optional prefix to filter objects
        sort_order: Alphabetical sort order (asc or desc)

    Returns:
        JSON with files list and pagination info
    """
    if not minio_s3_client:
        raise HTTPException(status_code=503, detail="S3 client not initialized")

    try:
        # Build parameters
        params = {
            "Bucket": bucket_name,
            "MaxKeys": page_size,
        }

        if prefix:
            params["Prefix"] = prefix

        if cursor:
            params["ContinuationToken"] = cursor

        # Make the request
        response = minio_s3_client.list_objects_v2(**params)

        # Format files
        files = [
            {
                "key": file["Key"],
                "last_modified": file["LastModified"].isoformat(),
                "size_bytes": file["Size"],
            }
            for file in response.get("Contents", [])
        ]

        # Build response
        result = {
            "files": files,
            "pagination": {
                "count": len(files),
                "page_size": page_size,
                "has_more": response.get("IsTruncated", False),
            },
            "bucket": bucket_name,
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
                status_code=404, detail=f"Bucket '{bucket_name}' not found."
            )
        elif error_code == "InvalidToken":
            raise HTTPException(
                status_code=400, detail="Invalid cursor token provided."
            )
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{bucket_name}/files", status_code=status.HTTP_201_CREATED)
async def upload_file_to_bucket(
    bucket_name: str, file: UploadFile = File(...)
) -> JSONResponse:
    """
    Uploads a file to the specified bucket.
    """
    if not minio_s3_client:
        raise HTTPException(status_code=503, detail="S3 client not initialized")
    try:
        minio_s3_client.upload_fileobj(file.file, bucket_name, file.filename)
        return {
            "message": "File uploaded successfully",
            "bucket": bucket_name,
            "filename": file.filename,
        }
    except ClientError as e:
        if e.response["Error"]["Code"] == "NoSuchBucket":
            raise HTTPException(
                status_code=404, detail=f"Bucket '{bucket_name}' not found."
            )
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"An unexpected error occurred: {e}"
        )


@router.get("/{bucket_name}/files/{object_key:path}")
async def get_file_from_bucket(bucket_name: str, object_key: str) -> StreamingResponse:
    """
    Downloads or views a specific file (object) from a bucket.
    """
    if not minio_s3_client:
        raise HTTPException(status_code=503, detail="S3 client not initialized")
    try:
        s3_response = minio_s3_client.get_object(Bucket=bucket_name, Key=object_key)

        filename = object_key.split("/")[-1]
        headers = {"Content-Disposition": f"attachment; filename={filename}"}

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
                detail=f"File '{object_key}' not found in bucket '{bucket_name}'.",
            )
        if error_code == "NoSuchBucket":
            raise HTTPException(
                status_code=404, detail=f"Bucket '{bucket_name}' not found."
            )
        raise HTTPException(status_code=500, detail=f"S3 Error: {error_code}")


@router.delete("/{bucket_name}/files/{object_key:path}", status_code=status.HTTP_200_OK)
async def delete_file_from_bucket(bucket_name: str, object_key: str) -> JSONResponse:
    """
    Deletes a specific file (object) from a bucket.
    """
    if not minio_s3_client:
        raise HTTPException(status_code=503, detail="S3 client not initialized")
    try:
        minio_s3_client.delete_object(Bucket=bucket_name, Key=object_key)
        return {
            "message": "File deleted successfully",
            "bucket": bucket_name,
            "filename": object_key,
        }
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))
