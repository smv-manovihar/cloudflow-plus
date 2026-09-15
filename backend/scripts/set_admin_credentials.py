"""
Admin Credentials Management & Production Provisioning Script.

Always generates a cryptographically secure random password.

Usage:
  # Generate & set admin credentials:
  python scripts/set_admin_credentials.py [email]

  # Force reset admin password:
  python scripts/set_admin_credentials.py [email] --force-reset

  # Generate production deployment credentials snippet:
  python scripts/set_admin_credentials.py [email] --generate-prod
"""

import argparse
import re
import secrets
import string
import sys
from pathlib import Path

# Add backend directory to sys.path so we can import app modules
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from app.hashing import Hash


def generate_secure_password(length: int = 20) -> str:
    """Generates a cryptographically strong, random password."""
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


def update_env_file(env_path: Path, updates: dict[str, str]) -> None:
    """Updates or appends key-value pairs in the specified .env file."""
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


def sync_database_admin(email: str, password_hash: str) -> bool:
    """Syncs or creates the admin user directly in the database."""
    try:
        from app.database import SessionLocal, Base, engine
        from app.models import User

        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        try:
            admin_user = db.query(User).filter(User.email == email).first()
            if admin_user:
                admin_user.role = "admin"
                admin_user.password = password_hash
            else:
                admin_user = User(
                    name="Admin",
                    email=email,
                    password=password_hash,
                    role="admin",
                )
                db.add(admin_user)
            db.commit()
            return True
        finally:
            db.close()
    except Exception as exc:
        print(f"[Warning] Could not directly update database ({exc}).")
        print("The server will sync the admin credentials on its next startup.")
        return False


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Securely generate and set CloudFlow admin credentials."
    )
    parser.add_argument(
        "email",
        nargs="?",
        default="admin@cloudflow.local",
        help="Admin account email (default: admin@cloudflow.local)",
    )
    parser.add_argument(
        "--password",
        default=None,
        help="Optional custom password (if omitted, a cryptographically strong password is generated)",
    )
    parser.add_argument(
        "--force-reset",
        action="store_true",
        help="Set ADMIN_FORCE_RESET=true to forcefully overwrite DB password on server startup",
    )
    parser.add_argument(
        "--generate-prod",
        action="store_true",
        help="Generate a secure random admin password and hash snippet for production deployment",
    )

    args = parser.parse_args()

    email = args.email.strip() if args.email else "admin@cloudflow.local"
    raw_password = args.password.strip() if args.password else generate_secure_password(20)
    password_hash = Hash.encrypt(raw_password)

    if args.generate_prod:
        print("\n" + "=" * 64)
        print("  CloudFlow Production Admin Credentials")
        print("=" * 64)
        print(f"Admin Email:          {email}")
        print(f"Secure Password:      {raw_password}")
        print("\nCopy and paste these environment variables into your production environment:\n")
        print(f"ADMIN_EMAIL={email}")
        print(f"ADMIN_PASSWORD_HASH={password_hash}")
        print("ADMIN_FORCE_RESET=false")
        print("\n" + "=" * 64 + "\n")
        return

    env_path = BACKEND_DIR / ".env"
    env_updates = {
        "ADMIN_EMAIL": email,
        "ADMIN_PASSWORD_HASH": password_hash,
    }
    if args.force_reset:
        env_updates["ADMIN_FORCE_RESET"] = "true"

    update_env_file(env_path, env_updates)
    db_synced = sync_database_admin(email, password_hash)

    print("\n" + "=" * 64)
    print("  Admin Credentials Successfully Generated & Configured")
    print("=" * 64)
    print(f"Admin Email:          {email}")
    print(f"Secure Password:      {raw_password}")
    print(f"Password Hash:        {password_hash[:20]}...")
    print(f".env File:            Updated ({env_path.name})")
    print(f"Database State:       {'Synced' if db_synced else 'Pending startup'}")
    if args.force_reset:
        print("Force Reset:          ACTIVE (ADMIN_FORCE_RESET=true)")
    print("\nKeep this password secure. You can log into CloudFlow as an administrator.")
    print("=" * 64 + "\n")


if __name__ == "__main__":
    main()
