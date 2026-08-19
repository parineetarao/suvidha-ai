"""
api/v1/auth.py

The actual /auth/* HTTP endpoints. Deliberately thin: every route reads
its input, calls one auth_service function, and shapes the response.
No business logic lives here — see services/auth_service.py for that.
"""

from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.config import settings
from app.core.exceptions import InvalidCredentials
from app.models.user import User
from app.schemas.auth import (
    AccessTokenOut,
    OTPRequestIn,
    OTPRequestOut,
    OTPVerifyIn,
    TokenPair,
)
from app.schemas.user import UserOut
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])

# Refresh token cookie is scoped to only the /auth path (not "/") — the
# browser will only ever attach this cookie on requests to /auth/refresh
# or /auth/logout, never on, say, a request to /users/me/profile. This
# shrinks the blast radius: even if some unrelated endpoint on this API
# had an XSS or SSRF issue, the refresh token cookie simply wouldn't be
# present on requests to it.
_REFRESH_COOKIE_NAME = "refresh_token"
_REFRESH_COOKIE_PATH = "/api/v1/auth"


def _set_refresh_cookie(response: Response, raw_refresh_token: str) -> None:
    response.set_cookie(
        key=_REFRESH_COOKIE_NAME,
        value=raw_refresh_token,
        httponly=True,   # JavaScript on the frontend can never read this
        secure=True,      # only ever sent over HTTPS
        samesite="strict",  # never attached to a cross-site request — blocks CSRF on this cookie
        max_age=settings.jwt_refresh_ttl_days * 24 * 60 * 60,
        path=_REFRESH_COOKIE_PATH,
    )


@router.post("/request-otp", response_model=OTPRequestOut)
async def request_otp(payload: OTPRequestIn, db: Annotated[Session, Depends(get_db)]):
    request_id, expires_in = await auth_service.request_otp(db, payload.mobile_number, payload.email)
    return OTPRequestOut(request_id=request_id, expires_in=expires_in)


@router.post("/verify-otp", response_model=TokenPair)
async def verify_otp(payload: OTPVerifyIn, response: Response, db: Annotated[Session, Depends(get_db)]):
    user, access_token, raw_refresh_token = auth_service.verify_otp(
        db, payload.code, payload.mobile_number, payload.email, payload.full_name
    )
    _set_refresh_cookie(response, raw_refresh_token)
    return TokenPair(access_token=access_token, user=UserOut.model_validate(user))


@router.post("/refresh", response_model=AccessTokenOut)
async def refresh(
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    refresh_token: Annotated[str | None, Cookie()] = None,
):
    # Cookie(...) as a parameter default is FastAPI's way of reading a
    # named cookie straight off the incoming request — no manual header
    # parsing needed. If the cookie is missing entirely, refresh_token is
    # None here rather than raising automatically, so we check for that
    # explicitly and raise the same InvalidCredentials a bad/expired token
    # would produce — a missing cookie and an invalid one should look
    # identical to the client.
    if refresh_token is None:
        raise InvalidCredentials("Session expired or invalid. Please log in again.")

    new_access_token, new_raw_refresh_token = auth_service.refresh_access_token(
        db, refresh_token
    )
    _set_refresh_cookie(response, new_raw_refresh_token)
    return AccessTokenOut(access_token=new_access_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    refresh_token: Annotated[str | None, Cookie()] = None,
):
    # current_user is required here (via get_current_user) even though the
    # route body doesn't use it directly — this means logout requires a
    # VALID access token to call at all, not just any request with a
    # refresh cookie attached. Otherwise logout would be an unauthenticated
    # endpoint that reveals whether a given refresh token is currently
    # valid, which is a small but avoidable information leak.
    if refresh_token is not None:
        auth_service.logout(db, refresh_token)

    response.delete_cookie(_REFRESH_COOKIE_NAME, path=_REFRESH_COOKIE_PATH)
    return None