"""CLI to create an admin user.

Wired to Member 1's app/models/admin.py (Admin, AdminRole) now that it
exists on main. New admins default to VIEWER — the least-privileged role —
so promoting to SCHEME_EDITOR or SUPER_ADMIN is a deliberate follow-up step
via the admin panel, never a side effect of running this script.
"""

import argparse
import getpass
import sys

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.admin import Admin, AdminRole


def create_admin(email: str, password: str, role: AdminRole = AdminRole.VIEWER) -> None:
    db = SessionLocal()
    try:
        existing = db.query(Admin).filter(Admin.email == email).first()
        if existing:
            print(f"Admin {email} already exists.")
            return

        admin = Admin(email=email, hashed_password=hash_password(password), role=role)
        db.add(admin)
        db.commit()
        print(f"Admin user {email} created with role {role.value}.")
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Create an admin user")
    parser.add_argument("--email", required=True, help="Admin email address")
    args = parser.parse_args()

    password = getpass.getpass("Admin password: ")
    if not password:
        print("Password cannot be empty.", file=sys.stderr)
        sys.exit(1)

    create_admin(args.email, password)


if __name__ == "__main__":
    main()
