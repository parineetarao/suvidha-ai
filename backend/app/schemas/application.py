"""
app/schemas/application.py

Pydantic request/response models for the application lifecycle and document
verification API. Owned by: Member 3 — Application lifecycle & Voice.
"""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.application import APPLICATION_STATUSES

# Pydantic-friendly literal built from the same source of truth as the model
# (see models/application.py) — so an invalid status in a request body fails
# validation with the exact seven allowed values listed automatically,
# before application_service.py's transition logic ever runs.
ApplicationStatus = Literal[
    "draft", "docs_pending", "letter_generated", "submitted", "under_review", "approved", "rejected"
]
assert set(ApplicationStatus.__args__) == set(APPLICATION_STATUSES)


# ---------------------------------------------------------------------------
# Output shapes
# ---------------------------------------------------------------------------

class ApplicationOut(BaseModel):
    """Response of POST/GET/PATCH /applications and list items in the GET
    /applications collection view."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    scheme_id: uuid.UUID
    status: ApplicationStatus
    reference_number: str | None = None
    notes: str | None = None
    created_at: datetime
    submitted_at: datetime | None = None


class StatusHistoryEntry(BaseModel):
    """One row of an application's audit trail. `changed_by` has no fixed
    type meaning here beyond "a UUID or nothing" — see the ForeignKey-less
    design note on ApplicationStatusHistory.changed_by in models/application.py."""

    model_config = ConfigDict(from_attributes=True)

    old_status: ApplicationStatus | None = None
    new_status: ApplicationStatus
    changed_at: datetime
    changed_by: uuid.UUID | None = None


class ApplicationDetail(ApplicationOut):
    """GET /applications/{id}. Adds the full status-change history on top of
    ApplicationOut's fields, so the frontend can render a timeline instead of
    just the current state — this is the one place status_history is ever
    sent to the client."""

    status_history: list[StatusHistoryEntry] = Field(default_factory=list)


class LetterOut(BaseModel):
    """Response of POST /applications/{id}/generate-letter. pdf_url is
    optional because letter_service.py always returns the rendered text
    (Jinja2 is synchronous and cheap); PDF rendering may be a slower/optional
    step depending on how that service is implemented, so callers must not
    assume a PDF always exists."""

    letter_text: str
    pdf_url: str | None = None


class VerificationResult(BaseModel):
    """Response of POST /documents/verify. Mirrors DocumentVerification
    exactly — deliberately so, since this schema is the server's only
    representation of a verification and must never grow a field the model
    itself doesn't have (no image, no raw identifier)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    document_type: str
    verification_status: str
    masked_identifier: str | None = None
    checked_at: datetime


# ---------------------------------------------------------------------------
# Input shapes
# ---------------------------------------------------------------------------

class ApplicationIn(BaseModel):
    """Body of POST /applications. Deliberately just scheme_id — user_id is
    never accepted from the client, only taken from the authenticated JWT
    (Member 1's get_current_user dependency) in the route handler. Trusting
    a client-supplied user_id here would let one account create applications
    on another citizen's behalf."""

    scheme_id: uuid.UUID


class ApplicationUpdate(BaseModel):
    """Body of PATCH /applications/{id}. Both fields optional, matching the
    exclude_unset PATCH convention used in schemas/user.py's UserUpdate — an
    omitted field means "leave unchanged." `status`, if present, is only
    validated here as one of the seven known values; whether old_status ->
    new_status is a *legal* transition is application_service.py's job, not
    this schema's."""

    status: ApplicationStatus | None = None
    notes: str | None = None


class DocumentVerifyIn(BaseModel):
    """Body of POST /documents/verify. `checks` is a free-form dict of
    boolean results from the client-side Tesseract.js OCR pass (e.g.
    {"name_matches": true, "not_expired": true}) — the exact keys vary by
    doc_type, so this isn't a fixed schema. There is deliberately no field
    for the document image or the full identifier number: the hard rule in
    models/document.py means the server must never be able to receive
    either, and a schema is the first place to enforce that — if a client
    bug ever tried to send a `document_image` field, Pydantic would silently
    ignore it rather than accepting and storing it (no such field exists on
    this model)."""

    doc_type: str = Field(min_length=1, max_length=30)
    checks: dict[str, bool] = Field(default_factory=dict)
    masked_id: str | None = Field(default=None, max_length=20)
