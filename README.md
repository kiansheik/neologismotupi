# Dicionário de Tupi

Official site: https://neo.academiatupi.com

Community-built living dictionary of Tupi usage, historical and contemporary.
This repository is still named `neologismotupi` for historical reasons: the project began focused on documenting contemporary neologisms, but it has since expanded to include historical sources and broader usage, so the product name evolved to Dicionário de Tupi.

## What this project is
Dicionário de Tupi is a community platform for collecting, reviewing, and discussing Tupi entries and usage examples - historical, contemporary, and newly coined. It is not an official dictionary.

## Why it exists
People already use, study, and document Tupi in classrooms, communities, archives, and online spaces. This project gives those entries a transparent, versioned, moderateable record.

## Current MVP scope
- Account signup/login/logout with httpOnly session cookies.
- Email verification and password reset/recovery flow.
- Submit/edit entries with revision history.
- Add usage examples.
- Vote on entries and examples (with anti-abuse rules).
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
APP_RELEASE=dev-local
APP_PUBLIC_URL=http://localhost:5173
FOUNDER_EMAIL=kiansheik3128@gmail.com
DATABASE_URL=postgresql+asyncpg://localhost/nheenga_dev
SECRET_KEY=change-me
CORS_ORIGINS=http://localhost:5173
TURNSTILE_ENABLED=false
TURNSTILE_SECRET_KEY=
TURNSTILE_INCLUDE_REMOTE_IP=false
# Dev only. Must be false in production.
FIRST_USER_IS_ADMIN=true
REQUIRE_VERIFIED_EMAIL=false
SESSION_COOKIE_NAME=nheenga_session
SESSION_TTL_HOURS=168
SESSION_COOKIE_SECURE=false
SESSION_COOKIE_SAMESITE=lax
SESSION_COOKIE_DOMAIN=
SESSION_COOKIE_PATH=/
ENFORCE_DOWNVOTE_ACCOUNT_AGE=true
AUTO_APPROVE_AFTER_THRESHOLD=-1
EMAIL_DELIVERY=log
SMTP_HOST=
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=
SMTP_FROM_NAME="Dicionário de Tupi"
SMTP_USE_TLS=true
VERIFICATION_TOKEN_TTL_MINUTES=30
PASSWORD_RESET_TOKEN_TTL_MINUTES=30
```

### `apps/api/.env.production.example`

```env
APP_ENV=production
APP_RELEASE=manual
APP_PUBLIC_URL=https://neo.academiatupi.com
FOUNDER_EMAIL=kiansheik3128@gmail.com
DATABASE_URL=postgresql+asyncpg://postgres:change-me@db.example.com:5432/nheenga_prod
SECRET_KEY=replace-with-a-long-random-secret-key-at-least-32-chars
CORS_ORIGINS=https://academiatupi.com,https://www.academiatupi.com,https://neo.academiatupi.com
TURNSTILE_ENABLED=true
TURNSTILE_SECRET_KEY=replace-with-turnstile-secret
TURNSTILE_INCLUDE_REMOTE_IP=false
FIRST_USER_IS_ADMIN=false
REQUIRE_VERIFIED_EMAIL=true
SESSION_COOKIE_NAME=nheenga_session
SESSION_TTL_HOURS=168
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=lax
SESSION_COOKIE_DOMAIN=
SESSION_COOKIE_PATH=/
ENFORCE_DOWNVOTE_ACCOUNT_AGE=true
AUTO_APPROVE_AFTER_THRESHOLD=-1
EMAIL_DELIVERY=smtp
SMTP_HOST=mail.privateemail.com
SMTP_PORT=587
SMTP_USERNAME=no-reply@academiatupi.com
SMTP_PASSWORD=replace-with-namecheap-private-email-password
SMTP_FROM_EMAIL=no-reply@academiatupi.com
SMTP_FROM_NAME="Academia Tupi"
SMTP_USE_TLS=true
VERIFICATION_TOKEN_TTL_MINUTES=30
PASSWORD_RESET_TOKEN_TTL_MINUTES=30
```

Docker deploy stack note (Namecheap relay default):
- `deploy/docker-compose.remote.yml` includes an internal `smtp-relay` service.
- For that path, set `deploy/env/api.env` with:
  - `SMTP_HOST=smtp-relay`
  - `SMTP_PORT=25`
  - `SMTP_USE_TLS=false`
- And set `deploy/env/stack.env` with:
  - `SMTP_RELAYHOST=[mail.privateemail.com]:587`
  - `SMTP_RELAYHOST_USERNAME=no-reply@academiatupi.com`
  - `SMTP_RELAYHOST_PASSWORD=<namecheap-private-email-password>`

### `apps/web/.env`

```env
VITE_API_BASE_URL=http://localhost:8000/api
VITE_SITE_URL=http://localhost:5173
VITE_APP_NAME=Dicionário de Tupi
VITE_TURNSTILE_SITE_KEY=
VITE_GA_MEASUREMENT_ID=
```

Turnstile note:
- `TURNSTILE_SECRET_KEY` is validated on the API server at request time.
- `TURNSTILE_INCLUDE_REMOTE_IP=false` is recommended behind reverse proxies/CDN to avoid false negatives from IP forwarding mismatches.
- `VITE_TURNSTILE_SITE_KEY` is compiled into the frontend at build time, so changing it requires a new frontend deploy.
- `EMAIL_DELIVERY=log` is for local/dev troubleshooting only. Use `EMAIL_DELIVERY=smtp` in production.
- `FOUNDER_EMAIL` controls who receives the `fundador/founder` badge.
- `ENFORCE_DOWNVOTE_ACCOUNT_AGE=false` temporarily disables the 72h downvote restriction (useful for beta).
- `AUTO_APPROVE_AFTER_THRESHOLD=-1` disables auto-approval for non-moderators (everything stays `pending` until review or moderator/superuser vote).
- `AUTO_APPROVE_AFTER_THRESHOLD=0` auto-approves immediately.
- `AUTO_APPROVE_AFTER_THRESHOLD=N` (N >= 1) auto-approves after the user already has at least N submissions.

### `apps/web/.env.production.example`

```env
VITE_API_BASE_URL=https://api.academiatupi.com/api
VITE_SITE_URL=https://neo.academiatupi.com
VITE_APP_NAME=Dicionário de Tupi
VITE_TURNSTILE_SITE_KEY=
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

Google Analytics (GA4) note:
- Frontend analytics is enabled only when `VITE_GA_MEASUREMENT_ID` is set.
- `VITE_SITE_URL` is used to generate canonical URLs, `robots.txt`, and `sitemap.xml` during frontend build.
- Tracked events include SPA page views, auth flows, entry/example submit & vote actions, report actions, moderation actions, and list filter usage.
- Avoid sending PII (emails/free text) in analytics params.

## Run backend only

```bash
make dev-api
```

OpenAPI docs will be available at `http://localhost:8000/docs`.
Health endpoints:
- `GET /healthz` (includes DB ping + current `release` id)
- `GET /health` (alias)

## Run frontend only

```bash
make dev-web
```

Auth/recovery pages:
- `/signup`
- `/login`
- `/recover`
- `/verify-email`
- `/reset-password`

## Build frontend (static files)

```bash
make web-build
```

Output directory: `apps/web/dist`

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

## Docker DB dump/restore helpers

Dump local Docker Postgres:

```bash
make db-dump-docker
```

Restore a dump into a target DB URL:

```bash
make db-restore-dump DUMP_FILE=/path/to/dump.sql.gz DATABASE_URL=postgresql://user:pass@host:5432/dbname
```

## Production deploy runbook

Use this step-by-step guide for first production deploy:

- [docs/deploy-cloudflare-vps.md](docs/deploy-cloudflare-vps.md)

It includes:
- correct Cloudflare Pages build settings for this monorepo
- VPS + Postgres setup
- systemd + Caddy setup
- copying your local Docker DB to production
- explicit fix for `wrangler deploy` misconfiguration on static Pages deploys

## Provider-independent Docker deploy over SSH

Routine deploys are now simplified in Make:

```bash
make deploy-daily
```

`deploy-daily` does a quick live-safe path for a small single-server setup:
- sync repo to VPS
- build API image only
- run Alembic migrations
- restart API container (keeps Postgres data)
- run smoke checks against `https://api.academiatupi.com`

Defaults are tuned for this repo:
- `DEPLOY_HOST=academiatupi.com`
- `DEPLOY_USER=root`
- `DEPLOY_PATH=/srv/nheenga-neologismos`
- `DEPLOY_API_URL=https://api.academiatupi.com`
- `DEPLOY_SMOKE_ORIGIN=https://neo.academiatupi.com`

When you need infra-level updates (not just daily API code updates):

```bash
make deploy-full
```

When you intentionally want a destructive reset + reseed:

```bash
make deploy-reset DEPLOY_SEED_CSV=/absolute/path/neologisms.csv
```

`deploy-reset` runs with `DEPLOY_RESET_STACK=1 DEPLOY_RESET_VOLUMES=1`, so it wipes remote DB volumes before migrating and seeding.

All deploy commands include a unique deploy ID (timestamp + git SHA) and poll `/healthz` until the API reports that exact release.

Advanced/manual command is still available:

```bash
make deploy-ssh-all DEPLOY_HOST=<server-ip-or-hostname> DEPLOY_USER=root DEPLOY_PATH=/srv/nheenga-neologismos [DEPLOY_MODE=full|daily]
```

Before first run, create secret env files:

```bash
cp deploy/env/api.env.example deploy/env/api.env
cp deploy/env/postgres.env.example deploy/env/postgres.env
cp deploy/env/stack.env.example deploy/env/stack.env
```

Optional extras:

```bash
make deploy-ssh-all DEPLOY_DB_DUMP=backups/docker-postgres/<dump-file>.sql.gz
make deploy-smoke
make deploy-email-test TO=you@domain.com
make deploy-smtp-logs
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
- Backend + PostgreSQL + SMTP relay on one VPS Docker stack.
- Keep Postgres schema portable for later managed Postgres migration without ORM rewrite.
- Optional production bot verification (Cloudflare Turnstile) via the existing adapter interface.
