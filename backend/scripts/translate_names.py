import logging

import app.db.base  # noqa: F401
from app.db.session import SessionLocal
from app.models.scheme import SUPPORTED_LANGUAGES, Scheme
from app.services.lazy_translate import ensure_translated

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    db = SessionLocal()
    schemes = db.query(Scheme).filter(Scheme.is_published.is_(True)).order_by(Scheme.scheme_code).all()
    for lang in SUPPORTED_LANGUAGES:
        if lang != "en":
            ensure_translated(db, schemes, lang, pause=3.0)
            print("done:", lang)
    db.close()