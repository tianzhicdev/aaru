---
name: reddit-story
description: |
  Find a Reddit dating app horror story, produce a narrated video
  (scrolling post + voice-cloned TTS + subtitles), and upload to TikTok.
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
---

# /reddit-story — Reddit Dating Horror Story Video Pipeline

You are producing a narrated TikTok video from a Reddit dating horror story. Follow these steps in order.

## Step 1: Find a Story

Search Reddit for dating app horror stories using the Reddit MCP tools. Try multiple search queries across multiple subreddits until you find a good candidate.

**Search queries** (try at least 2-3):
- `dating app horror story`
- `worst tinder date`
- `catfished`
- `dating disaster`
- `worst date ever`
- `online dating nightmare`

**Subreddits** (search across these):
- `tifu`
- `dating`
- `Tinder`
- `hingeapp`
- `OnlineDating`
- `relationship_advice`

Use `mcp__rapidapi_reddit__v1search` to find posts, then `mcp__rapidapi_reddit__v1post-details_incl_comments` to get the full post body.

## Step 2: Dedup

Read `marketing/stories/produced_stories.json`. Skip any story whose **title** or **URL** is already in the registry. If the story you found is a duplicate, go back to Step 1 and find another.

## Step 3: Evaluate Story Quality

The story MUST meet ALL of these criteria:

1. **Clear narrative arc** — setup, escalation, punchline/twist
2. **Right length** — 1500-3000 characters body text (produces 60-150s of narration)
3. **High engagement** — 10K+ upvotes preferred (5K+ acceptable if the story is exceptional)
4. **Specific absurd detail** — one memorable, quotable moment that makes people say "no way"
5. **Punchy ending** — the story ends strong, not with a whimper

If the story doesn't meet these criteria, go back to Step 1. Tell the user why you rejected it.

## Step 4: Rewrite Narration

Rewrite the Reddit post for spoken delivery. This is the script that will be read aloud. Rules:

- **Lead with the setup**, not meta-commentary (no "So this happened on Reddit")
- **Short punchy sentences** — break up long paragraphs
- **Natural transitions** — "So" and "Then" to bridge sections
- **CAPITALIZE emphasis words** — the words that carry the emotional punch
- **End on the strongest line** — rearrange if needed so the last line hits hardest
- **Cut filler** — remove "Edit:", "TL;DR", "obligatory this happened X years ago", etc.
- **Keep the voice** — preserve the original poster's personality and humor
- **Target 60-120 seconds** when read aloud (~150-300 words)

## Step 5: Write Story JSON

Create a slug from the title (lowercase, hyphens, max 40 chars). Save to `marketing/stories/output/{slug}/story.json`:

```json
{
  "subreddit": "r/tifu",
  "author": "u/someone",
  "title": "TIFU by...",
  "upvotes": "47.8k",
  "awards": "Wholesome",
  "body": ["paragraph 1", "paragraph 2"],
  "narration": "So I matched with this guy..."
}
```

**Important:** The `body` field is the ORIGINAL Reddit post paragraphs (for the scrolling background). The `narration` field is YOUR rewritten script (for the voiceover).

## Step 6: Produce Video

Run the production pipeline. Use a voice reference that is at least 10 seconds long (minimax requires >= 10s for voice cloning).

```bash
export FAL_KEY=$(grep FAL_KEY .env | cut -d= -f2)
python scripts/produce_reddit_story.py \
    --story-json marketing/stories/output/{slug}/story.json \
    --voice-ref marketing/stories/tts-auditions/voices/mark_narrations.wav \
    --out marketing/stories/output/{slug}/
```

This will:
1. Render the Reddit post as a scrolling background image
2. Voice-clone TTS narration via minimax
3. Get word-level timestamps via Whisper
4. Burn subtitles and assemble final.mp4 (1080x1920 vertical)

Wait for it to complete. If it fails, show the error to the user.

## Step 7: Update Registry

Read `marketing/stories/produced_stories.json`, append the new entry, and write it back:

```json
{
  "reddit_url": "https://www.reddit.com/r/...",
  "title": "The story title",
  "produced_at": "YYYY-MM-DD",
  "output_dir": "marketing/stories/output/{slug}/"
}
```

## Step 8: Ready for Upload

Present the finished video to the user with all the info they need to upload manually:

- **Video path:** `marketing/stories/output/{slug}/final.mp4`
- **Caption:** story title + hashtags
- **Hashtags:** `#datinghorror #tinder #redditstories #storytime #datingfail #onlinedating`

The user uploads manually via tiktok.com/upload or their Chrome extension. TikTok's Content Posting API requires business app review and is not suitable for personal account uploads.

## Error Handling

- If no good stories are found after searching 3+ subreddits: tell the user and stop
- If video production fails: show the error output and stop
- Never silently skip steps
