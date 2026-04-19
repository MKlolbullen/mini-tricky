#!/usr/bin/env python3
"""Generate platform icon assets for electron-builder.

This script rasterises ``build/icon.svg`` into a family of PNGs plus a
Windows ``.ico``. It is committed so a contributor can regenerate assets
locally after tweaking the SVG with::

    python3 build/generate_icons.py

Pillow has no SVG parser, so the drawing is hand-coded to match the shapes
in ``icon.svg``. Keep the two in sync when editing.

Outputs (all under ``build/``):
* ``icon.png``        — 1024x1024 master, consumed by electron-builder as
                        the source icon for all platforms
* ``icon-512.png``    — 512x512 (mac ``icns`` auto-converter wants >=512)
* ``icon-256.png``    — 256x256
* ``icon-128.png``    — 128x128
* ``icon-64.png``     — 64x64
* ``icon-32.png``     — 32x32
* ``icon-16.png``     — 16x16
* ``icon.ico``        — Windows multi-resolution ICO (16/32/48/64/128/256)
* ``tray-icon.png``   — 32x32 (consumed by ``electron/main.cjs``)
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


BUILD_DIR = Path(__file__).resolve().parent
MASTER_SIZE = 1024  # Work at 2x the electron-builder expected size so
# downsampled variants stay sharp.


# ── Colours (match build/icon.svg) ────────────────────────────────────────────
BG_TOP = (15, 28, 51, 255)        # #0f1c33
BG_BOTTOM = (6, 13, 24, 255)      # #060d18
NODE_TOP = (18, 36, 63, 255)      # #12243f
NODE_BOTTOM = (10, 22, 39, 255)   # #0a1627
CYAN = (91, 220, 255, 255)        # #5bdcff
CYAN_SOFT = (91, 220, 255, 140)
CYAN_FAINT = (91, 220, 255, 46)
CYAN_BRIGHT = (127, 232, 255, 255)
TEXT = (214, 226, 255, 255)       # #d6e2ff


def _vgrad(size: tuple[int, int], top: tuple[int, int, int, int], bot: tuple[int, int, int, int]) -> Image.Image:
    """Return an RGBA image with a vertical gradient from ``top`` to ``bot``."""
    w, h = size
    out = Image.new('RGBA', size)
    pixels = out.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        pixels[0, y] = (
            int(top[0] + (bot[0] - top[0]) * t),
            int(top[1] + (bot[1] - top[1]) * t),
            int(top[2] + (bot[2] - top[2]) * t),
            255,
        )
    # Broadcast the first column across the width — faster than pixel-by-pixel.
    column = out.crop((0, 0, 1, h))
    return column.resize(size)


def _rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new('L', size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    return mask


def _node_card(w: int, h: int, radius: int, stroke: tuple[int, int, int, int], stroke_w: int) -> Image.Image:
    """Return a card with vertical gradient fill, coloured top bar, and border."""
    img = _vgrad((w, h), NODE_TOP, NODE_BOTTOM)
    mask = _rounded_mask((w, h), radius)
    card = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    card.paste(img, (0, 0), mask)

    draw = ImageDraw.Draw(card)
    # Top accent bar (drawn, then re-masked so it inherits the rounded top).
    bar = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    bar_draw = ImageDraw.Draw(bar)
    bar_draw.rounded_rectangle((0, 0, w - 1, max(6, h // 10)), radius=radius // 3, fill=CYAN_SOFT)
    card.alpha_composite(Image.composite(bar, Image.new('RGBA', (w, h), (0, 0, 0, 0)), mask))

    # Border.
    draw = ImageDraw.Draw(card)
    draw.rounded_rectangle((0, 0, w - 1, h - 1), radius=radius, outline=stroke, width=stroke_w)
    return card


def _glow_line(size: tuple[int, int], draw_fn, blur_radius: int = 8) -> Image.Image:
    """Draw ``draw_fn`` onto a transparent layer twice — once blurred, once crisp."""
    blurred = Image.new('RGBA', size, (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(blurred))
    blurred = blurred.filter(ImageFilter.GaussianBlur(radius=blur_radius))

    crisp = Image.new('RGBA', size, (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(crisp))

    out = Image.alpha_composite(blurred, crisp)
    return out


def _bezier_points(p0, p1, p2, p3, steps: int = 80) -> list[tuple[float, float]]:
    pts: list[tuple[float, float]] = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        x = (
            u ** 3 * p0[0]
            + 3 * u ** 2 * t * p1[0]
            + 3 * u * t ** 2 * p2[0]
            + t ** 3 * p3[0]
        )
        y = (
            u ** 3 * p0[1]
            + 3 * u ** 2 * t * p1[1]
            + 3 * u * t ** 2 * p2[1]
            + t ** 3 * p3[1]
        )
        pts.append((x, y))
    return pts


def _find_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    """Pick a DejaVu/Liberation font if installed; otherwise fall back."""
    for candidate in (
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
        '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
        'C:/Windows/Fonts/arialbd.ttf',
    ):
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


def render_master() -> Image.Image:
    size = (MASTER_SIZE, MASTER_SIZE)
    # Scale factor so the SVG coordinates (0..512) map to master pixels.
    s = MASTER_SIZE / 512

    # Background rounded square.
    bg = _vgrad(size, BG_TOP, BG_BOTTOM)
    mask = _rounded_mask(size, radius=int(96 * s))
    canvas = Image.new('RGBA', size, (0, 0, 0, 0))
    canvas.paste(bg, (0, 0), mask)

    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle(
        (0, 0, size[0] - 1, size[1] - 1),
        radius=int(96 * s),
        outline=CYAN_FAINT,
        width=max(2, int(2 * s)),
    )

    # Faint grid dots.
    dot_coords = [
        (80, 80), (160, 80), (240, 80), (320, 80), (400, 80),
        (80, 160), (160, 160), (400, 160),
        (80, 432), (160, 432), (240, 432), (320, 432), (400, 432),
    ]
    for x, y in dot_coords:
        r = max(2, int(2 * s))
        cx, cy = int(x * s), int(y * s)
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(91, 220, 255, 28))

    # Glowing bezier edges (drawn before the node cards so sockets overlap).
    def _draw_edges(d: ImageDraw.ImageDraw) -> None:
        e1 = _bezier_points((176 * s, 176 * s), (232 * s, 176 * s), (232 * s, 256 * s), (288 * s, 256 * s))
        e2 = _bezier_points((368 * s, 256 * s), (432 * s, 256 * s), (408 * s, 336 * s), (336 * s, 336 * s))
        d.line(e1, fill=(91, 220, 255, 190), width=int(6 * s), joint='curve')
        d.line(e2, fill=(91, 220, 255, 190), width=int(6 * s), joint='curve')

    edges_layer = _glow_line(size, _draw_edges, blur_radius=int(6 * s))
    canvas.alpha_composite(edges_layer)

    # Node cards.
    def _paste_card(x: int, y: int, w: int, h: int, highlight: bool = False) -> None:
        stroke = CYAN if highlight else CYAN_SOFT
        stroke_w = max(2, int((2.5 if highlight else 2) * s))
        card = _node_card(int(w * s), int(h * s), radius=int(14 * s), stroke=stroke, stroke_w=stroke_w)
        canvas.alpha_composite(card, (int(x * s), int(y * s)))

    _paste_card(96, 144, 112, 64)                    # upstream
    _paste_card(208, 224, 160, 64, highlight=True)   # middle
    _paste_card(256, 304, 112, 64)                   # downstream

    # Glowing socket dots.
    sockets = [(176, 176), (288, 256), (368, 256), (336, 336)]
    for cx, cy in sockets:
        cxp, cyp = int(cx * s), int(cy * s)
        r = int(8 * s)
        glow = Image.new('RGBA', size, (0, 0, 0, 0))
        ImageDraw.Draw(glow).ellipse(
            (cxp - r * 2, cyp - r * 2, cxp + r * 2, cyp + r * 2),
            fill=(91, 220, 255, 110),
        )
        canvas.alpha_composite(glow.filter(ImageFilter.GaussianBlur(radius=int(6 * s))))
        d = ImageDraw.Draw(canvas)
        d.ellipse((cxp - r, cyp - r, cxp + r, cyp + r), fill=CYAN_BRIGHT)

    # Wordmark.
    font = _find_font(int(40 * s))
    text = 'mini-tricky'
    tw = draw.textlength(text, font=font)
    draw.text(
        ((MASTER_SIZE - tw) / 2, int(408 * s)),
        text,
        fill=TEXT,
        font=font,
    )

    return canvas


def main() -> None:
    master = render_master()
    master.save(BUILD_DIR / 'icon.png')

    sizes = [512, 256, 128, 64, 32, 16]
    for size in sizes:
        resized = master.resize((size, size), Image.Resampling.LANCZOS)
        resized.save(BUILD_DIR / f'icon-{size}.png')

    # ImageMagick-less ICO assembly via Pillow.
    ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    master.save(BUILD_DIR / 'icon.ico', format='ICO', sizes=ico_sizes)

    # Tray icon (32x32) consumed by electron/main.cjs.
    tray = master.resize((32, 32), Image.Resampling.LANCZOS)
    tray.save(BUILD_DIR.parent / 'electron' / 'tray-icon.png')

    print(f'Wrote {BUILD_DIR / "icon.png"} ({MASTER_SIZE}x{MASTER_SIZE})')
    for size in sizes:
        print(f'Wrote {BUILD_DIR / f"icon-{size}.png"}')
    print(f'Wrote {BUILD_DIR / "icon.ico"} ({len(ico_sizes)} resolutions)')
    print(f'Wrote {BUILD_DIR.parent / "electron" / "tray-icon.png"} (32x32)')


if __name__ == '__main__':
    main()
