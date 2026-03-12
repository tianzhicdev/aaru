#!/usr/bin/env python3
"""Render the sands.tmx Tiled map to a PNG for use as the AARU world background."""

import csv
import io
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image

# ── Paths ──
PROJECT = Path(__file__).resolve().parent.parent
TMX_PATH = Path.home() / "Downloads" / "sands.tmx"
TILESET_PATH = PROJECT / "AARU" / "Resources" / "Sunnyside" / "Tilesets" / "spr_tileset_sunnysideworld_16px.png"
SAND_PATH = Path.home() / "Downloads" / "sand.png"
OUTPUT_PATH = PROJECT / "AARU" / "Resources" / "Environment" / "sunset_beach_map.png"

TILE_W = 16
TILE_H = 16


def load_tileset(path: Path, columns: int) -> dict[int, Image.Image]:
    """Load a tileset PNG and return a dict of local_id -> tile image."""
    img = Image.open(path).convert("RGBA")
    tiles = {}
    cols = columns
    rows = img.height // TILE_H
    for r in range(rows):
        for c in range(cols):
            local_id = r * cols + c
            tile = img.crop((c * TILE_W, r * TILE_H, (c + 1) * TILE_W, (r + 1) * TILE_H))
            tiles[local_id] = tile
    return tiles


def parse_tmx(tmx_path: Path):
    """Parse TMX and return (map_w, map_h, tilesets, layers)."""
    tree = ET.parse(tmx_path)
    root = tree.getroot()
    map_w = int(root.attrib["width"])
    map_h = int(root.attrib["height"])

    tilesets = []
    for ts in root.findall("tileset"):
        firstgid = int(ts.attrib["firstgid"])
        source = ts.attrib.get("source", "")
        tilesets.append((firstgid, source))

    layers = []
    for layer in root.findall("layer"):
        name = layer.attrib["name"]
        data_el = layer.find("data")
        encoding = data_el.attrib.get("encoding", "")
        if encoding == "csv":
            text = data_el.text.strip()
            reader = csv.reader(io.StringIO(text))
            tile_ids = []
            for row in reader:
                tile_ids.extend(int(v.strip()) for v in row if v.strip())
            layers.append((name, tile_ids))

    return map_w, map_h, tilesets, layers


def main():
    print(f"Parsing {TMX_PATH}...")
    map_w, map_h, tilesets, layers = parse_tmx(TMX_PATH)
    print(f"Map: {map_w}x{map_h} tiles, {len(layers)} layers, {len(tilesets)} tilesets")

    # Load tilesets: build global_id -> tile_image mapping
    # Tileset 1: sunnyside (firstgid=1, 64 columns)
    # Tileset 2: sand (firstgid=4097)
    print(f"Loading tileset: {TILESET_PATH.name}...")
    sunnyside_tiles = load_tileset(TILESET_PATH, columns=64)
    print(f"  Loaded {len(sunnyside_tiles)} tiles")

    print(f"Loading tileset: {SAND_PATH.name}...")
    sand_tiles = load_tileset(SAND_PATH, columns=SAND_PATH and 288 // TILE_W)
    print(f"  Loaded {len(sand_tiles)} tiles")

    # Build global tile lookup
    global_tiles: dict[int, Image.Image] = {}
    for firstgid, source in tilesets:
        if "sunnysideworld" in source.lower():
            for local_id, tile in sunnyside_tiles.items():
                global_tiles[firstgid + local_id] = tile
        elif "sand" in source.lower():
            for local_id, tile in sand_tiles.items():
                global_tiles[firstgid + local_id] = tile

    # Render layers bottom-to-top
    canvas = Image.new("RGBA", (map_w * TILE_W, map_h * TILE_H), (0, 0, 0, 0))

    for layer_name, tile_ids in layers:
        print(f"Rendering layer: {layer_name} ({len(tile_ids)} tiles)")
        for idx, gid in enumerate(tile_ids):
            if gid == 0:
                continue
            col = idx % map_w
            row = idx // map_w
            tile_img = global_tiles.get(gid)
            if tile_img is None:
                print(f"  WARNING: missing tile gid={gid} at ({col},{row})")
                continue
            canvas.paste(tile_img, (col * TILE_W, row * TILE_H), tile_img)

    # Save at native size (50x16 = 800x800) — matches 50x50 grid at 16px cells
    print(f"Native size: {canvas.size}")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUTPUT_PATH)
    print(f"Saved: {OUTPUT_PATH} ({canvas.size[0]}x{canvas.size[1]})")

    # Also extract blocker cells for obstacle_map.ts
    for layer_name, tile_ids in layers:
        if "blocker" in layer_name.lower():
            blocked = []
            for idx, gid in enumerate(tile_ids):
                if gid != 0:
                    col = idx % map_w
                    row = idx // map_w
                    blocked.append((col, row))
            print(f"Blocker layer: {len(blocked)} blocked cells")


if __name__ == "__main__":
    main()
