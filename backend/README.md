# SuvidhaAI Backend

Python + FastAPI backend for SuvidhaAI, split across three team members by user-journey slice.

## Work split

- **Member 1 — Identity & Access**: auth, profile, admin panel.
- **Member 2 — Scheme Discovery**: scheme database, semantic search, matching engine, data ingestion.
- **Member 3 — Applications, Voice, Infrastructure**: application lifecycle, letter generation, document verification endpoint, voice transcription, Docker, Alembic, deployment.

## Tech stack

- Python 3.11+
- FastAPI
- PostgreSQL 16 with pgvector extension
- Redis 7
- SQLAlchemy 2.0 (typed `Mapped[]` style) + Alembic
- Docker Compose for local development

## Setup

1. Copy the env template and adjust if needed:
   ```
   cp .env.example .env
   ```
2. Start Postgres, Redis, the API, and Adminer:
   ```
   docker compose -f docker/docker-compose.yml up -d
   ```
3. Apply migrations (creates the `pgvector` extension):
   ```
   docker compose -f docker/docker-compose.yml exec backend alembic upgrade head
   ```
4. Check it's alive:
   ```
   curl http://localhost:8000/api/v1/health
   ```
   Expect `{"status": "ok", "db": "ok", "redis": "ok", "model_loaded": false}`.

Adminer (DB browser) is at `http://localhost:8080` — system: PostgreSQL, server: `postgres`, credentials from `.env`.

## Running tests

Tests need Postgres + Redis reachable (see Setup step 2) and run against a separate
`<POSTGRES_DB>_test` database that's created automatically — your dev database is
never touched.

```
pip install -r requirements.txt
pytest
```

## Project status

Phase 1 (foundation) complete: config, Docker Compose, DB session, Alembic
(with the pgvector extension migration), health check, admin-creation script
skeleton, and the test fixture setup. Phase 2 (feature code — models,
services, API routes) is next, gated on Members 1 and 2 merging their model
column definitions into `app/db/base.py`.

See `CLAUDE.md` for the full build order and architectural decisions.
