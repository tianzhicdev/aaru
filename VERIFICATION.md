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
curl https://api.trythumos.com/ping
curl -X POST https://api.trythumos.com/version \
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
