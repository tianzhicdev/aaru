#!/usr/bin/env python3
"""
build_sprite_atlas.py

Reads character walk spritesheets from AARU/Resources/Sprites/ and cuts each
576x256 sheet (9 frames x 4 directions, each frame 64x64) into individual
RGBA PNG frames saved to AARU/Resources/Sprites.atlas/.

Naming convention:
    {spriteId}_walk_{direction}_{frameIndex}.png
    e.g. m01_explorer_walk_south_0.png
"""

import os
import glob
from PIL import Image

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SPRITES_DIR = os.path.join(
    os.path.dirname(__file__), "..", "AARU", "Resources", "Sprites"
)
ATLAS_DIR = os.path.join(
    os.path.dirname(__file__), "..", "AARU", "Resources", "Sprites.atlas"
)

FRAME_W = 96
FRAME_H = 64
NUM_COLS = 8   # frames per row
NUM_ROWS = 1   # single row (east only)

DIRECTION_MAP = {
    0: "east",
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    sprites_dir = os.path.abspath(SPRITES_DIR)
    atlas_dir = os.path.abspath(ATLAS_DIR)

    # Create atlas output directory
    os.makedirs(atlas_dir, exist_ok=True)
    print(f"Atlas output directory: {atlas_dir}")

    # Gather all walk spritesheets
    pattern = os.path.join(sprites_dir, "*_walk.png")
    sheets = sorted(glob.glob(pattern))

    if not sheets:
        print("No spritesheet files found – nothing to do.")
        return

    print(f"Found {len(sheets)} spritesheet(s) to process.\n")

    total_frames = 0

    for sheet_path in sheets:
        filename = os.path.basename(sheet_path)
        # Derive spriteId: e.g. "m01_explorer" from "m01_explorer_walk.png"
        sprite_id = filename.replace("_walk.png", "")

        img = Image.open(sheet_path).convert("RGBA")
        w, h = img.size

        expected_w = FRAME_W * NUM_COLS
        expected_h = FRAME_H * NUM_ROWS
        if w != expected_w or h != expected_h:
            print(
                f"  WARNING: {filename} is {w}x{h}, expected {expected_w}x{expected_h} – skipping."
            )
            continue

        for row in range(NUM_ROWS):
            direction = DIRECTION_MAP[row]
            for col in range(NUM_COLS):
                left = col * FRAME_W
                upper = row * FRAME_H
                right = left + FRAME_W
                lower = upper + FRAME_H

                frame = img.crop((left, upper, right, lower))

                out_name = f"{sprite_id}_walk_{direction}_{col}.png"
                out_path = os.path.join(atlas_dir, out_name)
                frame.save(out_path, "PNG")
                total_frames += 1

        print(f"  {filename}  ->  {NUM_ROWS * NUM_COLS} frames")

    print(f"\nDone. {total_frames} frames written to {atlas_dir}")


if __name__ == "__main__":
    main()
