"""CLI to create an admin user.

BLOCKED on Member 1's app/models/user.py — the User model (email,
hashed_password, is_admin, or whatever shape Member 1 lands on) doesn't
exist yet. Everything up to the actual row insert is wired below; once
the model exists, replace the TODO block in create_admin() with the real
User(...) construction and password hashing call.
"""

import argparse
import getpass
import sys

from app.db.session import SessionLocal


def create_admin(email: str, password: str) -> None:
    db = SessionLocal()
    try:
        # TODO(blocked on Member 1's app/models/user.py):
        # from app.models.user import User
        # from app.core.security import hash_password
        #
        # existing = db.query(User).filter(User.email == email).first()
        # if existing:
        #     print(f"User {email} already exists.")
        #     return
        # admin = User(email=email, hashed_password=hash_password(password), is_admin=True)
        # db.add(admin)
        # db.commit()
        # print(f"Admin user {email} created.")
        raise NotImplementedError(
            "Blocked on Member 1's User model (app/models/user.py) — "
            "see the TODO in create_admin() for what to wire up."
        )
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
