#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PI_AGENT_DIR="${PI_AGENT_DIR:-$HOME/.pi/agent}"

mkdir -p "$PI_AGENT_DIR"
install -m 0600 "$ROOT/config/models.json" "$PI_AGENT_DIR/models.json"

echo "Installed models.json -> $PI_AGENT_DIR/models.json"
