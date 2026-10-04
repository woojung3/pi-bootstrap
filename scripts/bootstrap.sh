#!/usr/bin/env bash
# Install one versioned Pi bundle plus external packages; apply models last.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PI_CODING_AGENT_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"

for command in pi node npm git python3; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "error: required command not found: $command" >&2
    exit 1
  }
done
python3 "$ROOT/scripts/verify-models.py"
SOURCES="$(node - "$ROOT" <<'JS'
const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2];
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
const config = JSON.parse(fs.readFileSync(path.join(root, 'config/packages.json')));
const sources = [`git:${config.repository}@v${version}`, ...config.external];
if (!sources.every(value => typeof value === 'string' && value.trim() && !/\s/.test(value))) {
  throw new Error('Invalid package source declaration');
}
console.log(sources.join('\n'));
JS
)"

# Settings may change as each Pi install completes. Keep a private recovery copy;
# do not claim an all-or-nothing transaction across external package managers.
if [[ -f "$PI_CODING_AGENT_DIR/settings.json" ]]; then
  mkdir -p "$PI_CODING_AGENT_DIR/backups"
  chmod 700 "$PI_CODING_AGENT_DIR/backups"
  install -m 600 "$PI_CODING_AGENT_DIR/settings.json" \
    "$PI_CODING_AGENT_DIR/backups/settings-$(date +%Y%m%d-%H%M%S)-$$.json"
fi
while IFS= read -r source; do
  if ! pi install "$source" --no-approve; then
    echo 'Package installation failed. The model catalog was not replaced.' >&2
    echo 'Some packages may be updated; inspect pi list before retrying.' >&2
    exit 1
  fi
done <<< "$SOURCES"

"$ROOT/scripts/install-pi-config.sh"
printf '\n%s\n' \
  'Bootstrap complete. Verify with: pi list' \
  'Provide LITELLM_API_KEY through your local secret loader.' \
  'Reload or start a new Pi session to use the installed extensions.'
