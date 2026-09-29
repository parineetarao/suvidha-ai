"""
scripts/translate_schemes.py

RECOVERED FILE — this was lost during a git merge/checkout operation
tonight (never committed, existed only as an uncommitted local file).
Recreating from the last known-working version.

Translates published schemes (is_published=True) into all 10 supported
languages via Groq, populating the translations JSONB column. Skips any
scheme+language pair that already has translations. Commits per-scheme
so an interrupted run doesn't lose prior progress.

Run with: python -m scripts.translate_schemes --limit 62
"""

import argparse
import json
import logging
import time

from dotenv import load_dotenv

load_dotenv()

import app.db.base  # noqa: F401 — import first, avoids circular import
from app.db.session import SessionLocal
from app.models.scheme import Scheme, SUPPORTED_LANGUAGES

logger = logging.getLogger(__name__)

GROQ_MODEL = "openai/gpt-oss-120b"
GROQ_RATE_LIMIT_SECONDS = 2.5


def _translate_one(name: str, description: str, benefits: str, lang: str) -> dict | None:
    import os
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        logger.warning("GROQ_API_KEY not set — skipping translation.")
        return None
    try:
        from groq import Groq
    except ImportError:
        logger.warning("groq package not installed — skipping translation.")
        return None

    prompt = f"""Translate the following government scheme fields into the language with ISO code "{lang}".

Rules:
- Output valid JSON only, shaped exactly like: {{"name": "...", "description": "...", "benefits": "..."}}
- Translate the text naturally and accurately — do not summarize, paraphrase, or add commentary.
- Keep numbers, monetary amounts (₹), and official scheme names/proper nouns unchanged.
- Do not include any newline characters inside the JSON string values.

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
        return json.loads(raw)
    except Exception:
        logger.exception("Translation failed for lang=%s", lang)
        return None
    finally:
        time.sleep(GROQ_RATE_LIMIT_SECONDS)


def run(limit: int) -> None:
    db = SessionLocal()
    try:
        schemes = db.query(Scheme).filter(Scheme.is_published.is_(True)).limit(limit).all()
        logger.info("Translating %d published scheme(s) into %d language(s) each.", len(schemes), len(SUPPORTED_LANGUAGES) - 1)

        translated, skipped, failed = 0, 0, 0
        for i, scheme in enumerate(schemes, start=1):
            logger.info("[%d/%d] %s", i, len(schemes), scheme.scheme_code)
            translations = dict(scheme.translations or {})

            for lang in SUPPORTED_LANGUAGES:
                if lang == "en":
                    continue
                existing = translations.get(lang, {})
                if existing.get("name") and existing.get("description") and existing.get("benefits"):
                    skipped += 1
                    continue

                result = _translate_one(scheme.name, scheme.description or "", scheme.benefits or "", lang)
                if result:
                    translations[lang] = result
                    translated += 1
                else:
                    failed += 1

            scheme.translations = translations
            db.commit()

        logger.info("Done. translated=%d skipped=%d failed=%d", translated, skipped, failed)
    finally:
        db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=10)
    args = parser.parse_args()
    run(args.limit)
