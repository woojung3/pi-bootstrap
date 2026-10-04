#!/usr/bin/env bash
# Restore the model catalog and pinned personal Pi package.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PI_AGENT_DIR="${PI_AGENT_DIR:-$HOME/.pi/agent}"

for command in pi node npm git python3; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "error: required command not found: $command" >&2
    exit 1
  fi
done

VERSION="$(node -e 'console.log(require(process.argv[1]).version)' "$ROOT/package.json")"
"$ROOT/scripts/install-pi-config.sh"

# Use one Git package; never also register its individual local extensions.
pi install "git:github.com/woojung3/pi-bootstrap@v$VERSION"
for package in pi-statusline pi-goal pi-usage; do
  pi install "npm:@narumitw/$package"
done

printf '\n%s\n' \
  'Bootstrap complete. Verify configured packages with: pi list' \
  'Provide LITELLM_API_KEY through your local secret loader, not this repository.' \
  'Start a new Pi session, then use /login and /model as needed.'
