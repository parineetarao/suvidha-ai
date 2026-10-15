"""
app/api/v1/schemes.py

The FastAPI HTTP layer for scheme discovery. Every function here is thin
on purpose: parse the request, call a service, shape the result into a
Pydantic response model, and return it.

SYNC NOTE:
Uses a synchronous SQLAlchemy Session from app.db.session.get_db.
Regular def endpoints are run in FastAPI's threadpool automatically.

REMAINING GAP:
get_current_user_profile is a stub returning HTTP 501 until the real
authentication dependency is wired up.
"""

import logging

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.scheme import Scheme
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
from app.services.embedding_service import embedding_service
from app.services.matching_service import (
    UserProfile,
    get_matches,
    match_schemes as strict_match,
)
from app.services.search_service import hybrid_search
from app.services.voice_profile_service import parse_profile

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/schemes", tags=["schemes"])


def get_current_user_profile() -> UserProfile:
    raise HTTPException(
        status_code=501,
        detail=(
            "Auth not wired up yet — POST /schemes/match needs Member 1's "
            "auth dependency to supply a real user profile."
        ),
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
    """
    Accept either a matching_service.MatchResult or a search_service
    result dictionary. Both carry a scheme and score information.
    """
    scheme = result["scheme"] if isinstance(result, dict) else result.scheme

    if isinstance(result, dict):
        score = round(result["score"] * 100)
        reasons = [
            MatchReasonOut(
                factor="semantic_query",
                matched="relevant to your query",
                weight=round(result["semantic"] * 100),
            )
        ]
        warnings = [scheme.warning] if scheme.warning else []
    else:
        score = result.match_score
        reasons = [
            MatchReasonOut(
                factor=reason.factor,
                matched=reason.matched,
                weight=reason.weight,
            )
            for reason in result.reasons
        ]
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
        # State filtering is not implemented here yet.
        # States are stored in eligibility_rules; central schemes
        # should also be considered applicable across states.
        pass

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = db.scalar(count_stmt) or 0

    stmt = stmt.offset((page - 1) * limit).limit(limit)
    schemes = db.scalars(stmt).all()

    return PaginatedSchemes(
        items=[_to_scheme_out(scheme, "en") for scheme in schemes],
        total=total,
        page=page,
        limit=limit,
    )


@router.post("/search", response_model=list[SchemeMatch])
def search_schemes(body: SchemeSearchIn, db: Session = Depends(get_db)):
    """Public search without personalized eligibility filtering."""
    results = hybrid_search(
        db,
        query=body.query,
        language=body.language,
        limit=body.limit,
    )
    return [_to_scheme_match(result, body.language) for result in results]


@router.post("/voice-search", response_model=VoiceSchemeSearchOut)
def voice_search_schemes(
    body: VoiceSchemeSearchIn,
    db: Session = Depends(get_db),
):
    """
    Public voice/text search. Parses the user's profile, then matches
    published schemes against the parsed eligibility information.
    """
    parsed = parse_profile(body.text, body.language)

    profile = UserProfile(
        gender=parsed["gender"],
        age=parsed["age"],
        state_code=parsed["state"],
        occupations=parsed["occupations"],
        category=parsed["caste"],
        bpl=parsed["bpl"],
        annual_income_inr=parsed["annual_income"],
        disability_status=parsed["disability"],
    )

    stmt = select(Scheme).where(Scheme.is_published.is_(True))
    all_schemes = list(db.scalars(stmt).all())

    query_embedding = None
    if embedding_service.is_ready:
        query_embedding = np.array(embedding_service.encode(body.text))

    outcome = strict_match(
        all_schemes,
        profile,
        query_embedding,
        limit=body.limit,
    )

    return VoiceSchemeSearchOut(
        parsed_profile=ParsedVoiceProfile(**parsed),
        results=[
            _to_scheme_match(result, body.language)
            for result in outcome.results
        ],
        missing_fields=outcome.missing_fields,
    )


@router.post("/match", response_model=list[SchemeMatch])
def match_schemes(
    body: SchemeMatchIn,
    db: Session = Depends(get_db),
    profile: UserProfile = Depends(get_current_user_profile),
):
    """Authenticated, personalized matching with eligibility reasons."""
    results = get_matches(
        db,
        profile=profile,
        query=body.query,
        language=body.language,
    )
    return [_to_scheme_match(result, body.language) for result in results]


@router.post("/compare", response_model=SchemeComparison)
def compare_schemes(
    body: SchemeCompareIn,
    db: Session = Depends(get_db),
):
    stmt = select(Scheme).where(
        Scheme.scheme_code.in_(body.scheme_ids)
    )
    schemes = db.scalars(stmt).all()

    if len(schemes) != len(body.scheme_ids):
        found = {scheme.scheme_code for scheme in schemes}
        missing = set(body.scheme_ids) - found
        raise HTTPException(
            status_code=404,
            detail=f"Scheme(s) not found: {', '.join(missing)}",
        )

    return SchemeComparison(
        schemes=[
            _to_scheme_detail(scheme, body.language)
            for scheme in schemes
        ]
    )

@router.post("/smart-search", response_model=list[SchemeMatch])
def smart_search_schemes(body: SchemeSearchIn, db: Session = Depends(get_db)):
    import logging
    import os

    from app.services.candidate_filter import scheme_state_scope
    from app.services.lazy_translate import ensure_translated, translate_texts
    from app.services.match_spec import (confidence, evaluate, explain_en, has_basis,
                                         normalize_profile, status_of)
    from app.services.query_understanding import extract_profile_from_query

    log = logging.getLogger("smart_search")
    top_n = int(os.environ.get("SMART_SEARCH_MAX", "10"))
    floor = int(os.environ.get("SMART_SEARCH_MIN_CONFIDENCE", "40"))
    pool = int(os.environ.get("SMART_SEARCH_POOL", "300"))

    profile = extract_profile_from_query(body.query)
    prof = normalize_profile(profile)
    raw = hybrid_search(db, query=body.query, language=body.language, limit=pool)
    if not raw:
        return []

    scores = [r.get("score") for r in raw if isinstance(r.get("score"), (int, float))]
    top_score = max(scores) if scores else 0

    def relevance(r, rank):
        sc = r.get("score")
        if isinstance(sc, (int, float)) and top_score > 0:
            return max(0.0, sc / top_score)
        return (1 - rank / max(len(raw), 1)) ** 2

    scored, seen, no_spec, no_basis, excluded = [], set(), 0, 0, 0
    for rank, r in enumerate(raw):
        s = r["scheme"]
        if s.scheme_code in seen:
            continue
        seen.add(s.scheme_code)
        spec = (s.eligibility_rules or {}).get("match_spec")
        if not spec:
            no_spec += 1
            continue
        if not has_basis(spec):
            no_basis += 1      # nothing verifiable about who this is for: never recommend it
            continue
        ev = evaluate(spec, prof, scheme_state_scope(s))
        if ev["excluded"]:
            excluded += 1
            continue
        conf = confidence(ev, relevance(r, rank))
        if conf >= floor:
            scored.append((conf, rank, s, ev))

    if seen and no_spec == len(seen):
        raise HTTPException(status_code=503,
                            detail="Scheme match data is not prepared yet (run scripts.extract_match_specs).")

    scored.sort(key=lambda x: (-x[0], x[1]))
    final = scored[:top_n]
    log.info("smart-search '%s': profile=%s | %d evaluated, %d excluded, %d no verifiable info, "
             "%d no spec, %d above floor, %d returned",
             body.query[:60], {k: v for k, v in profile.items() if v not in (None, [], "")},
             len(seen), excluded, no_basis, no_spec, len(scored), len(final))
    for conf, _, s, ev in final:
        log.info("  %3d %-18s %-12s matched=%s unknown=%s other=%s", conf, status_of(ev), s.scheme_code,
                 ev["matched"], ev["core_unknown"] + ev["sec_unknown"], ev["other"])

    texts = [explain_en(ev) for _, _, _, ev in final]
    if body.language != "en":
        texts = translate_texts(texts, body.language)
        ensure_translated(db, [s for _, _, s, _ in final], body.language)

    results = []
    for (conf, _, s, ev), text in zip(final, texts):
        missing = list(dict.fromkeys(ev["core_unknown"] + ev["sec_unknown"]))
        reasons = [
            MatchReasonOut(factor="status", matched=status_of(ev), weight=0),
            MatchReasonOut(factor="llm_eligibility", matched=text, weight=conf),
        ]
        if missing:
            reasons.append(MatchReasonOut(factor="missing_information", matched=", ".join(missing), weight=0))
        results.append(SchemeMatch(
            scheme_id=s.scheme_code,
            name=s.localized("name", body.language),
            match_score=conf,
            reasons=reasons,
            warnings=[s.warning] if s.warning else [],
        ))
    return results