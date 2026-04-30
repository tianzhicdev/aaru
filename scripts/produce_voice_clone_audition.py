#!/usr/bin/env python3
"""
Produce voice-cloned TTS auditions from a script JSON + reference WAV.

For each voice x model combo, generates audio for the first N scenes,
creates placeholder scene-card videos, composites, and concatenates
into a preview_3scenes.mp4.

Usage:
    python scripts/produce_voice_clone_audition.py \
        marketing/stories/script-01-am-i-just-boring.json \
        --voices mark_narrations carlton_french \
        --models f5 minimax \
        --scenes 3
"""

import json, os, sys, subprocess, re, time
from pathlib import Path

# Lazy-imported after arg parsing
fal_client = None

VOICES_DIR = Path("marketing/stories/tts-auditions/voices")
OUT_BASE = Path("marketing/stories/tts-auditions/full")

MODELS = {
    "f5": {
        "fal_model": "fal-ai/f5-tts",
        "text_field": "gen_text",
        "ref_audio_field": "ref_audio_url",
        "ref_text_field": "ref_text",
        "extra_params": {"model_type": "F5-TTS"},
        "audio_key": "audio_url",  # returns {audio_url: "..."}
    },
    "minimax": {
        "fal_model": "fal-ai/minimax/speech-02-hd",
        "text_field": "text",
        "ref_audio_field": "reference_audio_url",
        "ref_text_field": None,  # minimax infers from audio
        "extra_params": {},
        "audio_key": "audio",  # returns {audio: {url: "..."}}
    },
}


def get_duration(path):
    r = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", str(path)],
        capture_output=True, text=True,
    )
    return float(json.loads(r.stdout)["format"]["duration"])


def upload_voice_ref(wav_path):
    """Upload voice reference to fal.ai and return URL."""
    return fal_client.upload_file(str(wav_path))


def generate_tts_clone(model_cfg, text, ref_audio_url, out_path):
    """Generate voice-cloned TTS for one scene."""
    if out_path.exists() and out_path.stat().st_size > 0:
        dur = get_duration(out_path)
        print(f"    skip ({dur:.1f}s)")
        return dur

    params = dict(model_cfg["extra_params"])
    params[model_cfg["text_field"]] = text
    params[model_cfg["ref_audio_field"]] = ref_audio_url
    if model_cfg.get("ref_text_field"):
        # f5-tts needs a ref_text transcript — leave empty for auto-detect
        params[model_cfg["ref_text_field"]] = ""

    result = fal_client.subscribe(model_cfg["fal_model"], arguments=params)

    # Response varies by model: {audio: {url}} or {audio_url: ...}
    url = None
    audio_key = model_cfg.get("audio_key", "audio")
    raw = result.get(audio_key)
    if isinstance(raw, dict):
        url = raw.get("url")
    elif isinstance(raw, str):
        url = raw
    if not url:
        # Fallback: try both keys
        if isinstance(result.get("audio"), dict):
            url = result["audio"].get("url")
        if not url:
            url = result.get("audio_url")
    if not url:
        raise RuntimeError(f"No audio URL in response: {json.dumps(result)[:300]}")

    import requests
    resp = requests.get(url, timeout=120)
    resp.raise_for_status()
    out_path.write_bytes(resp.content)

    dur = get_duration(out_path)
    print(f"    done ({dur:.1f}s)")
    return dur


def make_scene_card(scene_id, duration, out_path):
    """Black video with 'Scene N' text."""
    if out_path.exists() and out_path.stat().st_size > 0:
        return
    subprocess.run([
        "ffmpeg", "-y", "-f", "lavfi",
        "-i", f"color=c=black:s=1080x1920:d={duration}:r=30",
        "-vf", f"drawtext=text='Scene {scene_id}':fontsize=60:fontcolor=white"
              f":x=(w-text_w)/2:y=(h-text_h)/2:font=Helvetica",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", str(out_path),
    ], capture_output=True)


def combine(audio_path, video_path, out_path, pause_after):
    """Overlay audio on scene card, pad with pause."""
    if out_path.exists() and out_path.stat().st_size > 0:
        return get_duration(out_path)
    audio_dur = get_duration(audio_path)
    total_dur = audio_dur + pause_after
    subprocess.run([
        "ffmpeg", "-y",
        "-i", str(video_path), "-i", str(audio_path),
        "-filter_complex",
        f"[0:v]trim=0:{total_dur},setpts=PTS-STARTPTS[v];"
        f"[1:a]apad=pad_dur={pause_after}[a]",
        "-map", "[v]", "-map", "[a]",
        "-c:v", "libx264", "-c:a", "aac", "-shortest", str(out_path),
    ], capture_output=True)
    return get_duration(out_path)


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("script", help="Path to script JSON")
    parser.add_argument("--voices", nargs="+", required=True, help="Voice reference names (without .wav)")
    parser.add_argument("--models", nargs="+", default=["f5", "minimax"], help="TTS models to use")
    parser.add_argument("--scenes", type=int, default=3, help="Number of scenes to render")
    args = parser.parse_args()

    global fal_client
    import fal_client as _fc
    fal_client = _fc
    import requests  # noqa: ensure available

    with open(args.script) as f:
        script = json.load(f)

    scenes = script["scenes"][:args.scenes]
    print(f"\nScript: {script['episode']['title']}")
    print(f"Scenes: {len(scenes)} | Voices: {args.voices} | Models: {args.models}\n")

    for voice_name in args.voices:
        wav_path = VOICES_DIR / f"{voice_name}.wav"
        if not wav_path.exists():
            print(f"ERROR: {wav_path} not found")
            continue

        print(f"Uploading {voice_name} reference...")
        ref_url = upload_voice_ref(wav_path)
        print(f"  Uploaded: {ref_url[:80]}...")

        for model_name in args.models:
            model_cfg = MODELS[model_name]
            run_name = f"{voice_name}_{model_name}"
            out_dir = OUT_BASE / run_name
            audio_dir = out_dir / "audio"
            video_dir = out_dir / "video"
            combined_dir = out_dir / "combined"
            for d in [audio_dir, video_dir, combined_dir]:
                d.mkdir(parents=True, exist_ok=True)

            print(f"\n{'='*50}")
            print(f"  {run_name}")
            print(f"{'='*50}")

            # Generate TTS per scene
            combined_paths = []
            for scene in scenes:
                sid = scene["scene_id"]
                text = " ".join(scene.get("sentences_tagged", scene["sentences"]))
                audio_path = audio_dir / f"scene_{sid:02d}.wav"

                print(f"  Scene {sid}: TTS...", end="", flush=True)
                try:
                    dur = generate_tts_clone(model_cfg, text, ref_url, audio_path)
                except Exception as e:
                    print(f"    FAILED: {e}")
                    continue

                # Scene card video
                total_dur = dur + scene["pause_after"]
                vid_path = video_dir / f"scene_{sid:02d}.mp4"
                make_scene_card(sid, total_dur, vid_path)

                # Combine
                comb_path = combined_dir / f"scene_{sid:02d}.mp4"
                combine(audio_path, vid_path, comb_path, scene["pause_after"])
                combined_paths.append(comb_path)

            if not combined_paths:
                print("  No scenes rendered — skipping concat")
                continue

            # Concat
            concat_file = out_dir / "concat.txt"
            with open(concat_file, "w") as f:
                for p in combined_paths:
                    f.write(f"file '{p.resolve()}'\n")

            preview = out_dir / "preview_3scenes.mp4"
            if preview.exists():
                preview.unlink()
            subprocess.run([
                "ffmpeg", "-y", "-f", "concat", "-safe", "0",
                "-i", str(concat_file),
                "-c:v", "libx264", "-c:a", "aac", str(preview),
            ], capture_output=True)
            dur = get_duration(preview)
            print(f"\n  DONE: {preview} ({dur:.1f}s)")

    # Clean up full video downloads
    for f in VOICES_DIR.glob("*_full.mp4"):
        f.unlink()
        print(f"  Cleaned up {f.name}")

    print("\nAll done!")


if __name__ == "__main__":
    main()
