from fastapi import HTTPException, status
from fastapi.routing import APIRouter
from fastapi.responses import JSONResponse
from botocore.exceptions import ClientError
from app.services.s3_service import minio_s3_client
from app.core.config import AWS_REGION
import app.schemas as schemas
import json

router = APIRouter(prefix="/minio/buckets", tags=["Minio Buckets"])


@router.get("/")
async def list_buckets() -> JSONResponse:
    """
    Lists all buckets in the S3 storage.
    """
    if not minio_s3_client:
        raise HTTPException(status_code=503, detail="S3 client not initialized")
    try:
        response = minio_s3_client.list_buckets()
        buckets = [bucket for bucket in response.get("Buckets", [])]
        return {"buckets": buckets}
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{bucket_name}", status_code=status.HTTP_201_CREATED)
async def create_bucket(bucket_name: str) -> JSONResponse:
    """
    Creates a new bucket. The bucket name must be globally unique for AWS S3.
    """
    if not minio_s3_client:
        raise HTTPException(status_code=503, detail="S3 client not initialized")
    try:
        # For AWS, LocationConstraint is required for regions other than us-east-1
        # For MinIO, this is often ignored but good to have for compatibility.
        location_constraint = (
            {
                "LocationConstraint": AWS_REGION,
            }
            if AWS_REGION != "us-east-1"
            else {}
        )
        minio_s3_client.create_bucket(
            Bucket=bucket_name, CreateBucketConfiguration=location_constraint
        )
        return {"message": f"Bucket '{bucket_name}' created successfully."}
    except ClientError as e:
        if e.response["Error"]["Code"] in (
            "BucketAlreadyOwnedByYou",
            "BucketAlreadyExists",
        ):
            raise HTTPException(
                status_code=409, detail=f"Bucket '{bucket_name}' already exists."
            )
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{bucket_name}", status_code=status.HTTP_200_OK)
async def delete_bucket(bucket_name: str) -> JSONResponse:
    """
    Deletes a bucket. The bucket must be empty before it can be deleted.
    """
    if not minio_s3_client:
        raise HTTPException(status_code=503, detail="S3 client not initialized")
    try:
        minio_s3_client.delete_bucket(Bucket=bucket_name)
        return {"message": f"Bucket '{bucket_name}' deleted successfully."}
    except ClientError as e:
        if e.response["Error"]["Code"] == "NoSuchBucket":
            raise HTTPException(
                status_code=404, detail=f"Bucket '{bucket_name}' not found."
            )
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/buckets/{bucket_name}/info")
async def get_bucket_info(bucket_name: str):
    """
    Retrieves a comprehensive set of configuration details for a specified S3 bucket.
    """
    bucket_details = {}

    api_calls = {
        "acl": lambda: minio_s3_client.get_bucket_acl(Bucket=bucket_name),
        "policy": lambda: minio_s3_client.get_bucket_policy(Bucket=bucket_name),
        "versioning": lambda: minio_s3_client.get_bucket_versioning(Bucket=bucket_name),
        "public_access_block": lambda: minio_s3_client.get_public_access_block(
            Bucket=bucket_name
        ),
        "tags": lambda: minio_s3_client.get_bucket_tagging(Bucket=bucket_name),
        "website": lambda: minio_s3_client.get_bucket_website(Bucket=bucket_name),
    }

    for key, call in api_calls.items():
        try:
            result = call()
            # Clean up the boto3 response metadata
            if "ResponseMetadata" in result:
                del result["ResponseMetadata"]

            # Specific parsing for policy
            if key == "policy" and "Policy" in result:
                result["Policy"] = json.loads(result["Policy"])

            bucket_details[key] = result
        except ClientError as e:
            # Add a note about which info couldn't be retrieved, rather than failing the whole request
            error_code = e.response["Error"]["Code"]
            bucket_details[key] = f"Could not retrieve: {error_code}"

    return bucket_details


@router.put("/buckets/{bucket_name}/config")
async def update_bucket_config(bucket_name: str, payload: schemas.BucketUpdatePayload):
    """
    Updates a bucket's configuration for versioning, tags, or policy.
    Provide only the sections you wish to change in the request body.
    """
    update_status = {}

    # Check existence before attempting to update
    try:
        minio_s3_client.head_bucket(Bucket=bucket_name)
    except ClientError as e:
        raise HTTPException(
            status_code=404, detail=f"Bucket '{bucket_name}' not found."
        )

    # --- Update Versioning ---
    if payload.versioning is not None:
        try:
            status = "Enabled" if payload.versioning.enabled else "Suspended"
            minio_s3_client.put_bucket_versioning(
                Bucket=bucket_name, VersioningConfiguration={"Status": status}
            )
            update_status["versioning"] = f"Versioning status set to '{status}'."
        except ClientError as e:
            update_status["versioning"] = f"Error: {e.response['Error']['Message']}"

    # --- Update Tags ---
    if payload.tags is not None:
        try:
            tag_set = [{"Key": k, "Value": v} for k, v in payload.tags.items()]
            minio_s3_client.put_bucket_tagging(
                Bucket=bucket_name, Tagging={"TagSet": tag_set}
            )
            update_status["tags"] = "Tags updated successfully."
        except ClientError as e:
            update_status["tags"] = f"Error: {e.response['Error']['Message']}"

    # --- Update Policy ---
    if payload.policy is not None:
        try:
            policy_str = json.dumps(payload.policy)
            minio_s3_client.put_bucket_policy(Bucket=bucket_name, Policy=policy_str)
            update_status["policy"] = "Policy updated successfully."
        except ClientError as e:
            update_status["policy"] = f"Error: {e.response['Error']['Message']}"
        except Exception as e:
            update_status["policy"] = f"Error converting policy to JSON: {e}"

    if not update_status:
        return {"message": "No update operations were provided in the payload."}

    return {"bucket": bucket_name, "status": update_status}
