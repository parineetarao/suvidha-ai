"""
models/otp.py

OTPRequest: one row per OTP sent. Never stores the plaintext code — only
its hash (via core.security.hash_otp). This table is intentionally
short-lived data: rows are only relevant for ~5 minutes, but we don't
auto-delete them (a cleanup job could purge old rows later) since keeping
history is cheap and can help debug "why didn't my OTP work" support cases.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Index, SmallInteger, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class OTPRequest(Base):
    __tablename__ = "otp_requests"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # Not a foreign key to users.id — deliberately. A mobile number can
    # request an OTP *before* a User row exists (first-time signup). This
    # table has to work for both "new user verifying for the first time"
    # and "existing user logging in again," so it keys off the raw mobile
    # number rather than assuming a User already exists.
    mobile_number: Mapped[str] = mapped_column(String(15))

    # sha256 hex digest is always 64 characters — 128 is generous headroom,
    # matching the column size used for refresh_tokens.token_hash so the
    # two hashed-secret columns are visually/structurally consistent.
    otp_hash: Mapped[str] = mapped_column(String(128))

    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    # SmallInteger (not the default Integer/32-bit) because this value is
    # bounded to 0-5 by application logic (TooManyAttempts triggers at 5) —
    # using a smaller column type costs nothing here and documents the
    # expected range for anyone reading the schema cold.
    attempts: Mapped[int] = mapped_column(SmallInteger, default=0)

    # Once True, this OTP can never be verified again even if it hasn't
    # expired yet — closes the window where a code could be reused if
    # somehow captured after a successful login (defense in depth; the
    # service layer should also delete/ignore it, but the flag makes the
    # "already used" state explicit and queryable).
    consumed: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Composite index on (mobile_number, expires_at): the verify-otp flow's
    # hot-path query is "find the most recent, unexpired OTP request for
    # this mobile number" — this index makes that lookup fast instead of a
    # sequential scan. A single-column index on mobile_number alone would
    # still need to filter/sort on expires_at afterward; the composite index
    # lets Postgres satisfy both conditions from the index itself.
    __table_args__ = (
        Index("ix_otp_requests_mobile_expiry", "mobile_number", "expires_at"),
    )