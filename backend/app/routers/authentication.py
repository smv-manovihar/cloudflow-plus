import logging
from fastapi import APIRouter, Depends, HTTPException, status, Request, BackgroundTasks
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app import models, schemas, hashing
from app.database import get_db, SessionLocal
from app.oauth2 import (
    create_access_token,
    create_refresh_token,
    verify_token,
    get_current_user,
)
from app.services.storage_service import StorageService

logger = logging.getLogger(__name__)

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

    # Set access token in HttpOnly cookie (short-lived)
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=False,  # Set to True in production
        samesite="lax",
        max_age=15 * 60,  # 15 minutes
    )

    # Set refresh token in HttpOnly cookie (long-lived)
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=False,  # Set to True in production
        samesite="lax",
        max_age=7 * 24 * 60 * 60,  # 7 days
    )

    return response


# Refresh Token: verify refresh_token cookie and generate new access_token
@router.post("/refresh")
def refresh_token(request: Request, db: Session = Depends(get_db)):
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(
            status_code=401, detail="Refresh token missing in cookies"
        )

    token_data = verify_token(refresh_token, is_refresh=True)
    user = db.query(models.User).filter(models.User.email == token_data.sub).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    new_access_token = create_access_token(user.email)

    response = JSONResponse(content={"message": "Token refreshed successfully"})

    response.set_cookie(
        key="access_token",
        value=new_access_token,
        httponly=True,
        secure=False,  # Set to True in production
        samesite="lax",
        max_age=15 * 60,
    )

    return response


# Logout: clear both cookies
@router.post("/logout")
def logout():
    response = JSONResponse(content={"message": "Logged out successfully"})
    response.delete_cookie(key="access_token")
    response.delete_cookie(key="refresh_token")
    return response


# Swagger UI compatible login endpoint
@router.post("/token")
def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user or not hashing.Hash.verify(form_data.password, user.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    access_token = create_access_token(user.email)
    return {"access_token": access_token, "token_type": "bearer"}


# ------------------- USER MANAGEMENT -------------------


@router.put("/me", response_model=schemas.ShowUser)
def update_user_info(
    user_data: schemas.UpdateUser,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update user's name and/or email."""
    # Check if email is already taken by another user
    if user_data.email != current_user.email:
        existing_user = (
            db.query(models.User).filter(models.User.email == user_data.email).first()
        )
        if existing_user:
            raise HTTPException(status_code=400, detail="Email already registered")

    current_user.name = user_data.name
    current_user.email = user_data.email

    db.commit()
    db.refresh(current_user)
    return current_user


@router.put("/change-password")
def change_password(
    password_data: schemas.ChangePassword,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change user's password."""
    # Verify old password
    if not hashing.Hash.verify(password_data.old_password, current_user.password):
        raise HTTPException(status_code=400, detail="Incorrect old password")

    # Hash and save new password
    current_user.password = hashing.Hash.encrypt(password_data.new_password)
    db.commit()

    return {"message": "Password changed successfully"}


# ------------------- STORAGE CLEANUP -------------------


def _delete_s3_prefix(s3_client, bucket_name: str, prefix: str):
    """Deletes all objects under a given prefix from an S3 bucket."""
    try:
        paginator = s3_client.get_paginator("list_objects_v2")
        pages = paginator.paginate(Bucket=bucket_name, Prefix=prefix)

        objects_to_delete = [
            {"Key": obj["Key"]} for page in pages for obj in page.get("Contents", [])
        ]

        if not objects_to_delete:
            return

        for i in range(0, len(objects_to_delete), 1000):
            batch = objects_to_delete[i : i + 1000]
            s3_client.delete_objects(Bucket=bucket_name, Delete={"Objects": batch})
        logger.info(f"Deleted prefix '{prefix}' from bucket '{bucket_name}'.")

    except Exception as e:
        logger.error(f"Error deleting prefix '{prefix}' from bucket '{bucket_name}': {e}")


def cleanup_user_storage(user_id: str):
    """Background task to delete all files belonging to a user from primary & sync storage."""
    user_prefix = f"{user_id}/"
    logger.info(f"Starting background storage cleanup for deleted user: {user_id}")

    try:
        primary_client, primary_bucket = StorageService.get_primary_client()
        if primary_client and primary_bucket:
            _delete_s3_prefix(
                s3_client=primary_client,
                bucket_name=primary_bucket,
                prefix=user_prefix,
            )

        sync_client, sync_bucket = StorageService.get_sync_target_client()
        if sync_client and sync_bucket:
            _delete_s3_prefix(
                s3_client=sync_client,
                bucket_name=sync_bucket,
                prefix=user_prefix,
            )
    except Exception as e:
        logger.error(f"Error during storage cleanup for user {user_id}: {e}")


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

        background_tasks.add_task(cleanup_user_storage, user_id=user_id_for_task)

        return {
            "message": "Account deletion initiated. Your data will be erased shortly."
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error deleting account: {str(e)}")
