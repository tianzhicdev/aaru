#!/usr/bin/env python3
"""
build_dummy_map.py

Generates a 1024x1024 pixel dummy map (64 cells x 16px) with a simple
grass fill. Output overwrites sunset_beach_map.png.
"""

import os
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUTPUT = os.path.join(ROOT, "AARU", "Resources", "Environment", "sunset_beach_map.png")

MAP_SIZE = 800
CELL_SIZE = 16
GRASS_COLOR = (106, 168, 79, 255)  # pleasant green


def main():
    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)

    img = Image.new("RGBA", (MAP_SIZE, MAP_SIZE), GRASS_COLOR)

    # Add subtle grid lines for visual reference
    lighter = (118, 180, 90, 255)
    for i in range(0, MAP_SIZE, CELL_SIZE):
        for x in range(MAP_SIZE):
            img.putpixel((x, i), lighter)
        for y in range(MAP_SIZE):
            img.putpixel((i, y), lighter)

    img.save(OUTPUT, "PNG")
    print(f"Dummy map saved: {OUTPUT} ({MAP_SIZE}x{MAP_SIZE})")


if __name__ == "__main__":
    main()
