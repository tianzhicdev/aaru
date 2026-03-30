# Thumos Character Simulation

## What This Tests

End-to-end QA of the live Thumos Soul Mirror pipeline against the deployed Cloudflare Workers API. A Claude Haiku instance roleplays as a well-known historical figure, talking to the real Thumos conversation engine (Claude Opus). After the conversation, the script verifies the current production flow:

- full conversation depth and breadth
- async reflection snapshots
- async soul-file synthesis
- dashboard-v2 visible fields
- hidden psychometric profiles
- assistant-led opening continuity
- steering/topic movement across the conversation

## How To Run

```bash
# All characters
npx tsx scripts/dry-run-soul-files.ts --file scripts/characters.json

# Single character
npx tsx scripts/dry-run-soul-files.ts --file scripts/characters.json --only fred-rogers

# Custom exchange count (default: 15)
npx tsx scripts/dry-run-soul-files.ts --file scripts/characters.json --only maya-angelou --exchanges 20
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

## Verification Checklist

Each run is evaluated on these dimensions:

| Check | Criteria | Pass |
|-------|----------|------|
| Conversation depth | >=10 user exchanges completed | Yes/No |
| Conversation breadth | AI explored >=3 different topic domains | Yes/No |
| Soul file generated | Visible soul file has a portrait | Yes/No |
| Sections populated | N/7 visible soul-file sections filled | Count |
| Crystallized moments | Memorable quotes captured | Count |
| Open threads | Unresolved threads identified | Count |
| Hidden soul file | Hidden file exists | Yes/No |
| Personality spectrum | >=2 visible spectrum traits populated | Count |
| Top values | >=1 top value generated | Count |
| Relational style | Visible relational style present | Yes/No |
| Hidden profiles | Big Five / Schwartz / attachment / moral / meaning data present | Yes/No |
| Reflection signals | Reflection snapshot contains new psych signals | Yes/No |
| Assistant opening | `mode:"opening"` still returns a meaningful assistant-led turn | Yes/No |
| Steering | AI shifted topic areas during conversation | Yes/No |

### What "Pass" Looks Like

A strong run should have:

- visible portrait present
- >=5/7 visible sections populated
- >=2 crystallized moments
- >=1 open thread
- >=2 populated personality spectrum traits
- >=1 top value
- relational style present
- hidden psychometric fields present
- reflection snapshot with at least one new signal family populated

## Domain Keywords

The simulation tracks breadth using simple keyword matching:

- **relationships** — connect, friend, family, love, partner, trust
- **work/craft** — work, create, build, career, profession, art
- **identity** — who you are, define, see yourself
- **emotions** — feel, anger, joy, sadness, fear, peaceful
- **values** — value, matter, important, believe, principle
- **past/memory** — remember, childhood, grew up, memory
- **contradictions** — contradict, tension, both, opposite, struggle
- **loss/grief** — loss, grief, miss, gone, death, mourn

Good conversations should cover >=3 domains. Great ones cover 5+.

## Timing Expectations

Dashboard-v2 soul-file synthesis is now a multi-call background pipeline. A healthy live run can still take several minutes before the visible soul file is ready. Treat this as a failure only when:

- `get-soul-file` remains `synthesis_pending: true` for an unusually long window
- the hidden or visible file status becomes `failed`
- the debug dump never shows the latest synthesis trace

For routine QA, expect the synthesis step to take anywhere from around 1 minute to several minutes depending on model latency.

## Architecture

```
Character Simulator (Claude Haiku 4.5)
  <-> roleplays as character
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
