"""Read-only alpha audit. Flags are evidence to inspect, never anatomy approval."""
from pathlib import Path
from PIL import Image
import numpy as np
import hashlib, json

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'asset_sources/hand_transparency_review'
OUT.mkdir(exist_ok=True)
patterns = ['asset_sources/prepared_hand_pack/hands/*.webp',
            'images/combat/modular/hands/*.webp', 'images/combat/modular/weapons/*.png',
            'images/anomaly/hands/*.webp', 'images/combat/pistols/*.png']
records = []
for pattern in patterns:
    for path in sorted(ROOT.glob(pattern)):
        im = Image.open(path)
        a = np.array(im.convert('RGBA'))
        rgb = a[:, :, :3].astype(np.int16)
        alpha = a[:, :, 3]
        # Chroma candidates are reported, not removed: armor may contain purple.
        magenta = (rgb[:,:,0] > 170) & (rgb[:,:,2] > 130) & (rgb[:,:,1] < 105) & (alpha > 30)
        records.append(dict(path=str(path.relative_to(ROOT)),
            sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
            size=list(im.size), has_alpha='A' in im.getbands(),
            transparent_pixels=int((alpha == 0).sum()),
            partial_pixels=int(((alpha > 0) & (alpha < 255)).sum()),
            corner_alpha=[int(alpha[y,x]) for y,x in [(0,0),(0,-1),(-1,0),(-1,-1)]],
            magenta_candidates=int(magenta.sum()),
            visual_review='pending'))
result = dict(scope='existing files only; no missing variant replaced', files=records,
              limitations='Alpha presence cannot prove clean contours, absence of baked checkerboard, or correct anatomy.')
(OUT/'alpha-audit.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(dict(files=len(records),missing_alpha=[r['path'] for r in records if not r['has_alpha']],
    no_transparency=[r['path'] for r in records if not r['transparent_pixels']],
    magenta_candidates=[(r['path'],r['magenta_candidates']) for r in records if r['magenta_candidates'] > 30]),indent=2))
