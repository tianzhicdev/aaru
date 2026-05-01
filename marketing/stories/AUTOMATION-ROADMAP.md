# Reddit Story → TikTok Pipeline — Progress

State as of 2026-04-29. This doc is the source of truth for what's running, what shipped, and what's still pending.

## TL;DR

End-to-end automated pipeline is live. **8 episodes produced and posted** over 5 days. Daily cron at 16:00 PT runs unattended via launchd → `claude -p "/reddit-story"` → produce → TikTok upload. Two outstanding operational issues (Reddit MCP quota, pmset wake) but neither blocks today's pipeline; they just risk silent skips going forward.

## Production stats

| Episode | Date | Story slug | OP gender | Voice | Mode |
|---|---|---|---|---|---|
| 1 | 2026-04-25 | reddit-horror | female | minimax (mis-routed male voice) | post |
| 2 | 2026-04-26 | tifu-date-with-ill-behaved-manchild | female | Sydney clone | post |
| 3 | 2026-04-27 | tinder-museum-meltdown | female | Sydney clone | post |
| 4 | 2026-04-28 | hinge-dine-and-dash | female | Sydney clone | post |
| 5 | 2026-04-28 | bumble-catfish-pretty-friend | male | Theo (old bad clone) | post |
| 6 | 2026-04-28 | bumble-cake-ghosted | male | Theo (old bad clone) | **broll** ⚠️ |
| 7 | 2026-04-28 | bumble-clipboard-girl (composite) | male | **Theo (new clone)** | post |
| 8 | 2026-04-29 | tifu-tinder-mlm-date | male | **Theo (new clone)** | post |

Successful daily cron runs: 3 in a row (4-27, 4-28, 4-29). All `claude exit=0`. Today's run (#8) succeeded despite the Reddit MCP quota being exhausted — Claude in-session pivoted to web search + news cross-reference for story discovery. Surprisingly resilient.

## Pipeline architecture (current)

```
LaunchAgent (16:00 PT daily)
  └─ scripts/cron_daily_post.sh
      └─ claude -p "/reddit-story" --dangerously-skip-permissions
          └─ /reddit-story skill
              ├─ Reddit MCP search (rapidapi_reddit) → pick story
              ├─ dedup against produced_stories.json
              ├─ rewrite narration in storytime style
              ├─ write story.json (with author_gender)
              └─ scripts/produce_reddit_story.py
                  ├─ render post.png (HTML → headless Chrome)
                  ├─ Minimax TTS via cached voice_id
                  │   └─ Theo Von / Sarah Silverman clones
                  ├─ Whisper word timestamps (FAL)
                  ├─ Karaoke ASS subtitles (per-word yellow highlight)
                  ├─ Sidechain music ducking (ffmpeg)
                  └─ Final assembly (Ken Burns zoom + ass burn-in)
              └─ update produced_stories.json
              └─ scripts/upload_tiktok.py
                  ├─ extract Chrome cookies (browser_cookie3)
                  ├─ Playwright Chromium → TikTok Studio
                  ├─ dismiss joyride, scroll, click Post
                  └─ handle "Continue to post?" copyright modal
```

## Voice routing

Both genders now use **Minimax custom voice clones** (cached `voice_id`s, no re-clone per run):

| Gender | Voice | `voice_id` | Source clip |
|---|---|---|---|
| male | Theo Von | `Voice83164ab01777433871` | 30s mid-monologue from *This Past Weekend* #654 |
| female | Sarah Silverman | `Voicefbcfe5ff1777400650` | 30s of solo speech from her HBO trailer / podcast clip |

Old male clone (`Voicedaf3493d1777431422`, from a 15s file) was producing a non-male/uncertain voice — discarded. Episodes 5 and 6 used it.

**`scripts/produce_reddit_story.py:VOICE_CONFIGS`** is the single source of truth for routing.

**Override flags:**
- `--voice <name>` — force ElevenLabs pre-made (e.g. `Brian`, `Sarah`)
- `--voice-id <id>` — force a specific Minimax voice_id
- `--gender male|female` — picks via VOICE_CONFIGS (default cron behavior)

## Quality upgrades shipped

| # | Upgrade | Where | Effect |
|---|---|---|---|
| 1 | **Karaoke captions** | `write_ass_subtitles()` | Per-word yellow highlight + 115% scale on current word, white on neighbors. Centered (Alignment 5), fontsize 108. |
| 2 | **Sidechain music ducking** | `mix_bg_music()` | ffmpeg `sidechaincompress` — music auto-ducks under speech (threshold 0.04, ratio 8:1, attack 20ms, release 400ms) |
| 3 | **Ken Burns zoom** | `assemble_video()` | `zoompan` adds ~10% slow zoom over the whole clip, capped at 1.10× |
| 4 | **ElevenLabs/Minimax dual TTS** | `generate_tts()` dispatcher | Provider routes by `voice_cfg.provider` |
| 5 | **"Episode N" auto-opener** | `next_story_number()` | Counts registry, prepends "This is dating horror story, episode N." to narration |
| 6 | **Wanderer BG track** | default `--bg-music` | Replaced ambient *Echoes of Aurora* with chill indie *Wanderer* (Atch & Hotham) for more upbeat tone |

## Modes

| Mode | Default? | Status | What it does |
|---|---|---|---|
| `post` | ✅ | **prod** | Scrolling Reddit post image as backdrop with karaoke captions over it |
| `broll` | ❌ | **experimental** | AI-generated Pika 2.2 illustrated B-roll. Tested once (episode 6 / bumble-cake-ghosted). Quality and aspect ratio came out poorly. Not used in production. |

`--mode broll` flag remains in the script for experimentation but is never invoked by the cron.

## Cost economics (per-video, post mode)

| Item | Cost |
|---|---|
| Minimax TTS (~1.8k chars × $0.0006/sec) | ~$0.27 |
| Whisper word timestamps | ~$0.05 |
| Voice cloning | $0 (cached voice_id, no re-clone) |
| Anthropic API (story search/rewriting via in-session claude) | ~$0.05 |
| **Total per episode** | **~$0.37** |
| **Monthly (daily cron)** | **~$11** |

B-roll mode (Pika 2.2): ~$2/video → $60/month, abandoned.

## Operational issues — outstanding

### 1. Reddit MCP quota exhausted ⚠️

RapidAPI BASIC tier monthly quota hit. `mcp__rapidapi_reddit__v1search` returns "exceeded the MONTHLY quota for Requests." Today's cron worked anyway because Claude pivoted to web search + news cross-reference, but story quality could degrade and that path is fragile.

**Fix:** upgrade at https://rapidapi.com/sparior/api/reddit3 (PRO tier ~$10–25/mo for thousands of calls), or wait for the monthly reset (typically same date as account creation).

### 2. pmset wake not configured ⚠️

If the Mac is asleep at 16:00 PT, the cron silently skips. Inspection: `pmset -g sched` shows no recurring 15:55 wake event.

**Fix (one-time):**
```bash
sudo pmset repeat wake MTWRFSU 15:55:00
```

### 3. "Only me" privacy default

User's TikTok account defaults new posts to "Only me." Posts are visible in TikTok Studio but not on the public feed until manually flipped. Not script-fixable; TikTok's Posting API would solve this but requires audited app status (1–2 wk approval).

### 4. Episode 6 (B-roll) cleanup

`bumble-cake-ghosted` posted with bad voice + bad AI visuals. Recommend deleting in Studio → Posts to keep drafts clean. (Privacy "Only me" so it isn't on the public feed regardless.)

## File map

| Path | Role |
|---|---|
| `scripts/produce_reddit_story.py` | Render → TTS (Minimax/ElevenLabs) → Whisper → karaoke ASS → sidechain mix → ffmpeg assembly. Supports `--mode post` (default) and `--mode broll`. |
| `scripts/upload_tiktok.py` | Playwright + Chrome cookies upload to TikTok Studio. Handles iframes, joyride, copyright-check modal. |
| `scripts/cron_daily_post.sh` | launchd entrypoint — sources `.env`, calls `claude -p "/reddit-story"`, 30-min watchdog, logs to `marketing/stories/cron.log`. |
| `~/Library/LaunchAgents/com.tianzhichen.aaru.daily-post.plist` | Daily 16:00 schedule, `KeepAlive=false`, logs to `cron.{stdout,stderr}.log`. |
| `.claude/skills/reddit-story/SKILL.md` | The skill that orchestrates story discovery, narration rewrite, produce, upload, registry update. |
| `marketing/stories/voices/{theo_von,sarah_silverman}.wav` | Voice references (30s, mono 24kHz PCM). |
| `marketing/stories/voices/celebrity_samples/*.mp3` | Auditioned voices kept as reference. |
| `marketing/stories/music/{wanderer,echoes_of_aurora}.mp3` | BG tracks; Wanderer is current default. |
| `marketing/stories/produced_stories.json` | Dedup registry, schema: `{reddit_url, title, produced_at, output_dir, mode?}`. |
| `marketing/stories/output/{slug}/` | Per-episode workdir: `story.json`, `post.png`, `narration.wav`, `narration_with_bg.wav`, `subtitles.ass`, `timestamps.json`, `final.mp4`, `tiktok-*.png` debug screenshots. |
| `marketing/stories/cron.log` | Wrapper log, timestamped per-day blocks. |
| `marketing/stories/REDDIT-STORY-STRATEGY.md` | Earlier creative strategy notes. |

## What's working well

- **Cron reliability**: 3 in a row, no human-in-the-loop. Self-recovers from MCP failures.
- **Cost**: ~$11/month for 30 episodes is well under any creator-tool subscription.
- **Voice quality**: post-Theo-re-clone, both genders sound distinct + characterful.
- **Karaoke captions** are the biggest single perceived-quality bump — TikTok-native aesthetic.
- **Skill+script split**: Claude handles creative (story selection, narration rewrite); script handles deterministic (TTS, ffmpeg, upload). Clear separation; either side can be rebuilt without the other.

## What didn't work

- **AI B-roll (Pika 2.2)**: Quality at 720p with abstract POV prompts is poor. Aspect ratio handling produced odd cropping. Cost would be 5–10× current pipeline. Abandoned for prod; flag stays for future experiments.
- **Initial Theo Von clone**: 15s source from a misnamed file produced a non-male voice. Re-cloned from confirmed 30s monologue clip — much better.
- **ElevenLabs voice cloning**: not exposed via FAL. Would require direct ElevenLabs API integration.
- **TikTok Posting API**: not pursued yet. Audit takes 1–2 weeks; Playwright path works for now.

## Roadmap (not started)

- **TikTok Content Posting API** application — addresses both `Only me` privacy default and the entire Playwright fragility surface. Free to apply, ~1–2 wk for audit.
- **Phantomwright migration** for the uploader — drop-in for the current vanilla Playwright; built specifically to evade TikTok bot detection.
- **Engagement A/B**: track view counts on episodes 1–8 to see what's actually performing. Then prune or double-down.
- **Two posts/day**: 16:00 + 12:00 (lunch peak) — would double output if Reddit MCP quota allows.
- **Multi-language pivot**: minimax + ElevenLabs both support multilingual; could translate stories for ES/PT-BR/DE markets.
