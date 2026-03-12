# AARU System Architecture

## Overview

AARU is a soul-based social app where AI agents (Ka) wander a 2D world, have conversations, and build impression signals. When impressions cross a threshold, human (Ba) conversations unlock.

```
+------------------------------------------------------------------+
|                        iOS CLIENT                                |
|  SwiftUI + SpriteKit  (pure renderer, no game logic)             |
|                                                                  |
|  +-----------+  +------------+  +-----------+  +-----------+     |
|  | WorldScene|  | AppModel   |  | Realtime  |  | Backend   |     |
|  | (SpriteKit|  | (state)    |  | Bridge    |  | Client    |     |
|  |  renderer)|  |            |  | (WS subs) |  | (HTTP)    |     |
|  +-----------+  +-----+------+  +-----+-----+  +-----+-----+    |
|       ^               |              |                |          |
|       |  @Published    |              |                |          |
|       +--worldAgents---+              |                |          |
+---------------------------------------|----------------|----------+
                                        |                |
                         WebSocket      |     HTTP POST  |
                     (Supabase Realtime)|                |
                                        |                |
+---------------------------------------|----------------|----------+
|                    SUPABASE PLATFORM                              |
|                                                                  |
|  +-------------------+    +----------------------------------+   |
|  | Realtime Server    |    | Edge Functions (Deno)            |   |
|  |                    |    |                                  |   |
|  | Broadcast channels |    |  bootstrap-user    sync-world   |   |
|  |  world:{id} (tick) |    |  advance-worlds    heartbeat    |   |
|  |                    |    |  tap-cell           tap-character|   |
|  | CDC channels       |    |  get-conversation   list-convos |   |
|  |  conversations     |    |  send-human-message send-ba-msg |   |
|  |  impression_edges  |    |  register-push-token            |   |
|  |  messages          |    |  advance-conversations          |   |
|  |  ba_messages       |    |  generate-soul-profile          |   |
|  +--------+-----------+    +--------+------------------------+   |
|           |                         |                            |
|           |    +--------------------+----+                       |
|           |    |   Shared Logic Layer    |                       |
|           |    |   _shared/app.ts        |                       |
|           |    |   _shared/db.ts         |                       |
|           |    |   _shared/contracts.ts  |                       |
|           |    +----------+--------------+                       |
|           |               |                                      |
|  +--------+---------------+------+    +---------------------+    |
|  |        PostgreSQL             |    | Domain Logic (TS)   |    |
|  |                               |    |                     |    |
|  |  users, soul_profiles         |    |  src/domain/        |    |
|  |  agent_positions, avatars     |    |  world.ts           |    |
|  |  conversations, messages      |    |  ka.ts              |    |
|  |  impression_edges             |    |  impression.ts      |    |
|  |  world_instances              |    |  pathfinding.ts     |    |
|  |  ba_conversations, ba_messages|    |  npcPool.ts         |    |
|  |  push_tokens                  |    |  soulProfile.ts     |    |
|  +-------------------------------+    +---------------------+    |
+------------------------------------------------------------------+
```

---

## 1. World Simulation Loop

The world runs in a server-side loop. An external caller hits the `advance-worlds` edge function, which runs for 55 seconds per invocation.

```
External caller (cron / scheduler)
         |
         v
  advance-worlds edge function
         |
         v
  advanceOnlineWorlds()                     [app.ts:1609]
         |
         +---> transitionStalePresence()    [db.ts:860]    online->bg->offline
         |
         +---> claimDueWorldInstances()     [db.ts:259]    up to 10 instances
         |
         +---> FOR EACH claimed instance:
         |       |
         |       +---> ensureNpcPopulation(instanceId)     [db.ts:706]
         |       |       real + NPC = 50 target
         |       |
         |       +---> runWorldTick(instanceId)            [app.ts:1077]
         |               |
         |               +---> getAgentPositions()         [db.ts:372]
         |               +---> repairConversationState()
         |               +---> tickWorld(positions)        [world.ts:724]
         |               |       |
         |               |       +---> behavior selection  [world.ts:448]
         |               |       +---> path stepping       [world.ts:510]
         |               |       +---> adjacency check     [world.ts:752]
         |               |       +---> return positions, movements, started convos
         |               |
         |               +---> FOR EACH started conversation:
         |               |       |
         |               |       +---> cooldown check (pair recently talked?)
         |               |       +---> offline limit check
         |               |       +---> createConversation()         [db.ts:456]
         |               |       +---> buildConversationTopics()    [app.ts:332]
         |               |       +---> insertMessage() (first line) [db.ts:542]
         |               |       +---> markConversationTurn()       [db.ts:474]
         |               |       +---> scheduleActiveMessageClear() [app.ts:194]
         |               |
         |               +---> upsertAgentPositions()      [db.ts:385]
         |               +---> broadcastWorldState()       [app.ts:260]
         |               +---> touchWorldInstance()        [db.ts:234]
         |
         +---> advanceDueConversations()    [app.ts:1685]
         |       |
         |       +---> claimDueConversations()  [db.ts:522]  up to 30
         |       +---> advanceConversation() for each       [app.ts:745]
         |
         +---> sleep(WORLD_TICK_INTERVAL_MS) then loop
```

### tickWorld() — Domain Physics
`src/domain/world.ts:724`

The pure domain function. No DB access. Takes positions in, returns positions out.

```
Input: AgentPosition[] (50 agents)
  |
  +---> Normalize positions (clamp cells, recover cooldowns)
  |
  +---> Detect adjacent pairs (Chebyshev distance = 1)        [world.ts:761]
  |     Both agents wandering + no conversation → start conversation
  |
  +---> FOR EACH agent:
  |       |
  |       +---> If user_directed: follow pre-computed path     [world.ts:522]
  |       +---> If chatting/cooldown: skip movement
  |       +---> Else: selectBehavior() → pick path             [world.ts:448]
  |               |
  |               Weighted random:
  |                 wander=35  idle=25  drift_social=20
  |                 drift_poi=15  retreat=5
  |               |
  |               +---> generatePathForBehavior()              [world.ts:689]
  |                       wander:       directional path (heading continuity)
  |                       idle:         no path (stay put 3-10 ticks)
  |                       drift_social: greedy path toward cluster
  |                       drift_poi:    greedy path toward POI
  |                       retreat:      greedy path away from crowd
  |
  +---> Record movement events (cell changes)
  |
Output: WorldTickResult { positions, movementEvents, startedConversations }
```

### Behavior Heading Continuity
`src/domain/world.ts:448`

Agents don't jitter randomly. Heading persists across ticks:

```
When selecting a new heading:
  70% chance: keep same heading
  20% chance: deviate ±1 (45 degrees)
  10% chance: deviate ±2 (90 degrees)

Headings (0-7):
      7  0  1
       \ | /
    6 ---+--- 2
       / | \
      5  4  3
```

---

## 2. Conversation Lifecycle

```
                       INITIATION
                           |
  Two agents adjacent      |      User taps character
  in tickWorld()           |      → forceConversationForUser()  [app.ts:974]
           |               |               |
           v               v               v
     createConversation()                          [db.ts:456]
           |
           +---> buildConversationTopics()         [app.ts:332]
           |       (news + interest overlap)
           +---> insertMessage() first Ka line     [db.ts:542]
           +---> markConversationTurn()            [db.ts:474]
           |       (sets next_turn_at)
           +---> set agent state = "chatting"
           +---> set active_message on speaker
           +---> scheduleActiveMessageClear()      [app.ts:194]
                   (clears bubble after TTL)

                       TURN LOOP
                           |
  advanceDueConversations() picks conversations   [app.ts:1685]
  where next_turn_at <= now
           |
           v
     advanceConversation(conversationId)           [app.ts:745]
           |
           +---> Get transcript, soul profiles, impression edges
           |
           +---> Every IMPRESSION_EVALUATION_INTERVAL (5) messages:
           |       |
           |       +---> evaluateImpression() x2 (both dirs)  [impression.ts:172]
           |       +---> accumulateImpression()                [impression.ts:263]
           |       +---> upsertImpressionEdge() x2             [db.ts:555]
           |       +---> Check Ba unlock (score >= 72)
           |
           +---> Check message limit:
           |       base = getMessagesForEncounter(encounterCount) [constants.ts:37]
           |       +4 if responsiveness >= 80 AND quality >= 80  [constants.ts:51]
           |
           +---> IF limit reached:
           |       |
           |       +---> generateConversationSummary()         [ka.ts:176]
           |       +---> generateRelationshipMemory() x2       [ka.ts:202]
           |       +---> finishConversation()                  [db.ts]
           |       +---> set agents to "cooldown" state
           |       +---> notify offline participants (push, max 1/day)
           |
           +---> ELSE continue:
                   |
                   +---> buildKaReply()                        [ka.ts:151]
                   |       system prompt with phase directives:
                   |         discovery: "Keep it light"
                   |         personal:  "Share something personal"
                   |         depth:     "Go deeper"
                   +---> insertMessage()                       [db.ts:542]
                   +---> markConversationTurn()                [db.ts:474]
                   +---> set active_message on speaker
                   +---> scheduleActiveMessageClear()
```

### Phase System
`src/domain/constants.ts:31`

```
Encounter count   Phase        Base message limit
  1 - 5           discovery    6
  6 - 12          personal     10
  13+             depth        16

Momentum extension: +4 if responsiveness >= 80 AND quality >= 80
```

### 5-Dimension Impression Scoring
`src/domain/impression.ts:172`

```
Dimension            Weight   Source
responsiveness       0.30     word referencing, Q/A patterns
values_alignment     0.25     Schwartz distance (60%) + expressed overlap (40%)
conversation_quality 0.20     transcript length + question density
interest_overlap     0.10     Jaccard similarity of interests
novelty              0.10     non-overlapping interests + value contrasts
baseline             0.05     fixed 50

Accumulation across encounters:
  historyWeight = min(0.65, 0.40 + encounterCount * 0.025)
  score = round(previous * historyWeight + current * (1 - historyWeight))

Ba unlock at: theirImpressionOfViewer >= 72
```

### Pair Cooldown
`src/domain/constants.ts:73`

```
Condition                    Cooldown
Strangers (< 15 encounters)  24 hours
Acquaintances (>= 15)        72 hours
Ba unlocked                  168 hours (1 week)
```

---

## 3. Realtime Data Flow

Three channels carry data from server to client:

```
+--------------------------------------------------------------------+
|                     SUPABASE REALTIME                               |
|                                                                     |
|  BROADCAST CHANNEL                                                  |
|  +--------------------------------------------------------------+  |
|  | world:{instance_id}                                          |  |
|  | Event: "tick" (1/sec)                                        |  |
|  | Payload: { tick, ts, agents: BroadcastAgent[] }              |  |
|  | Source: broadcastWorldState() in advance-worlds loop         |  |
|  | Drives: entire world map rendering                           |  |
|  +--------------------------------------------------------------+  |
|                                                                     |
|  CDC CHANNELS (PostgreSQL Change Data Capture)                      |
|  +--------------------------------------------------------------+  |
|  | aaru-conversations                                           |  |
|  |   conversations (filter: user_a_id=me OR user_b_id=me)      |  |
|  |   impression_edges (filter: user_id=me OR target_user_id=me) |  |
|  |   Drives: inbox refresh, conversation detail refresh         |  |
|  +--------------------------------------------------------------+  |
|  | aaru-messages                                                |  |
|  |   messages (NO filter — all messages in world)               |  |
|  |   ba_messages (NO filter)                                    |  |
|  |   Drives: conversation detail refresh only                   |  |
|  +--------------------------------------------------------------+  |
+--------------------------------------------------------------------+
```

### Broadcast Payload
`supabase/functions/_shared/app.ts:260`

Sent once per tick from `broadcastWorldState()`. Identical for all clients.

```typescript
{
  tick: number,           // monotonic counter
  ts: number,             // server timestamp ms
  agents: [
    {
      user_id: string,
      x: number,           // 0-1 normalized
      y: number,
      target_x: number,
      target_y: number,
      cell_x: number | null,  // integer grid cell
      cell_y: number | null,
      path: { x, y }[],    // remaining waypoints
      move_speed: number,
      state: string,        // wandering | chatting | cooldown | user_moving
      behavior: string,     // wander | idle | drift_social | drift_poi | retreat
      heading: number,      // 0-7 compass direction
      active_message: string | null,  // FULL text, client masks to "..."
      conversation_id: string | null
    },
    ... // 50 agents
  ]
}
```

**Size:** ~5-8 KB per tick (50 agents × ~100-150 bytes each).

### Client Processing
`AARU/App/AppModel.swift:390`

```
Broadcast arrives (1/sec)
  |
  v
applyWorldTick(payload)                              [AppModel.swift:390]
  |
  +---> Detect new agents (not in local state)
  |       → trigger syncWorld refresh for metadata    [AppModel.swift:396]
  |
  +---> Detect removed agents → remove from local
  |
  +---> For each broadcast agent:
  |       |
  |       +---> Compute movement event (cell changed?)
  |       +---> Update position, path, state, behavior, heading
  |       +---> Mask active_message:                  [AppModel.swift:434]
  |               my conversation? → show full text
  |               other conversation? → show "..."
  |               no message? → null
  |
  +---> Publish to @Published worldAgents
          |
          v
    WorldScreen onChange                              [WorldScreen.swift:82]
          |
          v
    scene.syncAgents(agents)                          [WorldScreen.swift:205]
          |
          +---> Create/update AgentVisualNode per agent
          +---> Set waypoint path for animation
          +---> Update speech bubble
          +---> Track camera on self agent
```

### CDC Channel Handlers

```
conversations / impression_edges change
  |
  v
onInboxChange()                    [AppModel.swift:378]
  → scheduleInboxRefresh()           (250ms debounce)
    → backend.listConversations()
      → update conversations[]

onConversationChange()             [AppModel.swift:383]
  → scheduleConversationRefresh()    (250ms debounce)
    → backend.getConversation()
      → update selectedConversation

messages / ba_messages insert
  |
  v
onConversationChange()             (same handler)
  → refresh selected conversation only
  → does NOT affect world view
```

---

## 4. Bootstrap & Sync Flow

```
App launch
  |
  v
AARUApp.init()                                   [AARUApp.swift:27]
  +---> DeviceIdentity.current()                  [SecureStore.swift:54]
  |       (read or generate UUID from Keychain)
  +---> AppModel(autoBootstrap: true)
          |
          v
     bootstrap()                                  [AppModel.swift:52]
          |
          +---> POST bootstrap-user               [BackendClient.swift:48]
          |       |
          |       v
          |   bootstrapUser(deviceId)             [app.ts:433]
          |     +---> ensureUser()                [db.ts:308]
          |     +---> pruneDemoWorld()
          |     +---> ensureNpcPopulation()       [db.ts:706]
          |     +---> ensureSoulProfile()
          |     +---> ensureAgentPosition()
          |     +---> advanceDueConversationsForUser()
          |     +---> buildWorldSnapshot()        [app.ts:665]
          |     +---> listConversationSummaries()
          |     +---> return { user, world, conversations }
          |
          +---> Store userID, instanceID, soulProfile, avatar
          +---> Store worldAgents (with client-side masking)
          +---> Determine stage: .onboarding or .world
          +---> startRealtime()                   [AppModel.swift:363]
          +---> startHeartbeat()                  [AppModel.swift:584]
          +---> listenForPushToken()              [AppModel.swift:606]
```

### syncWorld (refresh)
`AARU/App/AppModel.swift:156`

Called on bootstrap and when broadcast detects new/removed agents.

```
refreshWorld()                                    [AppModel.swift:156]
  |
  +---> POST sync-world                           [BackendClient.swift:77]
  |       |
  |       v
  |   syncWorld(deviceId)                         [app.ts:1064]
  |     +---> ensureUser, ensureNpcPopulation, etc.
  |     +---> buildWorldSnapshot(instanceId, userId)
  |             +---> getAgentPositions()          [db.ts:372]
  |             +---> listUsersByIds()  (display_name)
  |             +---> getAvatarsByUserIds()  (avatar config)
  |             +---> return { count, config, agents[] }
  |
  +---> Update worldAgents with full metadata:
  |       display_name, avatar, is_self
  |       (broadcast doesn't carry these)
  +---> Update worldConfig, worldCount
  +---> Optionally refresh inbox
```

---

## 5. User Interactions

### Tap Cell (move agent)

```
User taps ground tile
  |
  v
WorldScene.touchesBegan()                         [WorldScreen.swift:309]
  +---> Convert screen coords to grid cell
  +---> onTapCell?(cellX, cellY)
          |
          v
     AppModel.tapCell()                            [AppModel.swift:464]
       +---> POST tap-cell                         [BackendClient.swift:128]
               |
               v
          handleTapCell(deviceId, cellX, cellY)    [app.ts:1451]
            +---> Validate not chatting/cooldown
            +---> findPath(current, target, OBSTACLE_CELLS)  [pathfinding.ts:9]
            +---> upsertAgentPositions (state: "user_moving",
            |       user_directed: true, move_speed: 2.4)
            +---> return { path, estimated_duration_ms }
```

### Tap Character (approach agent)

```
User taps another agent
  |
  v
WorldScene.touchesBegan()                         [WorldScreen.swift:309]
  +---> agentAt(point) hit test (12pt radius)
  +---> onTapCharacter?(agentId)
          |
          v
     AppModel.tapCharacter()                       [AppModel.swift:475]
       +---> POST tap-character                    [BackendClient.swift:135]
               |
               v
          handleTapCharacter(deviceId, targetUserId)  [app.ts:1509]
            +---> Find walkable cell adjacent to target
            +---> findPath(current, adjacentCell)
            +---> upsertAgentPositions (state: "user_moving")
            +---> return { path, estimated_duration_ms }
```

### Send Human Message (in conversation detail)

```
User types message in conversation tab
  |
  v
AppModel.sendHumanMessage()                        [AppModel.swift:266]
  +---> POST send-human-message                    [BackendClient.swift:163]
          |
          v
     sendHumanMessage(deviceId, convoId, content)  [app.ts:1420]
       +---> insertMessage(type: "human_typed")    [db.ts:542]
       +---> Update agent active_message
       +---> markConversationTurn()                [db.ts:474]
       +---> scheduleActiveMessageClear()          [app.ts:194]
       +---> return full ConversationDetail
```

---

## 6. Presence Tracking

```
App active                  App backgrounded              Server-side transitions
    |                            |                              |
    v                            v                              v
startHeartbeat()            stopHeartbeat()              transitionStalePresence()
[AppModel.swift:584]        [AppModel.swift:601]         [db.ts:860]
    |                                                         |
    +---> every 30s:                                   Called every tick loop
    |     POST heartbeat                               iteration in
    |     → updateHeartbeat()                          advanceOnlineWorlds()
    |       [db.ts:856]                                [app.ts:1609]
    |       sets presence='online'                          |
    |       resets daily counter if date rolled              |
    v                                                       v
                                                    +------------------+
                                                    |  State Machine   |
                                                    |                  |
    heartbeat arrives                               |  online ------+  |
    every 30s                                       |    |  30s no   |  |
    +-----------+                                   |    v  heartbeat|  |
                                                    |  background   |  |
                                                    |    |  15min   |  |
                                                    |    v  no hb   |  |
                                                    |  offline      |  |
                                                    +------------------+

Offline users:
  - Ka still converses (up to 10 conversations/day)  [constants.ts:7]
  - Push notification on conversation end (max 1/day) [constants.ts:116]
```

---

## 7. NPC Population Management

```
ensureNpcPopulation(instanceId)                    [db.ts:706]
  |
  +---> Count real users in instance
  +---> npcCount = max(0, 50 - realUserCount)
  +---> getActiveNpcSeeds(realUserCount, 50)       [npcPool.ts:378]
  |       returns first npcCount seeds from 50-seed pool
  |
  +---> Deactivate excess NPCs
  |       (delete agent_position, unset instance_id)
  |
  +---> Delete stale NPCs not in pool
  |
  +---> Create/activate needed NPCs:
          |
          +---> Upsert user (device_id: "npc-{name}", is_npc: true)
          +---> deriveSoulProfile(seed)            [npcPool.ts:305]
          |       |
          |       +---> deriveSoulValues()
          |       |       blend VALUE_SCHWARTZ mappings
          |       |       + PERSONALITY_NUDGE adjustments
          |       |       clamp each dimension to [0, 1]
          |       |
          |       +---> deriveSoulNarrative()
          |               INTEREST_STORIES → formative_stories
          |               last interest story → self_defining_memories
          |               KEYWORD_THEMES → narrative_themes
          |
          +---> upsertSoulProfile()
          +---> upsertAvatar (avatarForSeed)
          +---> ensureAgentPosition()
```

---

## 8. SpriteKit Rendering Pipeline

```
@Published worldAgents changes
  |
  v
WorldScreen.onChange                               [WorldScreen.swift:82]
  |
  v
scene.syncAgents(agents)                           [WorldScreen.swift:205]
  |
  +---> Remove stale nodes (agents no longer in list)
  |
  +---> For each agent:
  |       |
  |       +---> Get or create AgentVisualNode
  |       +---> configure(with: agent)             [WorldScreen.swift:527]
  |       |       load sprite textures for avatar.spriteId
  |       |       set name label, debug overlays
  |       |
  |       +---> Build waypoint path:
  |       |       [current cell] + agent.path
  |       |       convert to pixel coords via cellToPoint()
  |       |
  |       +---> setPath(waypoints, speed, isMoving)[WorldScreen.swift:656]
  |       |       store waypoints, reset index to 0
  |       |
  |       +---> Face conversation partner (if chatting)
  |       +---> updateBubble(agent.activeMessage)  [WorldScreen.swift:749]
  |               |
  |               +---> "..." → small ellipsis bubble
  |               +---> text → word-wrapped bubble with TTL
  |               +---> nil → clear bubble
  |
  v
scene.update(currentTime)  [60fps]                 [WorldScreen.swift:292]
  |
  +---> For each agent node:
          +---> stepAlongPath(dt)                  [WorldScreen.swift:676]
          |       interpolate position toward next waypoint
          |       update facing direction
          |       advance to next waypoint when reached
          |
          +---> checkBubbleTTL(currentTime)        [WorldScreen.swift:770]
                  expire bubble after word-based TTL or 15s max
```

---

## 9. Database Schema

### Tables

```
+------------------+     +-------------------+     +------------------+
| users            |     | soul_profiles     |     | avatars          |
|------------------|     |-------------------|     |------------------|
| id (pk)          |<-+--| user_id (pk/fk)   |  +--| user_id (pk/fk)  |
| device_id (uniq) |  |  | personality       |  |  | sprite_id        |
| display_name     |  |  | interests[]       |  |  | body_shape       |
| instance_id (fk) |  |  | values (jsonb)    |  |  | skin_tone        |
| is_npc           |  |  | narrative (jsonb)  |  |  | hair_style/color |
| presence         |  |  | avoid_topics[]    |  |  | eyes, outfit_*   |
| last_heartbeat_at|  |  | raw_input         |  |  | accessory        |
| daily_offline_*  |  |  | guessed_fields[]  |  |  | aura_color       |
| last_notif_at    |  |  +-------------------+  |  +------------------+
+------------------+  |                          |
         |            +--+--+----+----+----------+
         |               |  |    |    |
+--------v---------+  +--v--v----v----v--------+
| world_instances  |  | agent_positions        |
|------------------|  |------------------------|
| id (pk)          |  | user_id (pk/fk)        |
| name, slug (uniq)|  | instance_id (fk, idx)  |
| capacity         |  | x, y (0-1 normalized)  |
| min_population   |  | target_x, target_y     |
| is_online        |  | cell_x, cell_y         |
| last_tick_at     |  | target_cell_x/y        |
| next_tick_at     |  | path (jsonb)           |
| processing_owner |  | move_speed             |
| processing_exp   |  | state (enum)           |
+------------------+  | behavior, heading      |
                       | behavior_ticks_rem     |
                       | active_message         |
                       | conversation_id        |
                       | cooldown_until         |
                       | user_directed          |
                       | user_target_cell_x/y   |
                       +------------------------+

+---------------------+     +------------------+     +--------------------+
| conversations       |     | messages         |     | impression_edges   |
|---------------------|     |------------------|     |--------------------|
| id (pk)             |<----| conversation_id  |     | user_id (pk/fk)    |
| instance_id (fk)    |     |   (fk, idx)      |     | target_user_id     |
| user_a_id (fk)      |     | user_id (fk)     |     |   (pk/fk)          |
| user_b_id (fk)      |     | type (enum)      |     | score (0-100)      |
| status              |     |   ka_generated   |     | summary            |
| impression_score    |     |   human_typed    |     | memory_summary     |
| impression_summary  |     | content          |     | ba_unlocked        |
| topic_seed[]        |     | created_at       |     | encounter_count    |
| turn_count          |     +------------------+     | responsiveness     |
| last_turn_at        |                               | values_alignment   |
| next_turn_at        |     +------------------+     | conversation_qual  |
| processing_owner    |     | ba_conversations |     | interest_overlap   |
| processing_exp      |     |------------------|     | novelty            |
| started_at          |     | id (pk)          |     +--------------------+
| ended_at            |     | user_a_id (fk)   |
+---------------------+     | user_b_id (fk)   |     +------------------+
                             | source_convo_id  |     | push_tokens      |
                             | status           |     |------------------|
                             +------------------+     | user_id (pk/fk)  |
                                    |                 | device_token     |
                             +------v-----------+     | platform         |
                             | ba_messages      |     | is_active        |
                             |------------------|     +------------------+
                             | id (pk)          |
                             | ba_convo_id (fk) |
                             | user_id (fk)     |
                             | content          |
                             | created_at       |
                             +------------------+
```

### Key RPC Functions (PostgreSQL)

| RPC | Migration | Purpose |
|-----|-----------|---------|
| `claim_due_world_instances(owner, lease, due_before, limit)` | initial | Atomically claim instances due for ticking |
| `claim_due_conversations(owner, lease, due_before, limit)` | initial | Atomically claim conversations due for turn advancement |
| `claim_conversation(convo_id, owner, lease, due_before)` | initial | Claim single conversation |
| `update_heartbeat(user_id)` | presence_tracking | Set presence=online, bump heartbeat, reset daily counter on date roll |
| `transition_stale_presence()` | presence_tracking | online→background (30s), background→offline (15min) |
| `increment_offline_convo(user_id)` | presence_tracking | Atomic daily counter increment with date rollover |

---

## 10. Edge Function Map

All edge functions follow the same pattern: parse request with Zod schema → call handler in `app.ts` → return JSON response.

| Endpoint | Schema | Handler | Purpose |
|----------|--------|---------|---------|
| `bootstrap-user` | `bootstrapUserRequestSchema` | `bootstrapUser()` | First call on app launch. Returns user, world, conversations |
| `sync-world` | `syncWorldRequestSchema` | `syncWorld()` | Full world snapshot with metadata |
| `advance-worlds` | — | `advanceOnlineWorlds()` | Server tick loop (55s). Ticks worlds + advances conversations |
| `advance-conversations` | — | `advanceDueConversations()` | Standalone conversation advancement |
| `heartbeat` | `heartbeatRequestSchema` | `handleHeartbeat()` | Presence keepalive (30s interval) |
| `tap-cell` | `tapCellRequestSchema` | `handleTapCell()` | User-directed movement to cell |
| `tap-character` | `tapCharacterRequestSchema` | `handleTapCharacter()` | User-directed movement toward agent |
| `get-conversation` | `getConversationRequestSchema` | `getConversationDetail()` | Full conversation with messages + impressions |
| `list-conversations` | `listConversationsRequestSchema` | `listConversationSummaries()` | Inbox with scores, phases, Ba status |
| `send-human-message` | `sendHumanMessageRequestSchema` | `sendHumanMessage()` | User types in Ka conversation |
| `send-ba-message` | `sendBaMessageRequestSchema` | `sendBaMessage()` | User messages in unlocked Ba thread |
| `register-push-token` | `registerPushTokenRequestSchema` | `handleRegisterPushToken()` | Save APNS device token |
| `save-soul-profile` | — | `saveSoulProfile()` | Save onboarding soul profile |
| `save-avatar` | — | `saveAvatar()` | Save avatar customization |
| `generate-soul-profile` | `generateSoulProfileRequestSchema` | domain function | LLM-generate soul profile from free text |
| `ka-converse` | `kaConverseRequestSchema` | `buildKaReply()` | Direct Ka reply (used by tests) |
| `evaluate-compatibility` | `evaluateCompatibilityRequestSchema` | domain function | Direct impression eval (used by tests) |
| `transcribe-audio` | — | external API | Whisper transcription |
| `fetch-news` | — | `fetchInterestNews()` | xAI news for conversation topics |

---

## 11. iOS App Structure

```
AARUApp.swift               Entry point, scenePhase, AppDelegate for push tokens
  |
  v
RootView.swift              Switch on AppStage:
  |                           .launching → ProgressView
  |                           .onboarding → OnboardingView
  |                           .world → MainTabView
  |
  v
AppModel.swift              @MainActor ObservableObject — all state
  |                         Published: worldAgents, conversations, selectedConversation
  |                         Owns: BackendClient, RealtimeBridge, heartbeatTask
  |
  +---> BackendClient.swift   HTTP POST to all edge functions
  +---> RealtimeBridge.swift   WebSocket subscriptions (broadcast + CDC)
  +---> SecureStore.swift      Keychain wrapper for device identity
  +---> Models.swift           All Codable structs (snake_case CodingKeys)
  |
  v
WorldScreen.swift           SwiftUI wrapper for WorldScene (SpriteKit)
  |                         Observes worldAgents → scene.syncAgents()
  |                         Touch handling → tapCell / tapCharacter callbacks
  |
  v
WorldScene (SKScene)        60fps rendering
  AgentVisualNode             Per-agent: sprite, name, bubble, path animation
    sprite textures             75 avatar variants from Sprites.atlas
    stepAlongPath(dt)           Interpolate position along waypoints
    updateBubble(message)       Show text or "..." with TTL
```

### Key iOS Data Types
`AARU/App/Models.swift`

| Type | Line | Purpose |
|------|------|---------|
| `SoulValues` | 3 | Schwartz dimensions (0-1 each) + expressed values |
| `SoulNarrative` | 19 | formative_stories, self_defining_memories, narrative_themes |
| `SoulProfile` | 31 | Full psychological profile |
| `AvatarConfig` | 51 | 10-field avatar appearance |
| `CellCoord` | 147 | Grid cell (x, y integers) |
| `WorldAgent` | 152 | Client-side agent state (position + metadata + bubble) |
| `WorldConfig` | 194 | Simulation parameters for client interpolation |
| `WorldMovementEvent` | 273 | Cell-to-cell movement delta |
| `WorldBroadcastPayload` | 289 | Broadcast tick payload |
| `BroadcastAgent` | 295 | Lightweight agent from broadcast (no metadata) |
| `ConversationPreview` | 373 | Inbox entry with impression scores |
| `ConversationDetail` | 415 | Full conversation with messages + both impressions |
| `BootstrapPayload` | 436 | Initial load response |
| `WorldSnapshot` | 506 | sync-world response |
