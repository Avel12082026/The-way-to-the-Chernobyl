"""Save a generated hand non-destructively and prepare a review profile."""
import json
import shutil
import sys
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
armor, source = int(sys.argv[1]), Path(sys.argv[2])
out = root / f'asset_sources/combat_hand_repair/anatomy-{armor}'
out.mkdir(parents=True, exist_ok=True)
target = out / 'hand-only-v3.webp'
if target.exists():
    raise SystemExit('Existing source must not be overwritten')
im = Image.open(source)
im.load()
assert im.mode == 'RGBA' and im.size == (1536, 1024)
assert im.getchannel('A').getextrema()[0] == 0
im.save(target, lossless=True)
check = Image.open(target)
check.load()
assert check.getchannel('A').tobytes() == im.getchannel('A').tobytes()
# WebP may discard RGB under alpha zero; visible RGBA must stay identical.
for bg in ('white', 'black'):
    back = Image.new('RGBA', im.size, bg)
    assert Image.alpha_composite(back, check).tobytes() == Image.alpha_composite(back, im).tobytes()
shutil.copyfile(root / 'asset_sources/combat_hand_repair/anatomy-77/profile-v3.json', out / 'profile-v3.json')
(out / 'source-info.json').write_text(json.dumps({'source': str(source), 'method': 'built-in imagegen; lossless WebP; original RGBA preserved', 'alpha': im.getchannel('A').getextrema(), 'armor_reference': f'icons/armor_char_{armor}.webp', 'status': 'awaiting visual review'}, indent=2))
print(f'Saved armor {armor}; lossless RGBA verified')
