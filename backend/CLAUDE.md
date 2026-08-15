# SuvidhaAI Backend — Member 3 scope (Application, Voice & Deployment)

## What SuvidhaAI is
Voice-first, multilingual (10 languages: English, Hindi, Marathi, Tamil,
Telugu, Kannada, Malayalam, Bengali, Gujarati, Punjabi) web app helping
Indian citizens discover government welfare schemes and apply for them.
Two modes: Simple Mode (WhatsApp-style chat) and Full Mode (CSC operator
dashboard). Repo: github.com/parineetarao/suvidha-ai.

Frontend (Next.js 16, React 19, TS, Tailwind v4, shadcn/ui) had ZERO API
calls as of tonight — fully client-side, hardcoded data. Frontend
integration is now actively in progress (see "Current status" below).

## My role — Member 3
Application lifecycle, ephemeral processing (voice, document
verification), CSC locator, and all infrastructure.

**Not my scope** (merged to `main`, don't rebuild):
- Member 1 (`member1/auth-service`): full OTP-to-JWT flow (mock SMS,
  OTP prints to backend logs), profile CRUD, sqladmin panel.
  `app/api/deps.py` has `get_current_user`/`get_current_admin` — USE,
  don't rebuild. Tables: `users`, `user_profiles`, `otp_requests`,
  `refresh_tokens`, `admins`, `audit_logs`.
- Member 2 (`member2/scheme-service`): scheme DB, multilingual semantic
  search, matching. ~440 scraped schemes, 62 human-reviewed and
  published. Table: `schemes`.

## Current status — MY BACKEND SLICE IS FEATURE-COMPLETE

**Everything below is built, tested against a live DB, and pushed to
`member3/infrastructure`:**

- Phase 1 infra (Docker Compose, Alembic, `/api/v1/health`) — stable
- `models/application.py`, `models/document.py`, `models/csc.py` — live
- `services/application_service.py` — state machine, full audit history
- `services/letter_service.py` — Jinja letter generation
- `services/voice_service.py` — faster-whisper (small, CPU/int8),
  singleton load-once at startup, temp audio deleted in `finally`, never
  persisted
- `services/csc_service.py` — haversine nearest-neighbor
- `api/v1/applications.py` — 6 routes, ownership-scoped via
  `_get_owned_application`
- `api/v1/documents.py` — `POST /documents/verify`
- `api/v1/voice.py` — `POST /voice/transcribe`
- `api/v1/csc.py` — `GET /csc/nearby` (no auth, per spec)
- All routers wired into `app/main.py`

**Verified live tonight, with real evidence (not just "it compiles"):**
- Applications: create/list/get/patch/delete all confirmed via curl with
  a real JWT (201 → listed → fetched → transitioned → 204 deleted →
  confirmed 404 on re-fetch)
- Documents: `POST /documents/verify` confirmed, masked_identifier
  correctly stored and returned
- Voice: real English audio (Windows TTS) transcribed correctly —
  `{"text":"I want to apply for the PMKISAN scheme...","language":"en",
  "duration":6.15,"confidence":0.65}`. Hindi/Marathi: language param
  accepted, model is multilingual, but NOT tested — no Hindi/Marathi
  audio sample available. Don't claim verified beyond English until
  actually tested.
- CSC: 5 real Delhi-NCR locations seeded, live query from central Delhi
  returned all 5 correctly sorted nearest-first (2.1km → 24.64km)
- `/api/v1/health` shows both `model_loaded` (Whisper) and
  `embedding_model_loaded` (Member 2's) as `true`
- `alembic heads` single-headed, confirmed clean

## ONE known blocker — not mine to fix, flagged to Member 2

`POST /applications/{id}/generate-letter` fails:
```
UndefinedColumn: schemes.warning does not exist
```
Member 2's `Scheme` model has columns (`warning`, `rejection_risks`,
`eligibility_text`, `application_process`, `faqs`) that were never
migrated into the live `schemes` table. This breaks ANY query against
`schemes`, not just mine. **Do not touch Member 2's model/migration
files to fix this — she owns it, flag and wait.** Check with her before
re-testing this one endpoint. `schemes` table was also empty locally as
of tonight (her ~440/62 seed data not yet committed/pushed) — expected,
not a bug.

## Current focus — frontend integration (in progress)

Priority order for wiring frontend to real backend:
1. API client foundation (`frontend/lib/api-client.ts` or similar) —
   base URL from `NEXT_PUBLIC_API_URL`, JWT bearer attachment, error
   handling. Check if something like this already exists before
   creating a new one.
2. Auth flow: mobile number → `POST /auth/request-otp` → OTP input →
   `POST /auth/verify-otp` → store access token (context/in-memory, not
   localStorage for the token itself)
3. MY endpoints: wire applications (apply-to-scheme flow →
   `POST /applications`, listing → `GET /applications`), documents
   (the existing client-side OCR/readiness-checker's submit step →
   `POST /documents/verify`, don't touch its OCR logic, just add the
   final call), CSC (use browser geolocation → `GET /csc/nearby`),
   voice (wire voice-input UI → `POST /voice/transcribe` multipart)
4. Scheme search/detail — CHECK WITH ME FIRST, Member 2 may be wiring
   this herself in parallel tonight. Check `git log` on
   `member2/scheme-service` before touching `POST /schemes/search` or
   `GET /schemes/{id}` frontend wiring — don't duplicate her work.

Test every wired flow live in the browser against the real running
backend — not mocked, not assumed.

## Known infra facts — don't rediscover these

- **`docker-compose.yml`'s `backend` service has `../alembic:/app/alembic`
  bind-mounted.** Required. Don't remove.
- **Dockerfile must `COPY tests ./tests` and `COPY pytest.ini .`** —
  keeps getting silently dropped during merges. Check before assuming
  `pytest -v` will collect anything.
- **`requirements.txt` changes force a ~15-20 min rebuild** — unconstrained
  `sentence-transformers` pulls GPU `torch` (~2GB CUDA, unused — no GPU
  on Hostinger VPS target). Expected, not broken. Fix later with a
  CPU-only torch wheel, not urgent.
- **Every backend restart takes 2-3 min even warm** — HuggingFace Hub
  does a full metadata-freshness check on every startup for the
  embedding model. Not blocking, but eats iteration time during heavy
  restart cycles — plan around it.
- **Alembic migration history needs manual reconciliation when two
  people branch off the same parent** — has happened 2+ times. If
  `alembic heads` shows 2+ entries: check `git log --oneline -- alembic/
  versions/` for context before deleting anything — a teammate may have
  already built on top of one chain. Correct fix is usually
  `alembic merge -m "..." <head1> <head2>`. If `alembic upgrade head`
  then fails with `DuplicateObject`, the DB is fine — use
  `alembic stamp <merge_revision>` instead of re-running DDL.
- **`app/config.py`'s `Settings` fields are all lowercase.**
- **`app/main.py` has SessionMiddleware, 3 routers (now 4 — mine wired
  in too), and `register_admin_views()`.** Check current file before
  adding startup logic, don't overwrite `create_app()`.
- **SQLAlchemy is SYNCHRONOUS throughout** — no `AsyncSession`, no
  `await`, no `async def` on DB-touching code.
- **Circular import guard**: any script importing a model directly must
  `import app.db.base` before `from app.models.X import Y`.
- **Git Bash on Windows mangles absolute container paths** starting
  with `/` in `docker compose exec` — use `MSYS_NO_PATHCONV=1` or
  double the leading slash (`//app/...`).
- **After any rebase, push with `--force-with-lease`, never plain
  `git pull` afterward** (re-merges pre-rebase history, resurrects
  resolved conflicts).

## Dependencies — all resolved
`python-jose[cryptography]`, `passlib[bcrypt]`, `bcrypt`, `itsdangerous`,
`sqladmin`, `faster-whisper`, `python-multipart`, `requests` (faster-
whisper transitive dep) all in `requirements.txt`. All 7 JWT/OTP
`Settings` fields exist on the class and in `.env.example`. Local `.env`
needs real `JWT_SECRET`/`OTP_PEPPER` values — generate via
`python -c "import secrets; print(secrets.token_hex(32))"` if missing.

## Stack
Python 3.11+, FastAPI, SQLAlchemy 2.0 (typed `Mapped[]`), Alembic,
PostgreSQL 16 + pgvector, Redis 7, Docker Compose. Deploy target:
Hostinger KVM VPS behind Caddy (NOT started — everything is local
Docker Compose only, nothing deployed anywhere yet).

## Hard rule — non-negotiable
`document_verifications` NEVER gets an image column or raw-number
column. Only `masked_identifier` and `verification_status`. OCR is
client-side (Tesseract.js); server receives only
`{doc_type, checks, masked_id}`. Core viva talking point.

## Endpoint spec (mine — all live)
```
POST   /api/v1/applications                       (auth) {scheme_id}       → Application
GET    /api/v1/applications                       (auth)                   → List<Application>
GET    /api/v1/applications/{id}                  (auth)                   → ApplicationDetail
PATCH  /api/v1/applications/{id}                  (auth) {status?, notes?} → Application
POST   /api/v1/applications/{id}/generate-letter  (auth)                   → BLOCKED (see above)
DELETE /api/v1/applications/{id}                  (auth)                   → 204

POST   /api/v1/documents/verify   (auth) {doc_type, checks, masked_id}     → VerificationResult
POST   /api/v1/voice/transcribe   (auth) multipart<audio> {lang}           → {text, language, duration, confidence}
GET    /api/v1/csc/nearby         ?lat&lng&radius_km (no auth)             → List<CSC>
GET    /api/v1/health                                                     → {status, db, redis, model_loaded, embedding_model_loaded}
```
`lang` for voice: `en, hi, mr, ta, te, kn, ml, bn, gu, pa`. Pass
explicitly, don't rely on auto-detect (unreliable on short clips).

## Application state machine
`draft → docs_pending → letter_generated → submitted → under_review →
approved | rejected`. Every transition logged to
`application_status_history`. `generate-letter` internally calls
`transition_status` itself — don't call it again in the route (this was
a real bug, found and fixed tonight: double-transition raised
`InvalidTransition`).

## Git workflow
- Branch: `member3/infrastructure`, pushed and current with `main`
  (3 clean commits tonight: routers wired, voice service, CSC locator).
- `main` protected, 1 PR approval required — confirm PR is actually open,
  not just pushed.
- Commit in small increments. Check `git log --oneline -- <file>` before
  resolving any conflict — a teammate may have already built on a
  version that looks "old."

## Cross-team status
- Member 1: auth fully working, mock SMS. Next: email-based OTP
  (touches `models/user.py`, `models/otp.py`, new migration — coordinate
  before generating my own migrations around the same time).
- Member 2: ~440 scraped schemes, 62 published, translation script in
  progress. **Schema drift bug on her side is currently blocking my
  generate-letter endpoint** (see above). May be wiring frontend scheme
  search herself tonight — check before duplicating that work.

## Viva talking points
- Aadhaar: nowhere on server, client-side OCR only, no image column —
  point to `models/document.py`.
- State machine: six states, explicit validation, full audit history.
- Voice: self-hosted faster-whisper, multilingual, loaded once at
  startup, CPU-only via `small` model + int8.
- CSC: haversine distance calculation, no external geo API dependency.
- Migrations: Alembic auto-generates from model diffs; branching heads
  from independent team members reconciled via `alembic merge` — real
  evidence of distributed-team DB workflow, not just the happy path.
- Deployment: Docker Compose locally → Hostinger VPS + Caddy (planned,
  not yet done — be upfront about this if asked).

## How I want you to work
- Verify every claim by actually running it — curl, pytest, real audio,
  browser testing — not "the code looks right."
- Don't touch Member 1's or Member 2's files without asking first, even
  for an obvious-looking bug — flag it, let me decide.
- Check for parallel work (especially Member 2 on frontend scheme search)
  before starting something that might duplicate it.
- After each unit of work: explicit DONE-AND-VERIFIED or
  BLOCKED-AND-WHY. Don't chain multiple steps silently.