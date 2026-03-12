# AARU Phase 1-2 Audit

Date: 2026-03-11

This document summarizes:
- the intended behavior of the current AARU system
- how that behavior is implemented across backend and iOS
- where the implementation diverges from the intended product
- the most important remaining risks after the quick-win fixes in this branch

## 1. Intended behavior

The intended product is a server-authoritative social world:

- Each user owns a persistent identity and a soul profile.
- Each identity has a Ka avatar represented as an agent on a shared 2D grid.
- The world continues to evolve even when the user is not actively controlling it.
- The iOS app is primarily a renderer and reader of server state, not a simulation engine.
- Ka agents move with readable intent rather than random jitter.
- Encounters between agents generate Ka-to-Ka conversations.
- Repeated encounters accumulate directional impression, not just a generic compatibility score.
- When directional impression crosses a threshold, Ba-to-Ba messaging unlocks.

Phase 1 and 2 of `docs/spec-world-movement-v2.md` narrow this further:

- Grid-based movement on a `64 x 64` world.
- Server-owned behavior selection.
- Directional wandering with heading continuity.
- Idle pauses.
- Social drift toward clusters.
- POI drift toward authored points of interest.
- Retreat from local crowding.
- Exclusive cell occupancy.
- Realtime updates to the client so the app shows the server’s world rather than inventing one.

## 2. How the system is implemented today

### Backend domain layer

Core files:
- `src/domain/world.ts`
- `src/domain/impression.ts`
- `src/domain/ka.ts`
- `src/domain/constants.ts`
- `src/domain/types.ts`

Current world implementation:
- `tickWorld(...)` in `src/domain/world.ts` is the main simulation step.
- Agent positions are stored in normalized coordinates plus explicit grid cells.
- `advanceOnPath(...)` chooses or continues a behavior and moves at most one cell per tick.
- `selectBehavior(...)` currently supports:
  - `wander`
  - `idle`
  - `drift_social`
  - `drift_poi`
  - `retreat`
- `generateDirectionalPath(...)` implements heading-biased wandering.
- `findNearestCluster(...)`, `findNearestPOI(...)`, and `findCrowdCenter(...)` implement phase-2 utility behaviors.
- Conversations still start when two non-busy agents are adjacent. The approach ritual from phase 3 is not implemented yet.

Current impression implementation:
- `evaluateImpression(...)` in `src/domain/impression.ts` computes five sub-scores:
  - responsiveness
  - values alignment
  - conversation quality
  - interest overlap
  - novelty
- It tries Groq first and falls back to deterministic heuristics.
- `accumulateImpression(...)` stabilizes scores over repeated encounters.
- `isBaAvailableToViewer(...)` uses the unlock threshold in `constants.ts`.

Current conversation implementation:
- Ka chat generation is handled in `src/domain/ka.ts`.
- Edge functions call into that logic through `supabase/functions/_shared/app.ts`.
- Conversation pacing is determined by:
  - word-count-based bubble display duration
  - word-count-based reply delay
  - phase-aware message limits
  - momentum extension

### Backend application layer

Core files:
- `supabase/functions/_shared/app.ts`
- `supabase/functions/_shared/db.ts`
- `supabase/functions/bootstrap-user/index.ts`
- `supabase/functions/sync-world/index.ts`
- `supabase/functions/advance-worlds/index.ts`
- `supabase/functions/advance-conversations/index.ts`

Current application behavior:
- `bootstrap-user` creates or loads the user, soul profile, avatar, world snapshot, and conversation previews.
- `sync-world` returns a read snapshot of current world state.
- `advance-worlds` is the server-side world runner.
- `advance-conversations` progresses active conversations independently.
- `db.ts` is the persistence boundary for users, agent positions, conversations, avatars, impression edges, and news.

Current server-authoritative model:
- The world state lives in Postgres.
- Edge functions mutate or read the DB.
- Realtime is the transport for client updates.
- The client does not author movement state.

### iOS layer

Core files:
- `AARU/App/AppModel.swift`
- `AARU/App/BackendClient.swift`
- `AARU/App/RealtimeBridge.swift`
- `AARU/App/RootView.swift`
- `AARU/App/WorldScreen.swift`
- `AARU/App/Models.swift`

Current client behavior:
- `AppModel` bootstraps the user and holds app state.
- `BackendClient` calls the Supabase Edge Functions.
- `RealtimeBridge` subscribes to Postgres changes via Supabase Realtime.
- `RootView` switches between launch, onboarding, and main world UI.
- `WorldScreen` renders the server state in SpriteKit.
- `WorldScene` uses a following camera and per-agent visual nodes.
- `AgentVisualNode` animates each agent along the server-provided cell path.

Client rendering model:
- The server sends current cell, path, and state.
- The app translates cells into scene coordinates.
- The app animates movement between cells instead of recalculating simulation decisions locally.

## 3. Critique of the current implementation

### Product-intent gaps

1. The implementation is only partially aligned with the “pure renderer” goal.
- The broad realtime subscriptions caused frequent client-triggered refreshes of world and inbox state.
- That did not change world authority, but it made the renderer noisier and more expensive than necessary.

2. Phase 2 utility behavior exists, but the richer weighting model from the spec is not implemented.
- `selectBehavior(...)` uses fixed weights.
- Personality/context modifiers from the spec are not applied.
- The “sample from top scoring options” behavior is not implemented.

3. Conversation initiation is still adjacency-triggered.
- The spec’s later “approach -> greet -> chat” sequence is not present yet.
- This is acceptable for phase 1-2, but it remains the biggest realism gap in social behavior.

4. Presence is still conceptually ahead of the code.
- The spec discusses online/background/offline presence and invisible presence semantics.
- The repo has parts of this story, but the main runtime is still oriented around a single active renderer plus autonomous server ticks.

### Architectural criticism

1. The repo has drift between documents and runtime.
- `CLAUDE.md` still mentions fallback mode and keychain session identity, but the current app runtime is simpler than that.
- Some historical paths and assets remain in the repo and make the active architecture harder to read.

2. The realtime layer was too broad.
- World updates were subscribed at the whole-table level.
- Conversation and impression updates were also subscribed broadly.
- This increased refresh churn and made logs noisy.

3. Rendering timing drifted from server timing.
- The server contract exposes `move_animation_ms`.
- The client was still animating from `move_speed`.
- That made the visual motion drift away from the server’s configured cadence.

4. Cold-start visual defaults were inconsistent with server config.
- The default iOS camera configuration was much wider than the server’s intended camera window.
- That produced a visible zoom reset on startup before the bootstrap payload arrived.

5. Scene rebuild behavior was too destructive.
- `WorldScene.updateConfig(...)` rebuilt the map and agent nodes even when the config had not actually changed.
- That creates needless visual resets and makes movement feel less stable than it should.

### Performance and maintainability criticism

1. There is still too much legacy material in the repo.
- Older sprite sets, multiple art pipelines, and earlier movement experiments coexist with the current LPC/Sunnyside path.
- This increases cognitive load and makes it harder to determine which assets are authoritative.

2. Some server utilities are centralized in a very large `_shared/app.ts`.
- That file now owns world orchestration, conversation orchestration, news/topic seeding, snapshot shaping, and utility logic.
- It works, but it is already large enough to resist safe change.

3. The iOS app still depends on periodic full refreshes as a repair path.
- This is pragmatic, but it means realtime correctness is not yet clean enough to stand alone in every case.

## 4. Quick-win fixes applied in this branch

1. Scoped realtime subscriptions to the active world and current user.
- `RealtimeBridge` now filters `agent_positions` by `instance_id`.
- Conversation metadata streams are filtered to the current user instead of watching the entire table.
- This reduces unnecessary `sync-world` and `list-conversations` churn.

2. Unified client movement timing with the server contract.
- `WorldScreen` now derives movement speed from `move_animation_ms` instead of `move_speed`.
- This makes one rendered step match the configured server cadence.

3. Fixed the cold-start camera mismatch.
- `WorldConfig.default` now matches the server’s intended visible window (`7 x 9`).

4. Avoided destructive scene rebuilds on identical config.
- `WorldScene.updateConfig(...)` now exits early if the config did not actually change.

## 5. Remaining issues worth prioritizing

1. Split `supabase/functions/_shared/app.ts`.
- World progression, conversation progression, and snapshot formatting should move into separate modules.

2. Make the selected-conversation realtime path narrower.
- Message subscriptions are still broad compared with the rest of the tightening done here.

3. Implement the actual phase-3 social ritual.
- Adjacent instant chat is the main remaining behavior that still feels game-y rather than social.

4. Clean repo asset authority.
- Choose the authoritative character pipeline and retire or archive the unused sprite families.

5. Reconcile docs with runtime.
- `CLAUDE.md` should be updated to reflect the current simplified runtime model.
