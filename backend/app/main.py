import logging
from contextlib import asynccontextmanager
from pathlib import Path
import re
import secrets
import string

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from app.core.config import (
    FRONTEND_URL,
    ADMIN_EMAIL,
    ADMIN_PASSWORD_HASH,
    ADMIN_FORCE_RESET,
)
from app.database import engine, Base, SessionLocal
from app.hashing import Hash
from app.models import User, SystemConfig
from app.routers import (
    files,
    authentication,
    share_files,
    synchronization,
    admin,
)

logger = logging.getLogger(__name__)


def _generate_secure_password(length: int = 20) -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*-_=+"
    while True:
        pwd = "".join(secrets.choice(alphabet) for _ in range(length))
        if (
            any(c.islower() for c in pwd)
            and any(c.isupper() for c in pwd)
            and any(c.isdigit() for c in pwd)
            and any(c in "!@#$%^&*-_=+" for c in pwd)
        ):
            return pwd


def _update_env_file(updates: dict[str, str]) -> None:
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        content = ""
    else:
        content = env_path.read_text(encoding="utf-8")

    for key, value in updates.items():
        pattern = rf"^{re.escape(key)}=.*$"
        replacement = f"{key}={value}"
        if re.search(pattern, content, flags=re.MULTILINE):
            content = re.sub(pattern, replacement, content, flags=re.MULTILINE)
        else:
            if content and not content.endswith("\n"):
                content += "\n"
            content += f"{replacement}\n"

    env_path.write_text(content, encoding="utf-8")


def _init_database_and_admin() -> None:
    Base.metadata.create_all(bind=engine)

    # Safe column migrations for SQLite
    try:
        with engine.connect() as conn:
            inspector = inspect(engine)
            if "users" in inspector.get_table_names():
                cols = [c["name"] for c in inspector.get_columns("users")]
                if "role" not in cols:
                    conn.execute(
                        text("ALTER TABLE users ADD COLUMN role VARCHAR DEFAULT 'user'")
                    )
                    conn.commit()
    except Exception as e:
        logger.warning(f"Schema check notice: {e}")

    # Initialize SystemConfig and Admin Account
    db = SessionLocal()
    try:
        sys_config = db.query(SystemConfig).filter(SystemConfig.id == 1).first()
        if not sys_config:
            sys_config = SystemConfig(
                id=1,
                sync_enabled=True,
                share_target_preference="primary",
            )
            db.add(sys_config)
            db.commit()

        email = ADMIN_EMAIL.strip() if ADMIN_EMAIL else ""
        pwd_hash = ADMIN_PASSWORD_HASH.strip() if ADMIN_PASSWORD_HASH else ""

        if email and pwd_hash:
            user = db.query(User).filter(User.email == email).first()
            if user:
                user.role = "admin"
                if ADMIN_FORCE_RESET:
                    user.password = pwd_hash
                    logger.info(
                        f"Admin password forcefully reset for {email} (ADMIN_FORCE_RESET=true)."
                    )
            else:
                new_admin = User(
                    name="Admin",
                    email=email,
                    password=pwd_hash,
                    role="admin",
                )
                db.add(new_admin)
                logger.info(f"Admin account created from environment: {email}")
            db.commit()
        elif not email or not pwd_hash:
            # Check if an admin exists
            existing_admin = db.query(User).filter(User.role == "admin").first()
            if not existing_admin:
                gen_email = "admin@cloudflow.local"
                gen_pass = _generate_secure_password(20)
                gen_hash = Hash.encrypt(gen_pass)

                new_admin = User(
                    name="Admin",
                    email=gen_email,
                    password=gen_hash,
                    role="admin",
                )
                db.add(new_admin)
                db.commit()

                _update_env_file({
                    "ADMIN_EMAIL": gen_email,
                    "ADMIN_PASSWORD_HASH": gen_hash,
                    "ADMIN_FORCE_RESET": "false",
                })

                print("\n" + "=" * 64)
                print(" [CloudFlow Admin] Initial Admin Account Provisioned")
                print("=" * 64)
                print(f" Admin Email:     {gen_email}")
                print(f" Secure Password: {gen_pass}")
                print(" Saved to backend/.env. Keep these credentials safe.")
                print("=" * 64 + "\n")
    except Exception as exc:
        logger.error(f"Error during admin initialization: {exc}")
        db.rollback()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    _init_database_and_admin()
    yield


app = FastAPI(
    title="CloudFlow API",
    description="S3-compatible Cloud Storage and File Sharing Platform API.",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", include_in_schema=False)
async def root():
    return {"message": "Welcome to CloudFlow API! Go to /docs for interactive documentation."}


app.include_router(files.router)
app.include_router(authentication.router)
app.include_router(share_files.router)
app.include_router(synchronization.router)
app.include_router(admin.router)
