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
│  │  │  Conversation    │ │  Soul File         │  │ │
│  │  │  (streaming chat)│ │  (7-section view)  │  │ │
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
│  │  soul-converse (SSE) │  │  device_sessions    │ │
│  │  get-soul-file       │  │  soul_messages      │ │
│  │  end-soul-session*   │  │  visible_soul_files │ │
│  │  synthesize-soul-file│  │  hidden_soul_files  │ │
│  │  generate-reengagement│ │                     │ │
│  │  delete-account      │  │                     │ │
│  └──────────┬───────────┘  └────────────────────┘ │
└─────────────┼────────────────────────────────────────┘
              │              * deprecated no-op
    ┌─────────┴──────────┐
    ▼                    ▼
┌────────┐        ┌───────────┐
│ Claude │        │  Claude   │
│ Opus 4 │        │ Haiku 4.5 │
│(convo, │        │(reflection│
│ synth) │        │ re-engage)│
└────────┘        └───────────┘
```

## Stack

| Layer | Technology |
|-------|-----------|
| iOS Client | SwiftUI + Combine, iOS 17+, Swift 5.10 |
| Backend | Cloudflare Workers (V8), Neon Postgres |
| Domain Logic | TypeScript (`src/domain/`), Zod validation |
| Soul Mirror LLM | Claude Opus 4 (conversation + synthesis) |
| Extraction LLM | Claude Haiku 4.5 (reflection + re-engagement) |
| Tests | Vitest (75 TS tests), XCTest (Swift) |
| Package Manager | pnpm (TS), XcodeGen + SPM (iOS) |

---

## Directory Structure

```
thumos/
├── src/domain/              # Pure TypeScript domain logic
│   ├── constants.ts         # SOFT_SESSION_GAP_MS
│   ├── schemas.ts           # Zod validation schemas
│   ├── soul.ts              # Soul Mirror prompts + conversation logic
│   ├── soulFile.ts          # Soul file extraction, 4-expert synthesis, merging
│   └── reengagement.ts      # Personalized re-engagement question generation
├── src/lib/                 # Utilities (env, http)
├── workers/src/             # Cloudflare Workers API
│   ├── index.ts             # Raw fetch() router
│   ├── env.ts               # Env interface
│   ├── db.ts                # Neon serverless driver + user/session CRUD
│   ├── auth.ts              # HMAC SHA-256 session tokens
│   ├── claude.ts            # Anthropic API wrapper (streaming + completion)
│   ├── soulApp.ts           # Soul message CRUD + synthesis logic
│   ├── edge.ts              # CORS + SSE headers + error handling
│   └── handlers/
│       ├── bootstrap-soul.ts       # User bootstrap + device session creation
│       ├── soul-converse.ts        # SSE streaming soul conversations
│       ├── get-soul-file.ts        # Fetch visible soul file
│       ├── end-soul-session.ts     # Deprecated no-op (backward compat)
│       ├── synthesize-soul-file.ts # Full 4-expert soul file synthesis
│       ├── generate-reengagement.ts # On-demand Haiku re-engagement question
│       ├── delete-account.ts       # Cascade delete user
│       ├── get-debug-info.ts       # Debug endpoint
│       └── ping.ts, version.ts     # Health check + version gate
├── supabase/migrations/     # Postgres migration SQL (run manually against Neon)
├── Thumos/                  # iOS client
│   └── App/
│       ├── ThumosApp.swift              # Entry point
│       ├── AppModel.swift               # @MainActor state manager + reengagement
│       ├── Models.swift                 # Codable data types
│       ├── BackendClient.swift          # HTTP + SSE client + fallback mode
│       ├── NotificationManager.swift    # Local notification scheduling
│       ├── RootView.swift               # → SoulMirrorTabView
│       ├── SoulMirrorTabView.swift      # Tab container (Conversation + Soul File)
│       ├── SoulConversationScreen.swift # Streaming chat UI
│       ├── SoulFileScreen.swift         # 7-section soul file display
│       └── SecureStore.swift            # Keychain wrapper
├── ThumosTests/             # XCTest unit tests
├── tests/
│   ├── unit/                # Domain logic tests (75 tests)
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
  │ id, device_id, display_name, last_active_at, reflection_note (JSONB)
  │
  ├──▶ device_sessions
  │      id, user_id, device_id, token_hash, expires_at
  │
  ├──▶ soul_messages
  │      id, user_id, role (user/assistant), content, created_at
  │
  ├──▶ visible_soul_files (user-facing, "accurate and loving")
  │      user_id (PK), version, last_updated
  │      portrait (2-4 sentence novel-like description)
  │      sections: {howYouMove, howYouThink, howYouConnect,
  │                 whatYouCarry, whatLightsYouUp, yourContradictions, yourVoice}
  │      crystallized_moments: [{quote, reflection}]
  │      open_threads: [string]
  │
  └──▶ hidden_soul_files (agent-facing, clinical)
         user_id (PK), version, last_updated
         confidence (low|medium|high)
         expert_reflections: {psychologist, sociologist, linguist, narrativeAnalyst}
         coreDrivers: [{name, strength 0-1, inferred, evidence}]
         coreValues, voice, depthMap, analystNotes
```

Messages belong directly to users — no session grouping. The conversation is continuous and unbounded.

---

## Design Principle: Sessions Are Invisible

Sessions are an **implementation detail**, not a user-facing concept. The user should never see "Start Session", "End Session", session numbers, or cooldown timers. The conversation feels continuous and unbounded — like journaling, not a therapy appointment.

- **No explicit session boundaries in the UI.** The conversation is one continuous stream.
- **AI suggests breaks.** When the conversation reaches a natural resting point, the AI gently suggests the user take a break ("That's a lot to sit with. Take your time — I'll be here."). The user can ignore this and keep going.
- **Synthesis happens on demand.** Soul file updates are triggered by the user (via synthesize-soul-file), not at session boundaries.

---

## Data Flow: Soul Conversation

```
App opens → RootView → SoulMirrorTabView
  │
  ├─ .task { bootstrapSoul() }
  │    POST /bootstrap-soul {device_id}
  │    → Returns: userId, token, visibleSoulFile, recent messages
  │
  ├─ If returning user with no active conversation:
  │    POST /generate-reengagement
  │    → Haiku-generated personalized question shown as AI's opening
  │
  ▼
User types message → sendSoulMessage(text)
  │
  ▼
POST /soul-converse (SSE streaming)
  │
  ├─ Auth: validate x-thumos-session token
  ├─ Save user message to soul_messages
  │
  ├─ Build context:
  │   {visibleSoulFile, hiddenSoulFile, reflectionNote,
  │    recentMessages (last 10), steering (from depthMap)}
  │
  ├─ buildSoulSystemPrompt(context)
  │   "You are a mirror... notice contradictions...
  │    quote the user back... 2-4 sentences..."
  │   Includes <<<MEMORY>>> section for inline reflection updates
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
  │
  └─ If <<<MEMORY>>> marker found in response:
       Parse reflection note → upsert to users.reflection_note
```

### Full Synthesis (user-triggered)

```
POST /synthesize-soul-file
  │
  ├─ Fetch ALL messages for user
  │
  ├─ buildSoulSynthesisPrompt() → Claude Opus 4 (8192 tokens)
  │   4-pass expert analysis:
  │     1. Psychologist — attachment patterns, defense mechanisms, growth edges
  │     2. Sociologist — social positioning, identity signals, cultural context
  │     3. Linguist — speech patterns, vocabulary density, hedging/humor
  │     4. Narrative Analyst — story arcs, metaphors, what's unsaid
  │
  ├─ Output: VisibleSoulFile + HiddenSoulFile separated by <<<SPLIT>>>
  │
  ├─ mergeVisibleSoulFile() — user-facing, "accurate and loving"
  ├─ mergeHiddenSoulFile() — agent-facing, clinical
  │
  └─ Upsert both to database
```

---

## iOS Client Architecture

### Navigation

```
ThumosApp
  └─ RootView
       └─ SoulMirrorTabView
            ├─ Tab 0: SoulConversationScreen (streaming chat)
            └─ Tab 1: SoulFileScreen (7-section display)
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
| Soul conversation | Claude | Opus 4 | SSE | 1024 | Deterministic reflection prompts |
| Inline reflection | Claude | Opus 4 | SSE (hidden) | part of convo | Skip reflection |
| Full synthesis | Claude | Opus 4 | No | 8192 | Skip synthesis |
| Re-engagement | Claude | Haiku 4.5 | No | 256 | 12 fallback questions |

All LLM calls have deterministic fallbacks. Tests pass without API keys.

---

## Testing

```bash
# TypeScript (75 tests, no API keys needed)
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

Active endpoints: ping, version, bootstrap-soul, soul-converse, get-soul-file, end-soul-session, synthesize-soul-file, generate-reengagement, delete-account, get-debug-info

### Required Secrets

| Secret | Used By |
|--------|---------|
| ANTHROPIC_API_KEY | claude.ts (Soul Mirror) |
| THUMOS_SESSION_SECRET | auth.ts (HMAC signing) |
| DATABASE_URL | db.ts (Neon Postgres) |

### iOS → XcodeGen

```bash
xcodegen generate        # Regenerate .xcodeproj from project.yml
```
