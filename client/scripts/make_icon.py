"""Draw the app icon (a speech bubble holding a voice waveform, in the DESIGN.md palette) to build/icon.png
and build/icon.ico. Other designs, for comparison: --variant bars | lens, with --out DIR.

    uv run --with pillow python scripts/make_icon.py
"""

import argparse
import math
from pathlib import Path

from PIL import Image, ImageDraw

S = 4  # supersampling
N = 1024 * S
BG, LIGHT, ACCENT, SOFT = "#315e4d", "#ecf1e9", "#315e4d", "#c9dda9"
BUILD = Path(__file__).resolve().parent.parent / "build"
HEIGHTS = (0.35, 0.7, 1.0, 0.6, 0.3)  # waveform bars, relative


def box(x0, y0, x1, y1):
    return [S * x0, S * y0, S * x1, S * y1]


def bars(d, cx, cy, height, width, gap, fill):
    x = cx - (len(HEIGHTS) * width + (len(HEIGHTS) - 1) * gap) / 2
    for h in HEIGHTS:
        half = height * h / 2
        d.rounded_rectangle(box(x, cy - half, x + width, cy + half), radius=width / 2 * S, fill=fill)
        x += width + gap


def bubble(d):
    d.rounded_rectangle(box(170, 220, 854, 720), radius=150 * S, fill=LIGHT)
    d.polygon([(S * 300, S * 690), (S * 300, S * 840), (S * 450, S * 700)], fill=LIGHT)  # tail
    bars(d, 512, 470, 300, 56, 44, ACCENT)


def lens(d):
    d.ellipse(box(150, 322, 530, 702), fill=LIGHT)
    d.ellipse(box(250, 422, 430, 602), fill=BG)
    d.ellipse(box(300, 472, 380, 552), fill=SOFT)
    bars(d, 720, 512, 380, 44, 30, SOFT)


def draw(variant: str) -> Image.Image:
    img = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, N - 1, N - 1], radius=230 * S, fill=BG)
    if variant == "bubble":
        bubble(d)
    elif variant == "bars":
        bars(d, 512, 512, 560, 92, 50, LIGHT)
    else:
        lens(d)
    return img.resize((1024, 1024), Image.LANCZOS)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--variant", default="bubble", choices=["bubble", "bars", "lens"])
    ap.add_argument("--out", type=Path, default=BUILD)
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    icon = draw(args.variant)
    icon.save(args.out / "icon.png")
    icon.save(args.out / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print("wrote", args.out / "icon.png")
