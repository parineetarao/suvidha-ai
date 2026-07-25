# SuvidhaAI Backend — Member 3 scope (Application, Voice & Deployment)

## What SuvidhaAI is
Voice-first, multilingual (Hindi/Marathi/English) web app that helps Indian
citizens discover government welfare schemes and guides them through the full
application process. Two modes: Simple Mode (WhatsApp-style chat, low-literacy
rural users) and Full Mode (three-column dashboard for CSC operators).

Frontend is fully built (Next.js 16, React 19, TS, Tailwind v4, shadcn/ui) at
`frontend/`. Backend is being built from scratch at `backend/` by a team of 3,
split by user-journey slice, not technical layer.

## My role — Member 3
I own two things: the post-discovery application flow, and the infrastructure
everyone else depends on. Members 1 and 2 are blocked until my Phase 1
foundation lands, so that comes first.

**My themes:**
- Application lifecycle — state machine + letter generation
- Ephemeral processing — voice transcription and document verification;
  never persist the sensitive raw input
- Infrastructure — Docker, Alembic, main.py, config, DB session, logging,
  test fixtures

**Not my scope** (don't build, but may need to read):
- Member 1: auth (OTP → JWT), user profile CRUD, admin panel views
- Member 2: scheme DB, semantic search (sentence-transformers + pgvector),
  matching engine, data ingestion

## Stack
- Python 3.11+, FastAPI
- SQLAlchemy 2.0 — **typed `Mapped[]` style, not legacy `Column()` style**
- Alembic for migrations (auto-generated from models, versioned files)
- PostgreSQL 16 + pgvector extension (Member 2's embeddings; I provision it)
- Redis 7 (rate limiting, caching)
- Docker Compose for local dev; deploy target is a Hostinger KVM VPS behind
  Caddy for HTTPS
- Jinja2 for letter templates, faster-whisper for self-hosted STT

## Repo layout
```
suvidha-ai/
├── frontend/         (Next.js — already built, read-only for me)
└── backend/
    ├── app/
    │   ├── api/v1/           (applications.py, documents.py, csc.py, voice.py = mine)
    │   ├── services/         (application_service, letter_service, csc_service, voice_service = mine)
    │   ├── models/           (application.py, document.py = mine; user.py = Member 1; scheme.py = Member 2)
    │   ├── schemas/          (application.py = mine)
    │   ├── db/               (session.py, base.py, init_db.py = mine)
    │   ├── core/logging.py   (mine)
    │   ├── config.py         (mine — shared, others add fields)
    │   └── main.py           (mine — shared, others add one router line)
    ├── templates/letters/    (base.j2, pmkisan.j2, pmay.j2, generic.j2 = mine)
    ├── alembic/, alembic.ini (mine end-to-end)
    ├── docker/               (Dockerfile, docker-compose.yml = mine end-to-end)
    ├── tests/conftest.py     (mine — Members 1 & 2 use my fixtures)
    ├── scripts/create_admin.py (mine)
    └── requirements.txt      (shared — everyone pins their own deps)
```

## Shared files — edit carefully
These are touched by all three of us. Add or extend; never restructure or
reorder wholesale, or you'll clobber a teammate's lines on merge:
- `app/main.py` — everyone adds exactly one `include_router(...)` line
- `app/db/base.py` — everyone adds one model import so Alembic sees it
- `app/config.py` — I own the `Settings` class shape; others append fields
- `requirements.txt` — everyone appends their own pinned deps

## Foreign key dependencies
- `applications.user_id` → `users.id` (mine → Member 1)
- `applications.scheme_id` → `schemes.id` (mine → Member 2)
- `document_verifications.user_id` → `users.id` (mine → Member 1)

I need Members 1 and 2's model **column definitions** (not their full logic)
merged into `app/db/base.py` before I can generate Alembic migrations for
`applications` and `document_verifications`. Until then, Phase 1 infra work
doesn't need them.

## Hard rule — non-negotiable
`document_verifications` NEVER gets an image column or a raw-number column.
Only `masked_identifier` (e.g. last 4 digits) and a boolean/enum
`verification_status`. Aadhaar/OCR happens client-side via Tesseract.js in the
browser; the server receives only `{doc_type, checks, masked_id}`. This is a
core viva talking point — flag it immediately if any change would introduce
storage of raw sensitive data, even "temporarily" or "for debugging."

## Endpoint spec (mine)
```
POST   /api/v1/applications                       (auth) {scheme_id}       → Application
GET    /api/v1/applications                       (auth)                   → List<Application>
GET    /api/v1/applications/{id}                  (auth)                   → ApplicationDetail
PATCH  /api/v1/applications/{id}                  (auth) {status?, notes?} → Application
POST   /api/v1/applications/{id}/generate-letter  (auth)                   → {letter_text, pdf_url?}
DELETE /api/v1/applications/{id}                  (auth)                   → 204

POST   /api/v1/documents/verify   (auth) {doc_type, checks, masked_id}     → VerificationResult
POST   /api/v1/voice/transcribe   (auth) multipart<audio> {lang}           → {text, language, duration}
GET    /api/v1/csc/nearby         ?lat&lng&radius_km                       → List<CSC>
GET    /api/v1/health                                                     → {status, db, redis, model_loaded}
```

## Application state machine
`draft → docs_pending → letter_generated → submitted → under_review →
approved | rejected`. Every transition writes a row to
`application_status_history` (old_status, new_status, changed_at,
changed_by). Validate transitions in `application_service.py`, not in the
router.

## Build order
**Phase 1 — foundation (do this first, unblocks Members 1 & 2):**
1. `requirements.txt`
2. `.env.example`
3. `app/config.py` — Pydantic Settings
4. `docker/Dockerfile`
5. `docker/docker-compose.yml` — Postgres 16+pgvector, Redis 7, backend, adminer
6. `app/db/session.py` — engine + SessionLocal
7. `app/db/base.py` — declarative base, placeholder model imports
8. `app/main.py` — app factory, CORS, `/health` (pings DB + Redis)
9. Alembic init + `env.py` wired to models
10. First migration — creates the pgvector extension
11. `scripts/create_admin.py`
12. `tests/conftest.py` — test DB with rollback per test
13. Updated `backend/README.md`

**Phase 2 — feature code (after Members 1 & 2 merge their model columns):**
14. `models/application.py`, `models/document.py`
15. `schemas/application.py`
16. `services/application_service.py` — state machine
17. `services/letter_service.py` + `templates/letters/*.j2`
18. `api/v1/applications.py` + `api/v1/documents.py`
19. `services/voice_service.py` — faster-whisper wrapper (load model at startup)
20. `api/v1/voice.py`
21. `models/csc.py`, `services/csc_service.py`, `api/v1/csc.py`
22. Deployment hardening — Caddy config, backup scripts, healthchecks

Default to whichever step comes next in this list unless told otherwise.

## Git workflow
- Branch: `member3/infrastructure`
- `main` is protected — 1 PR approval required to merge
- Daily rhythm: pull `main`, rebase my branch on top, work, commit, push,
  open PR when a step is done
- Commit in the same small increments as the build-order steps above — one
  file or feature per commit — so PRs stay reviewable
- When resolving rebase conflicts in shared files, preserve both sides'
  intent; don't just take "ours" or "theirs"

## Viva talking points I need to defend
- Aadhaar images: nowhere on the server. OCR is client-side (Tesseract.js);
  server gets only boolean checks. `models/document.py` has no image column
  — point to the file directly.
- Hypothetical server-side OCR fallback: process in memory / tmpfs only,
  delete in a `finally` block, persist only the extracted validation result.
- State machine: six states, explicit transition validation, every change
  logged to `application_status_history`.
- Whisper: self-hosted `faster-whisper`, model loaded once at startup (not
  per-request), ~3s to transcribe 10s of Hindi audio on CPU. Fallback for
  browsers without the Web Speech API.
- Deployment: Docker Compose locally, same containers on Hostinger KVM VPS,
  Caddy in front for HTTPS/TLS termination.
- Migrations: Alembic auto-generates from SQLAlchemy model diffs; every
  schema change is a versioned, reviewable file in `alembic/versions/`.
- Backups: nightly `pg_dump` to object storage, 30-day retention.

## How I want you to work
- I'm comfortable with Python but new to FastAPI, SQLAlchemy 2.0's typed
  style, Docker Compose, and Alembic. Explain non-obvious choices briefly —
  I need to defend every line in a viva, not just have it work.
- Before writing a new file, state your plan and reasoning first so I can
  push back before anything hits disk.
- Don't restructure shared files (`main.py`, `base.py`, `config.py`,
  `requirements.txt`) — append/extend only.
- After generating infra files, run `docker compose config` and/or `pytest`
  to catch errors before I commit.
