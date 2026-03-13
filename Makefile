SHELL := /bin/bash
.DEFAULT_GOAL := help

APP_ENV ?= development
DB_NAME ?= nheenga_dev
DB_USER ?= $(shell whoami)
DATABASE_URL ?= postgresql+asyncpg://localhost/$(DB_NAME)

API_DIR := apps/api
WEB_DIR := apps/web

.PHONY: help bootstrap-macos bootstrap-linux install dev dev-web dev-api db-create db-migrate db-reset seed test test-web test-api test-e2e lint format

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
	@echo "  make db-reset         # Drop/recreate database and migrate"
	@echo "  make seed             # Seed local fake development data"
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
	@DB_URL="$${DATABASE_URL:-$(DATABASE_URL)}"; \
	DB_NAME_FROM_URL="$$(echo "$$DB_URL" | sed -E 's#^.*/([^/?]+).*$#\1#')"; \
	ROLE="$${PGUSER:-$(DB_USER)}"; \
	if psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$$DB_NAME_FROM_URL'" | grep -q 1; then \
		echo "Database '$$DB_NAME_FROM_URL' already exists."; \
	else \
		createdb -O "$$ROLE" "$$DB_NAME_FROM_URL"; \
		echo "Created database '$$DB_NAME_FROM_URL' owned by '$$ROLE'."; \
	fi

db-migrate:
	@cd $(API_DIR) && DATABASE_URL="$${DATABASE_URL:-$(DATABASE_URL)}" uv run alembic upgrade head

db-reset:
	@DB_URL="$${DATABASE_URL:-$(DATABASE_URL)}"; \
	DB_NAME_FROM_URL="$$(echo "$$DB_URL" | sed -E 's#^.*/([^/?]+).*$#\1#')"; \
	dropdb --if-exists "$$DB_NAME_FROM_URL"; \
	createdb "$$DB_NAME_FROM_URL"; \
	$(MAKE) db-migrate

seed:
	@cd $(API_DIR) && DATABASE_URL="$${DATABASE_URL:-$(DATABASE_URL)}" uv run python -m app.core.seed

test: test-api test-web test-e2e

test-web:
	@cd $(WEB_DIR) && pnpm test -- --run

test-api:
	@cd $(API_DIR) && uv run pytest

test-e2e:
	@cd $(WEB_DIR) && pnpm playwright test

lint:
	@cd $(API_DIR) && uv run ruff check .
	@cd $(WEB_DIR) && pnpm lint

format:
	@cd $(API_DIR) && uv run ruff format .
	@cd $(API_DIR) && uv run ruff check . --fix
	@cd $(WEB_DIR) && pnpm format
