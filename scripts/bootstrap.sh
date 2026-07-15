#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PI_AGENT_DIR="${PI_AGENT_DIR:-$HOME/.pi/agent}"

if ! command -v pi >/dev/null 2>&1; then
  echo "error: pi command not found. Install pi first, then rerun this script." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "error: npm command not found. Install Node.js/npm, then rerun this script." >&2
  exit 1
fi

echo "Installing runtime dependencies with npm ci..."
npm ci --omit=dev --prefix "$ROOT"

mkdir -p "$PI_AGENT_DIR"
install -m 0600 "$ROOT/config/models.json" "$PI_AGENT_DIR/models.json"

echo "Installed models.json -> $PI_AGENT_DIR/models.json"

if command -v direnv >/dev/null 2>&1 && [ ! -f "$ROOT/.envrc" ]; then
  cp "$ROOT/envrc.example" "$ROOT/.envrc"
  echo "Created $ROOT/.envrc from envrc.example. Edit secrets, then run: direnv allow"
fi

pi install npm:@narumitw/pi-statusline
pi install npm:@narumitw/pi-goal
pi install npm:@narumitw/pi-codex-usage
pi install "$ROOT/packages/pi-yolo"
pi install "$ROOT/packages/pi-academy"
pi install "$ROOT/packages/pi-google-data-store-search"
pi install "$ROOT/packages/pi-teams-notify"

echo
echo "Bootstrap complete."
echo "Next steps:"
echo "  1. Ensure LITELLM_MASTER_KEY / LITELLM_API_KEY are set."
echo "  2. Run: pi"
echo "  3. In pi, run /login and /model."
