from botocore.exceptions import ClientError
from fastapi import UploadFile, File, HTTPException, status
from fastapi.responses import JSONResponse, StreamingResponse
from app.services.s3_service import minio_s3_client
from fastapi.routing import APIRouter

router = APIRouter(prefix="/minio/buckets", tags=["Minio Files"])


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
        # upload_fileobj is memory-efficient for large files
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
