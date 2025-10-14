from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base
import uuid


class SharedLink(Base):
    __tablename__ = "shared_links"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    bucket = Column(String, nullable=False)
    object_key = Column(String, nullable=False)
    password = Column(String)
    expires_at = Column(DateTime(timezone=True))
    enabled = Column(Boolean, nullable=False)
    qr_code = Column(String)
    user_id = Column(Integer, ForeignKey("users.id"))
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
