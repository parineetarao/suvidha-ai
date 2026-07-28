"""
tests/test_auth.py

Tests the auth flow at the services/auth_service.py layer, not through
HTTP — see the explanation above this file for why. Uses monkeypatch to
replace sms_service.send_otp (a real SMS send) and rate_limit.enforce_otp_request_limit
(a real Redis call) with predictable test doubles, so these tests need
neither a real MSG91 account nor a running Redis instance to pass.

ASSUMPTION: `db_session` fixture comes from tests/conftest.py (Member 3's
file) and yields a SQLAlchemy Session against a test database. Rename
below if your actual fixture is called something else.
"""

from datetime import datetime, timedelta, timezone

import pytest

from app.core.exceptions import InvalidCredentials, OTPExpired, TooManyAttempts
from app.core.security import decode_access_token, hash_otp, hash_refresh_token
from app.models.otp import OTPRequest
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.services import auth_service

MOBILE = "9876543210"


@pytest.fixture
def captured_otp(monkeypatch):
    """
    Replaces the real SMS send with one that just remembers the code.
    Any test using this fixture never actually talks to MSG91.
    """
    captured: dict[str, str] = {}

    async def fake_send_otp(mobile_number: str, code: str) -> bool:
        captured["code"] = code
        return True

    monkeypatch.setattr(auth_service.sms_service, "send_otp", fake_send_otp)
    return captured


@pytest.fixture(autouse=True)
def bypass_rate_limit(monkeypatch):
    """
    autouse=True means every test in this file gets this automatically,
    without needing to request it explicitly — appropriate here because
    almost every test calls request_otp() at least once, and none of
    them are actually testing the rate limiter itself (that's
    core/rate_limit.py's own concern, and would need a real or fake Redis
    to test properly — out of scope for this file).
    """

    async def noop(mobile_number: str) -> None:
        return None

    monkeypatch.setattr(auth_service.rate_limit, "enforce_otp_request_limit", noop)


@pytest.mark.asyncio
async def test_request_otp_stores_hash_not_plaintext(db_session, captured_otp):
    """
    The single most important property in this whole file: the OTP is
    NEVER stored in plaintext. We know the real code (captured_otp, since
    our fake SMS send remembers it) but the database row should only ever
    contain its hash.
    """
    request_id, expires_in = await auth_service.request_otp(db_session, MOBILE)

    assert expires_in == 5 * 60
    otp_request = db_session.get(OTPRequest, request_id)
    assert otp_request is not None
    assert otp_request.otp_hash == hash_otp(captured_otp["code"], MOBILE)
    # The literal code should not appear anywhere in the stored hash.
    assert captured_otp["code"] not in otp_request.otp_hash


@pytest.mark.asyncio
async def test_verify_otp_correct_code_creates_user_and_tokens(db_session, captured_otp):
    await auth_service.request_otp(db_session, MOBILE)

    user, access_token, raw_refresh_token = auth_service.verify_otp(
        db_session, MOBILE, captured_otp["code"]
    )

    assert user.mobile_number == MOBILE
    assert user.is_verified is True

    # The access token should decode and point back at this same user —
    # this is what api/deps.py's get_current_user relies on downstream.
    payload = decode_access_token(access_token)
    assert payload["sub"] == str(user.id)
    assert "user" in payload["roles"]

    # The RAW refresh token should never be found in the database — only
    # its hash. If this assertion ever failed, it would mean a stolen DB
    # backup could be used to log in as anyone, defeating the entire
    # point of hashing it.
    stored = db_session.query(RefreshToken).filter_by(user_id=user.id).one()
    assert stored.token_hash == hash_refresh_token(raw_refresh_token)


@pytest.mark.asyncio
async def test_verify_otp_wrong_code_increments_attempts(db_session, captured_otp):
    request_id, _ = await auth_service.request_otp(db_session, MOBILE)

    with pytest.raises(InvalidCredentials):
        auth_service.verify_otp(db_session, MOBILE, "000000")

    otp_request = db_session.get(OTPRequest, request_id)
    assert otp_request.attempts == 1
    # Still unconsumed — a wrong guess shouldn't burn the OTP itself, only
    # count against the attempt limit.
    assert otp_request.consumed is False


@pytest.mark.asyncio
async def test_verify_otp_too_many_wrong_attempts_locks_out(db_session, captured_otp):
    await auth_service.request_otp(db_session, MOBILE)

    for _ in range(5):
        with pytest.raises(InvalidCredentials):
            auth_service.verify_otp(db_session, MOBILE, "000000")

    # The 6th attempt should be rejected as TooManyAttempts, not
    # InvalidCredentials — even if, hypothetically, the correct code were
    # somehow guessed on this attempt, it must still be refused, because
    # the limit has already been reached.
    with pytest.raises(TooManyAttempts):
        auth_service.verify_otp(db_session, MOBILE, captured_otp["code"])


def test_verify_otp_expired_is_rejected(db_session):
    """
    Doesn't use captured_otp/request_otp at all — constructs an expired
    OTPRequest directly, to test the expiry check in isolation without
    needing to wait 5 real minutes for a normally-created one to expire.
    """
    code = "123456"
    expired_request = OTPRequest(
        mobile_number=MOBILE,
        otp_hash=hash_otp(code, MOBILE),
        expires_at=datetime.now(timezone.utc) - timedelta(seconds=1),
    )
    db_session.add(expired_request)
    db_session.commit()

    with pytest.raises(OTPExpired):
        auth_service.verify_otp(db_session, MOBILE, code)


@pytest.mark.asyncio
async def test_refresh_rotates_token_and_invalidates_old_one(db_session, captured_otp):
    await auth_service.request_otp(db_session, MOBILE)
    _, _, old_raw_refresh_token = auth_service.verify_otp(db_session, MOBILE, captured_otp["code"])

    new_access_token, new_raw_refresh_token = auth_service.refresh_access_token(
        db_session, old_raw_refresh_token
    )
    assert new_raw_refresh_token != old_raw_refresh_token

    # This is the direct test of replay-attack prevention: the OLD token,
    # having just been used once, must now be rejected if used again —
    # simulating an attacker replaying a captured (now-stale) token.
    with pytest.raises(InvalidCredentials):
        auth_service.refresh_access_token(db_session, old_raw_refresh_token)

    # But the NEW token from the rotation should still work fine.
    auth_service.refresh_access_token(db_session, new_raw_refresh_token)


@pytest.mark.asyncio
async def test_logout_revokes_refresh_token(db_session, captured_otp):
    await auth_service.request_otp(db_session, MOBILE)
    _, _, raw_refresh_token = auth_service.verify_otp(db_session, MOBILE, captured_otp["code"])

    auth_service.logout(db_session, raw_refresh_token)

    with pytest.raises(InvalidCredentials):
        auth_service.refresh_access_token(db_session, raw_refresh_token)