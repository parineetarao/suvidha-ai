"""
app/services/matching_service.py

Personalized eligibility filtering + scoring for the authenticated
POST /schemes/match endpoint. Unlike search_service.py (public, query-only),
this has a real user profile to work with — so it's where the rule-based
eligibility layer and the full "why 87%?" reasons list actually live.

SYNC NOTE: matches Member 3's actual synchronous SQLAlchemy session
(create_engine + Session) — plain calls, no `await`, no `async def`.

Eligibility is STRICT: a scheme is returned only when every rule it has is
positively satisfied by the profile. A rule the profile can't answer (scheme
needs a state, user never said theirs) excludes the scheme rather than
passing it — "maybe eligible" results are what made the old list feel
irrelevant. Those unanswered rules are reported back as `missing_fields` so
the UI can ask for exactly the detail that would unlock more schemes.

Scoring among the eligible (0-100):
  - eligible baseline     -> 50 points (every listed rule is met)
  - each targeted rule met -> occupation 15, caste/BPL 12, disability 10,
                              state 8, gender 5, age 5, income 5
  - semantic relevance    -> up to 10 points (query vs scheme embedding)
Points come only from rules a scheme actually HAS, so a scheme built for
"women farmers in Maharashtra" outranks one open to everyone — nothing is
awarded for a missing restriction.
Owned by: Member 2 — Scheme Discovery Engine.
"""

import logging
import re
from collections import Counter
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

    state_code: str | None = None  # full state name, e.g. "Tamil Nadu"
    occupation: str | None = None
    annual_income_inr: int | None = None
    category: str | None = None  # General/OBC/SC/ST
    gender: str | None = None
    age: int | None = None
    disability_status: bool | None = None
    family_size: int | None = None
    bpl: bool | None = None
    # Extra occupations beyond `occupation` (a voice sentence can mention
    # more than one, e.g. "farmer and daily wage labourer").
    occupations: list[str] = field(default_factory=list)

    def all_occupations(self) -> set[str]:
        values = list(self.occupations) + ([self.occupation] if self.occupation else [])
        return {normalize_occupation(o) for o in values}


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


ELIGIBLE_BASE = 50
RULE_WEIGHTS = {
    "occupation": 15, "category": 12, "disability": 10,
    "state": 8, "gender": 5, "age": 5, "income": 5,
}
SEMANTIC_MAX = 10
# A scheme with no rules at all is open to everyone, so it says nothing
# about the user's situation — only show it when what they said is clearly
# about that scheme (cosine similarity of sentence vs scheme embedding).
OPEN_SCHEME_MIN_SIMILARITY = 0.5

CASTE_VALUES = {"SC", "ST", "OBC", "GENERAL"}

# eligibility_rules spell the same occupation several ways
# ("business_owner" vs "entrepreneur") — fold them onto one value.
_OCCUPATION_ALIASES = {"entrepreneur": "business owner", "businessman": "business owner"}


def normalize_occupation(value: str) -> str:
    value = value.strip().lower().replace("_", " ")
    return _OCCUPATION_ALIASES.get(value, value)


# Requirements that live only in a scheme's free-text eligibility_text and
# were never extracted into eligibility_rules (e.g. "Agricultural Activities
# for Persons with Disabilities" has no disability or state rule). Recovered
# here conservatively — only explicit "resident of <State>" / disability
# wording — so strict matching doesn't show those schemes to everyone.
_DISABILITY_REQUIRED = re.compile(
    r"(should|must)\s+(have|be)\s+(a\s+)?(person\s+with\s+)?(\d+\s*%\s*(or\s+more\s+)?)?(disab|handicap)"
    r"|disability\s+of\s+(at\s+least\s+)?\d+\s*%|persons?\s+with\s+disabilit|\d+\s*%\s+disabled",
    re.IGNORECASE,
)
_TRANSGENDER = re.compile(r"eunuch|transgender|third\s+gender|kinnar", re.IGNORECASE)
_RESIDENCE = re.compile(r"(resident|native|domicile|domiciled)\w*\s+(of|in)\s+(the\s+)?(state\s+of\s+|ut,?\s+)?", re.IGNORECASE)


def _state_names() -> list[str]:
    from app.services.voice_profile_service import STATE_NAMES
    return list(STATE_NAMES)


def effective_rules(scheme: Scheme) -> dict:
    rules = dict(scheme.eligibility_rules or {})
    text = f"{scheme.name or ''}. {scheme.eligibility_text or ''}"

    if rules.get("disability") is None and _DISABILITY_REQUIRED.search(text):
        rules["disability"] = True

    if not rules.get("gender") and _TRANSGENDER.search(text):
        rules["gender"] = "transgender"

    if not rules.get("states"):
        for match in _RESIDENCE.finditer(text):
            following = text[match.end():match.end() + 40].lower()
            hits = [s for s in _state_names() if following.startswith(s.lower())]
            if hits:
                rules["states"] = hits[:1]
                break
    return rules


@dataclass
class EligibilityCheck:
    eligible: bool
    reasons: list[MatchReason] = field(default_factory=list)
    # Rules the profile couldn't answer. Only meaningful when nothing
    # actually contradicted the profile — then these are exactly what the
    # user would need to tell us for this scheme to show up.
    unknown: list[str] = field(default_factory=list)
    contradicted: bool = False


def check_eligibility(rules: dict, profile: UserProfile) -> EligibilityCheck:
    """Strict check of every rule the scheme defines. A rule the profile
    satisfies earns its RULE_WEIGHTS points; a rule the profile can't answer
    goes to `unknown`; a rule the profile breaks sets `contradicted`."""
    check = EligibilityCheck(eligible=True)

    def met(factor: str, label: str) -> None:
        check.reasons.append(MatchReason(factor, label, RULE_WEIGHTS[factor]))

    def unknown(factor: str) -> None:
        check.unknown.append(factor)

    def failed() -> None:
        check.contradicted = True

    occupations = {normalize_occupation(o) for o in (rules.get("occupations") or [])}
    if occupations:
        user_occupations = profile.all_occupations()
        if not user_occupations:
            unknown("occupation")
        elif hit := sorted(occupations & user_occupations):
            met("occupation", hit[0])
        else:
            failed()

    categories = {str(c).upper() for c in (rules.get("categories") or [])}
    if categories:
        caste_rules = categories & CASTE_VALUES
        wants_bpl = "BPL" in categories
        user_caste = (profile.category or "").upper() or None
        if wants_bpl and profile.bpl:
            met("category", "BPL")
        elif user_caste and user_caste in caste_rules:
            met("category", profile.category)
        elif (wants_bpl and profile.bpl is None) or (caste_rules and user_caste is None):
            unknown("category")
        else:
            failed()

    states = rules.get("states") or []
    if states:
        if not profile.state_code:
            unknown("state")
        elif profile.state_code.lower() in {s.lower() for s in states}:
            met("state", profile.state_code)
        else:
            failed()

    gender = rules.get("gender")
    if gender:
        if not profile.gender:
            unknown("gender")
        elif profile.gender == gender:
            met("gender", gender)
        else:
            failed()

    min_age, max_age = rules.get("min_age"), rules.get("max_age")
    if min_age is not None or max_age is not None:
        if profile.age is None:
            unknown("age")
        elif (min_age is None or profile.age >= min_age) and (max_age is None or profile.age <= max_age):
            met("age", f"{min_age or 0}-{max_age if max_age is not None else 'no cap'} yrs")
        else:
            failed()

    income_max = rules.get("income_max")
    if income_max is not None:
        if profile.annual_income_inr is None:
            unknown("income")
        elif profile.annual_income_inr <= income_max:
            met("income", f"≤ ₹{income_max:,}")
        else:
            failed()

    if rules.get("disability"):
        if profile.disability_status is None:
            unknown("disability")
        elif profile.disability_status:
            met("disability", "person with disability")
        else:
            failed()

    check.eligible = not check.contradicted and not check.unknown
    return check


def _similarity(scheme: Scheme, query_embedding: np.ndarray | None) -> float:
    if query_embedding is None or scheme.embedding is None:
        return 0.0
    # Both vectors are normalized, so cosine similarity is a dot product.
    return float(np.dot(query_embedding, np.array(scheme.embedding)))


def _score_scheme(
    scheme: Scheme,
    check: EligibilityCheck,
    rules: dict,
    query_embedding: np.ndarray | None,
) -> MatchResult:
    reasons = [MatchReason("eligible", "meets every listed criterion", ELIGIBLE_BASE), *check.reasons]

    semantic_points = round(max(_similarity(scheme, query_embedding), 0.0) * SEMANTIC_MAX)
    if semantic_points:
        reasons.append(MatchReason("semantic_query", "relevant to your query", semantic_points))

    score = sum(r.weight for r in reasons)

    warnings: list[str] = []
    if scheme.warning:
        warnings.append(scheme.warning)
    # Academic conditions can't be judged from a spoken sentence — keep the
    # scheme but tell the user to confirm them.
    if rules.get("min_education_level"):
        warnings.append(f"Requires education level: {rules['min_education_level']} — verify before applying")
    if rules.get("min_marks_percentage"):
        warnings.append(f"Requires at least {rules['min_marks_percentage']}% marks — verify before applying")
    for doc in scheme.documents_required or []:
        if doc in HARD_TO_GET_DOCS:
            warnings.append(f"{doc.replace('_', ' ').title()} required — verify before applying")

    return MatchResult(scheme=scheme, match_score=min(score, 100), reasons=reasons, warnings=warnings)


@dataclass
class MatchOutcome:
    results: list[MatchResult]
    # Profile fields that, if the user provided them, would make more
    # schemes eligible — most impactful first.
    missing_fields: list[str]


def match_schemes(
    schemes: list[Scheme],
    profile: UserProfile,
    query_embedding: np.ndarray | None,
    limit: int = 10,
) -> MatchOutcome:
    """Shared core: strictly filters `schemes` against `profile`, scores
    what's left, returns the top `limit` sorted by score, plus which missing
    profile fields are holding other schemes back."""
    results: list[MatchResult] = []
    blocked_by: Counter[str] = Counter()
    for scheme in schemes:
        rules = effective_rules(scheme)
        check = check_eligibility(rules, profile)
        if check.eligible:
            if not check.reasons and _similarity(scheme, query_embedding) < OPEN_SCHEME_MIN_SIMILARITY:
                continue
            results.append(_score_scheme(scheme, check, rules, query_embedding))
        elif not check.contradicted:
            blocked_by.update(check.unknown)

    if not results:
        logger.info("No schemes passed strict eligibility for this profile.")
    results.sort(key=lambda r: r.match_score, reverse=True)
    return MatchOutcome(results=results[:limit], missing_fields=[f for f, _ in blocked_by.most_common()])


def filter_and_score(
    schemes: list[Scheme],
    profile: UserProfile,
    query_embedding: np.ndarray | None,
    limit: int = 10,
) -> list[MatchResult]:
    return match_schemes(schemes, profile, query_embedding, limit).results


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