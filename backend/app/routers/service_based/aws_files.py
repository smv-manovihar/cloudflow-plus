from botocore.exceptions import ClientError
from fastapi import UploadFile, File, HTTPException, status, Query
from fastapi.responses import JSONResponse, StreamingResponse
from app.services.s3_service import aws_s3_client
from fastapi.routing import APIRouter
from typing import Optional, Literal
import uuid
from io import BytesIO
import threading
import anyio
import asyncio
from typing import AsyncGenerator


router = APIRouter(prefix="/aws/buckets", tags=["AWS Files"])


progress_data = {}
lock = threading.Lock()


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
        bucket_name: Name of the S3 bucket
        page_size: Number of items per page (1-1000)
        cursor: Pagination cursor from previous response
        prefix: Optional prefix to filter objects
        sort_order: Alphabetical sort order (asc or desc)

    Returns:
        JSON with files list and pagination info
    """
    if not aws_s3_client:
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
        response = aws_s3_client.list_objects_v2(**params)

        # Format files
        files = [
            {
                "key": file["Key"],
                "last_modified": file["LastModified"].isoformat(),
                "size_bytes": file["Size"],
                "storage_class": file.get("StorageClass", "STANDARD"),
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


@router.get("/{bucket_name}/search")
async def search_files_in_bucket(
    bucket_name: str,
    prefix: str = Query(
        ..., description="Search by prefix/folder path or filename start"
    ),
    page_size: int = Query(default=100, ge=1, le=1000, description="Items per page"),
    cursor: Optional[str] = Query(default=None, description="Pagination cursor"),
    sort_order: Optional[Literal["asc", "desc"]] = Query(
        default="asc", description="Alphabetical sort order"
    ),
    min_size: Optional[int] = Query(
        default=None, ge=0, description="Minimum file size in bytes"
    ),
    max_size: Optional[int] = Query(
        default=None, ge=0, description="Maximum file size in bytes"
    ),
) -> JSONResponse:
    """
    Search files in a bucket by prefix with filtering and sorting.

    Args:
        bucket_name: Name of the S3 bucket
        prefix: Required prefix to search for
        page_size: Number of items per page
        cursor: Pagination cursor
        sort_order: Alphabetical sort order
        min_size: Optional minimum file size filter
        max_size: Optional maximum file size filter

    Returns:
        JSON with matching files and pagination info
    """
    if not aws_s3_client:
        raise HTTPException(status_code=503, detail="S3 client not initialized")

    try:
        # Build parameters
        params = {
            "Bucket": bucket_name,
            "Prefix": prefix,
            "MaxKeys": page_size,
        }

        if cursor:
            params["ContinuationToken"] = cursor

        # Make the request
        response = aws_s3_client.list_objects_v2(**params)

        # Apply filters
        filtered_files = []
        for file in response.get("Contents", []):
            if min_size is not None and file["Size"] < min_size:
                continue
            if max_size is not None and file["Size"] > max_size:
                continue

            filtered_files.append(
                {
                    "key": file["Key"],
                    "last_modified": file["LastModified"].isoformat(),
                    "size_bytes": file["Size"],
                    "storage_class": file.get("StorageClass", "STANDARD"),
                }
            )

        # Apply sorting
        if sort_order == "desc":
            filtered_files.reverse()

        # Build search criteria
        search_criteria = {"prefix": prefix}
        if min_size is not None:
            search_criteria["min_size_bytes"] = min_size
        if max_size is not None:
            search_criteria["max_size_bytes"] = max_size

        # Build response
        result = {
            "files": filtered_files,
            "pagination": {
                "count": len(filtered_files),
                "page_size": page_size,
                "has_more": response.get("IsTruncated", False),
            },
            "sorting": {"order": sort_order, "type": "alphabetical"},
            "search_criteria": search_criteria,
            "bucket": bucket_name,
        }

        # Add next cursor if available
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


async def progress_generator(upload_id: str) -> AsyncGenerator[str, None]:
    while True:
        with lock:
            if upload_id not in progress_data:
                yield 'data: {"status": "not_found"}\n\n'
                return
            data = progress_data[upload_id].copy()
        percent = (data["progress"] / data["total"] * 100) if data["total"] > 0 else 0
        response = {"status": data["status"], "progress_percent": round(percent, 2)}
        if "error" in data:
            response["error"] = data["error"]
        yield f"data: {response}\n\n"
        if data["status"] in ["completed", "error"]:
            with lock:
                progress_data.pop(upload_id, None)
            return
        await asyncio.sleep(1)


async def upload_func(content: bytes, bucket_name: str, filename: str, upload_id: str):
    def callback(bytes_transferred: int):
        with lock:
            if upload_id in progress_data:
                progress_data[upload_id]["progress"] += bytes_transferred

    def do_upload():
        aws_s3_client.upload_fileobj(
            BytesIO(content), bucket_name, filename, Callback=callback
        )

    try:
        await anyio.to_thread.run_sync(do_upload)
        with lock:
            if upload_id in progress_data:
                progress_data[upload_id]["status"] = "completed"
    except ClientError as e:
        with lock:
            if upload_id in progress_data:
                progress_data[upload_id]["status"] = "error"
                progress_data[upload_id]["error"] = e.response["Error"]["Message"]
    except Exception as e:
        with lock:
            if upload_id in progress_data:
                progress_data[upload_id]["status"] = "error"
                progress_data[upload_id]["error"] = str(e)


@router.post("/{bucket_name}/files")
async def upload_file_to_bucket(
    bucket_name: str, file: UploadFile = File(...)
) -> StreamingResponse:
    """
    Uploads a file to the specified bucket asynchronously.
    Returns a streaming response with SSE (Server-Sent Events) for real-time progress updates.
    """
    if not aws_s3_client:
        raise HTTPException(status_code=503, detail="S3 client not initialized")
    try:
        # Read the file content in a separate thread to avoid blocking
        content = await anyio.to_thread.run_sync(file.file.read)
        file_size = len(content)
        upload_id = str(uuid.uuid4())
        with lock:
            progress_data[upload_id] = {
                "progress": 0,
                "total": file_size,
                "status": "uploading",
            }

        # Start the upload in the background
        asyncio.create_task(upload_func(content, bucket_name, file.filename, upload_id))

        # Return SSE stream for progress
        headers = {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
        return StreamingResponse(progress_generator(upload_id), headers=headers)
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


@router.get("/{bucket_name}/files/{object_key:path}/download-link")
async def get_presigned_download_link(
    bucket_name: str,
    object_key: str,
    expiration: int = 3600,
) -> JSONResponse:
    """
    Generates a presigned URL for downloading a file directly from S3.
    """
    if not aws_s3_client:
        raise HTTPException(status_code=503, detail="S3 client not initialized")

    if expiration > 604800:
        raise HTTPException(
            status_code=400,
            detail="Expiration time cannot exceed 7 days (604800 seconds)",
        )
    if expiration < 1:
        raise HTTPException(
            status_code=400, detail="Expiration time must be at least 1 second"
        )

    try:
        try:
            aws_s3_client.head_object(Bucket=bucket_name, Key=object_key)
        except ClientError as e:
            error_code = e.response["Error"]["Code"]
            if error_code == "404":
                raise HTTPException(
                    status_code=404,
                    detail=f"File '{object_key}' not found in bucket '{bucket_name}'.",
                )
            raise

        presigned_url = aws_s3_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket_name, "Key": object_key},
            ExpiresIn=expiration,
        )

        filename = object_key.split("/")[-1]

        return {
            "download_url": presigned_url,
            "bucket": bucket_name,
            "filename": filename,
            "object_key": object_key,
            "expires_in_seconds": expiration,
            "message": "Use this URL to download the file directly from S3",
        }

    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        if error_code == "NoSuchBucket":
            raise HTTPException(
                status_code=404, detail=f"Bucket '{bucket_name}' not found."
            )
        raise HTTPException(status_code=500, detail=f"S3 Error: {error_code}")
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"An unexpected error occurred: {str(e)}"
        )


@router.delete("/{bucket_name}/files/{object_key:path}", status_code=status.HTTP_200_OK)
async def delete_file_from_bucket(bucket_name: str, object_key: str) -> JSONResponse:
    """
    Deletes a specific file (object) from a bucket.
    """
    if not aws_s3_client:
        raise HTTPException(status_code=503, detail="S3 client not initialized")
    try:
        aws_s3_client.delete_object(Bucket=bucket_name, Key=object_key)
        return {
            "message": "File deleted successfully",
            "bucket": bucket_name,
            "filename": object_key,
        }
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))
