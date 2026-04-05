# API Deploy

This repo uses a simple split:

- `dev` is the default deployment target.
- `prod` requires `sudo` plus a root-owned secrets file.

## Dev

Dev uses the free Cloudflare `workers.dev` hostname and the dev Neon database.

Keep dev deploy inputs in the repo-local `.env` file:

```dotenv
CLOUDFLARE_API_TOKEN_DEV=
CLOUDFLARE_ACCOUNT_ID_DEV=
DATABASE_URL_DEV=
THUMOS_SESSION_SECRET_DEV=
ANTHROPIC_API_KEY=
FIREWORKS_API_KEY=
XAI_TOKEN=
DEFAULT_MODEL_PROFILE_ID=frontier_v1
DEBUG_API_TOKEN_DEV=
ENABLE_DEBUG_TRACES_DEV=true
ENABLE_SOULMATE_DEV=true
```

Deploy dev:

```bash
./deploy.sh
```

Apply dev migrations:

```bash
pnpm db:migrate:dev
```

The dev Worker is deployed as `thumos-api-dev` and is reachable on its free `workers.dev` hostname.

## Prod

Keep prod secrets out of the repo and out of local `.env`.

Create a root-owned file at `/Users/biubiu/.secrets/prod.env`:

```dotenv
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_ACCOUNT_ID=
DATABASE_URL=
THUMOS_SESSION_SECRET=
ANTHROPIC_API_KEY=
FIREWORKS_API_KEY=
XAI_TOKEN=
DEFAULT_MODEL_PROFILE_ID=frontier_v1
DEBUG_API_TOKEN=
ENABLE_DEBUG_TRACES=false
ENABLE_SOULMATE=false
```

Recommended file permissions:

```bash
sudo mkdir -p /Users/biubiu/.secrets
sudo chown root:wheel /Users/biubiu/.secrets
sudo chmod 700 /Users/biubiu/.secrets
sudo chown root:wheel /Users/biubiu/.secrets/prod.env
sudo chmod 600 /Users/biubiu/.secrets/prod.env
```

Deploy prod:

```bash
sudo ./deploy.sh --prod --secrets /Users/biubiu/.secrets/prod.env
```

Apply prod migrations:

```bash
sudo node scripts/apply-db-migrations.mjs --env production --env-file /Users/biubiu/.secrets/prod.env
```

Verify prod:

```bash
curl -sS -X POST https://api.trythumos.com/ping \
  -H 'content-type: application/json' \
  -d '{}'

curl -sS -X POST https://api.trythumos.com/bootstrap-soul \
  -H 'content-type: application/json' \
  -d "{\"device_id\":\"prod-smoke-$(date +%s)\"}"
```

## Notes

- Keep prod-only deploy credentials out of the repo-local `.env` once `/Users/biubiu/.secrets/prod.env` is working.
- `deploy.sh` syncs Worker secrets before deploying.
- `deploy.sh` creates the target queue if it does not exist already.
- The deploy script uses 24-hour queue retention so it works on Cloudflare Workers Free accounts.
- `--prod` is blocked unless the script is run as root.
- Cloudflare Workers environments create separate Workers. `dev` deploys as `thumos-api-dev`, while production deploys as `thumos-api`.
- Debug routes require both the normal session token and `x-thumos-debug-token`.
- Raw prompt/response traces are only stored when `ENABLE_DEBUG_TRACES=true`.
