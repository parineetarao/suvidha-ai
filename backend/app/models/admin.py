"""
models/admin.py

Admin: separate identity system from User entirely — admins log in with
email + password (core.security.hash_password/verify_password), never OTP.
Kept as its own table rather than "a User with an is_admin flag" because the
two roles have fundamentally different auth flows, and mixing them would
mean every users.* query has to remember to filter out admins, or every
admin.* endpoint has to check a flag instead of just querying a table that
IS admins.
"""

import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import Boolean, DateTime, Enum, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AdminRole(str, PyEnum):
    """
    A Python Enum subclassing `str` (not a plain Enum) so values compare
    and serialize as plain strings — AdminRole.SUPER_ADMIN == "super_admin"
    is True, which matters when this shows up in a Pydantic response or a
    JWT roles claim without needing a custom serializer.
    """
    SUPER_ADMIN = "super_admin"
    SCHEME_EDITOR = "scheme_editor"
    VIEWER = "viewer"


class Admin(Base):
    __tablename__ = "admins"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))

    # SQLAlchemy's Enum(AdminRole) creates a native Postgres ENUM type by
    # default, which is stricter than storing role as a plain VARCHAR — the
    # database itself rejects an invalid role value, not just the app layer.
    # The tradeoff (worth knowing for viva) is that adding a new role later
    # requires an Alembic migration that alters the Postgres enum type,
    # which is slightly more ceremony than adding a new string constant
    # would be. Given roles are a small, slow-changing set for this project,
    # that tradeoff favors the stricter native enum.
    role: Mapped[AdminRole] = mapped_column(Enum(AdminRole, name="admin_role"))

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )