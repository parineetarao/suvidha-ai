"""
models/refresh_token.py

RefreshToken: one row per issued refresh token. Storing these (rather than
trusting a stateless token, as we do for access tokens) is what makes
logout and revocation actually work — see the rationale in
core/security.py's generate_refresh_token() docstring.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )

    # Same hashing rationale as otp_requests.otp_hash: if this table leaks,
    # the raw tokens (which are what's actually sent in the httpOnly cookie)
    # aren't recoverable from the hash, so a database leak alone doesn't let
    # an attacker impersonate logged-in users.
    token_hash: Mapped[str] = mapped_column(String(128), unique=True, index=True)

    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    # NULL means "still valid." Setting revoked_at (rather than deleting the
    # row) on logout preserves a record that this token existed and was
    # explicitly revoked — useful if you ever need to answer "was this
    # token stolen and revoked, or did it just expire naturally," and it's
    # a pattern you can point to as intentional audit-friendliness in viva.
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )