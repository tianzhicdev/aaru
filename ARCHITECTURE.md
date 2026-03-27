# AARU Architecture

## Overview

AARU is a soul-based social app. Phase 1 (current) focuses on **Soul Mirror** — reflective AI conversations that build a living "soul file" portrait of the user. Phase 2 (future) will add social features where AI agents use soul files to find matching souls.

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
│               Supabase Platform                   │
│                                                   │
│  ┌─────────────────────┐  ┌────────────────────┐ │
│  │   Edge Functions     │  │   Postgres          │ │
│  │   (Deno runtime)     │  │                     │ │
│  │                      │  │  users              │ │
│  │  bootstrap-soul      │  │  soul_sessions      │ │
│  │  soul-converse (SSE) │  │  soul_messages      │ │
│  │  get-soul-file       │  │  soul_files         │ │
│  │  end-soul-session    │  │  visible_soul_files │ │
│  │  bootstrap-user      │  │  hidden_soul_files  │ │
│  └──────────┬───────────┘  └────────────────────┘ │
└─────────────┼────────────────────────────────────────┘
              │
    ┌─────────┴──────────┐
    ▼                    ▼
┌────────┐        ┌───────────┐
│ Claude │        │  Claude   │
│ Opus 4 │        │ Haiku 4.5 │
│(convo, │        │(periodic  │
│ synth) │        │ extract)  │
└────────┘        └───────────┘
```

## Stack

| Layer | Technology |
|-------|-----------|
| iOS Client | SwiftUI + Combine, iOS 17+, Swift 5.10 |
| Backend | Supabase Edge Functions (Deno), Postgres |
| Domain Logic | TypeScript (`src/domain/`), Zod validation |
| Soul Mirror LLM | Claude Opus 4 (conversation + synthesis) |
| Extraction LLM | Claude Haiku 4.5 (periodic reflection + light extraction) |
| Tests | Vitest (73 TS tests), XCTest (Swift) |
| Package Manager | pnpm (TS), XcodeGen + SPM (iOS) |

---

## Directory Structure

```
aaru/
├── src/domain/              # Pure TypeScript domain logic
│   ├── constants.ts         # Magic numbers (reflection interval, cooldown)
│   ├── types.ts             # Core type definitions
│   ├── schemas.ts           # Zod validation schemas
│   ├── soul.ts              # Soul Mirror prompts + session logic
│   ├── soulFile.ts          # Soul file extraction, 4-expert synthesis, merging
│   ├── world.ts             # Grid simulation (Phase 2)
│   ├── ka.ts                # Ka prompts + LLM replies (Phase 2)
│   ├── impression.ts        # Heuristic + LLM scoring (Phase 2)
│   ├── compatibility.ts     # Thin wrapper over impression (Phase 2)
│   ├── soulProfile.ts       # Profile generation + merging (Phase 2)
│   └── avatar.ts            # Deterministic avatar from seed (Phase 2)
├── src/lib/                 # Utilities (env, http)
├── supabase/
│   ├── functions/
│   │   ├── _shared/         # Shared modules
│   │   │   ├── auth.ts      # HMAC session tokens
│   │   │   ├── db.ts        # Supabase REST client
│   │   │   ├── soulApp.ts   # Soul Mirror session management + extraction
│   │   │   ├── claude.ts    # Claude streaming client
│   │   │   ├── edge.ts      # Edge Function boilerplate
│   │   │   ├── env.ts       # Environment variable accessors
│   │   │   └── contracts.ts # Zod request/response schemas
│   │   ├── bootstrap-soul/  # Soul file + session state init
│   │   ├── soul-converse/   # SSE streaming Claude conversation
│   │   ├── get-soul-file/   # Fetch visible + legacy soul files
│   │   ├── end-soul-session/# Full 4-expert synthesis
│   │   ├── bootstrap-user/  # User creation
│   │   └── ...              # Phase 2 functions (ka, world, etc.)
│   └── migrations/          # Postgres schema (11 migration files)
├── AARU/                    # iOS client
│   └── App/
│       ├── AARUApp.swift              # Entry point
│       ├── AppModel.swift             # @MainActor state manager
│       ├── Models.swift               # Codable data types
│       ├── BackendClient.swift        # HTTP + SSE client
│       ├── RootView.swift             # → SoulMirrorTabView
│       ├── SoulMirrorTabView.swift    # Tab container (Conversation + Soul File)
│       ├── SoulConversationScreen.swift # Streaming chat UI
│       ├── SoulFileScreen.swift       # 7-section soul file display
│       └── SecureStore.swift          # Keychain wrapper
├── AARUTests/               # XCTest unit tests
├── tests/
│   ├── unit/                # Domain logic tests (73 tests)
│   └── integration/         # Handler tests
├── VISION.md                # Product vision (human-only, immutable)
├── CLAUDE.md                # Claude Code operating rules
└── project.yml              # XcodeGen project definition
```

---

## Database Schema

### Soul Mirror (V2 — Active)

```
users
  │ id, device_id, display_name
  │
  ├──▶ soul_sessions
  │      id, user_id, session_number, status, exchange_count
  │      reflection_notes (JSONB), next_available_at
  │      status: in_session → extracting → synthesizing → complete | failed
  │      │
  │      └──▶ soul_messages
  │             session_id, role (user/assistant), content
  │
  ├──▶ visible_soul_files (user-facing, "accurate and loving")
  │      user_id (PK), version, last_updated
  │      portrait (2-4 sentence novel-like description)
  │      sections: {howYouMove, howYouThink, howYouConnect,
  │                 whatYouCarry, whatLightsYouUp, yourContradictions, yourVoice}
  │      crystallized_moments: [{quote, reflection}]
  │      open_threads: [string]
  │
  ├──▶ hidden_soul_files (agent-facing, clinical — Phase 2)
  │      user_id (PK), version, last_updated
  │      confidence (low|medium|high)
  │      expert_reflections: {psychologist, sociologist, linguist, narrativeAnalyst}
  │      coreDrivers: [{name, strength 0-1, inferred, evidence}]
  │      coreValues, voice, depthMap, analystNotes
  │
  └──▶ soul_files (legacy V1, kept for backward compat)
         essence, tensions[], comes_alive, running_from
         your_words[], evolution[], session_count

Other tables: device_sessions, soul_profiles, avatars,
             agent_positions, conversations, messages,
             impression_edges, ba_conversations, ba_messages,
             world_instances, news_items, job_leases
             (Phase 2 — exist but not active in current app)
```

---

## Design Principle: Sessions Are Invisible

Sessions are an **implementation detail**, not a user-facing concept. The user should never see "Start Session", "End Session", session numbers, or cooldown timers. The conversation feels continuous and unbounded — like journaling, not a therapy appointment.

- **No explicit session boundaries in the UI.** The backend creates/closes sessions silently.
- **AI suggests breaks.** When the conversation reaches a natural resting point, the AI gently suggests the user take a break ("That's a lot to sit with. Take your time — I'll be here."). The user can ignore this and keep going.
- **Synthesis happens in the background.** Soul file updates happen periodically during conversation, not at a dramatic "session end" moment.
- **Cooldowns are invisible.** If the backend needs a cooldown, the AI weaves it into the conversation naturally rather than showing a timer or error.

---

## Data Flow: Soul Mirror Session

```
App opens → RootView → SoulMirrorTabView
  │
  ├─ .task { bootstrapSoul() }
  │    POST /bootstrap-soul {device_id}
  │    → Returns: userId, token, visibleSoulFile, activeSession,
  │               canStartSession, cooldownRemainingMs
  │
  ▼
User types message → sendSoulMessage(text)
  │
  ▼
POST /soul-converse (SSE streaming)
  │
  ├─ Auth: validate x-aaru-session token
  ├─ Get or create active session
  ├─ Save user message to soul_messages
  │
  ├─ Build context:
  │   {sessionNumber, exchangeCount, visibleSoulFile,
  │    reflectionNotes, previousMessages}
  │
  ├─ buildSoulSystemPrompt(context)
  │   "You are a mirror... notice contradictions...
  │    quote the user back... 2-4 sentences..."
  │
  ├─ streamClaude(prompt, messages)
  │   │ Claude Opus 4, maxTokens: 512, temp: 0.8
  │   │ Retry once on failure, then deterministic fallback
  │   ▼
  │   SSE events → iOS client:
  │     event: token    data: {"text": "..."}
  │     → soulStreamingText += token (real-time)
  │
  ├─ Save assistant message, update exchange_count
  │
  └─ Every 8 exchanges (REFLECTION_INTERVAL):
       runReflectionUpdate()
       │
       ├─ buildReflectionPrompt() → Haiku 4.5 (1024 tokens)
       │   → ReflectionNote: factual anchors, tensions, themes, absences, arc
       │
       ├─ buildLightVisiblePrompt() → Haiku 4.5 (1024 tokens)
       │   → Light update: portrait, crystallized moments, open threads
       │
       ├─ mergeVisibleSoulFile(existing, update)
       │
       └─ SSE event: soul_file_updated {visible_soul_file, soul_file}
            → iOS: visibleSoulFile = updated (soul file tab refreshes)
```

### Session End: Full Synthesis

```
end-soul-session (called when session closes)
  │
  ├─ Fetch all messages from session
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
  ├─ mergeHiddenSoulFile() — agent-facing, clinical (Phase 2 use)
  │
  └─ Upsert both to database
```

---

## iOS Client Architecture

### Navigation

```
AARUApp
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
  ├─ @Published legacySoulFile: LegacySoulFile
  ├─ @Published soulMessages: [SoulMessage]
  ├─ @Published soulStreamingText: String
  ├─ @Published isSoulStreaming: Bool
  ├─ @Published canStartSoulSession: Bool
  ├─ @Published activeSoulSession: SoulSessionInfo?
  ├─ @Published isLoading: Bool
  ├─ @Published errorMessage: String?
  │
  ├─ BackendClient      HTTP POST + SSE streaming + offline fallback
  └─ SecureStore         Keychain (device ID, session token)
```

### SSE Streaming

```swift
URLSession.shared.bytes(for: request)
  │ reads line-by-line ("event: <type>\ndata: <json>")
  │
  ├─ event: token              → soulStreamingText += text
  ├─ event: soul_file_updated  → visibleSoulFile = updated
  ├─ event: error              → log error
  └─ stream ends               → finalize assistant message
```

---

## Auth Model

```
Device-based anonymous auth:

1. App generates persistent device UUID (Keychain)
2. POST /bootstrap-user {device_id}
3. Server issues session token:
   token = userId.deviceId.issuedAt.nonce.HMAC-SHA256(secret)
   TTL = 30 days
4. Token stored in Keychain, sent as x-aaru-session header
5. On auth failure: re-bootstrap, get new token, retry
```

---

## LLM Integration

| Use Case | Provider | Model | Streaming | Tokens | Fallback |
|----------|----------|-------|-----------|--------|----------|
| Soul conversation | Claude | Opus 4 | SSE | 512 | Deterministic reflection prompts |
| Periodic extraction | Claude | Haiku 4.5 | No | 1024 | Skip extraction |
| Session synthesis | Claude | Opus 4 | No | 8192 | Skip synthesis |
| Ka chat (Phase 2) | Groq | Llama 3.3 70B | No | - | Cycling prompts |
| Impression scoring (Phase 2) | Groq | Llama 3.3 70B | No | - | Heuristic overlap |

All LLM calls have deterministic fallbacks. Tests pass without API keys.

---

## Key Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| REFLECTION_INTERVAL | 8 | Extract every N exchanges |
| STALE_SESSION_HOURS | 72 | Auto-complete stale sessions |
| COOLDOWN_HOURS | 22 | Between soul sessions |
| SESSION_MAX_EXCHANGES | 15 | Hard close for sessions |

---

## Testing

```bash
# TypeScript (73 tests, no API keys needed)
npx vitest run

# Type checking
npx tsc -p tsconfig.json --noEmit

# iOS build
xcodebuild build -scheme AARU \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.3'

# iOS tests
xcodebuild test -scheme AARU \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.3'
```

---

## Deployment

### Edge Functions → Supabase

```bash
supabase functions deploy <function-name> --project-ref uuggqsywcpqmbqzwxdga
```

### Required Secrets

| Secret | Used By |
|--------|---------|
| ANTHROPIC_API_KEY | claude.ts (Soul Mirror) |
| AARU_SESSION_SECRET | auth.ts (HMAC signing) |
| SUPABASE_SERVICE_ROLE_KEY | db.ts (admin access) |
| GROQ_API_KEY | groq.ts (Phase 2: Ka chat) |

### iOS → XcodeGen

```bash
xcodegen generate        # Regenerate .xcodeproj from project.yml
```
