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
"""

import argparse
import json
import os
import subprocess
import sys
import textwrap
from pathlib import Path

# Lazy imports
fal_client = None
requests = None

VOICE_CLONE_MODEL = "fal-ai/minimax/voice-clone"
TTS_MODEL = "fal-ai/minimax/speech-02-hd"
WHISPER_MODEL = "fal-ai/whisper"
FONT_PATH = "/System/Library/Fonts/Helvetica.ttc"


# ── Reddit Story ──

STORY = {
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
NARRATION = """So I matched with this guy on Tinder. We'd been chatting for a few days, everything seemed great. We had a lot in common, his pictures were cute, he lived close by. I invited him over to grill some burgers.

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

def render_post_image(out_path):
    """Render the Reddit post as a tall image using HTML → wkhtmltoimage or similar."""
    if out_path.exists() and out_path.stat().st_size > 0:
        print("  skip  Post image exists")
        return

    # Build HTML that looks like a Reddit post
    paragraphs = "\n".join(
        f'<p class="body">{p}</p>' for p in STORY["body"]
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
    <span class="subreddit">{STORY['subreddit']}</span>
    <span class="dot">·</span>
    <span class="author">{STORY['author']}</span>
  </div>
  <div class="title">{STORY['title']}</div>
  {paragraphs}
  <div class="votes">
    <span class="arrow up">▲</span>
    <span class="score">{STORY['upvotes']}</span>
    <span class="arrow">▼</span>
  </div>
  <div class="awards">{STORY['awards']}</div>
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

def clone_voice(ref_wav_path):
    """Clone voice from reference WAV. Returns custom_voice_id."""
    print(f"  Cloning voice from {ref_wav_path.name}...")
    url = fal_client.upload_file(str(ref_wav_path))
    result = fal_client.subscribe(VOICE_CLONE_MODEL, arguments={
        "audio_url": url,
    })
    vid = result.get("custom_voice_id")
    if not vid:
        raise RuntimeError(f"No voice_id: {json.dumps(result)[:300]}")
    print(f"  done  Voice ID: {vid[:30]}...")
    return vid


def generate_tts(voice_id, text, out_path):
    """Generate TTS with cloned voice."""
    if out_path.exists() and out_path.stat().st_size > 0:
        dur = get_duration(out_path)
        print(f"  skip  TTS exists ({dur:.1f}s)")
        return dur

    print("  Generating TTS...", end="", flush=True)
    result = fal_client.subscribe(TTS_MODEL, arguments={
        "text": text,
        "voice_id": voice_id,
        "speed": 0.95,
    })

    # Handle response shape
    url = None
    audio = result.get("audio")
    if isinstance(audio, dict):
        url = audio.get("url")
    if not url:
        url = result.get("audio_url")
    if not url:
        raise RuntimeError(f"No audio URL: {json.dumps(result)[:300]}")

    download(url, out_path)
    dur = get_duration(out_path)
    print(f" done ({dur:.1f}s)")
    return dur


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

def write_ass_subtitles(phrases, title, output_path):
    header = f"""[Script Info]
Title: {title}
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Helvetica Neue,72,&H00FFFFFF,&H000000FF,&H00000000,&HB4000000,-1,0,0,0,100,100,2,0,1,4,0,2,60,60,120,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"""

    lines = [header]
    for text, start, end in phrases:
        esc = text.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}")
        lines.append(f"Dialogue: 0,{ass_time(start)},{ass_time(end)},Default,,0,0,0,,{esc}")

    output_path.write_text("\n".join(lines) + "\n")


# ── Step 5: Final Assembly ──

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
    # pixels per second of scroll
    if scroll_distance > 0:
        scroll_speed = scroll_distance / duration
        # FFmpeg crop with moving y offset
        vf = (
            f"crop=1080:1920:0:'min({scroll_speed}*t\\,{scroll_distance})',"
            f"ass='{ass_path.resolve()}'"
        )
    else:
        # Image fits in frame, just pad/center
        vf = (
            f"scale=1080:1920:force_original_aspect_ratio=decrease,"
            f"pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=#1a1a1b,"
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

def main():
    parser = argparse.ArgumentParser(description="Produce Reddit story narration video")
    parser.add_argument("--voice-ref", required=True, help="Path to voice reference WAV")
    parser.add_argument("--out", required=True, help="Output directory")
    parser.add_argument("--skip-tts", action="store_true", help="Skip TTS, use existing audio")
    args = parser.parse_args()

    global fal_client, requests
    import fal_client as _fc
    import requests as _rq
    fal_client = _fc
    requests = _rq

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    voice_ref = Path(args.voice_ref)
    if not voice_ref.exists():
        print(f"Error: voice ref not found: {voice_ref}")
        sys.exit(1)

    # Step 1: Render post image
    print("\n── Step 1: Reddit Post Image ──")
    post_img = out_dir / "post.png"
    render_post_image(post_img)

    # Step 2: Voice clone + TTS
    print("\n── Step 2: Voice Clone TTS ──")
    audio_path = out_dir / "narration.wav"
    if not args.skip_tts:
        voice_id = clone_voice(voice_ref)
        duration = generate_tts(voice_id, NARRATION.strip(), audio_path)
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
    phrases = group_into_phrases(word_ts, max_words=4)
    print(f"  {len(word_ts)} words -> {len(phrases)} subtitle phrases")

    # Step 4: ASS subtitles
    print("\n── Step 4: Subtitles ──")
    ass_path = out_dir / "subtitles.ass"
    write_ass_subtitles(phrases, STORY["title"], ass_path)
    print(f"  done  {ass_path}")

    # Step 5: Assemble
    print("\n── Step 5: Final Assembly ──")
    final_path = out_dir / "final.mp4"
    # Delete existing to force re-render when subtitles change
    final_path.unlink(missing_ok=True)
    assemble_video(post_img, audio_path, ass_path, duration, final_path)

    print(f"\n✓ Done! {final_path}")


if __name__ == "__main__":
    main()
