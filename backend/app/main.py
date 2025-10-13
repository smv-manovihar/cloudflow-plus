import os
from fastapi import FastAPI
from app.api.routers import aws_buckets, aws_files, minio_buckets, minio_files
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="CloudFlow API",
    description="An API to manage buckets and files on S3 or any S3-compatible service like MinIO.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", include_in_schema=False)
async def root():
    return {"message": "Welcome! Go to /docs to see the API documentation."}


app.include_router(aws_buckets.router)
app.include_router(aws_files.router)
app.include_router(minio_buckets.router)
app.include_router(minio_files.router)
