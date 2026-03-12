#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SPRITES_DIR = ROOT / "AARU" / "Resources" / "Sprites"
FRAME_W = 96
FRAME_H = 64
ROWS = 1
COLS = 8


def clamp(value: int) -> int:
    return max(0, min(255, value))


def average_skin_tone(frame: Image.Image) -> tuple[int, int, int, int]:
    samples: list[tuple[int, int, int, int]] = []
    width, height = frame.size
    for y in range(height):
        for x in range(width):
            pixel = frame.getpixel((x, y))
            if pixel[3] < 180:
                continue
            r, g, b, _ = pixel
            if r > 120 and g > 70 and b > 45 and r > g > b:
                samples.append(pixel)
    if not samples:
        return (232, 188, 156, 255)
    count = len(samples)
    return tuple(sum(px[i] for px in samples) // count for i in range(4))  # type: ignore[return-value]


def shade(color: tuple[int, int, int, int], dr: int, dg: int, db: int, a: int | None = None) -> tuple[int, int, int, int]:
    return (
        clamp(color[0] + dr),
        clamp(color[1] + dg),
        clamp(color[2] + db),
        color[3] if a is None else a,
    )


def draw_front_face(draw: ImageDraw.ImageDraw, skin: tuple[int, int, int, int]) -> None:
    highlight = shade(skin, 14, 10, 8)
    outline = shade(skin, -26, -18, -14)
    eye = (36, 24, 24, 255)
    mouth = (122, 66, 66, 220)

    draw.ellipse((22, 13, 42, 31), fill=skin, outline=outline)
    draw.ellipse((25, 15, 39, 25), fill=highlight)
    draw.ellipse((28, 19, 30, 21), fill=eye)
    draw.ellipse((34, 19, 36, 21), fill=eye)
    draw.line((29, 26, 35, 26), fill=mouth, width=1)


def draw_west_face(draw: ImageDraw.ImageDraw, skin: tuple[int, int, int, int]) -> None:
    highlight = shade(skin, 12, 8, 6)
    outline = shade(skin, -26, -18, -14)
    eye = (36, 24, 24, 255)

    draw.ellipse((24, 14, 38, 31), fill=skin, outline=outline)
    draw.ellipse((26, 15, 34, 24), fill=highlight)
    draw.ellipse((27, 20, 29, 22), fill=eye)
    draw.line((30, 25, 35, 24), fill=outline, width=1)


def draw_east_face(draw: ImageDraw.ImageDraw, skin: tuple[int, int, int, int]) -> None:
    highlight = shade(skin, 12, 8, 6)
    outline = shade(skin, -26, -18, -14)
    eye = (36, 24, 24, 255)

    draw.ellipse((26, 14, 40, 31), fill=skin, outline=outline)
    draw.ellipse((30, 15, 38, 24), fill=highlight)
    draw.ellipse((35, 20, 37, 22), fill=eye)
    draw.line((29, 24, 34, 25), fill=outline, width=1)


def regenerate_frame(frame: Image.Image, row: int) -> Image.Image:
    if row == 0:
        return frame

    skin = average_skin_tone(frame)
    underlay = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(underlay)

    if row == 1:
        draw_west_face(draw, skin)
    elif row == 2:
        draw_front_face(draw, skin)
    elif row == 3:
        draw_east_face(draw, skin)

    return Image.alpha_composite(underlay, frame)


def iter_sheets() -> Iterable[Path]:
    return sorted(SPRITES_DIR.glob("*_walk.png"))


def main() -> None:
    sheets = list(iter_sheets())
    for path in sheets:
        sheet = Image.open(path).convert("RGBA")
        rebuilt = Image.new("RGBA", sheet.size, (0, 0, 0, 0))
        for row in range(ROWS):
            for col in range(COLS):
                frame = sheet.crop((
                    col * FRAME_W,
                    row * FRAME_H,
                    (col + 1) * FRAME_W,
                    (row + 1) * FRAME_H,
                ))
                frame = regenerate_frame(frame, row)
                rebuilt.paste(frame, (col * FRAME_W, row * FRAME_H))
        rebuilt.save(path)
        print(f"regenerated {path.name}")


if __name__ == "__main__":
    main()
