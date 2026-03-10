# AARU — Claude Operating Rules

## Project Overview
AARU is a soul-based social app where AI agents (Ka) wander a 2D world, have conversations, and build impression signals. When impressions cross a threshold, human (Ba) conversations unlock.

**Two codebases in one repo:**
- **TypeScript backend** — domain logic, Supabase Edge Functions, world simulation
- **Swift iOS client** — SwiftUI + SpriteKit renderer, pure display layer

## Stack
| Layer | Technology |
|-------|-----------|
| iOS Client | SwiftUI + SpriteKit + Combine, iOS 17+, Swift 5.10 |
| Backend | Supabase Edge Functions (Deno), Postgres, Realtime |
| Domain Logic | TypeScript (src/domain/), Zod validation |
| LLM | Groq (Llama 3.1 8B for Ka chat, 3.3 70B for evaluation) |
| Tests | Vitest (TS), XCTest (Swift), Maestro (UI) |
| Package Manager | pnpm (TS), XcodeGen + SPM (iOS) |

## Run Tests

### TypeScript tests (primary — run these on every change)
```bash
npx vitest run
```
All 18 tests must pass. Tests work without API keys (fallback paths are exercised).

### TypeScript lint
```bash
npx tsc -p tsconfig.json --noEmit
```

### iOS unit tests (requires macOS + Xcode + simulator)
```bash
xcodebuild test -scheme AARU \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.3' \
  -resultBundlePath ./TestResults \
  | xcpretty
```

### iOS build
```bash
xcodebuild build -scheme AARU \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.3' \
  -derivedDataPath ./DerivedData \
  | xcpretty
```

### Maestro UI tests
```bash
maestro test maestro/          # all flows
maestro test maestro/<flow>.yaml  # single flow
```

## Architecture

### TypeScript (src/)
- `src/domain/` — Pure domain logic (world tick, Ka chat, impression scoring, soul profiles, avatars)
- `src/lib/` — Utilities (env, http helpers)
- `supabase/functions/` — Edge Function handlers that call domain logic
- `tests/unit/` — Unit tests for domain functions
- `tests/integration/` — Handler integration tests

### Swift (AARU/)
- `AARU/App/AARUApp.swift` — Entry point
- `AARU/App/AppModel.swift` — Main @MainActor ObservableObject (state management)
- `AARU/App/BackendClient.swift` — HTTP client with fallback mode
- `AARU/App/Models.swift` — Codable data models (snake_case CodingKeys)
- `AARU/App/RootView.swift` — Root navigation (onboarding vs main)
- `AARU/App/WorldScreen.swift` — SpriteKit world renderer
- `AARU/App/RealtimeBridge.swift` — Supabase realtime subscriptions
- `AARU/App/SecureStore.swift` — Keychain wrapper (device/session identity)
- `AARUTests/` — XCTest unit tests

### Key domain files
- `world.ts` — 10x14 grid simulation, agent movement, conversation initiation
- `ka.ts` — Ka system prompt building, LLM reply with fallback
- `impression.ts` — Heuristic + LLM impression scoring, accumulation
- `compatibility.ts` — Thin wrapper over impression for API surface
- `soulProfile.ts` — Profile generation and merging
- `constants.ts` — Magic numbers (grid size, thresholds, limits)
- `schemas.ts` — Zod schemas for runtime validation

## Code Style Conventions

### TypeScript
- 2-space indentation, no trailing semicolons enforced (mixed)
- camelCase functions/variables, PascalCase types, SCREAMING_SNAKE_CASE constants
- Named exports, explicit type imports (`import type { ... }`)
- Path aliases: `@aaru/domain/...`, `@aaru/lib/...`
- Every LLM-dependent function has a deterministic fallback
- Zod schemas for all domain types crossing boundaries

### Swift
- 4-space indentation
- MVVM with @StateObject/@EnvironmentObject
- async/await + Task for concurrency
- Custom CodingKeys for snake_case <-> camelCase
- OSLog with subsystem "com.tianzhichen.aaru"
- private/fileprivate for encapsulation

## Definition of Done
A task is complete when ALL of the following are true:
1. `npx vitest run` — all tests pass (18/18 currently)
2. `npx tsc -p tsconfig.json --noEmit` — no type errors
3. No regressions in existing functionality
4. Code is committed with a clear message
5. If iOS code was changed: `xcodebuild build` succeeds (when available)

## Known Constraints & Gotchas
- **No Groq API key in CI/test** — all LLM-dependent code must have fallback paths. Tests exercise fallbacks.
- **evaluateCompatibility is async** — always `await` it (was a bug, now fixed)
- **Grid is 10 columns x 14 rows** — cell coordinates are 0-indexed integers
- **Impression threshold for Ba unlock is 72** — defined in constants.ts
- **Accumulation uses 55/45 weighted blend** — previous score weighted more heavily
- **iOS client is a pure renderer** — all game state is server-authoritative
- **XcodeGen** — project.yml generates AARU.xcodeproj; don't edit .xcodeproj directly

## Autonomous Operating Loop
When given a task:
1. Write the code
2. Run `npx vitest run` and `npx tsc -p tsconfig.json --noEmit`
3. If tests fail: read the error, fix, rerun — repeat up to 3 times
4. If still failing after 3 attempts: write BLOCKED.md explaining why
5. Only mark done when: tests pass + no regressions + code is committed

## iOS QA (when macOS/Xcode available)
- Scheme: AARU
- Bundle ID: com.tianzhichen.aaru
- Simulator: iPhone 17 Pro (iOS 26.3)
- Boot: `xcrun simctl boot "iPhone 17 Pro"`
- Screenshot: `xcrun simctl io booted screenshot /tmp/state.png`
