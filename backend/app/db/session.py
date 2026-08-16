
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings

# Side-effect import: this is the ONLY reason it's here. main.py imports
# this module (`from app.db.session import engine`) before anything else
# touches the database, so importing app.db.base here guarantees every
# model is registered on Base.metadata before a router/service ever does
# `from app.models.X import Y` directly. Without this, the first such
# import anywhere in the app would recurse into db.base -> models.X ->
# db.base and crash with "cannot import name X from partially initialized
# module" — see db/base.py's docstring for the full explanation.
from app.db import base as _base  # noqa: F401

settings = get_settings()

engine = create_engine(settings.database_url, pool_pre_ping=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency: yields a request-scoped session, always closed after."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
