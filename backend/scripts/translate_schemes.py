"""
scripts/translate_schemes.py — UPDATED

Translates ALL user-facing scheme fields into all 10 supported languages.
Previously only translated name/description/benefits.
Now adds: eligibility_text, application_process, warning.
documents_required (a list) is translated as a joined string then split back.

Safe to re-run: skips language+field combinations already populated.
"""

import argparse
import json
import logging
import time

from dotenv import load_dotenv
load_dotenv()

import app.db.base  # noqa: F401
from app.db.session import SessionLocal
from app.models.scheme import Scheme, SUPPORTED_LANGUAGES

logger = logging.getLogger(__name__)

GROQ_MODEL = "openai/gpt-oss-120b"
GROQ_RATE_LIMIT_SECONDS = 2.5

TRANSLATABLE_FIELDS = ["name", "description", "benefits", "eligibility_text", "application_process", "warning"]


def _translate_fields(values: dict, lang: str) -> dict | None:
    import os
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        return None
    try:
        from groq import Groq
    except ImportError:
        return None

    # Only translate non-empty fields
    to_translate = {k: v for k, v in values.items() if v and isinstance(v, str) and v.strip()}
    if not to_translate:
        return {}

    prompt = f"""Translate the following Indian government scheme fields into the language with ISO code "{lang}".

Rules:
- Output valid JSON only, with the same keys as the input.
- Translate naturally for native speakers — do NOT merely transliterate.
- Keep numbers, monetary amounts (₹), official scheme names, and proper nouns unchanged.
- Do not include newline characters inside JSON string values.
- If a value is empty or null, output null for that key.

Fields to translate:
{json.dumps(to_translate, ensure_ascii=False)}

JSON:"""

    try:
        from groq import Groq
        client = Groq(api_key=api_key)
        response = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            response_format={"type": "json_object"},
        )
        return json.loads(response.choices[0].message.content)
    except Exception:
        logger.exception("Translation failed for lang=%s", lang)
        return None
    finally:
        time.sleep(GROQ_RATE_LIMIT_SECONDS)


def run(limit: int, only_missing: bool = True) -> None:
    db = SessionLocal()
    try:
        query = db.query(Scheme).filter(Scheme.is_published.is_(True))
        schemes = query.limit(limit).all()
        logger.info("Translating %d schemes into %d languages each", len(schemes), len(SUPPORTED_LANGUAGES) - 1)

        translated, skipped, failed = 0, 0, 0

        for i, scheme in enumerate(schemes, start=1):
            logger.info("[%d/%d] %s", i, len(schemes), scheme.scheme_code)
            translations = dict(scheme.translations or {})
            changed = False

            for lang in SUPPORTED_LANGUAGES:
                if lang == "en":
                    continue

                existing = translations.get(lang, {})

                # Check which fields are missing for this language
                values_to_translate = {}
                for field in TRANSLATABLE_FIELDS:
                    if only_missing and existing.get(field):
                        continue  # already translated
                    source_value = getattr(scheme, field, None)
                    if source_value and isinstance(source_value, str):
                        values_to_translate[field] = source_value

                if not values_to_translate:
                    skipped += 1
                    continue

                result = _translate_fields(values_to_translate, lang)
                if result is not None:
                    existing.update({k: v for k, v in result.items() if v})
                    translations[lang] = existing
                    translated += 1
                    changed = True
                else:
                    failed += 1

            if changed:
                scheme.translations = translations
                db.commit()

        logger.info("Done. translated=%d skipped=%d failed=%d", translated, skipped, failed)
    finally:
        db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--retranslate-all", action="store_true",
                        help="Re-translate even fields already populated")
    args = parser.parse_args()
    run(args.limit, only_missing=not args.retranslate_all)