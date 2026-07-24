@"
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
- SQLAlchemy 2.0 + Alembic
- Docker Compose for local development

## Setup

Not runnable yet — under active construction. Target: first working version by end of Week 2.
"@ | Out-File -Encoding utf8 backend/README.md