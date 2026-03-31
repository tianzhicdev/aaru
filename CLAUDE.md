# Thumos — Claude Operating Rules

## Project Overview
Thumos is a soul-based social app. Phase 1 (current): Soul Mirror — reflective AI conversations that build a living soul file.

**Two codebases in one repo:**
- **TypeScript backend** — domain logic + Cloudflare Workers API
- **Swift iOS client** — SwiftUI display layer

## Stack
| Layer | Technology |
|-------|-----------|
| iOS Client | SwiftUI + Combine, iOS 17+, Swift 5.10 |
| Backend | Cloudflare Workers (V8), Neon Postgres |
| Domain Logic | TypeScript (src/domain/), Zod validation |
| LLM | Claude Opus 4 (conversation + assessment + visible narrative), Haiku 4.5 (reflection snapshots + hidden clinical profile), xAI Grok 4 (web search for current events) |
| Tests | Vitest (TS), XCTest (Swift) |
| Package Manager | pnpm (TS), XcodeGen + SPM (iOS) |

## Run Tests

### TypeScript tests (primary — run these on every change)
```bash
npx vitest run
```
All tests must pass. Tests work without API keys because LLM calls are mocked in unit tests and the live conversation path still has a deterministic fallback.

### TypeScript lint
```bash
npx tsc -p tsconfig.json --noEmit
```

### iOS unit tests (requires macOS + Xcode + simulator)
```bash
xcodebuild test -scheme Thumos \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.1' \
  -resultBundlePath ./TestResults \
  | xcpretty
```

### iOS build
```bash
xcodebuild build -scheme Thumos \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.1' \
  -derivedDataPath ./DerivedData \
  | xcpretty
```

## Architecture

### TypeScript (src/)
- `src/domain/` — Pure domain logic (soul mirror only)
- `src/domain/soul.ts` — Soul Mirror system prompts, reflection-snapshot steering, opening flow, anti-repeat rules
- `src/domain/soulFile.ts` — Reflection snapshot prompt, assessment prompt, visible narrative prompt, hidden clinical prompt, merging
- `src/domain/schemas.ts` — Zod schemas for VisibleSoulFile, HiddenSoulFile, ReflectionNote
- `db/` — Neon schema and migrations

### Cloudflare Workers (workers/src/)
- `workers/src/index.ts` — Raw fetch() router
- `workers/src/env.ts` — Env interface (DATABASE_URL, ANTHROPIC_API_KEY, THUMOS_SESSION_SECRET, XAI_TOKEN)
- `workers/src/xai.ts` — xAI Grok web search client for current events in opening mode
- `workers/src/db.ts` — Neon serverless driver + user/session CRUD
- `workers/src/auth.ts` — HMAC SHA-256 session tokens
- `workers/src/claude.ts` — Anthropic API wrapper (streaming + completion)
- `workers/src/soulApp.ts` — Soul message CRUD + reflection/synthesis logic
- `workers/src/backgroundJobsQueue.ts` — Queue producer/consumer helpers
- `workers/src/debugTraces.ts` — Last-3 Claude trace persistence per user/kind
- `workers/src/edge.ts` — CORS + SSE headers + error handling
- `workers/src/handlers/` — Route handlers:
  - `bootstrap-soul.ts` — User bootstrap + session creation
  - `sync-messages.ts` — Full canonical transcript sync
  - `soul-converse.ts` — SSE streaming soul conversations for both `opening` and `reply`
  - `get-soul-file.ts` — Fetch visible soul file + trigger async queue-backed synthesis
  - `delete-account.ts` — Cascade delete user
  - `get-debug-info.ts`, `debug-dump.ts` — Debug endpoints
  - `ping.ts`, `version.ts` — Health check + version gate

### Swift (Thumos/)
- `Thumos/App/ThumosApp.swift` — Entry point
- `Thumos/App/AppModel.swift` — Main @MainActor ObservableObject (bootstrap, sync, streaming state)
- `Thumos/App/BackendClient.swift` — HTTP + SSE streaming client with fallback mode
- `Thumos/App/Models.swift` — Codable data models (VisibleSoulFile, SoulMessage, etc.)
- `Thumos/App/NotificationManager.swift` — Local notification scheduling (weekly Saturday 8pm)
- `Thumos/App/RootView.swift` — Root view (→ SoulMirrorTabView)
- `Thumos/App/SoulMirrorTabView.swift` — Tab container (Conversation + Soul File)
- `Thumos/App/SoulConversationScreen.swift` — Streaming chat UI
- `Thumos/App/SoulFileScreen.swift` — Dashboard-v2 soul file display
- `Thumos/App/SoulCompassView.swift` — Tappable compass with axis detail
- `Thumos/App/PersonalitySpectrumView.swift` — Personality spectrum bars
- `Thumos/App/TopValuesView.swift` — Top value pills
- `Thumos/App/SecureStore.swift` — Keychain wrapper (device/session identity)
- `ThumosTests/` — XCTest unit tests

### Tests (tests/)
- `tests/unit/` — Unit tests for domain functions (soul, soulFile, soulApp, debugTraces, version, xai)
- `tests/integration/` — Handler integration tests (soulMirrorHandlers, deleteAccount)

## Code Style Conventions

### TypeScript
- 2-space indentation, no trailing semicolons enforced (mixed)
- camelCase functions/variables, PascalCase types, SCREAMING_SNAKE_CASE constants
- Named exports, explicit type imports (`import type { ... }`)
- Path aliases: `@thumos/domain/...`, `@thumos/lib/...`
- The live conversation path has a deterministic fallback. Background reflection/synthesis fail closed and keep the last ready state.
- Zod schemas for all domain types crossing boundaries

### Swift
- 4-space indentation
- MVVM with @StateObject/@EnvironmentObject
- async/await + Task for concurrency
- Custom CodingKeys for snake_case <-> camelCase
- OSLog with subsystem "com.trythumos.app"
- private/fileprivate for encapsulation

## Definition of Done
A task is complete when ALL of the following are true:
1. `npx vitest run` — all tests pass
2. `npx tsc -p tsconfig.json --noEmit` — zero type errors
3. No regressions in existing functionality
4. Code is committed with a clear message
5. If iOS code was changed: `xcodebuild build` succeeds (when available)

## Known Constraints & Gotchas
- **No API keys in CI/test** — LLM-dependent code must remain unit-testable without real API calls. The conversation path keeps a fallback; background jobs fail closed.
- **Dual soul file architecture** — VisibleSoulFile (user-facing, "accurate and loving") + HiddenSoulFile (agent-facing, clinical). Generated by assessment → visible narrative / hidden clinical pipeline. If synthesis fails, keep the stale soul file and retry later.
- **No soul sessions** — Messages belong directly to users (no session grouping)
- **iOS client is a display layer** — all state is server-authoritative
- **XcodeGen** — project.yml generates Thumos.xcodeproj; don't edit .xcodeproj directly
- **SSE streaming** — soul-converse returns Server-Sent Events; iOS uses URLSession.bytes
- **Canonical transcript** — Live conversation uses the full persisted `soul_messages` transcript, not a last-10 slice.
- **Opening flow** — Assistant-led starts are unified under `POST /soul-converse` with `mode: "opening"`. There is no separate re-engagement endpoint in the chat flow. Opening mode can fetch current events via xAI web search (Grok 4) for topics from openThreads + recurringThemes, injected as optional "CURRENT CONTEXT" in the system prompt.
- **xAI integration** — Optional (`XAI_TOKEN` env). Uses `grok-4-fast-non-reasoning` with `web_search` tool. Graceful degradation: returns empty on any failure. Only fires in opening mode when topics exist.
- **Reflection snapshots** — Reflection notes are async snapshots generated from all persisted messages every 10 total messages and stored in `reflection_snapshots`.
- **Conversation steering** — Live conversation can include the latest ready reflection snapshot as advisory context, but raw messages remain authoritative.
- **Notification permission** — Requested after first completed session, not on first launch. Local notifications only (no APNs).

## Verify (standard process — run after every change)
1. `npx vitest run` — all tests pass
2. `npx tsc -p tsconfig.json --noEmit` — zero type errors
3. If iOS code was changed: `xcodebuild build-for-testing -project Thumos.xcodeproj -scheme Thumos -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.1'`
4. If tests fail: read error, fix, rerun — repeat up to 3 times
5. If still failing after 3 attempts: write BLOCKED.md explaining why

## Deployment
```bash
cd workers && wrangler deploy
wrangler secret put DATABASE_URL
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put THUMOS_SESSION_SECRET
wrangler secret put XAI_TOKEN
```

Wrangler deploys require Cloudflare auth, typically via `CLOUDFLARE_API_TOKEN`.

Active endpoints: ping, version, bootstrap-soul, sync-messages, soul-converse, get-soul-file, delete-account, get-debug-info, debug-dump

## iOS QA (when macOS/Xcode available)
- Scheme: Thumos
- Bundle ID: com.trythumos.app
- Simulator: iPhone 17 Pro (iOS 26.1)
- Boot: `xcrun simctl boot "iPhone 17 Pro"`
- Screenshot: `xcrun simctl io booted screenshot /tmp/state.png`
