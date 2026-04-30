#!/usr/bin/env python3
from __future__ import annotations
"""
produce_swiping_images.py — Generate starting images for "Everyone Is Swiping" video.

Uses OpenAI gpt-image-2:
  - images.generate for standalone scenes (no references)
  - images.edit for scenes with character/scene references (up to 16 images)

Pipeline:
  1. CHARACTER_REF (hero portrait) + DINNER_REF (scene 1) — parallel
  2. Scene 2 (full body + flippers) — needs CHARACTER_REF
  3. Scene 3 (selfie) → SELFIE_REF — needs CHARACTER_REF + DINNER_REF
  4. Scene 4 (dating app card) — needs SELFIE_REF
  5. Scenes 5, 6, 7 (standalone) — parallel
  6. Scene 8 = text card, no image

Usage:
    export OPENAI_API_KEY=...
    python scripts/produce_swiping_images.py marketing/stories/script-swiping.json
    python scripts/produce_swiping_images.py marketing/stories/script-swiping.json --clean
    python scripts/produce_swiping_images.py marketing/stories/script-swiping.json --scenes 3,4
"""

import argparse
import base64
import json
import shutil
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

SIZE = "1024x1536"  # 2:3 portrait (closest to 9:16)
QUALITY = "high"


def save_image(result, path: Path):
    b64 = result.data[0].b64_json
    path.write_bytes(base64.b64decode(b64))
    sz = path.stat().st_size / 1024
    print(f"    -> {path.name} ({sz:.0f} KB)")


def generate(client, prompt: str, path: Path):
    if path.exists() and path.stat().st_size > 1000:
        print(f"    skip: {path.name}")
        return
    print(f"    generating: {path.name}...", flush=True)
    result = client.images.generate(
        model="gpt-image-2",
        prompt=prompt,
        size=SIZE,
        quality=QUALITY,
    )
    save_image(result, path)


def edit_with_refs(client, prompt: str, ref_paths: list[Path], path: Path):
    if path.exists() and path.stat().st_size > 1000:
        print(f"    skip: {path.name}")
        return
    for rp in ref_paths:
        if not rp.exists():
            raise FileNotFoundError(f"Reference not found: {rp}")
    print(f"    editing with {len(ref_paths)} ref(s): {path.name}...", flush=True)
    files = [open(rp, "rb") for rp in ref_paths]
    try:
        result = client.images.edit(
            model="gpt-image-2",
            image=files,
            prompt=prompt,
            size=SIZE,
        )
        save_image(result, path)
    finally:
        for f in files:
            f.close()


def main():
    parser = argparse.ArgumentParser(description="Generate images for swiping video")
    parser.add_argument("script", help="Path to script JSON")
    parser.add_argument("--clean", action="store_true", help="Delete existing images first")
    parser.add_argument("--scenes", type=str, default=None, help="Comma-separated scene IDs")
    args = parser.parse_args()

    from openai import OpenAI
    client = OpenAI()

    script_path = Path(args.script).resolve()
    if not script_path.exists():
        print(f"Error: {script_path} not found")
        sys.exit(1)

    script = json.loads(script_path.read_text())
    episode = script["episode"]
    art_style = episode.get("art_style", "")
    characters = episode.get("characters", {})
    scenes = {s["scene_id"]: s for s in script["scenes"]}

    # Filter
    if args.scenes:
        keep = set(int(x) for x in args.scenes.split(","))
    else:
        keep = None

    # Output dir
    out_dir = script_path.parent / "output" / "everyone-is-swiping" / "images"
    if args.clean and out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    def styled(prompt: str) -> str:
        return f"{art_style}. {prompt}" if art_style else prompt

    print(f"\n{'='*60}")
    print(f"  Everyone Is Swiping — Image Generation")
    print(f"  Art style: {art_style[:60]}...")
    print(f"  Output: {out_dir}")
    print(f"{'='*60}")

    # Named references (always generated regardless of --scenes filter)
    char_ref = out_dir / "character_ref.png"
    dinner_ref = out_dir / "scene_01.png"
    selfie_ref = out_dir / "scene_03.png"

    # ── Phase 1: CHARACTER_REF + DINNER_REF (parallel) ──
    print(f"\n── Phase 1: Hero portrait + Dinner table (parallel) ──")
    hero = characters.get("the_man", {})
    hero_prompt = hero.get("hero_prompt", "")

    with ThreadPoolExecutor(max_workers=2) as pool:
        futs = []
        futs.append(pool.submit(generate, client, styled(hero_prompt), char_ref))
        if keep is None or 1 in keep:
            futs.append(pool.submit(
                generate, client,
                styled(scenes[1]["image_prompt"]),
                dinner_ref,
            ))
        for f in as_completed(futs):
            f.result()  # raise on error

    # ── Phase 2: Scene 2 — Full body from behind (needs CHARACTER_REF) ──
    if keep is None or 2 in keep:
        print(f"\n── Phase 2: Scene 2 (from behind, walking to table) ──")
        scene2_path = out_dir / "scene_02.png"
        edit_with_refs(
            client,
            styled(
                f"Generate a new full-body photo of the man shown in image 1, "
                f"but seen FROM BEHIND walking away from camera. "
                f"Keep his hair, build, and clothing the same. "
                f"{scenes[2]['image_prompt']}"
            ),
            [char_ref],
            scene2_path,
        )

    # ── Phase 3: Scene 3 — Selfie (needs CHARACTER_REF + DINNER_REF) → SELFIE_REF ──
    if keep is None or 3 in keep:
        print(f"\n── Phase 3: Scene 3 (selfie → SELFIE_REF) ──")
        edit_with_refs(
            client,
            styled(
                f"Create a selfie photo of the man from image 1, with the dinner table "
                f"setup from image 2 visible behind him over his shoulder. "
                f"Keep his face exactly the same as image 1. "
                f"{scenes[3]['image_prompt']}"
            ),
            [char_ref, dinner_ref],
            selfie_ref,
        )

    # ── Phase 4: Scene 4 — Dating app card (needs SELFIE_REF) ──
    if keep is None or 4 in keep:
        print(f"\n── Phase 4: Scene 4 (dating app card) ──")
        scene4_path = out_dir / "scene_04.png"
        edit_with_refs(
            client,
            styled(
                f"Place the selfie photo from image 1 onto a dating app profile card "
                f"displayed on a smartphone screen. "
                f"{scenes[4]['image_prompt']}"
            ),
            [selfie_ref],
            scene4_path,
        )

    # ── Phase 5: Scenes 5, 6, 7 — Standalone (parallel) ──
    standalone = [sid for sid in (5, 6, 7) if keep is None or sid in keep]
    if standalone:
        print(f"\n── Phase 5: Scenes {standalone} (standalone, parallel) ──")
        with ThreadPoolExecutor(max_workers=3) as pool:
            futs = {}
            for sid in standalone:
                path = out_dir / f"scene_{sid:02d}.png"
                f = pool.submit(
                    generate, client,
                    styled(scenes[sid]["image_prompt"]),
                    path,
                )
                futs[f] = sid
            for f in as_completed(futs):
                sid = futs[f]
                try:
                    f.result()
                except Exception as e:
                    print(f"    scene {sid} FAIL: {e}")

    # Scene 8 = text card
    print(f"\n── Scene 8: text card (no image needed) ──")

    # Summary
    print(f"\n{'='*60}")
    generated = sorted(out_dir.glob("*.png"))
    print(f"  Generated {len(generated)} images:")
    for p in generated:
        sz = p.stat().st_size / 1024
        print(f"    {p.name:25s} {sz:6.0f} KB")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
