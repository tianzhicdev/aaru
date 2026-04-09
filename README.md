# Thumos

Backend-first scaffold for the Thumos POC described in [VISION.md](VISION.md), now including the queue-backed reflection note pipeline, versioned soul artifacts, and model-profile based LLM routing.

## Included

- TypeScript domain modules for soul mirror prompts, reflection note generation, and visible/hidden soul-file synthesis
- Cloudflare Workers API under `workers/src`
- Cloudflare Queue-backed background jobs for reflection snapshots plus separate visible/hidden synthesis
- Neon schema and SQL migrations under `db/`
- iOS dashboard-v2 soul file UI under `Thumos/App`
- Unit and integration tests with Vitest

## Commands

```bash
pnpm install
pnpm db:migrate
pnpm db:migrate:dev
pnpm test
pnpm lint
pnpm verify:live
pnpm ios:generate
pnpm ios:list
pnpm workers:dev
./deploy.sh
```

## Deployment note

The API is deployed with Cloudflare Workers plus a Cloudflare Queue for background jobs.

Current server flow:

- `bootstrap-soul` — bootstrap session and visible soul-file state
- `sync-messages` — fetch the full canonical transcript
- `soul-converse` — unified SSE conversation endpoint for both `mode: "opening"` and `mode: "reply"`
- `get-soul-file` — returns the current visible soul file and enqueues async synthesis when needed
- background queue — runs reflection snapshots every 10 total persisted messages (about 5 exchanges) and separate visible/hidden synthesis after 3+ user messages

Dashboard-v2 visible fields:

- `personalitySpectrum`
- `topValues`
- `relationalStyle`

Dashboard-v2 iOS surfaces:

- tappable soul compass
- personality spectrum bars
- top value pills
- relational style card
- collapsible narrative sections

Hidden soul file fields:

- `expertReflections`
- `coreDrivers`
- `coreValues`
- `voice`
- `depthMap.domainCoverage`
- `analystNotes`
- `honestInsights`

Required Worker runtime secrets:

- `DATABASE_URL`
- `ANTHROPIC_API_KEY`
- `THUMOS_SESSION_SECRET`

Optional worker secrets:

- `FIREWORKS_API_KEY` for the `value_default` and `value_cjk` open-model profiles
- `DEFAULT_MODEL_PROFILE_ID` to choose the default profile for newly created users (`value_default` by default)
- `XAI_TOKEN` for opening-mode current-events context
- `DEBUG_API_TOKEN` to unlock the debug endpoints
- `ENABLE_DEBUG_TRACES=true` to persist raw LLM traces for debug inspection

See [DEPLOY.md](DEPLOY.md) for the dev/prod split, root-owned prod secrets, the `workers.dev` dev URL, and the exact deploy commands.

After the prod secrets file is in place, keep the repo-local `.env` dev-only.

Optional production smoke test:

```bash
pnpm verify:live
```

Simulation and soul-artifact verification:

```bash
npx tsx scripts/dry-run-soul-files.ts --file scripts/characters.json --only fred-rogers
```

See [scripts/SIMULATION.md](scripts/SIMULATION.md) for the live simulation checklist.
