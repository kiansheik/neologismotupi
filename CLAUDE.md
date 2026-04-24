# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

**Dicionário de Tupi** — a community-built living dictionary for the Tupi language. Users submit entries, vote on each other's entries and examples, and earn posting rights through participation. The system is a monorepo with a FastAPI backend and a React/Vite frontend.

## Commands

All primary commands are in the root `Makefile`. Run from the repo root.

```bash
make dev          # run API (:8000) + web (:5173) concurrently
make dev-api      # FastAPI only
make dev-web      # Vite only

make test         # all tests (api + web + e2e)
make test-api     # pytest (apps/api)
make test-web     # vitest --run (apps/web)
make test-e2e     # playwright (requires RUN_E2E=1 env var)

make lint         # ruff check (api) + eslint (web)
make format       # ruff format + prettier

make db-migrate   # alembic upgrade head
make db-rebuild   # drop + migrate + seed from CSV
```

**Running a single API test:**
```bash
cd apps/api
PYTHONPATH=. uv run pytest app/tests/test_api_flows.py::test_name -v
```

**Running a single frontend test:**
```bash
cd apps/web
pnpm test -- --run src/path/to/file.test.tsx
```

**Creating a new DB migration:**
```bash
cd apps/api
uv run alembic revision --autogenerate -m "description"
```

Tests use SQLite in-memory via a `reset_database` autouse fixture — no Postgres needed for the test suite.

## Architecture

### Backend (`apps/api`)

FastAPI app built with async SQLAlchemy 2.0 + asyncpg. Entry point: `app/main.py` creates the app and mounts all routers under `/api`.

**Router layout:**
- `entries` — entry CRUD, voting, examples, comments (the largest router, ~2500 lines)
- `auth` — session-based auth (cookie), signup, email verification, password reset
- `mod` — moderation queue, reports, dashboard, participation leaderboard
- `users` — profiles, activity, notifications, badges
- `flashcards` / `flashcard_lists` — spaced repetition
- `audio` — upload + processing
- `navarro`, `sources`, `newsletters`, `meta`

**Key patterns:**
- `SessionDep = Annotated[AsyncSession, Depends(get_db)]` — inject DB session into handlers
- `get_current_user` / `get_current_user_optional` / `require_moderator` — auth deps in `app/core/deps.py`
- `raise_api_error(status_code, code, message, details)` — all errors go through this; the frontend reads `error.code` to display localized messages
- Settings live in `app/config.py` as a Pydantic `BaseSettings` class loaded via `@lru_cache get_settings()`. Call `get_settings.cache_clear()` in tests after monkeypatching env vars.

**Schemas vs models:** SQLAlchemy ORM models in `app/models/`, Pydantic request/response schemas in `app/schemas/`. Services in `app/services/` hold business logic; routes are thin.

### Frontend (`apps/web`)

React 19 + Vite + TypeScript. TanStack Query for server state, React Hook Form + Zod for forms, React Router v7.

**Routing:** `src/app/router.tsx` — `createBrowserRouter` with a shared `AppShell` layout. Routes map fairly directly to files in `src/routes/`.

**Feature modules** (`src/features/`): Self-contained by domain — each has an `api.ts` (calls `apiFetch`), components, and hooks. The `entries` feature is the largest.

**API client:** `src/lib/api.ts` — `apiFetch<T>(path, options)` wraps fetch, attaches credentials, throws `ApiError` with a `.code` string. `withQuery(path, params)` builds query strings. All API functions live in `features/*/api.ts`.

**i18n:** `src/i18n/messages.ts` — three locales (pt-BR, tupi-BR, en-US). `useI18n()` returns `{ t, locale }`. Add keys to all three locales when adding user-facing strings.

**Types:** Shared TypeScript interfaces are in `src/lib/types.ts`. Keep backend response shapes here.

### Participation gate

Entry submission is gated on a participation score from recent review actions over a rolling window. Key files:
- `apps/api/app/services/participation.py` — score computation, event recording
- `apps/api/app/config.py` — all gate thresholds and weights are env-var configurable
- `apps/web/src/lib/page-engagement.ts` — client-side sessionStorage tracker that measures per-page voting engagement; card votes flush via `POST /entries/{id}/engagement`, while detail-page navigation may piggyback the previous page onto the next entry/submit-gate fetch
- `docs/participation-gate.md` — full design doc with defaults, config reference, backfill instructions

Default weights: entry vote = 1.0, example vote = 1.0; page engagement = 0.0 (analytics-only). 7-day rolling window. Tiers: 0 actions → 1 post/day (base), ≥3 → 2/day, ≥12 → 20/day cap. `participation_score` is canonical; `next_review_actions_required` is only populated when enabled weights make one review action equal one point. `entry_vote_cost` / `entry_vote_daily_step*` in `config.py` are legacy from a previous system; the active gate uses only `entry_participation_*` keys.

### Key conventions

- Error codes are snake_case strings (e.g. `entry_participation_gate`, `entry_not_found`). Frontend resolves them to localized messages in `src/lib/localized-api-error.ts`.
- Votes are **never consumed** — they are participation signals, not a balance.
- All participation events are written as append-only audit records with a `source_key` unique constraint to prevent double-counting.
- The `entry_vote_cost` / `entry_vote_daily_step*` config keys in `config.py` are legacy; the active gate system uses `entry_participation_*` keys.
