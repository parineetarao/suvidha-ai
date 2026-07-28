"""
models/audit.py

AuditLog: append-only record of every admin action, written by
services/audit_service.py. This is one of your strongest viva talking
points — "how do you prevent/detect admin abuse of citizen data" has a
direct answer: every admin action is logged with who, what, on what, and
from where.
"""

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, String, func
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    # BIGSERIAL / BigInteger autoincrement (not UUID) here, unlike every
    # other model in this schema. Audit logs are never looked up by external
    # clients, never appear in a URL or a JWT, and are pure internal
    # bookkeeping — a sequential ID actually helps here (cheap, naturally
    # orders by insertion time as a tiebreaker alongside created_at, smaller
    # index than UUID at high row counts, which matters since this table
    # grows on every single admin action).
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    # actor_type distinguishes "admin" from any other actor type you might
    # add later (e.g. "system" for automated actions) — keeping it as a
    # string rather than assuming every actor is an Admin row keeps this
    # table flexible without a schema change.
    actor_type: Mapped[str] = mapped_column(String(20))
    actor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))

    action: Mapped[str] = mapped_column(String(100))  # e.g. "user.view", "scheme.edit"
    target_type: Mapped[str] = mapped_column(String(50))  # e.g. "user", "scheme"
    target_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    # IMPORTANT GOTCHA, worth knowing cold for viva or just to not waste an
    # hour debugging it: the Python attribute CANNOT be named `metadata`.
    # SQLAlchemy's declarative Base already uses `Base.metadata` internally
    # (it's the object that holds all table definitions for Alembic to
    # read) — naming a column attribute `metadata` collides with that and
    # raises an error at import time. The fix is to name the Python
    # attribute something else (`extra_data`) while keeping the actual
    # database column named "metadata" via the explicit mapped_column name
    # argument, so the DB schema still matches the spec you wrote.
    extra_data: Mapped[dict | None] = mapped_column(
        "metadata", JSONB, nullable=True
    )

    # Postgres's native INET type stores IP addresses (v4 or v6) far more
    # compactly and queryably than a VARCHAR would — you can run range/
    # subnet queries on it natively if you ever need to (e.g. "all admin
    # actions from this IP block").
    ip_address: Mapped[str | None] = mapped_column(INET, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )