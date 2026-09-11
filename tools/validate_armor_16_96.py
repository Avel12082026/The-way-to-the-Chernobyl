"""Validate reviewed armor exports, mappings, hashes and preservation of sets 1–15."""
import json, subprocess, hashlib, re
from pathlib import Path
from PIL import Image, ImageChops
from export_transparent_armor import frame
root = Path(__file__).resolve().parents[1]
manifest = json.loads((root/'ASSET_MANIFEST_16_96.json').read_text())
html = (root/'index.html').read_text()
old = subprocess.check_output(['git','show','0a69ead:index.html'],cwd=root,text=True)
for name in ['ITEM_ICONS','ARMOR_CHAR_IMAGES']:
    pattern = r'const '+name+r' = \{[\s\S]*?\n    \};'
    assert re.search(pattern,html)[0] == re.search(pattern,old)[0]
audit = json.loads((root/'ASSET_AUDIT_01_96.json').read_text())
for record in audit['records'][:15]:
    for kind in ['char','icon']:
        path = 'icons/'+record['assets'][kind]['file']
        assert (root/path).read_bytes() == subprocess.check_output(['git','show','0a69ead:'+path],cwd=root)
for asset in manifest['assets']:
    path = root/asset['file']
    image = Image.open(path)
    source = Image.open(root/f"asset_sources/armor_16_96/armor_{asset['kind']}_{asset['catalog_id']}.png").convert('RGBA')
    normalized,_ = frame(source,'character' if asset['kind']=='char' else 'icon')
    assert ImageChops.difference(image.getchannel('A'),normalized.getchannel('A')).getbbox() is None,path
    assert hashlib.sha256(path.read_bytes()).hexdigest() == asset['sha256']
    assert f"['{path.name}', '{asset['version']}']" in html
report = dict(assets=162,individual_pairs_reviewed=81,alpha_exact=True,cache_hashes_match=True,
              client_dictionaries_unchanged=True,first_15_pairs_unchanged=True,
              browser_check='blocked: Chromium download timeout',telegram_check='not performed')
(root/'ASSET_VALIDATION_16_96.json').write_text(json.dumps(report,indent=2)+'\n')
print('PASS:',json.dumps(report))
