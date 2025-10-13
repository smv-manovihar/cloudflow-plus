from botocore.exceptions import ClientError
from fastapi import UploadFile, File, HTTPException, status
from fastapi.responses import JSONResponse, StreamingResponse
from app.services.s3_service import minio_s3_client
from fastapi.routing import APIRouter
import uuid
from io import BytesIO
import threading
import anyio
import asyncio
from typing import AsyncGenerator

router = APIRouter(prefix="/minio/buckets", tags=["Minio Files"])
progress_data = {}
lock = threading.Lock()


@router.get("/{bucket_name}/files")
async def list_files_in_bucket(bucket_name: str) -> JSONResponse:
    """
    Lists all files (objects) in a specified bucket.
    """
    if not minio_s3_client:
        raise HTTPException(status_code=503, detail="S3 client not initialized")
    try:
        response = minio_s3_client.list_objects_v2(Bucket=bucket_name)
        files = response.get("Contents", [])
        # Format the output for better readability
        formatted_files = [
            {
                "key": file["Key"],
                "last_modified": file["LastModified"].isoformat(),
                "size_bytes": file["Size"],
                "storage_class": file["StorageClass"],
            }
            for file in files
        ]
        return {"files": formatted_files}
    except ClientError as e:
        if e.response["Error"]["Code"] == "NoSuchBucket":
            raise HTTPException(
                status_code=404, detail=f"Bucket '{bucket_name}' not found."
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
        await asyncio.sleep(1)  # Send updates every second


async def upload_func(content: bytes, bucket_name: str, filename: str, upload_id: str):
    def callback(bytes_transferred: int):
        with lock:
            if upload_id in progress_data:
                progress_data[upload_id]["progress"] += bytes_transferred

    def do_upload():
        minio_s3_client.upload_fileobj(
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
    if not minio_s3_client:
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


@router.get("/{bucket_name}/files/{object_key:path}")
async def get_file_from_bucket(bucket_name: str, object_key: str) -> StreamingResponse:
    """
    Downloads or views a specific file (object) from a bucket.
    The response is streamed directly from S3, making it efficient for large files.
    """
    if not minio_s3_client:
        raise HTTPException(status_code=503, detail="S3 client not initialized")
    try:
        s3_response = minio_s3_client.get_object(Bucket=bucket_name, Key=object_key)

        # Get filename from the object key to suggest it to the browser
        filename = object_key.split("/")[-1]

        # Set headers to prompt the browser to download the file
        headers = {"Content-Disposition": f"attachment; filename={filename}"}

        # Stream the file content back to the client
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
        # Handle other potential S3 errors
        raise HTTPException(status_code=500, detail=f"S3 Error: {error_code}")


@router.delete("/{bucket_name}/files/{object_key:path}", status_code=status.HTTP_200_OK)
async def delete_file_from_bucket(bucket_name: str, object_key: str) -> JSONResponse:
    """
    Deletes a specific file (object) from a bucket.
    The `:path` in the URL allows object keys to contain slashes (e.g., 'folder/file.txt').
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
        # Note: S3's delete_object does not error if the key doesn't exist.
        # It just returns a 204. We will catch other potential client errors.
        raise HTTPException(status_code=500, detail=str(e))
