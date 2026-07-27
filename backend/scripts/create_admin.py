"""CLI to create an admin user.

Uses Member 1's Admin model (app/models/admin.py) — a separate table
from citizens' User model, since admins authenticate with email+password
via bcrypt, not OTP. See models/admin.py's own docstring for why these
are kept as two distinct tables rather than a User with an is_admin flag.
"""
import argparse
import getpass
import sys

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.admin import Admin, AdminRole

# Import app.db.base FIRST, before any specific model class — this forces
# every model to finish registering on Base.metadata as a complete,
# self-contained step, so the later `from app.models.admin import Admin`
# below finds an already-fully-loaded module instead of one still mid-
# import. See db/base.py's docstring, and Member 2's note about hitting
# this same circular import on their own model.
import app.db.base  # noqa: F401


def create_admin(email: str, password: str, role: str = "super_admin") -> None:
    db = SessionLocal()
    try:
        existing = db.query(Admin).filter(Admin.email == email).first()
        if existing:
            print(f"Admin {email} already exists.")
            return

        admin = Admin(
            email=email,
            hashed_password=hash_password(password),
            role=AdminRole(role),
            is_active=True,
        )
        db.add(admin)
        db.commit()
        print(f"Admin {email} created with role '{role}'.")
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Create an admin user")
    parser.add_argument("--email", required=True, help="Admin email address")
    parser.add_argument(
        "--role",
        default="super_admin",
        choices=["super_admin", "scheme_editor", "viewer"],
        help="Admin role (default: super_admin)",
    )
    args = parser.parse_args()

    password = getpass.getpass("Admin password: ")
    if not password:
        print("Password cannot be empty.", file=sys.stderr)
        sys.exit(1)

    create_admin(args.email, password, args.role)


if __name__ == "__main__":
    main()