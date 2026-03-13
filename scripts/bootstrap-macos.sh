#!/usr/bin/env bash
set -euo pipefail

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is required on macOS. Install from https://brew.sh and rerun."
  exit 1
fi

ensure_formula() {
  local formula="$1"
  if brew list --versions "$formula" >/dev/null 2>&1; then
    echo "✓ $formula already installed"
  else
    echo "Installing $formula..."
    brew install "$formula"
  fi
}

echo "Updating Homebrew metadata..."
brew update

ensure_formula uv
ensure_formula pnpm
ensure_formula postgresql@17

if brew services list | grep -E '^postgresql@17\s+started' >/dev/null 2>&1; then
  echo "✓ postgresql@17 service is running"
else
  echo "postgresql@17 is installed but not running. Start it with:"
  echo "  brew services start postgresql@17"
fi

echo

echo "Next steps:"
echo "  make install"
echo "  make db-create"
echo "  make db-migrate"
echo "  make dev"
