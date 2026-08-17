"""
app/schemas/scheme.py

Pydantic request/response models for the scheme discovery API.
Owned by: Member 2 — Scheme Discovery Engine.

REVISION NOTE: reshaped to match the model's move from per-language columns
to a JSONB `translations` field, to support 10 languages (see
app.models.scheme.SUPPORTED_LANGUAGES).
"""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.scheme import SUPPORTED_LANGUAGES

# Pydantic-friendly literal type built from the same source of truth as the
# model, so validation errors list the exact 10 allowed codes automatically.
LanguageCode = Literal["en", "hi", "mr", "ta", "te", "kn", "ml", "bn", "gu", "pa"]
assert set(LanguageCode.__args__) == set(SUPPORTED_LANGUAGES)  # keeps the two in sync


# ---------------------------------------------------------------------------
# Shared building blocks
# ---------------------------------------------------------------------------

class EligibilityRules(BaseModel):
    min_age: int | None = None
    max_age: int | None = None
    states: list[str] = Field(default_factory=list)
    income_max: int | None = None
    categories: list[str] = Field(default_factory=list)
    occupations: list[str] = Field(default_factory=list)
    gender: str | None = None
    disability: bool | None = None


class Translation(BaseModel):
    """One language's worth of translatable text for a scheme."""

    name: str | None = None
    description: str | None = None
    benefits: str | None = None
    warning: str | None = None


class RejectionRisk(BaseModel):
    """One reason an application to this scheme commonly gets rejected,
    and how to avoid it. English only for now — see model revision note."""

    risk: str
    fix: str


class MatchReason(BaseModel):
    factor: str
    matched: str
    weight: int


# ---------------------------------------------------------------------------
# Output shapes
# ---------------------------------------------------------------------------

class SchemeOut(BaseModel):
    """GET /schemes list view. `name` is pre-resolved server-side to the
    caller's requested language (English fallback if untranslated) — the
    frontend doesn't need to know translations exist at all for this view."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    scheme_code: str
    name: str
    ministry: str | None = None
    category: str | None = None
    is_published: bool


class SchemeDetail(SchemeOut):
    """GET /schemes/{id}. Also resolved to one language by default — pass
    `?lang=ta` on the request. `translations` (raw, all languages) is only
    included when the caller is an authenticated admin editing the scheme;
    see SchemeAdminDetail below for that case."""

    description: str | None = None
    benefits: str | None = None
    eligibility_rules: EligibilityRules
    documents_required: list[str] = Field(default_factory=list)
    application_modes: list[str] = Field(default_factory=list)
    application_url: str | None = None
    source_url: str | None = None
    last_verified_at: datetime | None = None
    warning: str | None = None
    rejection_risks: list[RejectionRisk] = Field(default_factory=list)
    available_languages: list[LanguageCode] = Field(
        default_factory=list,
        description="Which languages this scheme currently has a translation for.",
    )


class SchemeAdminDetail(SchemeDetail):
    """Admin-only variant that exposes the raw translations dict for editing
    in the CMS, keyed by language code."""

    translations: dict[LanguageCode, Translation] = Field(default_factory=dict)


class SchemeMatch(BaseModel):
    scheme_id: str
    name: str  # resolved to the request's language
    match_score: int = Field(ge=0, le=100)
    reasons: list[MatchReason]
    warnings: list[str] = Field(default_factory=list)


class SchemeComparison(BaseModel):
    schemes: list[SchemeDetail]


class PaginatedSchemes(BaseModel):
    items: list[SchemeOut]
    total: int
    page: int
    limit: int


# ---------------------------------------------------------------------------
# Input shapes
# ---------------------------------------------------------------------------

class SchemeSearchIn(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    language: LanguageCode = "en"
    limit: int = Field(default=10, ge=1, le=50)


class SchemeMatchIn(BaseModel):
    query: str | None = Field(default=None, max_length=500)
    language: LanguageCode = "en"


class ParsedVoiceProfile(BaseModel):
    """What voice_profile_service.parse_profile() extracted from the
    transcribed sentence. Exposed in the response so the UI (and this
    proof-of-fix) can show exactly what was detected, not just the results."""

    gender: str | None = None
    age: int | None = None


class VoiceSchemeSearchIn(BaseModel):
    """Input for POST /schemes/voice-search — the public, unauthenticated
    voice -> real-scheme pipeline. Takes the full transcribed sentence
    (not just a query), parses gender/age out of it, and eligibility-filters
    real published schemes against them. Exists because POST /schemes/match
    needs Member 1's auth dependency (currently a 501 stub) and this flow
    has no login yet."""

    text: str = Field(min_length=1, max_length=1000)
    language: LanguageCode = "en"
    limit: int = Field(default=10, ge=1, le=50)


class VoiceSchemeSearchOut(BaseModel):
    parsed_profile: ParsedVoiceProfile
    results: list[SchemeMatch]


class SchemeCompareIn(BaseModel):
    scheme_ids: list[str] = Field(min_length=2, max_length=3)
    language: LanguageCode = "en"


class SchemeCreate(BaseModel):
    """Admin creation. English fields are required (the canonical fallback);
    translations for the other 9 languages are optional at creation time and
    can be filled in later — a scheme doesn't need to launch fully translated."""

    scheme_code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=300)
    description: str | None = None
    benefits: str | None = None
    ministry: str | None = Field(default=None, max_length=200)
    category: str | None = Field(default=None, max_length=80)
    eligibility_rules: EligibilityRules
    documents_required: list[str] = Field(default_factory=list)
    application_modes: list[str] = Field(default_factory=list)
    application_url: str | None = None
    source_url: str | None = None
    is_published: bool = False
    translations: dict[LanguageCode, Translation] = Field(default_factory=dict)


class SchemeUpdate(BaseModel):
    """PATCH shape — every field optional. `translations`, if provided, is
    merged into (not replacing) the existing translations dict at the
    service layer, so an admin can add Tamil without wiping Hindi."""

    name: str | None = Field(default=None, max_length=300)
    description: str | None = None
    benefits: str | None = None
    ministry: str | None = Field(default=None, max_length=200)
    category: str | None = Field(default=None, max_length=80)
    eligibility_rules: EligibilityRules | None = None
    documents_required: list[str] | None = None
    application_modes: list[str] | None = None
    application_url: str | None = None
    source_url: str | None = None
    is_published: bool | None = None
    translations: dict[LanguageCode, Translation] | None = None