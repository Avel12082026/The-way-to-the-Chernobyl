"""Stage generated sources and make per-pair review sheets. Does not publish."""
import json
import shutil
import subprocess
import sys
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
out = root / 'asset_sources/armor_16_96'
index = [{"id": n} for n in range(16,97)]
for number in sorted(set(e['id'] for e in index)):
    paths = [out / f'armor_{kind}_{number}.webp' for kind in ['char', 'icon']]
    if not all(p.exists() for p in paths):
        continue
    sheet = Image.new('RGB', (1792, 800), '#aaaaaa')
    ImageDraw.Draw(sheet).text((20, 8), f'Catalog #{number}', fill='black')
    x = 0
    for color in ['#eeeeee', '#202020']:
        for path in paths:
            im = Image.open(path).convert('RGBA')
            panel = Image.new('RGBA', im.size, color)
            panel.alpha_composite(im)
            sheet.paste(panel.convert('RGB'), (x, 32))
            x += im.width
    sheet.save(out / f'review_{number}.jpg', quality=95)
