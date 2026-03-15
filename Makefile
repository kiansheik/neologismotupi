SHELL := /bin/bash
.DEFAULT_GOAL := help

APP_ENV ?= development
DB_NAME ?= nheenga_dev
DB_USER ?= $(shell whoami)
DEPLOY_HOST ?= academiatupi.com
DEPLOY_USER ?= root
DEPLOY_PATH ?= /srv/nheenga-neologismos
SSH_IDENTITY ?= $(HOME)/.ssh/neologismotupi_ed25519
DEPLOY_API_URL ?= https://api.academiatupi.com
DEPLOY_SMOKE_ORIGIN ?= https://neo.academiatupi.com
DEPLOY_SMOKE_RETRIES ?= 60
DEPLOY_SMOKE_SLEEP_SECONDS ?= 2
DEPLOY_DB_USER ?= nheenga
DEPLOY_DB_NAME ?= nheenga_prod

API_DIR := apps/api
WEB_DIR := apps/web
API_ENV_FILE ?= .env

.PHONY: help bootstrap-macos bootstrap-linux install dev dev-web dev-api web-build prod-check prod-migrate db-create db-migrate db-reset db-rebuild seed test-email db-backup db-dump-docker db-restore-dump migrate-legacy-entry-source deploy-migrate-legacy-entry-source deploy-full deploy-daily deploy-reset deploy-smoke deploy-ssh-all deploy-email-test deploy-smtp-logs deploy-api-logs deploy-api-logs-follow deploy-db-psql bootstrap-admin change-user-password test test-web test-api test-e2e lint format

help:
	@echo "Available targets:"
	@echo "  make bootstrap-macos   # Install local dependencies for macOS (Homebrew)"
	@echo "  make bootstrap-linux   # Install local dependencies for Debian/Ubuntu"
	@echo "  make install           # Install API + web dependencies"
	@echo "  make dev              # Run API and web together"
	@echo "  make dev-api          # Run FastAPI only"
	@echo "  make dev-web          # Run Vite app only"
	@echo "  make web-build        # Build static frontend assets"
	@echo "  make prod-check       # Validate production API config from .env.production"
	@echo "  make prod-migrate     # Run migrations using apps/api/.env.production"
	@echo "  make db-create        # Create local development database if missing"
	@echo "  make db-migrate       # Apply Alembic migrations"
	@echo "  make db-reset         # Drop/recreate database and migrate (uses DATABASE_URL)"
	@echo "  make db-rebuild       # Reset database and seed from CSV"
	@echo "  make seed             # Seed from CSV only"
	@echo "  make test-email TO=<recipient@email>  # Send SMTP test email with current API env"
	@echo "  make db-backup        # Create a compressed PostgreSQL backup"
	@echo "  make db-dump-docker   # Dump local Docker postgres to backups/"
	@echo "  make db-restore-dump DUMP_FILE=<file> DATABASE_URL=<url>  # Restore dump into target DB"
	@echo "  make migrate-legacy-entry-source [APPLY=1] [ACTOR_EMAIL=...] [BEFORE_SLUG=mongaturondara] [BEFORE_DATE=YYYY-MM-DD] [LIMIT=100]"
	@echo "  make deploy-migrate-legacy-entry-source [APPLY=1] [ACTOR_EMAIL=...] [BEFORE_SLUG=mongaturondara] [BEFORE_DATE=YYYY-MM-DD] [LIMIT=100]"
	@echo "  make deploy-daily     # Fast daily deploy: API build/migrate/restart + smoke checks (no seed/reset)"
	@echo "  make deploy-full      # Full stack deploy: API+Postgres+Caddy + migrate + smoke checks"
	@echo "  make deploy-reset DEPLOY_SEED_CSV=/abs/path/neologisms.csv  # Destructive reset + reseed"
	@echo "  make deploy-smoke     # Run smoke checks against DEPLOY_API_URL (+ CORS preflight from DEPLOY_SMOKE_ORIGIN)"
	@echo "  make deploy-email-test TO=<recipient@email> [DEPLOY_HOST=...] [DEPLOY_USER=...] [DEPLOY_PATH=...] [SSH_IDENTITY=...]"
	@echo "  make deploy-smtp-logs [DEPLOY_HOST=...] [DEPLOY_USER=...] [DEPLOY_PATH=...] [SSH_IDENTITY=...]"
	@echo "  make deploy-api-logs [DEPLOY_HOST=...] [DEPLOY_USER=...] [DEPLOY_PATH=...] [SSH_IDENTITY=...]"
	@echo "  make deploy-api-logs-follow [DEPLOY_HOST=...] [DEPLOY_USER=...] [DEPLOY_PATH=...] [SSH_IDENTITY=...]"
	@echo "  make deploy-db-psql [DEPLOY_DB_USER=nheenga] [DEPLOY_DB_NAME=nheenga_prod] [DEPLOY_HOST=...] [DEPLOY_USER=...] [DEPLOY_PATH=...] [SSH_IDENTITY=...]"
	@echo "  make deploy-ssh-all DEPLOY_HOST=<host> [DEPLOY_USER=root] [DEPLOY_PATH=/srv/nheenga-neologismos] [DEPLOY_DB_DUMP=/path/file.sql.gz] [DEPLOY_SEED_CSV=/path/neologisms.csv] [DEPLOY_MODE=full|daily] [DEPLOY_API_URL=https://api.example.com] [DEPLOY_SMOKE_ORIGIN=https://neo.example.com] [SSH_IDENTITY=~/.ssh/id_ed25519] [DEPLOY_RESET_STACK=1] [DEPLOY_RESET_VOLUMES=1]"
	@echo "  make bootstrap-admin EMAIL=<email> PASSWORD=<password> [DISPLAY_NAME=<name>]  # Create/update first admin"
	@echo "  make change-user-password <email> <new_password>  # Update a user's password"
	@echo "  make test             # Run all tests"
	@echo "  make test-web         # Run frontend unit tests"
	@echo "  make test-api         # Run backend tests"
	@echo "  make test-e2e         # Run Playwright tests"
	@echo "  make lint             # Run linters"
	@echo "  make format           # Run formatters"

bootstrap-macos:
	@bash scripts/bootstrap-macos.sh

bootstrap-linux:
	@bash scripts/bootstrap-linux.sh

install:
	@cd $(API_DIR) && uv sync
	@cd $(WEB_DIR) && pnpm install

dev:
	@trap 'kill 0' INT TERM EXIT; \
	$(MAKE) dev-api & \
	$(MAKE) dev-web & \
	wait

dev-web:
	@cd $(WEB_DIR) && pnpm dev

web-build:
	@cd $(WEB_DIR) && pnpm build

prod-check:
	@bash scripts/prod-check-api-config.sh

prod-migrate:
	@cd $(API_DIR) && set -a; [ -f .env.production ] && . ./.env.production; set +a; uv run alembic upgrade head

dev-api:
	@cd $(API_DIR) && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

db-create:
	@set -a; [ -f "$(API_DIR)/.env" ] && . "$(API_DIR)/.env"; set +a; \
	DB_URL="$${DATABASE_URL:-postgresql+asyncpg://localhost/$(DB_NAME)}"; \
	DB_NAME_FROM_URL="$${DB_URL##*/}"; \
	DB_NAME_FROM_URL="$${DB_NAME_FROM_URL%%\\?*}"; \
	ROLE="$${PGUSER:-$(DB_USER)}"; \
	if psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$$DB_NAME_FROM_URL'" | grep -q 1; then \
		echo "Database '$$DB_NAME_FROM_URL' already exists."; \
	else \
		createdb -O "$$ROLE" "$$DB_NAME_FROM_URL"; \
		echo "Created database '$$DB_NAME_FROM_URL' owned by '$$ROLE'."; \
	fi

db-migrate:
	@cd $(API_DIR) && set -a; [ -f $(API_ENV_FILE) ] && . ./$(API_ENV_FILE); set +a; uv run alembic upgrade head

db-reset:
	@cd $(API_DIR) && set -a; [ -f .env ] && . ./.env; set +a; uv run python -m app.core.db_reset
	@$(MAKE) db-migrate

db-rebuild: db-reset seed

seed:
	@set -a; [ -f .env ] && . ./.env; [ -f "$(API_DIR)/.env" ] && . "$(API_DIR)/.env"; set +a; \
	cd $(API_DIR) && uv run python -m app.core.seed

test-email:
	@if [ -z "$(TO)" ]; then \
		echo "Usage: make test-email TO=<recipient@email>"; \
		exit 1; \
	fi
	@cd $(API_DIR) && set -a; [ -f .env ] && . ./.env; set +a; uv run python -m app.core.send_test_email "$(TO)"

db-backup:
	@bash scripts/backup-postgres.sh

db-dump-docker:
	@bash scripts/dump-docker-postgres.sh

db-restore-dump:
	@bash scripts/restore-postgres-from-dump.sh

migrate-legacy-entry-source:
	@cd $(API_DIR) && set -a; [ -f .env ] && . ./.env; set +a; \
	uv run python -m app.core.migrate_legacy_entry_source \
		--actor-email "$(if $(ACTOR_EMAIL),$(ACTOR_EMAIL),kiansheik3128@gmail.com)" \
		$(if $(BEFORE_SLUG),--before-slug "$(BEFORE_SLUG)",) \
		$(if $(BEFORE_DATE),--before-date "$(BEFORE_DATE)",) \
		$(if $(LIMIT),--limit "$(LIMIT)",) \
		$(if $(filter 1,$(APPLY)),--apply,)

deploy-migrate-legacy-entry-source:
	@ssh -i "$(SSH_IDENTITY)" "$(DEPLOY_USER)@$(DEPLOY_HOST)" \
		"cd '$(DEPLOY_PATH)' && \
		docker compose -f deploy/docker-compose.remote.yml --env-file deploy/env/stack.env exec -T api \
		uv run python -m app.core.migrate_legacy_entry_source \
		--actor-email '$(if $(ACTOR_EMAIL),$(ACTOR_EMAIL),kiansheik3128@gmail.com)' \
		$(if $(BEFORE_SLUG),--before-slug '$(BEFORE_SLUG)',) \
		$(if $(BEFORE_DATE),--before-date '$(BEFORE_DATE)',) \
		$(if $(LIMIT),--limit '$(LIMIT)',) \
		$(if $(filter 1,$(APPLY)),--apply,)"

deploy-ssh-all:
	@bash scripts/deploy-ssh-all.sh

deploy-full:
	@DEPLOY_MODE=full \
	DEPLOY_HOST="$(DEPLOY_HOST)" \
	DEPLOY_USER="$(DEPLOY_USER)" \
	DEPLOY_PATH="$(DEPLOY_PATH)" \
	DEPLOY_API_URL="$(DEPLOY_API_URL)" \
	DEPLOY_SMOKE_ORIGIN="$(DEPLOY_SMOKE_ORIGIN)" \
	DEPLOY_SMOKE_RETRIES="$(DEPLOY_SMOKE_RETRIES)" \
	DEPLOY_SMOKE_SLEEP_SECONDS="$(DEPLOY_SMOKE_SLEEP_SECONDS)" \
	bash scripts/deploy-ssh-all.sh

deploy-daily:
	@DEPLOY_MODE=daily \
	DEPLOY_HOST="$(DEPLOY_HOST)" \
	DEPLOY_USER="$(DEPLOY_USER)" \
	DEPLOY_PATH="$(DEPLOY_PATH)" \
	DEPLOY_API_URL="$(DEPLOY_API_URL)" \
	DEPLOY_SMOKE_ORIGIN="$(DEPLOY_SMOKE_ORIGIN)" \
	DEPLOY_SMOKE_RETRIES="$(DEPLOY_SMOKE_RETRIES)" \
	DEPLOY_SMOKE_SLEEP_SECONDS="$(DEPLOY_SMOKE_SLEEP_SECONDS)" \
	bash scripts/deploy-ssh-all.sh

deploy-reset:
	@if [ -z "$(DEPLOY_SEED_CSV)" ]; then \
		echo "Usage: make deploy-reset DEPLOY_SEED_CSV=/abs/path/neologisms.csv [DEPLOY_HOST=...] [DEPLOY_USER=...] [DEPLOY_PATH=...]"; \
		exit 1; \
	fi
	@DEPLOY_MODE=full \
	DEPLOY_RESET_STACK=1 \
	DEPLOY_RESET_VOLUMES=1 \
	DEPLOY_HOST="$(DEPLOY_HOST)" \
	DEPLOY_USER="$(DEPLOY_USER)" \
	DEPLOY_PATH="$(DEPLOY_PATH)" \
	DEPLOY_API_URL="$(DEPLOY_API_URL)" \
	DEPLOY_SMOKE_ORIGIN="$(DEPLOY_SMOKE_ORIGIN)" \
	DEPLOY_SMOKE_RETRIES="$(DEPLOY_SMOKE_RETRIES)" \
	DEPLOY_SMOKE_SLEEP_SECONDS="$(DEPLOY_SMOKE_SLEEP_SECONDS)" \
	DEPLOY_SEED_CSV="$(DEPLOY_SEED_CSV)" \
	bash scripts/deploy-ssh-all.sh

deploy-smoke:
	@API_BASE_URL="$(DEPLOY_API_URL)" \
	SMOKE_ORIGIN="$(DEPLOY_SMOKE_ORIGIN)" \
	RETRIES="$(DEPLOY_SMOKE_RETRIES)" \
	SLEEP_SECONDS="$(DEPLOY_SMOKE_SLEEP_SECONDS)" \
	bash scripts/smoke-api.sh

deploy-email-test:
	@if [ -z "$(TO)" ]; then \
		echo "Usage: make deploy-email-test TO=<recipient@email> [DEPLOY_HOST=...] [DEPLOY_USER=...] [DEPLOY_PATH=...] [SSH_IDENTITY=...]"; \
		exit 1; \
	fi
	@ssh -i "$(SSH_IDENTITY)" "$(DEPLOY_USER)@$(DEPLOY_HOST)" \
		"cd '$(DEPLOY_PATH)' && docker compose -f deploy/docker-compose.remote.yml --env-file deploy/env/stack.env exec -T api uv run python -m app.core.send_test_email '$(TO)'"

deploy-smtp-logs:
	@ssh -i "$(SSH_IDENTITY)" "$(DEPLOY_USER)@$(DEPLOY_HOST)" \
		"cd '$(DEPLOY_PATH)' && docker compose -f deploy/docker-compose.remote.yml --env-file deploy/env/stack.env logs --tail=120 smtp-relay"

deploy-api-logs:
	@ssh -i "$(SSH_IDENTITY)" "$(DEPLOY_USER)@$(DEPLOY_HOST)" \
		"cd '$(DEPLOY_PATH)' && docker compose -f deploy/docker-compose.remote.yml --env-file deploy/env/stack.env logs --tail=180 api"

deploy-api-logs-follow:
	@ssh -i "$(SSH_IDENTITY)" "$(DEPLOY_USER)@$(DEPLOY_HOST)" \
		"cd '$(DEPLOY_PATH)' && docker compose -f deploy/docker-compose.remote.yml --env-file deploy/env/stack.env logs -f --tail=180 api"

deploy-db-psql:
	@ssh -t -i "$(SSH_IDENTITY)" "$(DEPLOY_USER)@$(DEPLOY_HOST)" \
		"cd '$(DEPLOY_PATH)' && docker compose -f deploy/docker-compose.remote.yml --env-file deploy/env/stack.env exec postgres sh -lc 'psql -U \"$(DEPLOY_DB_USER)\" -d \"$(DEPLOY_DB_NAME)\"'"

bootstrap-admin:
	@EMAIL_INPUT="$${EMAIL:-}"; \
	PASSWORD_INPUT="$${PASSWORD:-}"; \
	DISPLAY_NAME_INPUT="$${DISPLAY_NAME:-}"; \
	if [ -z "$$EMAIL_INPUT" ] || [ -z "$$PASSWORD_INPUT" ]; then \
		echo "Usage: make bootstrap-admin EMAIL=<email> PASSWORD=<password> [DISPLAY_NAME=<name>]"; \
		exit 1; \
	fi; \
	cd $(API_DIR) && set -a; [ -f .env ] && . ./.env; set +a; \
	if [ -n "$$DISPLAY_NAME_INPUT" ]; then \
		uv run python -m app.core.bootstrap_admin "$$EMAIL_INPUT" "$$PASSWORD_INPUT" "$$DISPLAY_NAME_INPUT"; \
	else \
		uv run python -m app.core.bootstrap_admin "$$EMAIL_INPUT" "$$PASSWORD_INPUT"; \
	fi

ifneq (,$(filter change-user-password,$(MAKECMDGOALS)))
_CUP_EMAIL := $(word 2,$(MAKECMDGOALS))
_CUP_PASSWORD := $(word 3,$(MAKECMDGOALS))
ifneq ($(_CUP_EMAIL),)
.PHONY: $(_CUP_EMAIL)
$(_CUP_EMAIL):
	@:
endif
ifneq ($(_CUP_PASSWORD),)
.PHONY: $(_CUP_PASSWORD)
$(_CUP_PASSWORD):
	@:
endif
endif

change-user-password:
	@EMAIL_INPUT="$(word 2,$(MAKECMDGOALS))"; \
	PASSWORD_INPUT="$(word 3,$(MAKECMDGOALS))"; \
	if [ -z "$$EMAIL_INPUT" ]; then EMAIL_INPUT="$${EMAIL:-}"; fi; \
	if [ -z "$$PASSWORD_INPUT" ]; then PASSWORD_INPUT="$${NEW_PASSWORD:-}"; fi; \
	if [ -z "$$EMAIL_INPUT" ] || [ -z "$$PASSWORD_INPUT" ]; then \
		echo "Usage: make change-user-password <email> <new_password>"; \
		echo "Alternative (for special chars): make change-user-password EMAIL=<email> NEW_PASSWORD=<password>"; \
		exit 1; \
	fi; \
	cd $(API_DIR) && set -a; [ -f .env ] && . ./.env; set +a; uv run python -m app.core.change_user_password "$$EMAIL_INPUT" "$$PASSWORD_INPUT"

test: test-api test-web test-e2e

test-web:
	@cd $(WEB_DIR) && pnpm test -- --run

test-api:
	@cd $(API_DIR) && PYTHONPATH=. uv run pytest

test-e2e:
	@cd $(WEB_DIR) && pnpm playwright test

lint:
	@cd $(API_DIR) && uv run ruff check .
	@cd $(WEB_DIR) && pnpm lint

format:
	@cd $(API_DIR) && uv run ruff format .
	@cd $(API_DIR) && uv run ruff check . --fix
	@cd $(WEB_DIR) && pnpm format

push:
	git add .
	git commit
	git push origin HEAD
