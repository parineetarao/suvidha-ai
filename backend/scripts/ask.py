import sys

import app.db.base  # noqa: F401
from app.api.v1.schemes import smart_search_schemes
from app.db.session import SessionLocal
from app.schemas.scheme import SchemeSearchIn
from app.services.embedding_service import embedding_service

if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    query = sys.argv[1]
    lang = sys.argv[2] if len(sys.argv) > 2 else "en"
    embedding_service.load()
    db = SessionLocal()
    for r in smart_search_schemes(SchemeSearchIn(query=query, language=lang, limit=10), db):
        status = next((x.matched for x in r.reasons if x.factor == "status"), "")
        print(f"{r.match_score:3d} {status:18s} {r.scheme_id:20s} {r.name[:55]}")
    db.close()