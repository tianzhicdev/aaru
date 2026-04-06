# Thumos — Claude Operating Rules

## Project Overview
Thumos is a soul-based social app. Phase 1: Soul Mirror — reflective AI conversations that build a living soul file. Phase 2 (current): Soulmate — LLM-based match evaluation, match reasoning, display names, and direct messaging between matched users.

**Two codebases in one repo:**
- **TypeScript backend** — domain logic + Cloudflare Workers API
- **Swift iOS client** — SwiftUI display layer

## Stack
| Layer | Technology |
|-------|-----------|
| iOS Client | SwiftUI + Combine, iOS 17+, Swift 5.10 |
| Backend | Cloudflare Workers (V8), Neon Postgres |
| Domain Logic | TypeScript (src/domain/), Zod validation |
| LLM | Model-profile based routing: Anthropic for `frontier_v1`, Fireworks OpenAI-compatible DeepSeek for `value_v1`, optional xAI Grok web search for opening context |
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
xcodebuild test -project Thumos.xcodeproj -scheme Thumos \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.1' \
  -resultBundlePath ./TestResults \
  | xcpretty
```

### iOS build
```bash
xcodebuild build -project Thumos.xcodeproj -scheme Thumos \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.1' \
  -derivedDataPath ./DerivedData \
  | xcpretty
```

## Architecture

### TypeScript (src/)
- `src/domain/` — Pure domain logic (soul mirror + matching)
- `src/domain/soul.ts` — Soul Mirror system prompts, navigation block (from reflection note steering fields), opening flow, anti-repeat rules
- `src/domain/soulFile.ts` — Clean-slate reflection note prompt, independent visible narrative + hidden clinical prompts (no assessment step, no merge), JSON schema generation via `toJSONSchema()`, structured-output parsing
- `src/domain/schemas.ts` — Zod schemas for VisibleSoulFile, HiddenSoulFile, ReflectionNote
- `src/domain/matching.ts` — Completeness threshold for soulmate matching
- `src/domain/matchEvaluation.ts` — Match prompt builder, Zod schema for evaluation results, soul summarizer for matching
- `db/` — Neon schema and migrations

### Cloudflare Workers (workers/src/)
- `workers/src/index.ts` — Raw fetch() router
- `workers/src/env.ts` — Env interface (DATABASE_URL, ANTHROPIC_API_KEY, THUMOS_SESSION_SECRET, optional FIREWORKS_API_KEY / DEFAULT_MODEL_PROFILE_ID / XAI_TOKEN)
- `workers/src/xai.ts` — xAI Grok web search client for current events in opening mode
- `workers/src/db.ts` — Neon serverless driver + user/session CRUD
- `workers/src/auth.ts` — HMAC SHA-256 session tokens
- `workers/src/modelProfiles.ts` — Hardcoded model profiles and per-task routing (includes `match_evaluation` task)
- `workers/src/llm.ts` — Provider router
- `workers/src/claude.ts` — Anthropic API wrapper (streaming + completion)
- `workers/src/fireworks.ts` — Fireworks OpenAI-compatible wrapper
- `workers/src/openaiCompatible.ts` — OpenAI-compatible transport helpers
- `workers/src/soulApp.ts` — Soul message CRUD + versioned reflection/synthesis logic (`runReflectionSnapshot`, `runVisibleSynthesis`, `runHiddenSynthesis` — all INSERT new versions, no merge)
- `workers/src/backgroundJobsQueue.ts` — Queue producer/consumer: `reflection_snapshot`, `synthesis_visible`, `synthesis_hidden` job types
- `workers/src/debugTraces.ts` — Last-3 Claude trace persistence per user/kind
- `workers/src/edge.ts` — CORS + SSE headers + error handling
- `workers/src/matchApp.ts` — Soulmate profile CRUD, match CRUD, match message CRUD (getMatchMessages, insertMatchMessage)
- `workers/src/matchingPipeline.ts` — Daily matching pipeline: finds active users, fetches candidates, runs LLM-based evaluateMatch(), caps at 2 matches per user per run
- `workers/src/handlers/` — Route handlers:
  - `bootstrap-soul.ts` — User bootstrap + session creation
  - `sync-messages.ts` — Full canonical transcript sync
  - `soul-converse.ts` — SSE streaming soul conversations for both `opening` and `reply`
  - `get-soul-file.ts` — Fetch visible soul file + trigger async queue-backed synthesis
  - `soulmate-profile.ts` — GET/POST soulmate profile (with display_name)
  - `get-matches.ts` — GET matches list (returns display_name + reasoning, no portrait)
  - `match-messages.ts` — GET/POST direct messages between matched users
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
- `Thumos/App/SoulmateMatchesView.swift` — Match list with detail (reasoning) + chat icons per row
- `Thumos/App/SoulmateProfileSetupView.swift` — Soulmate profile setup (display name, age, gender, preferences)
- `Thumos/App/MatchReasoningSheet.swift` — Sheet showing match name + LLM-generated reasoning (no soul file content)
- `Thumos/App/MatchChatView.swift` — Direct messaging UI between matched users (polling every 5s)
- `ThumosTests/` — XCTest unit tests

### Tests (tests/)
- `tests/unit/` — Unit tests for domain functions (soul, soulFile, soulApp, matchEvaluation, matchingPipeline, debugTraces, version, xai)
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
5. If iOS code was changed: `xcodebuild build -project Thumos.xcodeproj` succeeds (when available)

## Known Constraints & Gotchas
- **No API keys in CI/test** — LLM-dependent code must remain unit-testable without real API calls. The conversation path keeps a fallback; background jobs fail closed.
- **Dual soul file architecture** — VisibleSoulFile (user-facing, "accurate and loving") + HiddenSoulFile (agent-facing, clinical). Generated independently from raw messages + latest reflection note — no shared assessment step, no merge with previous versions. Each synthesis is a clean overwrite (INSERT new version). Visible and hidden are queued as separate background jobs. Psychometric scores (personality spectrum, compass) live only in the visible file. If synthesis fails, keep the last ready file and retry later.
- **No soul sessions** — Messages belong directly to users (no session grouping)
- **iOS client is a display layer** — all state is server-authoritative
- **XcodeGen** — project.yml generates Thumos.xcodeproj; don't edit .xcodeproj directly
- **SSE streaming** — soul-converse returns Server-Sent Events; iOS uses URLSession.bytes
- **Canonical transcript** — Live conversation uses the full persisted `soul_messages` transcript, not a last-10 slice.
- **Opening flow** — Assistant-led starts are unified under `POST /soul-converse` with `mode: "opening"`. There is no separate re-engagement endpoint in the chat flow. Opening mode can fetch current events via xAI web search (Grok 4) for topics from openThreads + recurringThemes, injected as optional "CURRENT CONTEXT" in the system prompt.
- **xAI integration** — Optional (`XAI_TOKEN` env). Uses `grok-4-fast-non-reasoning` with `web_search` tool. Graceful degradation: returns empty on any failure. Only fires in opening mode when topics exist.
- **Reflection snapshots** — Reflection notes are async clean-slate snapshots generated from all persisted messages every 10 total persisted messages (about 5 exchanges) and stored as versioned rows in `reflection_snapshots`. Each snapshot is a full overwrite — no evolving from previous notes. Includes steering fields: `currentThreads`, `avoidPastObservations`, `avoidPastQuestions`, `steerToTopics`, `steeringPressure`, `steeringReasoning`.
- **Conversation steering** — Steering comes directly from the reflection note's 4 steering fields + LLM-assessed pressure. Rendered as a NAVIGATION block in the system prompt. No separate `SteeringContext` or `deriveConversationSteering()` — the note IS the steering. Raw messages remain authoritative.
- **Zod schema design** — `.max()` constraints are NOT on the Zod schemas (to tolerate older DB data). Array limits are enforced by prompt instructions and parser functions in `soulFile.ts`. JSON schema for Fireworks `response_format` is generated via `toJSONSchema()` from Zod.
- **Debug routes** — `get-debug-info` and `debug-dump` require both the normal session token and `x-thumos-debug-token`.
- **Debug traces** — Raw prompt/response traces are only written when `ENABLE_DEBUG_TRACES=true`.
- **Notification permission** — Requested after first completed session, not on first launch. Local notifications only (no APNs).
- **Soulmate matching pipeline** — Daily cron triggers `runMatchingPipeline()`. Loads active users with ready visible soul files (completeness >= threshold), fetches geo-sorted candidates with mutual preference filters, evaluates each pair via LLM (`evaluateMatch()`), caps at 2 new matches per user per run. Results stored in `matches` table with reasoning.
- **Match evaluation** — LLM-based: loads both users' visible soul files, summarizes for token efficiency (strips raw moments/quotes), calls `callLlmJson()` with structured output schema. Returns decision (match/no_match), score (0-1), and reasoning paragraph. Falls back to error on any failure.
- **Match messages** — Simple sender_id/receiver_id model (no match_id foreign key). Auth check verifies users are matched via `getMatchedUserIds()`. iOS polls every 5 seconds using `after_id` for incremental fetches.
- **Display name privacy** — Match list shows `display_name` from `soulmate_profiles` + `reasoning` from `matches`. Soul file portrait/content is NEVER exposed to other users.

## API Contract Rules

The iOS ↔ server wire format is locked. Golden fixtures in `contracts/` are the source of truth.

### Never-Break Rules
1. Never remove a response key that iOS reads
2. Never change a key's type (string → number, object → array)
3. Never rename a key without sending BOTH old and new names
4. New keys are always additive — old clients ignore unknown keys
5. Wire format: snake_case envelope keys, camelCase domain object keys — forever

### Verification
- `contracts/*.json` — Golden fixture files shared by both test suites
- `src/contracts/api.ts` — TypeScript wire format interfaces
- `tests/unit/contracts.test.ts` — TypeScript verifies fixtures match wire types
- `ThumosTests/ContractTests.swift` — Swift verifies iOS types decode fixtures
- Both run automatically (`npx vitest run` and Xcode test suite)

### When You Must Break Compatibility
1. Ship the server change (backward compatible — send both old + new format)
2. Ship iOS update + wait for App Store approval
3. After adoption window: bump MIN_SUPPORTED_VERSION in version.ts
4. Only then remove the old format from server

## Verify (standard process — run after every change)
1. `npx vitest run` — all tests pass
2. `npx tsc -p tsconfig.json --noEmit` — zero type errors
3. If iOS code was changed: `xcodebuild build-for-testing -project Thumos.xcodeproj -scheme Thumos -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.1'`
4. If tests fail: read error, fix, rerun — repeat up to 3 times
5. If still failing after 3 attempts: write BLOCKED.md explaining why

## Deployment
```bash
./deploy.sh
sudo ./deploy.sh --prod --secrets /Users/biubiu/.secrets/prod.env
```

`deploy.sh` is the source of truth for deploys:
- default target is `dev`
- production requires root plus a root-owned secrets file
- dev uses `workers.dev`
- production secrets stay out of repo-local `.env`

Active endpoints: ping, version, bootstrap-soul, sync-messages, soul-converse, get-soul-file, soulmate-profile, get-matches, match-messages, delete-account, get-debug-info, debug-dump

## iOS QA (when macOS/Xcode available)
- Scheme: Thumos
- Bundle ID: com.trythumos.app
- Simulator: iPhone 17 Pro (iOS 26.1)
- Boot: `xcrun simctl boot "iPhone 17 Pro"`
- Screenshot: `xcrun simctl io booted screenshot /tmp/state.png`
