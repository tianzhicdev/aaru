# World Movement & Presence — v2 Spec

**Status:** Draft
**Date:** 2026-03-11

---

## Problem

Characters random-walk on a 96x64 grid and auto-start conversations when adjacent by chance. There is no concept of online/offline presence, no user agency, and no intentionality behind movement or encounters. The world feels like Brownian motion, not a living place.

## Design Philosophy

Research across virtual social worlds reveals three core principles:

1. **The return moment is the product.** Neko Atsume's entire game is opening the app to discover what happened while you were gone. AARU's core loop is: "What did my Ka do?" Not real-time control. (Neko Atsume: 98% positive Steam reviews, cats only arrive when app is closed.)

2. **Presence concealment eliminates social anxiety.** CHI 2020 research: 68% of users experience measurable stress from visible presence indicators. The Ka provides permanent plausible deniability — "my Ka was talking, not me." Never reveal whether a human is watching. (Signal, Journey, and Kind Words all hide status.)

3. **Slow down to create social space.** Sky: Children of the Light's biggest lesson: "The more compelling the goal, the more players ignore each other." Create moments of pause where encounters happen naturally. (thatgamecompany GDC talk)

**Design lineage:** Neko Atsume (passive observation) + Animal Crossing (personality-driven NPC life) + Journey (anonymous encounter magic) + The Sims (utility-based autonomy) + Stanford Generative Agents (memory-driven social AI)

---

## 1. Presence Model

### States (server-side only, never exposed to other users)

| State | Trigger | Description |
|-------|---------|------------|
| `online` | App in foreground, WebSocket connected | User sees the world in real time |
| `background` | App backgrounded; last heartbeat < 15 min | Ka fully autonomous |
| `offline` | No heartbeat for > 15 min | Ka fully autonomous |

### Behavior by presence

| | Online | Background | Offline |
|--|--------|------------|---------|
| Movement | Autonomous wander + user tap override | Autonomous wander | Autonomous wander |
| Initiate conversation | Unlimited (Ka auto or user-directed) | Ka auto, within daily limit | Ka auto, max 10/day |
| Be approached | Yes | Yes | Yes |
| Conversation persona | Full Ka personality | Full Ka personality | Full Ka personality |
| User notification | N/A | Push: "Your Ka had a conversation about [topic]" | Push: summary on return |

### Why invisible presence?

Research backing:
- **ACM CHI 2020**: Users "carefully curate and seek to control their self-presentation" via online status indicators. OSIs reveal sleep/wake routines and communication patterns — surveillance by design.
- **Carnegie Mellon HCI**: Read receipt visibility increases "attention residue" by 37%. Users take 2.3x longer to re-engage with deep work after checking a message with visible "read" confirmation.
- **Instagram "activity status" paradox**: Users want to know when others are online but don't want others to know when they are online. This is unsolvable — so remove the signal entirely.
- **Journey (thatgamecompany)**: Anonymous pairing with no visible identity. Names revealed only at credits. Players report deeper emotional connection than in games with full identity.

**Rule: Never surface any signal that reveals whether a human is currently watching their Ka.**

### Offline conversation limits
- Max **10 conversations per day** per offline user (already in `constants.ts`)
- Max **20 messages per conversation** when offline (already in `constants.ts`)
- Ka handles both sides autonomously when both parties are offline
- Daily counter resets at midnight UTC

---

## 2. Movement System

### Current problem

`generateWanderPath` picks random neighbors 1–15 steps. This is pure Brownian motion — no direction persistence, no purpose, no variation. Characters jitter.

### 2.1 Behavior State Machine

Replace the single "wandering" state with a behavior palette, inspired by The Sims' utility AI and Animal Crossing's personality-driven activities.

**Behavior selection** runs every 5–10 seconds (not every tick). Each behavior has a **duration** and a **weight** that varies by personality and context.

| Behavior | Base Weight | Duration | Description |
|----------|------------|----------|-------------|
| `wander` | 35% | 5–15s | Walk a directional path (heading-biased, not random) |
| `idle` | 25% | 3–10s | Stop in place. Visually: looking around, sitting if near bench |
| `drift_social` | 20% | until arrival | Move toward nearest cluster of 2+ agents (social gravity) |
| `drift_poi` | 10% | until arrival | Move toward a point-of-interest (bench, fountain, tree) |
| `retreat` | 5% | 5–10s | Move away from crowded area (>3 agents within 5 cells) |
| `approach` | 5% | until adjacent | Move toward a specific agent to initiate conversation |

**Weight modifiers** (inspired by The Sims' trait system):
- Personality "social" trait: `drift_social` weight +15%, `retreat` weight -3%
- Personality "introverted" trait: `idle` weight +10%, `retreat` weight +5%
- Near a POI: `idle` weight +15%
- Recently finished conversation (cooldown): `wander` weight +20%, `approach` weight = 0

**The Sims insight applied**: The Sims doesn't always pick the highest-scored option — it picks randomly from top-scoring options to prevent robotic optimization. We should do the same: select from top 2–3 weighted behaviors with soft randomization.

### 2.2 Directional Wander (Reynolds' Wander Steering Behavior)

Craig Reynolds' 1999 "Wander" behavior: direction on frame N is correlated with frame N-1, producing natural-looking meandering rather than jitter.

**Grid-adapted implementation:**
- Pick a **heading** (0–7, compass direction)
- Each step: 70% continue heading, 20% deviate ±1 direction, 10% deviate ±2
- Path length: 3–12 cells
- Avoid occupied cells and obstacles
- Result: agents walk in arcs and curves, not random zigzags

**Comparison:**
```
Current (Brownian):    ↗↙→↖↓↘←↑    (chaotic)
Directional wander:   →→↗→→↗↗→    (purposeful arc)
```

### 2.3 Social Gravity (Boids-Inspired)

Adapted from Craig Reynolds' Boids (1986) for small populations on a discrete grid:

- **Cohesion**: Agents drift toward center of mass of nearby agents (within visual range of ~8 cells)
- **Separation**: Agents avoid occupying adjacent cells unless approaching for conversation (protected range of 1 cell)
- **No alignment**: Irrelevant for social agents (they're not a flock)

For populations under 50, Reynolds notes that cohesion degenerates into follow-the-leader. We compensate by adding **POI attraction** as an additional cohesion anchor — agents gather around places, not just around each other.

### 2.4 Idle Behavior

Animal Crossing's biggest contribution to the "alive world" feeling: **villagers doing activities** (singing, reading, sweeping, exercising, examining objects). Each villager has a personality + hobby that determines idle activities.

For AARU (sprite-limited):
- **Phase 1**: Simply stop moving for 3–10 seconds. Even this alone will look dramatically more natural than constant jittering.
- **Phase 2**: Add 2–3 idle animation variants (looking around, sitting if at bench POI)
- Each Ka has a personality type that influences idle duration and frequency

---

## 3. Conversation Initiation

### Current problem

Adjacent = instant auto-chat. No intentionality, no relationship history, no opt-out.

### 3.1 Proximity-Based Approach (Research-Backed Model)

Inspired by Stanford Generative Agents (memory-scored initiation) and The Sims (utility-scored interaction), adapted for AARU's simpler architecture:

**Trigger**: Two agents within **3 cells** of each other (Gather.town uses 3–5 tiles for interaction radius).

**Approach probability per behavior-tick** (every 5–10s):

```
P(approach) = base_rate × affinity × recency × availability × context
```

| Factor | Value | Source |
|--------|-------|--------|
| `base_rate` | 0.12 | Tunable — ~12% chance per decision tick |
| `affinity` | 1.0 + (impression_score / 100) | Higher impression = more likely. Range: 1.0–1.72 |
| `recency` | max(0.1, 1.0 - e^(-hours_since_last_talk / 4)) | Exponential recovery. 0.1 right after talk, ~0.6 at 4hrs, ~0.9 at 8hrs |
| `availability` | 0.0 if chatting/cooldown/approaching, else 1.0 | Hard gate |
| `context` | 1.0 + poi_bonus(0.15) + both_idle_bonus(0.10) | Situational boost |

**Example**: Two agents, impression score 36, last talked 6 hours ago, both near a fountain:
```
P = 0.12 × 1.36 × 0.78 × 1.0 × 1.25 = 0.159 (15.9% per tick)
```

### 3.2 Approach → Greet → Chat Flow

Replaces instant auto-chat with a visible social ritual:

1. **Decide to approach**: Agent selects `approach` behavior, pathfinds toward target
2. **Target awareness**: Target may also approach (mutual approach) or continue current behavior
3. **Adjacent**: Once adjacent, 1–2 message greeting exchange (fast, ~2 seconds)
4. **Commit or decline**: Based on greeting, either enter `chatting` or one walks away
   - Decline probability increases with low impression scores and recent conversations
   - Declined approaches enter a 30-minute cooldown for that specific pair

### 3.3 Conversation Types

| Type | When | Messages | Impression Impact |
|------|------|----------|------------------|
| **Brief encounter** | First meeting or low impression | 3–5 messages | Low (+2–5) |
| **Casual chat** | Moderate impression (20–50) | 6–10 messages | Medium (+5–10) |
| **Deep conversation** | High impression (50+) | 10–15 messages | High (+8–15) |

Length scales with relationship depth — strangers don't have 20-message conversations.

---

## 4. Points of Interest (POIs)

### Why POIs matter

**Majora's Mask insight**: NPCs with destinations and schedules feel alive. NPCs that wander randomly feel broken. POIs give Ka agents somewhere to go.

**Sky: Children of the Light insight**: Tree-like paths with secrets as "ice breakers" and moments that slow progression create space for organic interaction. Linear goal-oriented paths discourage social connection.

### POI Types (derived from map)

Extract from the existing beach/desert tileset map:

| POI Type | Effect | Conversation Bonus |
|----------|--------|-------------------|
| Bench / sitting area | Agents idle longer (+50% idle duration) | +15% approach probability |
| Fountain / water feature | Social gathering magnet | +20% approach probability |
| Tree / shade | Retreat/solitude spot | +5% approach probability |
| Pathway intersection | Natural crossing point | +10% approach probability |
| Doorway / entrance | Brief lingering | +5% approach probability |

### POI Behavior

- Agents within 2 cells of a POI: `idle` weight doubled, `drift_poi` weight zeroed (already here)
- Agents at a POI: may adopt POI-specific idle (sitting at bench, looking at fountain)
- POIs seed conversation topics: fountain → "the sound of water," bench → "resting after a walk"
- Max 3 agents at any POI before it's "full" (overflow agents drift elsewhere)

---

## 5. User Control (Online Only)

### Philosophy: Observer-First, Actor-Second

**Neko Atsume model**: The core experience is watching. Interaction is optional and minimal.
**StreetPass model**: Social value is generated passively. The user's presence is not required.
**Tomodachi Life model**: Player agency is limited to setup and facilitation, not direct control.

### Interaction Model

The user can:

1. **Watch** (default) — Ka wanders autonomously. The world screen is a "Whereabouts Clock" (calm technology concept) — a glanceable ambient display of social activity.

2. **Tap a cell** → Ka pathfinds there (A* on the grid), then resumes autonomous behavior. One tap = one intention. No second tap required.

3. **Tap another character** → Ka pathfinds to an adjacent cell and initiates conversation approach. If the other character is busy or moves away, Ka returns to autonomous mode.

4. **Tap an active conversation bubble** → Expand to read the conversation in progress. If impression threshold is met, option to "step in" (Ba mode — human takes over from Ka).

**What we deliberately don't allow:**
- No joystick or continuous control (breaks the "watching my Ka live its life" feeling)
- No ability to prevent your Ka from being approached (Ka has its own agency)
- No ability to force-end someone else's conversation
- No DMs or direct messaging outside of world encounters (preserves organic serendipity)

### Target session length

Based on calm technology research: **30–90 seconds** for a lean-back check-in. Optional deep-dive into conversation logs for longer sessions. This is Neko Atsume's session length (average ~3 minutes).

---

## 6. Making a Small World Feel Alive

### The Cold Start Problem (Solved by Design)

**AARU's architecture is uniquely positioned**: Ka agents ARE the cold-start solution. With zero human users online, the world is still full of wandering, conversing characters. This is the legitimate, transparent version of Reddit's early sockpuppet strategy.

Research validation:
- **"Autonomous AI Agents Can Solve a Social Network's Cold Start Problem"** (2025): AI agents that persistently interact and generate content ensure the platform remains active.
- **Improbable/SpatialOS**: "Persistent offline simulation — wildlife continues to explore even when no players are in the area. The world evolves while you're gone."

### Density Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Minimum active agents | 8–12 | Below 8, a 96x64 grid feels deserted. Above 15, encounters become too frequent |
| Simultaneous conversations | 2–3 visible | Enough to feel social, not chaotic |
| Agent visual range | 8 cells | Boids visual range — agents "notice" others within this radius |
| Interaction radius | 3 cells | Gather.town standard. Triggers approach probability |
| Protected range (personal space) | 1 cell | Agents avoid clustering into same cell |

### Active Area Zones

The 96x64 grid is large. With <20 agents, encounters would be too rare if agents spread uniformly.

**Solution: Weighted spawn zones.** Agents spawn and drift toward a "town center" area (~30x20 cells in the map's social area). Retreat behavior moves them to the periphery. This creates a density gradient — busy center, quiet edges — like a real village.

### Dark Souls "Ghost" Traces (Future Enhancement)

Dark Souls creates the feeling of a populated world through asynchronous traces: messages, bloodstains, ghost replays near bonfires. AARU could adopt this:
- **Conversation echoes**: Faint speech bubbles showing snippets of past conversations that happened at a location
- **Footprint trails**: Subtle trails showing where agents have walked recently
- These create ambient activity even when no one is nearby

---

## 7. Notification Strategy

Based on research (Duolingo's bandit algorithm, notification fatigue studies):

### Rules
- **Maximum 1 push notification per day** (64% of users delete apps sending 5+/week)
- **Narrative framing**: "Your Ka had a fascinating conversation with [Name]'s Ka about [topic]" — not "X wants to talk"
- **Ba-unlock is the only high-priority notification**: "A new connection has formed — you can now speak directly with [Name]"
- **Never send**: "You haven't opened the app in X days" (punitive, creates guilt — the Tamagotchi trap)
- **Personalized timing**: Send when user historically engages, not fixed schedule

### Return Experience

When user opens the app after being away:
1. Brief recap overlay: "While you were away: 3 conversations, 1 new impression, Ka visited the fountain"
2. World fades in with Ka at current position
3. Tap recap items to see conversation summaries
4. This is the **Neko Atsume moment** — the entire retention hook

---

## 8. Data Model Changes

### AgentPosition extensions
```typescript
interface AgentPosition {
  // ... existing fields ...

  // Behavior state machine
  behavior: "wander" | "idle" | "drift_social" | "drift_poi" | "approach" | "retreat";
  behavior_ticks_remaining: number;
  heading: number;                // 0-7, compass direction for directional wander
  approach_target_id?: UUID;      // who they're walking toward
  poi_target?: CellCoord;         // current POI destination

  // Conversation history (for approach probability)
  last_conversation_at?: string;  // ISO timestamp
}
```

### User presence (server-side only)
```sql
ALTER TABLE users ADD COLUMN
  presence TEXT DEFAULT 'offline' CHECK (presence IN ('online', 'background', 'offline')),
  last_heartbeat_at TIMESTAMPTZ DEFAULT now(),
  daily_offline_convos INT DEFAULT 0,
  daily_offline_convos_reset_at DATE DEFAULT CURRENT_DATE;
```

### POI table
```sql
CREATE TABLE world_pois (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cell_x INT NOT NULL,
  cell_y INT NOT NULL,
  poi_type TEXT NOT NULL,
  idle_duration_bonus FLOAT DEFAULT 1.5,
  conversation_bonus FLOAT DEFAULT 0.15,
  max_occupants INT DEFAULT 3,
  topic_hints TEXT[]
);
```

### Tick architecture change
```
Current:  [1s tick] → move every agent

Proposed: [1s tick] → advance positions along current behavior path
          [5-10s behavior tick] → select new behavior for idle agents
          [heartbeat] → update user presence (client sends every 30s)
```

---

## 9. Implementation Phases

### Phase 1: Directional Wander + Idle (1–2 days)
- Replace `generateWanderPath` with heading-biased paths
- Add `idle` behavior (stop for 3–10 seconds, then re-decide)
- Add behavior state machine with `wander` and `idle` only
- **Validate**: Run on simulator, watch agents — do they look more natural?
- **Risk**: Low. Pure server-side change, no client changes needed.

### Phase 2: Social Gravity + POIs (2–3 days)
- Add `drift_social` behavior (move toward clusters)
- Define POI cells from existing map
- Add `drift_poi` behavior
- Add `retreat` behavior
- **Validate**: Do agents naturally gather and disperse? Do POIs create gathering spots?

### Phase 3: Intentional Approach + Conversation (2–3 days)
- Replace adjacent auto-chat with proximity-based approach probability
- Implement approach → greet → chat flow
- Add impression history to approach scoring
- Add conversation length scaling by impression
- **Validate**: Do conversations feel organic? Is frequency right?

### Phase 4: Presence Tracking (1–2 days)
- Client heartbeat every 30 seconds
- Server-side presence state machine
- Enforce offline conversation limits
- Push notification hooks (narrative framing)
- **Validate**: Offline Ka behaves correctly. Notifications feel right.

### Phase 5: User Tap Control (2–3 days)
- Tap cell → A* pathfinding → move Ka
- Tap character → approach + initiate
- Tap conversation → expand/read
- Return-from-absence recap overlay
- **Validate**: Does minimal control feel good? Or does "just watching" feel better?

### Phase 6: Polish & Tuning (ongoing)
- Tune all probability parameters
- Add idle animation variants
- Conversation echo traces
- Active area / density zones
- A/B test notification strategies

---

## 10. Open Questions

1. **Grid density**: 96x64 with 10–15 agents is sparse. Should we define a ~30x20 "town center" where agents preferentially spawn? Or shrink the whole grid?

2. **Ba takeover mid-conversation**: When an online user opens the app and their Ka is mid-conversation, can they "step in" as Ba? How does the transition feel to the other party? (They shouldn't notice — the Ka→Ba handoff should be seamless.)

3. **Conversation decline mechanic**: Should Ka agents sometimes decline approaches? This adds realism but might frustrate users who tap a character expecting a conversation. Compromise: Ka never declines user-initiated approaches, only Ka-auto approaches.

4. **Mutual approach**: If both agents decide to approach each other simultaneously, they should meet in the middle (both walk toward each other). This would look natural and emotionally resonant.

5. **Time-of-day behavior**: Animal Crossing villagers have wake/sleep schedules. Should Ka agents have activity patterns tied to their human's timezone? (e.g., more idle at night, more social during day)

6. **"Calling" someone**: Should users be able to actively seek out a specific person? This breaks organic serendipity but may be needed for utility. Compromise: users can set a "preference" that makes their Ka more likely to drift toward a specific person, but it's not guaranteed.

---

## Appendix: Research Sources

### Movement & Virtual Worlds
- Craig Reynolds — Boids (1986), Steering Behaviors for Autonomous Characters (1999)
- Gather.town — 3-tile activation distance, fade-based proximity audio
- Animal Crossing — 8 personality types × hobby system, schedule-based routines
- Journey / Sky: Children of the Light — anonymous encounters, "slow down to socialize"
- Kind Words — anonymous one-off letters, no metrics, 98% positive

### AI Agent Simulation
- Park et al. — "Generative Agents" (Stanford/Google, 2023): memory retrieval scored by recency (decay 0.995/hr) + importance (1-10) + relevance (cosine similarity). Reflection triggers at importance sum > 150.
- AI Town (a16z/Convex) — 60 ticks/second, RTS-style pathfinding, conversation flow (start → accept/reject → leave)
- The Sims — utility-based autonomy, 8 needs (-100 to +100), Smart Objects advertise, intentional randomization in selection
- Google DeepMind Concordia — component-based agent architecture, Game Master resolves actions

### Presence & Social Design
- ACM CHI 2020 — Online Status Indicators create surveillance anxiety
- Neko Atsume — progress only happens offline, variable ratio reinforcement
- Tamagotchi — persistent digital entity, avoid punitive model
- StreetPass — passive social mechanics, serendipitous encounters
- Lostgarden — Dunbar's layers (5/15/50/150), friendship formation ingredients (proximity + similarity + reciprocity + disclosure)
- Dark Souls — asynchronous ghost traces create populated feeling
- Death Stranding — shared infrastructure, async collaboration

### Notification & Retention
- Duolingo — bandit algorithm for notification timing, streak system (+60% commitment)
- Push notification research — 1 notification in first 90 days = +147% retention; 5+/week = 64% uninstall rate
