"""
app/api/v1/schemes.py

The FastAPI HTTP layer for scheme discovery. Every function here is thin on
purpose: parse the request, call a plain Python function from services/,
shape the result into a Pydantic response model, return it. All the actual
logic (search ranking, eligibility filtering, scoring) already lives in
search_service.py and matching_service.py — this file does not reimplement
any of it.

SYNC NOTE: matches Member 3's actual synchronous SQLAlchemy session
(app.db.session.get_db, which yields a plain Session). Endpoint functions
are plain `def`, not `async def` — FastAPI runs sync endpoints in a
threadpool automatically, so this is a calling-convention choice, not a
performance downgrade.

REMAINING GAP: `get_current_user_profile` is a stub that always returns
HTTP 501. POST /schemes/match cannot work correctly until Member 1's real
auth dependency exists to supply a real logged-in user's profile — this
makes that gap loud and explicit instead of faking a working response.
Owned by: Member 2 — Scheme Discovery Engine.
"""

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.scheme import Scheme
from app.services.embedding_service import embedding_service
from app.schemas.scheme import (
    MatchReason as MatchReasonOut,
    PaginatedSchemes,
    ParsedVoiceProfile,
    SchemeComparison,
    SchemeCompareIn,
    SchemeDetail,
    SchemeMatch,
    SchemeMatchIn,
    SchemeOut,
    SchemeSearchIn,
    VoiceSchemeSearchIn,
    VoiceSchemeSearchOut,
)
from app.services.matching_service import UserProfile, filter_and_score, get_matches
from app.services.search_service import hybrid_search
from app.services.voice_profile_service import parse_profile

router = APIRouter(prefix="/schemes", tags=["schemes"])


def get_current_user_profile() -> UserProfile:
    raise HTTPException(
        status_code=501,
        detail="Auth not wired up yet — POST /schemes/match needs Member 1's "
        "auth dependency to supply a real user profile.",
    )


def _to_scheme_out(scheme: Scheme, lang: str) -> SchemeOut:
    return SchemeOut(
        id=scheme.id,
        scheme_code=scheme.scheme_code,
        name=scheme.localized("name", lang),
        ministry=scheme.ministry,
        category=scheme.category,
        is_published=scheme.is_published,
    )


def _to_scheme_detail(scheme: Scheme, lang: str) -> SchemeDetail:
    return SchemeDetail(
        id=scheme.id,
        scheme_code=scheme.scheme_code,
        name=scheme.localized("name", lang),
        ministry=scheme.ministry,
        category=scheme.category,
        is_published=scheme.is_published,
        description=scheme.localized("description", lang),
        benefits=scheme.localized("benefits", lang),
        eligibility_rules=scheme.eligibility_rules or {},
        documents_required=scheme.documents_required or [],
        application_modes=scheme.application_modes or [],
        application_url=scheme.application_url,
        source_url=scheme.source_url,
        last_verified_at=scheme.last_verified_at,
        warning=scheme.localized("warning", lang),
        rejection_risks=scheme.rejection_risks or [],
        available_languages=list((scheme.translations or {}).keys()),
    )


def _to_scheme_match(result, lang: str) -> SchemeMatch:
    """Accepts either a matching_service.MatchResult or a search_service
    result dict — both carry a `scheme` plus score info, just shaped
    slightly differently, since the two services were built independently
    for different endpoints (see search_service.py's scope note)."""
    scheme = result["scheme"] if isinstance(result, dict) else result.scheme
    if isinstance(result, dict):
        score = round(result["score"] * 100)
        reasons = [MatchReasonOut(factor="semantic_query", matched="relevant to your query", weight=round(result["semantic"] * 100))]
        warnings = [scheme.warning] if scheme.warning else []
    else:
        score = result.match_score
        reasons = [MatchReasonOut(factor=r.factor, matched=r.matched, weight=r.weight) for r in result.reasons]
        warnings = result.warnings

    return SchemeMatch(
        scheme_id=scheme.scheme_code,
        name=scheme.localized("name", lang),
        match_score=score,
        reasons=reasons,
        warnings=warnings,
    )


@router.get("", response_model=PaginatedSchemes)
def list_schemes(
    category: str | None = None,
    state: str | None = None,
    is_published: bool = True,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    stmt = select(Scheme).where(Scheme.is_published == is_published)
    if category:
        stmt = stmt.where(Scheme.category == category)
    if state:
        # states is a JSONB list on eligibility_rules; empty list = central,
        # so also matches. TODO: implement via a JSONB containment query
        # once there's a real database to test the exact operator against.
        pass

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = db.scalar(count_stmt) or 0

    stmt = stmt.offset((page - 1) * limit).limit(limit)
    schemes = db.scalars(stmt).all()

    return PaginatedSchemes(
        items=[_to_scheme_out(s, "en") for s in schemes],
        total=total,
        page=page,
        limit=limit,
    )


#@router.get("/{scheme_id}", response_model=SchemeDetail)
#def get_scheme(scheme_id: str, lang: str = "en", db: Session = Depends(get_db)):
    stmt = select(Scheme).where(Scheme.scheme_code == scheme_id)
    scheme = db.scalar(stmt)
    if scheme is None:
        raise HTTPException(status_code=404, detail=f"Scheme '{scheme_id}' not found")
    return _to_scheme_detail(scheme, lang)


@router.post("/search", response_model=list[SchemeMatch])
def search_schemes(body: SchemeSearchIn, db: Session = Depends(get_db)):
    """Public — no auth, no personalization. Pure query relevance."""
    results = hybrid_search(db, query=body.query, language=body.language, limit=body.limit)
    return [_to_scheme_match(r, body.language) for r in results]


@router.post("/voice-search", response_model=VoiceSchemeSearchOut)
def voice_search_schemes(body: VoiceSchemeSearchIn, db: Session = Depends(get_db)):
    """Public — no auth. Takes the FULL transcribed sentence from
    POST /voice/transcribe, parses gender/age out of it, ranks every real
    published scheme by relevance to the sentence (same scoring path as
    POST /schemes/search), then hard-filters + re-scores using each
    scheme's actual eligibility_rules (gender/min_age/max_age) against the
    parsed profile — so two different speakers stating different
    gender/age genuinely get different result sets, not the same fixed
    list. Exists because /schemes/match needs auth that isn't wired up
    yet (see get_current_user_profile above)."""
    parsed = parse_profile(body.text, body.language)
    profile = UserProfile(gender=parsed["gender"], age=parsed["age"])

    stmt = select(Scheme).where(Scheme.is_published.is_(True))
    all_schemes = list(db.scalars(stmt).all())

    query_embedding = None
    if embedding_service.is_ready:
        query_embedding = np.array(embedding_service.encode(body.text))

    matches = filter_and_score(all_schemes, profile, query_embedding, limit=body.limit)

    return VoiceSchemeSearchOut(
        parsed_profile=ParsedVoiceProfile(gender=parsed["gender"], age=parsed["age"]),
        results=[_to_scheme_match(r, body.language) for r in matches],
    )


@router.post("/match", response_model=list[SchemeMatch])
def match_schemes(
    body: SchemeMatchIn,
    db: Session = Depends(get_db),
    profile: UserProfile = Depends(get_current_user_profile),
):
    """Authenticated — personalized, eligibility-filtered, with reasons."""
    results = get_matches(db, profile=profile, query=body.query, language=body.language)
    return [_to_scheme_match(r, body.language) for r in results]


@router.post("/compare", response_model=SchemeComparison)
def compare_schemes(body: SchemeCompareIn, db: Session = Depends(get_db)):
    stmt = select(Scheme).where(Scheme.scheme_code.in_(body.scheme_ids))
    schemes = db.scalars(stmt).all()
    if len(schemes) != len(body.scheme_ids):
        found = {s.scheme_code for s in schemes}
        missing = set(body.scheme_ids) - found
        raise HTTPException(status_code=404, detail=f"Scheme(s) not found: {', '.join(missing)}")
    return SchemeComparison(schemes=[_to_scheme_detail(s, body.language) for s in schemes])