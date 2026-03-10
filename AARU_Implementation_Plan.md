# AARU — Implementation Plan
### POC Build: 4 Weeks to Shippable

---

## Guiding Principles

- **Server authoritative.** All game state lives on the server. The iOS client is a pure renderer.
- **Isolated modules.** Movement logic, conversation logic, and impression logic are independent functions. Each can be swapped without touching the others.
- **No login wall.** Device UUID auth for POC. Apple ID added later.
- **Cost discipline.** Groq for all LLM inference. Rate limits enforced from day one.
- **Transparency always.** Every message labeled 🤖 or 👤 from the first line of code.

---

## Stack

| Layer | Technology |
|-------|-----------|
| iOS Client | SpriteKit (world) + SwiftUI (UI) + Combine (state) |
| Realtime | Supabase Realtime (websocket) |
| Database | Supabase Postgres |
| Backend Logic | Supabase Edge Functions (Deno) |
| Cron | Supabase pg_cron |
| LLM — Ka convos | Groq, Llama 3.1 8B |
| LLM — Eval + Soul gen | Groq, Llama 3.3 70B |
| News | NewsAPI.org (free tier) |
| Push notifications | Apple Push Notification Service |

---

## Phase 0 — Project Setup
**Duration:** Day 1–2

### Tasks
- Initialize Xcode project (iOS 17+, Swift)
- Set up Supabase project — Postgres, Edge Functions, Realtime enabled
- Run initial schema migrations (all tables)
- Configure Groq API key in Edge Function secrets
- Configure NewsAPI key in Edge Function secrets
- Set up APNS certificates for push notifications
- Create device UUID generation and Keychain persistence utility in Swift

### Acceptance Criteria
- [ ] App launches on simulator with no errors
- [ ] Device UUID generated on first launch, persists across relaunches
- [ ] Supabase client initialized in app, can write a test row to `users` table
- [ ] Edge Function `ping` deploys and returns 200
- [ ] Schema validated: all tables exist with correct columns and types

---

## Phase 1 — Soul Profile & Onboarding
**Duration:** Days 3–7

### Tasks
- Build onboarding UI (3 screens: input method selection, input screen, review/edit screen)
- Implement audio recording (AVFoundation) and transcription (Whisper via Groq)
- Build `generate-soul-profile` Edge Function — takes raw text, calls Groq 70B, returns structured JSON
- Display generated profile with "We guessed this" markers on AI-filled fields
- Allow inline editing of all Soul Profile fields before saving
- Persist Soul Profile to `soul_profiles` table

### Soul Profile Structure
```
{
  personality: string,
  interests: string[],
  values: string[],
  avoid_topics: string[],
  raw_input: string
}
```

### Minimum Bar Rule
If raw input is fewer than ~50 words, AI generates plausible fill-ins. Generated fields are marked. User is never blocked from proceeding.

### Acceptance Criteria
- [ ] User can record audio → transcript appears in text field
- [ ] User can type or paste text directly
- [ ] Submitting any input calls `generate-soul-profile` and returns a valid Soul Profile JSON
- [ ] Generated fields are visually marked as AI-guessed
- [ ] User can edit any field inline
- [ ] Tapping Save persists profile to Supabase and advances to avatar editor
- [ ] If user skips or provides minimal input, AI-generated profile is still produced and marked
- [ ] Re-record and re-generate flow works from Ka Settings screen

---

## Phase 2 — Avatar Editor
**Duration:** Days 8–10

### Tasks
- Source LPC (Liberated Pixel Cup) CC-licensed sprite sheets
- Build layered sprite composer (Body → Skin → Hair → Eyes → Outfit → Accessory → Aura ring)
- Build avatar editor SwiftUI screen with category tabs and swatch selectors
- Implement Randomize button
- Persist avatar config to `avatars` table
- Render composed avatar sprite for use in SpriteKit world

### Avatar Layers
| Layer | Options |
|-------|---------|
| Body shape | 3 |
| Skin tone | 8 swatches |
| Hair style × color | 12 styles × 10 colors |
| Eyes | 8 styles |
| Outfit top | 10 |
| Outfit bottom | 8 |
| Accessory | Optional (hat, glasses, earrings) |
| Aura ring | Dynamic color — set at runtime |

### Acceptance Criteria
- [ ] All 7 layer categories render correctly in the editor preview
- [ ] Selecting any option updates the preview in real time
- [ ] Randomize generates a valid, visually coherent avatar
- [ ] Avatar config saves to Supabase
- [ ] Composed avatar sprite renders correctly in SpriteKit at world scale
- [ ] User's avatar has a persistent gold ring to distinguish it in the world

---

## Phase 3 — World Rendering
**Duration:** Days 11–15

### Tasks
- Build SpriteKit `WorldScene` — scrollable map, user avatar always centered
- Render beach zone and coffee shop visual zone (no mechanical difference for POC)
- Implement avatar sprite rendering for all agents in the instance
- Subscribe to `agent_positions` via Supabase Realtime
- Animate each avatar to server-provided position using `SKAction.move(to:, duration: 0.5)`
- Render chat bubble above avatar showing last 6 words of active conversation
- Build bottom tab bar: World / Convos / Me
- Seed instance with 30 NPC agents (pre-written Soul Profiles, random avatars)

### Server Tick Contract
```
Client receives per tick (500ms):
{
  user_id: uuid,
  x: float (0.0–1.0),
  y: float (0.0–1.0),
  target_x: float,
  target_y: float,
  state: "wandering" | "chatting" | "cooldown",
  active_message: string | null  // last message for bubble
}
```

Client does NOT compute positions. It only animates to what the server sends.

### Acceptance Criteria
- [ ] World renders on screen with scrolling, user avatar centered
- [ ] At least 30 avatars visible (NPCs) wandering the world
- [ ] Avatars animate smoothly to new positions each tick (no snapping)
- [ ] Chat bubble appears above chatting avatars with truncated message
- [ ] Chat bubble disappears when conversation ends
- [ ] World instance counter shows correct count (e.g. 👥 34/100)
- [ ] Tapping another avatar shows a bottom sheet with name and impression (if any)
- [ ] Bottom tab bar navigates between World, Convos, and Me screens

---

## Phase 4 — Ka Movement Engine
**Duration:** Days 16–19

### Tasks
- Build `world-tick` Edge Function — the isolated movement module
- Implement Ka state machine: WANDERING → APPROACHING → CHATTING → COOLDOWN
- Random target selection for wandering agents
- Discrete grid occupancy — exactly one Ka per cell
- Conversation initiation only from one of the 8 neighboring cells
- Conversation initiation: lock both positions in their cells, set state to CHATTING, create `conversations` row
- Cooldown: 10-second timer after conversation ends, then resume wandering
- One conversation at a time — busy signal diverts approaching agents
- Configure pg_cron: 500ms tick for online instances, 5s for offline

### Movement Parameters
```
Coordinate system:    normalized float 0.0–1.0, snapped to grid
Grid occupancy:       1 Ka per cell
Conversation range:   8 neighboring cells only
Cooldown duration:    10 seconds
```

### Acceptance Criteria
- [ ] Agents wander continuously, picking new random targets after arrival
- [ ] Two idle agents in neighboring cells initiate a conversation
- [ ] No two agents occupy the same cell at the same time
- [ ] Both agents stop and face each other during CHATTING state
- [ ] Attempting to initiate with a CHATTING agent is correctly rejected
- [ ] Cooldown of 10 seconds observed before agent resumes wandering
- [ ] world-tick function is a self-contained module with no dependencies on conversation or impression logic
- [ ] pg_cron runs at correct intervals for online and offline instances
- [ ] Positions broadcast to all clients in instance via Supabase Realtime

---

## Phase 5 — Ka Conversation Engine
**Duration:** Days 20–23

### Tasks
- Build `ka-converse` Edge Function
- Build Ka system prompt from Soul Profile (never shares profile with other Ka)
- Inject current news awareness into system prompt
- Call Groq 8B with conversation history, write response to `messages` table
- Message type always set to `ka_generated`
- Build `end-conversation` Edge Function — detects natural end or entropy drop
- Build `fetch-news` Edge Function — cron every 6h, fetches and summarizes per interest topic
- Build Conversation Detail screen — Ka Tab with live message updates

### Ka Prompt Architecture
```
SYSTEM (private):
  You are [Name]'s Ka.
  Personality: [soul_profile.personality]
  Interests: [soul_profile.interests]
  Avoid: [soul_profile.avoid_topics]
  Current awareness: [news snippets]
  You only know what the other person has said in conversation.
  You do not know their soul profile.

MESSAGES:
  [conversation history — shared transcript only]
```

### Acceptance Criteria
- [ ] Two Ka agents hold a coherent multi-turn conversation via Groq 8B
- [ ] Personality from Soul Profile is clearly reflected in Ka's tone and interests
- [ ] Neither Ka references information that should only be in the other's Soul Profile
- [ ] News topics surface naturally in conversations (not forced)
- [ ] All Ka messages written to `messages` table with type: `ka_generated`
- [ ] Conversation ends gracefully when entropy is detected or message limit reached (offline)
- [ ] News fetch cron runs every 6h and populates `news_items` per interest topic
- [ ] Ka Tab in Conversation Detail shows live messages as they are generated
- [ ] Messages labeled 🤖 throughout the UI

---

## Phase 6 — Impression Engine
**Duration:** Days 24–26

### Tasks
- Build directional impression evaluation
- Evaluator receives both Soul Profiles + full transcript — calls Groq 70B
- Returns `{ score: 0–100, summary: "2-sentence explanation" }`
- Run evaluator every 5 messages in a conversation
- Accumulate score across multiple conversations between the same two users
- Update `conversations.impression_score` and `impression_summary`
- Surface impression score and summary in Conversations inbox
- Show impression on avatar bottom sheet (only after first conversation)
- Show unlock progress bar in inbox (Ka ────●──── Ba)

### Evaluator Prompt
```
SYSTEM:
  You evaluate directional impression between two people based on their soul profiles
  and a conversation they had. Output only valid JSON.
  { "score": 0-100, "summary": "2 sentences max" }

USER:
  Soul A: [full soul profile]
  Soul B: [full soul profile]
  Transcript: [full conversation]
```

### Acceptance Criteria
- [ ] Evaluator runs after every 5th message in a conversation
- [ ] Returns valid JSON with score and summary on every call
- [ ] Score accumulates correctly across multiple conversations (does not reset)
- [ ] Impression summary is readable and meaningful (not generic)
- [ ] Score and summary visible in Conversations inbox
- [ ] Impression shown on avatar bottom sheet after at least one conversation
- [ ] Unlock progress bar in inbox reflects current score visually

---

## Phase 7 — Ba Unlock & Human Interaction
**Duration:** Days 27–29

### Tasks
- Implement directional Ba unlock threshold check in the impression engine
- Build `notify-ba-unlock` Edge Function — sends iOS push to both users
- Build Ba Tab in Conversation Detail — locked/grayed until threshold, unlocks on push
- Ba messages written to `messages` table with type: `human_typed`
- User can type into Ka Tab to join active Ka conversation — message appears inline labeled 👤
- Ka continues its own conversation independently when user joins
- Ba Tab only accessible from Conversations inbox (not from world view)

### Acceptance Criteria
- [ ] Ba Tab is visible but locked until the other person's impression crosses threshold
- [ ] When threshold is met, the newly allowed side receives iOS push notification
- [ ] Ba Tab unlocks immediately upon push receipt (or on next app open)
- [ ] User can type in Ba Tab — messages send and appear labeled 👤
- [ ] Other user's Ba responses appear labeled 👤
- [ ] User can type in Ka Tab to join Ka conversation — message appears inline, labeled 👤
- [ ] Ka continues generating responses independently after user joins Ka tab
- [ ] No path exists to reach Ba Tab from the world view — inbox only
- [ ] Ba-generated messages are never labeled 🤖 under any condition

---

## Phase 8 — Offline Ka Loop & NPC Population
**Duration:** Day 30

### Tasks
- Verify offline Ka loop runs correctly under pg_cron at 5s tick rate
- Enforce offline limits: 10 convos/day, 20 messages/convo per Ka
- Confirm NPC agents participate in conversations with real users and each other
- NPC Ba tab permanently locked and labeled "AI Resident"
- Final end-to-end test: user goes offline, Ka has conversations, user returns and sees results

### Acceptance Criteria
- [ ] Offline Ka wanders and initiates conversations without user present
- [ ] Daily conversation and message limits enforced for offline Kas
- [ ] NPC agents converse naturally with real user Kas
- [ ] NPC Ba tab shows "AI Resident" label and is permanently locked
- [ ] User logs in after being offline and sees new conversations, updated impression scores, and Ba unlock notifications if applicable
- [ ] No orphaned conversations or stuck agent states after 24h offline simulation

---

## Full Acceptance Criteria — POC Shippable

The POC is shippable when all of the following are true:

### Core Loop
- [ ] New user can complete onboarding (Soul Profile + Avatar) in under 5 minutes
- [ ] Ka agent appears in the world and begins wandering within 30 seconds of onboarding
- [ ] Two Ka agents meet, have a multi-turn conversation, and receive a directional impression score
- [ ] User can view the full Ka conversation with correct 🤖/👤 labels
- [ ] Ba access unlocks when the other person's impression threshold is met
- [ ] User can have a Ba conversation with a matched user
- [ ] User goes offline, Ka keeps running, user returns to new activity

### World
- [ ] World renders with at least 30 agents (NPCs + real users)
- [ ] Avatars wander, stop to chat, resume — visibly smooth
- [ ] Chat bubbles appear and disappear correctly
- [ ] World scrolls with user avatar centered

### Reliability
- [ ] No stuck agents (state machine handles all edge cases)
- [ ] No conversation orphans after app crash or disconnect
- [ ] Realtime reconnects gracefully after network interruption

### Cost
- [ ] LLM spend is rate-limited and does not exceed $10/day at 100 users

---

## Post-POC Roadmap

| Priority | Feature |
|----------|---------|
| High | Sign in with Apple (multi-device sync) |
| High | Ka memory — agents remember past conversations |
| Medium | Multiple world themes |
| Medium | World travel between instances |
| Medium | Richer avatar animations (walk cycles, idle, emotions) |
| Medium | Smarter wandering — social gravity toward compatible agents |
| Low | Premium tier — stronger LLM model for Ka |
| Low | Akh achievement — visual celebration on full connection |
| Low | Interest-based world zones (e.g. a "tech" coffee shop vs "art" beach) |
