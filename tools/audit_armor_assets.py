"""Audit catalog-to-file mappings and image format; does not certify visual quality."""
import hashlib
import json
import re
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def audit():
    source = (ROOT / 'index.html').read_text()
    catalog = source.split('const armorItems = [', 1)[1].split('\n    ];', 1)[0]
    items = re.findall(r'id:\s*(\d+),\s*name:\s*"([^"]+)"', catalog)
    mappings = {}
    for kind, variable in [('icon', 'ITEM_ICONS'), ('char', 'ARMOR_CHAR_IMAGES')]:
        section = source.split(f'const {variable} = {{', 1)[1].split('\n    };', 1)[0]
        mappings[kind] = dict(re.findall(r"'([^']+)':\s*'(armor_\w+_\d+\.webp)'", section))
    records = []
    for number, name in items:
        record = {'catalog_id': int(number), 'name': name, 'assets': {},
                  'visual_review': 'pending'}
        for kind, size in [('char', (512, 768)), ('icon', (384, 384))]:
            filename = mappings[kind].get(name)
            entry = {'file': filename}
            record['assets'][kind] = entry
            if not filename or not (ROOT / 'icons' / filename).exists():
                entry['error'] = 'missing mapping or file'
                continue
            path = ROOT / 'icons' / filename
            with Image.open(path) as im:
                alpha = im.getchannel('A') if 'A' in im.getbands() else None
                entry.update(size=list(im.size), mode=im.mode,
                             size_ok=im.size == size,
                             alpha_extrema=list(alpha.getextrema()) if alpha else None,
                             has_transparent_pixels=bool(alpha and alpha.getextrema()[0] == 0),
                             sha256=hashlib.sha256(path.read_bytes()).hexdigest())
        ids = [re.search(r'_(\d+)\.webp$', e['file']).group(1)
               for e in record['assets'].values() if e.get('file')]
        record['pair_file_numbers_match'] = len(ids) == 2 and ids[0] == ids[1]
        records.append(record)
    return {'note': 'Format checks do not prove empty icons, clean transparency or matching artwork.',
            'catalog_count': len(records), 'records': records}


if __name__ == '__main__':
    print(json.dumps(audit(), ensure_ascii=False, indent=2))
