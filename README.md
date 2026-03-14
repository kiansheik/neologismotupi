# Nheenga Neologismos

Community record of proposed and attested contemporary Tupi usage.

## What this project is
Nheenga Neologismos is a community platform for collecting, reviewing, and discussing neologism proposals and usage examples. It is not an official dictionary.

## Why it exists
People already create contemporary Tupi usage in classrooms, communities, and online spaces. This project gives those proposals a transparent, versioned, moderateable record.

## Current MVP scope
- Account signup/login/logout with httpOnly session cookies.
- Submit/edit entries with revision history.
- Add usage examples.
- Vote on entries (with anti-abuse rules).
- Report entries/examples.
- Moderator queue and report resolution.
- Search/filter entry lists.

## Tech stack
- Frontend: Vite + React + TypeScript + React Router + TanStack Query + React Hook Form + Zod + Tailwind.
- Backend: FastAPI + Pydantic v2 + SQLAlchemy 2.0 async + Alembic.
- Database: PostgreSQL (native local first; optional Docker fallback).
- Tooling: `pnpm` (web), `uv` (api), root `Makefile`, Ruff, ESLint, Prettier, Vitest, pytest, Playwright.

## Repository layout

```text
/
  README.md
  Makefile
  .editorconfig
  .gitignore
  .env.example
  docker-compose.yml
  /scripts
  /apps
    /web
    /api
  /docs
```

## Native local setup (macOS)

1. Bootstrap dependencies:

```bash
make bootstrap-macos
```

2. Ensure PostgreSQL 17 is running:

```bash
brew services start postgresql@17
```

3. (If needed) ensure local role exists:

```bash
createuser -s "$(whoami)" || true
```

4. Copy environment files:

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

5. Install dependencies:

```bash
make install
```

6. Create database and run migrations:

```bash
make db-create
make db-migrate
```

7. Seed development data (CSV only):

```bash
make seed
```

By default, the seed script checks:
- `~/nhe-enga/neologisms.csv`
- `~/code/nhe-enga/neologisms.csv`

Override the CSV path when needed:

```bash
SEED_CSV_PATH=~/nhe-enga/neologisms.csv make seed
```

If you want to fully reset local DB data and reseed in one command:

```bash
make db-rebuild
```

8. Start both apps:

```bash
make dev
```

## Native local setup (Debian/Ubuntu)

1. Bootstrap dependencies:

```bash
make bootstrap-linux
```

2. Start PostgreSQL:

```bash
sudo service postgresql start
```

3. (If needed) create local PostgreSQL role matching OS user:

```bash
sudo -u postgres createuser --superuser "$USER" || true
```

4. Copy environment files:

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

5. Install dependencies and initialize DB:

```bash
make install
make db-create
make db-rebuild
```

6. Run development servers:

```bash
make dev
```

## Optional Docker PostgreSQL fallback
Docker is optional. Native local PostgreSQL is the primary path.

1. Start postgres container:

```bash
docker compose up -d postgres
```

2. Update `apps/api/.env`:

```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/nheenga_dev
```

3. Run migrations and seed:

```bash
make db-rebuild
```

## Environment variables

### Root `.env`

```env
APP_ENV=development
```

### Optional seed override

```env
SEED_CSV_PATH=~/nhe-enga/neologisms.csv
```

### `apps/api/.env`

```env
APP_ENV=development
DATABASE_URL=postgresql+asyncpg://localhost/nheenga_dev
SECRET_KEY=change-me
CORS_ORIGINS=http://localhost:5173
TURNSTILE_ENABLED=false
TURNSTILE_SECRET_KEY=
# Dev only. Must be false in production.
FIRST_USER_IS_ADMIN=true
REQUIRE_VERIFIED_EMAIL=false
SESSION_COOKIE_NAME=nheenga_session
SESSION_TTL_HOURS=168
SESSION_COOKIE_SECURE=false
SESSION_COOKIE_SAMESITE=lax
SESSION_COOKIE_DOMAIN=
SESSION_COOKIE_PATH=/
```

### `apps/api/.env.production.example`

```env
APP_ENV=production
DATABASE_URL=postgresql+asyncpg://postgres:change-me@db.example.com:5432/nheenga_prod
SECRET_KEY=replace-with-a-long-random-secret-key-at-least-32-chars
CORS_ORIGINS=https://academiatupi.com,https://app.academiatupi.com
TURNSTILE_ENABLED=true
TURNSTILE_SECRET_KEY=replace-with-turnstile-secret
FIRST_USER_IS_ADMIN=false
REQUIRE_VERIFIED_EMAIL=true
SESSION_COOKIE_NAME=nheenga_session
SESSION_TTL_HOURS=168
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=lax
SESSION_COOKIE_DOMAIN=
SESSION_COOKIE_PATH=/
```

### `apps/web/.env`

```env
VITE_API_BASE_URL=http://localhost:8000/api
VITE_APP_NAME=Nheenga Neologismos
VITE_TURNSTILE_SITE_KEY=
```

## Run backend only

```bash
make dev-api
```

OpenAPI docs will be available at `http://localhost:8000/docs`.
Health endpoints:
- `GET /healthz` (includes DB ping)
- `GET /health` (alias)

## Run frontend only

```bash
make dev-web
```

## Frontend localization
- Default UI locale is `pt-BR`.
- Available locales: `pt-BR`, `tupi-BR` (placeholder copy of Portuguese), `en-US`.
- Locale dictionaries live in:
  - `apps/web/src/i18n/messages.ts`
- i18n provider and locale persistence live in:
  - `apps/web/src/i18n/index.tsx`

To add a new language:
1. Copy the key set from `ptBR` in `messages.ts`.
2. Add a new dictionary object with the same keys.
3. Register it in `dictionaries` in `index.tsx`.
4. Add the locale option in the header language selector (`AppShell`).

## Run tests

```bash
make test-api
make test-web
make test-e2e
```

Or all together:

```bash
make test
```

## One-time admin bootstrap (production-safe)
For production, keep `FIRST_USER_IS_ADMIN=false` and create the first admin explicitly:

```bash
make bootstrap-admin EMAIL=admin@example.com PASSWORD='change-this-now' DISPLAY_NAME='Admin'
```

You can rotate any user password later with:

```bash
make change-user-password admin@example.com 'new-password'
```

## PostgreSQL backups
Create a compressed backup:

```bash
make db-backup
```

The backup script:
- reads `DATABASE_URL` from `apps/api/.env` (or environment)
- writes files to `backups/postgres/`
- prunes backups older than `BACKUP_RETENTION_DAYS` (default `14`)

Example cron (daily at 02:30 UTC):

```cron
30 2 * * * cd /path/to/neologismotupi && make db-backup >> /var/log/nheenga-backup.log 2>&1
```

## Cookie domain decision
Current default is **API-host scoped cookie** (host-only behavior, `SESSION_COOKIE_DOMAIN=`).

Use `.academiatupi.com` only if you intentionally need cross-subdomain cookie sharing and are ready for the stricter CSRF/session implications.

## Moderation in MVP
- New user contributions enter moderation by threshold rules.
- Moderators can approve/reject/dispute entries and approve/hide examples.
- Reports are reviewed and resolved with explicit statuses.
- All moderation actions are audit-logged.
- No silent hard delete in normal moderation workflow.

See [docs/moderation-policy.md](docs/moderation-policy.md) for details.

## Local PostgreSQL auth note
On many local setups, PostgreSQL allows passwordless access when your database role matches your OS username. That is why the default local URL does not include a password.

## Future deployment direction
- Frontend static build for GitHub Pages/Cloudflare Pages.
- Backend deployed separately (FastAPI host).
- Managed PostgreSQL (Supabase/Postgres-compatible) without ORM rewrite.
- Optional production bot verification (Cloudflare Turnstile) via the existing adapter interface.
