"""Conservative alpha cleanup; keeps sprite canvas and placement unchanged.

Hands are read from the pre-cleanup Git revision so reruns never degrade them.
Neutral checkerboard removal follows prepare_ratnik_16.py, with per-source
thresholds and connected foreground selection. Review rendered edges afterward.
"""
import hashlib
import io
import json
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[1]
BASE = 'f207bb0'
REPORT = ROOT / 'asset_sources/combat_cleanup/transparency_report.json'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def clean_hand(im, name=''):
    src = np.array(im.convert('RGBA'))
    out = src.copy()
    rgb = src[:, :, :3].astype(np.int16)
    key = np.minimum(rgb[:, :, 0], rgb[:, :, 2]) - rgb[:, :, 1]
    visible = src[:, :, 3] > 0
    seed = visible & (key > 45) & (rgb[:, :, 0] > 90) & (rgb[:, :, 2] > 90)
    if not seed.any():
        return im.convert('RGBA'), 0
    # Include enclosed holes between fingers and equipment; no edge-only flood.
    mask = ndi.binary_propagation(seed, mask=visible & (key > 20))
    # JPEG/WebP shading can split a magenta hole into bright and dark islands.
    # Only inspect the immediate neighborhood of an already identified hole.
    nearby = ndi.binary_dilation(mask, iterations=8)
    balanced_rb = np.minimum(rgb[:, :, 0], rgb[:, :, 2]) > .7 * np.maximum(rgb[:, :, 0], rgb[:, :, 2])
    mask |= nearby & visible & (key > 15) & balanced_rb
    # Individually reviewed dark/lavender fragments in the armor-71 rail gap.
    # This recess contains several disconnected pieces of the original key.
    recesses = {'71_left': (120, 840, 200, 910), '71_right': (1390, 860, 1460, 930)}
    if name in recesses:
        x1, y1, x2, y2 = recesses[name]
        recess = np.zeros(visible.shape, dtype=bool)
        recess[y1:y2, x1:x2] = True
        mask |= recess & visible & (key > 3)
    out[mask, 3] = 0
    out[mask, :3] = 0
    # Neutralize only residual magenta immediately beside the removed key.
    spill = ndi.binary_dilation(mask, iterations=1) & ~mask & visible & (key > 5)
    out[:, :, 2][spill] = np.minimum(rgb[:, :, 2][spill], rgb[:, :, 1][spill])
    out[:, :, 0][spill] = np.minimum(rgb[:, :, 0][spill], rgb[:, :, 1][spill] + 30)
    return Image.fromarray(out), int(np.any(out != src, axis=2).sum())


def clean_monster(im):
    rgb = np.array(im.convert('RGB'))
    value = rgb.astype(np.int16)
    neutral = (value.max(2) - value.min(2) < 25) & (value.min(2) > 150)
    labels, _ = ndi.label(neutral)
    counts = np.bincount(labels.ravel())
    background = (labels > 0) & (counts[labels] > 80)
    labels, _ = ndi.label(~background)
    counts = np.bincount(labels.ravel())
    counts[0] = 0
    foreground = labels == counts.argmax()
    alpha = foreground.astype(np.uint8) * 255
    # Remove checkerboard spill on the silhouette, including individual hairs.
    # Estimate foreground/background locally; never erode the inner object.
    interior = ndi.binary_erosion(foreground, iterations=3)
    edge = foreground & ~interior
    _, inner_indices = ndi.distance_transform_edt(~interior, return_indices=True)
    _, bg_indices = ndi.distance_transform_edt(foreground, return_indices=True)
    f = value[tuple(inner_indices)].astype(float)
    b = value[tuple(bg_indices)].astype(float)
    delta = f - b
    estimated = np.clip(((value - b) * delta).sum(2) / np.maximum((delta * delta).sum(2), 1), 0, 1)
    matte = edge & (estimated < .98)
    alpha[matte] = np.round(estimated[matte] * 255).astype(np.uint8)
    rgb[matte] = f[matte].clip(0, 255).astype(np.uint8)
    rgba = np.dstack([rgb, alpha])
    rgba[alpha == 0, :3] = 0
    return Image.fromarray(rgba)


def save_and_check(im, dst):
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists() and dst.stat().st_size:
        current = Image.open(dst).convert('RGBA')
        if current.size == im.size and np.array_equal(np.array(current), np.array(im)):
            return {'path': str(dst.relative_to(ROOT)), 'sha256': sha(dst.read_bytes()),
                    'size': list(im.size), 'alpha_range': list(current.getchannel('A').getextrema()),
                    'rgba_lossless': True}
    temporary = dst.with_name(dst.name + '.tmp')
    if dst.suffix == '.webp':
        im.save(temporary, format='WEBP', lossless=True, exact=True, method=6)
    else:
        im.save(temporary, format='PNG', optimize=True)
    temporary.replace(dst)
    saved = Image.open(dst).convert('RGBA')
    assert saved.size == im.size
    assert np.array_equal(np.array(saved), np.array(im)), dst
    return {'path': str(dst.relative_to(ROOT)), 'sha256': sha(dst.read_bytes()),
            'size': list(im.size), 'alpha_range': list(saved.getchannel('A').getextrema()),
            'rgba_lossless': True}


def main():
    records = []
    for path in sorted((ROOT / 'images/anomaly/hands').glob('*.webp')):
        rel = str(path.relative_to(ROOT))
        data = subprocess.check_output(['git', 'show', f'{BASE}:{rel}'], cwd=ROOT)
        src = Image.open(io.BytesIO(data)).convert('RGBA')
        out, count = clean_hand(src, path.stem)
        if count:
            item = save_and_check(out, path)
            item.update(source_revision=BASE, source_sha256=sha(data), modified_pixels=count)
            records.append(item)
    for species in ('zombie', 'chernobyl-dog'):
        source = ROOT / f'asset_sources/combat_cleanup/{species}_rgb.png'
        src = Image.open(source)
        out = clean_monster(src)
        item = save_and_check(out, ROOT / f'images/combat/mutants/{species}.png')
        item.update(source=str(source.relative_to(ROOT)), source_sha256=sha(source.read_bytes()))
        records.append(item)
    REPORT.write_text(json.dumps({'base_revision': BASE, 'files': records}, indent=2) + '\n')
    print(f'Cleaned {len(records)} assets without resizing; verified lossless RGBA export')


if __name__ == '__main__':
    main()
