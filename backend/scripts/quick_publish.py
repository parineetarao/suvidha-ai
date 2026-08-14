import app.db.base
from app.db.session import SessionLocal
from app.models.scheme import Scheme

db = SessionLocal()

updates = {
    "ky": {"occupations": ["farmer"]},
    "mkym": {"states": ["Maharashtra"], "gender": "female", "min_age": 18, "max_age": 50, "occupations": ["farmer"]},
    "kiay": {"occupations": ["farmer"]},
    "kpyg": {"occupations": ["farmer"], "states": ["Gujarat"]},
    "sapsf": {"occupations": ["farmer"], "states": ["Gujarat"]},
    "bvby": {"states": ["Haryana"], "occupations": ["farmer"]},
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