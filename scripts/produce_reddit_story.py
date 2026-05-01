#!/usr/bin/env python3
"""
produce_reddit_story.py — Reddit post narration video.

Pipeline:
  1. Render Reddit post as a scrolling background image (HTML → screenshot)
  2. Voice-clone narrate the story via minimax
  3. Get word timestamps via Whisper
  4. Burn word-level subtitles onto the post background
  5. Output final.mp4 (vertical 1080x1920)

Usage:
    export FAL_KEY=...
    python scripts/produce_reddit_story.py \
        --voice-ref marketing/stories/tts-auditions/full/csm_1b/audio/scene_01.wav \
        --out marketing/stories/output/reddit-horror/

    # Or with a story JSON file:
    python scripts/produce_reddit_story.py \
        --story-json marketing/stories/output/my-story/story.json \
        --voice-ref marketing/stories/tts-auditions/full/csm_1b/audio/scene_01.wav \
        --out marketing/stories/output/my-story/
"""

import argparse
import json
import os
import subprocess
import sys
import textwrap
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

# Lazy imports
fal_client = None
requests = None

ELEVENLABS_TTS_MODEL = "fal-ai/elevenlabs/tts/multilingual-v2"
MINIMAX_TTS_MODEL = "fal-ai/minimax/speech-02-hd"
WHISPER_MODEL = "fal-ai/whisper"
PIKA_MODEL = "fal-ai/pika/v2.2/text-to-video"
SHOT_PLANNER_MODEL = "claude-haiku-4-5"

BROLL_STYLE = (
    "Stylized 2D illustration, hand-drawn ink line art, soft pastel watercolor palette, "
    "painterly New Yorker animation style, gentle cinematic motion, POV first-person "
    "perspective, no faces visible, no phone screens, no readable text, 9:16 vertical."
)

# Voice config per gender. Two providers:
#   - "elevenlabs": pre-made voice by name (no cloning available via FAL)
#   - "minimax":   custom-cloned voice by voice_id
# Minimax voice IDs come from running clone_voice() once per ref WAV; cache them
# here so we don't re-clone on every produce run (and avoid the flaky preview-
# audio failure mode).
VOICE_CONFIGS = {
    "male":   {"provider": "minimax", "voice_id": "Voice83164ab01777433871"},  # Theo Von (re-cloned from 30s This Past Weekend #654)
    "female": {"provider": "minimax", "voice_id": "Voicefbcfe5ff1777400650"},  # Sarah Silverman
}
FONT_PATH = "/System/Library/Fonts/Helvetica.ttc"


# ── Reddit Story ──

DEFAULT_STORY = {
    "subreddit": "r/tifu",
    "author": "u/burgers_and_grief",
    "title": "TIFU By inviting a Tinder date over to my house and accidentally meeting his mother",
    "upvotes": "47.8k",
    "awards": "Wholesome · Helpful · Silver",
    "body": [
        "Like many other unfortunate souls, my nonexistent dating life has me turning to the dating apps. This particular one is from Tinder.",
        "I'd been chatting with this guy a few days, and everything was going swimmingly. We had so much in common and were looking for the same things. His pictures were cute, and he didn't live too far away. All seemed well.",
        "I invited him over to grill out some burgers in my backyard. He asked if he could bring anything — I said sure bring some bacon for the burgers! He agreed and said he'd be over soon.",
        'Given his distance, I expected him to be over in about 15 minutes. I started the grill and seasoned the burgs. Half an hour later he messaged me, "I\'ve driven by a couple times and chickened out. Are you sure you want me to come over?" Maybe a red flag, but I chalked it up to nerves and just said come on I\'m hungry.',
        "So this Hagrid lookin guy shows up, much different than his Cedric picture. That's alright, I can move past that. From the minute he walked up, and I kid you not, he did NOT take a breath. Within the first five minutes I knew his life story from his aunt who hated their grandma to his father who likes to collect taxidermy. Not a single breath.",
        "Again I figured he was just nervous. I put the burgers on, and when they're ready he pulls out a ziploc from his POCKET with two pieces of bacon in it. He puts them only on his burger. Okay...",
        'We sit down at the patio table to start eating. I finished my burger before he even started his — he did NOT stop talking the entire time. When we sit down, he reaches into his pocket and pulls out... a vial? It is about 2 inches tall with a cork in it. It\'s filled with a greyish powder. He must have noticed me staring at it. He said, "Oh," all super casual. "I\'d like to INTRODUCE YOU TO MY MOTHER."',
        "I just stared at him for what felt like an eternity. I didn't know whether to laugh or cry or run.",
        '"I like to bring her to any important event in my life. She also has ashes in this necklace I\'m wearing, and in this ring I have on, and this half-sleeve tattoo is for her."',
        "Now, mind you, I've lost too many people close to me, and I do not judge people based on their grief cycles, we all cope differently and I respect that. But homeboy brought a VIAL of his mother's ashes, and set them on the table for our FIRST date. I simply could not.",
        'He finally finished his burger and I made some excuse about having to clock in and finish some work... at 9:30pm. He texted me before he even got to his car and told me "My mother really liked you, I can\'t wait to see you again."',
        "I told him I didn't feel the connection — to him, or his mother.",
    ],
}

# Narration script — the story rewritten for spoken delivery
DEFAULT_NARRATION = """So I matched with this guy on Tinder. We'd been chatting for a few days, everything seemed great. We had a lot in common, his pictures were cute, he lived close by. I invited him over to grill some burgers.

He asked if he could bring anything. I said sure, bring some bacon for the burgers. He agreed and said he'd be over soon.

Fifteen minutes go by. Then thirty. Then he texts me: "I've driven by a couple times and chickened out. Are you sure you want me to come over?" Maybe a red flag, but I figured he was just nervous. I told him to come on, I'm hungry.

So this Hagrid looking guy shows up. Much different than his Cedric picture. That's alright, I can move past that. But from the minute he walked up, he did NOT take a breath. Within five minutes I knew his entire life story, from his aunt who hated their grandma, to his father who collects taxidermy.

I put the burgers on. When they're ready, he pulls out a Ziploc bag from his POCKET, with two pieces of bacon in it. He puts them only on his burger.

We sit down to eat. I finished my burger before he even started his, because he did not stop talking the entire time.

Then he reaches into his pocket and pulls out... a vial. About two inches tall with a cork in it. Filled with a greyish powder.

He must have noticed me staring at it. He said, "Oh," all super casual. "I'd like to INTRODUCE YOU TO MY MOTHER."

I just stared at him. I didn't know whether to laugh, or cry, or run.

He tells me, "I like to bring her to any important event in my life. She also has ashes in this necklace, and in this ring, and this half-sleeve tattoo is for her."

Now look, I've lost people close to me. I do not judge anyone for how they grieve. But this man brought a VIAL of his mother's ashes, set them on the table, for our FIRST date.

He finished his burger. I made some excuse about having to clock in for work... at nine thirty PM.

He texted me before he even got to his car: "My mother really liked you, I can't wait to see you again."

I told him I didn't feel the connection. To him, or his mother."""


def load_story_json(path):
    """Load story + narration from a JSON file."""
    with open(path) as f:
        data = json.load(f)
    story = {
        "subreddit": data.get("subreddit", "r/unknown"),
        "author": data.get("author", "u/unknown"),
        "title": data["title"],
        "upvotes": data.get("upvotes", ""),
        "awards": data.get("awards", ""),
        "body": data["body"],
    }
    narration = data["narration"]
    return story, narration


# ── Helpers ──

def get_duration(path):
    r = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(json.loads(r.stdout)["format"]["duration"])


def download(url, path):
    resp = requests.get(url, timeout=300, stream=True)
    resp.raise_for_status()
    with open(path, "wb") as f:
        for chunk in resp.iter_content(8192):
            if chunk:
                f.write(chunk)


def ass_time(secs):
    h = int(secs // 3600)
    m = int((secs % 3600) // 60)
    s = secs % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def ffmpeg_run(cmd, label=""):
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        err = result.stderr[-1200:] if result.stderr else "no stderr"
        raise RuntimeError(f"FFmpeg failed ({label}): {err}")


# ── Step 1: Reddit Post Background ──

def render_post_image(out_path, story):
    """Render the Reddit post as a tall image using HTML → wkhtmltoimage or similar."""
    if out_path.exists() and out_path.stat().st_size > 0:
        print("  skip  Post image exists")
        return

    # Build HTML that looks like a Reddit post
    paragraphs = "\n".join(
        f'<p class="body">{p}</p>' for p in story["body"]
    )

    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{
    background: #1a1a1b;
    color: #d7dadc;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    padding: 40px 50px 80px 50px;
    width: 1080px;
  }}
  .post-container {{
    background: #272729;
    border-radius: 12px;
    padding: 40px 44px;
    border: 1px solid #343536;
  }}
  .meta {{
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
  }}
  .subreddit {{
    font-weight: 700;
    font-size: 22px;
    color: #d7dadc;
  }}
  .dot {{ color: #818384; font-size: 18px; }}
  .author {{
    font-size: 20px;
    color: #818384;
  }}
  .title {{
    font-size: 36px;
    font-weight: 600;
    color: #ffffff;
    line-height: 1.3;
    margin-bottom: 24px;
  }}
  .body {{
    font-size: 26px;
    line-height: 1.65;
    color: #d7dadc;
    margin-bottom: 20px;
  }}
  .votes {{
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 28px;
    padding-top: 20px;
    border-top: 1px solid #343536;
  }}
  .arrow {{ font-size: 28px; color: #818384; }}
  .arrow.up {{ color: #ff4500; }}
  .score {{
    font-weight: 700;
    font-size: 24px;
    color: #ff4500;
  }}
  .awards {{
    font-size: 18px;
    color: #818384;
    margin-top: 12px;
  }}
</style>
</head>
<body>
<div class="post-container">
  <div class="meta">
    <span class="subreddit">{story['subreddit']}</span>
    <span class="dot">·</span>
    <span class="author">{story['author']}</span>
  </div>
  <div class="title">{story['title']}</div>
  {paragraphs}
  <div class="votes">
    <span class="arrow up">▲</span>
    <span class="score">{story['upvotes']}</span>
    <span class="arrow">▼</span>
  </div>
  <div class="awards">{story['awards']}</div>
</div>
</body>
</html>"""

    html_path = out_path.parent / "post.html"
    html_path.write_text(html)

    # Try wkhtmltoimage first, fall back to Chrome headless
    try:
        subprocess.run(
            ["which", "wkhtmltoimage"], capture_output=True, check=True,
        )
        subprocess.run([
            "wkhtmltoimage", "--width", "1080", "--quality", "95",
            "--enable-local-file-access",
            str(html_path), str(out_path),
        ], capture_output=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        # Chrome headless screenshot
        chrome_paths = [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
        ]
        chrome = None
        for p in chrome_paths:
            if os.path.exists(p):
                chrome = p
                break
        if not chrome:
            raise RuntimeError("Need wkhtmltoimage or Google Chrome for screenshot")

        subprocess.run([
            chrome,
            "--headless=new",
            "--disable-gpu",
            "--no-sandbox",
            f"--screenshot={out_path}",
            f"--window-size=1080,4000",
            f"file://{html_path.resolve()}",
        ], capture_output=True, check=True)

    print(f"  done  Post image: {out_path}")


# ── Step 2: Voice Clone TTS ──

def _download_and_convert(audio_url, out_path):
    """Common: download audio from URL, convert to mono 24kHz PCM wav."""
    tmp = out_path.with_suffix(".mp3")
    download(audio_url, tmp)
    ffmpeg_run([
        "ffmpeg", "-y", "-i", str(tmp),
        "-ac", "1", "-ar", "24000", "-acodec", "pcm_s16le",
        str(out_path),
    ], label="tts mp3→wav")
    tmp.unlink(missing_ok=True)
    return get_duration(out_path)


def generate_tts_elevenlabs(voice_name, text, out_path):
    """ElevenLabs TTS via FAL. `voice_name` is a pre-made ElevenLabs voice."""
    if out_path.exists() and out_path.stat().st_size > 0:
        dur = get_duration(out_path)
        print(f"  skip  TTS exists ({dur:.1f}s)")
        return dur
    print(f"  ElevenLabs TTS via {voice_name} ({len(text)} chars)...", end="", flush=True)
    res = fal_client.subscribe(ELEVENLABS_TTS_MODEL, arguments={
        "text": text, "voice": voice_name,
        "stability": 0.45, "similarity_boost": 0.75, "speed": 0.97,
    })
    audio = res.get("audio")
    url = audio.get("url") if isinstance(audio, dict) else None
    if not url:
        raise RuntimeError(f"No audio URL: {json.dumps(res)[:300]}")
    dur = _download_and_convert(url, out_path)
    print(f" done ({dur:.1f}s)")
    return dur


def generate_tts_minimax(voice_id, text, out_path):
    """Minimax TTS via FAL with a previously-cloned custom voice_id."""
    if out_path.exists() and out_path.stat().st_size > 0:
        dur = get_duration(out_path)
        print(f"  skip  TTS exists ({dur:.1f}s)")
        return dur
    print(f"  Minimax TTS via {voice_id[:24]} ({len(text)} chars)...", end="", flush=True)
    res = fal_client.subscribe(MINIMAX_TTS_MODEL, arguments={
        "text": text, "voice_id": voice_id, "speed": 0.97,
    })
    audio = res.get("audio")
    url = audio.get("url") if isinstance(audio, dict) else res.get("audio_url")
    if not url:
        raise RuntimeError(f"No audio URL: {json.dumps(res)[:300]}")
    dur = _download_and_convert(url, out_path)
    print(f" done ({dur:.1f}s)")
    return dur


def generate_tts(voice_cfg, text, out_path):
    """Dispatch TTS to the right provider based on voice_cfg dict."""
    provider = voice_cfg["provider"]
    if provider == "elevenlabs":
        return generate_tts_elevenlabs(voice_cfg["voice"], text, out_path)
    if provider == "minimax":
        return generate_tts_minimax(voice_cfg["voice_id"], text, out_path)
    raise RuntimeError(f"Unknown TTS provider: {provider}")


# ── Step 3: Whisper Timestamps ──

def get_word_timestamps(audio_path):
    """Get word-level timestamps via Whisper."""
    print("  Getting word timestamps via Whisper...", end="", flush=True)
    audio_url = fal_client.upload_file(str(audio_path))
    result = fal_client.subscribe(WHISPER_MODEL, arguments={
        "audio_url": audio_url,
        "task": "transcribe",
        "language": "en",
        "chunk_level": "segment",
    })
    chunks = result.get("chunks", [])
    print(f" done ({len(chunks)} segments)")
    return chunks


def normalize_timestamps(raw_ts, audio_duration):
    """Normalize Whisper output to [(word, start, end), ...]."""
    words = []
    for entry in raw_ts:
        w = entry.get("text", "").strip()
        ts = entry.get("timestamp")
        if ts and isinstance(ts, (list, tuple)) and len(ts) >= 2:
            s = float(ts[0]) if ts[0] is not None else 0
            e = float(ts[1]) if ts[1] is not None else s + 0.3
            # Split multi-word segments evenly
            seg_words = w.split()
            if len(seg_words) > 1:
                dur = (e - s) / len(seg_words)
                for i, sw in enumerate(seg_words):
                    words.append((sw, s + i * dur, s + (i + 1) * dur))
            elif w:
                words.append((w, s, e))
    return words


def group_into_phrases(word_ts, max_words=4):
    """Group word timestamps into subtitle phrases."""
    phrases = []
    i = 0
    while i < len(word_ts):
        chunk = word_ts[i:i + max_words]
        text = " ".join(w[0] for w in chunk)
        phrases.append((text, chunk[0][1], chunk[-1][2]))
        i += max_words
    return phrases


# ── Step 4: ASS Subtitles ──

def _esc_ass(text: str) -> str:
    return text.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}")


def write_ass_subtitles(word_ts, title, output_path, max_words: int = 4):
    """Karaoke-style: render rolling 4-word windows with the *current* word
    highlighted bright yellow + slightly scaled, the rest plain white. We emit
    one Dialogue line per word position so transitions are seamless."""
    header = f"""[Script Info]
Title: {title}
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Helvetica Neue,108,&H00FFFFFF,&H000000FF,&H00000000,&HC8000000,-1,0,0,0,100,100,2,0,1,5,2,5,40,40,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"""

    HIGHLIGHT = r"\c&H0000FFFF&"  # ASS BGR: bright yellow (#FFFF00)
    NORMAL = r"\c&H00FFFFFF&"     # white

    lines = [header]
    n = len(word_ts)
    for i in range(0, n, max_words):
        chunk = word_ts[i:i + max_words]
        for j, (cur_w, cur_s, cur_e) in enumerate(chunk):
            # Each word line ends when the next word starts (next-in-chunk,
            # else first word of next chunk, else word's own end + small hold).
            if j + 1 < len(chunk):
                line_end = chunk[j + 1][1]
            elif i + max_words < n:
                line_end = word_ts[i + max_words][1]
            else:
                line_end = cur_e + 0.3

            # Build phrase text with the current word highlighted + scaled.
            parts = []
            for k, (w, _, _) in enumerate(chunk):
                esc = _esc_ass(w)
                if k == j:
                    parts.append(
                        f"{{{HIGHLIGHT}\\fscx115\\fscy115}}{esc}"
                        f"{{{NORMAL}\\fscx100\\fscy100}}"
                    )
                else:
                    parts.append(esc)
            text = " ".join(parts)

            # Fade only at phrase boundaries; mid-phrase transitions stay sharp.
            fade_in = 80 if j == 0 else 0
            fade_out = 80 if j == len(chunk) - 1 else 0
            fade = f"{{\\fad({fade_in},{fade_out})}}" if (fade_in or fade_out) else ""

            lines.append(
                f"Dialogue: 0,{ass_time(cur_s)},{ass_time(line_end)},"
                f"Default,,0,0,0,,{fade}{text}"
            )

    output_path.write_text("\n".join(lines) + "\n")


# ── Step 5: Final Assembly ──

def mix_bg_music(narration_path, music_path, duration, out_path):
    """Mix BG music under narration with sidechain ducking. The music sits at
    ~50% volume in speech gaps and is auto-pulled down by the compressor
    whenever the narration is present. Sounds noticeably more produced than a
    fixed-volume mix."""
    if out_path.exists() and out_path.stat().st_size > 0:
        out_path.unlink()
    fade_out_st = max(duration - 1.5, 0)
    cmd = [
        "ffmpeg", "-y",
        "-i", str(narration_path),
        "-stream_loop", "-1", "-i", str(music_path),
        "-t", f"{duration:.2f}",
        "-filter_complex",
        # Split narration: one copy for the mix, one as sidechain trigger.
        "[0:a]asplit=2[narr][sc];"
        # Music: ride the loop, set base volume, fade in/out at edges.
        "[1:a]volume=0.5,"
        "afade=t=in:st=0:d=1.5,"
        f"afade=t=out:st={fade_out_st:.2f}:d=1.5[bg];"
        # Sidechain compressor: duck music whenever speech is present.
        # threshold=0.04 (~-28dB), ratio=8:1, fast attack, medium release.
        "[bg][sc]sidechaincompress="
        "threshold=0.04:ratio=8:attack=20:release=400:level_sc=0.9:makeup=1[bg_ducked];"
        # Combine speech + ducked music. normalize=0 keeps narration at unity.
        "[narr][bg_ducked]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]",
        "-map", "[a]",
        "-ac", "2", "-ar", "44100", "-acodec", "pcm_s16le",
        str(out_path),
    ]
    ffmpeg_run(cmd, label="bg music mix (sidechain ducked)")


# ── B-roll Mode (AI-generated illustrated scenes via Pika 2.2) ──

def plan_broll_shots(narration: str, duration: float, out_path):
    """Use Claude to split narration into ~5s shots and write a Pika prompt
    per shot. Output JSON: [{idx, start, end, prompt}, ...]."""
    if out_path.exists() and out_path.stat().st_size > 0:
        print(f"  skip  shots plan exists")
        return json.loads(out_path.read_text())

    n_shots = max(4, round(duration / 5.0))
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY missing — required for shot planning")

    system = f"""You are a visual director for a TikTok storytime video about a Reddit dating-horror story.

Your job: split the narration into {n_shots} shots and write a Pika 2.2 text-to-video prompt for each.

VISUAL CONSTRAINTS (apply to EVERY shot — non-negotiable):
- {BROLL_STYLE}
- NEVER show human faces (use hands, back of head, silhouette, environment)
- NEVER show phone screens or readable text
- No fast action; subtle motion only

SHOT GUIDELINES:
- One shot per ~5 seconds of narration
- Each shot illustrates the narrative beat at that moment
- POV-first: hands doing things, walking, the room around them
- Vary scenes (kitchen → window → table → counter), don't repeat the same prop
- Show the AFTER of an action rather than the action itself when possible

OUTPUT: ONLY a JSON array. No prose. Schema:
[{{"idx": 0, "start": 0.0, "end": 5.0, "prompt": "..."}}, ...]

Each prompt: 30-50 words, painterly, specific scene, embeds the style cues. Do NOT include character faces, dating-app UI, or readable text."""

    user_msg = f"NARRATION:\n{narration}\n\nTOTAL DURATION: {duration:.1f}s\nN_SHOTS: {n_shots}"

    print(f"  Planning {n_shots} shots via {SHOT_PLANNER_MODEL}...", flush=True)
    resp = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": SHOT_PLANNER_MODEL,
            "max_tokens": 4096,
            "system": system,
            "messages": [{"role": "user", "content": user_msg}],
        },
        timeout=120,
    )
    resp.raise_for_status()
    text = resp.json()["content"][0]["text"].strip()
    # Strip markdown code fences if present
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        if text.startswith("json"):
            text = text[4:].strip()
    shots = json.loads(text)
    out_path.write_text(json.dumps(shots, indent=2))
    print(f"  done  {len(shots)} shots → {out_path}")
    return shots


def generate_broll_clip(prompt: str, idx: int, out_path):
    """Hit Pika 2.2, download, normalize to 1080x1920."""
    if out_path.exists() and out_path.stat().st_size > 0:
        return out_path

    full_prompt = f"{prompt} {BROLL_STYLE}"
    res = fal_client.subscribe(
        PIKA_MODEL,
        arguments={
            "prompt": full_prompt[:1000],
            "aspect_ratio": "9:16",
            "resolution": "720p",
            "duration": "5",
            "negative_prompt": (
                "human face, person face, eyes, mouth, phone screen, app UI, text, "
                "writing, words, ugly, deformed, watermark, low quality"
            ),
        },
    )
    url = res.get("video", {}).get("url")
    if not url:
        raise RuntimeError(f"shot {idx}: no video url in {json.dumps(res)[:300]}")

    raw = out_path.with_suffix(".raw.mp4")
    download(url, raw)
    # Upscale + force 1080x1920 + 24fps + h264
    ffmpeg_run([
        "ffmpeg", "-y", "-i", str(raw),
        "-vf", "scale=1080:1920:flags=lanczos,setsar=1",
        "-r", "24", "-c:v", "libx264", "-preset", "fast", "-crf", "20",
        "-pix_fmt", "yuv420p", "-an",
        str(out_path),
    ], label=f"broll clip {idx} normalize")
    raw.unlink(missing_ok=True)
    return out_path


def generate_broll_clips_parallel(shots, clips_dir, max_workers=4):
    """Generate all shot clips in parallel. Retry once on failure."""
    clips_dir.mkdir(parents=True, exist_ok=True)
    paths = [None] * len(shots)
    failures = []

    def _gen(idx_shot):
        idx, shot = idx_shot
        out = clips_dir / f"clip_{idx:03d}.mp4"
        for attempt in range(2):
            try:
                generate_broll_clip(shot["prompt"], idx, out)
                return idx, out
            except Exception as e:
                print(f"    shot {idx} attempt {attempt+1} failed: {str(e)[:120]}")
                time.sleep(2)
        return idx, None

    print(f"  Generating {len(shots)} Pika clips ({max_workers}-way parallel)...")
    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        for idx, path in ex.map(_gen, list(enumerate(shots))):
            paths[idx] = path
            if path:
                print(f"    [{idx+1}/{len(shots)}] ✓ {path.name}")
            else:
                failures.append(idx)

    if failures:
        raise RuntimeError(f"shots failed after retries: {failures}")
    return paths


def concat_broll(clip_paths, total_duration, out_path):
    """Concat clips with hard cuts. Pads/trims to total_duration."""
    if out_path.exists() and out_path.stat().st_size > 0:
        out_path.unlink()
    list_file = out_path.with_suffix(".txt")
    list_file.write_text("\n".join(f"file '{p.resolve()}'" for p in clip_paths))
    ffmpeg_run([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0",
        "-i", str(list_file),
        "-t", f"{total_duration:.2f}",
        "-c", "copy",
        str(out_path),
    ], label="broll concat")
    list_file.unlink(missing_ok=True)


def assemble_broll_video(broll_path, audio_path, ass_path, duration, out_path):
    """Final assembly: B-roll video track + narration audio + karaoke subtitles."""
    if out_path.exists() and out_path.stat().st_size > 0:
        print("  skip  Final video exists")
        return
    print(f"  Assembling B-roll video ({duration:.1f}s)...")
    cmd = [
        "ffmpeg", "-y",
        "-stream_loop", "-1", "-i", str(broll_path),  # loop in case shorter than audio
        "-i", str(audio_path),
        "-t", f"{duration:.2f}",
        "-vf", f"ass='{ass_path.resolve()}'",
        "-r", "24",
        "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-c:a", "aac", "-b:a", "192k",
        "-pix_fmt", "yuv420p",
        "-shortest",
        str(out_path),
    ]
    ffmpeg_run(cmd, label="broll final assembly")
    final_dur = get_duration(out_path)
    final_size = out_path.stat().st_size / (1024 * 1024)
    print(f"  done  {out_path} ({final_dur:.1f}s, {final_size:.1f}MB)")


def assemble_video(post_img, audio_path, ass_path, duration, out_path):
    """Create vertical video: slow-scroll post image + audio + subtitles."""
    if out_path.exists() and out_path.stat().st_size > 0:
        print("  skip  Final video exists")
        return

    # Get image dimensions
    probe = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "stream=width,height",
         "-of", "csv=p=0:s=x", str(post_img)],
        capture_output=True, text=True,
    )
    img_w, img_h = [int(x) for x in probe.stdout.strip().split("x")]

    # Calculate scroll: we want to slowly pan from top to bottom of the post
    # The image is 1080px wide, we crop a 1080x1920 window and scroll down
    scroll_distance = max(0, img_h - 1920)

    # Ken Burns: a slow ~10% zoom over the whole clip layered on top of the
    # scroll for cinematic motion. zoompan emits 1 output frame per input
    # frame; `on` is the output frame index, so the increment is duration-
    # independent and capped at 1.10 to avoid over-zoom on very long clips.
    fps = 24
    total_frames = max(1, int(duration * fps))
    per_frame_zoom = 0.10 / total_frames
    ken_burns = (
        f"zoompan=z='min(1+{per_frame_zoom:.7f}*on,1.10)':d=1:"
        f"x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':s=1080x1920:fps={fps}"
    )

    if scroll_distance > 0:
        scroll_speed = scroll_distance / duration
        vf = (
            f"crop=1080:1920:0:'min({scroll_speed}*t\\,{scroll_distance})',"
            f"{ken_burns},"
            f"ass='{ass_path.resolve()}'"
        )
    else:
        vf = (
            f"scale=1080:1920:force_original_aspect_ratio=decrease,"
            f"pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=#1a1a1b,"
            f"{ken_burns},"
            f"ass='{ass_path.resolve()}'"
        )

    print(f"  Assembling final video ({duration:.1f}s)...")
    cmd = [
        "ffmpeg", "-y",
        "-loop", "1", "-i", str(post_img),
        "-i", str(audio_path),
        "-t", f"{duration:.2f}",
        "-vf", vf,
        "-r", "24",
        "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-c:a", "aac", "-b:a", "192k",
        "-pix_fmt", "yuv420p",
        "-shortest",
        str(out_path),
    ]
    ffmpeg_run(cmd, label="final assembly")
    final_dur = get_duration(out_path)
    final_size = out_path.stat().st_size / (1024 * 1024)
    print(f"  done  {out_path} ({final_dur:.1f}s, {final_size:.1f}MB)")


# ── Main ──

DEFAULT_BG_MUSIC = Path("marketing/stories/music/echoes_of_aurora.mp3")
PRODUCED_REGISTRY = Path("marketing/stories/produced_stories.json")


def next_story_number(out_dir: Path) -> int:
    """Counts existing produced stories + 1. Skips this story's own slug so
    re-runs don't double-count."""
    if not PRODUCED_REGISTRY.exists():
        return 1
    try:
        entries = json.loads(PRODUCED_REGISTRY.read_text())
    except Exception:
        return 1
    this_slug = out_dir.resolve().name
    others = [
        e for e in entries
        if not e.get("output_dir", "").rstrip("/").endswith(f"/{this_slug}")
    ]
    return len(others) + 1


def main():
    parser = argparse.ArgumentParser(description="Produce Reddit story narration video")
    parser.add_argument(
        "--voice",
        help="Override ElevenLabs voice name (e.g. 'Sarah', 'Brian'). Forces ElevenLabs provider.",
    )
    parser.add_argument(
        "--voice-id",
        help="Override minimax custom voice_id (e.g. 'Voice...'). Forces Minimax provider.",
    )
    parser.add_argument(
        "--gender",
        choices=["male", "female"],
        help="Pick voice by OP gender. Defaults: male=Brian (ElevenLabs), female=Sarah Silverman clone (Minimax).",
    )
    parser.add_argument("--out", required=True, help="Output directory")
    parser.add_argument("--skip-tts", action="store_true", help="Skip TTS, use existing audio")
    parser.add_argument("--story-json", help="Path to story JSON file (overrides hardcoded story)")
    parser.add_argument(
        "--bg-music",
        default=str(DEFAULT_BG_MUSIC),
        help=f"Path to ambient BG music. Default: {DEFAULT_BG_MUSIC}. Pass '' to disable.",
    )
    parser.add_argument(
        "--mode",
        choices=["post", "broll"],
        default="post",
        help="Visual mode: 'post' = scrolling Reddit post (default), 'broll' = AI-generated illustrated B-roll via Pika 2.2.",
    )
    args = parser.parse_args()

    voice_cfg = None
    if args.voice_id:
        voice_cfg = {"provider": "minimax", "voice_id": args.voice_id}
    elif args.voice:
        voice_cfg = {"provider": "elevenlabs", "voice": args.voice}
    elif args.gender:
        voice_cfg = VOICE_CONFIGS[args.gender]
    elif not args.skip_tts:
        print("Error: pass --voice, --voice-id, or --gender (or --skip-tts to reuse existing narration.wav)")
        sys.exit(1)

    global fal_client, requests
    import fal_client as _fc
    import requests as _rq
    fal_client = _fc
    requests = _rq

    # Load story + narration
    if args.story_json:
        story_path = Path(args.story_json)
        if not story_path.exists():
            print(f"Error: story JSON not found: {story_path}")
            sys.exit(1)
        story, narration = load_story_json(story_path)
        print(f"  Loaded story from {story_path}")
    else:
        story = DEFAULT_STORY
        narration = DEFAULT_NARRATION

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    # Step 1: Render post image (only for post mode)
    post_img = out_dir / "post.png"
    if args.mode == "post":
        print("\n── Step 1: Reddit Post Image ──")
        render_post_image(post_img, story)
    else:
        print(f"\n── Step 1: SKIP post image (mode={args.mode}) ──")

    # Step 2: TTS
    print(f"\n── Step 2: TTS ({voice_cfg['provider'] if voice_cfg else 'skip'}) ──")
    audio_path = out_dir / "narration.wav"
    if not args.skip_tts:
        story_n = next_story_number(out_dir)
        full_narration = f"This is dating horror story, episode {story_n}.\n\n{narration.strip()}"
        print(f"  intro: 'This is dating horror story, episode {story_n}.'")
        duration = generate_tts(voice_cfg, full_narration, audio_path)
    else:
        duration = get_duration(audio_path)
        print(f"  skip  Using existing audio ({duration:.1f}s)")

    # Step 3: Whisper timestamps
    print("\n── Step 3: Word Timestamps ──")
    ts_path = out_dir / "timestamps.json"
    if ts_path.exists():
        with open(ts_path) as f:
            raw_ts = json.load(f)
        print(f"  skip  Using cached timestamps ({len(raw_ts)} segments)")
    else:
        raw_ts = get_word_timestamps(audio_path)
        with open(ts_path, "w") as f:
            json.dump(raw_ts, f, indent=2)

    word_ts = normalize_timestamps(raw_ts, duration)
    print(f"  {len(word_ts)} words -> karaoke caption events")

    # Step 4: ASS subtitles (karaoke per-word highlight)
    print("\n── Step 4: Subtitles ──")
    ass_path = out_dir / "subtitles.ass"
    write_ass_subtitles(word_ts, story["title"], ass_path)
    print(f"  done  {ass_path}")

    # Step 5: Mix BG music (optional)
    final_audio_path = audio_path
    if args.bg_music:
        bg_path = Path(args.bg_music)
        if not bg_path.exists():
            print(f"Error: bg music not found: {bg_path}")
            sys.exit(1)
        print("\n── Step 5: BG Music Mix ──")
        mixed_path = out_dir / "narration_with_bg.wav"
        mix_bg_music(audio_path, bg_path, duration, mixed_path)
        final_audio_path = mixed_path

    final_path = out_dir / "final.mp4"
    # Delete existing to force re-render when subtitles or audio change
    final_path.unlink(missing_ok=True)

    if args.mode == "broll":
        # B-roll mode: plan → generate clips → concat → assemble
        print("\n── Step 6: B-roll Shot Plan ──")
        shots = plan_broll_shots(narration, duration, out_dir / "shots.json")

        print("\n── Step 7: Pika Clip Generation ──")
        clips_dir = out_dir / "clips"
        clip_paths = generate_broll_clips_parallel(shots, clips_dir, max_workers=4)

        print("\n── Step 8: Concat B-roll Track ──")
        broll_path = out_dir / "broll.mp4"
        concat_broll(clip_paths, duration, broll_path)

        print("\n── Step 9: Final Assembly ──")
        assemble_broll_video(broll_path, final_audio_path, ass_path, duration, final_path)
    else:
        # Post mode: scrolling Reddit post background
        print("\n── Step 6: Final Assembly ──")
        assemble_video(post_img, final_audio_path, ass_path, duration, final_path)

    print(f"\n Done! {final_path}")


if __name__ == "__main__":
    main()
