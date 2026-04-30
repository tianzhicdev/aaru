#!/usr/bin/env python3
from __future__ import annotations
"""
produce_swiping_video.py — Turn starting images into a video using Kling v3.

Pipeline:
  1. Upload each scene image to fal
  2. Kling v3 image-to-video (with camera prompt + native audio)
  3. Text card for scene 8 via FFmpeg
  4. Concat + assemble final.mp4

Raw materials preserved: images/ (input), video/ (kling clips), final.mp4 (assembled)

Usage:
    export FAL_KEY=...
    python scripts/produce_swiping_video.py marketing/stories/script-swiping.json
    python scripts/produce_swiping_video.py marketing/stories/script-swiping.json --scenes 1,2,3
    python scripts/produce_swiping_video.py marketing/stories/script-swiping.json --clean
"""

import argparse
import json
import math
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

KLING_MODEL = "fal-ai/kling-video/v3/standard/image-to-video"
KLING_MIN_DUR = 3
KLING_MAX_DUR = 15
MAX_WORKERS = 3
FONT_PATH = "/System/Library/Fonts/Helvetica.ttc"


def ffmpeg_run(cmd: list, label: str = ""):
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        err = result.stderr[-1200:] if result.stderr else "no stderr"
        raise RuntimeError(f"FFmpeg failed ({label}): {err}")


def get_duration(path: Path) -> float:
    r = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(json.loads(r.stdout)["format"]["duration"])


def pick_duration(needed: float) -> int:
    """Clamp to Kling's 3-15s integer range."""
    return min(max(KLING_MIN_DUR, math.ceil(needed)), KLING_MAX_DUR)


def download(url: str, path: Path):
    resp = requests.get(url, timeout=300, stream=True)
    resp.raise_for_status()
    with open(path, "wb") as f:
        for chunk in resp.iter_content(8192):
            if chunk:
                f.write(chunk)


def generate_video_from_image(
    image_path: Path, prompt: str, duration: int, out_path: Path, generate_audio: bool = True,
):
    """Upload image → Kling v3 image-to-video → download clip."""
    if out_path.exists() and out_path.stat().st_size > 10000:
        dur = get_duration(out_path)
        print(f"    skip ({dur:.1f}s)")
        return

    image_url = fal_client.upload_file(str(image_path))
    print(f"    kling v3 ({duration}s)...", end="", flush=True)

    result = fal_client.subscribe(KLING_MODEL, arguments={
        "start_image_url": image_url,
        "prompt": prompt,
        "duration": str(duration),
        "generate_audio": generate_audio,
        "negative_prompt": "blur, distort, low quality, text, words, letters, watermark, logo",
        "cfg_scale": 0.5,
    })

    url = None
    if isinstance(result.get("video"), dict):
        url = result["video"].get("url")
    if not url:
        url = result.get("video_url")
    if not url:
        raise RuntimeError(f"No video URL: {json.dumps(result)[:300]}")

    download(url, out_path)
    dur = get_duration(out_path)
    print(f" done ({dur:.1f}s)")


def make_text_card(lines: list, duration: float, out_path: Path):
    """Multi-line text fade-in on black."""
    if out_path.exists() and out_path.stat().st_size > 0:
        print(f"    skip text card")
        return
    vf_parts = []
    visible = [l for l in lines if l.strip()]
    n = len(visible)
    for idx, line in enumerate(visible):
        safe = line.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\u2019")
        # Thumos branding line gets different style
        is_brand = line.strip().lower() == "thumos"
        fs = 52 if is_brand else 44
        y_off = int((idx - n / 2 + 0.5) * 80)
        delay = 1.0 + idx * 1.0  # 1s between each line
        vf_parts.append(
            f"drawtext=text='{safe}':fontsize={fs}:fontcolor=white"
            f":fontfile={FONT_PATH}:x=(w-text_w)/2:y=(h/2)+{y_off}"
            f":alpha='if(lt(t\\,{delay})\\,0\\,min(1\\,(t-{delay})/0.5))'"
        )
    vf = ",".join(vf_parts) if vf_parts else "null"
    ffmpeg_run([
        "ffmpeg", "-y", "-f", "lavfi",
        "-i", f"color=c=black:s=1080x1920:d={duration}:r=24",
        "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-t", f"{duration:.2f}",
        "-vf", vf,
        "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k",
        "-shortest",
        str(out_path),
    ], label="text_card")
    print(f"    text card ({duration:.1f}s)")


def normalize_video(clip: Path, target_dur: float, out: Path):
    """Re-encode clip to exact target duration with consistent format for concat."""
    if out.exists() and out.stat().st_size > 10000:
        return
    ffmpeg_run([
        "ffmpeg", "-y",
        "-stream_loop", "-1", "-i", str(clip),
        "-t", f"{target_dur:.2f}",
        "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black",
        "-r", "24",
        "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2",
        str(out),
    ], label=f"normalize {out.name}")


def main():
    parser = argparse.ArgumentParser(description="Produce swiping video from starting images")
    parser.add_argument("script", help="Path to script JSON")
    parser.add_argument("--scenes", type=str, default=None, help="Comma-separated scene IDs")
    parser.add_argument("--clean", action="store_true", help="Delete video output, keep images")
    parser.add_argument("--no-audio", action="store_true", help="Disable Kling native audio")
    args = parser.parse_args()

    global fal_client, requests
    import fal_client as _fc
    import requests as _req
    fal_client = _fc
    requests = _req

    script_path = Path(args.script).resolve()
    if not script_path.exists():
        print(f"Error: {script_path} not found")
        sys.exit(1)

    script = json.loads(script_path.read_text())
    episode = script["episode"]
    all_scenes = script["scenes"]

    # Filter
    if args.scenes:
        keep = set(int(x) for x in args.scenes.split(","))
        scenes = [s for s in all_scenes if s["scene_id"] in keep]
    else:
        scenes = all_scenes

    # Dirs
    base_dir = script_path.parent / "output" / "everyone-is-swiping"
    image_dir = base_dir / "images"
    video_dir = base_dir / "video"
    combined_dir = base_dir / "combined"

    if args.clean:
        for d in [video_dir, combined_dir]:
            if d.exists():
                shutil.rmtree(d)
        # Remove old final
        for f in base_dir.glob("final*"):
            f.unlink()

    for d in [video_dir, combined_dir]:
        d.mkdir(parents=True, exist_ok=True)

    # Check images exist
    for scene in scenes:
        sid = scene["scene_id"]
        if sid == 8:
            continue
        img = image_dir / f"scene_{sid:02d}.png"
        if not img.exists():
            print(f"Error: missing image {img}")
            sys.exit(1)

    print(f"\n{'='*60}")
    print(f"  Everyone Is Swiping — Video Production")
    print(f"  Scenes: {[s['scene_id'] for s in scenes]}")
    print(f"  Audio: {'off' if args.no_audio else 'native (Kling)'}")
    print(f"{'='*60}")

    # ── Step 1: Generate video clips from images ──
    print(f"\n── Kling v3 image-to-video ──")

    video_scenes = [s for s in scenes if s["scene_id"] != 8 and s.get("image_prompt")]
    text_scenes = [s for s in scenes if s["scene_id"] == 8 or not s.get("image_prompt")]

    # Build prompts: camera movement + art direction
    def build_prompt(scene: dict) -> str:
        parts = []
        if scene.get("camera"):
            parts.append(scene["camera"])
        if scene.get("sound") and not args.no_audio:
            parts.append(f"Audio: {scene['sound']}")
        parts.append("Cinematic photorealistic, 9:16 vertical, smooth motion, no text or watermarks")
        return ". ".join(parts)

    # Generate video clips (parallel, max 3 at a time)
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futs = {}
        for scene in video_scenes:
            sid = scene["scene_id"]
            img = image_dir / f"scene_{sid:02d}.png"
            vid = video_dir / f"scene_{sid:02d}.mp4"
            dur = pick_duration(scene.get("duration", 5))
            prompt = build_prompt(scene)

            print(f"  scene {sid}: ", end="", flush=True)
            f = pool.submit(
                generate_video_from_image,
                img, prompt, dur, vid, not args.no_audio,
            )
            futs[f] = sid

        for f in as_completed(futs):
            sid = futs[f]
            try:
                f.result()
            except Exception as e:
                print(f"\n  scene {sid} FAIL: {e}")

    # Text card(s)
    for scene in text_scenes:
        sid = scene["scene_id"]
        vid = video_dir / f"scene_{sid:02d}.mp4"
        lines = scene.get("overlay_text", ["Thumos"])
        dur = scene.get("duration", 4.0)
        print(f"  scene {sid}: ", end="", flush=True)
        make_text_card(lines, dur, vid)

    # ── Step 2: Normalize + concat ──
    print(f"\n── Normalize + assemble ──")
    combined = []
    for scene in sorted(scenes, key=lambda s: s["scene_id"]):
        sid = scene["scene_id"]
        vid = video_dir / f"scene_{sid:02d}.mp4"
        if not vid.exists():
            print(f"  scene {sid}: MISSING, skip")
            continue
        norm = combined_dir / f"scene_{sid:02d}.mp4"
        target_dur = scene.get("duration", 5.0)
        normalize_video(vid, target_dur, norm)
        combined.append(norm)
        print(f"  scene {sid}: {target_dur:.1f}s")

    # Concat
    concat_txt = base_dir / "concat.txt"
    with open(concat_txt, "w") as f:
        for p in combined:
            f.write(f"file '{p.resolve()}'\n")

    final_path = base_dir / "final.mp4"
    if final_path.exists():
        final_path.unlink()

    ffmpeg_run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0",
         "-i", str(concat_txt), "-c", "copy", str(final_path)],
        "concat",
    )

    dur = get_duration(final_path)
    print(f"\n{'='*60}")
    print(f"  DONE: {final_path}")
    print(f"  Duration: {dur:.1f}s ({dur/60:.1f} min)")
    print(f"  Raw materials preserved:")
    print(f"    images/ — starting images (gpt-image-2)")
    print(f"    video/  — kling v3 clips")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
