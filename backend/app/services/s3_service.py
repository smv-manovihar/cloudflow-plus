import boto3
from app.core.config import (
    MINIO_ENDPOINT_URL,
    MINIO_ACCESS_KEY,
    MINIO_SECRET_KEY,
    AWS_ACCESS_KEY,
    AWS_REGION,
    AWS_SECRET_KEY,
)
from botocore.exceptions import NoCredentialsError, ClientError


def _create_aws_client():
    """
    Initializes and returns a boto3 S3 client configured for AWS S3.
    This is an internal function not intended for direct import.
    """
    try:
        if not all([AWS_ACCESS_KEY, AWS_SECRET_KEY]):
            print("⚠️  AWS credentials not found in environment. Skipping AWS client.")
            return None

        client = boto3.client(
            "s3",
            aws_access_key_id=AWS_ACCESS_KEY,
            aws_secret_access_key=AWS_SECRET_KEY,
            region_name=AWS_REGION,
        )
        # A simple check to verify credentials
        client.list_buckets()
        print("✅ AWS S3 client initialized successfully.")
        return client
    except (NoCredentialsError, ClientError) as e:
        print(f"❌ Error initializing AWS S3 client: {e}")
        return None
    except Exception as e:
        print(f"❌ An unexpected error occurred with AWS client: {e}")
        return None


def _create_minio_client():
    """
    Initializes and returns a boto3 S3 client configured for MinIO.
    This is an internal function not intended for direct import.
    """
    try:

        if not all([MINIO_ENDPOINT_URL, MINIO_ACCESS_KEY, MINIO_SECRET_KEY]):
            print(
                "⚠️  MinIO configuration not found in environment. Skipping MinIO client."
            )
            return None

        client = boto3.client(
            "s3",
            endpoint_url=MINIO_ENDPOINT_URL,
            aws_access_key_id=MINIO_ACCESS_KEY,
            aws_secret_access_key=MINIO_SECRET_KEY,
            region_name="us-east-1",
        )
        client.list_buckets()
        print(
            f"✅ MinIO client initialized successfully. Endpoint: {MINIO_ENDPOINT_URL}"
        )
        return client
    except Exception as e:
        print(f"❌ Error initializing MinIO client: {e}")
        return None


aws_s3_client = _create_aws_client()
minio_s3_client = _create_minio_client()
