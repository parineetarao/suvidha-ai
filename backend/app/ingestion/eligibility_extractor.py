"""
app/ingestion/eligibility_extractor.py

Turns a scheme's free-text eligibility paragraph (as scraped from
myscheme.gov.in — see myscheme_scraper.py) into the structured
eligibility_rules JSON that matching_service.py's hard-eligibility filter
actually needs (min_age, max_age, gender, categories, income_max,
occupations, states).

TWO-PASS DESIGN:
  1. Regex pass — cheap, instant, catches the common/obvious patterns
     (age thresholds, gender, SC/ST/OBC/BPL category mentions). Free.
  2. LLM pass (Groq) — for whatever fields the regex pass couldn't
     confidently fill, ask an LLM to read the full paragraph and extract
     structured values. Only called for gaps, not for every field, to
     keep API usage low.

Every extracted field is tagged with where it came from (regex/llm) and
the whole result is marked needs_review — nothing here ever sets
is_published on a scheme. A human confirms before anything goes live,
same review-gate pattern already used for translations and scraped
scheme content.
Owned by: Member 2 — Scheme Discovery Engine.

Setup: needs a free Groq API key (console.groq.com, no credit card) set
as the GROQ_API_KEY environment variable. Not yet added to app/config.py
or .env.example — add it there if you want it read through Member 3's
settings object instead of read directly here.

Run with: python -m app.ingestion.eligibility_extractor --parse-debug rkvp
"""

import json
import logging
import os
import re
import time

from dotenv import load_dotenv

load_dotenv()  # .env isn't read into os.environ automatically — this is what actually does it

logger = logging.getLogger(__name__)

GROQ_MODEL = "openai/gpt-oss-120b"
GROQ_RATE_LIMIT_SECONDS = 2.5  # keeps well under Groq's free-tier ~30 requests/minute cap

TARGET_FIELDS = ["min_age", "max_age", "gender", "categories", "income_max", "occupations", "states"]


# ---------------------------------------------------------------------------
# Pass 1 — regex
# ---------------------------------------------------------------------------

def _regex_extract(text: str) -> dict:
    """Cheap, deterministic pattern matching for the most common,
    consistently-worded eligibility phrases. Returns only the fields it's
    confident about — leaves everything else out entirely, so the caller
    can tell "not found" apart from "found and is None"."""
    result: dict = {}
    if not text:
        return result

    lower = text.lower()

    max_age_match = re.search(r"(?:below|under|less than)\s+(\d{1,3})\s*years", lower)
    if max_age_match:
        result["max_age"] = int(max_age_match.group(1))

    min_age_match = re.search(r"(?:above|over|at least|minimum)\s+(\d{1,3})\s*years", lower)
    if min_age_match:
        result["min_age"] = int(min_age_match.group(1))

    # NOTE: gender is deliberately NOT regex-matched here. Real eligibility
    # text often uses conditional phrasing like "if the applicant is male,
    # he must be from SC/ST category" — which does NOT mean the scheme is
    # restricted to men (Stand-Up India is exactly this case: it's actually
    # SC/ST-of-any-gender OR women-of-any-category, an OR condition a flat
    # keyword match on "male"/"female" gets confidently, silently wrong).
    # Left entirely to the LLM pass, which has a better chance of reading
    # the full sentence rather than pattern-matching one word in it.

    categories = []
    for label, pattern in [
        ("SC", r"\bsc\b|scheduled caste"),
        ("ST", r"\bst\b|scheduled tribe"),
        ("OBC", r"\bobc\b|other backward class"),
        ("BPL", r"\bbpl\b|below poverty line"),
        ("General", r"\bgeneral category\b"),
    ]:
        if re.search(pattern, lower):
            categories.append(label)
    if categories:
        result["categories"] = categories

    income_match = re.search(r"income\D{0,15}(?:up to|below|less than)?\D{0,5}₹?\s*([\d,]{3,})", lower)
    if income_match:
        raw = income_match.group(1).replace(",", "")
        if raw.isdigit():
            result["income_max"] = int(raw)

    return result


# ---------------------------------------------------------------------------
# Pass 2 — Groq LLM, only for whatever regex missed
# ---------------------------------------------------------------------------

def _llm_extract(text: str, already_found_fields: list[str]) -> dict:
    """Asks Groq's free-tier Llama 3.3 70B to extract whatever eligibility
    fields the regex pass didn't confidently find. Returns {} on any
    failure (missing API key, network error, bad response) rather than
    raising — a failed LLM pass should degrade to 'field stays empty,
    needs manual review' not crash the whole ingestion run."""
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        logger.warning("GROQ_API_KEY not set — skipping LLM extraction pass, all remaining fields stay empty.")
        return {}

    remaining_fields = [f for f in TARGET_FIELDS if f not in already_found_fields]
    if not remaining_fields:
        return {}  # regex already got everything we need

    try:
        from groq import Groq
    except ImportError:
        logger.warning("groq package not installed (pip install groq) — skipping LLM extraction pass.")
        return {}

    prompt = f"""Read this government scheme eligibility text and extract ONLY these fields: {", ".join(remaining_fields)}.

Field meanings (be precise — these are NOT about award tiers or application categories the scheme itself defines):
- min_age / max_age: numeric age requirements, in years.
- gender: "male", "female", or null. IMPORTANT — only set this if the scheme is UNCONDITIONALLY restricted to one gender. Watch for conditional phrasing like "if the applicant is male, he must be from SC/ST category" — this does NOT mean the scheme is male-only; it often means the real condition is an OR (e.g. SC/ST of any gender, OR women of any category) which this field cannot represent. If the eligibility is conditional or an OR across gender and category, set gender to null and rely on the categories field instead, even though that loses some nuance.
- categories: ONLY social/demographic reservation categories — SC, ST, OBC, General, BPL, PVTG, or similar. Do NOT include the scheme's own internal award tracks, application categories, or applicant types (e.g. ignore things like "individual vs team", "innovation category", "young scientist category" — those are not what this field means).
- occupations: the applicant's profession/role (e.g. "farmer", "scientist", "student"), not the scheme name.
- income_max: a numeric income ceiling in INR, or null if no income condition is mentioned.
- states: Indian states/UTs this scheme is restricted to, or [] if it's a central/nationwide scheme with no state restriction.

WORKED EXAMPLE (a real case that trips up naive extraction — learn from it):
Text: "Finance is provided for Greenfield Enterprises. If the applicant is a male, he must be from SC / ST category. The age of the applicant must be at least 18 years."
WRONG extraction: {{"gender": "male", ...}} — this looks right at a glance because the word "male" appears, but it's wrong: the real scheme (Stand-Up India) is for SC/ST entrepreneurs of ANY gender, OR women entrepreneurs of any category. The sentence is a conditional ("if male, then...") not a restriction to men.
CORRECT extraction: {{"gender": null, "min_age": 18, "categories": ["SC", "ST"]}} — gender is null because the true condition is an OR this field can't represent; categories captures the part that IS safely expressible.

Rules:
- First, in a "reasoning" field, write ONE short sentence per field about why you're setting it (or why you're leaving it null) — this catches mistakes before you commit to an answer.
- Then provide the actual extracted values.
- Output valid JSON only, no other text, shaped like: {{"reasoning": "...", "extracted": {{"field_name": value, ...}}}}
- If a field is genuinely not mentioned or not determinable, use null (or [] for list fields) — never guess or infer from unrelated terminology.

Eligibility text:
\"\"\"{text}\"\"\"

JSON:"""

    try:
        client = Groq(api_key=api_key)
        response = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,  # deterministic extraction, not creative generation
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content
        parsed = json.loads(raw)
        reasoning = parsed.get("reasoning", "")
        if reasoning:
            logger.info("LLM reasoning: %s", reasoning)
        extracted = parsed.get("extracted", {})
        # Only keep the fields we actually asked for, and only non-null ones
        return {k: v for k, v in extracted.items() if k in remaining_fields and v not in (None, [], "")}
    except Exception:
        logger.exception("Groq extraction call failed — remaining fields stay empty, needs manual review.")
        return {}
    finally:
        time.sleep(GROQ_RATE_LIMIT_SECONDS)


# ---------------------------------------------------------------------------
# Combined entrypoint
# ---------------------------------------------------------------------------

def extract_eligibility_rules(eligibility_text: str, scheme_code: str = "") -> dict:
    """Main entrypoint. Returns a dict shaped for Scheme.eligibility_rules,
    plus a parallel _field_sources map and a needs_review flag — never
    sets is_published, that stays a human decision downstream."""
    if not eligibility_text:
        return {"needs_review": True, "_field_sources": {}}

    regex_result = _regex_extract(eligibility_text)
    field_sources = {field: "regex" for field in regex_result}

    llm_result = _llm_extract(eligibility_text, already_found_fields=list(regex_result.keys()))
    for field, value in llm_result.items():
        field_sources[field] = "llm"

    merged = {**regex_result, **llm_result}
    merged["needs_review"] = True
    merged["_field_sources"] = field_sources

    logger.info(
        "Extracted eligibility for '%s': %d field(s) via regex, %d via LLM, needs_review=True",
        scheme_code, len(regex_result), len(llm_result),
    )
    return merged


if __name__ == "__main__":
    import argparse
    from pathlib import Path

    from app.ingestion.myscheme_scraper import scrape_scheme

    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(description="Eligibility text -> structured rules extractor")
    parser.add_argument("--parse-debug", metavar="SLUG", help="Run extraction against an already-scraped debug HTML file's eligibility_text")
    args = parser.parse_args()

    if args.parse_debug:
        html_path = Path("app/ingestion/_debug_dumps") / f"{args.parse_debug}.html"
        if not html_path.exists():
            raise SystemExit(f"No saved debug HTML at {html_path} — run the scraper's --debug-fetch first.")
        scraped = scrape_scheme(html_path.read_text(encoding="utf-8"), args.parse_debug)
        result = extract_eligibility_rules(scraped.get("eligibility_text", ""), args.parse_debug)
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        parser.print_help()
