"""
scripts/review_schemes.py

RECOVERED FILE — this was lost during a git merge/checkout operation
tonight (never committed, existed only as an uncommitted local file).
Recreating from the last known-working version, including the fix for
the empty-edit-silently-publishes bug found during tonight's review.

Run with: python -m scripts.review_schemes --limit 50
"""

import argparse
import json

import app.db.base  # noqa: F401 — import first, avoids circular import
from app.db.session import SessionLocal
from app.models.scheme import Scheme

EDITABLE_FIELDS = (
    "min_age", "max_age", "gender", "income_max", "categories",
    "occupations", "states", "min_education_level", "min_marks_percentage",
)


def _print_scheme(scheme: Scheme, index: int, total: int) -> None:
    print("\n" + "=" * 70)
    print(f"[{index}/{total}] {scheme.scheme_code} — {scheme.name}")
    print(f"Ministry: {scheme.ministry or '(not set)'}")
    print("-" * 70)
    print("REAL ELIGIBILITY TEXT (from the government site):")
    print(scheme.eligibility_text or "(none scraped)")
    print("-" * 70)

    rules = dict(scheme.eligibility_rules or {})
    sources = rules.pop("_field_sources", {})
    rules.pop("needs_review", None)
    print("AUTO-EXTRACTED RULES:")
    if not rules:
        print("  (nothing extracted — will need manual entry, or skip)")
    for field, value in rules.items():
        source = sources.get(field, "?")
        print(f"  {field}: {value}   [{source}]")
    print("=" * 70)


def _prompt_edit(rules: dict) -> dict:
    print(f"Editable fields: {', '.join(EDITABLE_FIELDS)}  (FULL list — anything else stays in eligibility_text)")
    while True:
        field = input("Field to edit (Enter to stop): ").strip()
        if not field:
            break
        if field not in EDITABLE_FIELDS:
            print("Not a recognized field — try again.")
            continue
        raw_value = input(f"New value for {field} (JSON, e.g. 60 or [\"SC\",\"ST\"] or \"hsc\" or null): ").strip()
        try:
            rules[field] = json.loads(raw_value) if raw_value else None
        except json.JSONDecodeError:
            rules[field] = raw_value
        print(f"  set {field} = {rules[field]}")
    return rules


def run(limit: int) -> None:
    db = SessionLocal()
    try:
        candidates = (
            db.query(Scheme)
            .filter(Scheme.is_published.is_(False))
            .filter(Scheme.eligibility_text.isnot(None))
            .order_by(Scheme.scheme_code)
            .limit(limit)
            .all()
        )
        if not candidates:
            print("No unpublished schemes with eligibility text found — nothing to review.")
            return

        print(f"Reviewing {len(candidates)} scheme(s). For each: [y] publish  [e] edit then publish  [n] skip  [q] quit\n")

        published, skipped = 0, 0
        for i, scheme in enumerate(candidates, start=1):
            _print_scheme(scheme, i, len(candidates))
            choice = input("Decision [y/e/n/q]: ").strip().lower()

            if choice == "q":
                print("Stopping review session.")
                break
            elif choice == "y":
                scheme.is_published = True
                if isinstance(scheme.eligibility_rules, dict):
                    scheme.eligibility_rules["needs_review"] = False
                db.commit()
                published += 1
                print("  -> Published.")
            elif choice == "e":
                rules = dict(scheme.eligibility_rules or {})
                original_rules = dict(rules)
                rules = _prompt_edit(rules)
                if rules == original_rules:
                    print("  -> No changes made — not publishing. Choose again.")
                    choice2 = input("Decision [y/n] (edit cancelled): ").strip().lower()
                    if choice2 == "y":
                        scheme.is_published = True
                        db.commit()
                        published += 1
                        print("  -> Published as-is.")
                    else:
                        skipped += 1
                        print("  -> Skipped, left unpublished.")
                    continue
                rules["needs_review"] = False
                scheme.eligibility_rules = rules
                scheme.is_published = True
                db.commit()
                published += 1
                print("  -> Edited and published.")
            else:
                skipped += 1
                print("  -> Skipped, left unpublished.")

        print(f"\nSession summary: {published} published, {skipped} skipped.")
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=50)
    args = parser.parse_args()
    run(args.limit)