import logging
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


def sync_single_file(local_bucket: str, aws_bucket: str, key: str) -> dict:
    """
    Syncs a single object, updating it if the content has changed based on ETag.

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
            return {"status": "skipped", "key": key}

        status = "updated" if dest_meta else "synyed"

        # 5. Perform copy using file object.
        aws_s3_client.upload_fileobj(
            minio_s3_client.get_object(Bucket=local_bucket, Key=key)["Body"],
            Bucket=aws_bucket,
            Key=key,
        )

        logger.info(f"Successfully {status}: {key}")
        return {"status": status, "key": key}

    except (ClientError, EndpointConnectionError, S3SyncError) as e:
        error_details = _extract_error_details(e)
        logger.error(f"Error during single file sync for '{key}': {error_details}")
        return {"status": "failed", "key": key, "error": error_details}


def sync_single_bucket(bucket_name: str) -> dict:
    """
    Syncs all objects in a single bucket, updating files if their content has changed.

    Returns:
        dict with keys:
            - bucket: bucket name
            - files_synced: count of newly synced files
            - files_updated: count of updated files
            - files_skipped: count of skipped files
            - failed_files: list of dicts with 'key' and 'error' for each failure
            - error: (optional) bucket-level error message
    """
    logger.info(f"Starting sync for single bucket: '{bucket_name}'")

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
        _ensure_bucket_exists(aws_s3_client, bucket_name)
    except S3SyncError as e:
        error_details = _extract_error_details(e)
        logger.error(
            f"Bucket readiness check failed for '{bucket_name}': {error_details}"
        )
        summary["error"] = error_details
        return summary

    # 2. Paginate through all objects in the source bucket
    paginator = minio_s3_client.get_paginator("list_objects_v2")
    try:
        for page in paginator.paginate(Bucket=bucket_name):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                source_etag = obj.get("ETag", "").strip('"')

                try:
                    dest_meta = _get_object_metadata(aws_s3_client, bucket_name, key)

                    if dest_meta is None:
                        status = "synced"
                        summary["files_synced"] += 1
                    elif dest_meta.get("ETag") == source_etag:
                        summary["files_skipped"] += 1
                        continue
                    else:
                        status = "updated"
                        summary["files_updated"] += 1

                    # Perform copy using file object
                    aws_s3_client.upload_fileobj(
                        minio_s3_client.get_object(Bucket=bucket_name, Key=key)["Body"],
                        Bucket=bucket_name,
                        Key=key,
                    )
                    logger.debug(
                        f"Successfully {status} object '{key}' in bucket '{bucket_name}'."
                    )

                except (ClientError, EndpointConnectionError, S3SyncError) as e:
                    error_details = _extract_error_details(e)
                    logger.error(
                        f"Failed to sync object '{key}' from '{bucket_name}': {error_details}"
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


def sync_all_buckets() -> dict:
    """
    Syncs all buckets from source to destination by calling sync_single_bucket for each.

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
        bucket_summary = sync_single_bucket(bucket_name)
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
