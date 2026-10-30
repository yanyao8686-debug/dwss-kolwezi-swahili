#!/usr/bin/env python3
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "www" / "cover.jpg"
ASSETS = ROOT / "assets"
ASSETS.mkdir(parents=True, exist_ok=True)

if not SOURCE.is_file():
    raise SystemExit(f"Official website cover not found: {SOURCE}")

with Image.open(SOURCE) as original:
    image = ImageOps.exif_transpose(original).convert("RGB")
    if image.width < 1024 or image.height < 1024:
        raise SystemExit(f"Cover must be at least 1024x1024; got {image.width}x{image.height}")
    square = ImageOps.fit(image, (1024, 1024), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
    square.save(ASSETS / "icon-only.png", format="PNG", optimize=True)

    # Android adaptive icons mask the foreground. Keep the complete cover artwork
    # inside the central safe area, so the DWSS globe, mark and Chinese title remain visible.
    foreground = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    artwork = ImageOps.fit(image, (660, 660), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5)).convert("RGBA")
    foreground.alpha_composite(artwork, ((1024 - 660) // 2, (1024 - 660) // 2))
    foreground.save(ASSETS / "icon-foreground.png", format="PNG", optimize=True)

    background = Image.new("RGB", (1024, 1024), (0, 38, 88))
    background.save(ASSETS / "icon-background.png", format="PNG", optimize=True)

# Verify all three icon source images are valid and have Android-required dimensions.
for path in (ASSETS / "icon-only.png", ASSETS / "icon-foreground.png", ASSETS / "icon-background.png"):
    with Image.open(path) as im:
        if im.size != (1024, 1024):
            raise SystemExit(f"Invalid icon dimension: {path.name} {im.size}")
print("PASS: generated 1024x1024 Android icon layers directly from the official DWSS website cover.")
