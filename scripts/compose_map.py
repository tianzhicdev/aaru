#!/usr/bin/env python3
"""
Compose a pre-baked 50x50 tilemap for the AARU 'Sunset Beach' world.

Uses hand-tuned base colors + LPC terrain tiles for texture + decoration.
Output: 4800x4800 PNG background map.

Map layout (row 0 = bottom of SpriteKit scene = inland, row 49 = top = ocean):
  Rows 0-5:   Grass with trees (forest edge)
  Rows 6-8:   Boardwalk / path area
  Rows 9-14:  Grass-to-sand transition
  Rows 15-35: Sandy beach (main play area)
  Rows 36-37: Wet sand / shoreline
  Rows 38-49: Ocean water
"""

import random
from PIL import Image, ImageDraw, ImageFilter

random.seed(42)

COLS = 65
ROWS = 65
TILE = 32
SCALE = 3
CELL = TILE * SCALE  # 96
OUT_W = COLS * CELL   # 4800
OUT_H = ROWS * CELL   # 4800

# --- Load source sheets ---
terrain = Image.open("/tmp/LPC/Terrain/terrain_summer.png").convert("RGBA")
trees   = Image.open("/tmp/LPC/Terrain/trees_summer.png").convert("RGBA")
flowers = Image.open("/tmp/LPC/Terrain/flowers.png").convert("RGBA")
plants  = Image.open("/tmp/LPC/Terrain/plants_summer.png").convert("RGBA")
beach   = Image.open("/Users/tianzhichen/projects/aaru/AARU/Resources/Environment/beach-desert.png").convert("RGBA")

def scale_nn(img, s=SCALE):
    return img.resize((img.width * s, img.height * s), Image.NEAREST)

# --- Base colors ---
GRASS_COLORS = [
    (106, 163, 75),  # main grass
    (98, 155, 70),
    (112, 170, 80),
    (100, 158, 72),
]
SAND_COLORS = [
    (222, 198, 148),  # warm sand
    (228, 204, 154),
    (218, 192, 142),
    (225, 201, 151),
]
WET_SAND = (190, 172, 130)
SHALLOW_WATER = (65, 140, 175)
MID_WATER = (45, 105, 150)
DEEP_WATER = (30, 75, 125)
BOARDWALK = (140, 110, 75)
BOARDWALK_LIGHT = (155, 125, 88)

# --- Extract LPC grass texture tiles for overlay ---
# terrain_summer.png center grass tiles (cols 1-2, rows 1-2 of the grass autotile)
grass_textures = [
    terrain.crop((32, 32, 64, 64)),
    terrain.crop((64, 32, 96, 64)),
    terrain.crop((32, 64, 64, 96)),
    terrain.crop((64, 64, 96, 96)),
]

# --- Extract decor ---
# Palm trees from beach-desert.png
palm_trees = [
    beach.crop((32, 160, 128, 320)),
    beach.crop((128, 160, 224, 320)),
    beach.crop((224, 160, 320, 320)),
    beach.crop((320, 160, 432, 328)),
    beach.crop((432, 160, 544, 328)),
]

# LPC trees (multi-tile sprites)
lpc_trees = [
    trees.crop((128, 0, 256, 128)),
    trees.crop((256, 0, 384, 128)),
    trees.crop((128, 128, 256, 256)),
    trees.crop((256, 128, 384, 256)),
]

# Flowers
flower_sprites = []
for col in range(11):
    for row in range(3):
        f = flowers.crop((col * 32, row * 32, (col + 1) * 32, (row + 1) * 32))
        if f.getbbox():
            flower_sprites.append(f)

# Plant clusters
plant_sprites = []
for col in range(16):
    p = plants.crop((col * 32, 0, (col + 1) * 32, 32))
    if p.getbbox():
        plant_sprites.append(p)

# Shells from beach-desert top
shell_sprites = []
for sx in range(0, 256, 32):
    for sy in range(0, 64, 32):
        s = beach.crop((sx, sy, sx + 32, sy + 32))
        if s.getbbox() and s.getbbox()[2] - s.getbbox()[0] > 8:
            shell_sprites.append(s)

# --- Shoreline profile (matching Swift code) ---
offsets = [6,6,5,5,4,4,3,3,2,2,1,1,0,0,-1,-1,-2,-2,-2,-1,0,1,1,2,2,2,1,1,0,-1,-1,-2,-2,-1,0,1,2,3,3,4,4,5,5,5,6,6,6,7,7,7]
base_shoreline = ROWS - 14
shoreline = [max(8, min(ROWS - 4, base_shoreline + offsets[i])) for i in range(COLS)]

# --- Compose ---
canvas = Image.new("RGBA", (OUT_W, OUT_H), (0, 0, 0, 255))
draw = ImageDraw.Draw(canvas)

def cell_rect(col, row):
    """Return pixel rect for a cell (image coords, y=0 at top)."""
    x = col * CELL
    y = (ROWS - 1 - row) * CELL
    return (x, y, x + CELL, y + CELL)

# Phase 1: Fill base terrain colors
for row in range(ROWS):
    for col in range(COLS):
        shore = shoreline[col]
        x, y, x2, y2 = cell_rect(col, row)

        # Determine base color
        if row >= shore + 5:
            color = DEEP_WATER
        elif row >= shore + 2:
            color = MID_WATER
        elif row >= shore:
            color = SHALLOW_WATER
        elif row >= shore - 2:
            color = WET_SAND
        elif row < 6:
            if 8 <= col <= 41:
                color = BOARDWALK if (col + row) % 2 == 0 else BOARDWALK_LIGHT
            elif col <= 4 or col >= COLS - 5:
                color = GRASS_COLORS[(col + row) % len(GRASS_COLORS)]
            else:
                color = GRASS_COLORS[(col + row) % len(GRASS_COLORS)]
        elif row < 12:
            color = GRASS_COLORS[(col + row) % len(GRASS_COLORS)]
        elif row < 16:
            # Transition zone
            blend = (row - 12) / 4.0
            gc = GRASS_COLORS[(col + row) % len(GRASS_COLORS)]
            sc = SAND_COLORS[(col + row) % len(SAND_COLORS)]
            color = tuple(int(gc[i] * (1 - blend) + sc[i] * blend) for i in range(3))
        else:
            color = SAND_COLORS[(col + row) % len(SAND_COLORS)]

        # Add subtle per-cell noise
        noise = random.randint(-5, 5)
        color = tuple(max(0, min(255, c + noise)) for c in color)
        draw.rectangle([x, y, x2, y2], fill=color + (255,))

# Phase 2: Overlay grass texture on grass cells
for row in range(ROWS):
    for col in range(COLS):
        shore = shoreline[col]
        if row >= shore - 2:
            continue  # skip water/shoreline
        if row >= 16:
            continue  # skip pure sand

        x = col * CELL
        y = (ROWS - 1 - row) * CELL

        # Pick a grass texture tile and blend it over
        tex = random.choice(grass_textures)
        tex_scaled = scale_nn(tex)
        # Apply at reduced opacity for subtle texture
        if row < 12:
            alpha = 80  # grass area
        else:
            alpha = max(0, 80 - (row - 12) * 20)  # fade in transition

        if alpha > 0:
            tex_rgba = tex_scaled.copy()
            r, g, b, a = tex_rgba.split()
            a = a.point(lambda p: min(p, alpha))
            tex_rgba = Image.merge("RGBA", (r, g, b, a))
            canvas.paste(tex_rgba, (x, y), tex_rgba)

# Phase 3: Add water ripple texture
for row in range(ROWS):
    for col in range(COLS):
        shore = shoreline[col]
        if row < shore:
            continue
        x = col * CELL
        y = (ROWS - 1 - row) * CELL

        # Add subtle wave lines
        wave_y = y + CELL // 3 + ((col * 7 + row * 13) % 20)
        wave_alpha = 30 + ((col + row) % 3) * 10
        draw2 = ImageDraw.Draw(canvas)
        for wy in range(0, CELL, 18):
            offset = (col * 5 + row * 3) % 12
            draw2.line(
                [(x + offset, y + wy), (x + CELL - offset, y + wy + 4)],
                fill=(180, 220, 240, wave_alpha), width=1
            )

# Phase 4: Boardwalk plank lines
for row in range(6):
    for col in range(8, 42):
        x = col * CELL
        y = (ROWS - 1 - row) * CELL
        d = ImageDraw.Draw(canvas)
        # Horizontal plank lines
        for py in range(0, CELL, 12):
            line_shade = random.randint(-15, 15)
            lc = tuple(max(0, min(255, BOARDWALK[i] - 20 + line_shade)) for i in range(3))
            d.line([(x, y + py), (x + CELL, y + py)], fill=lc + (120,), width=1)
        # Vertical plank gaps every ~3 cells
        if col % 3 == 0:
            d.line([(x, y), (x, y + CELL)], fill=(90, 70, 45, 60), width=1)

# Phase 5: Add decorations

def paste_decor(img, px, py):
    if 0 <= px < OUT_W - img.width and 0 <= py < OUT_H - img.height:
        canvas.paste(img, (px, py), img)

# Palm trees scattered in the beach-grass transition
palm_positions = [
    (6, 28), (10, 27), (14, 29), (36, 28), (41, 27),
    (3, 18), (8, 20), (18, 13), (25, 12), (32, 13),
    (43, 19), (47, 20), (20, 25), (30, 24),
    (7, 14), (42, 14), (15, 10), (35, 10),
]
for cx, cy in palm_positions:
    if cx >= COLS or cy >= ROWS:
        continue
    palm = random.choice(palm_trees)
    pw = int(palm.width * SCALE * 0.75)
    ph = int(palm.height * SCALE * 0.75)
    palm_scaled = palm.resize((pw, ph), Image.NEAREST)
    img_x = cx * CELL - pw // 2 + CELL // 2
    img_y = (ROWS - 1 - cy) * CELL - ph + CELL
    paste_decor(palm_scaled, img_x, img_y)

# LPC trees in forest edges
tree_positions = [
    (0, 1), (1, 3), (2, 0), (3, 4), (5, 2), (6, 5),
    (44, 1), (45, 3), (47, 0), (48, 4), (49, 2), (43, 5),
    (0, 7), (1, 9), (48, 7), (49, 9),
    (2, 8), (47, 8),
]
for cx, cy in tree_positions:
    if cx >= COLS or cy >= ROWS:
        continue
    tree = random.choice(lpc_trees)
    tw_px = int(tree.width * SCALE * 0.85)
    th_px = int(tree.height * SCALE * 0.85)
    tree_scaled = tree.resize((tw_px, th_px), Image.NEAREST)
    img_x = cx * CELL - tw_px // 2 + CELL // 2
    img_y = (ROWS - 1 - cy) * CELL - th_px + CELL
    paste_decor(tree_scaled, img_x, img_y)

# Flowers in grass zone
for _ in range(50):
    col = random.randint(5, COLS - 6)
    row = random.randint(5, 14)
    if col <= 4 or col >= COLS - 5:
        continue
    fl = random.choice(flower_sprites)
    fl_scaled = scale_nn(fl, 2)
    img_x = col * CELL + random.randint(0, CELL // 2)
    img_y = (ROWS - 1 - row) * CELL + random.randint(0, CELL // 2)
    paste_decor(fl_scaled, img_x, img_y)

# Plants along grass edges
for _ in range(30):
    col = random.randint(3, COLS - 4)
    row = random.randint(8, 15)
    if plant_sprites:
        pl = random.choice(plant_sprites)
        pl_scaled = scale_nn(pl, 2)
        img_x = col * CELL + random.randint(0, CELL // 3)
        img_y = (ROWS - 1 - row) * CELL + random.randint(0, CELL // 3)
        paste_decor(pl_scaled, img_x, img_y)

# Shells on the beach near shoreline
if shell_sprites:
    for _ in range(30):
        col = random.randint(4, COLS - 5)
        row_shore = shoreline[col]
        row = random.randint(max(16, row_shore - 8), row_shore - 1)
        sh = random.choice(shell_sprites)
        sh_scaled = scale_nn(sh, 2)
        img_x = col * CELL + random.randint(0, CELL // 2)
        img_y = (ROWS - 1 - row) * CELL + random.randint(0, CELL // 2)
        paste_decor(sh_scaled, img_x, img_y)

# Phase 6: Warm sunset wash
sunset = Image.new("RGBA", (OUT_W, OUT_H), (240, 140, 65, 10))
canvas = Image.alpha_composite(canvas, sunset)

# --- Save ---
out_path = "/Users/tianzhichen/projects/aaru/AARU/Resources/Environment/sunset_beach_map.png"
canvas.save(out_path, "PNG", optimize=True)
print(f"Saved {out_path} ({canvas.size[0]}x{canvas.size[1]})")
