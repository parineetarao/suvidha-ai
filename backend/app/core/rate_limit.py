"""
core/rate_limit.py

Redis-backed rate limiting, replacing the interim DB-count check that was
in services/auth_service.py's _enforce_request_rate_limit(). Only the OTP
*request* limit (3 per mobile per 10 min) lives here — the OTP *verify*
attempt limit (5 wrong guesses per OTP) doesn't need Redis at all, because
it's naturally scoped to a single OTPRequest row already sitting in
Postgres (its `attempts` column) — there's no concurrency race to worry
about there the way there is for "how many OTPs has this number requested
recently across possibly-simultaneous requests."
"""

import redis.asyncio as redis

from app.config import settings
from app.core.exceptions import TooManyAttempts

OTP_REQUEST_LIMIT = 3
OTP_REQUEST_WINDOW_SECONDS = 10 * 60

# Module-level singleton, created once and reused across every request —
# creating a new Redis connection per request would be wasteful; the
# redis-py client is designed to be created once and shared, internally
# managing a connection pool.
_redis_client: redis.Redis | None = None


def _get_redis() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        # decode_responses=True means values come back as Python str
        # instead of bytes — otherwise every read would need a manual
        # .decode("utf-8"), which is easy to forget in exactly one place
        # and get a confusing bytes-vs-str bug later.
        _redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis_client


async def enforce_otp_request_limit(mobile_number: str) -> None:
    """
    Raises TooManyAttempts if this mobile number has requested more than
    OTP_REQUEST_LIMIT OTPs within the current OTP_REQUEST_WINDOW_SECONDS
    window. Call this at the very start of auth_service.request_otp(),
    before generating or storing anything.
    """
    r = _get_redis()
    key = f"otp_request_limit:{mobile_number}"

    # INCR is atomic: even if two requests for this mobile_number hit this
    # line at literally the same instant, Redis guarantees each gets a
    # distinct, correctly-ordered result (e.g. one gets 3, the other gets
    # 4) — never both reading "2" and both proceeding, which is exactly
    # the race condition the old DB-count version was exposed to.
    count = await r.incr(key)

    if count == 1:
        # Only set the expiry on the FIRST request in a new window — if we
        # called EXPIRE on every increment, a steady trickle of requests
        # just under the limit could keep pushing the expiry forward
        # forever, and the window would never actually reset.
        await r.expire(key, OTP_REQUEST_WINDOW_SECONDS)

    if count > OTP_REQUEST_LIMIT:
        ttl_seconds = await r.ttl(key)
        raise TooManyAttempts(
            f"Too many OTP requests for this number. Try again in {ttl_seconds} seconds."
        )