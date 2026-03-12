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
All 72 tests must pass (8 test files). Tests work without API keys (fallback paths are exercised).

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
- `world.ts` — 64×64 grid simulation, agent movement, conversation initiation
- `ka.ts` — Ka system prompt building, LLM reply with fallback
- `impression.ts` — 5-dimension heuristic + LLM impression scoring, encounter-aware accumulation
- `compatibility.ts` — Thin wrapper over impression for API surface
- `soulProfile.ts` — Profile generation and merging (soul-v2: SoulValues + SoulNarrative)
- `npcSeeds.ts` — 15-seed NPC pool with weekly rotation logic
- `constants.ts` — Grid size, thresholds, phase system, momentum, decay, behavior weights
- `schemas.ts` — Zod schemas for runtime validation (incl. soulValuesSchema, soulNarrativeSchema)
- `types.ts` — Domain types (SoulProfile, SoulValues, SoulNarrative, ImpressionEvaluation, POI, etc.)
- `obstacle_map.ts` — Walkable/blocked cell data for the world grid
- `avatar.ts` — Avatar generation from seed (body, skin, hair, outfit, sprite_id)

### Scripts (scripts/)
- `build_sprite_atlas.py` — Generates SpriteKit texture atlas from individual sprite sheets
- `build_sunnyside_sprites.py` — Builds sprites from Sunnyside tileset
- `build_tmx_map.py` — Builds Tiled TMX map from tileset sources
- `compose_map.py` — Composes final map image from layers
- `analyze_map_obstacles.py` — Extracts obstacle data from the map for pathfinding
- `regenerate_sprite_faces.py` — Regenerates avatar face sprites
- `generate_app_icons.swift` — App icon generation
- `nuke_and_populate.ts` — Nukes world data and repopulates N users via psql
- `simulate_conversation.ts` — Runs a simulated Ka conversation for testing
- `simulate_world.ts` — Runs simulated world ticks
- `supabase-link.sh` — Links local Supabase project

### Map & Environment
- Tileset PNGs in `AARU/Resources/Tilesets/`
- Environment map in `AARU/Resources/Environment/` (TMX + rendered PNG)
- Sprite atlas in `AARU/Resources/Sprites.atlas/`

## Domain Model

### Soul Profiles (soul-v2)
Each user has a `SoulProfile` with psychology-backed structure:
- `personality: string` — free-text personality description
- `interests: string[]` — list of interests
- `values: SoulValues` — Schwartz-model dimensions (0–1 each):
  - `self_transcendence`, `self_enhancement`, `openness_to_change`, `conservation`
  - `expressed: string[]` — named values like "honesty", "growth"
- `narrative: SoulNarrative` — `formative_stories`, `self_defining_memories`, `narrative_themes`
- `avoid_topics: string[]`, `raw_input: string`, `guessed_fields: string[]`

### 5-Dimension Impression Scoring
Impressions are evaluated on 5 independent dimensions (each 0–100):
1. **Responsiveness** — word referencing, question-answer patterns
2. **Values alignment** — Schwartz dimension distance + expressed overlap (60/40 blend)
3. **Conversation quality** — transcript length + question density
4. **Interest overlap** — Jaccard similarity of interest arrays
5. **Novelty** — non-overlapping interests + complementary value contrasts

**Composite**: `0.30×resp + 0.25×val + 0.20×conv + 0.10×interest + 0.10×novelty + 0.05×50`

### Phase-Aware Conversations
Message limits scale with relationship depth:
| Phase | Encounter count | Message limit |
|-------|----------------|---------------|
| Discovery | 1–5 | 6 |
| Personal | 6–12 | 10 |
| Depth | 13+ | 16 |

**Momentum extension**: if responsiveness ≥ 80 AND conversation_quality ≥ 80, limit += 4.

### Encounter-Aware Accumulation
`historyWeight = min(0.65, 0.40 + encounterCount × 0.025)` — early encounters let new signal through; later ones stabilize.

### Pair Cooldown Decay
| Condition | Cooldown |
|-----------|----------|
| Strangers (< 15 encounters) | 24 hours |
| Acquaintances (≥ 15 encounters) | 72 hours |
| Ba unlocked | 168 hours (1 week) |

### NPC Rotation
- 15-seed pool defined in `npcSeeds.ts` (names, personalities, interests, values, avatar configs)
- Weekly sliding window of 5 active NPCs, deterministic based on week number since epoch 2026-01-05
- 1 NPC swaps per week; departing NPCs deactivated (not deleted), arriving ones created/reactivated

### Behavior System
Agents pick behaviors by weighted random selection:
| Behavior | Weight | Description |
|----------|--------|-------------|
| Wander | 35 | Random directional walk |
| Idle | 25 | Stand still 3–10 ticks |
| Drift Social | 20 | Move toward nearby cluster of agents |
| Drift POI | 15 | Move toward a Point of Interest |
| Retreat | 5 | Move away from crowded areas (3+ agents within range 3) |

Heading continuity: 70% same direction, 20% deviate ±1, 10% deviate ±2.

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
1. `npx vitest run` — all tests pass (72/72 currently, 8 test files)
2. `npx tsc -p tsconfig.json --noEmit` — no type errors
3. No regressions in existing functionality
4. Code is committed with a clear message
5. If iOS code was changed: `xcodebuild build` succeeds (when available)

## Known Constraints & Gotchas
- **No Groq API key in CI/test** — all LLM-dependent code must have fallback paths. Tests exercise fallbacks.
- **evaluateCompatibility is async** — always `await` it (was a bug, now fixed)
- **Grid is 64 columns × 64 rows** — cell coordinates are 0-indexed integers
- **Impression threshold for Ba unlock is 72** — defined in constants.ts
- **Accumulation is encounter-count-aware** — `historyWeight = min(0.65, 0.40 + encounterCount * 0.025)`
- **Phase system determines base message limit** — discovery(6), personal(10), depth(16) based on encounter count
- **Momentum can extend conversations** — +4 messages when responsiveness ≥ 80 AND conversation_quality ≥ 80
- **Pair cooldown scales with familiarity** — 24h → 72h (15+ encounters) → 168h (Ba unlocked)
- **iOS client is a pure renderer** — all game state is server-authoritative
- **XcodeGen** — project.yml generates AARU.xcodeproj; don't edit .xcodeproj directly
- **XcodeBuildMCP** — session defaults configured (profile "aaru"): scheme AARU, iPhone 17 Pro, Debug config
- **soul_profiles.values is jsonb** — not text[]; uses Schwartz-model SoulValues structure
- **impression_edges has sub-scores** — `responsiveness` and `conversation_quality` columns alongside `score`

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
