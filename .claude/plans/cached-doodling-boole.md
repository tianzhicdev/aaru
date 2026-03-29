# Plan: On-Demand Reengagement Questions

## Context

Users go dormant. We want to pull them back with a deeply personal question that proves Thumos remembers them. Design: **generate on-demand when they return** — no push infra, no cron, no APNS.

- **iOS local notification** = dumb alarm clock ("Thumos has been thinking about you")
- **Cloudflare Worker generates the question on-demand** when user opens the app
- **xAI Grok web search** enriches the question with timely real-world context
- **Auto-starts session** — no "Begin" button needed for returning users

## Flow

```
Every app foreground:
  Cancel existing notification → schedule new one for next Saturday 8pm
  that is >= 3 days from now. If user opens again before then, reschedule.

Saturday 8pm (user hasn't opened in 3+ days):
  Local notification: "Thumos has been thinking about you."

User taps notification (or opens organically after 3+ days):
  → bootstrap-soul detects: last message > 3 days ago, has soul file, no active session
  → generates reengagement question:
      1. Load hidden soul file + visible soul file
      2. Load ALL messages (full history for deep context)
      3. Derive topics from coreDrivers + openThreads
      4. xAI web search for trending context (3s timeout, graceful fallback)
      5. Haiku generates personalized question
  → creates new soul session, inserts question as first assistant message
  → returns session + messages in bootstrap response
  → iOS sees messages → skips welcome screen → user can reply immediately
```

---

## Files to Create

### 1. `src/domain/reengagement.ts`

Pure domain logic. Two exports:

**`buildReengagementPrompt(input)`**
- Input: `{ messages: {role, content}[], hiddenSoulFile: HiddenSoulFile, visibleSoulFile: VisibleSoulFile, webSearchContext?: {topic, headline, summary}[] }`
- References ALL messages for deep context
- Uses hidden soul file: `depthMap.currentlyLiveTopics`, `coreDrivers`, `analyst_notes`, `voice`
- Uses visible soul file: `openThreads`, `crystallizedMoments`, `portrait`
- Weaves in xAI search results if available
- Instructs Haiku: generate ONE warm, personal question (under 200 chars) that references specific things they've shared, gently probes an open thread or tension
- Returns the prompt string for Haiku

**`REENGAGEMENT_FALLBACKS: string[]`**
- 10-15 deep questions for when Haiku fails
- Different from `OPENING_POOL` in `soul.ts` — these assume the person has been seen before
- Examples: "What's been quietly shifting in you since we last talked?", "Is there something you almost said last time but held back?"

**`deriveSearchTopics(hiddenSoulFile, visibleSoulFile): string[]`**
- Extracts 3-5 search-friendly topics from `coreDrivers[].driver` + `openThreads`
- e.g., for Fred Rogers: `["patience as armor", "purpose vs grief", "teaching loneliness"]`

### 2. `workers/src/xai.ts`

Adapted from existing worktree code at `.claude/worktrees/lpc-avatar-integration/supabase/functions/_shared/xai.ts`.

**`fetchInterestNews(xaiToken: string, topics: string[]): Promise<{topic, headline, summary}[]>`**
- Calls xAI `grok-3-mini` with `web_search` tool via `https://api.x.ai/v1/responses`
- Returns array of `{topic, headline, summary}`
- Returns `[]` on any failure (missing token, timeout, API error)
- Includes `extractText()` and `parseJsonArray()` helpers from existing worktree code

### 3. `Thumos/App/NotificationScheduler.swift`

Simple, self-contained, no server calls.

**`scheduleReengagementReminder()`** — called on every `scenePhase == .active`
- Cancel all pending notifications (`.removePendingNotificationRequests()`)
- Calculate next Saturday 8pm local that is >= 3 days from now
- Schedule `UNNotificationRequest` with `UNCalendarNotificationTrigger`
- Content: title "Thumos", body "Something's been on my mind about you."

**`requestNotificationPermission()`** — called after first completed session
- `UNUserNotificationCenter.requestAuthorization(options: [.alert, .sound])`

### 4. `tests/unit/reengagement.test.ts`

- Test `buildReengagementPrompt` produces valid prompt with all context sections
- Test `buildReengagementPrompt` with web search context included
- Test `deriveSearchTopics` extracts sensible topics
- Test fallback array is non-empty and unique
- Test prompt handles empty/null soul file gracefully (should not generate for new users)

### 5. `scripts/test-reengagement.ts`

Manual test script: connects to Neon DB, pulls Fred Rogers / Maya Angelou data, generates questions, prints them. For validating quality before shipping.

---

## Files to Modify

### 6. `workers/src/env.ts` — Add XAI_TOKEN

```typescript
export interface Env {
  DATABASE_URL: string;
  ANTHROPIC_API_KEY: string;
  THUMOS_SESSION_SECRET: string;
  XAI_TOKEN?: string;  // optional — graceful fallback if missing
}
```

### 7. `workers/src/soulApp.ts` — Add `generateReengagementQuestion()`

New exported function:

```typescript
export async function generateReengagementQuestion(
  sql: NeonSQL,
  apiKey: string,
  xaiToken: string | undefined,
  userId: string
): Promise<string | null>
```

- Loads: `getHiddenSoulFile(sql, userId)`, `getVisibleSoulFile(sql, userId)`, `getAllSoulMessages(sql, userId)`
- If no soul file or no messages → return null (new user, not eligible)
- Calls `deriveSearchTopics()` → `fetchInterestNews()` (with 3s timeout via `Promise.race`)
- Calls `buildReengagementPrompt()` → `callClaude()` with Haiku
- Parses question from response
- On any failure → returns random `REENGAGEMENT_FALLBACKS` entry

### 8. `workers/src/handlers/bootstrap-soul.ts` — Detect inactivity + generate question

After existing `bootstrapSoulState()` call, add reengagement logic:

```typescript
// Reengagement: detect 3+ days inactive, has soul file, no active session
let reengagementQuestion: string | null = null;
if (!state.activeSession && state.visibleSoulFile) {
  const lastMsg = await getLastMessageTimestamp(sql, userId);
  const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);
  if (lastMsg && lastMsg.getTime() < threeDaysAgo) {
    // Generate question + auto-start session
    reengagementQuestion = await generateReengagementQuestion(sql, env.ANTHROPIC_API_KEY, env.XAI_TOKEN, userId);
    if (reengagementQuestion) {
      const sessionNumber = state.nextSessionNumber;
      const newSession = await createSoulSession(sql, userId, sessionNumber);
      await insertSoulMessage(sql, newSession.id, userId, "assistant", reengagementQuestion);
      // Update state to reflect new session
      state.activeSession = newSession;
      messages = [{ role: "assistant", content: reengagementQuestion }];
    }
  }
}

// Include in response
return jsonResponse(200, {
  ...existing fields...,
  ...(reengagementQuestion ? { reengagement_question: reengagementQuestion } : {})
});
```

Also add a `getLastMessageTimestamp()` helper to `soulApp.ts`:
```sql
SELECT created_at FROM soul_messages WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1
```

### 9. `Thumos/App/Models.swift` — Add field to bootstrap response

Add `pendingOpening` to `SoulBootstrapResponse`:

```swift
let pendingOpening: String?   // reengagement_question from server

enum CodingKeys: String, CodingKey {
    // ...existing keys...
    case pendingOpening = "reengagement_question"
}
```

### 10. `Thumos/App/AppModel.swift` — Handle reengagement auto-start

In `bootstrapSoul()`, the server already creates the session and inserts the AI message. The response includes `active_session` (populated) and `messages` (containing the reengagement question). The existing code at lines 161-171 already handles this:

```swift
activeSoulSession = response.activeSession  // now set (new session)
if let payloads = response.messages, !payloads.isEmpty {
    soulMessages = payloads.map { ... }     // includes the AI question
}
```

Since `soulMessages` is not empty, `isWelcomeState` returns false → user sees conversation + input bar. **No code change needed here** — the server-side session creation handles everything.

One addition: after first completed session, request notification permission:
```swift
// In endSoulSession() or similar, after synthesis completes:
if nextSessionNumber == 2 {  // just finished first session
    NotificationScheduler.requestNotificationPermission()
}
```

### 11. `Thumos/App/ThumosApp.swift` — Scene phase observer

Add `@Environment(\.scenePhase)` to schedule notifications on foreground:

```swift
@main
struct ThumosApp: App {
    @StateObject private var model: AppModel
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .onChange(of: scenePhase) { _, newPhase in
                    if newPhase == .active {
                        NotificationScheduler.scheduleReengagementReminder()
                        model.handleForeground()
                    }
                }
        }
    }
}
```

Note: `handleForeground()` already exists in AppModel and re-bootstraps if needed.

### 12. `workers/wrangler.toml` — No change needed

`XAI_TOKEN` is set as a Cloudflare secret via `wrangler secret put XAI_TOKEN`, not in wrangler.toml.

---

## What We're NOT Building

- No APNS push infrastructure
- No device token registration
- No server-side cron
- No new database tables or migration
- No `pending_opening` column (question is returned inline + saved as regular message)

---

## Latency

Added to bootstrap for inactive users only:
- `getAllSoulMessages()`: ~50ms (Neon query)
- `fetchInterestNews()`: ~1-2s (3s timeout, parallel with soul file loads)
- `callClaude()` Haiku: ~0.5-1s
- **Total added: ~1.5-2.5s** on top of normal bootstrap (~300ms)

Acceptable because:
1. User just opened from a notification — expects brief load
2. Cached messages display immediately (lines 143-150 in AppModel)
3. Only affects users who've been inactive 3+ days

---

## Verification

1. `npx vitest run` — all existing tests pass + new reengagement tests
2. `npx tsc -p tsconfig.json --noEmit` — zero type errors
3. `scripts/test-reengagement.ts` — run against Fred Rogers / Maya Angelou dry-run data, verify question quality
4. `cd workers && npx tsc --noEmit` — workers type check
5. iOS build succeeds
6. Manual test: call bootstrap-soul for a user whose last message is 4+ days old → verify `reengagement_question` in response + new session created
