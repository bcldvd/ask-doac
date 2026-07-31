# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow"]
# ///
"""App icon: the ON AIR lamp. Warm studio black, tungsten glow from above,
a signal-red recording dot with bloom, a thin brass ring — the record button
of a late-night studio. Regenerate:  uv run ios/scripts/gen-icon.py
"""

import pathlib

from PIL import Image, ImageDraw, ImageFilter

S = 1024
OUT = pathlib.Path(__file__).resolve().parents[1] / (
    "AskDiary/Resources/Assets.xcassets/AppIcon.appiconset/icon-1024.png"
)

STUDIO = (13, 11, 9)
TUNGSTEN = (41, 23, 13)
RED = (228, 55, 46)
BRASS = (156, 142, 122)

img = Image.new("RGB", (S, S), STUDIO)

# tungsten wash from the top, like a lamp above the door — subtle
glow = Image.new("L", (S, S), 0)
d = ImageDraw.Draw(glow)
d.ellipse((-S * 0.35, -S * 0.95, S * 1.35, S * 0.35), fill=90)
glow = glow.filter(ImageFilter.GaussianBlur(200))
img.paste(Image.new("RGB", (S, S), TUNGSTEN), (0, 0), glow)

cx, cy = S / 2, S / 2
dot_r = S * 0.155

# red bloom behind the dot — tight, so the room stays dark
bloom = Image.new("L", (S, S), 0)
d = ImageDraw.Draw(bloom)
d.ellipse((cx - dot_r * 1.7, cy - dot_r * 1.7, cx + dot_r * 1.7, cy + dot_r * 1.7), fill=70)
bloom = bloom.filter(ImageFilter.GaussianBlur(60))
img.paste(Image.new("RGB", (S, S), RED), (0, 0), bloom)

draw = ImageDraw.Draw(img)

# brass ring, thin, slightly larger than the dot — the bezel of the lamp
ring_r = dot_r * 1.62
for width, alpha in ((9, 255),):
    ring = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    rd = ImageDraw.Draw(ring)
    rd.ellipse(
        (cx - ring_r, cy - ring_r, cx + ring_r, cy + ring_r),
        outline=BRASS + (alpha,), width=width)
    img.paste(ring, (0, 0), ring)

# the dot itself, with a soft top highlight
draw.ellipse((cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r), fill=RED)
hi = Image.new("L", (S, S), 0)
d = ImageDraw.Draw(hi)
d.ellipse((cx - dot_r * 0.75, cy - dot_r * 0.95, cx + dot_r * 0.75, cy - dot_r * 0.1), fill=90)
hi = hi.filter(ImageFilter.GaussianBlur(30))
img.paste(Image.new("RGB", (S, S), (255, 200, 190)), (0, 0), hi)

OUT.parent.mkdir(parents=True, exist_ok=True)
img.save(OUT)
print(f"saved {OUT}")
