# Phase 5: User Tap Control — Detailed Implementation Plan

**Status:** Planning
**Date:** 2026-03-12
**Estimated effort:** 2–3 days
**Prerequisites:** Phases 1–4 complete (directional wander, POIs, approach, presence)

---

## Overview

Phase 5 gives the user minimal, intentional control over their Ka in the world view. The design follows the spec's "Observer-First, Actor-Second" philosophy: the default experience is watching, and taps are optional single-gesture intentions.

**Four capabilities:**
1. **Tap cell** → Ka pathfinds there, then resumes autonomous behavior
2. **Tap character** → Ka approaches and initiates conversation
3. **Tap conversation bubble** → Expand to read/join the conversation
4. **Return-from-absence recap** → "While you were away" overlay on app return

---

## Architecture Decision: Where Does Pathfinding Live?

**Decision: Server-side A*.**

| Option | Pros | Cons |
|--------|------|------|
| Client-side A* | Instant feedback, no latency | Obstacle map must sync to client; path can conflict with server tick; dual source of truth |
| Server-side A* | Single source of truth; obstacle map stays server-only; path integrates cleanly with `tickWorld` | ~100ms latency on tap; needs optimistic client feedback |

The server already owns all movement logic. Adding A* to the client would create a split-brain problem where the client computes a path but the server's next `tickWorld` overwrites it. Server-side A* keeps the architecture clean: the client sends an intent ("go here"), the server computes and persists the path, and the client animates it via the existing realtime pipeline.

**Latency mitigation:** Show a tap indicator immediately (client-side), then animate the path once the server responds (~100-200ms round trip).

---

## Commit A: A* Pathfinding (Server-Side, No Wiring)

**Goal:** Pure function, fully tested, no side effects.

### Files

**`src/domain/pathfinding.ts`** (new file)

```typescript
export interface Cell { x: number; y: number }

/**
 * A* pathfinding on the world grid.
 * Returns an array of cells from start (exclusive) to goal (inclusive),
 * or empty array if no path exists.
 *
 * Uses Chebyshev distance (8-directional movement) as heuristic.
 * Respects obstacle cells and optionally avoids occupied cells.
 */
export function findPath(
  start: Cell,
  goal: Cell,
  columns: number,
  rows: number,
  blocked: ReadonlySet<string>,  // "x:y" format
  maxLength?: number             // cap path length (default: columns + rows)
): Cell[]
```

**Implementation details:**
- 8-directional movement (N, NE, E, SE, S, SW, W, NW)
- Heuristic: Chebyshev distance (`max(|dx|, |dy|)`) — admissible for 8-directional
- Cost: 1.0 for cardinal, 1.414 for diagonal
- Grid bounds check: 0 ≤ x < columns, 0 ≤ y < rows
- Blocked set: union of `OBSTACLE_CELLS` + optionally occupied agent cells
- `maxLength` default: `columns + rows` (128 for 64×64 — generous upper bound)
- Returns `[]` if goal is blocked or unreachable
- Performance: 64×64 grid = 4,096 cells. A* with binary heap is trivially fast (<1ms). No optimization needed.

**Binary heap for open set** — either inline or import a tiny priority queue. Since this is Deno (edge functions), keep it zero-dependency: implement a simple min-heap (~40 lines).

### Tests

**`tests/unit/pathfinding.test.ts`** (new file, ~8 tests)

```
1. Direct path — straight line, no obstacles → returns optimal path
2. Path around obstacle — single blocked cell between start and goal → routes around
3. Path around wall — line of blocked cells → routes around the wall
4. Unreachable goal — goal is fully enclosed by obstacles → returns []
5. Goal is blocked — goal cell itself is blocked → returns []
6. Start equals goal — returns []
7. Diagonal movement — diagonal is shorter than L-shaped → uses diagonals
8. Max length cap — very long path gets truncated at maxLength
9. Edge cells — pathfinding from/to grid boundaries works correctly
```

**Validate:** `npx vitest run` — all existing tests pass + 8-9 new tests pass.

---

## Commit B: User-Directed Movement State (Types + Constants)

**Goal:** Extend the agent data model to support user-directed destinations without breaking autonomous behavior.

### Files

**`src/domain/types.ts`**

Add to `AgentPosition`:
```typescript
// User-directed movement (set via tap, cleared on arrival or new autonomous behavior)
user_target_cell_x?: number;
user_target_cell_y?: number;
user_directed?: boolean;  // true = following user tap path, false = autonomous
```

Add to `AgentState` union:
```typescript
// "user_moving" — Ka is following a user-tapped path
type AgentState = "wandering" | "idle" | "approaching" | "chatting" | "cooldown" | "user_moving";
```

**`src/domain/schemas.ts`**

Update `agentPositionSchema`:
```typescript
user_target_cell_x: z.number().int().optional(),
user_target_cell_y: z.number().int().optional(),
user_directed: z.boolean().optional(),
```

**`src/domain/constants.ts`**

```typescript
// User-directed movement
export const USER_MOVE_SPEED = 2.4;          // cells/sec — slightly faster than autonomous (1.8)
export const USER_DIRECTED_IDLE_TICKS = 3;   // idle for 3 ticks after arriving, then resume autonomous
```

### Database Migration

**`supabase/migrations/YYYYMMDD_add_user_directed_fields.sql`**

```sql
ALTER TABLE agent_positions
  ADD COLUMN IF NOT EXISTS user_target_cell_x INTEGER,
  ADD COLUMN IF NOT EXISTS user_target_cell_y INTEGER,
  ADD COLUMN IF NOT EXISTS user_directed BOOLEAN DEFAULT FALSE;
```

**`supabase/functions/_shared/db.ts`**

Add new fields to `AgentPositionRow` interface and `upsertAgentPositions` mapping.

### Tests

No new tests — just schema validation. Existing tests must still pass: `npx vitest run`.

---

## Commit C: Integrate User-Directed Movement into `tickWorld`

**Goal:** When an agent has `user_directed = true`, follow the user's A*-computed path instead of selecting autonomous behavior. On arrival, idle briefly, then resume autonomous mode.

### Files

**`src/domain/world.ts`**

Modify `advanceOnPath()`:
```
- If agent.user_directed is true:
  - Follow path as normal (existing path-following logic already works)
  - On path exhaustion (arrived at destination):
    - Set user_directed = false
    - Clear user_target_cell_x/y
    - Set behavior = "idle", behavior_ticks_remaining = USER_DIRECTED_IDLE_TICKS
    - Set state = "idle"
  - Do NOT run selectBehavior() — user intent overrides
  - Agent can still be pulled into conversations (adjacency check applies)
```

Modify `selectBehavior()`:
```
- If agent.user_directed is true, skip behavior selection entirely
  (return current behavior/path unchanged)
```

Modify `tickWorld()` conversation initiation:
```
- Agents in "user_moving" state CAN be approached for conversation
  (unlike autonomous "approaching" which might not)
- If pulled into conversation while user_moving:
  - Set user_directed = false, clear user_target
  - Transition to "chatting" as normal
```

### Tests

**Add to `tests/unit/world.test.ts`** (~6 new tests):

```
1. User-directed agent follows path, does not select new behavior
2. User-directed agent transitions to idle on path completion
3. User-directed agent clears user_directed flag on arrival
4. User-directed agent can be pulled into conversation (adjacency)
5. If pulled into conversation, user_directed is cleared
6. User-directed agent with empty path immediately transitions to idle
```

**Validate:** `npx vitest run` — all tests pass.

---

## Commit D: Backend Endpoints

**Goal:** Two new edge function endpoints that accept user taps and compute paths.

### Endpoint 1: `POST /tap-cell`

**`supabase/functions/tap-cell/index.ts`** (new)

Request:
```typescript
{
  device_id: string;
  target_cell_x: number;  // 0–63
  target_cell_y: number;  // 0–63
}
```

Flow:
1. Authenticate device → get user_id
2. Fetch user's current `agent_positions` row
3. Guard: if state is "chatting" or "cooldown", reject with 409 Conflict
4. Get current cell_x, cell_y
5. Build blocked set: `OBSTACLE_CELLS` (terrain) + other agents' cells (optional — see note)
6. Call `findPath(current, target, 64, 64, blocked)`
7. If path is empty → respond 422 (unreachable)
8. Update agent_positions:
   - `path = pathCells`
   - `state = "user_moving"`
   - `user_directed = true`
   - `user_target_cell_x = target_cell_x`
   - `user_target_cell_y = target_cell_y`
   - `move_speed = USER_MOVE_SPEED`
   - `behavior = "wander"` (doesn't matter, user_directed overrides)
   - `behavior_ticks_remaining = 0`
9. Respond 200 with the computed path

Response:
```typescript
{
  path: Array<{ x: number; y: number }>;
  estimated_duration_ms: number;
}
```

**Note on blocking other agents:** For tap-to-cell, do NOT treat other agent positions as blocked. The user is tapping a destination, and agents move — treating them as obstacles would cause "can't go there" confusion. Only terrain obstacles block.

### Endpoint 2: `POST /tap-character`

**`supabase/functions/tap-character/index.ts`** (new)

Request:
```typescript
{
  device_id: string;
  target_user_id: string;  // UUID of the character to approach
}
```

Flow:
1. Authenticate device → get user_id
2. Guard: cannot tap self
3. Fetch both agents' positions
4. Guard: user's state must not be "chatting" or "cooldown"
5. Get target's current cell (cell_x, cell_y)
6. Find an adjacent cell to target that is walkable (check 8 neighbors, prefer closest to user)
7. Call `findPath(userCell, adjacentCell, 64, 64, blocked)`
8. If no adjacent cell is reachable → respond 422
9. Update agent_positions:
   - Same as tap-cell, but also set `approach_target_id = target_user_id`
   - `state = "approaching"` (or "user_moving" — see design note)
10. Respond 200 with path

**Design note — state naming:**
- Use `"user_moving"` for tap-cell (no social intent)
- Use `"approaching"` for tap-character (social intent — will initiate conversation on arrival)
- `tickWorld` already handles `"approaching"` state for autonomous approach. User-directed approach follows the same pattern but with A* path instead of greedy.

### Integration with `app.ts`

Add the new functions to the request router in `_shared/app.ts` or create standalone edge functions (standalone is cleaner — each function is its own deploy unit).

### Tests

**`tests/unit/pathfinding.test.ts`** — already covered in Commit A.

**Integration testing (Layer 2):**
1. Deploy to Supabase staging
2. `POST /tap-cell` with valid coordinates → verify agent_positions updated
3. `POST /tap-cell` while chatting → verify 409 rejection
4. `POST /tap-character` → verify path to adjacent cell computed
5. Run a tick → verify user_directed agent follows path
6. Run ticks until arrival → verify transition to idle + autonomous resumption

---

## Commit E: iOS — Touch Handling + Tap Indicator

**Goal:** Capture taps on the world, convert to grid coordinates, call the backend, show visual feedback.

### Files

**`AARU/App/WorldScreen.swift`** — WorldScene additions

#### 1. Touch → Grid Cell Conversion

```swift
// In WorldScene
override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
    guard let touch = touches.first else { return }
    let location = touch.location(in: self)

    // Convert scene coordinates to grid cell
    let cellX = Int(location.x / cellSize)
    let cellY = Int(location.y / cellSize)

    // Bounds check
    guard cellX >= 0, cellX < columns, cellY >= 0, cellY < rows else { return }

    // Check if tapped on an agent
    if let tappedAgent = agentAt(location) {
        onTapCharacter?(tappedAgent.id)
    } else {
        onTapCell?(cellX, cellY)
    }
}

// Hit-test for agents (check all agent nodes)
private func agentAt(_ point: CGPoint) -> (id: UUID, node: AgentVisualNode)? {
    // Check agent nodes within a tap tolerance radius (~12 points)
    let tapRadius: CGFloat = 12
    for (id, node) in agentNodes {
        let distance = hypot(point.x - node.position.x, point.y - node.position.y)
        if distance < tapRadius {
            return (id, node)
        }
    }
    return nil
}
```

#### 2. Callbacks to SwiftUI

Add closure properties to `WorldScene`:
```swift
var onTapCell: ((Int, Int) -> Void)?
var onTapCharacter: ((UUID) -> Void)?
var onTapBubble: ((UUID) -> Void)?  // conversation ID
```

Wire in `WorldScreen.body`:
```swift
.task {
    scene.onTapCell = { cellX, cellY in
        Task { await model.tapCell(cellX: cellX, cellY: cellY) }
    }
    scene.onTapCharacter = { userId in
        Task { await model.tapCharacter(targetUserId: userId) }
    }
    scene.onTapBubble = { conversationId in
        model.navigateToConversation(conversationId)
    }
}
```

#### 3. Tap Indicator (Immediate Visual Feedback)

Show a small animated marker at the tapped cell while waiting for the server response:

```swift
// In WorldScene
func showTapIndicator(cellX: Int, cellY: Int) {
    // Remove existing indicator
    childNode(withName: "tapIndicator")?.removeFromParent()

    let point = cellToPoint(cellX, cellY)
    let indicator = SKShapeNode(circleOfRadius: 3)
    indicator.fillColor = UIColor.white.withAlphaComponent(0.6)
    indicator.strokeColor = UIColor.white.withAlphaComponent(0.3)
    indicator.position = point
    indicator.name = "tapIndicator"
    indicator.zPosition = 5
    mapNode.addChild(indicator)

    // Pulse animation, then fade out after 2 seconds
    let pulse = SKAction.sequence([
        SKAction.scale(to: 1.3, duration: 0.3),
        SKAction.scale(to: 0.8, duration: 0.3),
    ])
    let fadeOut = SKAction.sequence([
        SKAction.wait(forDuration: 2.0),
        SKAction.fadeOut(withDuration: 0.5),
        SKAction.removeFromParent()
    ])
    indicator.run(SKAction.group([
        SKAction.repeatForever(pulse),
        fadeOut
    ]))
}
```

#### 4. Character Tap Highlight

When tapping a character, briefly highlight them:

```swift
func highlightAgent(_ agentId: UUID) {
    guard let node = agentNodes[agentId] else { return }
    let highlight = SKShapeNode(circleOfRadius: 10)
    highlight.fillColor = .clear
    highlight.strokeColor = UIColor.white.withAlphaComponent(0.5)
    highlight.lineWidth = 1
    highlight.name = "tapHighlight"
    node.addChild(highlight)

    highlight.run(SKAction.sequence([
        SKAction.fadeOut(withDuration: 0.8),
        SKAction.removeFromParent()
    ]))
}
```

### AppModel + BackendClient Additions

**`AARU/App/BackendClient.swift`**

```swift
func tapCell(deviceID: String, cellX: Int, cellY: Int) async throws -> TapCellResponse {
    // POST /tap-cell { device_id, target_cell_x, target_cell_y }
}

func tapCharacter(deviceID: String, targetUserID: UUID) async throws -> TapCharacterResponse {
    // POST /tap-character { device_id, target_user_id }
}
```

**`AARU/App/AppModel.swift`**

```swift
func tapCell(cellX: Int, cellY: Int) async {
    do {
        let response = try await backend.tapCell(
            deviceID: deviceID, cellX: cellX, cellY: cellY
        )
        // Path will arrive via realtime subscription — no need to manually update
        addDebugEvent("Tapped cell (\(cellX), \(cellY)) — path: \(response.path.count) cells")
    } catch {
        addDebugEvent("Tap failed: \(error.localizedDescription)")
    }
}

func tapCharacter(targetUserId: UUID) async {
    do {
        let response = try await backend.tapCharacter(
            deviceID: deviceID, targetUserID: targetUserId
        )
        addDebugEvent("Approaching \(targetUserId) — path: \(response.path.count) cells")
    } catch {
        addDebugEvent("Approach failed: \(error.localizedDescription)")
    }
}
```

**`AARU/App/Models.swift`**

Add response types:
```swift
struct TapCellResponse: Codable {
    let path: [CellCoord]
    let estimatedDurationMs: Int

    enum CodingKeys: String, CodingKey {
        case path
        case estimatedDurationMs = "estimated_duration_ms"
    }
}
```

---

## Commit F: iOS — Tap Conversation Bubble

**Goal:** Tapping a speech bubble above an agent navigates to that conversation's detail screen.

### Approach

The bubble is an SKNode child of `AgentVisualNode`. We need to detect taps on bubbles specifically (not just the agent sprite).

**`WorldScreen.swift`** — update `touchesBegan`:

```swift
override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
    guard let touch = touches.first else { return }
    let location = touch.location(in: self)

    // Priority 1: Check if tapped on a conversation bubble
    if let conversationId = bubbleAt(location) {
        onTapBubble?(conversationId)
        return
    }

    // Priority 2: Check if tapped on an agent
    if let (agentId, _) = agentAt(location) {
        // If this agent is chatting, navigate to their conversation
        if let node = agentNodes[agentId],
           let convId = node.conversationID,
           node.isSelfAgent || true /* can view any conversation */ {
            onTapBubble?(convId)
        } else {
            onTapCharacter?(agentId)
            highlightAgent(agentId)
        }
        return
    }

    // Priority 3: Tap empty cell
    let cellX = Int(location.x / cellSize)
    let cellY = Int(location.y / cellSize)
    guard cellX >= 0, cellX < columns, cellY >= 0, cellY < rows else { return }
    onTapCell?(cellX, cellY)
    showTapIndicator(cellX: cellX, cellY: cellY)
}
```

**`AgentVisualNode`** — store conversationID for hit-testing:

```swift
var conversationID: UUID?  // set in configure(with:)

func configure(with agent: WorldAgent, debugMode: Bool = false) {
    // ... existing code ...
    conversationID = agent.conversationID
}
```

**Navigation** — Two options:

| Option | Pros | Cons |
|--------|------|------|
| A. Switch tab to Convos + push detail | Uses existing navigation; consistent | Jarring tab switch; loses world view context |
| B. Sheet/overlay from world view | Stays in world context; can dismiss back | New navigation path to build |

**Recommendation: Option B (sheet).** Present `ConversationDetailScreen` as a `.sheet` from `WorldScreen`. This keeps the user in the world context and allows them to dismiss back to watching.

```swift
// In WorldScreen
@State private var sheetConversationID: UUID?

.sheet(item: $sheetConversationID) { convId in
    NavigationStack {
        ConversationDetailScreen(conversationID: convId)
            .environmentObject(model)
    }
}
```

Wire `onTapBubble`:
```swift
scene.onTapBubble = { conversationId in
    sheetConversationID = conversationId
}
```

**`sheetConversationID` needs `Identifiable`** — wrap UUID:

```swift
// Use UUID directly since it conforms to Identifiable-compatible patterns,
// or use a small wrapper if needed for .sheet(item:)
```

---

## Commit G: Return-From-Absence Recap Overlay

**Goal:** When the user opens the app after being away, show a brief "While you were away" summary before fading into the world.

### Design

The recap is a **transient overlay** on the world screen (not a separate screen). It appears for 3-5 seconds, then auto-fades. User can tap to dismiss early.

Content:
```
While you were away...

💬 3 conversations
   Ka chatted with Luna about philosophy
   Ka bumped into Max near the fountain
   Ka had a brief encounter with Sage

📈 1 new connection
   Impression with Luna reached 45%

🌍 Ka visited 12 places
   Spent time near the Boardwalk
```

### Data Source

The backend already returns conversation data on `bootstrap` and `syncWorld`. The recap doesn't need a new endpoint — derive it from:

1. `conversations` array in `BootstrapPayload` — compare with locally cached last-seen state
2. New conversations since last session = conversations where `started_at > lastSeenAt`
3. Impression changes = diff between cached impression scores and fresh ones

### Files

**`AARU/App/AppModel.swift`**

```swift
// Track absence
@Published var recapItems: [RecapItem] = []
@Published var showRecap: Bool = false

struct RecapItem: Identifiable {
    let id = UUID()
    let icon: String      // SF Symbol name
    let headline: String
    let detail: String?
}

func buildRecap(previousConversations: [ConversationPreview],
                currentConversations: [ConversationPreview]) {
    var items: [RecapItem] = []

    let previousIds = Set(previousConversations.map(\.id))
    let newConvos = currentConversations.filter { !previousIds.contains($0.id) }

    if !newConvos.isEmpty {
        items.append(RecapItem(
            icon: "bubble.left.and.bubble.right",
            headline: "\(newConvos.count) new conversation\(newConvos.count == 1 ? "" : "s")",
            detail: newConvos.prefix(3).map { "Ka chatted with \($0.title)" }.joined(separator: "\n")
        ))
    }

    // Check impression changes
    let improvedConnections = currentConversations.filter { current in
        guard let prev = previousConversations.first(where: { $0.id == current.id }) else { return false }
        return current.theirImpressionScore > prev.theirImpressionScore
    }

    if !improvedConnections.isEmpty {
        items.append(RecapItem(
            icon: "arrow.up.heart",
            headline: "\(improvedConnections.count) impression\(improvedConnections.count == 1 ? "" : "s") grew",
            detail: improvedConnections.prefix(2).map {
                "\($0.title): \($0.theirImpressionScore)%"
            }.joined(separator: "\n")
        ))
    }

    // Check Ba unlocks
    let newBaUnlocks = currentConversations.filter { current in
        guard let prev = previousConversations.first(where: { $0.id == current.id }) else { return false }
        return current.baUnlocked && !prev.baUnlocked
    }

    for unlock in newBaUnlocks {
        items.append(RecapItem(
            icon: "person.2.fill",
            headline: "New connection unlocked!",
            detail: "You can now speak directly with \(unlock.title)"
        ))
    }

    if !items.isEmpty {
        recapItems = items
        showRecap = true
    }
}
```

**Persistence of last-seen state:**
```swift
// Save conversation snapshots to UserDefaults on app background
func saveConversationSnapshot() {
    let data = try? JSONEncoder().encode(conversations)
    UserDefaults.standard.set(data, forKey: "lastSeenConversations")
    UserDefaults.standard.set(Date(), forKey: "lastSeenAt")
}

func loadConversationSnapshot() -> [ConversationPreview]? {
    guard let data = UserDefaults.standard.data(forKey: "lastSeenConversations") else { return nil }
    return try? JSONDecoder().decode([ConversationPreview].self, from: data)
}
```

**`AARU/App/WorldScreen.swift`** — Recap overlay

```swift
// In WorldScreen body, add overlay
.overlay {
    if model.showRecap {
        RecapOverlay(items: model.recapItems) {
            withAnimation(.easeOut(duration: 0.4)) {
                model.showRecap = false
            }
        }
        .transition(.opacity.combined(with: .move(edge: .top)))
    }
}
```

**`AARU/App/RecapOverlay.swift`** (new file)

```swift
struct RecapOverlay: View {
    let items: [AppModel.RecapItem]
    let onDismiss: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("While you were away...")
                .font(.headline)
                .foregroundStyle(.primary)

            ForEach(items) { item in
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: item.icon)
                        .font(.body)
                        .foregroundStyle(.secondary)
                        .frame(width: 24)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.headline)
                            .font(.subheadline.bold())
                        if let detail = item.detail {
                            Text(detail)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .padding(.horizontal, 20)
        .padding(.top, 100)
        .frame(maxHeight: .infinity, alignment: .top)
        .onTapGesture { onDismiss() }
        .task {
            // Auto-dismiss after 5 seconds
            try? await Task.sleep(for: .seconds(5))
            onDismiss()
        }
    }
}
```

**`AARU/App/AARUApp.swift`** — Wire lifecycle

```swift
// In the App struct, track scene phase
@Environment(\.scenePhase) private var scenePhase

.onChange(of: scenePhase) { _, phase in
    switch phase {
    case .background, .inactive:
        model.saveConversationSnapshot()
    case .active:
        // Recap is built after bootstrap/sync completes (in AppModel)
        break
    @unknown default:
        break
    }
}
```

In `AppModel.bootstrap()` or `syncWorld()`:
```swift
// After loading fresh conversations
if let previousSnapshot = loadConversationSnapshot() {
    let lastSeen = UserDefaults.standard.object(forKey: "lastSeenAt") as? Date ?? .distantPast
    let absenceDuration = Date().timeIntervalSince(lastSeen)
    if absenceDuration > 60 { // Only show recap if away > 1 minute
        buildRecap(previousConversations: previousSnapshot, currentConversations: conversations)
    }
}
```

---

## Commit Summary

| Commit | Files | Tests | iOS Changes |
|--------|-------|-------|-------------|
| A: A* Pathfinding | `pathfinding.ts` (new) | 8-9 new | None |
| B: User-Directed Types | `types.ts`, `schemas.ts`, `constants.ts`, migration, `db.ts` | 0 (schema only) | None |
| C: tickWorld Integration | `world.ts` | 6 new | None |
| D: Backend Endpoints | `tap-cell/index.ts`, `tap-character/index.ts` (new) | Layer 2 integration | None |
| E: Touch Handling + Indicator | `WorldScreen.swift`, `AppModel.swift`, `BackendClient.swift`, `Models.swift` | Manual testing | Yes — gesture + visuals |
| F: Bubble Tap → Conversation | `WorldScreen.swift` | Manual testing | Yes — sheet navigation |
| G: Return Recap | `AppModel.swift`, `RecapOverlay.swift` (new), `WorldScreen.swift`, `AARUApp.swift` | Manual testing | Yes — overlay |

---

## Testing Plan

### Layer 1: Vitest (every commit)

```bash
npx vitest run        # all tests pass
npx tsc --noEmit      # no type errors
```

Expected: existing 29 tests + ~15 new tests = ~44 total.

### Layer 2: Supabase Staging (after Commit D)

1. Deploy migration + edge functions
2. `POST /tap-cell { device_id: "test", target_cell_x: 30, target_cell_y: 30 }`
   - Verify: agent_positions row updated with path + user_directed=true + state="user_moving"
3. `POST /tap-cell` while chatting → verify 409
4. `POST /tap-character { device_id: "test", target_user_id: "<npc_id>" }`
   - Verify: path computed to adjacent cell of target
5. Run world ticks → verify user_directed agent follows path and transitions on arrival

### Layer 3: iOS Visual (after Commits E-G)

1. Build on simulator
2. **Tap empty cell** → verify:
   - Tap indicator appears at cell (pulse animation)
   - Ka starts walking toward tapped cell
   - Ka arrives, idles briefly, resumes autonomous
3. **Tap another character** → verify:
   - Character highlights briefly
   - Ka walks toward character
   - If target is available → conversation starts
4. **Tap conversation bubble** → verify:
   - Sheet appears with conversation detail
   - Can dismiss back to world view
5. **Background app for 2 minutes, return** → verify:
   - Recap overlay appears with correct data
   - Auto-dismisses after 5 seconds
   - Tap to dismiss works

### Edge Cases to Test

| Case | Expected Behavior |
|------|-------------------|
| Tap while chatting | No action (guard in touchesBegan — or show "Ka is busy" toast) |
| Tap while on cooldown | No action (guard) |
| Tap unreachable cell (inside obstacle) | Show brief "Can't go there" indicator (red X) |
| Tap self | No action |
| Tap character who's chatting | Navigate to their conversation (if visible) instead of approach |
| Rapid double-tap | Second tap cancels first destination, sets new one |
| Tap during recap overlay | Dismiss recap, do NOT pass tap through to world |
| App killed (not backgrounded) | No recap on next launch (no lastSeenAt, or treat as fresh session) |
| Very long path (corner to corner) | Path computed successfully (A* handles 64×64 trivially) |

---

## Open Design Questions

### 1. Should tap-to-move show a path preview?

**Option A:** Show the full path as dotted line before Ka starts moving.
- Pro: User sees the route, feels predictable
- Con: More visual noise; might feel "game-like"

**Option B:** Just show the destination marker, Ka walks there naturally.
- Pro: Cleaner, maintains the "watching my Ka" feeling
- Con: User doesn't know the route

**Recommendation:** Option B for now. The tap indicator at the destination is sufficient. Path preview exists in debug mode already — can be promoted later if users want it.

### 2. Can the user cancel a tap-to-move?

**Recommendation:** Yes — tapping a new cell replaces the previous destination. Tapping the Ka itself (self) cancels and resumes autonomous. This feels natural: "I changed my mind."

### 3. Should the user be able to tap-approach a character who's already chatting?

**Recommendation:** Treat as "tap conversation bubble" — navigate to view the conversation, not approach. The Ka is busy; the user probably wants to read what's happening, not interrupt.

### 4. What happens if the target character moves while Ka is approaching?

**Recommendation:** The server recomputes the path on the next tick if the target has moved more than 2 cells from the original destination. The approach is intention-based ("go talk to X"), not location-based ("go to cell 30,40"). This requires storing `approach_target_id` and checking target position each tick.

### 5. Recap: how much detail?

**Recommendation:** Start minimal (conversation count + impression changes + Ba unlocks). Add detail progressively based on user feedback. The spec says 30-90 second sessions — the recap should take < 5 seconds to scan.

---

## Dependencies

- **Phase 1–2 complete:** Behavior system, POIs, directional wander — all exist
- **Phase 3 (approach):** Approach probability model needed for tap-character to feel right. If Phase 3 is not done, tap-character can simply pathfind + auto-initiate conversation on adjacency (simpler but less nuanced)
- **Phase 4 (presence):** Heartbeat needed for recap timing. If Phase 4 is not done, use `lastSeenAt` from UserDefaults as a rough proxy
- **Obstacle map:** Currently empty. A* works correctly with empty obstacles (just computes straight-line paths). Can be populated later without changing Phase 5 code

### Can Phase 5 be started before Phases 3–4?

**Yes**, with reduced scope:
- Tap-cell works independently (A* + path + animation)
- Tap-character works as simplified "pathfind to adjacent + auto-initiate"
- Recap works with UserDefaults-based absence tracking
- Only the approach probability model (Phase 3) and heartbeat (Phase 4) add nuance on top
