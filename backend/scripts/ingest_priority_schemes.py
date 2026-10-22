"""
scripts/ingest_priority_schemes.py

Targeted ingestion of high-priority scheme categories for SuvidhaAI demo.
Uses myScheme's category/ministry filter pages instead of generic pagination,
so we get the right schemes rather than random catalog entries.

Deduplication: checks scheme_code before inserting.
Quality filter: skips institutional/program-level schemes detected in eligibility_text.

Run: python -m scripts.ingest_priority_schemes
"""

import logging
import time
from typing import Optional

import app.db.base  # noqa: F401
from app.db.session import SessionLocal
from app.ingestion.myscheme_scraper import debug_fetch_rendered_page, scrape_scheme
from app.ingestion.eligibility_extractor import extract_eligibility_rules
from app.models.scheme import Scheme
from app.services.embedding_service import embedding_service
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

logger = logging.getLogger(__name__)

RATE_LIMIT = 5  # seconds between page loads
USER_AGENT = "SuvidhaAI-Bot/0.1 (academic project)"

# Priority search queries mapped to descriptive category labels
# These correspond to myscheme.gov.in search terms that reliably return
# schemes in your priority categories
PRIORITY_SEARCHES = [
    # Senior citizens / pensions
    ("old age pension", "pension"),
    ("senior citizen pension", "pension"),
    ("widow pension", "pension"),
    ("disability pension", "pension"),
    ("social security pension", "pension"),
    # Women / widows
    ("widow assistance women welfare", "women"),
    ("mahila yojana women empowerment", "women"),
    ("maternity benefit women", "women"),
    ("girl child scheme", "women"),
    ("women financial assistance", "women"),
    # Farmers
    ("farmer financial assistance agriculture", "farmer"),
    ("kisan yojana crop support", "farmer"),
    ("agricultural subsidy irrigation", "farmer"),
    ("farm equipment subsidy farmer", "farmer"),
    # Students / scholarships
    ("post matric scholarship", "education"),
    ("pre matric scholarship", "education"),
    ("higher education scholarship", "education"),
    ("professional scholarship student", "education"),
    # Disability
    ("disabled persons scholarship", "disability"),
    ("assistive devices disability", "disability"),
    ("disability financial assistance", "disability"),
    # Housing
    ("housing assistance home construction", "housing"),
    ("rural urban housing subsidy", "housing"),
    # Employment / skill
    ("skill development employment", "employment"),
    ("self employment entrepreneurship", "employment"),
    ("vocational training livelihood", "employment"),
    # Health
    ("health insurance medical assistance", "health"),
    ("maternal child healthcare", "health"),
    ("treatment assistance medical", "health"),
    # Children
    ("child welfare nutrition orphan", "children"),
    ("child scholarship protection", "children"),
    # Workers
    ("construction worker welfare", "workers"),
    ("unorganised worker labour", "workers"),
    # SC/ST/OBC
    ("scheduled caste scholarship welfare", "sc_st_obc"),
    ("scheduled tribe financial assistance", "sc_st_obc"),
    ("OBC backward class scheme", "sc_st_obc"),
    # Maharashtra specific
    ("Maharashtra state scheme welfare", "maharashtra"),
    ("Maharashtra women farmer scheme", "maharashtra"),
]

# Institutional scheme markers — skip these
INSTITUTIONAL_MARKERS = [
    "institution eligible", "institutions can apply", "university eligible",
    "college eligible", "organisation eligible", "organization eligible",
    "ngo eligible", "company eligible", "research institution",
    "deemed university", "government department", "local body",
    "municipal corporation eligible", "panchayat eligible",
    "eligible institution", "recognized institution shall apply",
]


def _is_institutional(eligibility_text: str) -> bool:
    if not eligibility_text:
        return False
    lower = eligibility_text.lower()
    return any(marker in lower for marker in INSTITUTIONAL_MARKERS)


def _discover_slugs_for_query(query: str, max_results: int = 15) -> list[str]:
    """Fetches scheme slugs from myscheme.gov.in search for a given query."""
    slugs = []
    url = f"https://www.myscheme.gov.in/search?q={query.replace(' ', '%20')}"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(user_agent=USER_AGENT)
        try:
            page.goto(url, wait_until="networkidle")
            page.wait_for_function(
                "document.body.innerText.includes('schemes') || document.body.innerText.includes('found')",
                timeout=15000,
            )
            time.sleep(2)
            html = page.content()
            soup = BeautifulSoup(html, "html.parser")
            links = soup.select('div[role="article"] a[href^="/schemes/"]')
            for link in links[:max_results]:
                href = link.get("href", "")
                slug = href.removeprefix("/schemes/")
                if slug:
                    slugs.append(slug)
        except Exception:
            logger.exception("Failed to discover slugs for query: %s", query)
        finally:
            browser.close()

    time.sleep(RATE_LIMIT)
    return list(dict.fromkeys(slugs))  # deduplicate, preserve order


def _scheme_exists(db, scheme_code: str, scheme_name: str) -> bool:
    """Check both scheme_code and name to avoid duplicates."""
    by_code = db.query(Scheme).filter(Scheme.scheme_code == scheme_code).first()
    if by_code:
        return True
    # Also check for near-duplicate names (case-insensitive)
    by_name = db.query(Scheme).filter(
        Scheme.name.ilike(f"%{scheme_name[:40]}%")
    ).first()
    return by_name is not None


def run(dry_run: bool = False) -> None:
    embedding_service.load()
    db = SessionLocal()

    all_slugs_seen = set()
    inserted = 0
    skipped_duplicate = 0
    skipped_institutional = 0
    skipped_no_content = 0
    failed = 0

    try:
        for query, category in PRIORITY_SEARCHES:
            logger.info("Searching: '%s' (category: %s)", query, category)
            slugs = _discover_slugs_for_query(query, max_results=15)
            logger.info("  Found %d slugs", len(slugs))

            for slug in slugs:
                if slug in all_slugs_seen:
                    continue
                all_slugs_seen.add(slug)

                # Quick existence check before fetching
                existing = db.query(Scheme).filter(Scheme.scheme_code == slug).first()
                if existing:
                    logger.debug("  Skipping existing: %s", slug)
                    skipped_duplicate += 1
                    continue

                try:
                    html = debug_fetch_rendered_page(slug, save_debug_copy=False)
                    scraped = scrape_scheme(html, slug)
                except Exception:
                    logger.warning("  Failed to scrape: %s", slug)
                    failed += 1
                    continue

                if not scraped.get("name"):
                    skipped_no_content += 1
                    continue

                # Skip institutional schemes
                if _is_institutional(scraped.get("eligibility_text", "")):
                    logger.info("  Skipping institutional: %s — %s", slug, scraped["name"])
                    skipped_institutional += 1
                    continue

                # Full duplicate check with name
                if _scheme_exists(db, slug, scraped["name"]):
                    skipped_duplicate += 1
                    continue

                # Extract eligibility rules
                eligibility_rules = extract_eligibility_rules(
                    scraped.get("eligibility_text", ""), slug
                )

                # Embed
                text_to_embed = f"{scraped['name']}. {scraped.get('description', '')} {scraped.get('eligibility_text', '')}"
                embedding = None
                if embedding_service.is_ready:
                    embedding = embedding_service.encode(text_to_embed)

                scheme = Scheme(
                    scheme_code=slug,
                    name=scraped["name"],
                    ministry=scraped.get("ministry"),
                    description=scraped.get("description"),
                    benefits=scraped.get("benefits"),
                    eligibility_text=scraped.get("eligibility_text"),
                    application_process=scraped.get("application_process"),
                    faqs=scraped.get("faqs", []),
                    documents_required=scraped.get("documents_required", []),
                    application_url=scraped.get("application_url"),
                    source_url=scraped.get("source_url"),
                    eligibility_rules=eligibility_rules,
                    is_published=True,  # publish immediately — LLM reranker handles filtering
                    embedding=embedding,
                    translations={},
                    warning=None,
                    rejection_risks=[],
                )

                if not dry_run:
                    db.add(scheme)
                    db.commit()
                    inserted += 1
                    logger.info("  ✓ Inserted: %s — %s", slug, scraped["name"][:60])
                else:
                    logger.info("  [DRY RUN] Would insert: %s — %s", slug, scraped["name"][:60])
                    inserted += 1

    finally:
        db.close()

    logger.info(
        "\nDone. inserted=%d skipped_duplicate=%d skipped_institutional=%d "
        "skipped_no_content=%d failed=%d",
        inserted, skipped_duplicate, skipped_institutional, skipped_no_content, failed,
    )


if __name__ == "__main__":
    import argparse
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Discover and log, do not insert")
    args = parser.parse_args()
    run(dry_run=args.dry_run)