# Import app.db.base FIRST, before any router — routers import models,
# and models import Base from this file. If a router imports a model
# before base.py has been loaded standalone, base.py's own model imports
# collide with the still-initializing model, causing a circular import.
# Same fix pattern used in scripts/create_admin.py and api/deps.py.
import app.db.base  # noqa: F401

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from redis import Redis
from redis.exceptions import RedisError
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.config import get_settings
from app.core.logging import configure_logging
from app.db.session import engine
# Must run before any router import below. Routers import model modules
# directly (e.g. app.api.v1.schemes -> app.models.scheme), and every model
# module does `from app.db.base import Base`. app/db/base.py defines Base
# and then imports all model modules itself, in a safe fixed order — but
# only if it's the first thing to touch either side of that cycle. If a
# model module gets imported first instead, it starts importing app.db.base
# mid-way through its own definition, which imports that same model module
# back (already partially in sys.modules) and fails to find the class that
# hasn't been defined yet. Importing app.db.base explicitly here, first,
# sidesteps that ordering trap regardless of which router happens to be
# listed next.
import app.db.base  # noqa: E402, F401
from app.api.v1.schemes import router as schemes_router
from app.services.embedding_service import embedding_service

from starlette.middleware.sessions import SessionMiddleware

from app.api.v1.auth import router as auth_router
from app.api.v1.users import router as users_router
from app.api.v1.admin import router as admin_router
from app.api.v1.applications import router as applications_router
from app.api.v1.documents import router as documents_router
from app.api.v1.voice import router as voice_router
from app.api.v1.csc import router as csc_router
from app.admin_ui.views import register_admin_views
from app.db.session import SessionLocal
from app.services.voice_service import voice_service


configure_logging()
logger = logging.getLogger(__name__)

settings = get_settings()
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Loads the sentence-transformer model ONCE here, at startup — not
    # per-request. The model takes ~5s and ~500MB RAM to load; loading it
    # per-request would make every call slow and eventually exhaust RAM.
    logger.info("Loading embedding model at startup...")
    embedding_service.load()
    logger.info("Loading voice (faster-whisper) model at startup...")
    voice_service.load()
    yield

def create_app() -> FastAPI:
    app = FastAPI(title="SuvidhaAI API", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    app.add_middleware(SessionMiddleware, secret_key=settings.jwt_secret)

    app.include_router(auth_router, prefix="/api/v1")
    app.include_router(users_router, prefix="/api/v1")
    app.include_router(admin_router, prefix="/api/v1")
    app.include_router(applications_router, prefix="/api/v1")
    app.include_router(documents_router, prefix="/api/v1")
    app.include_router(voice_router, prefix="/api/v1")
    app.include_router(csc_router, prefix="/api/v1")

    register_admin_views(app, engine, SessionLocal, settings.jwt_secret)
	
    @app.get("/api/v1/health")
    def health() -> dict:
        db_status = "ok"
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
        except SQLAlchemyError:
            logger.exception("Health check: database ping failed")
            db_status = "error"

        redis_status = "ok"
        try:
            redis_client = Redis.from_url(settings.redis_url, socket_connect_timeout=2)
            redis_client.ping()
        except RedisError:
            logger.exception("Health check: redis ping failed")
            redis_status = "error"

        return {
            "status": "ok" if db_status == "ok" and redis_status == "ok" else "error",
            "db": db_status,
            "redis": redis_status,
            "model_loaded": voice_service.is_ready,
            "embedding_model_loaded": embedding_service.is_ready,
        }


    app.include_router(schemes_router, prefix="/api/v1")


    return app


app = create_app()
