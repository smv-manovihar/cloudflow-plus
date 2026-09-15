import logging
import os
from datetime import datetime, timezone
from typing import Optional, List, Generator
from urllib.parse import unquote

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
    APIRouter,
)
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import SharedLink, FileRecord, User as UserModel
from app.oauth2 import get_current_user
from app.schemas import User
from app.services.storage_service import StorageService
from app.utils import to_utc_iso, validate_uuid

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/files", tags=["Files"])


# ============================================================================
# Helper Functions
# ============================================================================


def get_file_extension(object_key: str) -> str:
    """Extract file extension from object key."""
    return os.path.splitext(object_key)[1].lower()


def get_content_type(extension: str) -> str:
    """Map file extension to Content-Type for common media formats."""
    mime_types = {
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".mov": "video/quicktime",
        ".avi": "video/x-msvideo",
        ".mkv": "video/x-matroska",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".pdf": "application/pdf",
        ".txt": "text/plain",
    }
    return mime_types.get(extension, "application/octet-stream")


STREAMING_CHUNK_SIZE = 8 * 1024 * 1024  # 8 MB


def iter_s3_stream(
    s3_body, chunk_size: int = STREAMING_CHUNK_SIZE
) -> Generator[bytes, None, None]:
    """Generator to stream S3 object in optimized chunks."""
    try:
        while True:
            data = s3_body.read(chunk_size)
            if not data:
                break
            yield data
    finally:
        s3_body.close()


# ============================================================================
# Endpoints
# ============================================================================


@router.get("/")
async def list_files_in_bucket(
    page_size: int = Query(default=12, ge=1, le=1000, description="Items per page"),
    cursor: Optional[int] = Query(default=None, description="Offset for pagination"),
    prefix: Optional[str] = Query(default=None, description="Filter by folder path"),
    q: Optional[str] = Query(default=None, description="Search term for filtering files by name"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JSONResponse:
    """
    Lists files and folders for the current user from the FileRecord catalog.
    Uses DB-backed metadata — no S3 head_object calls during listing.
    Supports folder navigation, full-text filename search, and offset pagination.
    """
    validate_uuid(current_user.id)
    bucket_name = StorageService.get_primary_bucket()

    user_records_count = db.query(FileRecord).filter(FileRecord.user_id == current_user.id).count()
    if user_records_count == 0:
        StorageService.reconcile_user_catalog(current_user.id, db)

    offset = cursor or 0
    clean_prefix = (prefix or "").strip("/")
    parent_path = f"{clean_prefix}/" if clean_prefix else ""

    query = db.query(FileRecord).filter(
        FileRecord.user_id == current_user.id,
    )

    if q and q.strip():
        clean_q = q.strip()
        search_filter = or_(
            FileRecord.display_name.ilike(f"%{clean_q}%"),
            FileRecord.object_key.ilike(f"%{clean_q}%"),
        )
        if clean_prefix:
            # Scoped search within current folder and all its subfolders
            scoped_prefix = f"{current_user.id}/{parent_path}"
            query = query.filter(
                FileRecord.object_key.startswith(scoped_prefix),
                search_filter,
            )
        else:
            # Global search across all database records for user
            query = query.filter(search_filter)
    else:
        # Standard folder listing: direct children of parent_path
        query = query.filter(FileRecord.parent_path == parent_path)

    total = query.count()

    records = (
        query.order_by(FileRecord.is_folder.desc(), FileRecord.display_name)
        .offset(offset)
        .limit(page_size)
        .all()
    )

    files = []
    for rec in records:
        shared_link = (
            db.query(SharedLink)
            .filter(
                SharedLink.object_key == rec.object_key,
                SharedLink.user_id == current_user.id,
                SharedLink.enabled == True,  # noqa: E712
            )
            .order_by(SharedLink.created_at.desc())
            .first()
        )

        files.append({
            "key": rec.object_key.removeprefix(f"{current_user.id}/"),
            "display_key": rec.display_name,
            "last_modified": to_utc_iso(rec.updated_at),
            "size_bytes": rec.size_bytes,
            "content_type": rec.content_type,
            "is_folder": rec.is_folder,
            "sync_status": rec.sync_status,
            "last_synced": to_utc_iso(rec.last_synced_at) if rec.last_synced_at else None,
            "is_shared": shared_link is not None,
            "shared_link_id": shared_link.id if shared_link else None,
        })

    next_offset = offset + page_size if (offset + page_size) < total else None

    result = {
        "files": files,
        "pagination": {
            "count": len(files),
            "total": total,
            "page_size": page_size,
            "offset": offset,
            "has_more": next_offset is not None,
        },
        "bucket": bucket_name,
        "user_id": current_user.id,
    }

    if clean_prefix:
        result["prefix"] = parent_path
    if q:
        result["search_term"] = q
    if next_offset is not None:
        result["pagination"]["next_cursor"] = next_offset

    return JSONResponse(content=result)


@router.post("/", status_code=status.HTTP_201_CREATED)
async def upload_file_to_bucket(
    files: List[UploadFile] = File(...),
    prefix: Optional[str] = Query(default=None, description="Upload into this folder path"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JSONResponse:
    """
    Upload one or more files to primary storage.
    Creates FileRecord entries in the DB after successful S3 upload.
    """
    validate_uuid(current_user.id)
    s3_client, bucket_name = StorageService.get_primary_client()

    results = []
    errors = []

    clean_prefix = (prefix or "").strip("/")
    folder_path = f"{clean_prefix}/" if clean_prefix else ""

    for file in files:
        raw_filename = (file.filename or "file").replace("\\", "/")
        if "/" in raw_filename:
            file_dir, clean_filename = raw_filename.rsplit("/", 1)
            full_parent = f"{folder_path}{file_dir}".strip("/") + "/" if (folder_path or file_dir) else ""
        else:
            clean_filename = raw_filename
            full_parent = folder_path

        relative_key = f"{full_parent}{clean_filename}" if full_parent else clean_filename
        user_object_key = f"{current_user.id}/{relative_key}"
        content_type = file.content_type or "application/octet-stream"

        try:
            s3_client.upload_fileobj(
                file.file,
                bucket_name,
                user_object_key,
                ExtraArgs={"ContentType": content_type},
            )

            try:
                head = s3_client.head_object(Bucket=bucket_name, Key=user_object_key)
                size_bytes = head["ContentLength"]
                etag = head.get("ETag", "").strip('"')
                last_modified = to_utc_iso(head["LastModified"])
            except ClientError:
                size_bytes = 0
                etag = None
                last_modified = to_utc_iso(datetime.now(timezone.utc))

            existing = (
                db.query(FileRecord)
                .filter(
                    FileRecord.user_id == current_user.id,
                    FileRecord.object_key == user_object_key,
                )
                .first()
            )
            if existing:
                existing.size_bytes = size_bytes
                existing.content_type = content_type
                existing.etag = etag
                existing.display_name = clean_filename
                existing.parent_path = full_parent
                existing.sync_status = "none"
                existing.updated_at = datetime.now(timezone.utc)
            else:
                record = FileRecord(
                    user_id=current_user.id,
                    object_key=user_object_key,
                    display_name=clean_filename,
                    parent_path=full_parent,
                    size_bytes=size_bytes,
                    content_type=content_type,
                    etag=etag,
                    is_folder=False,
                    sync_status="none",
                )
                db.add(record)

            # Ensure all ancestor folder records exist
            if full_parent:
                curr_path = ""
                for segment in full_parent.strip("/").split("/"):
                    if not segment:
                        continue
                    curr_parent = curr_path
                    curr_path += f"{segment}/"
                    folder_key = f"{current_user.id}/{curr_path}"
                    folder_rec = (
                        db.query(FileRecord)
                        .filter(
                            FileRecord.user_id == current_user.id,
                            FileRecord.object_key == folder_key,
                        )
                        .first()
                    )
                    if not folder_rec:
                        f_rec = FileRecord(
                            user_id=current_user.id,
                            object_key=folder_key,
                            display_name=f"{segment}/",
                            parent_path=curr_parent,
                            size_bytes=0,
                            content_type="application/x-directory",
                            is_folder=True,
                            sync_status="none",
                        )
                        db.add(f_rec)

            db.commit()

            results.append({
                "filename": clean_filename,
                "key": relative_key,
                "size_bytes": size_bytes,
                "last_modified": last_modified,
                "content_type": content_type,
                "sync_status": "none",
                "message": "File uploaded successfully",
                "bucket": bucket_name,
                "user_id": current_user.id,
            })

        except ClientError as e:
            db.rollback()
            error_code = e.response["Error"]["Code"]
            errors.append({
                "filename": file.filename,
                "error": f"Bucket '{bucket_name}' not found." if error_code == "NoSuchBucket" else str(e),
                "status_code": 404 if error_code == "NoSuchBucket" else 500,
            })
        except Exception as e:
            db.rollback()
            errors.append({
                "filename": file.filename,
                "error": f"An unexpected error occurred: {str(e)}",
                "status_code": 500,
            })
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

    return JSONResponse(
        content={
            "message": "All files uploaded successfully",
            "bucket": bucket_name,
            "user_id": current_user.id,
            "uploads": results,
        },
        status_code=status.HTTP_201_CREATED,
    )


@router.post("/folder", status_code=status.HTTP_201_CREATED)
async def create_folder(
    folder_path: str = Query(..., description="Full folder path e.g. 'photos/vacation/'"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JSONResponse:
    """Create a virtual folder entry in the FileRecord catalog."""
    validate_uuid(current_user.id)

    folder_path = folder_path.strip("/") + "/"
    parts = folder_path.rstrip("/").rsplit("/", 1)
    parent_path = parts[0] + "/" if len(parts) > 1 else ""
    display_name = parts[-1] + "/"
    user_object_key = f"{current_user.id}/{folder_path}"

    existing = (
        db.query(FileRecord)
        .filter(
            FileRecord.user_id == current_user.id,
            FileRecord.object_key == user_object_key,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Folder already exists.")

    record = FileRecord(
        user_id=current_user.id,
        object_key=user_object_key,
        display_name=display_name,
        parent_path=parent_path,
        size_bytes=0,
        content_type="application/x-directory",
        is_folder=True,
        sync_status="none",
    )
    db.add(record)
    db.commit()

    return JSONResponse(content={"message": "Folder created", "folder": folder_path}, status_code=status.HTTP_201_CREATED)


@router.get("/{object_key:path}/info")
async def get_file_info(
    object_key: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JSONResponse:
    """Get file metadata from the FileRecord DB catalog."""
    validate_uuid(current_user.id)
    object_key = unquote(object_key)
    user_object_key = f"{current_user.id}/{object_key}"
    bucket_name = StorageService.get_primary_bucket()

    record = (
        db.query(FileRecord)
        .filter(
            FileRecord.user_id == current_user.id,
            FileRecord.object_key == user_object_key,
        )
        .first()
    )

    if not record:
        raise HTTPException(
            status_code=404,
            detail=f"File '{object_key}' not found.",
        )

    shared_link = (
        db.query(SharedLink)
        .filter(
            SharedLink.object_key == user_object_key,
            SharedLink.user_id == current_user.id,
            SharedLink.enabled == True,  # noqa: E712
        )
        .order_by(SharedLink.created_at.desc())
        .first()
    )

    return JSONResponse(content={
        "bucket": bucket_name,
        "key": object_key,
        "content_length": record.size_bytes,
        "content_type": record.content_type,
        "last_modified": to_utc_iso(record.updated_at),
        "sync_status": record.sync_status,
        "last_synced": to_utc_iso(record.last_synced_at) if record.last_synced_at else None,
        "is_shared": shared_link is not None,
        "shared_link_id": shared_link.id if shared_link else None,
        "user_id": current_user.id,
    })


async def handle_file_request(
    object_key: str, request: Request, current_user: User, db: Session, is_head: bool = False
) -> Response:
    """Optimized GET/HEAD handler with streaming support from primary S3."""
    validate_uuid(current_user.id)
    s3_client, bucket_name = StorageService.get_primary_client()

    object_key = unquote(object_key)
    user_object_key = f"{current_user.id}/{object_key}"

    try:
        head_response = s3_client.head_object(Bucket=bucket_name, Key=user_object_key)
        file_size = head_response["ContentLength"]
        content_type = head_response.get(
            "ContentType", get_content_type(get_file_extension(user_object_key))
        )
        filename = object_key.split("/")[-1]

        record = (
            db.query(FileRecord)
            .filter(
                FileRecord.user_id == current_user.id,
                FileRecord.object_key == user_object_key,
            )
            .first()
        )
        sync_status_val = record.sync_status if record else "none"

        headers = {
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Sync-Status": sync_status_val,
            "Accept-Ranges": "bytes",
            "X-User-Id": str(current_user.id),
            "Cache-Control": "public, max-age=3600",
        }

        if is_head:
            headers.update({
                "Content-Length": str(file_size),
                "Content-Type": content_type,
            })
            return Response(status_code=200, headers=headers)

        range_header = request.headers.get("range")
        if range_header:
            range_str = range_header.replace("bytes=", "")
            start, end = 0, file_size - 1
            if "-" in range_str:
                parts = range_str.split("-")
                start = int(parts[0]) if parts[0] else 0
                end = int(parts[1]) if parts[1] else file_size - 1

            if start >= file_size or end >= file_size or start > end:
                raise HTTPException(
                    status_code=416,
                    detail="Range Not Satisfiable",
                    headers={"Content-Range": f"bytes */{file_size}"},
                )

            s3_response = s3_client.get_object(
                Bucket=bucket_name,
                Key=user_object_key,
                Range=f"bytes={start}-{end}",
            )
            content_length = end - start + 1
            headers.update({
                "Content-Length": str(content_length),
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Content-Type": content_type,
            })
            return StreamingResponse(
                iter_s3_stream(s3_response["Body"], STREAMING_CHUNK_SIZE),
                media_type=content_type,
                headers=headers,
                status_code=206,
            )
        else:
            s3_response = s3_client.get_object(Bucket=bucket_name, Key=user_object_key)
            headers.update({
                "Content-Length": str(file_size),
                "Content-Type": content_type,
            })
            return StreamingResponse(
                iter_s3_stream(s3_response["Body"], STREAMING_CHUNK_SIZE),
                media_type=content_type,
                headers=headers,
                status_code=200,
            )

    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "")
        if error_code in ["NoSuchKey", "404"]:
            raise HTTPException(status_code=404, detail=f"File '{object_key}' not found.")
        if error_code == "NoSuchBucket":
            raise HTTPException(status_code=404, detail=f"Bucket '{bucket_name}' not found.")
        logger.error(f"S3 Error for {user_object_key}: {error_code} - {e}")
        raise HTTPException(status_code=500, detail=f"S3 Error: {error_code}")
    except Exception as e:
        logger.error(f"Unexpected error streaming {user_object_key}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error during file streaming")


@router.get("/{object_key:path}")
async def get_file_from_bucket(
    object_key: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """Download or stream a file from primary storage."""
    return await handle_file_request(object_key, request, current_user, db, is_head=False)


@router.head("/{object_key:path}")
async def head_file_from_bucket(
    object_key: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Retrieve metadata for a file (HEAD request)."""
    return await handle_file_request(object_key, request, current_user, db, is_head=True)


@router.delete("/{object_key:path}", status_code=status.HTTP_200_OK)
async def delete_file_from_bucket(
    object_key: str,
    delete_type: Optional[str] = Query(default="both", description="local | sync_target | both"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JSONResponse:
    """
    Delete a file based on delete_type:
    - 'sync_target' (or 'aws'): Delete only from secondary sync target, keep local primary file, reset sync_status to 'none'.
    - 'local': Delete only from primary storage, delete FileRecord and SharedLink.
    - 'both': Delete from primary storage and secondary sync target (if synced), delete FileRecord and SharedLink.
    """
    validate_uuid(current_user.id)
    s3_client, bucket_name = StorageService.get_primary_client()

    object_key = unquote(object_key)
    user_object_key = f"{current_user.id}/{object_key}"

    record = (
        db.query(FileRecord)
        .filter(
            FileRecord.user_id == current_user.id,
            FileRecord.object_key == user_object_key,
        )
        .first()
    )

    dtype = delete_type.lower() if isinstance(delete_type, str) else "both"
    is_folder_deletion = bool((record and record.is_folder) or object_key.endswith("/"))
    folder_prefix = f"{current_user.id}/{object_key.rstrip('/')}/" if is_folder_deletion else None

    try:
        deleted_from_sync_target = False

        if is_folder_deletion and folder_prefix:
            # Gather all folder and child records
            all_records = (
                db.query(FileRecord)
                .filter(
                    FileRecord.user_id == current_user.id,
                    (FileRecord.object_key == user_object_key)
                    | (FileRecord.object_key.startswith(folder_prefix)),
                )
                .all()
            )

            sync_client, sync_bucket = (
                StorageService.get_sync_target_client()
                if (dtype in ("aws", "sync_target", "backup", "both"))
                else (None, None)
            )

            for rec in all_records:
                if dtype in ("aws", "sync_target", "backup"):
                    if rec.sync_status == "synced" and sync_client and sync_bucket:
                        try:
                            sync_client.delete_object(Bucket=sync_bucket, Key=rec.object_key)
                            deleted_from_sync_target = True
                        except ClientError as e:
                            logger.warning(f"Failed to delete from sync target: {e}")
                    rec.sync_status = "none"
                    rec.last_synced_at = None
                    rec.sync_error = None
                else:
                    # Primary deletion ('local' or 'both')
                    try:
                        s3_client.delete_object(Bucket=bucket_name, Key=rec.object_key)
                    except ClientError:
                        pass
                    if dtype == "both" and rec.sync_status == "synced" and sync_client and sync_bucket:
                        try:
                            sync_client.delete_object(Bucket=sync_bucket, Key=rec.object_key)
                            deleted_from_sync_target = True
                        except ClientError as e:
                            logger.warning(f"Failed to delete child from sync target: {e}")
                    db.query(SharedLink).filter(
                        SharedLink.object_key == rec.object_key,
                        SharedLink.user_id == current_user.id,
                    ).delete()
                    db.delete(rec)

            db.commit()

            msg = (
                "Folder removed from secondary sync storage"
                if dtype in ("aws", "sync_target", "backup")
                else "Folder and its contents deleted successfully"
            )
            return JSONResponse(content={
                "message": msg,
                "bucket": bucket_name,
                "filename": object_key,
                "key": object_key,
                "deleted_from_sync_target": deleted_from_sync_target,
                "user_id": current_user.id,
            })

        # Single file deletion
        # Case 1: Delete from secondary sync target only
        if dtype in ("aws", "sync_target", "backup"):
            if record and record.sync_status == "synced":
                sync_client, sync_bucket = StorageService.get_sync_target_client()
                if sync_client and sync_bucket:
                    try:
                        sync_client.delete_object(
                            Bucket=sync_bucket, Key=user_object_key
                        )
                        deleted_from_sync_target = True
                    except ClientError as e:
                        logger.warning(f"Failed to delete from sync target: {e}")

            if record:
                record.sync_status = "none"
                record.last_synced_at = None
                record.sync_error = None
                db.commit()

            return JSONResponse(content={
                "message": "File removed from secondary sync storage",
                "bucket": bucket_name,
                "filename": object_key,
                "key": object_key,
                "deleted_from_sync_target": deleted_from_sync_target,
                "sync_status": "none",
                "user_id": current_user.id,
            })

        # Case 2 & 3: Delete from primary storage ('local' or 'both')
        s3_client.delete_object(Bucket=bucket_name, Key=user_object_key)

        if dtype == "both" and record and record.sync_status == "synced":
            sync_client, sync_bucket = StorageService.get_sync_target_client()
            if sync_client and sync_bucket:
                try:
                    sync_client.delete_object(
                        Bucket=sync_bucket, Key=user_object_key
                    )
                    deleted_from_sync_target = True
                except ClientError as e:
                    logger.warning(f"Failed to delete from sync target: {e}")

        if record:
            db.delete(record)

        db.query(SharedLink).filter(
            SharedLink.object_key == user_object_key,
            SharedLink.user_id == current_user.id,
        ).delete()

        db.commit()

        return JSONResponse(content={
            "message": "File deleted successfully",
            "bucket": bucket_name,
            "filename": object_key,
            "key": object_key,
            "deleted_from_sync_target": deleted_from_sync_target,
            "user_id": current_user.id,
        })

    except ClientError as e:
        db.rollback()
        error_code = e.response.get("Error", {}).get("Code", "")
        if error_code in ["NoSuchKey", "404"]:
            raise HTTPException(status_code=404, detail=f"File '{object_key}' not found.")
        if error_code == "NoSuchBucket":
            raise HTTPException(status_code=404, detail=f"Bucket '{bucket_name}' not found.")
        raise HTTPException(status_code=500, detail=f"S3 Error: {error_code}")
    except Exception as e:
        db.rollback()
        logger.error(f"Unexpected error deleting {user_object_key}: {e}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")
