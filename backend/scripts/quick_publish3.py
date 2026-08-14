import app.db.base
from app.db.session import SessionLocal
from app.models.scheme import Scheme

db = SessionLocal()

updates = {
    "cpy": {"states": ["Jharkhand"], "min_age": 18, "occupations": ["construction worker"]},
    "skbrcsy": {"min_age": 18, "max_age": 60, "occupations": ["sanitation worker"]},
    "majeajcay": {"states": ["Bihar"], "categories": ["SC", "ST"], "occupations": ["student"]},
    "dccbfhl": {"states": ["Tamil Nadu"]},
    "v-vhcs": {"categories": ["BPL"], "occupations": ["fisherman"]},
    "pduayebc": {"states": ["Gujarat"], "categories": ["OBC"], "income_max": 600000},
}

for code, fields in updates.items():
    scheme = db.query(Scheme).filter(Scheme.scheme_code == code).first()
    if scheme is None:
        print(f"NOT FOUND: {code}")
        continue
    rules = dict(scheme.eligibility_rules or {})
    rules.update(fields)
    rules["needs_review"] = False
    scheme.eligibility_rules = rules
    scheme.is_published = True
    print(f"Updated + published: {code}")

db.commit()
db.close()
print("Done.")