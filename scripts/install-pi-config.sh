#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PI_AGENT_DIR="${PI_AGENT_DIR:-$HOME/.pi/agent}"
DEST="$PI_AGENT_DIR/models.json"

python3 "$ROOT/scripts/verify-models.py"
mkdir -p "$PI_AGENT_DIR"
tmp="$(mktemp "$PI_AGENT_DIR/.models.json.XXXXXX")"
trap 'rm -f "$tmp"' EXIT
install -m 0600 "$ROOT/config/models.json" "$tmp"
mv -f "$tmp" "$DEST"
trap - EXIT

echo "Installed models.json -> $DEST"
