# SuvidhaAI Backend

Python + FastAPI backend for SuvidhaAI, split across three team members by user-journey slice.

## Current project status

**Phase 1 (foundation) is complete.** The backend runs end-to-end via Docker
Compose: FastAPI application, PostgreSQL 16 with the `pgvector` extension,
Redis, Alembic migrations, and a working `/api/v1/health` check that pings
both the database and Redis. Test fixtures with per-test transactional
rollback are in place. **Phase 2** (application lifecycle, document
verification, voice transcription, CSC services, and the corresponding
models/API routes) is under active development — see
[Current development progress](#current-development-progress).

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

## Prerequisites

- Docker and Docker Compose (v2 CLI plugin — `docker compose ...`)
- Python 3.11+ (only needed if running tests or the app outside Docker)
- Git

## Local development setup

1. Copy the env template and adjust if needed:
   ```
   cp .env.example .env
   ```
2. Follow [Docker Compose commands](#docker-compose-commands) to start the stack, then
   [Alembic migration commands](#alembic-migration-commands) to apply migrations.

## Docker Compose commands

All commands assume you're in `backend/`.

```
# Start Postgres, Redis, the API, and Adminer (detached)
docker compose -f docker/docker-compose.yml up -d

# Rebuild the backend image after dependency or code changes
docker compose -f docker/docker-compose.yml build backend

# View logs
docker compose -f docker/docker-compose.yml logs -f backend

# Check container status
docker compose -f docker/docker-compose.yml ps

# Stop the stack (add -v to also delete the Postgres volume)
docker compose -f docker/docker-compose.yml down
```

## Alembic migration commands

Run inside the backend container so it uses the container's DB connection:

```
# Apply all migrations (currently: creates the pgvector extension)
docker compose -f docker/docker-compose.yml exec backend alembic upgrade head

# Check the current migration version
docker compose -f docker/docker-compose.yml exec backend alembic current

# Roll back one migration
docker compose -f docker/docker-compose.yml exec backend alembic downgrade -1

# Generate a new migration from model changes (Phase 2, once models exist)
docker compose -f docker/docker-compose.yml exec backend alembic revision --autogenerate -m "description"
```

## Running the backend

Once the stack is up and migrations are applied, the API is at
`http://localhost:8000`. Check it's alive:

```
curl http://localhost:8000/api/v1/health
```

Expect `{"status": "ok", "db": "ok", "redis": "ok", "model_loaded": false}`.
(`model_loaded` reflects the Whisper voice model, wired up in Phase 2.)

## Running tests

Tests need Postgres + Redis reachable (see Docker Compose commands above) and
run against a separate `<POSTGRES_DB>_test` database that's created
automatically — your dev database is never touched.

```
pip install -r requirements.txt
pytest
```

## Accessing Adminer

Adminer (a DB browser) is available at `http://localhost:8080` once the stack
is running:

- System: `PostgreSQL`
- Server: `postgres`
- Username / Password / Database: from your `.env` (`POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB`)

## Project structure

```
backend/
├── app/
│   ├── main.py          # FastAPI app factory, CORS, /api/v1/health
│   ├── config.py        # Pydantic Settings (env-driven config)
│   ├── core/
│   │   └── logging.py   # Logging setup
│   └── db/
│       ├── session.py   # SQLAlchemy engine + SessionLocal + get_db
│       └── base.py      # Declarative base (model imports land here in Phase 2)
├── alembic/              # Migrations (env.py wired to app config + models)
├── docker/               # Dockerfile + docker-compose.yml
├── scripts/
│   └── create_admin.py  # Admin-creation CLI (blocked on Member 1's User model)
├── tests/
│   ├── conftest.py       # DB + TestClient fixtures, per-test rollback
│   └── test_health.py
├── .env.example
├── pytest.ini
└── requirements.txt
```

Model files (`app/models/`), services (`app/services/`), schemas
(`app/schemas/`), and versioned API routers (`app/api/v1/`) don't exist yet —
they're Phase 2 work.

## Current development progress

**Phase 1 — foundation (complete):** dependencies, env config, Docker
Compose (Postgres+pgvector, Redis, backend, Adminer), DB session and
declarative base, FastAPI app with health check, Alembic initialized with
the pgvector extension migration, admin-creation script skeleton, and test
fixtures.

**Phase 2 — feature code (in progress):** application lifecycle state
machine, letter generation, document verification, voice transcription, and
CSC services — along with their models, schemas, and API routes. This phase
is gated on Members 1 and 2 merging their model column definitions into
`app/db/base.py`.

