# Movement v2 — Implementation Plan

**Status:** Ready to start
**Date:** 2026-03-11

## Testing Pyramid (every phase)

```
Layer 1: vitest (instant)     → npx vitest run + npx tsc --noEmit
Layer 2: Supabase staging     → deploy migration + edge functions, call tick-world manually
Layer 3: iOS visual           → build on sim, watch world for 60s, screenshot
```

Rule: **Never move to the next layer until the previous layer is green.**

---

## Phase 1: Directional Wander + Idle

**Goal**: Agents walk in arcs (not zigzags) and pause periodically. World feels immediately more natural.
**Risk**: Low — all server-side. iOS handles `"idle"` state correctly already (stops walking sprite).
**Watch for**: Idle behavior reduces movement → fewer encounters. If too low, reduce IDLE_WEIGHT.

### Commit A: Constants + Type Changes (zero behavioral change)

**Files:**
- `src/domain/constants.ts` — add behavior tick durations, heading probabilities, path lengths
- `src/domain/types.ts` — add `"idle"` to AgentState, add optional `behavior`, `heading`, `behavior_ticks_remaining` to AgentPosition
- `src/domain/schemas.ts` — update Zod schema for new state + optional fields

**Test:** `npx vitest run` (all 18 pass, no behavioral change)

### Commit B: Directional Path Generation (new function, not yet wired in)

**Files:**
- `src/domain/world.ts` — add `generateDirectionalPath(startX, startY, heading, occupied)` alongside existing `generateWanderPath`

**New tests (4):**
1. Path length within DIRECTIONAL_PATH_MIN..MAX
2. Avoids occupied cells
3. Maintains general heading direction (>50% of steps go that way)
4. Stays within grid bounds from edges

**Test:** `npx vitest run` (18 existing + 4 new pass)

### Commit C: Behavior Selection (new function, not yet wired in)

**Files:**
- `src/domain/world.ts` — add `selectBehavior(agent)` → returns `{ behavior, ticks, heading? }`

**New tests (2):**
5. Returns wander or idle with correct tick ranges
6. Does not re-select when `behavior_ticks_remaining > 0`

**Test:** `npx vitest run` (22 existing + 2 new pass)

### Commit D: Wire It Up (the behavioral change)

**Files:**
- `src/domain/world.ts` — modify `advanceOnPath` and `tickWorld`:
  - Idle: decrement ticks, stay in place, `state: "idle"`
  - Wander: use `generateDirectionalPath` instead of `generateWanderPath`
  - Initialize `behavior`/`heading` on agents that don't have them (backward compat)
  - Cooldown recovery sets `behavior: "wander"`

**New tests (4):**
7. Idle agents stay put, transition after ticks expire
8. Directional wander produces arcing paths (statistical assertion)
9. Legacy agents (no behavior field) get initialized on first tick
10. Idle agents can still be drawn into conversations

**Test:** `npx vitest run` (all 28 pass)

### Commit E: Database + Edge Functions

**Files:**
- `supabase/migrations/YYYYMMDD_add_behavior_fields.sql` — add columns
- `supabase/functions/_shared/db.ts` — add fields to AgentPositionRow, update queries
- `supabase/functions/_shared/app.ts` — pass through new fields in toAgentPosition + persist

**Test Layer 2:**
1. `supabase migration up` succeeds
2. `supabase functions deploy`
3. Call `POST /tick-world` — inspect `agent_positions` table
4. Verify agents alternate between `wandering` and `idle` states
5. Verify conversations still trigger

**Test Layer 3:**
1. Build & run on simulator
2. Watch world for 60 seconds
3. Visual check: agents pause (idle), walk in arcs (directional), conversations happen
4. Screenshot for comparison

---

## Phase 2: Social Gravity + POIs (2–3 days)

### New behaviors
- `drift_social` — move toward nearest cluster of 2+ agents
- `drift_poi` — move toward nearest POI
- `retreat` — move away from crowded area

### Implementation
- `findNearestCluster(agents, self, range=8)` → center of mass
- `findNearestPOI(pos, pois)` → closest POI with capacity
- Expand `selectBehavior` to 6-behavior weight table
- Simple greedy pathfinding toward target cell (A* not needed yet)
- Define POI positions from existing tilemap

### Data
- Create `world_pois` table with POI cells
- Hardcoded POI data initially (can move to DB later)

### Tests (~8 new)
- Cluster detection finds groups correctly
- POI pathfinding avoids obstacles
- Weight modifiers shift behavior selection
- Retreat moves away from dense areas
- POIs create gathering patterns (statistical over N ticks)

### iOS
- No client changes. All new behaviors map to `isMoving: true`.

---

## Phase 3: Intentional Approach + Conversation (2–3 days)

### Replace auto-chat with probability model
```
P(approach) = base_rate × affinity × recency × availability × context
```

### Implementation
- `calculateApproachProbability(agent, target, impressionScore, lastConvoTime)`
- Approach → greet → chat flow replaces adjacent-auto-chat
- Conversation length scales: brief (3-5 msgs), casual (6-10), deep (10-15)
- 30-minute pair cooldown on declined approaches

### Data
- `approach_target_id` and `last_conversation_at` on AgentPosition
- Pair-specific cooldown (in-memory initially)

### Tests (~10 new)
- Probability calculation produces expected values
- Higher impression → higher approach probability
- Recent conversation → lower probability
- Conversation length matches impression tier
- Declined approach triggers pair cooldown

### iOS
- `state: "approaching"` already exists in types, client treats as walking. No changes.

---

## Phase 4: Presence Tracking (1–2 days)

### Implementation
- Heartbeat endpoint (client POSTs every 30s)
- Server-side state machine: online → background (15 min no heartbeat) → offline
- Enforce `OFFLINE_MAX_CONVERSATIONS_PER_DAY` (10)
- Daily counter reset at midnight UTC

### Data
- Migration: presence, last_heartbeat_at, daily_offline_convos on users table

### Tests (~5 new)
- Presence transitions correctly on heartbeat timeout
- Offline conversation limit enforced
- Counter resets at midnight

### iOS
- Add heartbeat timer in AppModel
- Handle foreground/background lifecycle

---

## Phase 5: User Tap Control (2–3 days)

### Implementation
- A* pathfinding on the grid
- `POST /tap-cell { cell_x, cell_y }` → overrides behavior with forced path
- `POST /tap-character { target_user_id }` → sets approach behavior
- Tap conversation bubble → expand/read

### iOS (most client work here)
- Tap gesture recognizer on WorldScene
- Screen coords → grid cell conversion
- Call backend tap endpoints
- Conversation expansion view
- Return-from-absence recap overlay

### Tests (~6 new)
- A* finds optimal path around obstacles
- Tap override replaces current behavior
- Tap character initiates approach flow

---

## Summary

| Phase | Days | New Tests | iOS Changes | Key Risk |
|-------|------|-----------|-------------|----------|
| 1. Directional Wander + Idle | 1–2 | ~10 | None | Fewer encounters from idle time |
| 2. Social Gravity + POIs | 2–3 | ~8 | None | POI placement tuning |
| 3. Approach + Conversation | 2–3 | ~10 | None | Probability tuning |
| 4. Presence Tracking | 1–2 | ~5 | Heartbeat timer | Background lifecycle |
| 5. User Tap Control | 2–3 | ~6 | Gesture + UI | A* performance, UX feel |
| **Total** | **~10** | **~39** | **Phase 4-5 only** | |
