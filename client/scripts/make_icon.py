"""Draw the app icon (lips with sound waves, in the DESIGN.md palette) to build/icon.png and build/icon.ico.

    uv run --with pillow python scripts/make_icon.py
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw

S = 4  # supersampling
N = 1024 * S
BG, LIP, WAVE = "#315e4d", "#ecf1e9", "#c9dda9"
OUT = Path(__file__).resolve().parent.parent / "build"


def bezier(p0, p1, p2, p3, n=60):
    return [tuple(S * ((1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c + t ** 3 * d)
                  for a, b, c, d in zip(p0, p1, p2, p3)) for t in (i / n for i in range(n + 1))]


def draw() -> Image.Image:
    img = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, N - 1, N - 1], radius=230 * S, fill=BG)

    left, right, cx, y = (150, 520), (630, 520), 390, 520
    upper = (bezier(left, (230, 470), (290, 405), (335, 405))
             + bezier((335, 405), (365, 405), (380, 440), (cx, 448))
             + bezier((cx, 448), (400, 440), (415, 405), (445, 405))
             + bezier((445, 405), (490, 405), (550, 470), right))
    seam = bezier(right, (520, 548), (260, 548), left)
    lower = bezier(left, (240, 650), (540, 650), right)
    d.polygon(upper + seam, fill=LIP)
    d.polygon(seam[::-1] + lower[::-1], fill=LIP)
    d.line(seam, fill=BG, width=16 * S, joint="curve")

    for r in (95, 175, 255):  # sound waves from the mouth's right corner
        box = [S * (640 - r), S * (y - r), S * (640 + r), S * (y + r)]
        d.arc(box, start=-38, end=38, fill=WAVE, width=38 * S)
        for a in (-38, 38):  # round caps, on the stroke's centre line (PIL draws the width inwards)
            px, py = S * (640 + (r - 19) * math.cos(math.radians(a))), S * (y + (r - 19) * math.sin(math.radians(a)))
            d.ellipse([px - 19 * S, py - 19 * S, px + 19 * S, py + 19 * S], fill=WAVE)
    return img.resize((1024, 1024), Image.LANCZOS)


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    icon = draw()
    icon.save(OUT / "icon.png")
    icon.save(OUT / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print("wrote", OUT / "icon.png", OUT / "icon.ico")
