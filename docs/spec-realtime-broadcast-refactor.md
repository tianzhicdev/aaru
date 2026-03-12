# Realtime Broadcast Refactor Spec

## Problem

The world view currently uses PostgreSQL CDC (change data capture) on the `agent_positions` table. Every 1-second tick, the backend writes all 50 agent rows. Supabase Realtime fires 50 UPDATE events per client per second — even for agents that didn't move. CDC is **single-threaded** on Supabase's side, so this is the hardest path to scale.

## Goal

Replace CDC-driven world updates with a single Supabase Broadcast message per tick per world instance. One message, all clients, identical payload. Client-side masking for conversation privacy.

## Architecture: Before vs After

### Before (CDC)

```
advance-worlds (1Hz loop)
  → tickWorld() computes 50 positions
  → upsertAgentPositions() writes 50 rows to DB
  → PostgreSQL WAL fires 50 row-change events
  → Supabase CDC (single-threaded) evaluates RLS per subscriber
  → each client receives ~50 UPDATE events/sec
  → client decodes each event, patches local state

syncWorld (HTTP, on bootstrap + INSERT/DELETE)
  → reads agent_positions + users + avatars
  → masks active_message per viewer
  → returns full snapshot with display_name, avatar, is_self
```

### After (Broadcast)

```
advance-worlds (1Hz loop)
  → tickWorld() computes 50 positions
  → upsertAgentPositions() writes to DB (persistence only, not delivery)
  → builds broadcast payload from persisted state
  → sends ONE broadcast to channel "world:{instance_id}"
  → each client receives 1 message/sec
  → client replaces local agent state wholesale

syncWorld (HTTP, on bootstrap only)
  → same as before, but no active_message masking (client handles it)
  → provides display_name, avatar (metadata not in broadcast)
```

## Broadcast Payload Design

Channel name: `world:{instance_id}` (e.g. `world:a1b2c3d4-...`)

Event name: `tick`

```typescript
{
  tick: number;                    // monotonic tick counter
  ts: number;                      // Date.now() on server
  agents: BroadcastAgent[];
}

interface BroadcastAgent {
  user_id: string;
  x: number;                       // 0–1 normalized
  y: number;
  target_x: number;
  target_y: number;
  cell_x: number | null;           // integer grid cell
  cell_y: number | null;
  path: { x: number; y: number }[];
  move_speed: number;
  state: string;                   // "wandering" | "chatting" | "cooldown" | "user_moving"
  behavior: string | null;         // "wander" | "idle" | "drift_social" | "drift_poi" | "retreat"
  heading: number | null;          // 0–7 compass
  active_message: string | null;   // FULL text, never masked
  conversation_id: string | null;
}
```

**Estimated size:** ~100–150 bytes per agent × 50 = **5–8 KB** per tick. Well within Supabase's 256 KB free-tier limit.

**What's NOT in the broadcast (comes from syncWorld on bootstrap):**
- `display_name` — rarely changes, loaded once
- `avatar` — full AvatarConfig, loaded once
- `is_self` — client computes from its own `user_id`
- `cooldown_until` — not used by rendering
- `user_directed`, `user_target_cell_x/y` — not used by rendering

## Channel Architecture (multi-world ready)

```
world:{instance_id_1}  →  clients in world 1
world:{instance_id_2}  →  clients in world 2
...
```

Each client subscribes to exactly one world channel. Supabase handles routing. Scales to thousands of instances at 1 msg/sec each.

## Server Changes

### 1. `supabase/functions/_shared/app.ts`

**`runWorldTick()`** — add broadcast after DB write:

```
existing: upsertAgentPositions(persisted)
existing: persisted = await getAgentPositions(instanceId)
existing: touchWorldInstance(...)
NEW:      broadcastWorldState(instanceId, persisted, tickCounter)
```

**New function `broadcastWorldState()`:**
- Takes instanceId, agent positions array, tick counter
- Builds payload: strips metadata fields (display_name, avatar), keeps only position/state/behavior fields
- Sends via Supabase Broadcast REST API:
  ```
  POST {SUPABASE_URL}/realtime/v1/api/broadcast
  Authorization: Bearer {SERVICE_ROLE_KEY}
  { "messages": [{ "topic": "world:{instanceId}", "event": "tick", "payload": {...} }] }
  ```
- Fire-and-forget (don't await — broadcast failure shouldn't block the tick loop)

**`buildWorldSnapshot()`** — stop masking `active_message`:
- Remove the `viewerConversationIds` logic (lines 610–623)
- Always send full `active_message` text
- Client handles masking

**`scheduleActiveMessageClear()`** — keep as-is:
- Still writes `active_message = null` to DB after TTL
- Next tick's broadcast picks up the null (≤1 sec delay, acceptable)

### 2. `supabase/functions/_shared/db.ts`

**`upsertAgentPositions()`** — no change needed for now.
- Still writes all positions (persistence for next tick)
- Future optimization: only write changed rows (separate PR)

**New helper `broadcastToChannel()`** (optional, if we want reuse):
- Thin wrapper over the Broadcast REST API fetch call
- Used by `broadcastWorldState`

### 3. `supabase/functions/_shared/contracts.ts`

**New schema** `broadcastAgentSchema`:
- Zod schema for the broadcast agent fields (for documentation/validation, not runtime-critical)

### 4. `src/domain/constants.ts`

No changes needed. `WORLD_TICK_INTERVAL_MS` stays at 1000.

## iOS Changes

### 1. `AARU/App/RealtimeBridge.swift`

**Remove** world CDC subscriptions:
- Remove `worldInsertStream`, `worldUpdateStream`, `worldDeleteStream`
- Remove `postgresChange` on `agent_positions` table

**Add** broadcast subscription:
```swift
let worldChannel = client.channel("world:\(instanceID)")
let broadcastStream = worldChannel.broadcastStream("tick")
```

**Update callbacks:**
- Remove: `onWorldUpdate: (RealtimeAgentPosition, RealtimeAgentPosition) -> Void`
- Remove: `onWorldInsert: () -> Void`
- Remove: `onWorldDelete: () -> Void`
- Add: `onWorldTick: (WorldBroadcastPayload) -> Void`

**Keep** conversation and message channels unchanged.

### 2. `AARU/App/Models.swift`

**New struct** `WorldBroadcastPayload`:
```swift
struct WorldBroadcastPayload: Decodable {
    let tick: Int
    let ts: Double
    let agents: [BroadcastAgent]
}

struct BroadcastAgent: Decodable {
    let userID: UUID
    let x: Double
    let y: Double
    let targetX: Double
    let targetY: Double
    let cellX: Int?
    let cellY: Int?
    let path: [CellCoord]
    let moveSpeed: Double
    let state: String
    let behavior: String?
    let heading: Int?
    let activeMessage: String?
    let conversationID: UUID?

    enum CodingKeys: String, CodingKey {
        case userID = "user_id"
        case x, y
        case targetX = "target_x"
        case targetY = "target_y"
        case cellX = "cell_x"
        case cellY = "cell_y"
        case path
        case moveSpeed = "move_speed"
        case state, behavior, heading
        case activeMessage = "active_message"
        case conversationID = "conversation_id"
    }
}
```

**`RealtimeAgentPosition`** — can be removed (no longer needed).

### 3. `AARU/App/AppModel.swift`

**Remove:**
- `applyWorldUpdate(oldRow:newRow:)` — no longer needed
- `scheduleWorldRefresh()` debounce for INSERT/DELETE

**Replace with `applyWorldTick(payload:)`:**

```
func applyWorldTick(_ payload: WorldBroadcastPayload):
  let broadcastIds = Set(payload.agents.map { $0.userID })
  let localIds = Set(worldAgents.map { $0.id })

  // Detect new agents → trigger syncWorld for metadata (display_name, avatar)
  let newIds = broadcastIds.subtracting(localIds)
  if !newIds.isEmpty { scheduleWorldRefresh() ; return }

  // Detect removed agents → remove from local state
  worldAgents.removeAll { !broadcastIds.contains($0.id) }

  // Update existing agents
  for agent in payload.agents:
    find index in worldAgents by agent.userID

    // Compute movement event (for SpriteKit animation)
    if (worldAgents[index].cellX, cellY) != (agent.cellX, cellY):
      append WorldMovementEvent

    // Update position and state fields
    worldAgents[index].x = agent.x
    worldAgents[index].y = agent.y
    ... (all broadcast fields)

    // Client-side active_message masking
    if agent.activeMessage != nil:
      if agent.conversationID == selfAgent.conversationID:
        worldAgents[index].activeMessage = agent.activeMessage  // full text
      else:
        worldAgents[index].activeMessage = "..."                // masked
    else:
      worldAgents[index].activeMessage = nil
```

**`refreshWorld()`** — keep for bootstrap and new-agent detection:
- Still calls `backend.syncWorld()`
- Still populates `display_name`, `avatar`, `isSelf`
- Remove active_message masking (redundant with client-side masking above)

### 4. `AARU/App/WorldScreen.swift`

No changes. SpriteKit reads from `worldAgents` which is updated by `applyWorldTick`. The rendering pipeline (syncAgents, path animation, bubble display) is unchanged.

## Messages Channel

**Current:** Unfiltered — every client receives every message INSERT in the world.

**Keep as-is for now.** Rationale:
- Volume is low (~10–20 inserts/minute globally)
- Client only acts on it if `selectedConversation` is set (most events are no-ops)
- Filtering by conversation_id would require dynamic resubscription as the user opens/closes conversations
- Not worth the complexity until message volume becomes a problem

## Conversation Channel

**No changes.** Already filtered by `user_a_id` / `user_b_id`. Low volume, correct behavior.

## What Gets Removed

| Component | Status |
|-----------|--------|
| `postgresChange` on `agent_positions` (RealtimeBridge) | **Removed** |
| `onWorldInsert` / `onWorldDelete` callbacks | **Removed** |
| `onWorldUpdate(oldRow, newRow)` callback | **Removed** |
| `applyWorldUpdate()` (AppModel) | **Removed** |
| `RealtimeAgentPosition` struct (Models) | **Removed** |
| Server-side `active_message` masking in `buildWorldSnapshot` | **Removed** |
| `scheduleWorldRefresh()` for CDC INSERT/DELETE | **Replaced** by new-agent detection in `applyWorldTick` |

## What Stays Unchanged

| Component | Why |
|-----------|-----|
| `agent_positions` table | Still needed for persistence between stateless edge function calls |
| `upsertAgentPositions()` DB write | Edge functions are stateless; DB is the checkpoint |
| `scheduleActiveMessageClear()` | Still clears bubble in DB; next broadcast reflects it |
| `syncWorld` HTTP endpoint | Bootstrap, new-agent metadata fetch |
| `buildWorldSnapshot()` | Used by syncWorld (minus masking) |
| Conversation + message CDC channels | Low volume, correctly scoped |
| SpriteKit rendering pipeline | Reads from `worldAgents`, doesn't care about data source |

## Edge Cases

**1. Client connects before first broadcast arrives:**
- Bootstrap calls `syncWorld` → full snapshot loaded
- First broadcast arrives within 1 second → normal flow

**2. New agent appears (NPC spawned, user joins):**
- Broadcast contains a `user_id` not in local `worldAgents`
- Client triggers `syncWorld` to fetch metadata (display_name, avatar)
- One-time cost, happens rarely

**3. Agent disappears (NPC despawned, user leaves):**
- Broadcast no longer contains that `user_id`
- Client removes from `worldAgents` immediately

**4. Broadcast missed (network hiccup):**
- Next broadcast (1 second later) is a full snapshot — self-healing
- No delta/ack protocol needed at 1Hz

**5. Multiple clients in same world:**
- All receive identical broadcast payload
- Each applies client-side masking based on their own `conversationID`
- No per-client server work

**6. Edge function restarts mid-tick:**
- `agent_positions` in DB is the source of truth
- Next tick reads from DB, computes, broadcasts — seamless recovery

**7. Broadcast REST API failure:**
- Fire-and-forget; tick loop continues
- Clients get next broadcast 1 second later
- Log the error for monitoring

## Future Optimizations (not in this PR)

1. **Only write changed rows to DB** — diff tick output vs previous state, skip unchanged agents. Reduces DB write load but doesn't affect client experience.
2. **Disable CDC on `agent_positions`** — once no clients listen to it, disable the Realtime publication for this table to save WAL processing.
3. **Delta compression** — if payload grows beyond ~50 KB (500+ agents), send only changed fields. Not needed at 50 agents.
4. **Binary encoding** — MessagePack or Protobuf instead of JSON. Saves ~40% bandwidth. Not needed until thousands of concurrent users.

## Verification Plan

1. `npx vitest run` — all existing tests pass (no domain logic changes)
2. `npx tsc -p tsconfig.json --noEmit` — clean
3. iOS build succeeds
4. Manual test flow:
   - Boot app → syncWorld loads full snapshot → world renders
   - Wait → broadcast ticks arrive at 1Hz → agents move smoothly
   - Two agents start conversation → speech bubbles appear ("..." for others, full text for viewer's conversation)
   - Conversation ends → bubbles clear within 1–2 seconds
   - Background app → broadcasts continue but client ignores (no processing while backgrounded)
   - Foreground app → next broadcast resumes rendering immediately
5. Monitor Supabase dashboard: confirm `agent_positions` CDC events drop to zero for connected clients

## Implementation Order

1. **Backend: add broadcast send** after upsertAgentPositions in `runWorldTick` — existing CDC still works, so this is additive and safe
2. **Backend: remove active_message masking** from `buildWorldSnapshot`
3. **iOS: add BroadcastAgent / WorldBroadcastPayload models**
4. **iOS: rewrite RealtimeBridge** — replace CDC with broadcast subscription
5. **iOS: rewrite AppModel** — replace `applyWorldUpdate` with `applyWorldTick`
6. **iOS: update syncWorld handling** — client-side masking for bootstrap snapshot
7. **Clean up** — remove `RealtimeAgentPosition`, dead CDC code
8. **Test and verify**
