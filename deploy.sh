#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKERS_DIR="$ROOT_DIR/workers"

TARGET="dev"
SECRETS_FILE="$ROOT_DIR/.env"
CUSTOM_SECRETS_FILE="false"

usage() {
  cat <<'EOF'
Usage:
  ./deploy.sh
  sudo ./deploy.sh --prod --secrets /Users/biubiu/.secrets/prod.env

Options:
  --prod              Deploy the production Worker. Requires root.
  --secrets <file>    Load deploy inputs from a dotenv file.
  --help              Show this help.
EOF
}

die() {
  echo "Error: $*" >&2
  exit 1
}

load_env_file() {
  local file="$1"
  [[ -f "$file" ]] || die "Secrets file not found: $file"
  while IFS= read -r -d '' key && IFS= read -r -d '' value; do
    export "$key=$value"
  done < <(
    cd "$ROOT_DIR" &&
      node --input-type=module -e '
        import fs from "node:fs";
        import dotenv from "dotenv";

        const parsed = dotenv.parse(fs.readFileSync(process.argv[1]));
        for (const [key, value] of Object.entries(parsed)) {
          process.stdout.write(`${key}\0${value}\0`);
        }
      ' "$file"
  )
}

check_prod_secret_file() {
  local owner perms
  owner="$(stat -f '%Su' "$SECRETS_FILE")"
  perms="$(stat -f '%Sp' "$SECRETS_FILE")"

  [[ "$owner" == "root" ]] || die "Production secrets file must be owned by root: $SECRETS_FILE"
  [[ "$perms" == "-rw-------" ]] || die "Production secrets file must be chmod 600: $SECRETS_FILE"
}

pick_first() {
  local name
  for name in "$@"; do
    if [[ -n "${!name:-}" ]]; then
      printf '%s' "${!name}"
      return 0
    fi
  done
  return 1
}

put_secret() {
  local key="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    return 0
  fi

  printf '%s' "$value" | (
    cd "$WORKERS_DIR"
    pnpm exec wrangler secret put "$key" --env "$WRANGLER_ENV" >/dev/null
  )
}

ensure_queue() {
  local output
  if output="$(
    cd "$WORKERS_DIR" &&
      pnpm exec wrangler queues create "$QUEUE_NAME" \
        --message-retention-period-secs "$QUEUE_RETENTION_SECS" 2>&1
  )"; then
    echo "Created queue $QUEUE_NAME"
    return 0
  fi

  if grep -Eqi "already exists|already taken" <<<"$output"; then
    echo "Queue $QUEUE_NAME already exists"
    return 0
  fi

  printf '%s\n' "$output" >&2
  die "Unable to create queue $QUEUE_NAME"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --prod)
      TARGET="production"
      shift
      ;;
    --secrets)
      [[ $# -ge 2 ]] || die "--secrets requires a file path"
      SECRETS_FILE="$2"
      CUSTOM_SECRETS_FILE="true"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

if [[ "$TARGET" == "production" ]]; then
  [[ $EUID -eq 0 ]] || die "--prod requires root. Run with sudo."
  [[ "$CUSTOM_SECRETS_FILE" == "true" ]] || die "--prod requires --secrets /path/to/prod.env"
  check_prod_secret_file
fi

load_env_file "$SECRETS_FILE"

if [[ "$TARGET" == "dev" ]]; then
  WRANGLER_ENV="dev"
  QUEUE_NAME="thumos-soul-synthesis-dev"
  QUEUE_RETENTION_SECS="86400"
  CLOUDFLARE_API_TOKEN_VALUE="$(pick_first CLOUDFLARE_API_TOKEN_DEV CLOUDFLARE_API_TOKEN || true)"
  CLOUDFLARE_ACCOUNT_ID_VALUE="$(pick_first CLOUDFLARE_ACCOUNT_ID_DEV CLOUDFLARE_ACCOUNT_ID || true)"
  DATABASE_URL_VALUE="$(pick_first DATABASE_URL_DEV DATABASE_URL || true)"
  THUMOS_SESSION_SECRET_VALUE="$(pick_first THUMOS_SESSION_SECRET_DEV THUMOS_SESSION_SECRET || true)"
  ANTHROPIC_API_KEY_VALUE="$(pick_first ANTHROPIC_API_KEY_DEV ANTHROPIC_API_KEY || true)"
  FIREWORKS_API_KEY_VALUE="$(pick_first FIREWORKS_API_KEY_DEV FIREWORKS_API_KEY FIREWORKS_API_DEV FIREWORKS_API || true)"
  XAI_TOKEN_VALUE="$(pick_first XAI_TOKEN_DEV XAI_TOKEN || true)"
  DEFAULT_MODEL_PROFILE_ID_VALUE="$(pick_first DEFAULT_MODEL_PROFILE_ID_DEV DEFAULT_MODEL_PROFILE_ID || true)"
else
  WRANGLER_ENV="production"
  QUEUE_NAME="thumos-soul-synthesis"
  QUEUE_RETENTION_SECS="86400"
  CLOUDFLARE_API_TOKEN_VALUE="$(pick_first CLOUDFLARE_API_TOKEN || true)"
  CLOUDFLARE_ACCOUNT_ID_VALUE="$(pick_first CLOUDFLARE_ACCOUNT_ID || true)"
  DATABASE_URL_VALUE="$(pick_first DATABASE_URL || true)"
  THUMOS_SESSION_SECRET_VALUE="$(pick_first THUMOS_SESSION_SECRET || true)"
  ANTHROPIC_API_KEY_VALUE="$(pick_first ANTHROPIC_API_KEY || true)"
  FIREWORKS_API_KEY_VALUE="$(pick_first FIREWORKS_API_KEY FIREWORKS_API || true)"
  XAI_TOKEN_VALUE="$(pick_first XAI_TOKEN || true)"
  DEFAULT_MODEL_PROFILE_ID_VALUE="$(pick_first DEFAULT_MODEL_PROFILE_ID || true)"
fi

[[ -n "$CLOUDFLARE_API_TOKEN_VALUE" ]] || die "Missing Cloudflare API token for $TARGET"
[[ -n "$CLOUDFLARE_ACCOUNT_ID_VALUE" ]] || die "Missing Cloudflare account id for $TARGET"
[[ -n "$DATABASE_URL_VALUE" ]] || die "Missing DATABASE_URL for $TARGET"
[[ -n "$ANTHROPIC_API_KEY_VALUE" ]] || die "Missing ANTHROPIC_API_KEY for $TARGET"

if [[ -z "$THUMOS_SESSION_SECRET_VALUE" && "$TARGET" == "dev" ]]; then
  THUMOS_SESSION_SECRET_VALUE="$(openssl rand -hex 32)"
  echo "Generated an ephemeral dev THUMOS_SESSION_SECRET for this deploy"
fi

[[ -n "$THUMOS_SESSION_SECRET_VALUE" ]] || die "Missing THUMOS_SESSION_SECRET for $TARGET"

export CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN_VALUE"
export CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID_VALUE"

echo "Deploy target: $TARGET"
ensure_queue

echo "Syncing Worker secrets"
put_secret "DATABASE_URL" "$DATABASE_URL_VALUE"
put_secret "ANTHROPIC_API_KEY" "$ANTHROPIC_API_KEY_VALUE"
put_secret "THUMOS_SESSION_SECRET" "$THUMOS_SESSION_SECRET_VALUE"
put_secret "FIREWORKS_API_KEY" "$FIREWORKS_API_KEY_VALUE"
put_secret "XAI_TOKEN" "$XAI_TOKEN_VALUE"
put_secret "DEFAULT_MODEL_PROFILE_ID" "$DEFAULT_MODEL_PROFILE_ID_VALUE"

echo "Deploying Worker"
(
  cd "$WORKERS_DIR"
  pnpm exec wrangler deploy --env "$WRANGLER_ENV"
)
