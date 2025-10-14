from datetime import datetime, timedelta, timezone
import jwt
from jwt import PyJWTError

from pydantic import BaseModel
from fastapi import Request, HTTPException, status, Depends, Security
from fastapi.security import OAuth2PasswordBearer, APIKeyCookie
from sqlalchemy.orm import Session
from typing import Optional

from . import database, models

SECRET_KEY = "super-secret-key-please-change"  # Use .env in production!
REFRESH_SECRET_KEY = "another-super-secret-key"  # Keep different from access
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 7


class TokenPayload(BaseModel):
    sub: str
    exp: datetime


get_db = database.get_db

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token", auto_error=False)
access_token_cookie_scheme = APIKeyCookie(name="access_token", auto_error=False)


# Create access token (short-lived)
def create_access_token(subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {"sub": subject, "exp": expire}
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


# Create refresh token (longer-lived)
def create_refresh_token(subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode = {"sub": subject, "exp": expire}
    return jwt.encode(to_encode, REFRESH_SECRET_KEY, algorithm=ALGORITHM)


# Verify token (either access or refresh)
def verify_token(token: str, is_refresh: bool = False) -> TokenPayload:
    key = REFRESH_SECRET_KEY if is_refresh else SECRET_KEY
    try:
        payload = jwt.decode(token, key, algorithms=[ALGORITHM])
        return TokenPayload(**payload)
    except PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is invalid or expired",
        )


def extract_token(request: Request) -> Optional[str]:
    # Try Authorization header first
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header.split(" ")[1]

    # Fallback to cookie
    return request.cookies.get("access_token")


def get_current_user(
    # Use Security so OpenAPI marks operations as protected (shows lock icon)
    token_str: Optional[str] = Security(oauth2_scheme),
    cookie_token: Optional[str] = Security(access_token_cookie_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    token: Optional[str] = None

    # Prefer OAuth2 bearer token if provided via Authorization header
    if token_str:
        token = token_str
    elif cookie_token:
        token = cookie_token

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated. No token provided.",
        )

    payload = verify_token(token)
    user = db.query(models.User).filter(models.User.email == payload.sub).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return user
