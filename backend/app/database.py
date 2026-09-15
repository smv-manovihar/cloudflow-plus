from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import os

from app.core.config import DATABASE_URL

# Ensure SQLite directory exists when using the default dev DB
if DATABASE_URL.startswith("sqlite"):
    db_path = DATABASE_URL.replace("sqlite:///", "")
    db_dir = os.path.dirname(db_path)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)

_is_sqlite = DATABASE_URL.startswith("sqlite")

_connect_args = {"check_same_thread": False} if _is_sqlite else {}

# PostgreSQL gets connection pooling tuned for async load; SQLite keeps defaults
_pool_kwargs = (
    {}
    if _is_sqlite
    else {
        "pool_size": 10,
        "max_overflow": 20,
        "pool_pre_ping": True,
    }
)

engine = create_engine(DATABASE_URL, connect_args=_connect_args, **_pool_kwargs)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
