#!/usr/bin/env bash
set -euo pipefail

if ! command -v apt-get >/dev/null 2>&1; then
  echo "This bootstrap script currently automates Debian/Ubuntu only."
  echo "Install uv, pnpm, and PostgreSQL manually on your distro, then run make install."
  exit 1
fi

echo "Installing OS dependencies (Debian/Ubuntu)..."
sudo apt-get update
sudo apt-get install -y \
  build-essential \
  curl \
  ca-certificates \
  pkg-config \
  libpq-dev \
  python3 \
  python3-venv \
  nodejs \
  npm \
  postgresql \
  postgresql-contrib

if ! command -v uv >/dev/null 2>&1; then
  echo "Installing uv..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
else
  echo "✓ uv already installed"
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "Installing pnpm..."
  if command -v corepack >/dev/null 2>&1; then
    sudo corepack enable || true
    corepack prepare pnpm@latest --activate
  else
    sudo npm install -g pnpm
  fi
else
  echo "✓ pnpm already installed"
fi

echo

echo "Make sure PostgreSQL is running (for example: sudo service postgresql start)."
echo "Next steps:"
echo "  make install"
echo "  make db-create"
echo "  make db-migrate"
echo "  make dev"
