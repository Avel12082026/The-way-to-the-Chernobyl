"""Create close grip and muzzle-effect inspection sheets from rendered pairs."""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
armor = int(sys.argv[1])
folder = root / f'asset_sources/combat_hand_repair/anatomy-{armor}'
ids = [1, 2, 3, 5, 6, 7, *range(86, 106)]
for start in range(0, len(ids), 6):
    sheet = Image.new('RGB', (1500, 1600), '#dddcd5')
    draw = ImageDraw.Draw(sheet)
    for j, weapon in enumerate(ids[start:start+6]):
        x, y = j % 3 * 500, j // 3 * 800
        draw.text((x+10, y+10), f'Armor {armor} / weapon {weapon}', fill='black')
        grip = Image.open(folder / f'pair-{weapon}.png').crop((710, 450, 1140, 880))
        sheet.paste(grip, (x+20, y+35), grip)
        shot = Image.open(folder / f'shot-{weapon}.jpg')
        shot.thumbnail((500, 333))
        sheet.paste(shot, (x, y+465))
    sheet.save(folder / f'inspect-{start//6+1}.jpg', quality=93)
