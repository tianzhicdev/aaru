# Marketing Video Strategy — "The Date That Didn't Click"

## Concept

A series of short narrated videos (60-90s each) telling real stories from Reddit about dates where two people had nothing in common and the conversation didn't click. Each video is narrated in first person, adapted from real posts, over ambient visuals.

## Why This Works

- **Universal pain:** Everyone who's used dating apps has been on a date where conversation died
- **Emotional hook:** These are real stories with real vulnerability — not manufactured content
- **No faces needed:** Visuals are ambient (restaurants, coffee shops, parks, city streets, phone screens). This solves both privacy concerns AND AI video generation limitations (no facial consistency required)
- **Thumos positioning:** Each video ends on the pain point. Thumos is the unspoken answer — we don't sell, we let the pain sell for us. Optional end card: "What if your match already knew what makes you light up?"

## Visual Rules

- Cinematic ambient footage: coffee shops, restaurant tables, park benches, city walks at dusk
- Close-ups of objects: two coffee cups, a phone screen, hands on a table, an empty chair
- Warm color grading, slightly desaturated — nostalgic, melancholic
- **Max 1 scene per video may show a face** (e.g. a selfie-style moment or a phone FaceTime screen). All other scenes are faceless — backs of heads, hands, silhouettes, objects. This avoids facial consistency issues entirely while allowing one human anchor moment.
- Art style: photorealistic cinematic, shallow depth of field, golden hour / warm indoor lighting

## Audio Rules

- First-person voiceover narration (warm, slightly tired, honest tone)
- Subtle ambient sound design (cafe noise, city hum, rain)
- Minimal music — piano or acoustic guitar, low in the mix
- **Voice must sound natural and flawed** — breaths, micro-pauses, slight imperfections, human characteristics. Should NOT sound like polished AI. Like someone telling a friend about their night, not a narrator reading a script.

## Selected Stories (Top 3)

### Video 1: "Am I Just Boring?"
**Source:** r/AskMen — "What is making me get ghosted after the first few dates?"
**Angle:** A guy who keeps getting ghosted. Coffee dates that go nowhere. The secret fear that he's just not interesting enough.
**Why:** Every introvert's nightmare. The repeated cycle of trying and failing.

### Video 2: "Something Is Missing"
**Source:** r/AskWomenOver30 — "Do you struggle to find someone compatible with your wit and weirdness?"
**Angle:** A woman who craves deep conversation but keeps getting stuck in small talk. She had it once and can't find it again.
**Why:** The female perspective. The longing for a real connection beyond "so what do you do?"

### Video 3: "It Didn't Click"
**Source:** r/GuyCry — "The date went great. Yet, it's a No."
**Angle:** A museum date that seemed perfect — laughing, touching, making out — then a text: "It didn't click for me."
**Why:** The cruelest version: when it looks right but something invisible is missing.

## Distribution

- TikTok / Reels / Shorts (vertical, 60-90s)
- Longer cuts for YouTube (2-3 min with more ambient breathing room)
- Carousel stills for Instagram (key quotes over ambient photos)

## Script Format

Each script follows the `scenes.json` format from the arabian-nights pipeline:
- `episode` metadata (title, context, art_style, narrator_style, consistent_objects)
- `scenes[]` array with narration sentences, video descriptions, and camera styles
- Each scene is one shot/visual moment with 1-2 narrated sentences
- Scripts are self-contained — sufficient for generating narrated videos

## End Card (all videos)

Fade to black. White text:
> "What if your match already knew what makes you light up?"
>
> Thumos — discover your soul, find your someone.

---

## Tech Stack (researched April 2026)

### Voice / TTS — optimizing for natural, flawed, human-sounding narration

| Rank | Tool | Why |
|------|------|-----|
| **#1** | **ElevenLabs v3** | Gold standard for narration. Audio Tags give per-line emotion control: `[whisper]`, `[sigh]`, `[tired]`, `[laughing]`. Deepest voice library (male + female). Proven for audiobook/long-form. ~$0.12/1K chars. |
| **#2** | **Fish Audio S2 Pro** | #1 on TTS-Arena2 benchmarks. 15,000+ free-form emotion tags at the word level (`[whisper in small voice]`, custom descriptions). Trained on 10M+ hours. 10x cheaper than ElevenLabs. Newer but technically superior on metrics. |
| **#3** | **Hume AI Octave 2** | LLM-native: *understands* what it's saying and infers emotion automatically. Beat ElevenLabs 71.6% in blind preference tests. Natural language direction ("sound wistful and tired"). Less manual control but more "actor reading a script" feel. ~$7.60/M chars. |

**Decision:** Start with **ElevenLabs v3** for the precision emotional control needed per-scene. Test **Fish Audio S2 Pro** as a cheaper alternative with potentially better raw quality. Use **Hume Octave 2** if we want to skip manual emotion tagging and let the model "act."

**Avoid:** OpenAI TTS (random pauses/stutters in extended output), Sesame CSM (no commercial API), Cartesia Sonic (optimized for real-time latency, not narration depth).

### Video Generation — optimizing for photorealistic ambient scenes

| Rank | Tool | Why |
|------|------|-----|
| **#1** | **Google Veo 3.1** | Most photorealistic output available. True 4K (3840x2160, 60fps). Excellent lighting and mood handling (candlelight, golden hour, cold morning). 95% prompt adherence. Native ambient audio generation. 8s clips via API at $0.40/s. |
| **#2** | **Runway Gen-4.5** | Best camera control in the industry. Camera Director sliders, Motion Brush 2.0, ControlNet guides. Up to 60s single generation. Most mature creator workflow (multi-shot sequencing, Aleph editor). 1080p max. |
| **#3** | **MiniMax Hailuo 2.3** | #2 on global blind benchmarks, outperforms Veo 3 on several metrics. Best physics (water, smoke, fabric, light). 1080p/24fps, 6-10s clips. Best quality-to-cost ratio for iteration. |

**Decision:** Use **Veo 3.1** for hero shots that need maximum photorealism (restaurant interiors, golden hour cityscapes, rain on glass). Use **Runway Gen-4.5** when camera choreography matters (slow dolly, rack focus, tracking shots). Use **Hailuo 2.3** for rapid iteration and physics-heavy scenes (steam from coffee, candle flicker, fabric movement).

**Avoid:** Sora (discontinued March 2026), Seedance 2.0 (legal trouble, 720p max), HappyHorse 1.0 (no API yet, too new), Pika (not competitive on photorealism).

**Watch:** HappyHorse 1.0 (Alibaba) — #1 on blind benchmarks by a wide margin. If it ships a stable API, it could replace everything above.

### Pipeline Architecture

```
Script JSON → [per scene]
  ├── Narration: ElevenLabs v3 API (sentences → .wav with emotion tags)
  ├── Video: Veo 3.1 / Runway Gen-4.5 API (video_description + camera_style → .mp4)
  ├── Ambient audio: Veo 3.1 native audio OR separate SFX library
  └── Assembly: FFmpeg composite (narration + video + ambient + music)
```

Each scene generates independently, then stitched in sequence with crossfades.

---

## Production Pipeline

Automated via `scripts/produce_video.py` using fal.ai APIs:

| Stage | Tool | Output |
|-------|------|--------|
| TTS | ElevenLabs v3 via fal.ai | .mp3 + word-level timestamps |
| Video | Kling 2.5 Turbo Pro via fal.ai | .mp4 clips (9:16 vertical) |
| Subtitles | Word timestamps -> .ass | Subtitle overlay |
| Assembly | FFmpeg | Per-scene composite -> concat -> burn subs -> final.mp4 |

### Usage

```bash
# Direct
./scripts/produce-video.sh marketing/stories/script-01-am-i-just-boring.json

# With voice selection
./scripts/produce-video.sh marketing/stories/script-02-something-is-missing.json --voice Daniel

# Via Claude Code skill
/produce-video marketing/stories/script-01-am-i-just-boring.json
```

### Resumability

Each intermediate file lives in `marketing/stories/output/{slug}/`. Re-running the script skips any existing files and picks up where it left off — safe to interrupt and resume.

### Output

```
marketing/stories/output/{slug}/
  audio/          # .mp3 + _timestamps.json per scene
  video/          # Kling .mp4 per scene (9:16)
  combined/       # Video+audio composites
  subtitles.ass   # Word-timed ASS subtitles
  final.mp4       # Finished vertical video
```

### Per-Video Cost

~$5-8 per finished video (TTS ~$0.12 + Video ~$5-7 depending on scene count and duration).

---

## Cost Analysis (15 videos/month, ~4/week)

### Volume assumptions

| Metric | Per video | Monthly (15 videos) | With 3x iteration |
|--------|----------|--------------------|--------------------|
| Narration chars | ~1,200 | ~18,000 | **~54,000** |
| Video clips (8s each) | ~13 | ~195 | **~585** |
| Video seconds | ~104s | ~1,560s | **~4,680s** |

### TTS cost comparison

TTS is negligible at this volume — pick on quality, not price.

| Tool | Pricing model | Monthly cost | Per video |
|------|--------------|-------------|----------|
| **Fish Audio S2 Pro** | $15/M bytes (API) | **~$1** | $0.07 |
| **Hume AI Octave 2** | $0.15/1K chars (overage) | **~$4-9** | $0.30-0.60 |
| **ElevenLabs v3** | $0.12/1K chars (API) | **~$8** | $0.53 |
| ElevenLabs v3 (Creator plan) | $11/mo flat (100K chars) | **$11** | $0.73 |

### Video generation cost comparison

This is where the real money goes. Huge spread: $146 to $1,872/mo.

| Tool | Pricing model | Per 8s clip | Monthly (585 clips) |
|------|--------------|------------|-------------------|
| **Hailuo 2.3 Fast** (fal.ai) | ~$0.25/clip | $0.25 | **~$146** |
| **Hailuo 2.3 Standard** (fal.ai) | ~$0.35/clip | $0.35 | **~$205** |
| **Hailuo 2.3 Pro 1080p** (fal.ai) | ~$0.49/clip | $0.49 | **~$287** |
| **Runway Gen-4.5** | $0.01/credit, 12 credits/s | $0.96 | **~$562** |
| **Veo 3.1 Fast** | $0.15/sec | $1.20 | **~$702** |
| **Veo 3.1 Standard** | $0.40/sec | $3.20 | **~$1,872** |

No subscription plan is cost-effective at 585 clips/month — all are designed for casual users.

### Recommended combos

| Strategy | TTS | Video | Total/mo | Notes |
|----------|-----|-------|---------|-------|
| **Budget** | Fish Audio ($1) | Hailuo Fast ($146) | **~$147** | Good enough for testing/iteration |
| **Smart hybrid** | ElevenLabs v3 ($8) | Hailuo Fast for drafts + Veo Fast for finals ($200-350) | **~$210-360** | Best balance of quality and cost |
| **Quality-first** | ElevenLabs v3 ($8) | Runway Gen-4.5 ($562) | **~$570** | Best camera control, good quality |
| **Maximum quality** | ElevenLabs v3 ($8) | Veo 3.1 Standard ($1,872) | **~$1,880** | Only for hero/flagship content |

### Recommended approach: Smart Hybrid (~$250/mo)

1. **TTS: ElevenLabs v3 API** — $8/mo. Best emotional control per-scene. Negligible cost.
2. **Video drafts: Hailuo 2.3 Fast via fal.ai** — ~$0.25/clip. Iterate fast and cheap to nail composition/mood.
3. **Video finals: Veo 3.1 Fast** — ~$1.20/clip. Re-generate only the best takes at higher quality (~30% of clips = ~175 clips = ~$210).
4. **Total: ~$250-300/month** for 15 polished videos.

This means each finished video costs **~$17-20** to produce.
