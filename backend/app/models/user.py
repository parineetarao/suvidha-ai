"""
models/user.py

User: core identity record, created on first successful OTP verification.
UserProfile: the 30-field ProfileData from the frontend, one row per user.

Split into two tables (not one) because they have different lifecycles and
different write patterns: User is written once at signup and rarely touched
again; UserProfile is written/updated repeatedly as the citizen fills in
scheme-eligibility details. Keeping them separate also means Member 2's
matching engine can query user_profiles without touching auth-related
columns at all.
"""

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, SmallInteger, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    # UUID primary keys (not auto-incrementing integers) are used throughout
    # this schema. Reason: user IDs end up in JWTs, URLs, and eventually
    # cross-service foreign keys (Member 3's applications.user_id). Sequential
    # integer IDs leak information (how many users exist, roughly when a
    # given user signed up relative to another) and are guessable — enumerable
    # IDs are a classic way to probe an API for other users' data. UUIDs
    # sidestep both problems for a small, fixed storage cost.
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # Indian mobile numbers: 10 digits, sometimes stored with +91 prefix.
    # VARCHAR(15) leaves room for a "+91" prefix plus 10 digits. unique=True
    # both enforces the business rule (one account per mobile number) and
    # gets you a database index for free, which matters because every OTP
    # request and login does a lookup by mobile_number.
    mobile_number: Mapped[str | None] = mapped_column(
        String(15), unique=True, index=True, nullable=True
    )

    # Nullable, unique when present. A citizen signs up via mobile OR email —
    # exactly one identity path per account, enforced at the application layer
    # (schemas/auth.py), not a DB constraint. Both columns nullable is what
    # makes "either, not both required" possible without CHECK-constraint
    # gymnastics.
    email: Mapped[str | None] = mapped_column(
        String(255), unique=True, index=True, nullable=True
    )

    # Nullable because a user exists (and can log in) the moment their OTP is
    # verified, before they've filled in any profile details — full_name is
    # collected as part of onboarding, not signup.
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Distinct from "has an account" — is_verified specifically tracks OTP
    # verification success. Kept even though, in this design, a User row is
    # only ever created *after* OTP success (so it's always True on creation)
    # — it's here so the column exists if you later add a pre-verification
    # signup step, without an Alembic migration in the middle of the semester.
    is_verified: Mapped[bool] = mapped_column(default=True)

    # server_default=func.now() means the *database* stamps the timestamp
    # (via SQL's NOW()) at INSERT time, not Python. This matters because it's
    # correct even if two different application servers with slightly
    # different clocks are both inserting rows — the timestamp always comes
    # from one source of truth, the DB server.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # One-to-one link to UserProfile. uselist=False tells SQLAlchemy this
    # relationship returns a single object, not a list — without it,
    # user.profile would come back as [UserProfile(...)] instead of
    # UserProfile(...), which is annoying and easy to forget about.
    profile: Mapped["UserProfile"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )


class UserProfile(Base):
    __tablename__ = "user_profiles"

    # user_id is BOTH the primary key AND a foreign key here — that's what
    # makes this a true one-to-one relationship at the database level (not
    # just an ORM-level convention). A regular one-to-many FK would let one
    # user have multiple profile rows; making user_id the PK makes that
    # structurally impossible.
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )

    # --- Stable, frequently-queried fields get real columns ---
    # These are the fields Member 2's matching engine filters/sorts on, or
    # that show up in admin analytics — worth being real typed columns with
    # the option of indexing later, rather than buried in JSON.
    state_code: Mapped[str | None] = mapped_column(String(2), nullable=True)
    district: Mapped[str | None] = mapped_column(String(100), nullable=True)
    occupation: Mapped[str | None] = mapped_column(String(100), nullable=True)
    annual_income_inr: Mapped[int | None] = mapped_column(nullable=True)
    category: Mapped[str | None] = mapped_column(String(10), nullable=True)  # General/OBC/SC/ST
    gender: Mapped[str | None] = mapped_column(String(20), nullable=True)
    disability_status: Mapped[bool | None] = mapped_column(nullable=True)
    family_size: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)

    # Numeric(precision, scale) instead of Float for land area: land records
    # in India are frequently in fractional acres (e.g. 2.75 acres) and this
    # number can end up in eligibility calculations where floating-point
    # rounding errors are a real (if small) risk. Numeric stores it as an
    # exact decimal in Postgres, avoiding that class of bug entirely.
    land_area_acres: Mapped[float | None] = mapped_column(Numeric(6, 2), nullable=True)
    land_ownership: Mapped[str | None] = mapped_column(String(50), nullable=True)

    bank_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ifsc: Mapped[str | None] = mapped_column(String(11), nullable=True)

    # We store ONLY the last 4 digits of the account number, never the full
    # number — matching the same sensitive-data-minimization principle the
    # frontend's document readiness module already follows (storage.ts).
    # The full account number is never persisted anywhere in this schema.
    account_last_four: Mapped[str | None] = mapped_column(String(4), nullable=True)

    # --- Everything else goes in JSONB ---
    # The frontend's ProfileData type has ~30 fields; many are scheme-
    # specific (girlChildAge, businessType, farmerCategory...) and will
    # keep growing as Member 2 onboards more schemes with different
    # eligibility criteria. Giving each of those its own column means an
    # Alembic migration every time a new scheme needs a new field — JSONB
    # lets the frontend send whatever extra fields it has, without a schema
    # change, while Postgres can still index into and query JSONB fields
    # if a particular one turns out to need it later (GIN index).
    extra_attrs: Mapped[dict] = mapped_column(JSONB, default=dict)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="profile")