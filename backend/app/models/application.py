"""
app/models/application.py

Application: one row per (user, scheme) application attempt.
ApplicationStatusHistory: append-only audit trail of every status change.

Owned by: Member 3 — Application lifecycle.
"""

from app.db.base import Base
import uuid
from datetime import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey, UniqueConstraint, BigInteger
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

# The six states of the application state machine, defined once here and
# imported into schemas/application.py (for request/response validation)
# and services/application_service.py (for the transition graph) — one
# source of truth, same pattern as models/scheme.py's SUPPORTED_LANGUAGES.
APPLICATION_STATUSES: tuple[str, ...] = (
    "draft",
    "docs_pending",
    "letter_generated",
    "submitted",
    "under_review",
    "approved",
    "rejected",
)

class Application(Base):
    __tablename__ = "applications"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    scheme_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("schemes.id", ondelete="CASCADE"), nullable=False)

    # Plain String, not a Postgres ENUM type (contrast with Admin.role). The
    # state machine (draft -> docs_pending -> letter_generated -> submitted
    # -> under_review -> approved | rejected) is still being iterated on in
    # application_service.py — a DB enum would need an Alembic migration to
    # ALTER TYPE every time a status is added or renamed. Validity is
    # enforced in the service layer, not the schema.
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="draft")
    reference_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # One application per user per scheme — re-applying to the same scheme
    # re-uses this row (advanced back through the state machine) rather than
    # creating a duplicate. Keeps "has this user already applied?" a single
    # unique-index lookup instead of a query needing MAX(created_at).
    __table_args__ = (UniqueConstraint("user_id", "scheme_id"),)

class ApplicationStatusHistory(Base):
    __tablename__ = "application_status_history"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    application_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("applications.id", ondelete="CASCADE"))
    old_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    new_status: Mapped[str] = mapped_column(String(30), nullable=False)
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # No ForeignKey — a transition can be made by the citizen (users.id), a
    # CSC operator/admin (admins.id), or the system itself (letter generation
    # auto-advancing draft -> letter_generated), so this is deliberately an
    # untyped actor reference rather than a single-table FK. Nullable for the
    # system-initiated case. Mirrors the actor_type/actor_id pattern already
    # used in Member 1's audit_logs table.
    changed_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)