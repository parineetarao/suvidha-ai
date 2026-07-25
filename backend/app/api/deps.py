"""
api/deps.py

Shared FastAPI dependencies, used via Depends(...) across every route file.
This is where JWT verification actually gets enforced on protected routes.
"""

from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.exceptions import InsufficientRole, TokenExpired
from app.core.security import decode_access_token
from app.db.session import SessionLocal
from app.models.admin import Admin
from app.models.user import User

# HTTPBearer (not OAuth2PasswordBearer) because we're not doing the
# OAuth2 "username + password form" login flow anywhere — OTP verification
# doesn't fit that shape. HTTPBearer just means "expect an
# `Authorization: Bearer <token>` header," which is exactly what we're
# sending. Using OAuth2PasswordBearer here would be borrowing a scheme
# built for a login flow this project doesn't have, purely for the
# cosmetic benefit of FastAPI's auto-generated "Authorize" button in
# /docs looking slightly different — not worth the mismatch.
_bearer_scheme = HTTPBearer()


def get_db():
    """
    Yields one DB session per request, closes it afterward no matter what.

    The yield (not return) is what makes this a "generator dependency" —
    FastAPI runs everything before the yield, hands your route the
    session, runs your route, then comes BACK to this function and runs
    everything after the yield. The try/finally guarantees db.close()
    happens even if your route raises an exception halfway through —
    without this, a failed request could leak a database connection that
    never gets returned to the pool.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(_bearer_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    """
    Decodes the access token from the Authorization header and returns the
    matching User. Any route that declares `user: User = Depends(get_current_user)`
    is now a protected route — FastAPI won't even call the route body if
    this raises.
    """
    try:
        payload = decode_access_token(credentials.credentials)
    except JWTError as exc:
        # Every possible token failure (expired, bad signature, malformed)
        # collapses into the same TokenExpired response. Not distinguishing
        # WHY the token is invalid to the client is deliberate — "expired"
        # vs "tampered with" vs "malformed" all get the same generic
        # "log in again" message, so a client probing your API can't learn
        # anything about which failure mode it hit.
        raise TokenExpired() from exc

    user_id = payload.get("sub")
    user = db.get(User, user_id)
    if user is None:
        # The token is cryptographically valid but the user it points to
        # doesn't exist anymore — e.g. deleted between token issuance and
        # this request. Same response as an expired token: the client's
        # correct next step is identical either way (log in again).
        raise TokenExpired()

    return user


def get_current_admin(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(_bearer_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> Admin:
    """
    Same shape as get_current_user, but for the admin panel — checks that
    the token's roles claim actually includes "admin" before even looking
    the admin up, and returns a 403 (not 401) if a valid, logged-in-as-a-
    regular-user token tries to hit an admin route. That distinction
    matters: 401 means "we don't know who you are," 403 means "we know
    exactly who you are, and you're not allowed here" — a citizen's own
    valid token hitting GET /admin/users should be the latter.
    """
    try:
        payload = decode_access_token(credentials.credentials)
    except JWTError as exc:
        raise TokenExpired() from exc

    roles = payload.get("roles", [])
    if "admin" not in roles:
        raise InsufficientRole()

    admin_id = payload.get("sub")
    admin = db.get(Admin, admin_id)
    if admin is None or not admin.is_active:
        raise InsufficientRole()

    return admin