"""Restore reviewed source art and remove white/checkerboard pistol mattes.

The source canvas and pose are preserved. Native alpha is copied unchanged.
Background assignments are habitat selections, not claims about old exec IDs.
"""
import argparse
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from clean_combat_transparency import ROOT, save_and_check, sha

BASE = ROOT / 'asset_sources/combat_restoration'
CHECKER = {88, 89, 90, 91, 92}
# Reviewed enclosed gaps above/below the trigger finger. These seeds stay
# inside the guard, away from silver metal highlights and front sights.
TRIGGER = {
    1:[(660,680,680,725)],3:[(660,655,695,715)],5:[(670,645,690,680)],
    6:[(675,660,700,695)],7:[(690,660,715,702)],86:[(655,640,690,695)],
    88:[(670,650,710,725)],89:[(670,675,695,715)],90:[(675,675,700,705)],
    91:[(675,690,700,720)],92:[(680,680,710,725)],93:[(680,685,705,720)],
    94:[(675,605,700,642)],95:[(670,650,710,725)],96:[(680,685,705,715)],
    97:[(670,650,710,725)],98:[(665,580,688,612),(665,640,700,680)],
    99:[(675,670,700,700)],100:[(670,645,695,682)],
    101:[(570,530,605,592),(620,642,642,660)],
    102:[(620,628,650,670),(650,734,670,742)],103:[(630,605,670,657)],
    104:[(675,640,710,680)],105:[(660,612,685,642)]
}


def remove_matte(im, weapon_id, checker_override=None, spread=None, hole_seeds=()):
    checker = weapon_id in CHECKER if checker_override is None else checker_override
    rgb = np.array(im.convert('RGB'))
    value = rgb.astype(np.int16)
    neutral = (value.max(2) - value.min(2) < (spread or (25 if checker else 12))) & (value.min(2) > (165 if checker else 245))
    seed = np.zeros(neutral.shape, bool)
    seed[0, :] = seed[-1, :] = True
    seed[:, 0] = seed[:, -1] = True
    background = ndi.binary_propagation(seed & neutral, mask=neutral)
    holes = np.zeros(neutral.shape, bool)
    for x1,y1,x2,y2 in TRIGGER.get(weapon_id, []):
        holes[y1:y2,x1:x2] = True
    for x,y in hole_seeds:
        holes[y,x] = True
    background |= ndi.binary_propagation(holes & neutral, mask=neutral)
    # Tiny enclosed white pockets beside the forearm's outer contour.
    if not checker:
        forearm = np.zeros(neutral.shape, bool)
        forearm[850:,1000:] = True
        background |= ndi.binary_dilation(background, iterations=20) & neutral & forearm
    foreground = ~background
    labels, _ = ndi.label(foreground)
    counts = np.bincount(labels.ravel()); counts[0] = 0
    foreground = labels == counts.argmax()
    interior = ndi.binary_erosion(foreground, iterations=3)
    edge = foreground & ~interior
    _, fi = ndi.distance_transform_edt(~interior, return_indices=True)
    _, bi = ndi.distance_transform_edt(foreground, return_indices=True)
    f, b = value[tuple(fi)].astype(float), value[tuple(bi)].astype(float)
    delta = f-b
    estimate = np.clip(((value-b)*delta).sum(2)/np.maximum((delta*delta).sum(2),1),0,1)
    alpha = foreground.astype(np.uint8)*255
    matte = edge & (estimate < .98)
    alpha[matte] = np.round(estimate[matte]*255).astype(np.uint8)
    rgb[matte] = f[matte].clip(0,255).astype(np.uint8)
    out = np.dstack((rgb,alpha)); out[alpha == 0, :3] = 0
    return Image.fromarray(out)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--downloads', type=Path)
    args = parser.parse_args()
    manifest = json.loads((BASE/'manifest.json').read_text())
    records = []
    for item in manifest:
        target = ROOT/'images/combat'/item['target']
        # Backgrounds and already-transparent sprites are their own originals.
        pistol = item['target'].startswith('pistols/')
        source = BASE/'originals'/item['target'] if pistol else target
        if not source.exists():
            if not args.downloads:
                raise FileNotFoundError(source)
            source.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(args.downloads/item['name'], source)
        im = Image.open(source)
        source_hash = sha(source.read_bytes())
        if pistol and im.convert('RGBA').getchannel('A').getextrema()[0] == 255:
            out = remove_matte(im, int(target.stem))
            record = save_and_check(out, target)
            record['operation'] = 'remove_checkerboard' if int(target.stem) in CHECKER else 'remove_white'
        else:
            if pistol:
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, target)
            record = {'path':str(target.relative_to(ROOT)), 'sha256':sha(target.read_bytes()), 'size':list(im.size), 'operation':'original_unchanged'}
        record.update(source=str(source.relative_to(ROOT)), source_sha256=source_hash, library_file_id=item['library_file_id'])
        records.append(record)
    (BASE/'report.json').write_text(json.dumps(records,indent=2)+'\n')
    print(f'Restored and verified {len(records)} files')


if __name__ == '__main__':
    main()
