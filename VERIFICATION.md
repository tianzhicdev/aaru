# Thumos Verification Checklist

Run all steps below. Every step must pass before committing.

## 1. TypeScript Tests (required)
```bash
pnpm test
```
Expected: All tests pass. No failures.

## 2. TypeScript Type Check (required)
```bash
pnpm lint
```
Expected: Zero errors.

## 3. iOS Build (required when iOS code changed)
```bash
pnpm ios:generate
xcodebuild build-for-testing -project Thumos.xcodeproj -scheme Thumos \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.1'
```
Expected: `TEST BUILD SUCCEEDED`

## 4. iOS Tests (required when iOS code changed)
```bash
xcodebuild test -project Thumos.xcodeproj -scheme Thumos \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.1'
```
Expected: All tests pass.

## 5. Workers Type Check (required when backend changed)
```bash
pnpm --dir workers typecheck
```
Expected: Zero errors.

## 6. Neon Migrations (required when backend schema changed)
```bash
pnpm db:migrate
```
Expected: All SQL files in `db/migrations/` apply without errors.

## 7. Cloudflare Workers Deploy (when backend changed)
Provision the background queue once per account, either in Cloudflare or with Wrangler:
```bash
wrangler queues create thumos-soul-synthesis
```

Then deploy:
```bash
pnpm workers:deploy
```
Prerequisite: Wrangler auth is configured, typically with `CLOUDFLARE_API_TOKEN`.

Verify:
```bash
curl https://api.trymagpie.xyz/ping
curl -X POST https://api.trymagpie.xyz/version \
  -H 'content-type: application/json' \
  -d '{"build_version":"1.0.0"}'
```
Expected: both return HTTP 200 with valid JSON.

For the queue-backed conversation pipeline, also verify:
1. `POST /bootstrap-soul` returns a token for a device.
2. `POST /sync-messages` returns the full canonical transcript for an existing device, not a truncated last-10 slice.
3. A fresh device can use `POST /soul-converse` with `{"mode":"opening"}` and then `{"mode":"reply","message":"..."}`.
4. After at least 3 user messages, `POST /get-soul-file` returns `synthesis_pending: true`, then eventually returns a non-empty `visible_soul_file`.
5. After at least 10 total messages, `POST /debug-dump` shows a ready `reflection_note`, `latest_conversation_trace`, `latest_synthesis_trace`, and `latest_reflection_trace`.

Production smoke test helper:
```bash
pnpm verify:live
```

Note: synthesis now runs as two separate background jobs (`synthesis_visible` and `synthesis_hidden`) and can take several minutes to complete. The verifier should allow a multi-minute polling window before treating `synthesis_pending` as a failure. If synthesis fails, the API should stop reporting `synthesis_pending: true` for that unchanged transcript and continue serving the last ready soul file until newer messages arrive.

Expected live verification for dashboard-v2:
1. Existing-device `POST /sync-messages` returns the full transcript, not a last-10 slice.
2. Fresh-device `POST /soul-converse` with `{"mode":"opening"}` returns a non-empty streamed opener.
3. After several `mode:"reply"` turns, `POST /get-soul-file` first returns `synthesis_pending: true`, then later returns a visible soul file with:
   - non-empty `portrait`
   - at least 2 populated `personalitySpectrum` traits
   - at least 1 `topValues` entry
   - non-empty `relationalStyle`
4. `POST /get-debug-info` returns a hidden soul file with populated `expertReflections`, `coreDrivers`, or `honestInsights`.
5. `POST /debug-dump` returns:
   - `reflection_note`
   - `latest_conversation_trace`
   - `latest_synthesis_trace`
   - `latest_reflection_trace`

## 8. Simulation (required after prompt or dashboard-v2 changes)
Run at least one live character simulation:
```bash
npx tsx scripts/dry-run-soul-files.ts --file scripts/characters.json --only fred-rogers
```

Expected:
1. The conversation reaches the target exchange count without SSE failure.
2. The generated visible soul file contains dashboard-v2 fields (`personalitySpectrum`, `topValues`, `relationalStyle`).
3. The hidden soul file contains structured clinical data (`expertReflections`, `coreDrivers`, or `honestInsights`).
4. The debug dump contains a reflection note with steering fields (`currentThreads`, `avoidPastQuestions`, `steerToTopics`, or steering reasoning).
5. The readable report in `dry-run-output/<character>/soul-file-readable.md` marks the run as passing.
