---
name: reddit-story
description: |
  Find a Reddit dating app horror story, produce a narrated TikTok video
  (scrolling post + cloned/pre-made voice TTS + karaoke captions + ambient
  music with sidechain ducking + Ken Burns zoom + auto-incrementing
  "Dating horror story episode N" opener), and upload to TikTok.
  Deduplicates against previously produced stories.
user-invocable: true
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Skill
  - mcp__rapidapi_reddit__v1search
  - mcp__rapidapi_reddit__v1posts
  - mcp__rapidapi_reddit__v1post-details_incl_comments
  - mcp__rapidapi_reddit__v1subredditpopular
---

# /reddit-story — Reddit Dating Horror Story Video Pipeline

You are producing a narrated TikTok video from a Reddit dating horror story. Follow these steps in order. The pipeline is designed to run end-to-end without human intervention (suitable for cron / `claude -p`).

## Step 1: Find a Story

Use `mcp__rapidapi_reddit__v1search` to search Reddit for dating disaster stories. **Important:** results are huge (often >100K chars) and exceed the response token limit, so they get saved to a file the tool reports. Parse with `jq` from that file path — never try to inline the raw response.

After every search, run something like:
```bash
cat <reported-tool-results-file> | jq -r '.[0].text' | jq -r '.body[] | "\(.score)\tu/\(.author)\tr/\(.subreddit)\t\(.title)\thttps://reddit.com\(.permalink)"' | sort -rn | head -20
```

**Search queries** (try at least 2-3, varying):
- `tinder date`, `hinge date`, `bumble date`, `first date disaster`, `worst date ever`, `catfished`, `dating disaster`

**Subreddits** (search with `subreddit=` parameter, sortType=`top`, timeFilter=`year` or `all`):
- `tifu`, `Vent`, `dating`, `Tinder`, `hingeapp`, `OnlineDating`, `relationship_advice`, `TwoXChromosomes`

For the chosen post, fetch the full body via `mcp__rapidapi_reddit__v1post-details_incl_comments`. That result also gets saved to a file — extract title/author/score/selftext via:
```bash
cat <file> | jq -r '.[0].text' | jq '.body.post | {title, author, score, ups, num_comments, selftext}'
```

## Step 2: Dedup

Read `marketing/stories/produced_stories.json`. Skip any candidate whose **title** or **reddit_url** is already in the registry. If duplicate, go back to Step 1.

## Step 3: Evaluate Story Quality

Story MUST meet ALL:

1. **Clear narrative arc** — setup, escalation, punchline/twist
2. **Right length** — 1500–3000 chars body text (produces 60–150s of narration)
3. **High engagement** — 10K+ upvotes preferred (5K+ acceptable if exceptional)
4. **Specific absurd detail** — one memorable, quotable moment
5. **Punchy ending** — strong final line, not a fizzle

If criteria fail, return to Step 1 and explain the rejection.

## Step 4: Rewrite Narration

Rewrite for spoken delivery. Rules:

- **Lead with the setup**, not meta-commentary
- **Short, punchy sentences** — break long paragraphs
- **Natural transitions** — "So", "Then", "Well"
- **CAPITALIZE emphasis words** — they carry emotional punch
- **End on the strongest line** — rearrange if needed
- **Cut filler** — drop "Edit:", "TL;DR", "obligatory…", etc.
- **Keep the voice** — preserve OP's personality and humor
- **Target 60–120 seconds spoken** (~150–300 words)
- **Don't include the opener** — the produce script auto-prepends `"This is dating horror story, episode N."`

## Step 5: Write Story JSON

Create a slug from the title (lowercase, hyphens, max 40 chars). Save to `marketing/stories/output/{slug}/story.json`.

**Determine the OP's gender** from the post body (self-identification, pronouns the OP uses for themselves). Set `author_gender` to `male` or `female`. If genuinely ambiguous, default to `female`.

```json
{
  "subreddit": "r/Vent",
  "author": "u/someone",
  "author_gender": "female",
  "title": "I (30f) went on my first date in 6 years…",
  "upvotes": "27.2k",
  "awards": "",
  "body": ["paragraph 1", "paragraph 2", "..."],
  "narration": "So I matched with this guy..."
}
```

**Important:** `body` = ORIGINAL Reddit paragraphs (for the scrolling background image). `narration` = YOUR rewritten script (for the voiceover).

## Step 6: Produce Video

```bash
export FAL_KEY=$(awk -F= '/^FAL_KEY=/{print $2}' .env)
GENDER=$(.venv/bin/python -c "import json; print(json.load(open('marketing/stories/output/{slug}/story.json')).get('author_gender','female'))")
.venv/bin/python scripts/produce_reddit_story.py \
    --story-json marketing/stories/output/{slug}/story.json \
    --gender $GENDER \
    --bg-music marketing/stories/music/wanderer.mp3 \
    --out marketing/stories/output/{slug}/
```

What this does (configured in `scripts/produce_reddit_story.py`):

1. **Step 1 — Reddit post image.** HTML rendered to PNG via headless Chrome (1080×4000, scrolls).
2. **Step 2 — TTS.** Voice routes by gender via `VOICE_CONFIGS`:
   - `male` → ElevenLabs pre-made `Brian` (warm narrator)
   - `female` → Minimax custom clone of Sarah Silverman (`Voicefbcfe5ff1777400650`)
   The script auto-prepends `"This is dating horror story, episode N."` where `N` is computed from the registry count.
3. **Step 3 — Whisper word timestamps.** FAL `fal-ai/whisper`, segment-level, split evenly into per-word timings.
4. **Step 4 — Karaoke ASS subtitles.** Per-word Dialogue lines, current word highlighted bright yellow (`#FFFF00`) at 115% scale, others white. Centered (Alignment 5), fontsize 108.
5. **Step 5 — BG music mix.** ffmpeg `sidechaincompress` (threshold 0.04, ratio 8:1, attack 20ms, release 400ms) ducks music when narration is present. Default music: `marketing/stories/music/wanderer.mp3` (more upbeat than `echoes_of_aurora.mp3`).
6. **Step 6 — Final assembly.** Vertical scroll over the post + Ken Burns ~10% zoom + ass burn-in. CRF 18, libx264.

**Voice override** if needed:
- `--voice <name>` — force ElevenLabs with a specific pre-made voice (e.g. `--voice Sarah`)
- `--voice-id <id>` — force Minimax with a specific cloned voice_id
- `--bg-music ''` — disable BG music

**Failure handling:**
- Minimax `voice-clone` flakes ~30% with `Failed to download preview audio`. The cached voice_id in `VOICE_CONFIGS` (`Voicefbcfe5ff1777400650` for Sarah) sidesteps cloning entirely — re-cloning is never required during normal operation.
- If FAL returns `User is locked. Reason: Exhausted balance` → tell the user to top up at fal.ai/dashboard/billing and stop. Do not retry.

## Step 7: Update Registry

Append to `marketing/stories/produced_stories.json`:

```json
{
  "reddit_url": "https://reddit.com/r/...",
  "title": "The story title",
  "produced_at": "YYYY-MM-DD",
  "output_dir": "marketing/stories/output/{slug}/"
}
```

Use today's date in YYYY-MM-DD format.

## Step 8: Upload to TikTok

Build the caption: `<hook line> #datinghorror #hinge #redditstories #storytime #datingfail #onlinedating` (swap `#hinge` for `#tinder` / `#bumble` matching the story).

```bash
.venv/bin/python scripts/upload_tiktok.py \
    --video marketing/stories/output/{slug}/final.mp4 \
    --caption "<caption>"
```

Behaviour:
- Pulls TikTok cookies from local Chrome via `browser_cookie3`
- Launches headful Playwright Chromium (TikTok detects headless)
- Walks page + iframes for the file input
- Dismisses TikTok's react-joyride onboarding overlay
- Scrolls to find the bottom-most `Post` button
- Handles the `Continue to post? Copyright check incomplete` confirmation modal
- Saves debug screenshots (`tiktok-*.png`) into the output dir

Exit codes: `0` success · `1` bad input · `2` session expired · `3` file input missing · `4`/`5` Post button missing/disabled · `6` posted but no clear success signal.

For the **very first run on a new machine** or when TikTok visibly changed their UI, run with `--dry-run` first to inspect the screenshots.

## Cron / Headless Operation

This skill runs nightly at 16:00 PT (= 7 PM ET) via `~/Library/LaunchAgents/com.tianzhichen.aaru.daily-post.plist`, which calls `scripts/cron_daily_post.sh`, which calls `claude -p "/reddit-story" --dangerously-skip-permissions`. All steps must work non-interactively — no prompts to the user, no waiting for stdin.

## Error Handling

- No good stories after searching 3+ subreddits → tell the user, stop
- Story body fetch fails → try a different post
- Voice cloning fails → retry once with backoff, then fall back to cached voice_id
- Whisper fails → retry once, otherwise fail the run (don't ship without word timestamps)
- Upload fails → surface exit code + screenshot paths
- FAL exhausted balance → tell user to top up, stop
- **Never silently skip steps. Never produce a video without subtitles. Never upload without verifying the post-success URL redirect.**

## Setup (one-time)

```bash
python3 -m venv .venv
.venv/bin/pip install browser-cookie3 playwright fal-client requests
.venv/bin/playwright install chromium

# Music + voices already in marketing/stories/{music,voices}/
# FAL_KEY in .env
```

## File Map

- `scripts/produce_reddit_story.py` — render → TTS → whisper → karaoke ASS → ducking → ffmpeg
- `scripts/upload_tiktok.py` — Playwright + Chrome cookies upload
- `scripts/cron_daily_post.sh` — launchd entrypoint
- `~/Library/LaunchAgents/com.tianzhichen.aaru.daily-post.plist` — daily 16:00 schedule
- `marketing/stories/voices/*.wav` — voice references (theo_von, sydney_sweeney, sarah_silverman, etc.)
- `marketing/stories/music/{echoes_of_aurora,wanderer}.mp3` — BG tracks
- `marketing/stories/produced_stories.json` — dedup registry
- `marketing/stories/output/{slug}/` — per-story workdir
