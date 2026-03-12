#!/usr/bin/env python3
"""
build_sunnyside_sprites.py

Composites Sunnyside World character sprites (base body + hair layer) with
palette swapping for skin tone, hair color, and clothing color variety.

Generates walk and idle spritesheets and individual atlas frames.

Output:
  Sprites.atlas/{spriteId}_walk_east_{0-7}.png   (96x64 each)
  Sprites/{spriteId}_walk.png                     (768x64 strip)
  Sprites.atlas/{spriteId}_idle_east_{0-N}.png   (96x64 each)
  Sprites/{spriteId}_idle.png                     (strip)
"""

import os
import glob
import colorsys
from PIL import Image
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SUNNYSIDE = os.path.join(ROOT, "AARU", "Resources", "Sunnyside", "Characters")
SPRITES_DIR = os.path.join(ROOT, "AARU", "Resources", "Sprites")
ATLAS_DIR = os.path.join(ROOT, "AARU", "Resources", "Sprites.atlas")

FRAME_W = 96
FRAME_H = 64
NUM_FRAMES = 8

# ---------------------------------------------------------------------------
# Color classification
# ---------------------------------------------------------------------------
# Outline colors (shared across all sprites, never swapped)
OUTLINE_TOLERANCE = 8

def is_outline(r, g, b):
    """Check if a color is the dark outline (approx 23,20,36)."""
    return r < 30 + OUTLINE_TOLERANCE and g < 25 + OUTLINE_TOLERANCE and b < 42 + OUTLINE_TOLERANCE and r < 50 and g < 50 and b < 60

# ---------------------------------------------------------------------------
# Skin tone palettes — defined as hue-shift from the default light skin
# Default skin: approx HSV(25°, 0.46, 0.91) -> rgb(232,173,125)
# ---------------------------------------------------------------------------
SKIN_PALETTES = {
    # name: (hue_shift, sat_mult, val_mult)
    # hue_shift in degrees, sat/val are multipliers
    "light":  (0, 1.0, 1.0),       # default — no change
    "medium": (0, 1.05, 0.82),     # same hue, slightly more saturated, darker
    "dark":   (-2, 1.1, 0.65),     # slightly warmer, more saturated, much darker
}

# Base skin reference colors (with ±2 tolerance matching)
SKIN_COLORS = {
    # (r, g, b): True if it's a skin color
    (232, 173, 125), (233, 173, 125), (232, 172, 124), (232, 172, 125),
    (216, 149, 108), (217, 150, 109),
    (200, 127, 92), (200, 127, 91),
    (187, 109, 83),
}

def is_skin_color(r, g, b):
    """Check if a pixel is a skin color (within tolerance)."""
    for sr, sg, sb in SKIN_COLORS:
        if abs(r - sr) <= 3 and abs(g - sg) <= 3 and abs(b - sb) <= 3:
            return True
    return False

# Clothing reference colors
CLOTHING_COLORS = {
    (55, 68, 100), (56, 69, 101),    # blue shirt
    (36, 43, 66), (37, 44, 67),      # blue shadow
}

def is_clothing_color(r, g, b):
    for cr, cg, cb in CLOTHING_COLORS:
        if abs(r - cr) <= 3 and abs(g - cg) <= 3 and abs(b - cb) <= 3:
            return True
    return False

# Red accent colors on the body
RED_ACCENT_COLORS = {
    (165, 31, 51), (166, 31, 52),
    (250, 113, 122),
    (233, 50, 69), (232, 49, 69),
}

def is_red_accent(r, g, b):
    for ar, ag, ab in RED_ACCENT_COLORS:
        if abs(r - ar) <= 3 and abs(g - ag) <= 3 and abs(b - ab) <= 3:
            return True
    return False

# Brown on body (shoes/belt)
BROWN_BODY_COLORS = {
    (117, 61, 58), (117, 60, 57),
}

def is_brown_body(r, g, b):
    for br, bg, bb in BROWN_BODY_COLORS:
        if abs(r - br) <= 3 and abs(g - bg) <= 3 and abs(b - bb) <= 3:
            return True
    return False

# ---------------------------------------------------------------------------
# Hair color palettes — defined as target HSV
# ---------------------------------------------------------------------------
HAIR_PALETTES = {
    # name: (target_hue_deg, target_sat, val_mult)
    "default": None,                # no change — use original hair color
    "blonde":  (42, 0.65, 1.25),    # warm yellow, brighter
    "black":   (270, 0.15, 0.45),   # near-black with subtle cool tint
    "ginger":  (18, 0.80, 1.0),     # copper/orange
    "white":   (220, 0.08, 1.4),    # silver-white
}

# ---------------------------------------------------------------------------
# Clothing color palettes
# ---------------------------------------------------------------------------
CLOTHING_PALETTES = {
    "blue":   None,                   # default
    "green":  (140, 0.45, 1.0),       # forest green
    "red":    (0, 0.60, 0.95),        # warm red
    "purple": (275, 0.45, 0.90),      # royal purple
}

# ---------------------------------------------------------------------------
# HSV color manipulation
# ---------------------------------------------------------------------------
def rgb_to_hsv(r, g, b):
    """Convert RGB (0-255) to HSV (0-360, 0-1, 0-1)."""
    h, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
    return h * 360, s, v

def hsv_to_rgb(h, s, v):
    """Convert HSV (0-360, 0-1, 0-1) to RGB (0-255)."""
    h = (h % 360) / 360.0
    s = max(0, min(1, s))
    v = max(0, min(1, v))
    r, g, b = colorsys.hsv_to_rgb(h, s, v)
    return int(round(r * 255)), int(round(g * 255)), int(round(b * 255))

def shift_color(r, g, b, hue_shift=0, sat_mult=1.0, val_mult=1.0):
    """Shift a color's HSV components."""
    h, s, v = rgb_to_hsv(r, g, b)
    h = (h + hue_shift) % 360
    s = max(0, min(1, s * sat_mult))
    v = max(0, min(1, v * val_mult))
    return hsv_to_rgb(h, s, v)

def retarget_color(r, g, b, target_hue, target_sat, val_mult):
    """Replace a color's hue and saturation, scale value."""
    _, _, v = rgb_to_hsv(r, g, b)
    v = max(0, min(1, v * val_mult))
    return hsv_to_rgb(target_hue, target_sat, v)

# ---------------------------------------------------------------------------
# Palette swap functions (operate on numpy arrays for speed)
# ---------------------------------------------------------------------------
def swap_base_palette(img, skin_key, clothing_key):
    """Apply skin tone and clothing palette swap to a base body image."""
    skin_params = SKIN_PALETTES[skin_key]
    clothing_params = CLOTHING_PALETTES[clothing_key]

    if skin_params == (0, 1.0, 1.0) and clothing_params is None:
        return img  # no change needed

    arr = np.array(img)
    h, w, _ = arr.shape

    for y in range(h):
        for x in range(w):
            r, g, b, a = int(arr[y, x, 0]), int(arr[y, x, 1]), int(arr[y, x, 2]), int(arr[y, x, 3])
            if a == 0 or is_outline(r, g, b):
                continue

            if is_skin_color(r, g, b):
                hue_shift, sat_mult, val_mult = skin_params
                nr, ng, nb = shift_color(r, g, b, hue_shift, sat_mult, val_mult)
                arr[y, x] = [nr, ng, nb, a]
            elif is_clothing_color(r, g, b) and clothing_params is not None:
                target_hue, target_sat, val_mult = clothing_params
                nr, ng, nb = retarget_color(r, g, b, target_hue, target_sat, val_mult)
                arr[y, x] = [nr, ng, nb, a]

    return Image.fromarray(arr, "RGBA")

def swap_hair_palette(img, hair_key):
    """Apply hair color palette swap to a hair layer image."""
    params = HAIR_PALETTES[hair_key]
    if params is None:
        return img  # no change

    target_hue, target_sat, val_mult = params
    arr = np.array(img)
    h, w, _ = arr.shape

    for y in range(h):
        for x in range(w):
            r, g, b, a = int(arr[y, x, 0]), int(arr[y, x, 1]), int(arr[y, x, 2]), int(arr[y, x, 3])
            if a == 0 or is_outline(r, g, b):
                continue
            nr, ng, nb = retarget_color(r, g, b, target_hue, target_sat, val_mult)
            arr[y, x] = [nr, ng, nb, a]

    return Image.fromarray(arr, "RGBA")

# ---------------------------------------------------------------------------
# Character definitions
# ---------------------------------------------------------------------------
HAIR_STYLES = ["bowlhair", "curlyhair", "longhair", "mophair", "shorthair", "spikeyhair"]

# Which combinations to generate:
# (hair_style, skin_tone, hair_color, clothing_color) -> sprite_id
# We generate a practical subset, not all 6*3*5*4=360 combos
HUMAN_VARIANTS = []

for hair in HAIR_STYLES:
    for skin in SKIN_PALETTES:
        for hair_color in HAIR_PALETTES:
            # Only use default (blue) clothing to keep count manageable
            sprite_id = f"human_{hair}_{skin}_{hair_color}"
            HUMAN_VARIANTS.append((sprite_id, hair, skin, hair_color, "blue"))

# Flat characters (no palette swap)
FLAT_CHARS = {
    "goblin": {
        "walk": os.path.join(SUNNYSIDE, "Goblin", "PNG", "spr_walk_strip8.png"),
        "idle": os.path.join(SUNNYSIDE, "Goblin", "PNG", "spr_idle_strip9.png"),
    },
    "skeleton": {
        "walk": os.path.join(SUNNYSIDE, "Skeleton", "PNG", "skeleton_walk_strip8.png"),
        "idle": os.path.join(SUNNYSIDE, "Skeleton", "PNG", "skeleton_idle_strip6.png"),
    },
}


def clean_old_assets():
    """Remove old sprite assets."""
    for f in glob.glob(os.path.join(SPRITES_DIR, "*_walk.png")):
        os.remove(f)
    for f in glob.glob(os.path.join(SPRITES_DIR, "*_idle.png")):
        os.remove(f)
    for f in glob.glob(os.path.join(ATLAS_DIR, "*_walk_*.png")):
        os.remove(f)
    for f in glob.glob(os.path.join(ATLAS_DIR, "*_idle_*.png")):
        os.remove(f)
    print("  Cleaned old assets.")


def composite_human(hair_name, skin_key, hair_color_key, clothing_key):
    """Composite base + hair with palette swaps applied (walk)."""
    base_path = os.path.join(SUNNYSIDE, "Human", "WALKING", "base_walk_strip8.png")
    hair_path = os.path.join(SUNNYSIDE, "Human", "WALKING", f"{hair_name}_walk_strip8.png")

    base = Image.open(base_path).convert("RGBA")
    hair = Image.open(hair_path).convert("RGBA")

    base = swap_base_palette(base, skin_key, clothing_key)
    hair = swap_hair_palette(hair, hair_color_key)

    return Image.alpha_composite(base, hair)


def composite_human_idle(hair_name, skin_key, hair_color_key, clothing_key):
    """Composite base + hair with palette swaps applied (idle)."""
    base_path = os.path.join(SUNNYSIDE, "Human", "IDLE", "base_idle_strip9.png")
    hair_path = os.path.join(SUNNYSIDE, "Human", "IDLE", f"{hair_name}_idle_strip9.png")

    base = Image.open(base_path).convert("RGBA")
    hair = Image.open(hair_path).convert("RGBA")

    base = swap_base_palette(base, skin_key, clothing_key)
    hair = swap_hair_palette(hair, hair_color_key)

    return Image.alpha_composite(base, hair)


def write_outputs(sprite_id, strip, anim_type="walk"):
    """Write strip PNG and individual atlas frames."""
    strip_path = os.path.join(SPRITES_DIR, f"{sprite_id}_{anim_type}.png")
    strip.save(strip_path, "PNG")

    num_frames = strip.width // FRAME_W
    for i in range(num_frames):
        left = i * FRAME_W
        frame = strip.crop((left, 0, left + FRAME_W, FRAME_H))
        frame_path = os.path.join(ATLAS_DIR, f"{sprite_id}_{anim_type}_east_{i}.png")
        frame.save(frame_path, "PNG")


def main():
    os.makedirs(SPRITES_DIR, exist_ok=True)
    os.makedirs(ATLAS_DIR, exist_ok=True)

    print("Cleaning old assets...")
    clean_old_assets()

    total = len(HUMAN_VARIANTS) + len(FLAT_CHARS)
    print(f"\nGenerating {total} character variants (walk + idle)...")
    print(f"  {len(HUMAN_VARIANTS)} human (6 hair x 3 skin x 5 hair color)")
    print(f"  {len(FLAT_CHARS)} non-human\n")

    count = 0
    for sprite_id, hair, skin, hair_color, clothing in HUMAN_VARIANTS:
        walk_strip = composite_human(hair, skin, hair_color, clothing)
        write_outputs(sprite_id, walk_strip, "walk")
        idle_strip = composite_human_idle(hair, skin, hair_color, clothing)
        write_outputs(sprite_id, idle_strip, "idle")
        count += 1
        if count % 10 == 0:
            print(f"  {count}/{len(HUMAN_VARIANTS)} human variants...")

    for sprite_id, paths in FLAT_CHARS.items():
        walk_strip = Image.open(paths["walk"]).convert("RGBA")
        write_outputs(sprite_id, walk_strip, "walk")
        idle_strip = Image.open(paths["idle"]).convert("RGBA")
        write_outputs(sprite_id, idle_strip, "idle")

    print(f"\nDone. {total} characters, walk + idle sprites generated.")


if __name__ == "__main__":
    main()
