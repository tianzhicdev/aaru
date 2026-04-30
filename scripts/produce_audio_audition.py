#!/usr/bin/env python3
"""
Produce full-length audio for multiple TTS voices from a script JSON.
Then assemble a simple "Scene X" placeholder video with the audio.

Usage:
  python scripts/produce_audio_audition.py marketing/stories/script-01-am-i-just-boring.json
"""

import json, os, sys, subprocess, re, requests, math
import fal_client

VOICES = {
    "orpheus_zac": {
        "model": "fal-ai/orpheus-tts",
        "params": {"voice": "zac", "language": "english", "temperature": 0.9, "repetition_penalty": 1.2},
        "text_field": "text",
    },
    "maya_irish": {
        "model": "fal-ai/maya",
        "params": {"prompt": "A young man, late 20s, soft Irish accent. Melancholic but not dramatic. Speaking slowly and honestly, like confiding after a few pints."},
        "text_field": "text",
    },
    "maya_brooklyn": {
        "model": "fal-ai/maya",
        "params": {"prompt": "A young man, late 20s, Brooklyn New York accent. Casual, self-deprecating humor even when sad. Talking quietly, like recording a voice memo at 2am."},
        "text_field": "text",
    },
}

# Maya doesn't support Orpheus tags — strip them
ORPHEUS_TAGS = re.compile(r'<(sigh|laugh|chuckle|gasp|cough|sniffle|groan|yawn)>')

def strip_orpheus_tags(text):
    return ORPHEUS_TAGS.sub('', text).strip()

def get_duration(path):
    r = subprocess.run(["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
                        "-of", "csv=p=0", path], capture_output=True, text=True)
    return float(r.stdout.strip())

def download(url, path):
    r = requests.get(url)
    with open(path, 'wb') as f:
        f.write(r.content)

def generate_scene_audio(voice_name, voice_cfg, text, out_path):
    """Generate TTS for one scene."""
    if os.path.exists(out_path):
        dur = get_duration(out_path)
        print(f"  skip  {voice_name} scene ({dur:.1f}s)")
        return dur

    model = voice_cfg["model"]
    params = dict(voice_cfg["params"])

    # Maya uses 'text' field; strip Orpheus-specific tags
    if "maya" in voice_name:
        params["text"] = strip_orpheus_tags(text)
    else:
        params["text"] = text

    result = fal_client.subscribe(model, arguments=params)

    url = result["audio"]["url"]
    download(url, out_path)
    dur = get_duration(out_path)
    print(f"  done  {voice_name} scene ({dur:.1f}s)")
    return dur

def make_scene_card_video(scene_id, duration, out_path):
    """Generate a simple black video with 'Scene N' text."""
    if os.path.exists(out_path):
        return
    # 1080x1920 vertical black with white text
    subprocess.run([
        "ffmpeg", "-y", "-f", "lavfi",
        "-i", f"color=c=black:s=1080x1920:d={duration}:r=30",
        "-vf", f"drawtext=text='Scene {scene_id}':fontsize=60:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:font=Helvetica",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-an", out_path
    ], capture_output=True)

def combine_scene(audio_path, video_path, out_path, pause_after):
    """Overlay audio on scene card video, pad to match."""
    if os.path.exists(out_path):
        return get_duration(out_path)
    audio_dur = get_duration(audio_path)
    total_dur = audio_dur + pause_after
    subprocess.run([
        "ffmpeg", "-y",
        "-i", video_path, "-i", audio_path,
        "-filter_complex",
        f"[0:v]trim=0:{total_dur},setpts=PTS-STARTPTS[v];"
        f"[1:a]apad=pad_dur={pause_after}[a]",
        "-map", "[v]", "-map", "[a]",
        "-c:v", "libx264", "-c:a", "aac",
        "-shortest", out_path
    ], capture_output=True)
    return get_duration(out_path)

def main():
    script_path = sys.argv[1]
    with open(script_path) as f:
        script = json.load(f)

    title = script["episode"]["title"]
    slug = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')
    scenes = script["scenes"]

    for voice_name, voice_cfg in VOICES.items():
        print(f"\n{'='*60}")
        print(f"  Voice: {voice_name}")
        print(f"  Scenes: {len(scenes)}")
        print(f"{'='*60}\n")

        out_dir = f"marketing/stories/tts-auditions/full/{voice_name}"
        os.makedirs(f"{out_dir}/audio", exist_ok=True)
        os.makedirs(f"{out_dir}/video", exist_ok=True)
        os.makedirs(f"{out_dir}/combined", exist_ok=True)

        # Step 1: Generate audio per scene
        print("  Step 1: TTS Generation")
        scene_durations = []
        for scene in scenes:
            sid = scene["scene_id"]
            text = " ".join(scene.get("sentences_tagged", scene["sentences"]))
            audio_path = f"{out_dir}/audio/scene_{sid:02d}.wav"
            dur = generate_scene_audio(voice_name, voice_cfg, text, audio_path)
            scene_durations.append(dur)

        total_audio = sum(scene_durations)
        print(f"\n  Total audio: {total_audio:.1f}s ({total_audio/60:.1f} min)\n")

        # Step 2: Generate scene card videos
        print("  Step 2: Scene card videos")
        for scene in scenes:
            sid = scene["scene_id"]
            audio_dur = scene_durations[sid - 1]
            total_dur = audio_dur + scene["pause_after"]
            video_path = f"{out_dir}/video/scene_{sid:02d}.mp4"
            make_scene_card_video(sid, total_dur, video_path)
            print(f"  done  Scene {sid} card ({total_dur:.1f}s)")

        # Step 3: Combine audio + video per scene
        print("\n  Step 3: Combine audio + video")
        combined_paths = []
        for scene in scenes:
            sid = scene["scene_id"]
            audio_path = f"{out_dir}/audio/scene_{sid:02d}.wav"
            video_path = f"{out_dir}/video/scene_{sid:02d}.mp4"
            combined_path = f"{out_dir}/combined/scene_{sid:02d}.mp4"
            dur = combine_scene(audio_path, video_path, combined_path, scene["pause_after"])
            combined_paths.append(combined_path)
            print(f"  done  Combined scene {sid}: {dur:.1f}s")

        # Step 4: Concatenate all scenes
        print("\n  Step 4: Concatenate")
        concat_file = f"{out_dir}/concat.txt"
        with open(concat_file, 'w') as f:
            for p in combined_paths:
                f.write(f"file '{os.path.abspath(p)}'\n")

        final_path = f"{out_dir}/final.mp4"
        if os.path.exists(final_path):
            os.remove(final_path)
        subprocess.run([
            "ffmpeg", "-y", "-f", "concat", "-safe", "0",
            "-i", concat_file,
            "-c:v", "libx264", "-c:a", "aac",
            final_path
        ], capture_output=True)
        final_dur = get_duration(final_path)
        print(f"\n  DONE: {final_path}")
        print(f"  Duration: {final_dur:.1f}s ({final_dur/60:.1f} min)")
        print(f"{'='*60}\n")

if __name__ == "__main__":
    main()
