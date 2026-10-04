#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
DEST="$AGENT_DIR/models.json"

python3 "$ROOT/scripts/verify-models.py"
mkdir -p "$AGENT_DIR"
if cmp -s "$ROOT/config/models.json" "$DEST"; then
  chmod 600 "$DEST"
  echo "Model catalog already current: $DEST"
  exit 0
fi

tmp="$(mktemp "$AGENT_DIR/.models.json.XXXXXX")"
trap 'rm -f "$tmp"' EXIT
install -m 600 "$ROOT/config/models.json" "$tmp"
if [[ -f "$DEST" ]]; then
  mkdir -p "$AGENT_DIR/backups"
  chmod 700 "$AGENT_DIR/backups"
  install -m 600 "$DEST" "$AGENT_DIR/backups/models-$(date +%Y%m%d-%H%M%S)-$$.json"
fi
mv -f "$tmp" "$DEST"
trap - EXIT
printf 'Installed models.json -> %s\n' "$DEST"
