#!/usr/bin/env python3
"""
Build a TMX tilemap + rendered PNG for AARU's Sunset Beach world (65x65).

Strategy: solid color base fills + LPC autotile edges at transitions + decor overlays.
~40% of cells are non-walkable (water + rocks + dense trees + tide pools).

Output:
  - sunset_beach.tmx (Tiled-compatible)
  - beach_tileset.png (merged tileset)
  - sunset_beach_map.png (pre-rendered 6240x6240 for SpriteKit)
  - ../src/domain/obstacle_map.ts (blocked cell set for server)
"""

import json, random, math, xml.etree.ElementTree as ET
from xml.dom import minidom
from PIL import Image, ImageDraw

random.seed(42)

TILE = 32
COLS = 65
ROWS = 65
SCALE = 3
CELL = TILE * SCALE  # 96

RES = "/Users/tianzhichen/projects/aaru/AARU/Resources"
TILESETS = f"{RES}/Tilesets"
OUT_DIR = f"{RES}/Environment"

# Load sources
grass_img = Image.open(f"{TILESETS}/ts_grass.png").convert("RGBA")
water_img = Image.open(f"{TILESETS}/ts_water.png").convert("RGBA")
watergrass_img = Image.open(f"{TILESETS}/ts_watergrass.png").convert("RGBA")
dirt_img = Image.open(f"{TILESETS}/ts_dirt.png").convert("RGBA")
sand_img = Image.open(f"{TILESETS}/ts_sand.png").convert("RGBA")
water2_img = Image.open(f"{TILESETS}/ts_wateranimate2.png").convert("RGBA")
beach_v2 = Image.open(f"{TILESETS}/ts_beach-desert-v2.png").convert("RGBA")
beach_v1 = Image.open(f"{TILESETS}/ts_beach-desert.png").convert("RGBA")

def crop32(img, col, row):
    return img.crop((col*32, row*32, (col+1)*32, (row+1)*32))

def make_noisy(base_color, noise=6):
    """Create a 32x32 tile with subtle per-pixel noise for organic texture."""
    img = Image.new("RGBA", (32, 32))
    draw = ImageDraw.Draw(img)
    for py in range(32):
        for px in range(32):
            n = random.randint(-noise, noise)
            c = tuple(max(0, min(255, base_color[i] + n)) for i in range(3)) + (255,)
            draw.point((px, py), fill=c)
    return img

# ============================================================
# Tile catalog
# ============================================================
tiles = {}
tile_id = 0

def add(name, img_tile):
    global tile_id
    tiles[name] = (tile_id, img_tile)
    tile_id += 1

# --- Solid fills with subtle noise ---
for i in range(4):
    add(f"grass_s{i}",  make_noisy((90 + i*8, 155 + i*5, 65 + i*4), 8))
for i in range(4):
    add(f"sand_s{i}",   make_noisy((220 + i*4, 196 + i*4, 146 + i*4), 6))
for i in range(2):
    add(f"wetsand_s{i}", make_noisy((185 + i*5, 168 + i*4, 126 + i*3), 5))
for i in range(3):
    add(f"shallow_s{i}", make_noisy((55 + i*10, 130 + i*10, 168 + i*7), 7))
for i in range(3):
    add(f"deep_s{i}",   make_noisy((25 + i*5, 68 + i*7, 118 + i*7), 6))
for i in range(2):
    add(f"boardwalk_s{i}", make_noisy((135 + i*15, 108 + i*12, 72 + i*10), 5))

# Obstacle tiles
for i in range(3):
    add(f"rock_s{i}",   make_noisy((115 + i*8, 105 + i*6, 90 + i*5), 10))
for i in range(2):
    add(f"denseforest_s{i}", make_noisy((55 + i*10, 110 + i*8, 40 + i*6), 10))
for i in range(2):
    add(f"tidepool_s{i}", make_noisy((75 + i*8, 145 + i*6, 165 + i*5), 8))

# --- LPC autotile edges (for transitions only) ---
add("grass_tl",  crop32(grass_img, 0, 2))
add("grass_t",   crop32(grass_img, 1, 2))
add("grass_tr",  crop32(grass_img, 2, 2))
add("grass_l",   crop32(grass_img, 0, 3))
add("grass_r",   crop32(grass_img, 2, 3))
add("grass_bl",  crop32(grass_img, 0, 4))
add("grass_b",   crop32(grass_img, 1, 4))
add("grass_br",  crop32(grass_img, 2, 4))

# Water-grass transitions
add("wg_tl",     crop32(watergrass_img, 0, 2))
add("wg_t",      crop32(watergrass_img, 1, 2))
add("wg_tr",     crop32(watergrass_img, 2, 2))
add("wg_l",      crop32(watergrass_img, 0, 3))
add("wg_r",      crop32(watergrass_img, 2, 3))
add("wg_bl",     crop32(watergrass_img, 0, 4))
add("wg_b",      crop32(watergrass_img, 1, 4))
add("wg_br",     crop32(watergrass_img, 2, 4))

# Water edges
add("water_tl",  crop32(water_img, 0, 2))
add("water_t",   crop32(water_img, 1, 2))
add("water_tr",  crop32(water_img, 2, 2))
add("water_l",   crop32(water_img, 0, 3))
add("water_r",   crop32(water_img, 2, 3))
add("water_bl",  crop32(water_img, 0, 4))
add("water_b",   crop32(water_img, 1, 4))
add("water_br",  crop32(water_img, 2, 4))

# Dirt edges
add("dirt_tl",   crop32(dirt_img, 0, 2))
add("dirt_t",    crop32(dirt_img, 1, 2))
add("dirt_tr",   crop32(dirt_img, 2, 2))
add("dirt_l",    crop32(dirt_img, 0, 3))
add("dirt_r",    crop32(dirt_img, 2, 3))
add("dirt_bl",   crop32(dirt_img, 0, 4))
add("dirt_b",    crop32(dirt_img, 1, 4))
add("dirt_br",   crop32(dirt_img, 2, 4))

# Shell decorations
shell_names = []
for sy in range(2):
    for sx in range(8):
        t = crop32(beach_v2, sx, sy)
        if t.getbbox():
            name = f"shell_{sx}_{sy}"
            add(name, t)
            shell_names.append(name)

print(f"Tile catalog: {tile_id} tiles")

# --- Build tileset PNG ---
TS_COLS = 16
ts_rows = (tile_id + TS_COLS - 1) // TS_COLS
tileset_img = Image.new("RGBA", (TS_COLS * 32, ts_rows * 32), (0, 0, 0, 0))
for name, (tid, img) in tiles.items():
    c, r = tid % TS_COLS, tid // TS_COLS
    tileset_img.paste(img, (c * 32, r * 32), img)

tileset_path = f"{OUT_DIR}/beach_tileset.png"
tileset_img.save(tileset_path, "PNG")
print(f"Tileset: {tileset_path} ({tileset_img.size})")

def gid(name):
    return tiles[name][0] + 1

# ============================================================
# Map data
# ============================================================

# Shoreline profile (65 entries, extended wave pattern)
offsets = [
    6,6,5,5,4,4,3,3,2,2,1,1,0,0,-1,-1,-2,-2,-2,-1,
    0,1,1,2,2,2,1,1,0,-1,-1,-2,-2,-1,0,1,2,3,3,4,
    4,5,5,5,6,6,6,7,7,7,6,6,5,5,4,3,3,2,2,1,
    1,0,0,-1,-1
]
base_shore = ROWS - 18  # row 47
shoreline = [max(10, min(ROWS - 4, base_shore + offsets[i])) for i in range(COLS)]

ground = [[0]*COLS for _ in range(ROWS)]
edges  = [[0]*COLS for _ in range(ROWS)]
decor  = [[0]*COLS for _ in range(ROWS)]
blocked = set()  # (col, row) pairs that are non-walkable

# Zone classification (proportionally scaled from 50x50)
def zone(col, row):
    shore = shoreline[col]
    if row >= shore + 3: return "deep"
    if row >= shore:     return "shallow"
    if row >= shore - 2: return "wetsand"
    if row < 8:
        if 10 <= col <= 54: return "boardwalk"
        return "grass"
    if row < 16:         return "grass"
    if row < 21:         return "transition"
    return "sand"

# ============================================================
# Generate obstacle placement (~40% total blocked)
# ============================================================
# Water is naturally blocked. Add land obstacles to reach ~40%.

# 1. Mark all water cells as blocked
for row in range(ROWS):
    for col in range(COLS):
        z = zone(col, row)
        if z in ("shallow", "deep", "wetsand"):
            blocked.add((col, row))

# 2. Dense forest clusters on grass edges (left and right sides)
forest_clusters = []
# Left forest strip
for col in range(0, 7):
    for row in range(0, 16):
        if zone(col, row) == "grass" and col < 4:
            blocked.add((col, row))
            forest_clusters.append((col, row))
# Right forest strip
for col in range(COLS - 7, COLS):
    for row in range(0, 16):
        if zone(col, row) == "grass" and col >= COLS - 4:
            blocked.add((col, row))
            forest_clusters.append((col, row))
# Scattered forest patches in grass
forest_patches = [
    (15, 3, 4, 3), (25, 5, 3, 4), (35, 2, 4, 3), (45, 4, 3, 3),
    (12, 10, 3, 3), (28, 8, 4, 3), (40, 11, 3, 3), (52, 9, 4, 3),
    (8, 13, 3, 2), (20, 12, 2, 3), (38, 13, 3, 2), (50, 12, 3, 3),
]
for px, py, pw, ph in forest_patches:
    for dx in range(pw):
        for dy in range(ph):
            c, r = px + dx, py + dy
            if 0 <= c < COLS and 0 <= r < ROWS and zone(c, r) in ("grass", "transition"):
                blocked.add((c, r))
                forest_clusters.append((c, r))

# 3. Rock clusters on sand
rock_positions = set()
rock_cluster_seeds = [
    (8, 25), (15, 30), (22, 28), (30, 32), (38, 26), (45, 30), (52, 28), (58, 25),
    (12, 35), (20, 38), (28, 34), (35, 40), (42, 36), (50, 38), (55, 34),
    (5, 32), (18, 42), (32, 22), (48, 24), (60, 32),
    (10, 40), (25, 36), (40, 42), (55, 40),
    (14, 22), (44, 22), (33, 28), (8, 38), (58, 38),
]
for seed_x, seed_y in rock_cluster_seeds:
    size = random.randint(2, 5)
    for _ in range(size):
        dx, dy = random.randint(-1, 1), random.randint(-1, 1)
        c, r = seed_x + dx, seed_y + dy
        if 0 <= c < COLS and 0 <= r < ROWS:
            z = zone(c, r)
            if z in ("sand", "transition"):
                blocked.add((c, r))
                rock_positions.add((c, r))

# 4. Tide pools (small water features on sand near shore)
tidepool_positions = set()
tidepool_seeds = [
    (10, 43), (20, 44), (35, 42), (50, 43), (60, 44),
    (15, 40), (30, 41), (45, 40), (55, 42),
    (8, 42), (25, 43), (40, 44), (57, 41),
]
for seed_x, seed_y in tidepool_seeds:
    for dx in range(-1, 2):
        for dy in range(-1, 2):
            if random.random() < 0.6:
                c, r = seed_x + dx, seed_y + dy
                if 0 <= c < COLS and 0 <= r < ROWS:
                    shore = shoreline[c]
                    if zone(c, r) == "sand" and r >= shore - 6:
                        blocked.add((c, r))
                        tidepool_positions.add((c, r))

total = COLS * ROWS
blocked_count = len(blocked)
pct = blocked_count / total * 100
print(f"Blocked cells: {blocked_count}/{total} ({pct:.1f}%)")

# If under 40%, add more scattered rocks
target = int(total * 0.40)
if blocked_count < target:
    extra_needed = target - blocked_count
    candidates = []
    for row in range(ROWS):
        for col in range(COLS):
            if (col, row) not in blocked and zone(col, row) in ("sand", "grass", "transition"):
                candidates.append((col, row))
    random.shuffle(candidates)
    for c, r in candidates[:extra_needed]:
        blocked.add((c, r))
        z = zone(c, r)
        if z == "grass" or z == "transition":
            forest_clusters.append((c, r))
        else:
            rock_positions.add((c, r))

blocked_count = len(blocked)
pct = blocked_count / total * 100
print(f"Final blocked: {blocked_count}/{total} ({pct:.1f}%)")

# ============================================================
# Fill ground layer
# ============================================================
for row in range(ROWS):
    for col in range(COLS):
        z = zone(col, row)
        i = (col * 7 + row * 13) % 4  # pseudo-random variant

        # Check if this is an obstacle cell on land
        is_obstacle = (col, row) in blocked and z not in ("shallow", "deep", "wetsand")

        if z == "deep":
            ground[row][col] = gid(f"deep_s{i % 3}")
        elif z == "shallow":
            ground[row][col] = gid(f"shallow_s{i % 3}")
        elif z == "wetsand":
            ground[row][col] = gid(f"wetsand_s{i % 2}")
        elif is_obstacle and (col, row) in tidepool_positions:
            ground[row][col] = gid(f"tidepool_s{i % 2}")
        elif is_obstacle and (col, row) in rock_positions:
            ground[row][col] = gid(f"rock_s{i % 3}")
        elif is_obstacle and (col, row) in forest_clusters:
            ground[row][col] = gid(f"denseforest_s{i % 2}")
        elif z == "grass":
            ground[row][col] = gid(f"grass_s{i}")
        elif z == "boardwalk":
            ground[row][col] = gid(f"boardwalk_s{i % 2}")
        elif z == "transition":
            blend = (row - 16) / 5.0
            if ((col + row) % 3) / 3.0 > blend:
                ground[row][col] = gid(f"grass_s{i}")
            else:
                ground[row][col] = gid(f"sand_s{i}")
        else:  # sand
            ground[row][col] = gid(f"sand_s{i}")

# Place edge tiles at zone boundaries
for row in range(ROWS):
    for col in range(COLS):
        z = zone(col, row)
        z_above = zone(col, row + 1) if row + 1 < ROWS else z
        z_below = zone(col, row - 1) if row - 1 >= 0 else z
        z_left  = zone(col - 1, row) if col - 1 >= 0 else z
        z_right = zone(col + 1, row) if col + 1 < COLS else z

        # Grass bottom edge -> sand
        if z == "grass" and z_above in ("sand", "transition", "wetsand"):
            edges[row][col] = gid("grass_b")
        elif z == "grass" and z_below in ("sand", "transition"):
            edges[row][col] = gid("grass_t")

        # Boardwalk edges
        if z == "boardwalk":
            if z_left == "grass":
                edges[row][col] = gid("dirt_l")
            elif z_right == "grass":
                edges[row][col] = gid("dirt_r")
            if row == 7:
                edges[row][col] = gid("dirt_b")
            elif row == 0:
                edges[row][col] = gid("dirt_t")

        # Water top edge
        if z == "shallow" and z_below in ("wetsand", "sand"):
            edges[row][col] = gid("water_t")
        elif z == "wetsand" and z_above == "shallow":
            edges[row][col] = gid("wg_b")

# Scatter shells on sand near shoreline
for row in range(ROWS):
    for col in range(COLS):
        if (col, row) in blocked:
            continue
        shore = shoreline[col]
        if zone(col, row) == "sand" and shore - 8 <= row < shore - 2:
            if random.random() < 0.025 and shell_names:
                decor[row][col] = gid(random.choice(shell_names))

# ============================================================
# Write TMX
# ============================================================

def layer_csv(data):
    lines = []
    for tmx_row in range(ROWS):
        world_row = ROWS - 1 - tmx_row
        lines.append(",".join(str(data[world_row][c]) for c in range(COLS)))
    return "\n".join(lines)

tmx = ET.Element("map", {
    "version": "1.10", "orientation": "orthogonal",
    "renderorder": "right-down",
    "width": str(COLS), "height": str(ROWS),
    "tilewidth": str(TILE), "tileheight": str(TILE),
})
ts = ET.SubElement(tmx, "tileset", {
    "firstgid": "1", "name": "beach_tileset",
    "tilewidth": str(TILE), "tileheight": str(TILE),
    "tilecount": str(tile_id), "columns": str(TS_COLS),
})
ET.SubElement(ts, "image", {
    "source": "beach_tileset.png",
    "width": str(TS_COLS * 32), "height": str(ts_rows * 32),
})

for lname, data in [("ground", ground), ("edges", edges), ("decor", decor)]:
    layer = ET.SubElement(tmx, "layer", {
        "id": str(["ground","edges","decor"].index(lname)+1),
        "name": lname, "width": str(COLS), "height": str(ROWS),
    })
    ld = ET.SubElement(layer, "data", {"encoding": "csv"})
    ld.text = "\n" + layer_csv(data) + "\n"

rough = ET.tostring(tmx, encoding="unicode")
tmx_str = minidom.parseString(rough).toprettyxml(indent="  ")
tmx_str = '<?xml version="1.0" encoding="UTF-8"?>\n' + "\n".join(tmx_str.split("\n")[1:])
with open(f"{OUT_DIR}/sunset_beach.tmx", "w") as f:
    f.write(tmx_str)
print(f"TMX saved")

# ============================================================
# Render PNG
# ============================================================

canvas = Image.new("RGBA", (COLS * CELL, ROWS * CELL), (30, 75, 125, 255))

tile_by_id = {}
for name, (tid, img) in tiles.items():
    tile_by_id[tid + 1] = img

def render_layer(data):
    for wr in range(ROWS):
        for c in range(COLS):
            g = data[wr][c]
            if g == 0:
                continue
            t = tile_by_id.get(g)
            if t is None:
                continue
            scaled = t.resize((CELL, CELL), Image.NEAREST)
            ix = c * CELL
            iy = (ROWS - 1 - wr) * CELL
            canvas.paste(scaled, (ix, iy), scaled)

render_layer(ground)
render_layer(edges)
render_layer(decor)

# --- Overlay: palm trees (on blocked cells in sand/grass) ---
palm_regions = [
    (32, 160, 96, 160), (128, 160, 96, 160), (224, 160, 96, 160),
    (320, 160, 112, 168), (432, 160, 112, 168),
]
palms = [beach_v1.crop((x, y, x+w, y+h)) for x, y, w, h in palm_regions]

palm_positions = [
    (6,35),(10,34),(14,36),(36,35),(41,34),(55,35),(60,34),
    (3,24),(8,26),(18,17),(25,16),(32,17),(43,25),(47,26),(58,25),
    (20,32),(30,31),(50,32),(15,28),(45,28),
    (7,18),(42,18),(15,13),(35,13),(55,13),
    (12,30),(22,33),(38,30),(52,33),
]
for cx, cy in palm_positions:
    if cx >= COLS or cy >= ROWS: continue
    p = random.choice(palms)
    pw, ph = int(p.width*SCALE*0.75), int(p.height*SCALE*0.75)
    ps = p.resize((pw, ph), Image.NEAREST)
    ix = cx*CELL - pw//2 + CELL//2
    iy = (ROWS-1-cy)*CELL - ph + CELL
    if 0 <= ix < canvas.width-pw and 0 <= iy < canvas.height-ph:
        canvas.paste(ps, (ix, iy), ps)

# --- Overlay: LPC trees at forest edges ---
try:
    trees_sheet = Image.open(f"{TILESETS}/ts_treetop.png").convert("RGBA")
    trunk_sheet = Image.open(f"{TILESETS}/ts_trunk.png").convert("RGBA")
except FileNotFoundError:
    trees_sheet = None
    trunk_sheet = None

if trees_sheet is None:
    try:
        trees_sheet = Image.open("/tmp/LPC/Terrain/trees_summer.png").convert("RGBA")
    except FileNotFoundError:
        pass

if trees_sheet is not None:
    lpc_trees = [
        trees_sheet.crop((128, 0, 256, 128)),
        trees_sheet.crop((256, 0, 384, 128)),
    ]
    if trees_sheet.height >= 256:
        lpc_trees.extend([
            trees_sheet.crop((128, 128, 256, 256)),
            trees_sheet.crop((256, 128, 384, 256)),
        ])

    tree_overlay_positions = [
        (0,1),(1,3),(2,0),(3,5),(5,2),(6,6),
        (59,1),(60,3),(62,0),(63,5),(64,2),(58,6),
        (0,9),(1,11),(63,9),(64,11),(2,10),(62,10),
        (0,14),(1,15),(63,14),(64,15),
    ]
    for cx, cy in tree_overlay_positions:
        if cx >= COLS or cy >= ROWS: continue
        tr = random.choice(lpc_trees)
        tw, th = int(tr.width*SCALE*0.85), int(tr.height*SCALE*0.85)
        ts_ = tr.resize((tw, th), Image.NEAREST)
        ix = cx*CELL - tw//2 + CELL//2
        iy = (ROWS-1-cy)*CELL - th + CELL
        if 0 <= ix < canvas.width-tw and 0 <= iy < canvas.height-th:
            canvas.paste(ts_, (ix, iy), ts_)

# Warm sunset wash
canvas = Image.alpha_composite(canvas, Image.new("RGBA", canvas.size, (240, 140, 65, 8)))

canvas.save(f"{OUT_DIR}/sunset_beach_map.png", "PNG", optimize=True)
print(f"Map saved: {COLS*CELL}x{ROWS*CELL}")

# ============================================================
# Export obstacle map for server
# ============================================================

blocked_list = sorted(f"{c}:{r}" for c, r in blocked)
ts_code = f'''// Auto-generated by scripts/build_tmx_map.py — do not edit manually
export const OBSTACLE_CELLS: ReadonlySet<string> = new Set([
{",".join(f'"{k}"' for k in blocked_list)}
]);
'''
obstacle_path = "/Users/tianzhichen/projects/aaru/src/domain/obstacle_map.ts"
with open(obstacle_path, "w") as f:
    f.write(ts_code)
print(f"Obstacle map: {obstacle_path} ({len(blocked_list)} cells)")
