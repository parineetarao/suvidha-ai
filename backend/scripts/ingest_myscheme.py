"""
scripts/ingest_myscheme.py

The batch runner that actually chains the three proven ingestion pieces
together and writes to the database:
  1. list_scheme_slugs()        (app/ingestion/myscheme_scraper.py)
  2. scrape_scheme() per slug   (app/ingestion/myscheme_scraper.py)
  3. extract_eligibility_rules() (app/ingestion/eligibility_extractor.py)
  4. insert as a Scheme row, is_published=False

SCOPE — deliberately small by default. The full catalog is ~4,770 schemes
across 477 pages; this script defaults to 2 pages / ~20 schemes so a first
run is fast to eyeball and cheap on the Groq free tier. Scale up via
--pages once you've reviewed a small batch and are confident in the
pipeline, not before.

Everything inserted here is a DRAFT: is_published=False, eligibility_rules
marked needs_review=True. Nothing here becomes visible to real users
until an admin reviews and flips is_published, per the review-gate
pattern used throughout Member 2's ingestion pipeline.

Run with: python -m scripts.ingest_myscheme --pages 2
"""

import argparse
import logging

from app.db.session import SessionLocal
import app.db.base  # noqa: F401 — import first so base.py's own model
                      # registration runs before we ask for Scheme directly
                      # (avoids a circular import — same fix as seed_schemes.py)
from app.ingestion.eligibility_extractor import extract_eligibility_rules
from app.ingestion.myscheme_scraper import (
    debug_fetch_rendered_page,
    list_scheme_slugs,
    scrape_scheme,
)
from app.models.scheme import Scheme
from app.services.embedding_service import embedding_service

logger = logging.getLogger(__name__)


def ingest_scheme(db, slug: str) -> bool:
    """Scrapes, extracts eligibility, embeds, and upserts one scheme as a
    draft. Returns True on success, False if this one scheme failed —
    a single bad scheme should not abort the whole batch."""
    try:
        html = debug_fetch_rendered_page(slug)
        scraped = scrape_scheme(html, slug)
    except Exception:
        logger.exception("Failed to scrape slug '%s' — skipping.", slug)
        return False

    if not scraped.get("name"):
        logger.warning("Slug '%s' scraped but has no name — likely a bad page, skipping.", slug)
        return False

    eligibility_rules = extract_eligibility_rules(scraped.get("eligibility_text", ""), slug)

    # tags from the page (not a model field) get folded into the text we
    # embed, so search can match on them even though there's no dedicated column
    tags_text = " ".join(scraped.get("tags", []))
    text_to_embed = f"{scraped['name']}. {scraped.get('description', '')} {scraped.get('eligibility_text', '')} {tags_text}"
    embedding = None
    if embedding_service.is_ready:
        embedding = embedding_service.encode(text_to_embed)
    else:
        logger.warning("Embedding model not ready — inserting '%s' without an embedding.", slug)

    row_data = {
        "scheme_code": slug,
        "name": scraped["name"],
        "ministry": scraped.get("ministry"),
        "description": scraped.get("description"),
        "benefits": scraped.get("benefits"),
        "eligibility_text": scraped.get("eligibility_text"),
        "application_process": scraped.get("application_process"),
        "faqs": scraped.get("faqs", []),
        "documents_required": scraped.get("documents_required", []),
        "application_url": scraped.get("application_url"),
        "source_url": scraped.get("source_url"),
        "eligibility_rules": eligibility_rules,
        "is_published": False,  # always — a human decides when this goes live
        "embedding": embedding,
    }

    existing = db.query(Scheme).filter(Scheme.scheme_code == slug).first()
    if existing:
        for key, value in row_data.items():
            setattr(existing, key, value)
        logger.info("Updated draft scheme: %s (%s)", slug, scraped["name"])
    else:
        db.add(Scheme(**row_data))
        logger.info("Inserted draft scheme: %s (%s)", slug, scraped["name"])

    return True


def run(pages: int) -> None:
    embedding_service.load()

    logger.info("Discovering scheme slugs across %d page(s)...", pages)
    slugs = list_scheme_slugs(max_pages=pages)
    logger.info("Found %d unique slugs. Beginning ingestion...", len(slugs))

    db = SessionLocal()
    succeeded, failed = 0, 0
    try:
        for i, slug in enumerate(slugs, start=1):
            logger.info("[%d/%d] Processing '%s'...", i, len(slugs), slug)
            if ingest_scheme(db, slug):
                succeeded += 1
            else:
                failed += 1
            db.commit()  # commit per-scheme, so one late failure doesn't roll back earlier successes
    finally:
        db.close()

    logger.info("Batch complete: %d succeeded, %d failed, out of %d total.", succeeded, failed, len(slugs))
    logger.info("All inserted as DRAFTS (is_published=False) — review before publishing.")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(description="Batch-ingest schemes from myscheme.gov.in as draft rows")
    parser.add_argument("--pages", type=int, default=2, help="Number of search-result pages to ingest (10 schemes/page). Default 2 — start small.")
    args = parser.parse_args()
    run(args.pages)