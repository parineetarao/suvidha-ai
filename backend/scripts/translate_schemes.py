"""
scripts/translate_schemes.py

Batch-translates published schemes' name/description/benefits into the 9
non-English languages in SUPPORTED_LANGUAGES (app/models/scheme.py), using
Groq — same free-tier model and rate-limit pattern as
app/ingestion/eligibility_extractor.py.

One Groq call per scheme per language (not per field), asking for JSON
shaped like {"name": "...", "description": "...", "benefits": "..."} in the
target language. Only ever operates on is_published=True schemes, and skips
any scheme+language pair that already has a non-empty entry in
translations, so the script is safely re-runnable.

Run with: python -m scripts.translate_schemes --limit 10
"""

import argparse
import json
import logging
import os
import time

from dotenv import load_dotenv

load_dotenv()  # .env isn't read into os.environ automatically — this is what actually does it

from app.db.session import SessionLocal
import app.db.base  # noqa: F401 — import first so base.py's own model
                      # registration runs before we ask for Scheme directly
                      # (avoids a circular import — same fix as ingest_myscheme.py)
from app.models.scheme import SUPPORTED_LANGUAGES, Scheme

logger = logging.getLogger(__name__)

GROQ_MODEL = "llama-3.3-70b-versatile"
GROQ_RATE_LIMIT_SECONDS = 2.5  # keeps well under Groq's free-tier ~30 requests/minute cap

TARGET_LANGUAGES = [lang for lang in SUPPORTED_LANGUAGES if lang != "en"]

LANGUAGE_NAMES = {
    "hi": "Hindi",
    "mr": "Marathi",
    "ta": "Tamil",
    "te": "Telugu",
    "kn": "Kannada",
    "ml": "Malayalam",
    "bn": "Bengali",
    "gu": "Gujarati",
    "pa": "Punjabi",
}


def _translate_fields(name: str, description: str, benefits: str, lang: str) -> dict | None:
    """Asks Groq to translate name/description/benefits into a single target
    language in one call. Returns None on any failure (missing API key,
    network error, bad response) rather than raising — a failed translation
    should be skipped and logged, not crash the whole run."""
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        logger.warning("GROQ_API_KEY not set — skipping translation pass.")
        return None

    try:
        from groq import Groq
    except ImportError:
        logger.warning("groq package not installed (pip install groq) — skipping translation pass.")
        return None

    language_name = LANGUAGE_NAMES.get(lang, lang)
    prompt = f"""Translate the following government welfare scheme text from English into {language_name}.

Rules:
- Translate all three fields: name, description, benefits.
- Keep the meaning precise — this is official government scheme information shown to citizens.
- Preserve any numbers, amounts, and proper nouns (scheme names, ministry names) that don't have a natural translation.
- If a field is empty in the source, output it as an empty string in the translation.
- Output valid JSON only, no other text, shaped like: {{"name": "...", "description": "...", "benefits": "..."}}

Source (English):
name: {name}
description: {description}
benefits: {benefits}

JSON:"""

    try:
        client = Groq(api_key=api_key)
        response = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content
        parsed = json.loads(raw)
        if not all(k in parsed for k in ("name", "description", "benefits")):
            logger.warning("Translation response missing expected fields for lang '%s': %s", lang, parsed)
            return None
        return {
            "name": parsed.get("name") or "",
            "description": parsed.get("description") or "",
            "benefits": parsed.get("benefits") or "",
        }
    except Exception:
        logger.exception("Groq translation call failed for lang '%s'.", lang)
        return None
    finally:
        time.sleep(GROQ_RATE_LIMIT_SECONDS)


def translate_scheme(scheme: Scheme) -> tuple[int, int, int]:
    """Translates one scheme into every missing target language. Returns
    (translated, skipped, failed) counts for this scheme."""
    translations = dict(scheme.translations or {})
    translated, skipped, failed = 0, 0, 0

    for lang in TARGET_LANGUAGES:
        existing = translations.get(lang)
        if existing and existing.get("name") and existing.get("description") and existing.get("benefits"):
            skipped += 1
            continue

        result = _translate_fields(scheme.name, scheme.description or "", scheme.benefits or "", lang)
        if result is None:
            logger.warning("Failed to translate scheme '%s' into '%s' — skipping.", scheme.scheme_code, lang)
            failed += 1
            continue

        translations[lang] = result
        translated += 1

    scheme.translations = translations
    return translated, skipped, failed


def run(limit: int) -> None:
    db = SessionLocal()
    total_translated, total_skipped, total_failed = 0, 0, 0
    try:
        schemes = (
            db.query(Scheme)
            .filter(Scheme.is_published.is_(True))
            .limit(limit)
            .all()
        )
        logger.info("Found %d published scheme(s) to process (limit=%d).", len(schemes), limit)

        for i, scheme in enumerate(schemes, start=1):
            logger.info("[%d/%d] %s", i, len(schemes), scheme.scheme_code)
            translated, skipped, failed = translate_scheme(scheme)
            total_translated += translated
            total_skipped += skipped
            total_failed += failed
            db.commit()  # commit per-scheme, so an interrupted run doesn't lose earlier work
    finally:
        db.close()

    logger.info(
        "Translation run complete: %d pair(s) translated, %d skipped (already had translations), %d failed.",
        total_translated, total_skipped, total_failed,
    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(description="Batch-translate published schemes into SUPPORTED_LANGUAGES via Groq")
    parser.add_argument("--limit", type=int, default=10, help="Max number of published schemes to process in one run. Default 10.")
    args = parser.parse_args()
    run(args.limit)
