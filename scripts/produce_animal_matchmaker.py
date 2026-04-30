#!/usr/bin/env python3
from __future__ import annotations
"""
produce_animal_matchmaker.py — Two-voice dialogue video from a script JSON.

Modes:
  --sound-only          TTS only. Black "Scene X" cards as background.
  --image-only          TTS + AI images as background (no video gen).
  (default)             Same as --image-only.

Options:
  --scenes 1,2,3        Only process these scene IDs (comma-separated).
  --clean               Delete existing output and regenerate everything.

Voice pipeline:
  1. Voice Clone (fal-ai/minimax/voice-clone): ref WAV → custom_voice_id
  2. Speech-02-HD (fal-ai/minimax/speech-02-hd): text + voice_id + emotion/pitch/speed

Usage:
    export FAL_KEY=...
    python scripts/produce_animal_matchmaker.py marketing/stories/script-hippo-matchmaker.json --image-only
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

# ── Config ──

VOICE_CLONE_MODEL = "fal-ai/minimax/voice-clone"
TTS_MODEL = "fal-ai/minimax/speech-02-hd"
IMAGE_MODEL = "fal-ai/flux-pro/v1.1-ultra"
WHISPER_MODEL = "fal-ai/whisper"
VOICES_DIR = Path("marketing/stories/tts-auditions/voices")
FONT_PATH = "/System/Library/Fonts/Helvetica.ttc"
MAX_IMAGE_WORKERS = 4

# ── Helpers ──

def slugify(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")


def get_duration(path: Path) -> float:
    r = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(json.loads(r.stdout)["format"]["duration"])


def download(url: str, path: Path):
    resp = requests.get(url, timeout=300, stream=True)
    resp.raise_for_status()
    with open(path, "wb") as f:
        for chunk in resp.iter_content(8192):
            if chunk:
                f.write(chunk)


def ass_time(secs: float) -> str:
    h = int(secs // 3600)
    m = int((secs % 3600) // 60)
    s = secs % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def ffmpeg_run(cmd: list, label: str = ""):
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        err = result.stderr[-1200:] if result.stderr else "no stderr"
        raise RuntimeError(f"FFmpeg failed ({label}): {err}")


# ── Voice Clone ──

def clone_voices(voice_cfg: dict) -> dict:
    """Clone each ref WAV via Voice Clone API. Returns {speaker: custom_voice_id}."""
    voice_ids = {}
    for speaker, cfg in voice_cfg.items():
        wav = cfg["ref_wav"]
        wav_path = VOICES_DIR / wav
        if not wav_path.exists():
            raise FileNotFoundError(f"Voice ref not found: {wav_path}")
        print(f"  {speaker}: cloning {wav}...", end="", flush=True)
        url = fal_client.upload_file(str(wav_path))
        result = fal_client.subscribe(VOICE_CLONE_MODEL, arguments={
            "audio_url": url,
        })
        vid = result.get("custom_voice_id")
        if not vid:
            raise RuntimeError(f"No voice_id for {speaker}: {json.dumps(result)[:300]}")
        voice_ids[speaker] = vid
        print(f" -> {vid[:20]}...")
    return voice_ids


# ── TTS ──

def tts_scene(text: str, voice_id: str, vcfg: dict, out_path: Path) -> float:
    """Generate TTS with cloned voice_id + emotion/pitch/speed from config."""
    if out_path.exists() and out_path.stat().st_size > 1000:
        dur = get_duration(out_path)
        print(f"skip ({dur:.1f}s)")
        return dur

    voice_setting = {"voice_id": voice_id}
    if "speed" in vcfg:
        voice_setting["speed"] = vcfg["speed"]
    if "pitch" in vcfg:
        voice_setting["pitch"] = vcfg["pitch"]
    if "emotion" in vcfg:
        voice_setting["emotion"] = vcfg["emotion"]

    result = fal_client.subscribe(TTS_MODEL, arguments={
        "text": text,
        "voice_setting": voice_setting,
        "language_boost": "English",
    })

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
    print(f"done ({dur:.1f}s)")
    return dur


# ── Whisper ──

def whisper_timestamps(audio_path: Path) -> list:
    try:
        url = fal_client.upload_file(str(audio_path))
        result = fal_client.subscribe(WHISPER_MODEL, arguments={
            "audio_url": url,
            "task": "transcribe",
            "language": "en",
            "chunk_level": "segment",
        })
        return result.get("chunks", [])
    except Exception as e:
        print(f"    whisper fail: {e}")
        return []


def normalize_ts(raw_ts, dur: float, text: str) -> list:
    """Returns [(word, start, end), ...]."""
    words = []
    if isinstance(raw_ts, list) and raw_ts and isinstance(raw_ts[0], dict):
        for entry in raw_ts:
            w = entry.get("text", "")
            ts = entry.get("timestamp")
            if ts and isinstance(ts, (list, tuple)) and len(ts) >= 2:
                s = float(ts[0]) if ts[0] is not None else 0
                e = float(ts[1]) if ts[1] is not None else s + 0.3
                seg_words = w.strip().split()
                if len(seg_words) > 1:
                    seg_d = (e - s) / len(seg_words)
                    for i, sw in enumerate(seg_words):
                        words.append((sw, s + i * seg_d, s + (i + 1) * seg_d))
                elif w.strip():
                    words.append((w.strip(), s, e))
        if words:
            return words
    # fallback: even spacing
    tw = text.split()
    if not tw:
        return []
    iv = dur / len(tw)
    return [(w, i * iv, (i + 1) * iv) for i, w in enumerate(tw)]


def group_phrases(word_ts: list, max_words: int = 5) -> list:
    phrases, i = [], 0
    while i < len(word_ts):
        chunk = word_ts[i:i + max_words]
        phrases.append((" ".join(w[0] for w in chunk), chunk[0][1], chunk[-1][2]))
        i += max_words
    return phrases


# ── Image generation ──

def gen_image(prompt: str, art_style: str, out_path: Path) -> Path:
    if out_path.exists() and out_path.stat().st_size > 1000:
        print("skip")
        return out_path

    full_prompt = f"{art_style}, {prompt}" if art_style else prompt

    result = fal_client.subscribe(IMAGE_MODEL, arguments={
        "prompt": full_prompt,
        "aspect_ratio": "9:16",
        "safety_tolerance": "5",
        "output_format": "png",
    })
    images = result.get("images", [])
    if not images:
        raise RuntimeError(f"No image: {json.dumps(result)[:200]}")
    url = images[0].get("url")
    if not url:
        raise RuntimeError(f"No image URL: {json.dumps(images[0])[:200]}")
    download(url, out_path)
    print("done")
    return out_path


# ── Video building blocks ──

def make_black_card(label: str, duration: float, out_path: Path):
    """Black 1080x1920 with centered white label."""
    if out_path.exists() and out_path.stat().st_size > 0:
        return
    safe = label.replace("'", "\u2019").replace(":", "\\:")
    ffmpeg_run([
        "ffmpeg", "-y", "-f", "lavfi",
        "-i", f"color=c=black:s=1080x1920:d={duration}:r=24",
        "-vf", (f"drawtext=text='{safe}':fontsize=52:fontcolor=white"
                f":fontfile={FONT_PATH}:x=(w-text_w)/2:y=(h-text_h)/2"),
        "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
        str(out_path),
    ], label=f"black_card {label}")


def make_text_card(lines: list, duration: float, out_path: Path, bg: str = "black"):
    """Multi-line text card."""
    if out_path.exists() and out_path.stat().st_size > 0:
        return
    vf_parts = []
    visible = [l for l in lines if l.strip()]
    n = len(visible)
    for idx, line in enumerate(visible):
        safe = line.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\u2019")
        fs = 42
        y_off = int((idx - n / 2 + 0.5) * 65)
        delay = 0.3 + idx * 0.3
        vf_parts.append(
            f"drawtext=text='{safe}':fontsize={fs}:fontcolor=white"
            f":fontfile={FONT_PATH}:x=(w-text_w)/2:y=(h/2)+{y_off}"
            f":enable='gte(t\\,{delay})'"
        )
    vf = ",".join(vf_parts) if vf_parts else "null"
    ffmpeg_run([
        "ffmpeg", "-y", "-f", "lavfi",
        "-i", f"color=c={bg}:s=1080x1920:d={duration}:r=24",
        "-vf", vf,
        "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
        str(out_path),
    ], label="text_card")


def image_to_video(img: Path, duration: float, out_path: Path):
    """Static image -> video (no zoom/pan, perfectly still)."""
    if out_path.exists() and out_path.stat().st_size > 0:
        return
    ffmpeg_run([
        "ffmpeg", "-y", "-loop", "1", "-i", str(img),
        "-t", f"{duration:.2f}",
        "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black",
        "-r", "24",
        "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
        str(out_path),
    ], label=f"img2vid {out_path.name}")


def combine_av(video: Path, audio: Path | None, duration: float, out: Path):
    """Mux video + audio into one clip, padded/trimmed to duration."""
    if out.exists() and out.stat().st_size > 0:
        return
    if audio:
        ffmpeg_run([
            "ffmpeg", "-y",
            "-stream_loop", "-1", "-i", str(video),
            "-i", str(audio),
            "-t", f"{duration:.2f}",
            "-map", "0:v:0", "-map", "1:a:0",
            "-r", "24",
            "-c:v", "libx264", "-preset", "fast", "-crf", "18",
            "-c:a", "aac", "-b:a", "192k", "-pix_fmt", "yuv420p",
            str(out),
        ], label=f"combine {out.name}")
    else:
        ffmpeg_run([
            "ffmpeg", "-y",
            "-stream_loop", "-1", "-i", str(video),
            "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
            "-t", f"{duration:.2f}",
            "-map", "0:v:0", "-map", "1:a:0",
            "-r", "24",
            "-c:v", "libx264", "-preset", "fast", "-crf", "18",
            "-c:a", "aac", "-b:a", "192k", "-pix_fmt", "yuv420p",
            str(out),
        ], label=f"combine_silent {out.name}")


def write_ass(phrases: list, title: str, out: Path):
    header = f"""[Script Info]
Title: {title}
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Helvetica Neue,56,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,0,2,40,40,200,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"""
    lines = [header]
    for text, s, e in phrases:
        esc = text.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}")
        lines.append(f"Dialogue: 0,{ass_time(s)},{ass_time(e)},Default,,0,0,0,,{esc}")
    out.write_text("\n".join(lines) + "\n")


# ── Main pipeline ──

def main():
    parser = argparse.ArgumentParser(description="Produce animal matchmaker video")
    parser.add_argument("script", help="Path to script JSON")
    parser.add_argument("--sound-only", action="store_true", help="TTS only, black scene cards")
    parser.add_argument("--image-only", action="store_true", help="TTS + AI images, no video gen")
    parser.add_argument("--scenes", type=str, default=None, help="Comma-separated scene IDs to process")
    parser.add_argument("--clean", action="store_true", help="Delete output dir first")
    args = parser.parse_args()

    script_path = Path(args.script).resolve()
    if not script_path.exists():
        print(f"Error: {script_path} not found")
        sys.exit(1)

    global fal_client, requests
    import fal_client as _fc
    import requests as _req
    fal_client = _fc
    requests = _req

    script = json.loads(script_path.read_text())
    episode = script["episode"]
    all_scenes = script["scenes"]
    title = episode["title"]
    slug = slugify(title)
    voice_cfg = episode["voices"]
    art_style = episode.get("art_style", "")

    # Filter scenes
    if args.scenes:
        keep = set(int(x) for x in args.scenes.split(","))
        scenes = [s for s in all_scenes if s["scene_id"] in keep]
    else:
        scenes = all_scenes

    mode = "sound-only" if args.sound_only else "image-only"

    print(f"\n{'=' * 60}")
    print(f"  {title}  [{mode}]")
    print(f"  Scenes: {[s['scene_id'] for s in scenes]}")
    print(f"  Art style: {art_style[:60]}..." if art_style else "  Art style: (none)")
    print(f"{'=' * 60}")

    # Output dirs
    out_dir = script_path.parent / "output" / slug
    audio_dir = out_dir / "audio"
    image_dir = out_dir / "images"
    video_dir = out_dir / "video"
    combined_dir = out_dir / "combined"

    if args.clean:
        for d in [audio_dir, image_dir, video_dir, combined_dir]:
            if d.exists():
                shutil.rmtree(d)

    for d in [audio_dir, image_dir, video_dir, combined_dir]:
        d.mkdir(parents=True, exist_ok=True)

    # ━━ Step 1: Clone voices ━━
    print(f"\n── Clone voices ──")
    voice_ids = clone_voices(voice_cfg)

    # ━━ Step 2: TTS per scene ━━
    print(f"\n── TTS ──")
    infos = []
    for scene in scenes:
        sid = scene["scene_id"]
        speaker = scene["speaker"]
        text = scene["text"]

        info = {
            "id": sid, "speaker": speaker, "text": text,
            "audio": None, "dur": 0,
            "pause": scene["pause_after"], "scene": scene,
        }

        if not text or speaker in ("fact_card", "end_card"):
            print(f"  {sid:2d}  [{speaker:12s}]  (no audio)")
            infos.append(info)
            continue

        vcfg = voice_cfg.get(speaker)
        vid = voice_ids.get(speaker)
        if not vcfg or not vid:
            print(f"  {sid:2d}  [{speaker:12s}]  WARN: no voice cfg, skip")
            infos.append(info)
            continue

        audio_path = audio_dir / f"scene_{sid:02d}.mp3"
        print(f"  {sid:2d}  [{speaker:12s}]  ", end="", flush=True)
        info["dur"] = tts_scene(text, vid, vcfg, audio_path)
        info["audio"] = audio_path
        infos.append(info)

    # ━━ Step 3: Whisper verification ━━
    print(f"\n── Whisper verify ──")
    for info in infos:
        if not info["audio"]:
            continue
        ts = whisper_timestamps(info["audio"])
        wts = normalize_ts(ts, info["dur"], info["text"])
        transcript = " ".join(w[0] for w in wts)
        info["word_ts"] = wts
        ok = "OK" if len(wts) > 0 else "EMPTY"
        print(f"  {info['id']:2d}  [{info['speaker']:12s}]  {ok}  \"{transcript[:80]}\"")

    # ━━ Step 4: Visuals ━━
    if args.sound_only:
        print(f"\n── Scene cards (sound-only) ──")
        for info in infos:
            sid = info["id"]
            scene = info["scene"]
            total = max(info["dur"] + info["pause"], 1.5)
            vid = video_dir / f"scene_{sid:02d}.mp4"

            if scene["speaker"] in ("fact_card", "end_card"):
                lines = scene.get("overlay_text", [f"Scene {sid}"])
                bg = "#1a1a2e" if scene["speaker"] == "fact_card" else "black"
                make_text_card(lines, total, vid, bg)
            else:
                label = f"Scene {sid} — {info['speaker'].upper()}"
                make_black_card(label, total, vid)

            info["video"] = vid
            print(f"  {sid:2d}  card ({total:.1f}s)")
    else:
        # image-only mode
        print(f"\n── Images (flux-pro) ──")
        image_jobs = []
        for info in infos:
            sid = info["id"]
            scene = info["scene"]
            prompt = scene.get("image_prompt")
            if not prompt:
                info["image"] = None
                continue
            img_path = image_dir / f"scene_{sid:02d}.png"
            image_jobs.append((info, prompt, img_path))

        with ThreadPoolExecutor(max_workers=MAX_IMAGE_WORKERS) as pool:
            futs = {}
            for info, prompt, img_path in image_jobs:
                f = pool.submit(gen_image, prompt, art_style, img_path)
                futs[f] = (info, img_path)
            for f in as_completed(futs):
                info, img_path = futs[f]
                try:
                    info["image"] = f.result()
                    print(f"  {info['id']:2d}  ", end="")
                except Exception as e:
                    print(f"  {info['id']:2d}  FAIL: {e}")
                    info["image"] = None

        print(f"\n── Image -> video clips ──")
        for info in infos:
            sid = info["id"]
            scene = info["scene"]
            total = max(info["dur"] + info["pause"], 1.5)
            vid = video_dir / f"scene_{sid:02d}.mp4"

            if scene["speaker"] in ("fact_card", "end_card"):
                lines = scene.get("overlay_text", [])
                bg = "#1a1a2e" if scene["speaker"] == "fact_card" else "black"
                make_text_card(lines, total, vid, bg)
                info["video"] = vid
                print(f"  {sid:2d}  text card ({total:.1f}s)")
            elif info.get("image"):
                image_to_video(info["image"], total, vid)
                info["video"] = vid
                print(f"  {sid:2d}  image ({total:.1f}s)")
            else:
                label = f"Scene {sid}"
                make_black_card(label, total, vid)
                info["video"] = vid
                print(f"  {sid:2d}  fallback card ({total:.1f}s)")

    # ━━ Step 5: Subtitles ━━
    print(f"\n── Subtitles ──")
    all_phrases = []
    offset = 0.0
    for info in infos:
        wts = info.get("word_ts", [])
        if wts:
            global_wts = [(w, s + offset, e + offset) for w, s, e in wts]
            all_phrases.extend(group_phrases(global_wts))
        offset += max(info["dur"] + info["pause"], 1.5)

    ass_path = out_dir / "subtitles.ass"
    write_ass(all_phrases, title, ass_path)
    print(f"  {len(all_phrases)} phrases")

    # ━━ Step 6: Combine + concat ━━
    print(f"\n── Assembly ──")
    combined = []
    for info in infos:
        sid = info["id"]
        total = max(info["dur"] + info["pause"], 1.5)
        cp = combined_dir / f"scene_{sid:02d}.mp4"
        combine_av(info["video"], info["audio"], total, cp)
        combined.append(cp)
        print(f"  {sid:2d}  ({total:.1f}s)")

    # Concat
    concat_txt = out_dir / "concat.txt"
    with open(concat_txt, "w") as f:
        for p in combined:
            f.write(f"file '{p.resolve()}'\n")

    concat_raw = out_dir / "concat_raw.mp4"
    if concat_raw.exists():
        concat_raw.unlink()
    ffmpeg_run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0",
         "-i", str(concat_txt), "-c", "copy", str(concat_raw)],
        "concat",
    )

    # Burn subtitles
    final_path = out_dir / "final.mp4"
    if final_path.exists():
        final_path.unlink()
    if all_phrases:
        ffmpeg_run([
            "ffmpeg", "-y", "-i", str(concat_raw),
            "-vf", f"ass='{ass_path.resolve()}'",
            "-c:v", "libx264", "-preset", "fast", "-crf", "18",
            "-c:a", "copy", str(final_path),
        ], "subtitles")
        concat_raw.unlink(missing_ok=True)
    else:
        concat_raw.rename(final_path)

    dur = get_duration(final_path)
    print(f"\n{'=' * 60}")
    print(f"  DONE: {final_path}")
    print(f"  Duration: {dur:.1f}s ({dur / 60:.1f} min)")
    print(f"{'=' * 60}\n")


if __name__ == "__main__":
    main()
