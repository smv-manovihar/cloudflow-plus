from fastapi import APIRouter, Depends, HTTPException, status, Request, BackgroundTasks
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from app.services.s3_service import minio_s3_client, aws_s3_client
from fastapi.security import OAuth2PasswordRequestForm

from app import models, schemas, hashing
from app.database import get_db
from app.oauth2 import (
    create_access_token,
    create_refresh_token,
    verify_token,
    get_current_user,
)
from app.core.config import BUCKET_NAME
from app.services.s3_service import minio_s3_client

router = APIRouter(prefix="/auth", tags=["Authentication"])


# Register new user
@router.post(
    "/register", status_code=status.HTTP_201_CREATED, response_model=schemas.ShowUser
)
def register(user: schemas.User, db: Session = Depends(get_db)):
    existing_user = (
        db.query(models.User).filter(models.User.email == user.email).first()
    )
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed_password = hashing.Hash.encrypt(user.password)
    new_user = models.User(name=user.name, email=user.email, password=hashed_password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.get("/me", response_model=schemas.ShowUser)
def get_me(current_user: models.User = Depends(get_current_user)):
    return current_user


# Login: verify user, return token + set cookies
@router.post("/login")
def login(request: schemas.Login, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == request.email).first()
    if not user or not hashing.Hash.verify(request.password, user.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    access_token = create_access_token(user.email)
    refresh_token = create_refresh_token(user.email)

    response = JSONResponse(
        content={
            "message": "Login successful",
            "user": {
                "id": user.id,
                "name": user.name,
                "email": user.email,
            },
        }
    )
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=15 * 60,  # 15 minutes
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=15 * 24 * 60 * 60,  # 15 days
    )
    return response


# OAuth2 token endpoint for Swagger UI (password flow)
# Note: Swagger expects 'username' field; we treat it as email
@router.post("/token")
def oauth2_token(
    form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)
):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user or not hashing.Hash.verify(form_data.password, user.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    access_token = create_access_token(user.email)
    return {"access_token": access_token, "token_type": "bearer"}


# Refresh access token using refresh token
@router.post("/refresh")
def refresh_token(request: Request):
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing refresh token"
        )

    payload = verify_token(refresh_token, is_refresh=True)
    new_access_token = create_access_token(payload.sub)

    response = JSONResponse(content={"message": "Token refreshed"})
    response.set_cookie(
        key="access_token",
        value=new_access_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=15 * 60,
    )
    return response


@router.put("/info", response_model=schemas.ShowUser)
def update_user_info(
    user: schemas.UpdateUser,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Check if email is being changed and ensure it's unique
    if user.email != current_user.email:
        existing_user = (
            db.query(models.User).filter(models.User.email == user.email).first()
        )
        if existing_user:
            raise HTTPException(status_code=400, detail="Email already in use")

    # Update user fields (excluding password)
    current_user.name = user.name
    current_user.email = user.email

    # Commit changes
    db.commit()
    db.refresh(current_user)
    return current_user


@router.put("/change-password")
def change_password(
    request: schemas.ChangePassword,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Verify old password
    if not hashing.Hash.verify(request.old_password, current_user.password):
        raise HTTPException(status_code=400, detail="Old password is incorrect")

    # Hash and update new password
    current_user.password = hashing.Hash.encrypt(request.new_password)

    # Commit changes
    db.commit()
    return {"message": "Password changed successfully"}


# Logout: clear cookies
@router.post("/logout")
def logout():
    response = JSONResponse(content={"message": "Logged out"})
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    return response


def _delete_s3_prefix(s3_client, bucket_name: str, prefix: str):
    """
    Deletes all objects under a given prefix from an S3 bucket.
    This function is generic and works with any boto3-compatible client.
    """
    try:
        paginator = s3_client.get_paginator("list_objects_v2")
        pages = paginator.paginate(Bucket=bucket_name, Prefix=prefix)

        objects_to_delete = [
            {"Key": obj["Key"]} for page in pages for obj in page.get("Contents", [])
        ]

        if not objects_to_delete:
            print(
                f"No objects to delete in bucket '{bucket_name}' with prefix '{prefix}'."
            )
            return

        for i in range(0, len(objects_to_delete), 1000):
            batch = objects_to_delete[i : i + 1000]
            s3_client.delete_objects(Bucket=bucket_name, Delete={"Objects": batch})
        print(f"Successfully deleted prefix '{prefix}' from bucket '{bucket_name}'.")

    except Exception as e:
        # Use a proper logger in production
        print(f"Error deleting prefix '{prefix}' from bucket '{bucket_name}': {e}")


# 2. Updated background task to orchestrate the cleanup
def cleanup_user_storage(user_id: int):
    """
    This background task cleans up all storage associated with a user
    from every configured storage provider (MinIO, AWS S3, etc.).
    """
    user_prefix = f"{user_id}/"
    print(f"Starting background cleanup for user: {user_id}")

    _delete_s3_prefix(
        s3_client=minio_s3_client, bucket_name=BUCKET_NAME, prefix=user_prefix
    )

    _delete_s3_prefix(
        s3_client=aws_s3_client,
        bucket_name=BUCKET_NAME,  # Use the specific AWS bucket name
        prefix=user_prefix,
    )

    print(f"Finished background cleanup for user: {user_id}")


@router.delete("/delete-account")
def delete_account(
    background_tasks: BackgroundTasks,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        user_id_for_task = current_user.id
        db.delete(current_user)
        db.commit()

        # Schedule the single, comprehensive cleanup task
        background_tasks.add_task(cleanup_user_storage, user_id=user_id_for_task)

        return {
            "message": "Account deletion initiated. Your data will be erased shortly."
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error deleting account: {str(e)}")
