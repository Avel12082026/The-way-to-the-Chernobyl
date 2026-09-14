"""Release checks for decoded files, real alpha, chroma residue and manifests."""
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[1]
report = json.loads((root / 'asset_sources/combat_cleanup/transparency_report.json').read_text())
for item in report['files']:
    p = root / item['path']
    assert hashlib.sha256(p.read_bytes()).hexdigest() == item['sha256'], p
    im = Image.open(p)
    assert im.size == tuple(item['size']), p
    assert im.mode == 'RGBA', p
    assert im.getchannel('A').getextrema() == (0, 255), p

hands = sorted((root / 'images/anomaly/hands').glob('*.webp'))
assert len(hands) == 288
for p in hands:
    im = Image.open(p).convert('RGBA')
    assert im.size == (1536, 1024), p
    a = np.array(im).astype(np.int16)
    assert a[:, :, 3].min() == 0 and a[:, :, 3].max() == 255, p
    key = np.minimum(a[:, :, 0], a[:, :, 2]) - a[:, :, 1]
    residue = (a[:, :, 3] > 16) & (key > 45) & (a[:, :, 0] > 90) & (a[:, :, 2] > 90)
    assert not residue.any(), p

catalog = json.loads((root / 'images/combat/catalog.json').read_text())
for species in catalog['species']:
    complete = all((root / 'images/combat' / f).exists() for f in [species['mutant'], *species['backgrounds']])
    assert species['ready'] == complete, species['id']
print('288 hands: real alpha, fixed dimensions, no detected magenta residue; 92 saved assets match verified hashes')
print('Asset integrity passed. This does not certify absent pistols/backgrounds or an in-game release.')
