# Thumos Character Simulation

## What This Tests

End-to-end QA of the live Thumos Soul Mirror pipeline against the deployed Cloudflare Workers API. A Claude Haiku instance roleplays as a character, talking to the real Thumos conversation engine (Claude Opus). After the conversation, Claude Code evaluates the transcript against the verification checklist.

We simulate realistic long-term usage: ~160 messages across 6 sessions. This tests:

- long conversation depth, breadth, and natural topic movement
- multi-session reengagement (opening mode between sessions)
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

# Custom exchange count (default: 80 — ~160 total messages, user + assistant)
npx tsx scripts/dry-run-soul-files.ts --file scripts/characters.json --only charlie-scene --exchanges 80
```

### Prerequisites

- `ANTHROPIC_API_KEY` in `.env` for the character simulator
- Live Thumos API at `https://api.trythumos.com` or set `THUMOS_API_BASE`
- `pnpm install`

## Output

Results are saved to `dry-run-output/<character-name>/`:

- `conversation.md` — full transcript with session headers
- `visible-soul-file.json` — raw visible soul file
- `hidden-soul-file.json` — raw hidden soul file
- `debug-dump.json` — raw debug dump with reflection note + latest traces
- `soul-file-readable.md` — formatted soul file + verification table

## Multi-Session Architecture

Real users don't send 160 messages in one sitting. The simulation splits exchanges across 6 sessions, calling `mode: "opening"` between them. This triggers the same code path as a real user reopening the app:

- Loads full transcript + soul file + reflection snapshot
- AI generates a contextual opening based on accumulated context
- No backend changes required — uses existing `soul-converse` opening mode

### Session structure (default: 80 exchanges = ~160 messages)

| Session | Exchanges | What it tests |
|---------|-----------|---------------|
| 1 | 10 | first_ever opening, initial rapport |
| 2 | 13 | returning opening, memory continuity |
| 3 | 13 | steering from reflection, mid-run synthesis |
| 4 | 14 | continued depth, topic breadth |
| 5 | 15 | long-term coherence, domain coverage |
| 6 | 15 | soul file evolution, late synthesis |

Session sizes scale proportionally if `--exchanges` differs from 80 via `scaleSessionPlan()`.

### How it works

```
Session 1:
  POST /soul-converse { mode: "opening" }       ← AI generates first opening
  POST /soul-converse { mode: "reply", message } ← 15 exchange round-trips

Session 2:
  POST /soul-converse { mode: "opening" }       ← AI generates returning opening
  POST /soul-converse { mode: "reply", message } ← 13 exchange round-trips

  ... (sessions 3-6 same pattern)

After session 4:
  GET /get-soul-file                             ← triggers mid-run synthesis

After session 6:
  GET /get-soul-file + polling                   ← triggers final synthesis + wait
  POST /get-debug-info                           ← fetch hidden soul file
  POST /debug-dump                               ← fetch debug dump
  POST /soul-converse { mode: "opening" }        ← test post-sim opening continuity
```

The only difference from a real user session gap is elapsed wall-clock time — since the simulation runs continuously, the server sees a short gap rather than hours/days. The opening kind will be `returning` (not `first_ever`), and the opening is contextual using the full accumulated transcript + soul file + directed domain steering.

### No backend changes required

This approach uses existing API endpoints as-is. No `client_timestamp`, no direct DB access, no schema changes. The simulation is a pure API client.

## Verification Checklist

All evaluation is done by Claude Code reading the transcript + output files. No keyword matching in the script.

### Pipeline Checks (did the system produce output?)

| Check | Criteria | Pass |
|-------|----------|------|
| Conversation depth | >=80 user exchanges completed (~160 total messages) | Yes/No |
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
| Topic steering | AI moved conversation across >=5 genuinely distinct life domains over the full 160 messages. Evaluated by reading the transcript, not keyword matching. | Yes/No |
| Topic transitions | Number of exchanges where AI intentionally bridged to a new domain. Target: >=8 across all sessions | Count |
| Max same-topic run | Longest streak of consecutive exchanges on the same emotional territory. <=7 is acceptable, <=5 is good | Count |
| Observation ratio | % of Thumos turns that include a novel observation or synthesis (not just mirroring the user's words back). Target: >=40% | Percent |
| Novel insights | Turns where Thumos connected two separate things the user said across different sessions, or offered a reframe the user hadn't articulated. Target: >=10 | Count |
| Question-only turns | Turns that are pure question with no observation, reflection, or acknowledgment. Target: <=25% of total turns | Percent |
| Repeated questions | Questions that are substantially similar to a previous question. Target: 0 exact repeats, <=3 thematically similar | Count |
| Memory continuity | After a session boundary, AI referenced something specific from a prior session (not just generic "last time we talked"). Target: >=3 cross-session references | Count |
| Gesture contamination | Character output contains stage directions (`*action*`, `*pauses*`, italicized gestures). Target: 0 | Count |
| Thumos gesture leak | Thumos responded to a gesture as if it were real input. Target: 0 | Count |
| Depth progression | Conversation gets meaningfully deeper over time — later sessions reveal things early sessions didn't. Evaluated holistically | Yes/No |
| Emotional range | Conversation touches multiple emotional registers (not just one wound spiral). Joy, curiosity, humor, tension, vulnerability should all appear over 160 messages | Yes/No |

### Reengagement Checks (evaluated per session boundary)

| Check | Criteria | Pass |
|-------|----------|------|
| Opening is contextual | Each session opening references something specific to this person, not generic | Yes/No |
| Opening moves forward | Opening opens a new angle or revisits an open thread, doesn't just continue the last exchange | Yes/No |
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
- >=5 genuine topic domain shifts over 160 messages
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
- all openings contextual and forward-moving
- 0 gestures in openings

## Character Simulation Rules

The simulated character (Haiku) must:
- Never use stage directions, gestures, or roleplay markers (`*pauses*`, `*sighs*`, `*looks away*`)
- Never use asterisk-wrapped actions
- Respond in plain first-person prose only
- Engage with topic shifts when the AI steers — don't just circle the same wound
- Never try to end the conversation or say goodbye
- Never meta-comment on the conversation itself
- When one topic feels complete, move to something else

The character simulation prompt places the no-gestures constraint at the TOP of the system prompt as a hard rule:

```
HARD RULE: You must NEVER use asterisks, stage directions, action markers, or gesture descriptions.
No *pauses*, no *sighs*, no *looks away*. Plain first-person prose ONLY.
Violating this rule invalidates the entire simulation. This is non-negotiable.
```

## Timing Expectations

With ~160 messages across 6 sessions, a full run takes significantly longer than the old 15-exchange runs. Expect:

- ~25-50 min for the conversation phase (80 exchange round-trips with API latency)
- ~5-15 min for synthesis polling (mid-run + final synthesis cycles)
- Total: ~35-70 min per character

Dashboard-v2 soul-file synthesis is a multi-call background pipeline. Treat synthesis as failed only when:

- `get-soul-file` remains `synthesis_pending: true` for >15 minutes
- the hidden or visible file status becomes `failed`
- the debug dump never shows the latest synthesis trace

## Architecture

```
Character Simulator (Claude Haiku 4.5)
  <-> roleplays as character
  <-> sends messages via soul-converse API
Thumos API (Cloudflare Workers)
  <-> Claude Opus 4 for conversation
  <-> Claude Haiku 4.5 for reflection snapshots
  <-> Claude Opus 4 + Haiku 4.5 for dashboard-v2 synthesis pipeline
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
