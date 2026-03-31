# Thumos Architecture

## Overview

Thumos is a soul-based social app. Phase 1 (current) focuses on **Soul Mirror** — reflective AI conversations that build a living "soul file" portrait of the user.

```
┌──────────────────────────────────────────────────┐
│                   iOS Client                      │
│            SwiftUI + Combine, iOS 17+             │
│                                                   │
│  ┌──────────────────────────────────────────────┐ │
│  │          SoulMirrorTabView                    │ │
│  │  ┌─────────────────┐ ┌────────────────────┐  │ │
│  │  │  Conversation    │ │  Soul Dashboard    │  │ │
│  │  │  (streaming chat)│ │  (dashboard-v2)    │  │ │
│  │  └────────┬─────────┘ └──────────┬─────────┘  │ │
│  └───────────┼──────────────────────┼────────────┘ │
│  ┌───────────┴──────────────────────┴────────────┐ │
│  │          AppModel (@MainActor)                 │ │
│  │  BackendClient  │  SecureStore                 │ │
│  └────────┬────────┴─────────────────────────────┘ │
└───────────┼──────────────────────────────────────────┘
            │ HTTPS + SSE
            ▼
┌──────────────────────────────────────────────────┐
│            Cloudflare Workers (V8)                │
│                                                   │
│  ┌─────────────────────┐  ┌────────────────────┐ │
│  │   Route Handlers     │  │   Neon Postgres     │ │
│  │                      │  │                     │ │
│  │  bootstrap-soul      │  │  users              │ │
│  │  sync-messages       │  │  device_sessions    │ │
│  │  soul-converse (SSE) │  │  soul_messages      │ │
│  │  get-soul-file       │  │  reflection_snapshots│ │
│  │  debug-dump          │  │  visible_soul_files │ │
│  │  delete-account      │  │  hidden_soul_files  │ │
│  └──────────┬───────────┘  │  claude_debug_traces│ │
│             │              └────────────────────┘ │
│             ▼                                      │
│       Cloudflare Queue                             │
│   (reflection snapshots + synthesis)              │
└─────────────┼────────────────────────────────────────┘
              │
    ┌─────────┴──────────┐
    ▼                    ▼
┌────────┐        ┌───────────┐
│ Claude │        │  Claude   │
│ Opus 4 │        │ Haiku 4.5 │
│(convo, │        │(reflection│
│ assess,│        │ snapshots,│
│ visible)│        │ hidden)   │
└────────┘        └───────────┘
```

## Stack

| Layer | Technology |
|-------|-----------|
| iOS Client | SwiftUI + Combine, iOS 17+, Swift 5.10 |
| Backend | Cloudflare Workers (V8), Neon Postgres |
| Domain Logic | TypeScript (`src/domain/`), Zod validation |
| Soul Mirror LLM | Claude Opus 4 (conversation + assessment + visible narrative) |
| Extraction LLM | Claude Haiku 4.5 (reflection snapshots + hidden clinical profile) |
| Tests | Vitest, XCTest |
| Package Manager | pnpm (TS), XcodeGen + SPM (iOS) |

---

## Directory Structure

```
thumos/
├── src/domain/              # Pure TypeScript domain logic
│   ├── schemas.ts           # Zod validation schemas
│   ├── soul.ts              # Soul Mirror prompts + opening flow + steering
│   └── soulFile.ts          # Reflection prompts + dashboard-v2 synthesis pipeline + merging
├── src/lib/                 # Utilities (http)
├── db/                      # Neon schema + SQL migrations
│   ├── schema.sql           # Current schema snapshot
│   └── migrations/          # Ordered schema changes
├── workers/src/             # Cloudflare Workers API
│   ├── index.ts             # Raw fetch() router
│   ├── env.ts               # Env interface
│   ├── db.ts                # Neon serverless driver + user/session CRUD
│   ├── auth.ts              # HMAC SHA-256 session tokens
│   ├── claude.ts            # Anthropic API wrapper (streaming + completion)
│   ├── soulApp.ts           # Soul message CRUD + reflection/synthesis logic
│   ├── backgroundJobsQueue.ts # Queue producer/consumer helpers
│   ├── debugTraces.ts       # Last-3 Claude traces per user/kind
│   ├── edge.ts              # CORS + SSE headers + error handling
│   └── handlers/
│       ├── bootstrap-soul.ts       # User bootstrap + device session creation
│       ├── sync-messages.ts        # Full canonical transcript sync
│       ├── soul-converse.ts        # SSE streaming soul conversations + opening mode
│       ├── get-soul-file.ts        # Fetch soul file + trigger async synthesis
│       ├── debug-dump.ts           # Raw debug state + latest Claude traces
│       ├── delete-account.ts       # Cascade delete user
│       ├── get-debug-info.ts       # Debug endpoint
│       └── ping.ts, version.ts     # Health check + version gate
├── Thumos/                  # iOS client
│   └── App/
│       ├── ThumosApp.swift              # Entry point
│       ├── AppModel.swift               # @MainActor state manager + transcript sync
│       ├── Models.swift                 # Codable data types
│       ├── BackendClient.swift          # HTTP + SSE client + fallback mode
│       ├── NotificationManager.swift    # Local notification scheduling
│       ├── RootView.swift               # → SoulMirrorTabView
│       ├── SoulMirrorTabView.swift      # Tab container (Conversation + Soul File)
│       ├── SoulConversationScreen.swift # Streaming chat UI
│       ├── SoulFileScreen.swift         # Dashboard-v2 soul file display
│       ├── SoulCompassView.swift        # Tappable compass with axis detail
│       ├── PersonalitySpectrumView.swift# Dashboard-v2 spectrum bars
│       ├── TopValuesView.swift          # Top value pills
│       └── SecureStore.swift            # Keychain wrapper
├── ThumosTests/             # XCTest unit tests
├── tests/
│   ├── unit/                # Domain logic tests
│   └── integration/         # Handler tests
├── VISION.md                # Product vision (human-only, immutable)
├── CLAUDE.md                # Claude Code operating rules
├── ARCHITECTURE.md          # This file
└── project.yml              # XcodeGen project definition
```

---

## Database Schema

```
users
  │ id, device_id, display_name, last_active_at
  │
  ├──▶ device_sessions
  │      id, user_id, device_id, token_hash, expires_at
  │
  ├──▶ soul_messages
  │      id, user_id, role (user/assistant), content, created_at
  │
  ├──▶ reflection_snapshots
  │      user_id (PK), through_message_count, through_last_message_created_at
  │      note (JSONB), status (ready|pending|failed), started_at, last_error
  │
  ├──▶ visible_soul_files (user-facing, "accurate and loving")
  │      user_id (PK), version, last_updated
  │      status (ready|pending|failed), synthesis_started_at
  │      portrait (2-4 sentence novel-like description)
  │      sections: {howYouMove, howYouThink, howYouConnect,
  │                 whatYouCarry, whatLightsYouUp, yourContradictions, yourVoice}
  │      crystallized_moments: [{quote, reflection}]
  │      open_threads: [string]
  │      compass_scores: {axis: score|null}
  │      personality_spectrum: {trait: {position, label, evidence}}
  │      top_values: [{value, description}]
  │      relational_style: text|null
  │
  └──▶ hidden_soul_files (agent-facing, clinical)
         user_id (PK), version, last_updated
         status (ready|pending|failed), synthesis_started_at
         confidence (low|medium|high)
         expert_reflections: {psychologist, sociologist, linguist, narrativeAnalyst}
         coreDrivers: [{driver, strength 0-1, inferred, evidence}]
         coreValues, voice, depthMap, analystNotes
         big_five_scores, schwartz_profile, attachment_scores
         moral_foundations, meaning_orientation
  │
  └──▶ claude_debug_traces
         id, user_id, trace_kind (conversation|synthesis|reflection)
         model, system_prompt, input_messages, raw_response, meta, created_at
```

Messages belong directly to users — no session grouping. The conversation is continuous and unbounded.

---

## Design Principle: Sessions Are Invisible

Sessions are an **implementation detail**, not a user-facing concept. The user should never see "Start Session", "End Session", session numbers, or cooldown timers. The conversation feels continuous and unbounded — like journaling, not a therapy appointment.

- **No explicit session boundaries in the UI.** The conversation is one continuous stream.
- **AI suggests breaks.** When the conversation reaches a natural resting point, the AI gently suggests the user take a break ("That's a lot to sit with. Take your time — I'll be here."). The user can ignore this and keep going.
- **Synthesis is async.** When `/get-soul-file` detects new messages, it atomically claims pending synthesis, enqueues a Cloudflare Queue job, and returns the existing soul file immediately. The next poll picks up the result.

---

## Data Flow: Soul Conversation

```
App opens → RootView → SoulMirrorTabView
  │
  ├─ .task { bootstrapSoul() }
  │    POST /bootstrap-soul {device_id}
  │    → Returns: userId, token, visibleSoulFile, hasMessages
  │
  ├─ POST /sync-messages
  │    → Returns full canonical transcript from soul_messages
  │
  ├─ If conversation should resume:
  │    POST /soul-converse {"mode":"opening"}
  │    → Server generates and persists the assistant opener
  │
  ▼
User types message → sendSoulMessage(text)
  │
  ▼
POST /soul-converse (SSE streaming)
  │
  ├─ Auth: validate x-thumos-session token
  ├─ For `mode: "reply"`: save user message to soul_messages
  ├─ For `mode: "opening"`:
  │    - first ever opener if no messages exist
  │    - resume-after-gap opener if last message is older than 1 hour
  │    - otherwise continue the existing thread naturally
  │
  ├─ Build context:
  │   {visibleSoulFile, latestReflectionSnapshot, allPersistedMessages, steering}
  │
  ├─ buildSoulSystemPrompt(context)
  │   - full transcript is authoritative
  │   - latest reflection snapshot is optional advisory context
  │   - visible soul file context is available when present
  │   - explicit anti-repeat rules
  │   - opening instructions when applicable
  │   - optional current-events context via xAI when opening after a gap
  │
  ├─ streamClaude(prompt, messages)
  │   │ Claude Opus 4, maxTokens: 1024, temp: 0.8
  │   │ Retry once on failure, then deterministic fallback
  │   ▼
  │   SSE events → iOS client:
  │     event: token    data: {"text": "..."}
  │     → soulStreamingText += token (real-time)
  │
  ├─ Save assistant message
  ├─ Record latest conversation Claude trace
  └─ If transcript crossed a 10-message boundary:
       enqueue async reflection snapshot job

Prompt files to inspect directly:
- `src/domain/soul.ts` — main conversation system prompt, opening flow, steering logic, anti-repeat rules
- `src/domain/soulFile.ts` — reflection snapshot prompt + assessment/visible/hidden synthesis prompts
```

### Background Jobs (queue-backed)

```
GET /get-soul-file
  │
  ├─ Return existing visible soul file immediately
  │
  ├─ checkSynthesisNeeded() — are there new messages since last synthesis?
  │   Also checks: ≥3 user messages, no stale pending (>15 min = failed),
  │   and no automatic retry after a failed synthesis unless newer messages arrived
  │
  ├─ If needed: markSynthesisPending() + enqueue background job
  │   Response includes synthesis_pending: true
  │
  └─ Queue consumer:
       ├─ Reflection snapshot jobs:
       │   ├─ Fetch ALL messages for user
       │   ├─ Every 10 total messages, buildReflectionPrompt()
       │   ├─ Claude Haiku 4.5
       │   └─ Upsert reflection_snapshots.note with status = 'ready'
       │
       └─ Soul synthesis jobs:
           ├─ Fetch ALL messages for user
           ├─ Load latest ready reflection snapshot
           ├─ Assessment call → Claude Opus 4
           │   Produces structured Big Five / values / attachment / moral / meaning assessment
           ├─ Visible narrative call → Claude Opus 4
           │   Produces portrait, sections, compass, spectrum, top values, relational style
           ├─ Hidden clinical call → Claude Haiku 4.5
           │   Produces expert reflections, drivers, depth map, analyst notes, hidden profiles
           ├─ mergeVisibleSoulFile() — user-facing, "accurate and loving"
           ├─ mergeHiddenSoulFile() — agent-facing, clinical
           └─ Upsert both to database with status = 'ready'
```

iOS polls `/get-soul-file` every 60s on the Soul File tab. The dashboard appears when ready — no timeout, no blocking.

---

## iOS Client Architecture

### Navigation

```
ThumosApp
  └─ RootView
       └─ SoulMirrorTabView
            ├─ Tab 0: SoulConversationScreen (streaming chat)
            └─ Tab 1: SoulFileScreen (dashboard-v2 display)
```

### State Management

`AppModel` is a single `@MainActor ObservableObject`:

```
AppModel
  ├─ @Published visibleSoulFile: VisibleSoulFile
  ├─ @Published soulMessages: [SoulMessage]
  ├─ @Published soulStreamingText: String
  ├─ @Published isSoulStreaming: Bool
  ├─ @Published isLoading: Bool
  ├─ @Published errorMessage: String?
  │
  ├─ BackendClient      HTTP POST + SSE streaming + offline fallback
  ├─ SecureStore         Keychain (device ID, session token)
  └─ NotificationManager Local notification scheduling
```

### SSE Streaming

```swift
URLSession.shared.bytes(for: request)
  │ reads line-by-line ("event: <type>\ndata: <json>")
  │
  ├─ event: token              → soulStreamingText += text
  ├─ event: error              → log error
  └─ stream ends               → finalize assistant message
```

---

## Auth Model

```
Device-based anonymous auth:

1. App generates persistent device UUID (Keychain)
2. POST /bootstrap-soul {device_id}
3. Server issues session token:
   token = userId.deviceId.issuedAt.nonce.HMAC-SHA256(secret)
   TTL = 30 days
4. Token stored in Keychain, sent as x-thumos-session header
5. On auth failure: re-bootstrap, get new token, retry
```

---

## LLM Integration

| Use Case | Provider | Model | Streaming | Tokens | Fallback |
|----------|----------|-------|-----------|--------|----------|
| Soul conversation | Claude | Opus 4 | SSE | 1024 | Deterministic reflective fallback |
| Opening current-events context | xAI | Grok 4 Fast | No | n/a | Omit current-events context |
| Reflection snapshot | Claude | Haiku 4.5 | No | 4000 | Skip snapshot |
| Synthesis assessment | Claude | Opus 4 | No | 4096 | Mark failed, keep stale soul file |
| Synthesis visible narrative | Claude | Opus 4 | No | 6144 | Mark failed, keep stale soul file |
| Synthesis hidden clinical | Claude | Haiku 4.5 | No | 6144 | Mark failed, keep stale soul file |

Conversation has a deterministic fallback. Background synthesis and reflection fail closed and preserve the last ready state. Tests pass without API keys.

---

## Testing

```bash
# TypeScript (no API keys needed for unit tests)
npx vitest run

# Type checking
npx tsc -p tsconfig.json --noEmit

# iOS build
xcodebuild build -scheme Thumos \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.1'

# iOS tests
xcodebuild test -scheme Thumos \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.1'
```

---

## Deployment

### Workers → Cloudflare

```bash
cd workers && wrangler deploy
```

Active endpoints: ping, version, bootstrap-soul, sync-messages, soul-converse, get-soul-file, delete-account, get-debug-info, debug-dump

### Required Secrets

| Secret | Used By |
|--------|---------|
| ANTHROPIC_API_KEY | claude.ts (Soul Mirror) |
| THUMOS_SESSION_SECRET | auth.ts (HMAC signing) |
| DATABASE_URL | db.ts (Neon Postgres) |
| XAI_TOKEN | xai.ts (optional opening-mode current-events context) |

### iOS → XcodeGen

```bash
xcodegen generate        # Regenerate .xcodeproj from project.yml
```
