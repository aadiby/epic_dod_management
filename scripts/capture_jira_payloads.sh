#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"

if [[ ! -d "$BACKEND_DIR/.venv" ]]; then
  echo "backend/.venv not found. Create it first (see docs/local-development.md)." >&2
  exit 1
fi

source "$BACKEND_DIR/.venv/bin/activate"
cd "$BACKEND_DIR"

python manage.py capture_jira_payloads "$@"
