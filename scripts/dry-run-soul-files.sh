#!/usr/bin/env bash
# dry-run-soul-files.sh — Generate soul files by simulating diverse characters
#
# Usage:
#   ./scripts/dry-run-soul-files.sh --file scripts/characters.json
#   ./scripts/dry-run-soul-files.sh --file scripts/characters.json --only fred-rogers
#   ./scripts/dry-run-soul-files.sh --file scripts/characters.json --exchanges 10

set -euo pipefail
cd "$(dirname "$0")/.."

# Load .env if present
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Validate
if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "Error: ANTHROPIC_API_KEY not set. Add it to .env or export it."
  exit 1
fi

# Forward all args to the TypeScript script
exec npx tsx scripts/dry-run-soul-files.ts "$@"
