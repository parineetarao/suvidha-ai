"""
Adds famous schemes by myScheme slug in ONE command:
scrape -> publish -> eligibility spec -> names in all languages -> mark "featured" (ranked higher).
A slug already in the database is just published and marked featured.

  python -m scripts.ingest_slugs mmlby apy pmjdy pmmvy cmlby
Slug = the part after /schemes/ in the scheme's myScheme URL.
"""
import logging
import sys
import time

import app.db.base  # noqa: F401
from app.db.session import SessionLocal
from app.models.scheme import SUPPORTED_LANGUAGES, Scheme
from app.services.embedding_service import embedding_service
from app.services.lazy_translate import ensure_translated
from app.services.llm_client import LLMError, chat_json, parse_json
from app.services.match_spec import has_basis, normalize_spec
from scripts.extract_match_specs import build_prompt
from scripts.ingest_myscheme import ingest_scheme


def feature(db, scheme):
    rules = dict(scheme.eligibility_rules or {})
    rules["featured"] = True
    scheme.eligibility_rules = rules
    scheme.is_published = True
    db.commit()


def main(slugs):
    embedding_service.load()
    db = SessionLocal()
    new, existing, failed = [], [], []
    try:
        for slug in dict.fromkeys(slugs):
            row = db.query(Scheme).filter(Scheme.scheme_code == slug).first()
            if row:
                feature(db, row)
                existing.append(slug)
                print(f"already in DB, marked featured: {slug} -> {row.name}")
                continue
            try:
                ok = ingest_scheme(db, slug)
                if ok:
                    db.commit()          # ingest_scheme only adds the row; save it before looking it up
            except Exception as exc:
                print("   error:", exc)
                ok = False
            row = db.query(Scheme).filter(Scheme.scheme_code == slug).first() if ok else None
            if row is None:
                db.rollback()
                failed.append(slug)
                print(f"FAILED (dead slug, or the page did not render): {slug}")
                continue
            feature(db, row)
            new.append(row)
            print(f"added: {slug} -> {row.name}")

        for i in range(0, len(new), 5):
            chunk = new[i:i + 5]
            try:
                parsed = parse_json(chat_json(build_prompt(chunk), timeout=90))
            except (LLMError, ValueError) as exc:
                print("eligibility extraction failed for a batch:", exc)
                continue
            specs = parsed.get("specs") if isinstance(parsed.get("specs"), dict) else {}
            for s in chunk:
                raw = specs.get(s.scheme_code)
                if isinstance(raw, dict):
                    rules = dict(s.eligibility_rules or {})
                    rules["match_spec"] = normalize_spec(raw)
                    s.eligibility_rules = rules
            db.commit()
            time.sleep(3)

        for lang in SUPPORTED_LANGUAGES:
            if lang != "en" and new:
                ensure_translated(db, new, lang, pause=2.0)

        no_spec = [s.scheme_code for s in new if not has_basis((s.eligibility_rules or {}).get("match_spec"))]
        print(f"\nnew: {len(new)} | already present: {len(existing)} | failed: {failed}")
        if no_spec:
            print("no eligibility spec yet (re-run `python -m scripts.extract_match_specs`):", no_spec)
    finally:
        db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.WARNING)
    main(sys.argv[1:])