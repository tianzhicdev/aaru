# Thumos

Backend-first scaffold for the Thumos POC described in [VISION.md](VISION.md), now including the dashboard-v2 soul file model and queue-backed reflection/synthesis pipeline.

## Included

- TypeScript domain modules for soul mirror prompts, async reflection snapshots, and dashboard-v2 soul-file synthesis
- Cloudflare Workers API under `workers/src`
- Cloudflare Queue-backed background jobs for reflection snapshots and soul-file synthesis
- Neon schema and SQL migrations under `db/`
- iOS dashboard-v2 soul file UI under `Thumos/App`
- Unit and integration tests with Vitest

## Commands

```bash
pnpm install
pnpm db:migrate
pnpm test
pnpm lint
pnpm verify:live
pnpm ios:generate
pnpm ios:list
pnpm workers:dev
pnpm workers:deploy
```

## Deployment note

The production API is deployed with Cloudflare Workers plus a Cloudflare Queue for background jobs.

Current server flow:

- `bootstrap-soul` — bootstrap session and visible soul-file state
- `sync-messages` — fetch the full canonical transcript
- `soul-converse` — unified SSE conversation endpoint for both `mode: "opening"` and `mode: "reply"`
- `get-soul-file` — returns the current visible soul file and enqueues async synthesis when needed
- background queue — runs reflection snapshots every 10 messages and dashboard-v2 soul-file synthesis after 3+ user messages

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

Dashboard-v2 hidden fields:

- `bigFiveScores`
- `schwartzProfile`
- `attachmentScores`
- `moralFoundations`
- `meaningOrientation`

Required worker secrets:

- `DATABASE_URL`
- `ANTHROPIC_API_KEY`
- `THUMOS_SESSION_SECRET`

Optional worker secrets:

- `XAI_TOKEN` for opening-mode current-events context

Deployment also requires Wrangler auth, typically via `CLOUDFLARE_API_TOKEN`.

Create the queue once before the first deploy, either in Cloudflare or with Wrangler:

```bash
wrangler queues create thumos-soul-synthesis
```

Apply Neon schema changes before deploying backend changes that touch persistence:

```bash
pnpm db:migrate
```

Optional production smoke test:

```bash
pnpm verify:live
```

Simulation and dashboard-v2 verification:

```bash
npx tsx scripts/dry-run-soul-files.ts --file scripts/characters.json --only fred-rogers
```

See [scripts/SIMULATION.md](scripts/SIMULATION.md) for the live simulation checklist.
