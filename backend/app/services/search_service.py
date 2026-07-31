"""
app/services/search_service.py

Hybrid search: combines TF-IDF (keyword overlap) with semantic similarity
(meaning-based, via embedding_service) to rank schemes against a free-text
query. Powers the PUBLIC search endpoint (POST /schemes/search) — no login,
no user profile, query text only.

SCOPE NOTE — resolving a conflict in the original brief: the brief describes
two different weighting formulas (a 25/50/25 tfidf/semantic/rule split in one
place, a 60/40 rule/semantic split in another). The rule-based eligibility
term needs a user profile to compute, which this endpoint doesn't have (it's
public, unauthenticated). So THIS file only ever combines tfidf + semantic.
The rule-based layer — and the final combined 0-100 score with "reasons" —
belongs in matching_service.py, which runs on the authenticated
/schemes/match endpoint where a real user profile exists.

SYNC NOTE: Member 3's app/db/session.py uses synchronous SQLAlchemy
(create_engine + Session, not create_async_engine + AsyncSession). This file
was originally written assuming async and has been corrected to match —
plain `db.scalars(...)`, no `await`, no `async def`. FastAPI runs sync
endpoint functions in a threadpool automatically, so this is not a
performance downgrade, just a different calling convention.
Owned by: Member 2 — Scheme Discovery Engine.
"""

import logging

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.scheme import Scheme
from app.services.embedding_service import embedding_service

logger = logging.getLogger(__name__)

TFIDF_WEIGHT = 0.3
SEMANTIC_WEIGHT = 0.7


class SearchService:
    """Holds an in-memory TF-IDF index over all published schemes.

    Unlike the embedding model (a fixed pre-trained model, loaded once and
    never changed), a TF-IDF vectorizer's vocabulary is built FROM your own
    scheme corpus — so it has to be rebuilt any time a scheme is added,
    edited, or removed. build_index() does that rebuild; call it once at
    startup and again after any scheme write.
    """

    def __init__(self) -> None:
        self._vectorizer: TfidfVectorizer | None = None
        self._tfidf_matrix = None  # sparse matrix: one row per scheme
        self._scheme_codes: list[str] = []  # row i of the matrix <-> scheme_codes[i]

    @property
    def is_ready(self) -> bool:
        return self._vectorizer is not None

    def build_index(self, schemes: list[Scheme]) -> None:
        """Fits a fresh TF-IDF vectorizer over every published scheme's
        name + description. Cheap even for a few thousand rows — this is
        not the expensive part of the pipeline (the embedding model load is)."""
        if not schemes:
            logger.warning("build_index called with zero schemes — TF-IDF search disabled.")
            self._vectorizer = None
            return

        corpus = [f"{s.name} {s.description or ''}" for s in schemes]
        self._vectorizer = TfidfVectorizer()
        self._tfidf_matrix = self._vectorizer.fit_transform(corpus)
        self._scheme_codes = [s.scheme_code for s in schemes]
        logger.info("TF-IDF index built over %d schemes.", len(schemes))

    def tfidf_scores(self, query: str) -> dict[str, float]:
        """Returns {scheme_code: similarity} for every scheme in the index.
        Empty dict if the index isn't built yet — callers treat that as
        'no TF-IDF signal available' and fall back to semantic-only."""
        if not self.is_ready:
            return {}
        query_vector = self._vectorizer.transform([query])
        similarities = cosine_similarity(query_vector, self._tfidf_matrix)[0]
        return dict(zip(self._scheme_codes, similarities))


# Module-level singleton — one shared index across the whole app.
search_service = SearchService()


def hybrid_search(db: Session, query: str, language: str = "en", limit: int = 10) -> list[dict]:
    """The actual search entrypoint the API router calls.

    Returns a list of dicts shaped like:
        {"scheme": Scheme, "score": float 0-1, "tfidf": float, "semantic": float}
    api/v1/schemes.py converts these into SchemeMatch responses — this
    function stays DB/ML-focused and doesn't know about HTTP or Pydantic.
    """
    stmt = select(Scheme).where(Scheme.is_published.is_(True))
    all_schemes = list(db.scalars(stmt).all())

    if not all_schemes:
        return []

    # Semantic scores — always attempted first, since it's the primary
    # signal. Falls back gracefully if the model failed to load.
    semantic_scores: dict[str, float] = {}
    if embedding_service.is_ready:
        query_embedding = np.array(embedding_service.encode(query))
        for scheme in all_schemes:
            if scheme.embedding is None:
                continue
            scheme_vec = np.array(scheme.embedding)
            # Vectors are already normalized, so cosine similarity is a
            # plain dot product — no need for sklearn here.
            semantic_scores[scheme.scheme_code] = float(np.dot(query_embedding, scheme_vec))
    else:
        logger.warning("Embedding model not ready — search running on TF-IDF only.")

    # TF-IDF scores. Rebuild lazily if the index is stale or missing —
    # cheap enough to do here rather than forcing every caller to remember
    # to call build_index() themselves.
    if not search_service.is_ready or set(search_service._scheme_codes) != {s.scheme_code for s in all_schemes}:
        search_service.build_index(all_schemes)
    tfidf_scores = search_service.tfidf_scores(query)

    results = []
    for scheme in all_schemes:
        semantic = semantic_scores.get(scheme.scheme_code, 0.0)
        tfidf = tfidf_scores.get(scheme.scheme_code, 0.0)

        if embedding_service.is_ready:
            combined = SEMANTIC_WEIGHT * semantic + TFIDF_WEIGHT * tfidf
        else:
            # Degraded mode: TF-IDF is the only signal, so it gets full
            # weight rather than being scaled to an artificially low number.
            combined = tfidf

        results.append({
            "scheme": scheme,
            "score": combined,
            "tfidf": tfidf,
            "semantic": semantic,
        })

    results.sort(key=lambda r: r["score"], reverse=True)
    return results[:limit]