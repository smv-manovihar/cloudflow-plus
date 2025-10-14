from dotenv import load_dotenv
import os

load_dotenv()

MINIO_ENDPOINT_URL = os.getenv("MINIO_ENDPOINT_URL")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY")

AWS_ACCESS_KEY = os.getenv("AWS_ACCESS_KEY")
AWS_SECRET_KEY = os.getenv("AWS_SECRET_KEY")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

BUCKET_NAME = os.getenv("BUCKET_NAME", "cloud-flow-bucket")
