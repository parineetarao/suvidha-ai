"""CLI to mint a long-lived dev access token for an existing citizen user.

TEMP scaffolding, same category as create_admin.py: Simple Mode has no
real login/guest-session flow yet, so the frontend falls back to a
hardcoded NEXT_PUBLIC_TEMP_JWT (see frontend/lib/api-client.ts) for every
/voice/transcribe call. A token minted with the normal 15-min access TTL
and then committed as a static .env.local value goes stale almost
immediately — this is what caused the false "your session expired" toast
during voice testing (the token really was expired, but the end user
never had a session to begin with). This script re-mints that fallback
token with a longer, explicit TTL so it survives more than one dev
session. Delete this script once Simple Mode gets a real guest-session
or the frontend gets real login wired in before every test run.
"""
import argparse

from app.config import settings
from app.core.security import create_access_token
from app.db.session import SessionLocal
from app.models.user import User

import app.db.base  # noqa: F401


def mint(user_id: str, ttl_days: int) -> str:
    db = SessionLocal()
    try:
        user = db.get(User, user_id)
        if user is None:
            raise SystemExit(f"No user with id {user_id} — check `mobile_number` in the users table.")
    finally:
        db.close()

    settings.jwt_access_ttl_min = ttl_days * 24 * 60
    return create_access_token(user_id, roles=["user"])


def main() -> None:
    parser = argparse.ArgumentParser(description="Mint a long-lived dev access token")
    parser.add_argument("--user-id", required=True, help="Existing user's UUID (see users table)")
    parser.add_argument("--ttl-days", type=int, default=7, help="Token lifetime in days (default: 7)")
    args = parser.parse_args()

    token = mint(args.user_id, args.ttl_days)
    print(token)
    print(f"\nPaste into frontend/.env.local as NEXT_PUBLIC_TEMP_JWT, then restart `next dev`.")


if __name__ == "__main__":
    main()
