"""
app/ingestion/myscheme_scraper.py

Playwright-based scraper for myscheme.gov.in — needed because the site is a
JS-rendered Next.js app with no usable public data API (confirmed by direct
investigation: /_next/data/ routes return the empty loading shell, not
scheme content, when fetched without a real browser executing the page's
JavaScript). Playwright drives an actual (headless) browser so the page's
own JS runs and real content appears before we read it.

HONEST STATE OF THIS FILE: this is a reconnaissance-first version, not a
finished scraper. We have never actually seen what the rendered DOM for a
scheme page looks like — every fetch attempt so far returned the pre-render
loading shell. Writing CSS selectors against a structure I've never seen
would be a guess dressed up as code, the same mistake made earlier assuming
async SQLAlchemy. So this file does ONE job for now: load a real scheme
page, wait for the loading spinner to disappear, and save the actual
rendered HTML to disk so we can look at it together and write real,
correct extraction selectors next — informed by real structure, not guesses.

Respects the original brief's scraping ethics: rate-limited (1 request per
5s minimum), honest User-Agent, results treated as unverified/draft until
reviewed — enforced once real extraction exists; this recon step is a
handful of manual runs, not a bulk crawl, so rate limiting matters even
more here to avoid hammering the site while we're still figuring out its
structure.
Owned by: Member 2 — Scheme Discovery Engine.

Run with: python -m app.ingestion.myscheme_scraper --debug-fetch rkvp
      or: python -m app.ingestion.myscheme_scraper --list-slugs 2
      or: python -m app.ingestion.myscheme_scraper --parse-debug rkvp
"""

import argparse
import logging
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

logger = logging.getLogger(__name__)

BASE_URL = "https://www.myscheme.gov.in"
RATE_LIMIT_SECONDS = 5  # minimum gap between requests, per the original brief's scraping ethics
USER_AGENT = "SuvidhaAI-Bot/0.1 (final-year academic project; contact: <your team email>)"

DEBUG_DUMP_DIR = Path("app/ingestion/_debug_dumps")


def debug_fetch_rendered_page(slug: str, save_debug_copy: bool = True) -> str:
    """Loads a real scheme page in a headless browser, waits for the
    client-side content to actually render (not just the loading shell),
    and returns the full rendered HTML.

    save_debug_copy=True (default) also writes a copy to disk for manual
    inspection — useful during development, unnecessary once selectors are
    proven. Batch runs (ingest_myscheme.py) pass save_debug_copy=False so
    they don't accumulate one ~200KB file per scheme processed.
    """
    url = f"{BASE_URL}/schemes/{slug}"
    logger.info("Fetching rendered page: %s", url)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(user_agent=USER_AGENT)
        page.goto(url, wait_until="networkidle")

        try:
            page.wait_for_function(
                "document.querySelector('main') && document.querySelector('main').innerText.length > 200",
                timeout=15000,
            )
        except Exception:
            logger.warning(
                "Content didn't appear to load within 15s for slug '%s' — "
                "proceeding anyway.",
                slug,
            )

        html = page.content()
        browser.close()

    if save_debug_copy:
        DEBUG_DUMP_DIR.mkdir(parents=True, exist_ok=True)
        out_path = DEBUG_DUMP_DIR / f"{slug}.html"
        out_path.write_text(html, encoding="utf-8")
        logger.info("Saved rendered HTML to %s (%d bytes)", out_path, len(html))

    time.sleep(RATE_LIMIT_SECONDS)
    return html


def debug_fetch_search_results(query: str = "") -> str:
    """Same idea, but for the search/listing page — this is what a future
    list_scheme_slugs() function will need to parse to discover scheme
    URLs at scale. Saved for inspection, not parsed yet."""
    url = f"{BASE_URL}/search"
    if query:
        url += f"?q={query}"
    logger.info("Fetching rendered search page: %s", url)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(user_agent=USER_AGENT)
        page.goto(url, wait_until="networkidle")
        try:
            page.wait_for_function(
                "document.body.innerText.includes('schemes based on')",
                timeout=15000,
            )
        except Exception:
            logger.warning("Search results text didn't appear within 15s — saving anyway.")
        html = page.content()
        browser.close()

    DEBUG_DUMP_DIR.mkdir(parents=True, exist_ok=True)
    out_path = DEBUG_DUMP_DIR / "search_results.html"
    out_path.write_text(html, encoding="utf-8")
    logger.info("Saved rendered search HTML to %s (%d bytes)", out_path, len(html))

    time.sleep(RATE_LIMIT_SECONDS)
    return html


def list_scheme_slugs(max_pages: int = 5) -> list[str]:
    """Discovers scheme slugs by paging through the real search results.
    Pagination here is JS-driven (numbered <li> elements with no href),
    not a simple ?page=N URL — confirmed by inspecting real search-page
    HTML — so this clicks through pages in a real browser rather than
    constructing URLs.

    max_pages caps how many result pages to walk (10 schemes/page). The
    full catalog is ~4,770 schemes / 477 pages — this is NOT meant to
    crawl the whole thing in one run; call with a small max_pages while
    testing, and treat the eventual scaled-up run as a separate,
    deliberate decision given rate limiting (5s/page = ~40min for all
    477 pages).
    """
    slugs: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(user_agent=USER_AGENT)
        page.goto(f"{BASE_URL}/search", wait_until="networkidle")
        try:
            page.wait_for_function(
                "document.body.innerText.includes('schemes available')",
                timeout=15000,
            )
        except Exception:
            logger.warning("Results text didn't appear within 15s — proceeding anyway.")

        for page_num in range(1, max_pages + 1):
            cards = page.query_selector_all('div[role="article"] h2 a[href^="/schemes/"]')
            page_slugs = []
            for card in cards:
                href = card.get_attribute("href")
                if href:
                    slug = href.removeprefix("/schemes/")
                    page_slugs.append(slug)
            slugs.extend(page_slugs)
            logger.info("Page %d: found %d schemes (%s)", page_num, len(page_slugs), ", ".join(page_slugs[:3]) + "...")

            if page_num == max_pages:
                break

            # Click the "next page" arrow — the right-chevron SVG at the end
            # of the pagination list, per the real markup inspected.
            next_button = page.query_selector('main svg[viewBox="0 0 24 24"]:has(path[d^="M6.23"])')
            if not next_button:
                logger.info("No 'next' button found — likely reached the last page early.")
                break
            next_button.click()
            time.sleep(RATE_LIMIT_SECONDS)  # rate limit between page loads, per scraping ethics
            page.wait_for_load_state("networkidle")

        browser.close()

    unique_slugs = list(dict.fromkeys(slugs))  # de-dupe while preserving order
    logger.info("Discovered %d unique scheme slugs across %d page(s).", len(unique_slugs), max_pages)
    return unique_slugs

from bs4 import BeautifulSoup


def scrape_scheme(html: str, slug: str) -> dict:
    """Parses a real rendered scheme page into the Scheme model's shape.
    Selectors below are based on actually-inspected HTML (the RKVP scheme
    page), not guessed. Scopes everything to the desktop-view-container to
    avoid double-matching the page's separate (near-duplicate) mobile markup,
    which is also present in the DOM regardless of viewport/CSS visibility.
    """
    soup = BeautifulSoup(html, "html.parser")
    desktop = soup.select_one('[data-testid="desktop-view-container"]')
    if desktop is None:
        raise ValueError(f"Could not find desktop-view-container for slug '{slug}' — page may not have rendered correctly.")

    def section_text(section_id: str) -> str | None:
        """Grabs the plain text of a content section (Details, Benefits,
        Eligibility, Application Process) by its anchor id. Falls back to
        None if the section is missing rather than raising, since not
        every scheme will have every section filled in."""
        section = desktop.select_one(f"#{section_id} .markdown-options")
        if section is None:
            return None
        text = section.get_text(separator=" ", strip=True)
        return text or None

    name_el = desktop.select_one("h1[title]")
    ministry_el = desktop.select_one("h3.text-raven")

    # Tag chips (e.g. "Award", "Farmer", "Krishi") — useful as extra
    # searchable keywords even though our model has no dedicated field
    # for them; folded into the embedded text in seed/normalize step later.
    tags = [el.get_text(strip=True) for el in desktop.select('div[role="button"][aria-label]')]

    documents_required = []
    docs_section = desktop.select_one("#documents-required .markdown-options")
    if docs_section:
        documents_required = [li.get_text(strip=True) for li in docs_section.select("li") if li.get_text(strip=True)]

    faqs = []
    faqs_section = desktop.select_one("#faqs")
    if faqs_section:
        for question_el in faqs_section.select("p.font-bold"):
            # Walk up to the FAQ item's container (a div with "py-4" among its
            # classes) rather than assuming an exact nesting depth — the real
            # page has one more wrapper level than initially assumed here.
            container = question_el.find_parent(
                lambda tag: tag.name == "div" and tag.get("class") and "py-4" in tag.get("class")
            )
            if container:
                answer_el = container.select_one(".markdown-options")
                if answer_el:
                    faqs.append({
                        "question": question_el.get_text(strip=True),
                        "answer": answer_el.get_text(separator=" ", strip=True),
                    })

    source_url = None
    source_link = desktop.select_one("#sources a[href]")
    if source_link:
        source_url = source_link.get("href")

    return {
        "scheme_code": slug,
        "name": name_el.get_text(strip=True) if name_el else None,
        "ministry": ministry_el.get_text(strip=True) if ministry_el else None,
        "description": section_text("details"),
        "benefits": section_text("benefits"),
        "eligibility_text": section_text("eligibility"),
        "application_process": section_text("application-process"),
        "documents_required": documents_required,
        "faqs": faqs,
        "source_url": source_url,
        "application_url": source_url,  # best available link; refine later if a more specific "apply" link exists
        "tags": tags,  # not a model field — informational, for search-text enrichment in normalizer.py
        # Deliberately NOT set: eligibility_rules (structured filter data).
        # Real eligibility is free text (see eligibility_text above) — turning
        # it into structured {income_max, occupations, states, ...} needs a
        # separate extraction step (manual curation or LLM-assisted), not
        # naive parsing. Left as {} here; is_published should stay False
        # until eligibility_rules is filled in by that later step.
        "eligibility_rules": {},
        "is_published": False,
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(description="myScheme recon tool — captures real rendered HTML for inspection")
    parser.add_argument("--debug-fetch", metavar="SLUG", help="Fetch and save one scheme page's rendered HTML, e.g. rkvp")
    parser.add_argument("--debug-search", action="store_true", help="Fetch and save the search results page's rendered HTML")
    parser.add_argument("--parse-debug", metavar="SLUG", help="Parse an already-saved debug HTML file (from --debug-fetch) and print the extracted fields, without re-fetching")
    parser.add_argument("--list-slugs", metavar="N", type=int, help="Discover scheme slugs by paging through search results N pages deep (start small, e.g. 2)")
    args = parser.parse_args()

    if args.debug_fetch:
        debug_fetch_rendered_page(args.debug_fetch)
    elif args.debug_search:
        debug_fetch_search_results()
    elif args.parse_debug:
        html_path = DEBUG_DUMP_DIR / f"{args.parse_debug}.html"
        if not html_path.exists():
            raise SystemExit(f"No saved debug HTML at {html_path} — run --debug-fetch {args.parse_debug} first.")
        import json
        result = scrape_scheme(html_path.read_text(encoding="utf-8"), args.parse_debug)
        print(json.dumps(result, indent=2, ensure_ascii=False))
    elif args.list_slugs:
        found = list_scheme_slugs(max_pages=args.list_slugs)
        for slug in found:
            print(slug)
    else:
        parser.print_help()