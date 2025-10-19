from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    Boolean,
    ForeignKey,
    BigInteger,
)
from sqlalchemy.orm import relationship
from app.database import Base
import uuid
from datetime import datetime, timezone


class SharedLink(Base):
    __tablename__ = "shared_links"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    name = Column(String, nullable=False)
    bucket = Column(String, nullable=False)
    object_key = Column(String, nullable=False)
    size_bytes = Column(BigInteger, nullable=True)
    password = Column(String)
    enabled = Column(Boolean, nullable=False)
    qr_code = Column(String)
    updated_at = Column(DateTime(timezone=True), default=datetime.now(timezone.utc))
    created_at = Column(DateTime(timezone=True), default=datetime.now(timezone.utc))
    expires_at = Column(DateTime(timezone=True))
    user = relationship("User", back_populates="shared_links")

    def __repr__(self):
        return f"<SharedLink {self.id}>"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, nullable=False)
    password = Column(String, nullable=False)
    shared_links = relationship("SharedLink", back_populates="user")

    def __repr__(self):
        return f"<User {self.id}>"
