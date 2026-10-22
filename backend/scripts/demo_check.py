import sys

import app.db.base  # noqa: F401
from app.api.v1.schemes import smart_search_schemes
from app.db.session import SessionLocal
from app.schemas.scheme import SchemeSearchIn
from app.services.embedding_service import embedding_service

QUERIES = [
    ("ladki bahin yojana", "en"), ("atal pension yojana", "en"),
    ("I am a housewife in Maharashtra", "en"), ("I am a widow from Maharashtra", "en"),
    ("I am a pregnant woman", "en"), ("I am a girl child", "en"),
    ("I am a student", "en"), ("I am an SC student", "en"),
    ("I am unemployed", "en"), ("I am a transgender person", "en"),
    ("I am a widow", "en"), ("I am a retired government employee", "en"),
    ("I am an OBC student", "en"), ("I am a woman entrepreneur", "en"),
    ("I am a senior citizen", "en"), ("I am a retired person", "en"),
    ("I am a farmer", "en"), ("I am a person with disability", "en"),
    ("I am a construction worker", "en"), ("I need a loan to start a small business", "en"),
    ("I need a house", "en"), ("I need health insurance", "en"),
    ("मी महाराष्ट्रातील गृहिणी आहे", "mr"), ("मैं एक किसान हूँ", "hi"),
]

if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    embedding_service.load()
    db = SessionLocal()
    for q, lang in QUERIES:
        try:
            res = smart_search_schemes(SchemeSearchIn(query=q, language=lang, limit=10), db)
            print(f"{q[:34]:34} {len(res):2d} | " + " | ".join(r.name[:26] for r in res[:4]))
        except Exception as exc:
            print(f"{q[:34]:34} ERROR {exc}")
    db.close()