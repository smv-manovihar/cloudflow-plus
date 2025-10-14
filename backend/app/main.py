import os
from fastapi import FastAPI
from app.routers import (
    aws_buckets,
    aws_files,
    minio_buckets,
    minio_files,
    share_files,
    authentication,
    synchronization,
    files,
)
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app.core.config import FRONTEND_URL

app = FastAPI(
    title="CloudFlow API",
    description="An API to manage buckets and files on S3 or any S3-compatible service like MinIO.",
    version="1.0.0",
)

# Create database tables
Base.metadata.create_all(bind=engine)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", include_in_schema=False)
async def root():
    return {"message": "Welcome! Go to /docs to see the API documentation."}


app.include_router(files.router)
app.include_router(authentication.router)
app.include_router(share_files.router)
app.include_router(synchronization.router)
app.include_router(aws_buckets.router)
app.include_router(aws_files.router)
app.include_router(minio_buckets.router)
app.include_router(minio_files.router)
