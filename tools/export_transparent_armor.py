#!/usr/bin/env python3
"""Export the reviewed first five RGBA character/icon pairs for the game.

This accepts finished transparent PNGs and never reconstructs a background mask.
Dependencies: Pillow. Source files are validated against the collection manifest.
"""
import argparse
from io import BytesIO
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps


def digest(data):
    return hashlib.sha256(data).hexdigest()


def frame(image, kind):
    alpha = image.getchannel('A')
    # Some generated PNGs contain isolated alpha 1..8 specks far from the body.
    # Ignore those when finding the framing box; retain a three-pixel edge guard.
    box = alpha.point(lambda p: 255 if p > 8 else 0).getbbox()
    if box is None:
        raise ValueError('Empty foreground')
    box = (max(0, box[0] - 3), max(0, box[1] - 3),
           min(image.width, box[2] + 3), min(image.height, box[3] + 3))
    outside = alpha.copy()
    ImageDraw.Draw(outside).rectangle((box[0], box[1], box[2] - 1, box[3] - 1), fill=0)
    clipped_max_alpha = outside.getextrema()[1]
    if clipped_max_alpha > 8:
        raise ValueError('Framing would clip visible material')
    subject = image.crop(box)
    if kind == 'character':
        size = (512, 768)
        target = (round(subject.width * 676 / subject.height), 676)
        if target[0] > 460:
            raise ValueError('Unexpected character proportions')
        fitted = subject.resize(target, Image.Resampling.LANCZOS)
        position = ((size[0] - target[0]) // 2, 46)
    else:
        size = (384, 384)
        fitted = ImageOps.contain(subject, (352, 352), Image.Resampling.LANCZOS)
        position = ((size[0] - fitted.width) // 2, (size[1] - fitted.height) // 2)
    result = Image.new('RGBA', size, (0, 0, 0, 0))
    result.alpha_composite(fitted, position)
    return result, {'source_frame': list(box), 'clipped_max_alpha': clipped_max_alpha,
                    'fitted_size': list(fitted.size), 'position': list(position)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--collection', type=Path, required=True)
    parser.add_argument('--icons-dir', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    args = parser.parse_args()
    manifest = json.loads((args.collection / 'manifest.json').read_text())
    if [item['id'] for item in manifest['items']] != [1, 2, 3, 4, 5]:
        raise ValueError('Expected the reviewed first five pairs')
    records, encoded = [], []
    for item in manifest['items']:
        for kind, stem in [('character', 'armor_char'), ('icon', 'armor_icon')]:
            entry = item[kind]
            if not entry:
                raise ValueError(f'Missing {kind} for armor {item["id"]}')
            source = args.collection / entry['file']
            data = source.read_bytes()
            if digest(data) != entry['sha256']:
                raise ValueError(f'Unreviewed source: {source.name}')
            with Image.open(BytesIO(data)) as original:
                original.load()
                if original.format != 'PNG' or original.mode != 'RGBA':
                    raise ValueError('Source must be a finished RGBA PNG')
                if original.getchannel('A').getextrema()[0] != 0:
                    raise ValueError('Source has no transparent background')
                normalized, framing = frame(original, kind)
            buf = BytesIO()
            normalized.save(buf, 'WEBP', quality=90, method=6)
            output_data = buf.getvalue()
            with Image.open(BytesIO(output_data)) as saved:
                saved.load()
                if saved.mode != 'RGBA' or saved.size != normalized.size:
                    raise ValueError('WebP lost RGBA or changed size')
                alpha = saved.getchannel('A')
                if alpha.tobytes() != normalized.getchannel('A').tobytes():
                    raise ValueError('WebP changed the alpha channel')
                if alpha.getextrema()[0] != 0 or alpha.getextrema()[1] < 250:
                    raise ValueError('Unexpected output alpha range')
                if any(alpha.getpixel(p) != 0 for p in [(0, 0), (saved.width - 1, 0),
                                                       (0, saved.height - 1),
                                                       (saved.width - 1, saved.height - 1)]):
                    raise ValueError('Output corners must be transparent')
            filename = f'{stem}_{item["id"]}.webp'
            encoded.append((filename, output_data))
            records.append({'id': item['id'], 'name': item['name'], 'kind': kind,
                            'source': entry['file'], 'source_sha256': entry['sha256'],
                            'file': f'icons/{filename}', 'size': list(normalized.size),
                            'sha256': digest(output_data), 'bytes': len(output_data),
                            'alpha_range': list(alpha.getextrema()),
                            'webp_alpha_lossless': True, **framing})
    # Validate the whole set before replacing runtime files.
    args.icons_dir.mkdir(parents=True, exist_ok=True)
    for filename, data in encoded:
        target = args.icons_dir / filename
        pending = target.with_suffix('.pending')
        pending.write_bytes(data)
        pending.replace(target)
    report = {'collection': 'CHERNOBYL_TRANSPARENT_ASSETS_CURRENT.zip',
              'character_canvas': [512, 768], 'icon_canvas': [384, 384],
              'webp_color_quality': 90, 'webp_alpha_lossless': True,
              'total_bytes': sum(r['bytes'] for r in records), 'assets': records}
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'assets': len(records), 'bytes': report['total_bytes'],
                      'report': str(args.report)}))


if __name__ == '__main__':
    main()
