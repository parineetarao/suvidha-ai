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
from app.api.v1.schemes import router as schemes_router
from app.services.embedding_service import embedding_service

from starlette.middleware.sessions import SessionMiddleware

from app.api.v1.auth import router as auth_router
from app.api.v1.users import router as users_router
from app.api.v1.admin import router as admin_router
from app.admin_ui.views import register_admin_views
from app.db.session import SessionLocal

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
            # Whisper model load-at-startup is wired in Phase 2 (voice_service)
            "model_loaded": False,
            "embedding_model_loaded": embedding_service.is_ready,
        }


    app.include_router(schemes_router, prefix="/api/v1")


    return app


app = create_app()
