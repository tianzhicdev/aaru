#!/usr/bin/env python3
"""
produce_video.py — Automated marketing video pipeline for Thumos.

Pipeline: Script JSON -> TTS (Gemini) -> Video (Kling 3.0) -> Subtitles -> FFmpeg -> final.mp4
All AI generation via fal.ai. Resumable: re-run skips existing files.

Usage:
    python scripts/produce_video.py marketing/stories/script-01-am-i-just-boring.json
    python scripts/produce_video.py marketing/stories/script-01-am-i-just-boring.json --voice Charon
"""

import base64
import json
import math
import os
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

# --- Config ---

TTS_MODEL = "fal-ai/gemini-tts"
TTS_GEMINI_MODEL = "gemini-2.5-pro-tts"
WHISPER_MODEL = "fal-ai/whisper"
VIDEO_MODEL = "fal-ai/kling-video/v3/standard/text-to-video"
KLING_MIN_DUR = 3   # Kling v3 supports 3-15s integer durations
KLING_MAX_DUR = 15
DEFAULT_VOICE = "Charon"  # calm, professional male
MAX_VIDEO_WORKERS = 3
FONT_PATH = "/System/Library/Fonts/Helvetica.ttc"
TTS_COST_PER_1K_CHARS = 0.15  # Gemini Pro TTS estimate
VIDEO_COST_PER_SEC = 0.10  # Kling v3 standard


# --- Helpers ---

def slugify(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")


def get_audio_duration(path: Path) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(json.loads(result.stdout)["format"]["duration"])


def pick_video_duration(needed: float) -> int:
    """Pick smallest valid Kling v3 duration (3-15s) >= needed."""
    d = max(KLING_MIN_DUR, math.ceil(needed))
    return min(d, KLING_MAX_DUR)


def download_file(url: str, path: Path) -> None:
    resp = requests.get(url, timeout=300, stream=True)
    resp.raise_for_status()
    with open(path, "wb") as f:
        for chunk in resp.iter_content(chunk_size=8192):
            if chunk:
                f.write(chunk)


def ass_time(secs: float) -> str:
    """Format seconds as ASS timestamp H:MM:SS.CC"""
    h = int(secs // 3600)
    m = int((secs % 3600) // 60)
    s = secs % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def ffmpeg_run(cmd: list, label: str = "") -> None:
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        err = result.stderr[-800:] if result.stderr else "no stderr"
        raise RuntimeError(f"FFmpeg failed ({label}): {err}")


# --- Step 1: TTS ---

def generate_tts(text: str, voice: str, style_instructions: str, audio_dir: Path, scene_id: int):
    """Generate TTS audio via Gemini TTS + Whisper alignment. Returns (audio_path, word_timestamps, duration)."""
    audio_path = audio_dir / f"scene_{scene_id:02d}.mp3"
    ts_path = audio_dir / f"scene_{scene_id:02d}_timestamps.json"

    if audio_path.exists() and audio_path.stat().st_size > 0:
        dur = get_audio_duration(audio_path)
        ts = json.loads(ts_path.read_text()) if ts_path.exists() else []
        print(f"  skip  TTS scene {scene_id} ({dur:.1f}s)")
        return audio_path, ts, dur

    print(f"  [tts] scene {scene_id} ...")
    result = fal_client.subscribe(
        TTS_MODEL,
        arguments={
            "prompt": text,
            "voice": voice,
            "model": TTS_GEMINI_MODEL,
            "style_instructions": style_instructions,
            "output_format": "mp3",
            "temperature": 0.8,
        },
    )

    # fal.ai wraps Gemini TTS — returns {audio: {url}} like other models
    audio_url = result["audio"]["url"]
    download_file(audio_url, audio_path)

    dur = get_audio_duration(audio_path)

    # Get word timestamps via Whisper
    ts = get_word_timestamps(audio_path)
    ts_path.write_text(json.dumps(ts, indent=2))

    print(f"  done  TTS scene {scene_id}: {dur:.1f}s")
    return audio_path, ts, dur


def get_word_timestamps(audio_path: Path) -> list:
    """Get word-level timestamps via Whisper. Returns list of {text, timestamp} chunks."""
    try:
        audio_url = fal_client.upload_file(str(audio_path))
        result = fal_client.subscribe(
            WHISPER_MODEL,
            arguments={
                "audio_url": audio_url,
                "task": "transcribe",
                "language": "en",
                "chunk_level": "segment",
            },
        )
        return result.get("chunks", [])
    except Exception as e:
        print(f"  warn  Whisper failed, using even spacing: {e}")
        return []


# --- Step 2: Video ---

def is_endcard_scene(scene: dict) -> bool:
    """Detect if a scene should be rendered as an endcard (text on black) regardless of narration."""
    lower = scene["video_description"].lower()
    return "fade to black" in lower and "text appears" in lower


def sanitize_video_description(desc: str) -> str:
    """Rewrite video descriptions that show phone screens or text to avoid Kling text artifacts."""
    lower = desc.lower()

    phone_keywords = ["phone screen", "dating app interface", "message thread",
                      "match notification", "app notification", "swiping through profiles"]
    if not any(kw in lower for kw in phone_keywords):
        return desc

    if "swiping" in lower or "dating app" in lower:
        return ("A steaming cup of coffee on a dark wooden cafe table. "
                "Warm pendant light overhead. Rain droplets on the window behind. "
                "Blurred cafe interior with soft golden bokeh. Lonely, contemplative atmosphere.")

    if "message thread" in lower or "unanswered" in lower:
        return ("Close-up of wrinkled white bedsheets in dim blue moonlight. "
                "A pillow with a slight indentation. Empty quiet bedroom, "
                "soft shadows on the wall. Melancholic insomnia mood. No objects on screen.")

    if "match notification" in lower or "new match" in lower:
        return ("A person's hand resting on a dark table in a dimly lit room. "
                "A faint warm glow illuminates their chin and chest from below. "
                "Intimate, contemplative mood. Shallow depth of field.")

    return desc


def build_video_prompt(scene: dict, episode: dict) -> str:
    original_desc = scene["video_description"]
    desc = sanitize_video_description(original_desc)
    was_sanitized = desc != original_desc
    parts = [desc, scene["camera_style"], episode["art_style"]]
    for key in scene.get("consistent_objects", []):
        # Skip phone objects if the description was sanitized to remove phone content
        if was_sanitized and "phone" in key.lower():
            continue
        obj = episode.get("consistent_objects", {}).get(key)
        if obj:
            parts.append(f"{obj['name']}: {obj['description']}")
    parts.append(
        "Vertical portrait composition, 9:16 aspect ratio. "
        "No faces, no text, no words, no letters, no watermarks."
    )
    return " ".join(parts)


def generate_video_clip(scene: dict, episode: dict, duration: int, video_dir: Path) -> Path:
    sid = scene["scene_id"]
    path = video_dir / f"scene_{sid:02d}.mp4"

    if path.exists() and path.stat().st_size > 0:
        print(f"  skip  Video scene {sid}")
        return path

    prompt = build_video_prompt(scene, episode)
    print(f"  [vid] scene {sid} ({duration}s) ...")

    result = fal_client.subscribe(
        VIDEO_MODEL,
        arguments={
            "prompt": prompt,
            "duration": str(duration),
            "aspect_ratio": "9:16",
            "negative_prompt": "text, words, letters, subtitles, watermark, logo, human face, phone, smartphone, mobile device, screen, tablet, blur, distort, low quality",
            "cfg_scale": 0.5,
        },
    )

    # Handle both response shapes: {video: {url}} or {video_url}
    url = None
    if isinstance(result.get("video"), dict):
        url = result["video"].get("url")
    if not url:
        url = result.get("video_url")
    if not url:
        raise RuntimeError(f"No video URL in response for scene {sid}: {json.dumps(result)[:200]}")

    download_file(url, path)
    print(f"  done  Video scene {sid}: {duration}s")
    return path


def parse_endcard_text(video_desc: str) -> list:
    """Extract quoted text lines from end card video_description."""
    quotes = re.findall(r"['\u2018\u2019]([^'\u2018\u2019]+)['\u2018\u2019]", video_desc)
    if quotes:
        return quotes[:3]
    return [
        "What if your match already knew what makes you light up?",
        "Thumos \u2014 discover your soul, find your someone.",
    ]


def generate_endcard(scene_id: int, duration: float, video_dir: Path, text_lines: list) -> Path:
    path = video_dir / f"scene_{scene_id:02d}.mp4"
    if path.exists() and path.stat().st_size > 0:
        print(f"  skip  End card scene {scene_id}")
        return path

    print(f"  [end] scene {scene_id} ({duration}s) ...")

    vf_parts = []
    n = len(text_lines)
    for i, text in enumerate(text_lines):
        safe = text.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\u2019")
        fs = 36 if i == 0 else 28
        y_offset = int((i - n / 2 + 0.5) * 60)
        color = "white" if i == 0 else "white@0.7"
        delay = 0.5 + i * 0.5
        vf_parts.append(
            f"drawtext=text='{safe}'"
            f":fontsize={fs}:fontcolor={color}"
            f":fontfile={FONT_PATH}"
            f":x=(w-text_w)/2:y=(h/2)+{y_offset}"
            f":enable='gte(t\\,{delay})'"
        )

    vf = ",".join(vf_parts) if vf_parts else "null"
    ffmpeg_run(
        [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", f"color=c=black:s=1080x1920:d={duration}:r=24",
            "-vf", vf,
            "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
            str(path),
        ],
        label=f"endcard scene {scene_id}",
    )
    print(f"  done  End card scene {scene_id}: {duration}s")
    return path


# --- Step 3: Subtitles ---

def normalize_timestamps(raw_ts, audio_duration: float, text: str) -> list:
    """Normalize to [(word, start, end), ...]. Handles multiple response formats."""
    words = []

    # Format A: list of dicts — Whisper {text, timestamp: [s,e]} or ElevenLabs {text, start, end}
    if isinstance(raw_ts, list) and raw_ts and isinstance(raw_ts[0], dict):
        for entry in raw_ts:
            w = entry.get("text") or entry.get("word", "")
            # Whisper timestamp format: {text: "...", timestamp: [start, end]}
            ts_pair = entry.get("timestamp")
            if ts_pair and isinstance(ts_pair, (list, tuple)) and len(ts_pair) >= 2:
                s = float(ts_pair[0]) if ts_pair[0] is not None else 0
                e = float(ts_pair[1]) if ts_pair[1] is not None else s + 0.3
                # Whisper segments are often multi-word — split evenly
                segment_words = w.strip().split()
                if len(segment_words) > 1:
                    seg_dur = (e - s) / len(segment_words)
                    for i, sw in enumerate(segment_words):
                        words.append((sw, s + i * seg_dur, s + (i + 1) * seg_dur))
                elif w.strip():
                    words.append((w.strip(), s, e))
            else:
                s = float(entry.get("start") or entry.get("start_time", 0))
                e = float(entry.get("end") or entry.get("end_time", s + 0.3))
                if w.strip():
                    words.append((w.strip(), s, e))
        if words:
            return words

    # Format B: character-level alignment dict (ElevenLabs)
    if isinstance(raw_ts, dict) and "characters" in raw_ts:
        chars = raw_ts["characters"]
        starts = raw_ts.get("character_start_times_seconds", [])
        ends = raw_ts.get("character_end_times_seconds", [])
        cur_word, w_start, w_end = "", 0.0, 0.0
        for i, ch in enumerate(chars):
            if ch == " ":
                if cur_word:
                    words.append((cur_word, w_start, w_end))
                    cur_word = ""
            else:
                if not cur_word and i < len(starts):
                    w_start = starts[i]
                cur_word += ch
                if i < len(ends):
                    w_end = ends[i]
        if cur_word:
            words.append((cur_word, w_start, w_end))
        if words:
            return words

    # Fallback: evenly space words
    text_words = text.split()
    if not text_words:
        return []
    interval = audio_duration / len(text_words)
    return [(w, i * interval, (i + 1) * interval) for i, w in enumerate(text_words)]


def group_into_phrases(word_ts: list, max_words: int = 4) -> list:
    """Group word timestamps into subtitle phrases."""
    phrases = []
    i = 0
    while i < len(word_ts):
        chunk = word_ts[i : i + max_words]
        text = " ".join(w[0] for w in chunk)
        phrases.append((text, chunk[0][1], chunk[-1][2]))
        i += max_words
    return phrases


def write_ass_subtitles(all_phrases: list, title: str, output_path: Path) -> None:
    header = f"""[Script Info]
Title: {title}
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Helvetica Neue,60,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,0,2,40,40,200,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"""

    lines = [header]
    for text, start, end in all_phrases:
        esc = text.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}")
        lines.append(f"Dialogue: 0,{ass_time(start)},{ass_time(end)},Default,,0,0,0,,{esc}")

    output_path.write_text("\n".join(lines) + "\n")


# --- Step 4: FFmpeg Assembly ---

def combine_scene(video_path: Path, audio_path, target_dur: float, output_path: Path) -> Path:
    """Combine video + audio for one scene, trimmed/padded to target_dur."""
    if output_path.exists() and output_path.stat().st_size > 0:
        return output_path

    if audio_path:
        cmd = [
            "ffmpeg", "-y",
            "-stream_loop", "-1", "-i", str(video_path),
            "-i", str(audio_path),
            "-t", f"{target_dur:.2f}",
            "-map", "0:v:0", "-map", "1:a:0",
            "-r", "24",
            "-c:v", "libx264", "-preset", "fast", "-crf", "18",
            "-c:a", "aac", "-b:a", "192k",
            "-pix_fmt", "yuv420p",
            str(output_path),
        ]
    else:
        # Silent scene — add null audio for concat compatibility
        cmd = [
            "ffmpeg", "-y",
            "-stream_loop", "-1", "-i", str(video_path),
            "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
            "-t", f"{target_dur:.2f}",
            "-map", "0:v:0", "-map", "1:a:0",
            "-r", "24",
            "-c:v", "libx264", "-preset", "fast", "-crf", "18",
            "-c:a", "aac", "-b:a", "192k",
            "-pix_fmt", "yuv420p",
            str(output_path),
        ]

    ffmpeg_run(cmd, label=f"combine {output_path.name}")
    return output_path


def concat_and_subtitle(combined_paths: list, ass_path: Path, out_dir: Path) -> Path:
    """Concat all scene clips, burn in subtitles, output final.mp4."""
    final_path = out_dir / "final.mp4"
    if final_path.exists() and final_path.stat().st_size > 0:
        print("  skip  Final video exists")
        return final_path

    # Write concat list
    concat_txt = out_dir / "concat.txt"
    with open(concat_txt, "w") as f:
        for p in combined_paths:
            f.write(f"file '{p.resolve()}'\n")

    # Concat
    concat_raw = out_dir / "concat_raw.mp4"
    ffmpeg_run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat_txt), "-c", "copy", str(concat_raw)],
        label="concat",
    )

    # Burn subtitles
    if ass_path.exists():
        ffmpeg_run(
            [
                "ffmpeg", "-y",
                "-i", str(concat_raw),
                "-vf", f"ass='{ass_path.resolve()}'",
                "-c:v", "libx264", "-preset", "fast", "-crf", "18",
                "-c:a", "copy",
                str(final_path),
            ],
            label="subtitles",
        )
        concat_raw.unlink(missing_ok=True)
    else:
        concat_raw.rename(final_path)

    return final_path


# --- Main ---

def main():
    if len(sys.argv) < 2:
        print("Usage: python produce_video.py <script.json> [--voice NAME]")
        sys.exit(1)

    script_path = Path(sys.argv[1]).resolve()
    if not script_path.exists():
        print(f"Error: {script_path} not found")
        sys.exit(1)

    # Lazy imports — allows CLI usage check before requiring deps
    global fal_client, requests
    import fal_client as _fal_client
    import requests as _requests
    fal_client = _fal_client
    requests = _requests

    voice = DEFAULT_VOICE
    if "--voice" in sys.argv:
        voice = sys.argv[sys.argv.index("--voice") + 1]

    # Load script
    script = json.loads(script_path.read_text())
    episode = script["episode"]
    scenes = script["scenes"]
    title = episode["title"]
    slug = slugify(title)
    narrator_style = episode.get("narrator_style", "")

    print(f"\n{'=' * 60}")
    print(f"  Producing: {title}")
    print(f"  Scenes: {len(scenes)} | Voice: {voice}")
    print(f"{'=' * 60}")

    # Output dirs
    out_dir = script_path.parent / "output" / slug
    audio_dir = out_dir / "audio"
    video_dir = out_dir / "video"
    combined_dir = out_dir / "combined"
    for d in [audio_dir, video_dir, combined_dir]:
        d.mkdir(parents=True, exist_ok=True)

    # ── Step 1: TTS ──────────────────────────────────
    print(f"\n{'~' * 40}")
    print("Step 1/4: TTS Generation")
    print(f"{'~' * 40}")

    scene_info = []
    total_chars = 0

    for scene in scenes:
        sid = scene["scene_id"]
        sentences = scene["sentences"]
        pause = scene["pause_after"]

        if not sentences:
            scene_info.append({
                "id": sid, "audio": None, "timestamps": [],
                "audio_dur": 0, "pause": pause, "endcard": True,
                "text": "", "scene": scene,
            })
            print(f"  --    Scene {sid}: end card (no narration)")
            continue

        narration = " ".join(sentences)
        total_chars += len(narration)
        audio_path, ts, dur = generate_tts(narration, voice, narrator_style, audio_dir, sid)

        scene_info.append({
            "id": sid, "audio": audio_path, "timestamps": ts,
            "audio_dur": dur, "pause": pause, "endcard": False,
            "text": narration, "scene": scene,
        })

    tts_cost = total_chars * TTS_COST_PER_1K_CHARS / 1000
    print(f"\n  Narration: {total_chars} chars (${tts_cost:.2f})")

    # ── Step 2: Video Generation ─────────────────────
    print(f"\n{'~' * 40}")
    print("Step 2/4: Video Generation")
    print(f"{'~' * 40}")

    video_tasks = []
    total_video_secs = 0

    for info in scene_info:
        if info["endcard"] or is_endcard_scene(info["scene"]):
            text_lines = parse_endcard_text(info["scene"]["video_description"])
            # Endcard duration: at least audio+pause, minimum 3s
            ec_dur = max(info["audio_dur"] + info["pause"], 3.0)
            info["video"] = generate_endcard(info["id"], ec_dur, video_dir, text_lines)
        else:
            needed = info["audio_dur"] + info["pause"]
            vdur = pick_video_duration(needed)
            total_video_secs += vdur
            video_tasks.append((info, vdur))

    # Parallel video generation
    if video_tasks:
        with ThreadPoolExecutor(max_workers=MAX_VIDEO_WORKERS) as pool:
            futures = {}
            for info, vdur in video_tasks:
                fut = pool.submit(generate_video_clip, info["scene"], episode, vdur, video_dir)
                futures[fut] = info

            for fut in as_completed(futures):
                info = futures[fut]
                try:
                    info["video"] = fut.result()
                except Exception as e:
                    print(f"  FAIL  Video scene {info['id']}: {e}")
                    sys.exit(1)

    video_cost = total_video_secs * VIDEO_COST_PER_SEC
    print(f"\n  Video: {total_video_secs}s (${video_cost:.2f})")

    # ── Step 3: Subtitles ────────────────────────────
    print(f"\n{'~' * 40}")
    print("Step 3/4: Subtitle Generation")
    print(f"{'~' * 40}")

    all_phrases = []
    offset = 0.0

    for info in scene_info:
        if info["text"] and info["timestamps"]:
            wts = normalize_timestamps(info["timestamps"], info["audio_dur"], info["text"])
            wts_global = [(w, s + offset, e + offset) for w, s, e in wts]
            all_phrases.extend(group_into_phrases(wts_global))

        offset += info["audio_dur"] + info["pause"]

    ass_path = out_dir / "subtitles.ass"
    write_ass_subtitles(all_phrases, title, ass_path)
    print(f"  done  {len(all_phrases)} subtitle phrases -> subtitles.ass")

    # ── Step 4: FFmpeg Assembly ──────────────────────
    print(f"\n{'~' * 40}")
    print("Step 4/4: FFmpeg Assembly")
    print(f"{'~' * 40}")

    combined_paths = []
    for info in scene_info:
        scene_dur = info["audio_dur"] + info["pause"]
        out_path = combined_dir / f"scene_{info['id']:02d}.mp4"
        combine_scene(info["video"], info["audio"], scene_dur, out_path)
        combined_paths.append(out_path)
        print(f"  done  Combined scene {info['id']}: {scene_dur:.1f}s")

    print(f"\n  Concatenating {len(combined_paths)} scenes + burning subtitles ...")
    final_path = concat_and_subtitle(combined_paths, ass_path, out_dir)

    # ── Summary ──────────────────────────────────────
    final_dur = get_audio_duration(final_path)
    total_cost = tts_cost + video_cost

    print(f"\n{'=' * 60}")
    print(f"  DONE: {final_path}")
    print(f"  Duration: {final_dur:.1f}s ({final_dur / 60:.1f} min)")
    print(f"  Cost: TTS ${tts_cost:.2f} + Video ${video_cost:.2f} = ${total_cost:.2f}")
    print(f"{'=' * 60}\n")


if __name__ == "__main__":
    main()
