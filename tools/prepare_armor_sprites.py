#!/usr/bin/env python3
"""Prepare approved, plain-background character previews as RGBA game assets.

Dependencies: Pillow, NumPy, SciPy. No model, API, or server connection.
This is deliberately restricted to the 1024x1536 approved first series.
Do not use it on collages, textured backgrounds, or unreviewed new poses.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def extract(source):
    rgb = np.array(Image.open(source).convert('RGB'))
    height, width = rgb.shape[:2]
    if (width, height) != (1024, 1536):
        raise ValueError('Expected an approved 1024x1536 source preview')
    y, x = np.indices((height, width))
    known_background = (x < 170) | (x > 850) | (y < 65) | (y > 1430)
    background_color = np.median(rgb[known_background], axis=0)
    distance = np.max(np.abs(rgb.astype(float) - background_color), axis=2)
    variation = float(np.percentile(distance[known_background], 99.99))
    if variation > 12:
        raise ValueError('Background is not sufficiently uniform; needs a manual mask')
    threshold = max(6.0, variation + 1.0)
    possible_background = distance <= threshold
    seeds = np.zeros((height, width), bool)
    seeds[0, :] = seeds[-1, :] = True
    seeds[:, 0] = seeds[:, -1] = True
    background = ndi.binary_propagation(seeds & possible_background, mask=possible_background)
    labels, count = ndi.label(~background)
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    largest = int(sizes.argmax())
    selected = labels == largest
    removed_sizes = np.delete(sizes, largest)
    if removed_sizes.max(initial=0) > 512:
        raise ValueError('A significant detached region needs visual review')
    if not 0.15 < selected.mean() < 0.55:
        raise ValueError('Unexpected foreground coverage')

    # All solid interior pixels are protected, including dark straps and boots.
    core = ndi.binary_erosion(selected, iterations=2)
    outer = ndi.binary_dilation(selected, iterations=2)
    band = outer & ~core
    _, indices = ndi.distance_transform_edt(~core, return_indices=True)
    nearby = rgb[indices[0], indices[1]].astype(float)
    direction = nearby - background_color
    denominator = np.sum(direction * direction, axis=2)
    projection = np.sum((rgb.astype(float) - background_color) * direction, axis=2)
    alpha_float = np.divide(projection, denominator, out=np.zeros_like(projection), where=denominator > 1)
    alpha_float = np.clip(alpha_float, 0, 1)
    alpha_float[~band] = selected[~band]
    alpha_float[alpha_float < 0.045] = 0
    alpha_float[alpha_float > 0.985] = 1
    alpha = np.round(alpha_float * 255).astype(np.uint8)
    pixels = rgb.copy()
    soft = (alpha > 0) & (alpha < 255)
    af = alpha[soft, None].astype(float) / 255
    # Remove the old grey contribution only from antialiased contour pixels.
    pixels[soft] = np.clip(np.round((rgb[soft].astype(float) - (1 - af) * background_color) / af), 0, 255)
    pixels[alpha == 0] = 0
    opaque = alpha == 255
    if not np.array_equal(pixels[opaque], rgb[opaque]):
        raise AssertionError('Opaque character pixels changed')
    cutout = Image.fromarray(np.dstack([pixels, alpha]), 'RGBA')
    box = cutout.getbbox()
    if not (box and box[0] > 180 and box[1] > 65 and box[2] < 850 and box[3] < 1430):
        raise ValueError('Unexpected character bounds; inspect before releasing')
    if alpha.min() != 0 or alpha.max() != 255 or not soft.any():
        raise AssertionError('Expected transparent background and antialiased edges')
    return cutout, alpha, {
        'source_sha256': digest(source), 'source_size': [width, height],
        'background_rgb': background_color.tolist(), 'background_variation': variation,
        'threshold': threshold, 'source_bbox': list(box),
        'alpha_range': [int(alpha.min()), int(alpha.max())],
        'opaque_pixels': int(opaque.sum()), 'soft_edge_pixels': int(soft.sum()),
        'removed_small_components': int(count - 1),
        'largest_removed_component': int(removed_sizes.max(initial=0)),
        'opaque_rgb_preserved': True,
    }


def normalize(cutout):
    subject = cutout.crop(cutout.getbbox())
    target_height = 676
    target_width = round(subject.width * target_height / subject.height)
    subject = subject.resize((target_width, target_height), Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', (512, 768), (0, 0, 0, 0))
    canvas.alpha_composite(subject, ((512 - target_width) // 2, 46))
    return canvas


def review_image(cutout, path):
    canvas = Image.new('RGB', (1024, 800), '#222222')
    draw = ImageDraw.Draw(canvas)
    for column, color in enumerate(['#f4f0e6', '#101917']):
        background = Image.new('RGBA', cutout.size, color)
        background.alpha_composite(cutout)
        preview = background.convert('RGB').resize((512, 768), Image.Resampling.LANCZOS)
        canvas.paste(preview, (column * 512, 32))
        draw.text((column * 512 + 16, 10), 'LIGHT BACKGROUND' if column == 0 else 'DARK BACKGROUND', fill='white')
    canvas.save(path, quality=95)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--game-icons-dir', type=Path, required=True)
    args = parser.parse_args()
    for folder in ['characters_rgba', 'masks', 'review']:
        (args.output_dir / folder).mkdir(parents=True, exist_ok=True)
    args.game_icons_dir.mkdir(parents=True, exist_ok=True)
    report = []
    for item_id in range(1, 6):
        matches = list(args.source_dir.glob(f'character_{item_id:02d}_*.png'))
        if len(matches) != 1:
            raise ValueError(f'Expected one source for item {item_id}')
        source = matches[0]
        cutout, alpha, metadata = extract(source)
        rgba_path = args.output_dir / 'characters_rgba' / source.name
        mask_path = args.output_dir / 'masks' / f'character_{item_id:02d}_alpha.png'
        cutout.save(rgba_path, optimize=True)
        Image.fromarray(alpha).save(mask_path, optimize=True)
        normalized = normalize(cutout)
        game_path = args.game_icons_dir / f'armor_char_{item_id}.webp'
        normalized.save(game_path, 'WEBP', quality=90, method=6)
        with Image.open(game_path) as saved:
            if saved.mode != 'RGBA' or saved.getchannel('A').getextrema() != (0, 255):
                raise AssertionError('Game WebP lost alpha')
            if not np.array_equal(np.array(saved.getchannel('A')), np.array(normalized.getchannel('A'))):
                raise AssertionError('Game WebP altered the alpha mask')
            review_image(saved, args.output_dir / 'review' / f'character_{item_id:02d}_light_dark.jpg')
        metadata.update(catalog_id=item_id, rgba_file=str(rgba_path), rgba_sha256=digest(rgba_path),
                        game_file=game_path.name, game_sha256=digest(game_path),
                        game_bytes=game_path.stat().st_size, game_size=[512, 768],
                        game_bbox=list(normalized.getbbox()))
        report.append(metadata)
        (args.output_dir / 'matting_report.json').write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps(metadata), flush=True)


if __name__ == '__main__':
    main()
