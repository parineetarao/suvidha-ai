"""
models/account_recovery.py

Two tables behind "I can't get into my account":

AdminPasswordReset — one row per admin "forgot password" request. Stores
only a hash of the 6-digit reset code (same hash_otp scheme as citizen
OTPs). Kept separate from otp_requests on purpose: otp_requests is looked
up by email to LOG A CITIZEN IN, so a reset code stored there for an
admin whose email is also a citizen's would double as a citizen login code.

AccountRecoveryRequest — a citizen who has lost access to every contact on
their account (so no OTP can reach them) asks an admin for help. The admin
verifies their identity offline (e.g. Aadhaar at a CSC) and approves,
which swaps the lost contact for the new one. Nothing changes on the
account until a super admin approves.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, SmallInteger, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AdminPasswordReset(Base):
    __tablename__ = "admin_password_resets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    admin_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("admins.id", ondelete="CASCADE"), index=True
    )
    code_hash: Mapped[str] = mapped_column(String(128))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(SmallInteger, default=0)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RecoveryStatus:
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class AccountRecoveryRequest(Base):
    __tablename__ = "account_recovery_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # The email / mobile the account was registered with (now inaccessible).
    registered_contact: Mapped[str] = mapped_column(String(255))
    # The email / mobile the citizen can receive codes on now.
    new_contact: Mapped[str] = mapped_column(String(255))
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Resolved at submission time. Null when no account has that contact —
    # the citizen is told the same thing either way, so this form can't be
    # used to probe which emails/numbers are registered.
    matched_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(20), default=RecoveryStatus.PENDING, index=True)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("admins.id", ondelete="SET NULL"), nullable=True
    )
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
