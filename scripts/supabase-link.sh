#!/bin/sh
set -eu

if [ -z "${SUPABASE_PROJECT_ID:-}" ] || [ -z "${SUPABASE_PW:-}" ]; then
  echo "SUPABASE_PROJECT_ID and SUPABASE_PW are required."
  exit 1
fi

if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "SUPABASE_ACCESS_TOKEN is required for CLI auth."
  exit 1
fi

npx supabase link \
  --project-ref "$SUPABASE_PROJECT_ID" \
  --password "$SUPABASE_PW" \
  --yes
