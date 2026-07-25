import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from redis import Redis
from redis.exceptions import RedisError
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.config import get_settings
from app.core.logging import configure_logging
from app.db.session import engine

configure_logging()
logger = logging.getLogger(__name__)

settings = get_settings()


def create_app() -> FastAPI:
    app = FastAPI(title="SuvidhaAI API")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

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
        }

    # Routers are added one `include_router(...)` line at a time as each
    # member's api/v1 module lands (Phase 2) — none exist yet.

    return app


app = create_app()
