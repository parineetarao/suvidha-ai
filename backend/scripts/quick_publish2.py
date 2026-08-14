import app.db.base
from app.db.session import SessionLocal
from app.models.scheme import Scheme

db = SessionLocal()

updates = {
    "mmuy": {"gender": "female", "states": ["Gujarat"], "min_age": 18, "min_education_level": "secondary"},
    "itg": {"states": ["Rajasthan"], "occupations": ["student"], "gender": "female"},
    "grsscgs": {"categories": ["SC"], "states": ["Puducherry"], "income_max": 24000, "occupations": ["student"], "gender": "female"},
    "imspesy": {"states": ["Rajasthan"], "min_age": 18, "gender": "female"},
    "ptwadwc": {"min_age": 18, "max_age": 60, "income_max": 150000, "gender": "female"},
    "kspy": {"categories": ["ST"], "states": ["Madhya Pradesh"], "gender": "female", "occupations": ["student"]},
    "msygtkdc": {"states": ["Gujarat"], "gender": "female", "min_age": 21, "max_age": 50, "income_max": 300000},
    "msygntdnt": {"gender": "female", "min_age": 21, "max_age": 50, "income_max": 300000},
    "stgca": {"categories": ["SC"], "states": ["Madhya Pradesh"], "gender": "female", "occupations": ["student"], "income_max": 600000},
    "ombgh": {"categories": ["SC"], "states": ["Puducherry"], "occupations": ["student"]},
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