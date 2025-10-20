import logging
from datetime import datetime, timezone
from botocore.exceptions import ClientError, EndpointConnectionError
from .s3_service import aws_s3_client, minio_s3_client

# ------------------- LOGGING SETUP -------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[logging.FileHandler("s3_sync.log")],
)
logger = logging.getLogger(__name__)

# ------------------- EXCEPTIONS -------------------


class S3SyncError(Exception):
    """Custom exception for sync-related failures."""

    pass


# ------------------- HELPERS -------------------


def _ensure_bucket_exists(client, bucket_name: str):
    """Verifies a bucket exists, creating it if necessary."""
    try:
        client.head_bucket(Bucket=bucket_name)
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") in ["404", "NoSuchBucket"]:
            try:
                client.create_bucket(Bucket=bucket_name)
                logger.info(f"Created destination bucket: {bucket_name}")
            except ClientError as ce:
                logger.error(f"Failed to create bucket '{bucket_name}': {ce}")
                raise S3SyncError(f"Could not create bucket '{bucket_name}'.") from ce
        else:
            logger.error(f"Failed to access bucket '{bucket_name}': {e}")
            raise S3SyncError(f"Could not access bucket '{bucket_name}'.") from e


def _check_source_bucket_exists(client, bucket_name: str):
    """Verifies the source bucket exists."""
    try:
        client.head_bucket(Bucket=bucket_name)
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") in ["404", "NoSuchBucket"]:
            raise S3SyncError(f"Source bucket '{bucket_name}' does not exist.")
        else:
            raise S3SyncError(f"Could not access source bucket '{bucket_name}'.") from e


def _get_object_metadata(client, bucket: str, key: str) -> dict | None:
    """Retrieves metadata (like ETag) for an object. Returns None if object does not exist."""
    try:
        response = client.head_object(Bucket=bucket, Key=key)
        response["ETag"] = response.get("ETag", "").strip('"')
        return response
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") == "404":
            return None
        logger.error(f"Could not get metadata for '{key}' in bucket '{bucket}': {e}")
        raise S3SyncError(f"Could not access metadata for {bucket}/{key}") from e


def _extract_error_details(exception: Exception) -> str:
    """Extracts detailed error message from various exception types."""
    if isinstance(exception, ClientError):
        error_code = exception.response.get("Error", {}).get("Code", "Unknown")
        error_message = exception.response.get("Error", {}).get(
            "Message", str(exception)
        )
        return f"{error_code}: {error_message}"
    elif isinstance(exception, S3SyncError):
        if exception.__cause__:
            return f"{str(exception)} (Cause: {_extract_error_details(exception.__cause__)})"
        return str(exception)
    else:
        return f"{type(exception).__name__}: {str(exception)}"


# ------------------- API-FRIENDLY/DD SERVICE FUNCTIONS -------------------


def sync_single_file(
    local_bucket: str, aws_bucket: str, key: str, user_id: str
) -> dict:
    """
    Syncs a single object, updating it if the content has changed based on ETag.

    Args:
        local_bucket: Source bucket name (MinIO).
        aws_bucket: Destination bucket name (AWS).
        key: The full S3 key (including user prefix).
        user_id: The user ID for metadata updates.

    Returns:
        dict with keys:
            - status: "synced", "updated", "skipped", or "failed"
            - key: the object key
            - error: (optional) error message if status is "failed"
    """
    logger.info(
        f"Attempting to sync single file: '{key}' from '{local_bucket}' to '{aws_bucket}'"
    )

    try:
        # 1. Get source metadata; fail if source doesn't exist.
        source_meta = _get_object_metadata(minio_s3_client, local_bucket, key)
        if source_meta is None:
            raise S3SyncError(
                f"Source file '{key}' not found in bucket '{local_bucket}'."
            )
        source_etag = source_meta.get("ETag")

        # 2. Ensure destination bucket exists.
        _ensure_bucket_exists(aws_s3_client, aws_bucket)

        # 3. Get destination metadata to compare.
        dest_meta = _get_object_metadata(aws_s3_client, aws_bucket, key)

        # 4. Compare and act.
        if dest_meta and dest_meta.get("ETag") == source_etag:
            logger.info(f"Skipped: '{key}' is already up to date in destination.")
            # Update metadata to reflect skipped state
            try:
                source_metadata = source_meta.get("Metadata", {})
                minio_metadata = {
                    **source_metadata,
                    "synced": "true",
                    "last_synced": datetime.now(timezone.utc).isoformat(),
                    "aws_bucket": aws_bucket,
                    "user_id": user_id,
                }
                copy_source = {"Bucket": local_bucket, "Key": key}
                minio_s3_client.copy_object(
                    Bucket=local_bucket,
                    Key=key,
                    CopySource=copy_source,
                    Metadata=minio_metadata,
                    MetadataDirective="REPLACE",
                )
                logger.debug(f"Updated MinIO metadata for '{key}' to synced state.")
            except (ClientError, EndpointConnectionError) as ce:
                logger.warning(f"Failed to update MinIO metadata for '{key}': {ce}")
            return {"status": "skipped", "key": key}

        # 5. Set pending metadata before sync
        source_metadata = source_meta.get("Metadata", {})
        minio_metadata = {
            **source_metadata,
            "synced": "pending",
            "last_synced": datetime.now(timezone.utc).isoformat(),
            "aws_bucket": aws_bucket,
            "user_id": user_id,
        }
        copy_source = {"Bucket": local_bucket, "Key": key}
        try:
            minio_s3_client.copy_object(
                Bucket=local_bucket,
                Key=key,
                CopySource=copy_source,
                Metadata=minio_metadata,
                MetadataDirective="REPLACE",
            )
            logger.debug(f"Set pending metadata for '{key}'")
        except (ClientError, EndpointConnectionError) as ce:
            logger.warning(f"Failed to set pending metadata for '{key}': {ce}")

        status = "updated" if dest_meta else "synced"

        # 6. Prepare timestamp.
        timestamp = datetime.now(timezone.utc).isoformat()

        # 7. Get source object for upload and metadata.
        source_resp = minio_s3_client.get_object(Bucket=local_bucket, Key=key)
        source_body = source_resp["Body"]
        source_metadata = source_resp.get("Metadata", {}) or source_meta.get(
            "Metadata", {}
        )

        # 8. Upload to AWS with merged metadata.
        aws_metadata = {
            **source_metadata,
            "last_synced": timestamp,
            "synced": "true",
            "aws_bucket": aws_bucket,
            "user_id": user_id,
        }
        aws_s3_client.upload_fileobj(
            source_body,
            Bucket=aws_bucket,
            Key=key,
            ExtraArgs={"Metadata": aws_metadata},
        )

        # 9. Update MinIO source with final metadata via server-side copy.
        minio_metadata = {
            **source_metadata,
            "last_synced": timestamp,
            "synced": "true",
            "aws_bucket": aws_bucket,
            "user_id": user_id,
        }
        try:
            minio_s3_client.copy_object(
                Bucket=local_bucket,
                Key=key,
                CopySource=copy_source,
                Metadata=minio_metadata,
                MetadataDirective="REPLACE",
            )
            logger.debug(
                f"Updated MinIO metadata for '{key}' with last_synced, synced, and aws_bucket."
            )
        except (ClientError, EndpointConnectionError) as ce:
            logger.warning(f"Failed to update MinIO metadata for '{key}': {ce}")

        logger.info(f"Successfully {status}: {key}")
        return {"status": status, "key": key}

    except (ClientError, EndpointConnectionError, S3SyncError) as e:
        error_details = _extract_error_details(e)
        logger.error(f"Error during single file sync for '{key}': {error_details}")
        # Update metadata to reflect failure
        try:
            source_meta = _get_object_metadata(minio_s3_client, local_bucket, key)
            if source_meta:
                source_metadata = source_meta.get("Metadata", {})
                minio_metadata = {
                    **source_metadata,
                    "synced": "false",
                    "last_synced": datetime.now(timezone.utc).isoformat(),
                    "aws_bucket": aws_bucket,
                    "user_id": user_id,
                }
                copy_source = {"Bucket": local_bucket, "Key": key}
                minio_s3_client.copy_object(
                    Bucket=local_bucket,
                    Key=key,
                    CopySource=copy_source,
                    Metadata=minio_metadata,
                    MetadataDirective="REPLACE",
                )
                logger.debug(f"Updated MinIO metadata for '{key}' to failed state.")
        except (ClientError, EndpointConnectionError) as ce:
            logger.warning(
                f"Failed to update MinIO metadata for '{key}' after error: {ce}"
            )
        return {"status": "failed", "key": key, "error": error_details}


def sync_single_bucket(
    bucket_name: str, aws_bucket_name: str = None, prefix: str = None
) -> dict:
    """
    Syncs all objects in a single bucket (or under a prefix), updating files if their content has changed.

    Args:
        bucket_name: MinIO source bucket name
        aws_bucket_name: AWS destination bucket name (defaults to bucket_name)
        prefix: Optional prefix to limit sync scope (e.g., 'user_id/')

    Returns:
        dict with keys:
            - bucket: bucket name
            - files_synced: count of newly synced files
            - files_updated: count of updated files
            - files_skipped: count of skipped files
            - failed_files: list of dicts with 'key' and 'error' for each failure
            - error: (optional) bucket-level error message
    """
    aws_bucket = aws_bucket_name or bucket_name
    logger.info(
        f"Starting sync for bucket: '{bucket_name}' to AWS '{aws_bucket}' with prefix '{prefix}'"
    )

    summary = {
        "bucket": bucket_name,
        "files_synced": 0,
        "files_updated": 0,
        "files_skipped": 0,
        "failed_files": [],
    }

    try:
        # 1. Verify source and destination buckets exist
        _check_source_bucket_exists(minio_s3_client, bucket_name)
        _ensure_bucket_exists(aws_s3_client, aws_bucket)
    except S3SyncError as e:
        error_details = _extract_error_details(e)
        logger.error(
            f"Bucket readiness check failed for '{bucket_name}': {error_details}"
        )
        summary["error"] = error_details
        return summary

    # 2. Paginate through all objects in the source bucket (or prefix)
    paginator = minio_s3_client.get_paginator("list_objects_v2")
    pagination_params = {"Bucket": bucket_name}
    if prefix:
        pagination_params["Prefix"] = prefix

    try:
        for page in paginator.paginate(**pagination_params):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                source_etag = obj.get("ETag", "").strip('"')

                try:
                    # Set pending metadata
                    source_meta = _get_object_metadata(
                        minio_s3_client, bucket_name, key
                    )
                    if source_meta:
                        source_metadata = source_meta.get("Metadata", {})
                        user_id = source_metadata.get("user_id", "unknown")
                        minio_metadata = {
                            **source_metadata,
                            "synced": "pending",
                            "last_synced": datetime.now(timezone.utc).isoformat(),
                            "aws_bucket": aws_bucket,
                            "user_id": user_id,
                        }
                        copy_source = {"Bucket": bucket_name, "Key": key}
                        minio_s3_client.copy_object(
                            Bucket=bucket_name,
                            Key=key,
                            CopySource=copy_source,
                            Metadata=minio_metadata,
                            MetadataDirective="REPLACE",
                        )
                        logger.debug(f"Set pending metadata for '{key}'")

                    dest_meta = _get_object_metadata(aws_s3_client, aws_bucket, key)

                    if dest_meta is None:
                        status = "synced"
                        summary["files_synced"] += 1
                    elif dest_meta.get("ETag") == source_etag:
                        summary["files_skipped"] += 1
                        # Update metadata to synced state
                        minio_metadata["synced"] = "true"
                        try:
                            minio_s3_client.copy_object(
                                Bucket=bucket_name,
                                Key=key,
                                CopySource=copy_source,
                                Metadata=minio_metadata,
                                MetadataDirective="REPLACE",
                            )
                            logger.debug(
                                f"Updated MinIO metadata for '{key}' to synced state."
                            )
                        except (ClientError, EndpointConnectionError) as ce:
                            logger.warning(
                                f"Failed to update MinIO metadata for '{key}': {ce}"
                            )
                        continue
                    else:
                        status = "updated"
                        summary["files_updated"] += 1

                    # Prepare timestamp
                    timestamp = datetime.now(timezone.utc).isoformat()

                    # Get source object for upload and metadata
                    source_resp = minio_s3_client.get_object(
                        Bucket=bucket_name, Key=key
                    )
                    source_body = source_resp["Body"]
                    source_metadata = source_resp.get("Metadata", {})

                    # Upload to AWS with merged metadata
                    aws_metadata = {
                        **source_metadata,
                        "last_synced": timestamp,
                        "synced": "true",
                        "aws_bucket": aws_bucket,
                        "user_id": user_id,
                    }
                    aws_s3_client.upload_fileobj(
                        source_body,
                        Bucket=aws_bucket,
                        Key=key,
                        ExtraArgs={"Metadata": aws_metadata},
                    )

                    # Update MinIO source with final metadata
                    minio_metadata = {
                        **source_metadata,
                        "last_synced": timestamp,
                        "synced": "true",
                        "aws_bucket": aws_bucket,
                        "user_id": user_id,
                    }
                    try:
                        minio_s3_client.copy_object(
                            Bucket=bucket_name,
                            Key=key,
                            CopySource=copy_source,
                            Metadata=minio_metadata,
                            MetadataDirective="REPLACE",
                        )
                        logger.debug(
                            f"Updated MinIO metadata for '{key}' with last_synced, synced, and aws_bucket."
                        )
                    except (ClientError, EndpointConnectionError) as ce:
                        logger.warning(
                            f"Failed to update MinIO metadata for '{key}': {ce}"
                        )

                    logger.debug(
                        f"Successfully {status} object '{key}' in bucket '{bucket_name}'."
                    )

                except (ClientError, EndpointConnectionError, S3SyncError) as e:
                    error_details = _extract_error_details(e)
                    logger.error(
                        f"Failed to sync object '{key}' from '{bucket_name}': {error_details}"
                    )
                    # Update metadata to failed state
                    try:
                        source_meta = _get_object_metadata(
                            minio_s3_client, bucket_name, key
                        )
                        if source_meta:
                            source_metadata = source_meta.get("Metadata", {})
                            user_id = source_metadata.get("user_id", "unknown")
                            minio_metadata = {
                                **source_metadata,
                                "synced": "false",
                                "last_synced": datetime.now(timezone.utc).isoformat(),
                                "aws_bucket": aws_bucket,
                                "user_id": user_id,
                            }
                            copy_source = {"Bucket": bucket_name, "Key": key}
                            minio_s3_client.copy_object(
                                Bucket=bucket_name,
                                Key=key,
                                CopySource=copy_source,
                                Metadata=minio_metadata,
                                MetadataDirective="REPLACE",
                            )
                            logger.debug(
                                f"Updated MinIO metadata for '{key}' to failed state."
                            )
                    except (ClientError, EndpointConnectionError) as ce:
                        logger.warning(
                            f"Failed to update MinIO metadata for '{key}' after error: {ce}"
                        )
                    summary["failed_files"].append({"key": key, "error": error_details})

    except ClientError as e:
        error_details = _extract_error_details(e)
        logger.error(
            f"Could not list objects for source bucket '{bucket_name}': {error_details}"
        )
        summary["error"] = f"Failed to list objects in source bucket: {error_details}"

    logger.info(f"Sync complete for bucket '{bucket_name}'. Summary: {summary}")
    return summary


def sync_all_buckets(aws_bucket_prefix: str = None) -> dict:
    """
    Syncs all buckets from source to destination by calling sync_single_bucket for each.

    Args:
        aws_bucket_prefix: Optional prefix for AWS bucket names (e.g., append to MinIO names)

    Returns:
        dict with keys:
            - total_buckets_scanned: number of buckets found
            - total_files_synced: total newly synced files
            - total_files_updated: total updated files
            - total_files_skipped: total skipped files
            - failed_buckets: list of dicts with 'bucket' and 'error' for bucket-level failures
            - bucket_summaries: list of per-bucket summaries
    """
    logger.info("Starting full sync of all buckets...")

    overall_summary = {
        "total_buckets_scanned": 0,
        "total_files_synced": 0,
        "total_files_updated": 0,
        "total_files_skipped": 0,
        "failed_buckets": [],
        "bucket_summaries": [],
    }

    try:
        response = minio_s3_client.list_buckets()
        source_buckets = [b["Name"] for b in response.get("Buckets", [])]
        overall_summary["total_buckets_scanned"] = len(source_buckets)
    except ClientError as e:
        error_details = _extract_error_details(e)
        logger.critical(f"FATAL: Could not list source buckets: {error_details}")
        raise S3SyncError("Could not list source buckets. Aborting sync.") from e

    for bucket_name in source_buckets:
        aws_bucket = (
            f"{bucket_name}{aws_bucket_prefix}" if aws_bucket_prefix else bucket_name
        )
        bucket_summary = sync_single_bucket(bucket_name, aws_bucket)
        overall_summary["total_files_synced"] += bucket_summary.get("files_synced", 0)
        overall_summary["total_files_updated"] += bucket_summary.get("files_updated", 0)
        overall_summary["total_files_skipped"] += bucket_summary.get("files_skipped", 0)

        if "error" in bucket_summary:
            overall_summary["failed_buckets"].append(
                {"bucket": bucket_name, "error": bucket_summary["error"]}
            )
        elif bucket_summary.get("failed_files"):
            overall_summary["failed_buckets"].append(
                {
                    "bucket": bucket_name,
                    "error": f"{len(bucket_summary['failed_files'])} file(s) failed to sync",
                }
            )

        overall_summary["bucket_summaries"].append(bucket_summary)

    logger.info(f"Full sync of all buckets complete. Summary: {overall_summary}")
    return overall_summary


def get_detailed_failure_report(sync_result: dict) -> str:
    """
    Generate a human-readable failure report from sync results.

    Args:
        sync_result: Result dict from sync_all_buckets() or sync_single_bucket()

    Returns:
        Formatted string with failure details
    """
    report_lines = []

    if "bucket_summaries" in sync_result:
        report_lines.append("=" * 60)
        report_lines.append("SYNC FAILURE REPORT - ALL BUCKETS")
        report_lines.append("=" * 60)

        for bucket_summary in sync_result["bucket_summaries"]:
            if bucket_summary.get("failed_files") or "error" in bucket_summary:
                report_lines.append(f"\nBucket: {bucket_summary['bucket']}")
                if "error" in bucket_summary:
                    report_lines.append(
                        f"  Bucket-level error: {bucket_summary['error']}"
                    )
                if bucket_summary.get("failed_files"):
                    report_lines.append(
                        f"  Failed files ({len(bucket_summary['failed_files'])}):"
                    )
                    for failed in bucket_summary["failed_files"]:
                        report_lines.append(f"    - {failed['key']}")
                        report_lines.append(f"      Error: {failed['error']}")
    else:
        report_lines.append("=" * 60)
        report_lines.append(
            f"SYNC FAILURE REPORT - BUCKET: {sync_result.get('bucket', 'Unknown')}"
        )
        report_lines.append("=" * 60)

        if "error" in sync_result:
            report_lines.append(f"\nBucket-level error: {sync_result['error']}")
        if sync_result.get("failed_files"):
            report_lines.append(f"\nFailed files ({len(sync_result['failed_files'])}):")
            for failed in sync_result["failed_files"]:
                report_lines.append(f"  - {failed['key']}")
                report_lines.append(f"    Error: {failed['error']}")

    report_lines.append("\n" + "=" * 60)
    return "\n".join(report_lines)
