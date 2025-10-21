import uuid
from typing import Union, Optional
from datetime import datetime, timezone
from fastapi import HTTPException


def to_utc_iso(dt: datetime) -> str:
    """
    Convert datetime to UTC ISO 8601 format with 'Z' suffix.

    Args:
        dt: datetime object (can be timezone-aware or naive)

    Returns:
        ISO 8601 string with 'Z' suffix (e.g., '2025-10-20T18:39:00Z')
    """
    if dt is None:
        return None

    # If datetime is naive, assume it's UTC
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)

    # Convert to UTC if it's in a different timezone
    dt_utc = dt.astimezone(timezone.utc)

    # Format as ISO string and replace +00:00 with Z
    return dt_utc.isoformat().replace("+00:00", "Z")


def validate_uuid(user_id: Union[str, int]) -> None:
    """
    Validate that the provided user_id is a valid UUID.

    Args:
        user_id: The user ID to validate.

    Raises:
        HTTPException: If the user_id is not a valid UUID.
    """
    try:
        if isinstance(user_id, int):
            user_id = str(user_id)
        uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid user ID format: must be a valid UUID",
        )


def relative_name(key: str, user_prefix: str, prefix: Optional[str] = None) -> str:
    """
    Compute the relative path for a key, preserving slashes for folders.

    Args:
        key: The full S3 key or prefix.
        user_prefix: The user-specific prefix (e.g., 'user_id/').
        prefix: Optional prefix filter (e.g., 'folder/').

    Returns:
        The relative path with trailing slash for folders.
    """
    base = user_prefix
    if prefix:
        base += prefix
    if base and key.startswith(base):
        relative = key[len(base) :]
        if key.endswith("/"):
            return relative
        return relative.rstrip("/")
    return key.rstrip("/") if key.endswith("/") else key
