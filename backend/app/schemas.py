from pydantic import BaseModel, Field, ConfigDict
from typing import Dict, Optional


class VersioningConfig(BaseModel):
    enabled: bool


class BucketUpdatePayload(BaseModel):
    versioning: Optional[VersioningConfig] = Field(
        None, description="Enable or suspend bucket versioning."
    )
    tags: Optional[Dict[str, str]] = Field(
        None, description="A dictionary of key-value tags to apply to the bucket."
    )
    policy: Optional[dict] = Field(
        None, description="A valid S3 bucket policy in JSON (as a Python dictionary)."
    )


class Login(BaseModel):
    email: str
    password: str


class User(BaseModel):
    name: str
    email: str
    password: str


class ShowUser(BaseModel):
    id: int
    name: str
    email: str

    model_config = ConfigDict(from_attributes=True)
