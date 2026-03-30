# Thumos Character Simulation

## What This Tests

End-to-end QA of the Thumos Soul Mirror pipeline against the live Cloudflare Workers API. A Claude Haiku instance roleplays as a well-known historical figure, talking to the real Thumos conversation engine (Claude Opus). After the conversation, we verify that the full pipeline works: soul file synthesis, re-engagement generation, domain steering, and conversation depth/breadth.

## How To Run

```bash
# All 10 characters (takes ~30 min)
npx tsx scripts/dry-run-soul-files.ts --file scripts/characters.json

# Single character
npx tsx scripts/dry-run-soul-files.ts --file scripts/characters.json --only fred-rogers

# Custom exchange count (default: 15)
npx tsx scripts/dry-run-soul-files.ts --file scripts/characters.json --only maya-angelou --exchanges 20
```

### Prerequisites

- `ANTHROPIC_API_KEY` in `.env` (for the character simulator — Claude Haiku)
- Live Thumos API at `https://api.trythumos.com` (or set `THUMOS_API_BASE`)
- `pnpm install` (needs `dotenv`, `tsx`)

### Output

Results are saved to `dry-run-output/<character-name>/`:
- `conversation.md` — full transcript (human-readable)
- `visible-soul-file.json` — raw visible soul file
- `hidden-soul-file.json` — raw hidden soul file
- `soul-file-readable.md` — formatted soul file + verification table

## Verification Checklist

Each character run is evaluated on 9 dimensions:

| Check | Criteria | Pass |
|-------|----------|------|
| Conversation depth | ≥10 user exchanges completed | Yes/No |
| Conversation breadth | AI explored ≥3 different life domains | Yes/No |
| Soul file generated | Visible soul file has a portrait | Yes/No |
| Sections populated | N/7 visible soul file sections filled | Count |
| Crystallized moments | Memorable quotes captured | Count |
| Open threads | Unresolved threads identified | Count |
| Hidden soul file | Expert reflections + drivers generated | Yes/No |
| Re-engagement | Personalized question for returning user | Yes/No |
| Steering | AI shifted to new topic areas during conversation | Yes/No |

### What "Pass" Looks Like

A good run should have:
- All 9 checks green
- ≥5/7 sections populated with substantive content
- ≥2 crystallized moments
- ≥1 open thread
- Re-engagement question that references specific things from the conversation
- Soul file portrait that captures the character's essence (not generic)

## Domain Keywords

The simulation tracks which life domains are covered in conversation. Domains detected via keyword matching:

- **relationships** — connect, friend, family, love, partner, trust
- **work/craft** — work, create, build, career, profession, art
- **identity** — who you are, define, see yourself
- **emotions** — feel, anger, joy, sadness, fear, peaceful
- **values** — value, matter, important, believe, principle
- **past/memory** — remember, childhood, grew up, memory
- **contradictions** — contradict, tension, both, opposite, struggle
- **loss/grief** — loss, grief, miss, gone, death, mourn

Good conversations should cover ≥3 domains, great ones cover 5+.

## Characters

10 characters in `scripts/characters.json`:

| Character | Key Themes |
|-----------|-----------|
| Fred Rogers | kindness, childhood loneliness, anger management |
| Frida Kahlo | pain, art, identity, passionate relationships |
| Anthony Bourdain | addiction, craft, restlessness, authenticity |
| Maya Angelou | silence, voice, resilience, spirituality |
| Nikola Tesla | obsession, solitude, vision, sacrifice |
| Virginia Woolf | inner life, mental health, creativity, perception |
| Marcus Aurelius | duty, stoicism, weakness, mortality |
| Robin Williams | comedy as mask, addiction, empathy, loneliness |
| Simone de Beauvoir | freedom, relationships, philosophy, authenticity |
| Kenji Miyazawa | service, grief, nature, spirituality |

## Architecture

```
Character Simulator (Claude Haiku 4.5)
  ↕ roleplays as character
Thumos API (Cloudflare Workers)
  ↕ calls Claude Opus 4 for conversation
  ↕ calls Claude Opus 4 for synthesis
  ↕ calls Claude Haiku 4.5 for re-engagement
Neon Postgres
  ↕ stores messages, soul files
```

The simulation creates a fresh user (via `POST /bootstrap-soul`) for each character, so each run is isolated.

## When To Run

- After deploying new server code
- After changing conversation prompts (`src/domain/soul.ts`)
- After changing synthesis prompts (`src/domain/soulFile.ts`)
- After changing re-engagement logic (`src/domain/reengagement.ts`)
- Before major releases (run all 10 characters)
