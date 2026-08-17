"""
app/services/matching_service.py

Personalized eligibility filtering + scoring for the authenticated
POST /schemes/match endpoint. Unlike search_service.py (public, query-only),
this has a real user profile to work with — so it's where the rule-based
eligibility layer and the full "why 87%?" reasons list actually live.

SYNC NOTE: matches Member 3's actual synchronous SQLAlchemy session
(create_engine + Session) — plain calls, no `await`, no `async def`.

Scoring formula (rule-based 60 / semantic 40 — the split from the original
brief's match-score reference implementation):
  - occupation match   -> up to 25 points
  - income eligibility -> up to 20 points
  - state eligibility  -> up to 15 points
  - semantic relevance -> up to 40 points (query vs scheme embedding)
Schemes that fail a HARD eligibility rule (income cap, wrong state, wrong
occupation list if the scheme requires one) are dropped entirely before
scoring — semantic similarity alone should never let an ineligible scheme
outrank an eligible one just because its description reads similarly.
Owned by: Member 2 — Scheme Discovery Engine.
"""

import logging
from dataclasses import dataclass, field

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.scheme import Scheme
from app.services.embedding_service import embedding_service

logger = logging.getLogger(__name__)

# Documents that are commonly hard for a low-literacy or rural applicant to
# obtain quickly — flagged as a warning even when the scheme doesn't have
# its own explicit `warning` text.
HARD_TO_GET_DOCS = {"income_certificate", "domicile_certificate", "land_record", "crop_sowing_certificate"}


@dataclass
class UserProfile:
    """Minimal shape matching_service actually reads. Member 1 owns the
    real user_profiles table — this is just the subset of fields this
    file depends on, kept separate so this module is testable with a
    plain fake object and doesn't import Member 1's model directly."""

    state_code: str | None = None
    occupation: str | None = None
    annual_income_inr: int | None = None
    category: str | None = None  # General/OBC/SC/ST
    gender: str | None = None
    age: int | None = None
    disability_status: bool | None = None
    family_size: int | None = None


@dataclass
class MatchReason:
    factor: str
    matched: str
    weight: int


@dataclass
class MatchResult:
    scheme: Scheme
    match_score: int
    reasons: list[MatchReason] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def _passes_hard_eligibility(scheme: Scheme, profile: UserProfile) -> bool:
    """Hard filter — fails silently drop the scheme from results entirely,
    no partial credit. Every check here is deliberately conservative: if a
    rule field is empty/None on the scheme, that dimension is unrestricted
    (e.g. no states listed = valid everywhere), not automatically failing."""
    rules = scheme.eligibility_rules or {}

    income_max = rules.get("income_max")
    if income_max is not None and profile.annual_income_inr is not None:
        if profile.annual_income_inr > income_max:
            return False

    states = rules.get("states") or []
    if states and profile.state_code and profile.state_code not in states:
        return False

    occupations = rules.get("occupations") or []
    if occupations and profile.occupation and profile.occupation not in occupations:
        return False

    gender = rules.get("gender")
    if gender and profile.gender and gender != profile.gender:
        return False

    min_age = rules.get("min_age")
    if min_age is not None and profile.age is not None and profile.age < min_age:
        return False

    max_age = rules.get("max_age")
    if max_age is not None and profile.age is not None and profile.age > max_age:
        return False

    return True


def _score_scheme(scheme: Scheme, profile: UserProfile, query_embedding: np.ndarray | None) -> MatchResult:
    rules = scheme.eligibility_rules or {}
    score = 0
    reasons: list[MatchReason] = []

    if profile.occupation and profile.occupation in (rules.get("occupations") or []):
        score += 25
        reasons.append(MatchReason("occupation", profile.occupation, 25))

    income_max = rules.get("income_max")
    if income_max is None or (profile.annual_income_inr is not None and profile.annual_income_inr <= income_max):
        score += 20
        income_label = f"≤ ₹{income_max:,}" if income_max is not None else "no income cap"
        reasons.append(MatchReason("income", income_label, 20))

    states = rules.get("states") or []
    if not states or (profile.state_code and profile.state_code in states):
        score += 15
        reasons.append(MatchReason("state", profile.state_code or "central scheme", 15))

    gender_rule = rules.get("gender")
    if gender_rule and profile.gender and gender_rule == profile.gender:
        score += 10
        reasons.append(MatchReason("gender", gender_rule, 10))

    min_age, max_age = rules.get("min_age"), rules.get("max_age")
    if (min_age is not None or max_age is not None) and profile.age is not None:
        score += 10
        age_label = f"{min_age or 0}-{max_age if max_age is not None else 'no cap'} yrs"
        reasons.append(MatchReason("age", age_label, 10))

    semantic_points = 0
    if query_embedding is not None and scheme.embedding is not None:
        semantic = float(np.dot(query_embedding, np.array(scheme.embedding)))
        semantic_points = round(max(semantic, 0.0) * 40)
        score += semantic_points
        reasons.append(MatchReason("semantic_query", "relevant to your query", semantic_points))

    warnings: list[str] = []
    if scheme.warning:
        warnings.append(scheme.warning)
    for doc in scheme.documents_required or []:
        if doc in HARD_TO_GET_DOCS:
            warnings.append(f"{doc.replace('_', ' ').title()} required — verify before applying")

    return MatchResult(scheme=scheme, match_score=min(score, 100), reasons=reasons, warnings=warnings)


def filter_and_score(
    schemes: list[Scheme],
    profile: UserProfile,
    query_embedding: np.ndarray | None,
    limit: int = 10,
) -> list[MatchResult]:
    """Shared core: hard-filters `schemes` against `profile`, scores what's
    left, returns the top `limit` sorted by score. Reused by get_matches
    (DB-fetching, for the authenticated /schemes/match) and by
    /schemes/voice-search (which already has a ranked scheme list from
    search_service.hybrid_search and just needs the eligibility layer)."""
    eligible = [s for s in schemes if _passes_hard_eligibility(s, profile)]
    if not eligible:
        logger.info("No schemes passed hard eligibility for this profile.")
        return []

    results = [_score_scheme(scheme, profile, query_embedding) for scheme in eligible]
    results.sort(key=lambda r: r.match_score, reverse=True)
    return results[:limit]


def get_matches(
    db: Session,
    profile: UserProfile,
    query: str | None = None,
    language: str = "en",
    limit: int = 10,
) -> list[MatchResult]:
    """Main entrypoint for POST /schemes/match. Filters to eligible schemes,
    scores each, returns the top N sorted by score."""
    stmt = select(Scheme).where(Scheme.is_published.is_(True))
    all_schemes = list(db.scalars(stmt).all())

    query_embedding = None
    if query and embedding_service.is_ready:
        query_embedding = np.array(embedding_service.encode(query))
    elif not query and embedding_service.is_ready and profile.occupation:
        # No free-text query given — fall back to a query built from the
        # profile itself, so /match still returns semantically relevant
        # results for an authenticated user who just says "show me schemes."
        fallback_text = f"{profile.occupation or ''} {profile.category or ''}".strip()
        if fallback_text:
            query_embedding = np.array(embedding_service.encode(fallback_text))

    return filter_and_score(all_schemes, profile, query_embedding, limit)