"""
services/auth_service.py

Orchestrates the full OTP-to-JWT flow. This file is the answer to most of
your viva questions in one place:

  - How does OTP verification work end-to-end?   -> verify_otp()
  - Where is the OTP stored, plaintext or hashed? -> request_otp(), using
    core.security.hash_otp() — never plaintext, see that docstring.
  - What if someone brute-forces OTPs?            -> the attempts counter
    check inside verify_otp().
  - Why access token AND refresh token?           -> see TokenPair's
    docstring in schemas/auth.py, and refresh_access_token() below.
  - How do you prevent refresh token replay?       -> refresh_access_token()
    rotates the token on every use.
  - What happens if MSG91 is down?                 -> request_otp()'s
    try/except around sms_service.send_otp().

Route handlers (api/v1/auth.py, step 6) should call these functions and do
almost nothing else — no business logic in the routes themselves.
"""

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import (
    InvalidCredentials,
    OTPDeliveryFailed,
    OTPExpired,
    TooManyAttempts,
)
from app.core.security import (
    create_access_token,
    generate_otp,
    generate_refresh_token,
    hash_otp,
    hash_refresh_token,
)
from app.models.otp import OTPRequest
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.core import rate_limit
from app.services import sms_service
from app.config import settings

from app.core.exceptions import AccountAlreadyExists, AccountNotFound  # add to existing import line


OTP_TTL_MINUTES = 5
OTP_VERIFY_ATTEMPT_LIMIT = 5   # max wrong guesses against one OTP — enforced here since it's
                                # scoped to a single OTPRequest row, not shared state across
                                # requests. Compare to OTP_REQUEST_LIMIT, which now lives in
                                # core/rate_limit.py since IT needs Redis's atomicity.


from app.services import email_service


async def request_otp(
    db: Session,
    mobile_number: str | None = None,
    email: str | None = None,
    mode: str | None = None,
) -> tuple[uuid.UUID, int]:
    identifier = mobile_number or email
    await rate_limit.enforce_otp_request_limit(identifier)

    # mode distinguishes /login from /register at the request-otp step —
    # both ultimately call the same verify_otp() underneath (OTP auth
    # doesn't need a separate signup flow), but the two pages want
    # different UX: login should refuse to send a code to an email that
    # was never registered, and register should refuse to re-create an
    # account that already exists. mode is optional (None) so any older
    # or third-party caller that doesn't pass it keeps the original
    # unified behavior.
    if mode in ("login", "register"):
        user_filter = User.mobile_number == mobile_number if mobile_number else User.email == email
        existing_user = db.scalar(select(User).where(user_filter))
        if mode == "login" and existing_user is None:
            raise AccountNotFound()
        if mode == "register" and existing_user is not None:
            raise AccountAlreadyExists()

    return await _send_new_otp(db, mobile_number, email, purpose="login")


async def _send_new_otp(
    db: Session, mobile_number: str | None, email: str | None, purpose: str
) -> tuple[uuid.UUID, int]:
    code = generate_otp()
    otp_hash = hash_otp(code, mobile_number or email)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=OTP_TTL_MINUTES)

    otp_request = OTPRequest(
        mobile_number=mobile_number,
        email=email,
        otp_hash=otp_hash,
        expires_at=expires_at,
        purpose=purpose,
    )
    db.add(otp_request)
    db.flush()

    try:
        if email:
            await email_service.send_otp_email(email, code)
        else:
            await sms_service.send_otp(mobile_number, code)
    except (sms_service.SMSDeliveryError, email_service.EmailDeliveryError) as exc:
        db.rollback()
        raise OTPDeliveryFailed() from exc

    db.commit()
    db.refresh(otp_request)
    return otp_request.id, OTP_TTL_MINUTES * 60


def verify_otp(
    db: Session,
    code: str,
    mobile_number: str | None = None,
    email: str | None = None,
    full_name: str | None = None,
) -> tuple[User, str, str]:
    _consume_otp(db, code, mobile_number, email, purpose="login")

    user_filter = User.mobile_number == mobile_number if mobile_number else User.email == email
    user = db.scalar(select(User).where(user_filter))
    if user is None:
        # New account — full_name only applies here, at creation.
        # Ignored on an existing user's login to avoid a login accidentally
        # overwriting a name the user already set via their profile.
        user = User(mobile_number=mobile_number, email=email, full_name=full_name, is_verified=True)
        db.add(user)
        db.flush()

    user.last_login_at = datetime.now(timezone.utc)
    access_token = create_access_token(str(user.id), roles=["user"])
    raw_refresh_token = _issue_refresh_token(db, user.id)

    db.commit()
    db.refresh(user)
    return user, access_token, raw_refresh_token

def _consume_otp(
    db: Session, code: str, mobile_number: str | None, email: str | None, purpose: str
) -> None:
    """Checks `code` against the newest unconsumed OTP of this purpose for
    this identifier and marks it consumed. Raises on every failure mode;
    a wrong guess is counted (and committed) before raising."""
    identifier = mobile_number or email
    filter_col = OTPRequest.mobile_number if mobile_number else OTPRequest.email

    otp_request = db.scalar(
        select(OTPRequest)
        .where(
            filter_col == identifier,
            OTPRequest.consumed == False,  # noqa: E712
            OTPRequest.purpose == purpose,
        )
        .order_by(OTPRequest.created_at.desc())
    )

    if otp_request is None:
        raise InvalidCredentials()
    if otp_request.expires_at < datetime.now(timezone.utc):
        raise OTPExpired()
    if otp_request.attempts >= OTP_VERIFY_ATTEMPT_LIMIT:
        raise TooManyAttempts("Too many incorrect attempts for this OTP. Please request a new one.")

    submitted_hash = hash_otp(code, identifier)
    if submitted_hash != otp_request.otp_hash:
        otp_request.attempts += 1
        db.commit()
        raise InvalidCredentials()

    otp_request.consumed = True


# --- Backup contact (account recovery, self-service) ---
#
# A citizen's account is reachable only through the contacts on it, and
# signup records just one. Linking a second, verified contact (mobile if
# they signed up by email, or vice versa) is what lets them log in again
# if they lose the first one — verify_otp() already finds a user by
# either column.

def _contact_owner(db: Session, mobile_number: str | None, email: str | None) -> User | None:
    user_filter = User.mobile_number == mobile_number if mobile_number else User.email == email
    return db.scalar(select(User).where(user_filter))


async def request_contact_otp(
    db: Session, user: User, mobile_number: str | None = None, email: str | None = None
) -> tuple[uuid.UUID, int]:
    await rate_limit.enforce_otp_request_limit(mobile_number or email)
    owner = _contact_owner(db, mobile_number, email)
    if owner is not None:
        if owner.id == user.id:
            raise AccountAlreadyExists("This contact is already on your account.")
        raise AccountAlreadyExists("This contact is already used by another account.")
    return await _send_new_otp(db, mobile_number, email, purpose="link_contact")


def verify_contact_otp(
    db: Session, user: User, code: str, mobile_number: str | None = None, email: str | None = None
) -> User:
    _consume_otp(db, code, mobile_number, email, purpose="link_contact")
    # Re-checked after the code: another account could have claimed this
    # contact during the 5-minute window.
    if _contact_owner(db, mobile_number, email) is not None:
        db.rollback()
        raise AccountAlreadyExists("This contact is already used by another account.")
    if mobile_number:
        user.mobile_number = mobile_number
    else:
        user.email = email
    db.commit()
    db.refresh(user)
    return user


def revoke_all_refresh_tokens(db: Session, user_id: uuid.UUID) -> None:
    """Signs a user out everywhere — used when an admin moves their account
    to a new contact, so whoever holds the old device/email loses access."""
    now = datetime.now(timezone.utc)
    for token in db.scalars(
        select(RefreshToken).where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
    ):
        token.revoked_at = now


def refresh_access_token(db: Session, raw_refresh_token: str) -> tuple[str, str]:
    """
    Exchange a valid refresh token for a new access token — AND a new
    refresh token, replacing the old one. This rotation is what answers
    "how do you prevent replay attacks on the refresh token": every use
    invalidates itself. If an attacker ever captures a refresh token
    cookie and uses it, the legitimate user's NEXT refresh attempt (using
    the now-revoked old token) will fail — which is a signal something is
    wrong, rather than both the attacker and the real user silently
    sharing one long-lived token indefinitely.

    Returns (new_access_token, new_raw_refresh_token).
    """
    token_hash = hash_refresh_token(raw_refresh_token)
    stored = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))

    if stored is None or stored.revoked_at is not None or stored.expires_at < datetime.now(timezone.utc):
        raise InvalidCredentials("Session expired or invalid. Please log in again.")

    # Revoke the token that was just used...
    stored.revoked_at = datetime.now(timezone.utc)

    # ...and issue a fresh one in its place, tied to the same user.
    new_raw_refresh_token = _issue_refresh_token(db, stored.user_id)
    new_access_token = create_access_token(str(stored.user_id), roles=["user"])

    db.commit()
    return new_access_token, new_raw_refresh_token


def logout(db: Session, raw_refresh_token: str) -> None:
    """Revoke a refresh token so it can never be used again, even if unexpired."""
    token_hash = hash_refresh_token(raw_refresh_token)
    stored = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    if stored is not None and stored.revoked_at is None:
        stored.revoked_at = datetime.now(timezone.utc)
        db.commit()
    # If the token doesn't exist or is already revoked, logout is still a
    # no-op success from the client's point of view — there's no
    # information-leaking difference in behavior for an attacker to probe.


def _issue_refresh_token(db: Session, user_id: uuid.UUID) -> str:
    """Shared by verify_otp() and refresh_access_token() — same creation logic either way."""
    raw_token = generate_refresh_token()
    refresh_token = RefreshToken(
        user_id=user_id,
        token_hash=hash_refresh_token(raw_token),
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_ttl_days),
    )
    db.add(refresh_token)
    return raw_token