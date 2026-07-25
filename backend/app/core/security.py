"""
core/security.py

Pure cryptographic primitives for the Identity & Access Service.

Deliberately has NO FastAPI imports and NO database calls — this file
should be testable with plain `assert` statements and nothing else.
Exception translation (turning a bad token into an HTTP 401) happens
one layer up, in services/auth_service.py and api/deps.py.
"""

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings

# ---------------------------------------------------------------------------
# Password hashing (admins only — citizens never have a password, they use OTP)
# ---------------------------------------------------------------------------

# CryptContext is passlib's abstraction over hashing schemes. Naming bcrypt
# explicitly (rather than relying on a default) means the choice is visible
# and auditable — you can point at this line in a viva and say "we chose
# bcrypt, cost factor 12, here."
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)


def hash_password(plain_password: str) -> str:
    """Hash an admin's plaintext password for storage. Never store plain_password itself."""
    return _pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Check a login attempt's password against the stored bcrypt hash."""
    return _pwd_context.verify(plain_password, hashed_password)


# ---------------------------------------------------------------------------
# OTP: generation and hashing
# ---------------------------------------------------------------------------

def generate_otp() -> str:
    """
    Generate a 6-digit numeric OTP as a zero-padded string ('004821', not 4821).

    secrets.randbelow(1_000_000) is used instead of `random` because `random`
    is a Mersenne Twister — predictable if an attacker sees enough output.
    `secrets` is the stdlib's CSPRNG-backed module, built for exactly this.
    """
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_otp(code: str, mobile_number: str) -> str:
    """
    Hash an OTP for storage: sha256(code + mobile_number + pepper).

    Why SHA-256 and not bcrypt here, when we used bcrypt for admin passwords?
    Two reasons, and this is a strong viva answer:

    1. Entropy. A 6-digit OTP has only 1,000,000 possible values — bcrypt's
       expensive, slow-by-design hashing exists to make offline brute-forcing
       a *human-chosen, high-entropy* password expensive. An OTP's security
       doesn't come from the hash being slow to crack; it comes from (a) rate
       limiting attempts, and (b) a 5-minute expiry. Bcrypt would just make
       every legitimate verify-otp request slower for no security benefit.
    2. We *want* OTP verification to be fast, because rate limiting already
       caps an attacker at 5 guesses per OTP (see core/rate_limit.py) — the
       bottleneck is the rate limiter, not hash cost.

    The pepper is what makes this safe despite using a fast hash: it's a
    secret string stored only in server config (OTP_PEPPER env var), never
    in the database. Even if the otp_requests table leaks entirely, an
    attacker without the pepper cannot brute-force which 6-digit code
    produced a given hash, because they're missing part of the input.

    mobile_number is included so the same code for two different users
    hashes differently — prevents a rainbow-table-style shortcut across
    the whole user base.
    """
    raw = f"{code}{mobile_number}{settings.OTP_PEPPER}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# JWT access tokens
# ---------------------------------------------------------------------------

def create_access_token(user_id: str, roles: list[str] | None = None) -> str:
    """
    Issue a short-lived JWT access token.

    Claims included, and why each one is there:
      - sub (subject): the user's UUID as a string. Standard JWT claim name;
        anything reading this token knows to look at "sub" for identity.
      - roles: e.g. ["user"] or ["admin", "scheme_editor"]. Lets api/deps.py
        do role checks (get_current_admin) without a DB round-trip.
      - iat (issued at): when the token was minted. Useful for debugging and
        for invalidating all tokens issued before a certain time if needed.
      - exp (expiry): enforced automatically by jose.jwt.decode. This is what
        makes the token "short-lived" — 15 minutes, from settings.
      - jti (JWT ID): a random UUID unique to this token. Doesn't do anything
        on its own, but it's what would let you build a token-blocklist
        later (store revoked jti values in Redis) without redesigning the
        token format. Cheap to add now, expensive to retrofit later.
    """
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.JWT_ACCESS_TTL_MIN)

    claims = {
        "sub": user_id,
        "roles": roles or ["user"],
        "iat": now,
        "exp": expire,
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(claims, settings.JWT_SECRET, algorithm="HS256")


def decode_access_token(token: str) -> dict:
    """
    Verify and decode a JWT access token. Returns the claims dict on success.

    Raises jose.JWTError (or a subclass, e.g. ExpiredSignatureError) on any
    failure — bad signature, expired, malformed. We deliberately let this
    exception propagate rather than catching it here: it's api/deps.py's job
    to catch JWTError and turn it into an HTTP 401 (via core/exceptions.py),
    keeping this module free of HTTP concerns.
    """
    return jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])


# ---------------------------------------------------------------------------
# Refresh tokens — opaque random strings, NOT JWTs
# ---------------------------------------------------------------------------

def generate_refresh_token() -> str:
    """
    Generate a 256-bit random opaque token (not a JWT).

    Why opaque instead of another JWT? Because a refresh token needs to be
    revocable — if a user logs out, or a token is stolen, we need to be able
    to kill it immediately. A JWT is self-contained and stateless by design,
    so a "revoked" JWT is still cryptographically valid until it expires; you'd
    need a blocklist to stop it, which defeats the point of using a stateless
    token in the first place. An opaque random string has no meaning on its
    own — its validity is looked up in the refresh_tokens table on every use,
    so revocation is just flipping revoked_at in the database. That lookup
    cost is fine here because refresh happens far less often than access-token
    use (once per 15-minute cycle, not once per API call).

    token_urlsafe(32) generates 32 random bytes (256 bits) and encodes them
    as a URL-safe base64 string (~43 characters) — safe to put directly in a
    cookie value with no escaping needed.
    """
    return secrets.token_urlsafe(32)


def hash_refresh_token(token: str) -> str:
    """
    Hash a refresh token for storage, same rationale as OTP hashing: we never
    store the raw token, only its hash, so a stolen database backup alone
    isn't enough to impersonate a logged-in user — the attacker would need
    the actual cookie value too. No pepper needed here (unlike the OTP) since
    a refresh token already has 256 bits of entropy; a pepper adds defense
    against a *low-entropy* secret, which isn't the situation here.
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()