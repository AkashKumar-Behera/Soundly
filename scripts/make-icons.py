"""Renders the Soundly app icon (public/favicon.svg geometry) to the PNG sizes a PWA needs.

Run from the project root:  python scripts/make-icons.py
Needs Pillow. Drawn at 4x and downsampled for clean edges.
"""

from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / 'public' / 'icons'
BG = (22, 22, 24, 255)
GREEN = (30, 215, 96, 255)
# (x, y1, y2) on the 100x100 design grid, identical to the SVG icon
BARS = [(22, 42, 58), (36, 30, 70), (50, 22, 78), (64, 34, 66), (78, 43, 57)]


def render(size: int, *, rounded: bool, content_scale: float = 1.0) -> Image.Image:
    """`rounded`: transparent rounded-square tile (any purpose). Otherwise a full-bleed square for the OS to mask."""
    s = size * 4
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.24), fill=BG)
    else:
        d.rectangle([0, 0, s, s], fill=BG)

    unit = s / 100
    cx = cy = s / 2
    width = 10 * unit * content_scale
    for x, y1, y2 in BARS:
        px = cx + (x - 50) * unit * content_scale
        top = cy + (y1 - 50) * unit * content_scale
        bottom = cy + (y2 - 50) * unit * content_scale
        d.rounded_rectangle([px - width / 2, top - width / 2, px + width / 2, bottom + width / 2], radius=width / 2, fill=GREEN)
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    render(192, rounded=True).save(OUT / 'icon-192.png', optimize=True)
    render(512, rounded=True).save(OUT / 'icon-512.png', optimize=True)
    # Maskable: full bleed, artwork kept inside the central 80% safe zone so any mask shape keeps it intact.
    render(512, rounded=False, content_scale=0.9).save(OUT / 'maskable-512.png', optimize=True)
    # iOS draws its own rounded corners, so it wants an opaque full-bleed square.
    render(180, rounded=False).save(OUT / 'apple-touch-icon.png', optimize=True)
    print('icons written to', OUT)


if __name__ == '__main__':
    main()
