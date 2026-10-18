"""
Reads each published scheme's eligibility text ONCE and stores a structured match_spec in
eligibility_rules["match_spec"] (JSONB column, no migration). Human-verified rules (hand-seeded
and reviewed schemes) are passed to the model as authoritative, so those schemes are not
treated as "no requirements" just because they have no eligibility text.

  python -m scripts.extract_match_specs                  # only schemes without a spec
  python -m scripts.extract_match_specs --redo-weak      # also: empty specs + schemes with verified rules
  python -m scripts.extract_match_specs --redo           # everything
  python -m scripts.extract_match_specs --show pmkisan sukanya_samriddhi
"""
import argparse
import json
import logging
import time

from dotenv import load_dotenv

load_dotenv()

import app.db.base  # noqa: F401,E402
from app.db.session import SessionLocal  # noqa: E402
from app.models.scheme import Scheme  # noqa: E402
from app.services.llm_client import LLMError, chat_json, parse_json  # noqa: E402
from app.services.match_spec import (  # noqa: E402
    CATEGORIES, FLAGS, OCCUPATION_GROUPS, has_basis, normalize_spec,
)

logger = logging.getLogger(__name__)
IGNORED_KEYS = {"match_spec", "needs_review", "_field_sources", "featured"}

INSTRUCTIONS = f"""You convert Indian government scheme eligibility information into structured requirements. Use ONLY the information given for each scheme. Never guess.
For each scheme return an object with these keys:
- institutional: true only if the applicants are organisations, institutions, companies or departments, not individual people.
- states: Indian states/UTs the applicant must reside in or belong to; [] if not restricted.
- gender: "female" or "male" only if the scheme is for that gender unconditionally; otherwise null.
- age_min, age_max: integers or null. These are the applicant's AGE, never years of service or experience.
- income_max: annual income ceiling in INR (convert monthly to annual), or null.
- categories_any: subset of {CATEGORIES}, ONLY if the scheme is restricted to those groups; [] if open to all.
- flags_all: subset of {FLAGS} that are MANDATORY for every applicant; otherwise [].
- occupations_any: subset of {OCCUPATION_GROUPS}, ONLY if applicants must work as / be one of those; [] otherwise.
- other_conditions: up to 4 short English phrases for important mandatory conditions not captured above (e.g. "enrolled in Class 11", "owns at least 1.5 acres", "marks above 65%").
VERIFIED RULES, when present, were checked by a human and are authoritative: if they conflict with the text, trust them. Their keys map like this: min_age/max_age -> age_min/age_max; income_max -> income_max; states -> states; gender -> gender; categories -> categories_any (if BPL is the only category, use flags_all ["bpl"]); occupations -> the nearest occupations_any groups; a mandatory disability requirement -> flags_all ["disabled"].
If the eligibility is an OR between different groups (e.g. "SC/ST of any gender, or women of any category"), do not encode any part of it as a restriction; describe it in other_conditions.
If there is no eligibility text and no verified rules, leave every restriction empty and set other_conditions to ["eligibility not stated"]."""


def verified_rules(s):
    rules = s.eligibility_rules or {}
    if rules.get("needs_review") is True:      # auto-extracted and never reviewed: not trustworthy
        return {}
    return {k: v for k, v in rules.items() if k not in IGNORED_KEYS and v not in (None, [], {}, "")}


def block(s):
    text = (s.eligibility_text or "").strip()[:700]
    vr = verified_rules(s)
    lines = [f"[{s.scheme_code}] {(s.name or '')[:100]}", "Eligibility text: " + (text or "(not stated)")]
    if vr:
        lines.append("VERIFIED RULES: " + json.dumps(vr, ensure_ascii=False))
    if not text and not vr:
        desc = (s.description or "").strip()[:300]
        if desc:
            lines.append("Description (used only because no eligibility text exists): " + desc)
    return "\n".join(lines)


def build_prompt(chunk):
    return (
        INSTRUCTIONS + "\n\nSCHEMES:\n" + "\n\n".join(block(s) for s in chunk)
        + '\n\nReturn JSON only, one entry per scheme with scheme_code copied exactly: '
        '{"specs": {"<scheme_code>": {"institutional": false, "states": [], "gender": null, '
        '"age_min": null, "age_max": null, "income_max": null, "categories_any": [], '
        '"flags_all": [], "occupations_any": [], "other_conditions": []}}}'
    )


def needs_work(s, redo, redo_weak):
    spec = (s.eligibility_rules or {}).get("match_spec")
    if redo or not spec:
        return True
    return bool(redo_weak and (not has_basis(spec) or verified_rules(s)))


def coverage(schemes):
    with_basis = sum(1 for s in schemes if has_basis((s.eligibility_rules or {}).get("match_spec")))
    logger.info("Coverage: %d of %d published schemes have verifiable eligibility info; "
                "the other %d will not be recommended.", with_basis, len(schemes), len(schemes) - with_basis)


def run(limit, batch, sleep, redo, redo_weak):
    db = SessionLocal()
    try:
        schemes = (db.query(Scheme).filter(Scheme.is_published.is_(True))
                   .order_by(Scheme.scheme_code).all())
        todo = [s for s in schemes if needs_work(s, redo, redo_weak)][:limit]
        logger.info("%d schemes to process (%d published in total)", len(todo), len(schemes))
        done = failed = 0
        for i in range(0, len(todo), batch):
            chunk = todo[i:i + batch]
            try:
                parsed = parse_json(chat_json(build_prompt(chunk), timeout=90))
            except (LLMError, ValueError) as exc:
                logger.warning("batch %d failed: %s", i // batch + 1, exc)
                failed += len(chunk)
                time.sleep(sleep)
                continue
            specs = parsed.get("specs")
            specs = specs if isinstance(specs, dict) else {}
            for s in chunk:
                raw = specs.get(s.scheme_code)
                if not isinstance(raw, dict):
                    failed += 1
                    continue
                rules = dict(s.eligibility_rules or {})
                rules["match_spec"] = normalize_spec(raw)
                s.eligibility_rules = rules
                done += 1
            db.commit()
            logger.info("progress: %d done, %d failed, of %d", done, failed, len(todo))
            time.sleep(sleep)
        logger.info("Finished: %d extracted, %d failed. Re-run to retry failures.", done, failed)
        coverage(schemes)
    finally:
        db.close()


def show(codes):
    db = SessionLocal()
    try:
        for s in db.query(Scheme).filter(Scheme.scheme_code.in_(codes)).all():
            rules = s.eligibility_rules or {}
            print("=" * 70)
            print(s.scheme_code, "|", s.ministry, "|", s.name)
            print("ELIGIBILITY TEXT:", (s.eligibility_text or "")[:500] or "(EMPTY)")
            print("VERIFIED RULES:", json.dumps(verified_rules(s), ensure_ascii=False) or "{}")
            spec = rules.get("match_spec")
            print("SPEC:", json.dumps(spec, indent=1), "\nHAS BASIS:", has_basis(spec))
    finally:
        db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=1000)
    ap.add_argument("--batch", type=int, default=5)
    ap.add_argument("--sleep", type=float, default=3.0)
    ap.add_argument("--redo", action="store_true")
    ap.add_argument("--redo-weak", action="store_true")
    ap.add_argument("--show", nargs="+")
    a = ap.parse_args()
    show(a.show) if a.show else run(a.limit, a.batch, a.sleep, a.redo, a.redo_weak)