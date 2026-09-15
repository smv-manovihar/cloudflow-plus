from dotenv import load_dotenv
import os
import secrets

load_dotenv()

# ── App ────────────────────────────────────────────────────────────────────
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
SECRET_KEY = os.getenv("SECRET_KEY", secrets.token_hex(32))
REFRESH_SECRET_KEY = os.getenv("REFRESH_SECRET_KEY", secrets.token_hex(32))

# ── Admin Account ──────────────────────────────────────────────────────────
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "")
ADMIN_PASSWORD_HASH = os.getenv("ADMIN_PASSWORD_HASH", "")
ADMIN_FORCE_RESET = os.getenv("ADMIN_FORCE_RESET", "false").lower() in ("true", "1", "yes")

# ── Database ───────────────────────────────────────────────────────────────
# SQLite for development; set to postgresql://user:pass@host:5432/dbname for production.
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///database/cloudflow.db")

# ── Bootstrap primary storage ──────────────────────────────────────────────
# Storage provider credentials configured at the platform/environment level.
PRIMARY_STORAGE_ENDPOINT = os.getenv("PRIMARY_STORAGE_ENDPOINT", "")
PRIMARY_STORAGE_ACCESS_KEY = os.getenv("PRIMARY_STORAGE_ACCESS_KEY", "")
PRIMARY_STORAGE_SECRET_KEY = os.getenv("PRIMARY_STORAGE_SECRET_KEY", "")
PRIMARY_STORAGE_BUCKET = os.getenv("PRIMARY_STORAGE_BUCKET", "cloud-flow-bucket")
PRIMARY_STORAGE_REGION = os.getenv("PRIMARY_STORAGE_REGION", "us-east-1")

# ── Sync target storage (optional) ────────────────────────────────────────
# If both ACCESS_KEY and BUCKET are set, the sync feature becomes available.
# Operators can configure a secondary S3-compatible destination for sync.
SYNC_TARGET_ENDPOINT = os.getenv("SYNC_TARGET_ENDPOINT", "")
SYNC_TARGET_ACCESS_KEY = os.getenv("SYNC_TARGET_ACCESS_KEY", "")
SYNC_TARGET_SECRET_KEY = os.getenv("SYNC_TARGET_SECRET_KEY", "")
SYNC_TARGET_BUCKET = os.getenv("SYNC_TARGET_BUCKET", "")
SYNC_TARGET_REGION = os.getenv("SYNC_TARGET_REGION", "us-east-1")
