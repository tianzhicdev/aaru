# Thumos Character Simulation

## What This Tests

End-to-end QA of the live Thumos Soul Mirror pipeline against the deployed Cloudflare Workers API. A Claude Haiku instance roleplays as a character, talking to the real Thumos conversation engine (Claude Opus). After the conversation, Claude Code evaluates the transcript against the verification checklist.

We simulate realistic long-term usage: 200 messages across multiple sessions with time gaps between them. This tests:

- long conversation depth, breadth, and natural topic movement
- multi-session reengagement (opening mode after time gaps)
- reflection snapshot generation across session boundaries
- soul-file synthesis evolution over a long relationship
- steering behavior as the AI accumulates knowledge about the person
- dashboard-v2 visible + hidden field richness after extended interaction

## How To Run

```bash
# All characters
npx tsx scripts/dry-run-soul-files.ts --file scripts/characters.json

# Single character
npx tsx scripts/dry-run-soul-files.ts --file scripts/characters.json --only charlie-scene

# Custom exchange count (default: 100 — 200 messages total, user + assistant)
npx tsx scripts/dry-run-soul-files.ts --file scripts/characters.json --only charlie-scene --exchanges 100
```

### Prerequisites

- `ANTHROPIC_API_KEY` in `.env` for the character simulator
- Live Thumos API at `https://api.trythumos.com` or set `THUMOS_API_BASE`
- `pnpm install`

## Output

Results are saved to `dry-run-output/<character-name>/`:

- `conversation.md` — full transcript
- `visible-soul-file.json` — raw visible soul file
- `hidden-soul-file.json` — raw hidden soul file
- `debug-dump.json` — raw debug dump with reflection note + latest traces
- `soul-file-readable.md` — formatted soul file + verification table

## Time Gap Simulation

Real users don't send 200 messages in one sitting. The simulation inserts time gaps between "sessions" to trigger realistic reengagement, reflection, and synthesis behavior.

**Principle: the simulation goes strictly through the backend API.** No direct DB access. It's a simulation — it should exercise the same code paths a real client would.

### How it works

The `soul-converse` API accepts an optional `client_timestamp` field (ISO 8601 string). When present, the server uses it instead of `now()` for both the user message insert and the assistant reply insert. This lets the simulation script advance its own clock to create time gaps.

The simulation maintains a `simulatedClock` variable. Between sessions, it jumps the clock forward by the desired gap duration. All subsequent messages in the next session use the advanced clock.

```typescript
// Simulation script pseudocode
let simulatedClock = new Date(); // starts at real time

// Session 1: exchanges 1-15
for (exchange of session1) {
  simulatedClock = new Date(simulatedClock.getTime() + 60_000); // +1 min per exchange
  POST /soul-converse { mode: "reply", message, client_timestamp: simulatedClock.toISOString() }
}

// Gap: jump 2 days
simulatedClock = new Date(simulatedClock.getTime() + 2 * 24 * 60 * 60 * 1000);

// Session 2: opening after gap
POST /soul-converse { mode: "opening", client_timestamp: simulatedClock.toISOString() }
```

### Session structure (target: ~200 messages)

| Session | Exchanges | Simulated gap before | What it tests |
|---------|-----------|---------------------|---------------|
| 1 | ~15 | none (first visit) | first_ever opening, initial rapport |
| 2 | ~20 | 2 days | resume_after_gap opening, memory continuity |
| 3 | ~20 | 5 days | reengagement with soul file context, steering from reflection |
| 4 | ~20 | 1 day | shorter gap, assistant_turn vs resume behavior |
| 5 | ~25 | 1 week | long gap, soul file evolution, xAI current events |

The exact session boundaries and gap durations are configurable. The key invariant: the simulation must trigger at least 3 `resume_after_gap` openings and at least 1 `assistant_turn` continuation.

### Code changes required

- `soulConverseRequestSchema` in `soul-converse.ts` — add optional `client_timestamp: z.string().datetime().optional()` to both `opening` and `reply` variants
- `insertSoulMessage` in `soulApp.ts` — add optional `createdAt` param, use it in the INSERT when provided: `VALUES (${userId}, ${role}, ${content}, COALESCE(${createdAt}, now()))`
- `soul-converse.ts` handler — pass `body.client_timestamp` through to both user and assistant message inserts
- `last_active_at` update — use `client_timestamp` if present instead of `NOW()`
- `deriveOpeningKind` — currently compares `Date.now()` vs last message timestamp; when `client_timestamp` is present, compare against that instead of `Date.now()`

## Verification Checklist

All evaluation is done by Claude Code reading the transcript + output files. No keyword matching.

### Pipeline Checks (did the system produce output?)

| Check | Criteria | Pass |
|-------|----------|------|
| Conversation depth | >=100 user exchanges completed (~200 total messages) | Yes/No |
| Soul file generated | Visible soul file has a portrait | Yes/No |
| Sections populated | 7/7 visible soul-file sections filled | Count |
| Crystallized moments | >=5 memorable quotes captured | Count |
| Open threads | >=3 unresolved threads identified | Count |
| Hidden soul file | Hidden file exists with content | Yes/No |
| Personality spectrum | 5/5 visible spectrum traits populated | Count |
| Top values | >=3 top values generated | Count |
| Relational style | Visible relational style present and substantive | Yes/No |
| Hidden profiles | Big Five / Schwartz / attachment / moral / meaning all present | Yes/No |
| Reflection snapshots | Multiple reflection snapshots generated across sessions | Count |
| Soul file versions | Soul file was re-synthesized at least 2x as conversation grew | Count |

### Conversation Quality Checks (evaluated by Claude Code)

Claude Code reads the full `conversation.md` and evaluates:

| Check | Criteria | Pass |
|-------|----------|------|
| Topic steering | AI moved conversation across >=5 genuinely distinct life domains over the full 200 messages. Evaluated by reading the transcript, not keyword matching. | Yes/No |
| Topic transitions | Number of exchanges where AI intentionally bridged to a new domain. Target: >=8 across all sessions | Count |
| Max same-topic run | Longest streak of consecutive exchanges on the same emotional territory. <=7 is acceptable, <=5 is good | Count |
| Observation ratio | % of Thumos turns that include a novel observation or synthesis (not just mirroring the user's words back). Target: >=40% | Percent |
| Novel insights | Turns where Thumos connected two separate things the user said across different sessions, or offered a reframe the user hadn't articulated. Target: >=10 | Count |
| Question-only turns | Turns that are pure question with no observation, reflection, or acknowledgment. Target: <=25% of total turns | Percent |
| Repeated questions | Questions that are substantially similar to a previous question. Target: 0 exact repeats, <=3 thematically similar | Count |
| Memory continuity | After a time gap, AI referenced something specific from a prior session (not just generic "last time we talked"). Target: >=3 cross-session references | Count |
| Gesture contamination | Character output contains stage directions (`*action*`, `*pauses*`, italicized gestures). Target: 0 | Count |
| Thumos gesture leak | Thumos responded to a gesture as if it were real input. Target: 0 | Count |
| Depth progression | Conversation gets meaningfully deeper over time — later sessions reveal things early sessions didn't. Evaluated holistically | Yes/No |
| Emotional range | Conversation touches multiple emotional registers (not just one wound spiral). Joy, curiosity, humor, tension, vulnerability should all appear over 200 messages | Yes/No |

### Reengagement Checks (evaluated per session boundary)

| Check | Criteria | Pass |
|-------|----------|------|
| resume_after_gap triggered | At least 3 session boundaries triggered resume_after_gap opening | Count |
| Opening is contextual | Each reengagement opening references something specific to this person, not generic | Yes/No |
| Opening moves forward | Reengagement opens a new angle or revisits an open thread, doesn't just continue the last exchange | Yes/No |
| Opening has no gestures | No stage directions or `*action*` markers in openings | Yes/No |
| xAI current events | At least 1 opening included current events context (requires XAI_TOKEN) | Yes/No |

### What "Pass" Looks Like

**Pipeline (all required):**
- visible portrait present
- 7/7 visible sections populated
- >=5 crystallized moments
- >=3 open threads
- 5/5 personality spectrum traits
- >=3 top values
- relational style present and substantive
- all hidden psychometric fields present
- multiple reflection snapshots generated
- soul file re-synthesized at least 2x

**Conversation quality (all required):**
- >=5 genuine topic domain shifts over 200 messages
- max same-topic run <=7 exchanges
- >=40% of Thumos turns include a novel observation
- >=10 novel insights connecting things across sessions
- <=25% question-only turns
- 0 gesture contamination
- 0 Thumos gesture leaks
- >=3 cross-session memory references
- depth progression visible
- emotional range present

**Reengagement (all required):**
- >=3 resume_after_gap openings triggered
- all openings contextual and forward-moving
- 0 gestures in openings

## Character Simulation Rules

The simulated character (Haiku) must:
- Never use stage directions, gestures, or roleplay markers (`*pauses*`, `*sighs*`, `*looks away*`)
- Never use asterisk-wrapped actions
- Respond in plain first-person prose only
- Engage with topic shifts when the AI steers — don't just circle the same wound

The character simulation prompt must make the no-gestures constraint unambiguous and impossible to ignore. Place it at the top of the system prompt as a hard rule, not buried in a list. Example:

```
HARD RULE: You must NEVER use asterisks, stage directions, action markers, or gesture descriptions.
No *pauses*, no *sighs*, no *looks away*. Plain first-person prose only. Violating this rule
invalidates the entire simulation.
```

## Timing Expectations

With 200 messages and time gap simulation, a full run will take significantly longer than the old 15-exchange runs. Expect:

- ~30-60 min for the conversation phase (100 exchange round-trips with API latency)
- ~5-15 min for synthesis polling (multiple synthesis cycles)
- Total: ~45-90 min per character

Dashboard-v2 soul-file synthesis is a multi-call background pipeline. Treat synthesis as failed only when:

- `get-soul-file` remains `synthesis_pending: true` for >15 minutes
- the hidden or visible file status becomes `failed`
- the debug dump never shows the latest synthesis trace

If synthesis fails for an unchanged transcript, `get-soul-file` should stop reporting `synthesis_pending: true` on later polls. It should keep serving the last ready soul file until newer messages arrive and trigger a fresh attempt.

## Architecture

```
Character Simulator (Claude Haiku 4.5)
  <-> roleplays as character
  <-> sends client_timestamp to control simulated time
Thumos API (Cloudflare Workers)
  <-> Claude Opus 4 for conversation
  <-> Claude Haiku 4.5 for reflection snapshots
  <-> Claude Opus 4 + Haiku 4.5 for dashboard-v2 synthesis pipeline
  <-> uses client_timestamp for message created_at when provided
Neon Postgres
  <-> stores messages, reflection snapshots, soul files, debug traces
```

The simulation creates a fresh user via `POST /bootstrap-soul` for each character, so every run is isolated.

## When To Run

- after deploying backend changes
- after changing conversation prompts in `src/domain/soul.ts`
- after changing reflection or synthesis prompts in `src/domain/soulFile.ts`
- after changing dashboard-v2 visible or hidden fields
- before major releases
