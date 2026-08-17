"""
schemas/user.py

Pydantic models for /users/* endpoints, plus UserOut which is also reused
inside schemas/auth.py's TokenPair (a logged-in response needs to say who
just logged in).
"""

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field


class UserOut(BaseModel):
    """
    Public-facing shape of a User. Notice what's NOT here compared to the
    SQLAlchemy User model: no relationship objects, nothing internal. Every
    field the client sees is something they're meant to see.
    """

    id: uuid.UUID
    mobile_number: str | None = None
    full_name: str | None = None
    date_of_birth: date | None = None
    is_verified: bool
    created_at: datetime

    # from_attributes=True: lets FastAPI build this schema straight from
    # the SQLAlchemy object your route handler already has, e.g.
    # `return UserOut.model_validate(user)` — no manual dict-building.
    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    """
    Body of PATCH /users/me. Every field is Optional because PATCH means
    "update only what's provided" — unlike PUT (used for the profile
    endpoint below), which replaces the whole resource. If full_name is
    omitted from the request body entirely, it should stay unchanged; if
    it's included, even as null, that's a deliberate "clear this field."
    Distinguishing those two cases is why services/user_service.py should
    build its SQL UPDATE from `.model_dump(exclude_unset=True)` rather than
    `.model_dump()` — exclude_unset only includes fields the client actually
    sent, not ones that just fell back to their None default.
    """

    full_name: str | None = None
    date_of_birth: date | None = None


class UserProfileIn(BaseModel):
    """
    Body of PUT /users/me/profile — the full 30-field ProfileData object
    the frontend already has as a TypeScript type. This is a PUT, not a
    PATCH, matching the endpoint spec: the frontend always sends the
    complete profile form, not a partial update, so every field here is
    Optional individually (a citizen might not have answered every
    question yet) but the endpoint itself expects the whole object each
    time, not a diff.
    """

    state_code: str | None = None
    district: str | None = None
    occupation: str | None = None
    annual_income_inr: int | None = Field(default=None, ge=0)
    category: str | None = None  # General / OBC / SC / ST
    gender: str | None = None
    disability_status: bool | None = None
    family_size: int | None = Field(default=None, ge=1)
    land_area_acres: float | None = Field(default=None, ge=0)
    land_ownership: str | None = None
    bank_name: str | None = None
    ifsc: str | None = None

    # Accepted as direct input — and this is safe specifically BECAUSE the
    # frontend's storage.ts already truncates to the last 4 digits client-
    # side, before anything is ever sent over the network. The backend
    # never receives, and never needs to receive, a full account number —
    # matching the sensitive-data-minimization pattern from models/user.py.
    # The length constraint here is a second line of defense: even if a
    # client bug ever sent more than 4 digits, this schema rejects it
    # before it reaches the database.
    account_last_four: str | None = Field(default=None, min_length=4, max_length=4)

    # Every scheme-specific field the frontend's 30-field ProfileData type
    # has that isn't one of the stable columns above (girlChildAge,
    # businessType, businessAge, existingLoan, maritalStatus,
    # lpgConnection, qualification, institutionName, farmerCategory,
    # surveyNumber, bplCard, rationCardType, currentHouse,
    # aadhaarBankLinked, landOwnership variants, etc.) is collected here
    # as a free-form dict and stored directly into the model's JSONB
    # extra_attrs column — matching the schema design decision explained
    # in models/user.py.
    extra_attrs: dict = Field(default_factory=dict)


class UserProfileOut(UserProfileIn):
    """
    Response of GET /users/me/profile. Inherits every field from
    UserProfileIn (the readable and writable fields are the same set here,
    unlike the auth flow) and adds updated_at, which is server-computed
    and never client-supplied.
    """

    updated_at: datetime

    model_config = {"from_attributes": True}


class UserProfileUpdate(BaseModel):
    """
    Present in the original spec alongside UserProfileIn/Out. Included for
    a future partial-update endpoint (e.g. if the frontend later adds
    autosave-per-field instead of submitting the whole form at once) — same
    exclude_unset reasoning as UserUpdate above. Not wired to a route yet
    since the current spec's PUT /users/me/profile uses UserProfileIn for
    full replacement; this is here so the shape exists when/if that need
    comes up, without a schema change blocking it later.
    """

    state_code: str | None = None
    district: str | None = None
    occupation: str | None = None
    annual_income_inr: int | None = Field(default=None, ge=0)
    category: str | None = None
    gender: str | None = None
    disability_status: bool | None = None
    family_size: int | None = Field(default=None, ge=1)
    land_area_acres: float | None = Field(default=None, ge=0)
    land_ownership: str | None = None
    bank_name: str | None = None
    ifsc: str | None = None
    extra_attrs: dict | None = None