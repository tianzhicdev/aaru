# Thumos Architecture

## Overview

Thumos is currently one product with one primary backend workflow: anonymous device-based conversation on iPhone, backed by a Cloudflare Worker, Neon Postgres, and a Cloudflare Queue for deferred reflection and synthesis work.

```
┌──────────────────────────────────────────────────────────────┐
│ iOS App (SwiftUI)                                            │
│                                                              │
│ RootView → SoulMirrorTabView                                 │
│   ├─ Conversation tab                                        │
│   ├─ Soul File tab                                           │
│   └─ AppModel + BackendClient + SecureStore                  │
└──────────────────────────────┬───────────────────────────────┘
                               │ HTTPS + SSE
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ Cloudflare Worker                                            │
│                                                              │
│ Routes:                                                      │
│   ping, version, bootstrap-soul, sync-messages,              │
│   soul-converse, get-soul-file, delete-account,              │
│   get-debug-info, debug-dump                                 │
│                                                              │
│ Core modules:                                                │
│   auth.ts, db.ts, soulApp.ts, modelProfiles.ts, llm.ts       │
└──────────────┬──────────────────────────────┬────────────────┘
               │                              │
               ▼                              ▼
      Neon Postgres                    Cloudflare Queue
      users                            reflection_snapshot
      device_sessions                  synthesis_visible
      soul_messages                    synthesis_hidden
      reflection_snapshots
      visible_soul_files
      hidden_soul_files
      claude_debug_traces
               │
               ▼
      LLM providers selected per model profile / task
        ├─ Anthropic
        ├─ Fireworks (OpenAI-compatible API for DeepSeek)
        └─ xAI web search for optional opening context
```

## Stack

| Layer | Current Technology |
| --- | --- |
| iOS client | SwiftUI, Combine, async/await, iOS 17+ |
| Backend runtime | Cloudflare Workers |
| Database | Neon Postgres |
| Background jobs | Cloudflare Queues |
| Domain logic | TypeScript in `src/domain/` + Zod schemas |
| Primary LLM routing | `workers/src/modelProfiles.ts` + `workers/src/llm.ts` |
| Tests | Vitest for TS, XCTest for iOS |
| Deploy | `deploy.sh` + Wrangler environments |

## Repository Map

```
aaru/
├── src/domain/
│   ├── schemas.ts              # Shared Zod/domain types
│   ├── soul.ts                 # Conversation prompt/system logic
│   └── soulFile.ts             # Reflection + synthesis prompts/parsing/schema
├── db/
│   ├── schema.sql              # Current desired schema snapshot
│   └── migrations/             # Historical migrations
├── workers/src/
│   ├── index.ts                # Worker fetch + queue entrypoints
│   ├── env.ts                  # Worker env contract
│   ├── auth.ts                 # Session token hashing/parsing
│   ├── db.ts                   # Neon accessors
│   ├── soulApp.ts              # Reflection/synthesis orchestration
│   ├── modelProfiles.ts        # Hardcoded model profiles
│   ├── llm.ts                  # Provider routing
│   ├── claude.ts               # Anthropic wrapper
│   ├── fireworks.ts            # Fireworks OpenAI-compatible wrapper
│   ├── openaiCompatible.ts     # Shared OpenAI-compatible transport
│   ├── xai.ts                  # Optional opening-time current-events fetch
│   ├── backgroundJobsQueue.ts  # Queue producer + consumer
│   └── handlers/               # Route handlers
├── Thumos/App/
│   ├── AppModel.swift          # Main app coordinator
│   ├── BackendClient.swift     # HTTP/SSE client
│   ├── SecureStore.swift       # Keychain + UserDefaults fallback
│   └── ...                     # Views/models
├── ThumosTests/                # XCTest coverage
├── DEPLOY.md                   # Dev/prod deploy procedure
├── deploy.sh                   # Dev default / prod gated deploy script
└── web/privacy.html            # Public privacy policy
```

## Runtime Topology

### Environments

There are three execution modes, but only two deployed environments:

| Mode | Worker target | Database target | Notes |
| --- | --- | --- | --- |
| `local` | `wrangler dev --env dev` | dev Neon URL | local code against non-prod infra |
| `dev` | `thumos-api-dev` | dev Neon URL | deployed via `./deploy.sh`, served on `workers.dev` |
| `production` | `thumos-api` | prod Neon URL | deployed via `sudo ./deploy.sh --prod --secrets ...` |

### Deployment Model

- `workers/wrangler.toml` defines `dev` and `production` separately.
- `deploy.sh` defaults to `dev`.
- `deploy.sh --prod` requires root and an explicit secrets file.
- production deploy secrets live outside the repo, in a root-owned file such as `/Users/biubiu/.secrets/prod.env`.
- dev currently uses a free Cloudflare-assigned `workers.dev` hostname.
- both dev and prod currently use queue message retention of 24 hours, which affects queued messages, not the queue resource lifetime.
- debug routes are separately gated by `DEBUG_API_TOKEN`.
- raw prompt/response trace persistence is controlled by `ENABLE_DEBUG_TRACES`.

## Data Model

### Core tables

- `users`
  - one row per anonymous device/user identity
  - includes `device_id`, `model_profile_id`, `last_active_at`
- `device_sessions`
  - stores hashed session tokens and expiry
  - multiple valid sessions can coexist for a device
- `soul_messages`
  - canonical full transcript
  - no user-visible session grouping
- `reflection_snapshots`
  - versioned reflection-note snapshots with `ready|pending|failed`
  - each row records the transcript boundary it covers
- `visible_soul_files`
  - versioned user-facing soul files with `ready|pending|failed`
- `hidden_soul_files`
  - versioned internal/clinical soul files with `ready|pending|failed`
- `claude_debug_traces`
  - stores latest prompt/input/response traces per kind

### Current truth about versioning and deletion

- reflection snapshots, visible soul files, and hidden soul files are all stored as versioned rows keyed by `(user_id, version)`.
- account deletion is currently a hard delete via `DELETE FROM users`, relying on `ON DELETE CASCADE`.
- there is no soft-delete or restore flow today.

## Authentication Model

Current auth is anonymous device-based auth:

1. iOS generates a persistent device ID in `SecureStore`.
2. `POST /bootstrap-soul` uses that device ID.
3. the Worker issues a signed session token using `THUMOS_SESSION_SECRET`.
4. the token is stored on device and sent as `x-thumos-session`.
5. on `401/403`, the app re-bootstraps and retries conversation requests.

Current implementation notes:

- session TTL is 30 days.
- bootstrap no longer revokes existing sessions for the same device.
- the canonical session header is `x-thumos-session`.
- debug routes additionally require `x-thumos-debug-token`.

## Request Flow

### Bootstrap

`POST /bootstrap-soul`

- validates the existing session if present
- otherwise creates or reuses the user row for the device
- issues a new device session token when needed
- returns:
  - `user_id`
  - optional `token`
  - current `visible_soul_file`
  - `has_messages`
  - `model_profile_id`
- opportunistically queues a reflection snapshot if the transcript is ahead of the latest snapshot

### Transcript Sync

`POST /sync-messages`

- authenticates the device session
- returns the full canonical transcript from `soul_messages`

### Conversation

`POST /soul-converse`

- authenticates the device session
- supports:
  - `mode: "opening"`
  - `mode: "reply"`
- persists the user message first for `reply`
- loads:
  - full persisted transcript
  - latest ready reflection note
  - latest visible soul file
- uses the reflection note directly for navigation (`currentThreads`, `avoidPastQuestions`, `steerToTopics`, pressure/reasoning)
- builds a system prompt from the authoritative transcript plus optional advisory context
- optional opening-time xAI lookup can fetch current-events context from `openThreads` and `recurringThemes`
- resolves the user’s `model_profile_id` and selects the task config for `conversation`
- streams tokens over SSE
- persists the assistant reply after streaming completes
- records a conversation debug trace with provider/model/profile metadata
- queues reflection snapshot work when the transcript crosses the current cadence boundary

Current reflection cadence: every 5 total persisted messages.

### Soul File Fetch

`POST /get-soul-file`

- authenticates the device session
- returns the current visible soul file immediately
- checks whether async synthesis is needed
- if needed, marks synthesis as pending and enqueues a queue job
- synthesis is not done inline in the request

## Background Jobs

Three queue job types exist:

- `reflection_snapshot`
- `synthesis_visible`
- `synthesis_hidden`

### Reflection snapshot job

- reads all persisted messages
- runs the reflection prompt using the current profile’s `reflection_snapshot` task config
- stores a new versioned reflection note row
- fails closed and marks the snapshot row failed if the consumer errors

### Visible synthesis job

- reads all persisted messages
- loads the latest reflection note
- runs visible narrative synthesis directly, with no assessment pre-step
- writes a new versioned visible soul file row
- preserves the last ready visible file if synthesis fails

### Hidden synthesis job

- reads all persisted messages
- loads the latest reflection note
- runs hidden clinical synthesis directly, with no assessment pre-step
- writes a new versioned hidden soul file row
- preserves the last ready hidden file if synthesis fails

## LLM Routing

### Model profiles

`workers/src/modelProfiles.ts` is the source of truth for profile/task routing.

Current profiles:

- `frontier_v1`
  - Anthropic for conversation, reflection, visible synthesis, hidden synthesis
- `value_v1`
  - Fireworks-hosted DeepSeek via OpenAI-compatible API for the same task set

Each user has a persisted `users.model_profile_id`.
New users default from `DEFAULT_MODEL_PROFILE_ID`, falling back to `frontier_v1`.

### Provider behavior

- `workers/src/llm.ts` dispatches by provider per task behind a provider-neutral interface.
- Anthropic stays on the Anthropic Messages API.
- Fireworks uses an OpenAI-compatible transport for DeepSeek, with reasoning disabled for `value_v1`.
- Reflection and synthesis use non-streaming structured-output calls; conversation stays streaming.
- Fireworks requests add:
  - `x-session-affinity`
  - `x-prompt-cache-isolation-key`
  keyed by `userId` to support provider-side cache/session locality.
- conversation has a deterministic fallback reply if both streaming attempts fail.
- background reflection/synthesis does not fall back to synthetic content; it marks failure and preserves prior ready state.

### Optional xAI usage

- xAI is used only for opening-mode current-events context.
- it is optional and skipped entirely if `XAI_TOKEN` is absent or the lookup fails.

## iOS Client Reality

### Current architecture

`AppModel` is the main state coordinator:

- bootstraps the device session
- syncs canonical transcript
- drives SSE conversation state
- caches visible soul file and transcript in `UserDefaults`
- stores device ID and session token via `SecureStore`
- clears local state on delete-account
- namespaces device/session/cache storage by backend environment in debug builds

`BackendClient` handles:

- JSON POST requests
- SSE streaming for `soul-converse`
- one retry for selected 5xx responses
- auth failure propagation so `AppModel` can re-bootstrap
- debug-token forwarding for debug-only routes

### Current debug-build behavior

- debug builds can switch among `local`, `dev`, `prod`, and `custom` backends from the debug view.
- the current environment selection persists in `UserDefaults`.
- device identity, session token, and cached soul state are namespaced per backend environment.
- release builds remain pinned to production.

## Privacy and Observability

### Privacy-related assets

- `web/privacy.html` is the public privacy policy page.
- `Thumos/PrivacyInfo.xcprivacy` is the Apple privacy manifest.

### Current data handled by the system

- anonymous device identifier
- conversation messages
- visible soul file content
- hidden soul file content
- basic activity timestamps
- debug traces for prompts and model responses

### Debug endpoints

- `get-debug-info`
- `debug-dump`

These are authenticated with the normal device session token and also require the developer debug token header. They are intended for development/debugging, not public client traffic.

### Trace retention

- raw debug traces are only recorded when `ENABLE_DEBUG_TRACES=true`.
- when disabled, the debug endpoints still work, but raw LLM trace rows are omitted.

## Testing and Verification

### What is covered well

- TypeScript unit tests cover domain logic, model profiles, LLM routing, queue consumers, and most handler behavior.
- integration-style handler tests cover bootstrap, sync, conversation opening, synthesis enqueueing, and delete-account behavior.

### What is covered lightly

- iOS tests are thin and focus mostly on fallback decoding and a few `AppModel` basics.
- deploy script behavior is not directly unit-tested.
- live provider integration remains a manual smoke-test path.

### Commands currently known to work

```bash
pnpm test
pnpm lint
pnpm db:migrate
pnpm db:migrate:dev
xcodebuild test -project Thumos.xcodeproj -scheme Thumos \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.1' -quiet
./deploy.sh
sudo ./deploy.sh --prod --secrets /Users/biubiu/.secrets/prod.env
```

## Current Technical Debt

The codebase is functional, but a few parts still reflect rapid iteration:

- soul file versioning is numeric only; history/version tables do not exist yet
- deletion is hard delete only
- debug access depends on a manually distributed developer token
