"""
scripts/reembed_schemes.py

Quick fix-forward script: re-computes the embedding for every scheme
already in the database, now that eligibility_text is included in what
gets embedded (previously only name + description — meant search could
miss eligibility-specific terms like "cancer patient" that only appear
in eligibility_text, not the scheme's name/description).

Run with: python -m scripts.reembed_schemes
"""

import logging

import app.db.base  # noqa: F401 — import first, avoids circular import
from app.db.session import SessionLocal
from app.models.scheme import Scheme
from app.services.embedding_service import embedding_service

logger = logging.getLogger(__name__)


def run() -> None:
    embedding_service.load()
    db = SessionLocal()
    try:
        schemes = db.query(Scheme).all()
        logger.info("Re-embedding %d scheme(s)...", len(schemes))

        for i, scheme in enumerate(schemes, start=1):
            text = f"{scheme.name}. {scheme.description or ''} {scheme.eligibility_text or ''}"
            scheme.embedding = embedding_service.encode(text)
            if i % 20 == 0:
                logger.info("[%d/%d] re-embedded", i, len(schemes))
                db.commit()  # periodic commit so progress isn't lost on interruption

        db.commit()
        logger.info("Done. Re-embedded %d scheme(s).", len(schemes))
    finally:
        db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()