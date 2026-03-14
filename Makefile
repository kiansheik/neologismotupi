SHELL := /bin/bash
.DEFAULT_GOAL := help

APP_ENV ?= development
DB_NAME ?= nheenga_dev
DB_USER ?= $(shell whoami)

API_DIR := apps/api
WEB_DIR := apps/web

.PHONY: help bootstrap-macos bootstrap-linux install dev dev-web dev-api db-create db-migrate db-reset db-rebuild seed db-backup bootstrap-admin change-user-password test test-web test-api test-e2e lint format

help:
	@echo "Available targets:"
	@echo "  make bootstrap-macos   # Install local dependencies for macOS (Homebrew)"
	@echo "  make bootstrap-linux   # Install local dependencies for Debian/Ubuntu"
	@echo "  make install           # Install API + web dependencies"
	@echo "  make dev              # Run API and web together"
	@echo "  make dev-api          # Run FastAPI only"
	@echo "  make dev-web          # Run Vite app only"
	@echo "  make db-create        # Create local development database if missing"
	@echo "  make db-migrate       # Apply Alembic migrations"
	@echo "  make db-reset         # Drop/recreate database and migrate (uses DATABASE_URL)"
	@echo "  make db-rebuild       # Reset database and seed from CSV"
	@echo "  make seed             # Seed from CSV only"
	@echo "  make db-backup        # Create a compressed PostgreSQL backup"
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
	@cd $(API_DIR) && set -a; [ -f .env ] && . ./.env; set +a; uv run alembic upgrade head

db-reset:
	@cd $(API_DIR) && set -a; [ -f .env ] && . ./.env; set +a; uv run python -m app.core.db_reset
	@$(MAKE) db-migrate

db-rebuild: db-reset seed

seed:
	@set -a; [ -f .env ] && . ./.env; [ -f "$(API_DIR)/.env" ] && . "$(API_DIR)/.env"; set +a; \
	cd $(API_DIR) && uv run python -m app.core.seed

db-backup:
	@bash scripts/backup-postgres.sh

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