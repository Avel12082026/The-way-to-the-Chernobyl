"""Install reviewed catalog assets using the audited client filename mapping."""
import hashlib
import json
import re
import shutil
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
sources = root / 'asset_sources/armor_16_96'
approved = set(json.loads((sources / 'visual_review.json').read_text())['approved_catalog_ids'])
assert set(range(16, 97)) <= approved, 'Individual visual review is incomplete'
records = json.loads((root / 'ASSET_AUDIT_01_96.json').read_text())['records']
assets = []
for record in records:
    n = record['catalog_id']
    if n < 16:
        continue
    for kind, size in [('char', (512, 768)), ('icon', (384, 384))]:
        source = sources / f'armor_{kind}_{n}.webp'
        im = Image.open(source)
        assert im.size == size and im.mode == 'RGBA', source
        assert im.getchannel('A').getextrema() == (0, 255), source
        name = record['assets'][kind]['file']
        target = root / 'icons' / name
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        assets.append(dict(catalog_id=n, name=record['name'], kind=kind,
                           file='icons/' + name, sha256=digest, version=digest[:12],
                           bytes=source.stat().st_size, dimensions=list(size),
                           visual_review='approved on light and dark backgrounds'))
        shutil.copyfile(source, target)

client = root / 'index.html'
text = client.read_text()
match = re.search(r'(const CLIENT_ICON_VERSIONS = new Map\(\[)(.*?)(\]\);)', text, re.S)
assert match
entries = dict(re.findall(r"\['([^']+)',\s*'([^']+)'\]", match[2]))
for asset in assets:
    entries[Path(asset['file']).name] = asset['version']
replacement = '\n' + ''.join(f"        ['{key}', '{value}'],\n" for key, value in entries.items()) + '    '
text = text[:match.start(2)] + replacement + text[match.end(2):]
client.write_text(text)
manifest = dict(collection='ARMOR_16_96', status='locally reviewed; publication tracked separately',
                catalog_count=81, asset_count=len(assets), assets=assets)
(root / 'ASSET_MANIFEST_16_96.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print(f'Installed {len(assets)} reviewed assets; updated cache versions')
