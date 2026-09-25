#!/usr/bin/env python3
"""Validate side-view PNGs read-only and build the runtime species manifest.

Run with --complete before release to require all 29 species and 57 catalog
entries. Per-species source metadata and the PNG pixels are never modified.
"""
import argparse
from collections import deque
import json
import math
from pathlib import Path

from PIL import Image


VERSION = "mutants-side-20260925-v3"
FLOATING = {"poltergeist", "fire-poltergeist"}
ALPHA_VISIBLE = 16  # Ignore sub-visible alpha=1 export residue, preserve pixels.


def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def support_components(visible, ground, bbox):
    """Find connected feet, retaining toes attached higher than the bottom band."""
    width, height = visible.size
    top = max(bbox[1], ground - round((bbox[3] - bbox[1]) * 0.18))
    band = visible.crop((0, top, width, ground + 1))
    pixels = bytearray(band.tobytes())
    contacts = []
    for seed in range(len(pixels)):
        if not pixels[seed]:
            continue
        pixels[seed] = 0
        queue = deque([seed])
        left = right = seed % width
        bottom = seed // width
        count = 0
        while queue:
            index = queue.popleft()
            x, y = index % width, index // width
            left, right, bottom = min(left, x), max(right, x), max(bottom, y)
            count += 1
            neighbors = []
            if x: neighbors.append(index - 1)
            if x < width - 1: neighbors.append(index + 1)
            if y: neighbors.append(index - width)
            if y < band.height - 1: neighbors.append(index + width)
            for neighbor in neighbors:
                if pixels[neighbor]:
                    pixels[neighbor] = 0
                    queue.append(neighbor)
        if count < max(64, width * height * 0.0004):
            continue
        if top + bottom < ground - max(8, (bbox[3] - bbox[1]) * 0.07):
            continue
        contacts.append({"x": round((left + right) / 2, 2),
                         "y": top + bottom, "width": right - left + 1})
    return sorted(contacts, key=lambda foot: foot["x"])


def measure(image):
    if "A" not in image.getbands():
        raise ValueError("image has no alpha channel")
    alpha = image.getchannel("A")
    width, height = image.size
    histogram = alpha.histogram()
    visible = alpha.point(lambda v: 255 if v >= ALPHA_VISIBLE else 0)
    bbox = visible.getbbox()
    if not bbox or not histogram[0]:
        raise ValueError("image must contain visible pixels and fully transparent exterior")
    if histogram[0] / (width * height) < 0.05:
        raise ValueError("less than 5% of the image is actually transparent")
    borders = [alpha.crop(box).getextrema()[1] for box in
               ((0, 0, width, 1), (0, height - 1, width, height),
                (0, 0, 1, height), (width - 1, 0, width, height))]
    if max(borders) >= ALPHA_VISIBLE:
        raise ValueError("visible silhouette touches canvas boundary or background is not transparent")
    ground = bbox[3] - 1
    band_top = max(bbox[1], ground - max(8, round((bbox[3] - bbox[1]) * 0.065)))
    band = visible.crop((0, band_top, width, ground + 1))
    columns = [x for x in range(width) if band.crop((x, 0, x + 1, band.height)).getbbox()]
    groups = []
    gap = max(3, round(width * 0.012))
    for x in columns:
        if groups and x - groups[-1][-1] <= gap:
            groups[-1].append(x)
        else:
            groups.append([x])
    contacts = []
    for group in groups:
        start, end = group[0], group[-1] + 1
        if end - start < max(3, width * 0.008):
            continue
        local = visible.crop((start, band_top, end, ground + 1)).getbbox()
        contacts.append({"x": round((start + end - 1) / 2, 2),
                         "y": band_top + local[3] - 1, "width": end - start})
    return {"width": width, "height": height, "groundY": ground,
            "visibleAlphaBBox": list(bbox), "bottomGroups": contacts,
            "connectedSupportGroups": support_components(visible, ground, bbox),
            "alphaZeroFraction": round(histogram[0] / (width * height), 6),
            "alphaVisibleFraction": round(sum(histogram[ALPHA_VISIBLE:]) / (width * height), 6),
            "alphaRange": list(alpha.getextrema()), "edgeAlphaMax": max(borders),
            "transparentExterior": True}


def contact_metadata(metadata, metrics, species_id, warnings):
    supplied = metadata.get("contact", metadata)
    width, height = metrics["width"], metrics["height"]
    for key, actual in (("width", width), ("height", height)):
        if key in supplied and supplied[key] != actual:
            raise ValueError(f"metadata {key}={supplied[key]} differs from image {actual}")
    floating = supplied.get("floating", species_id in FLOATING)
    if not isinstance(floating, bool):
        raise ValueError("floating must be boolean")
    if species_id in FLOATING:
        floating = True
    ground = metrics["groundY"]
    if number(supplied.get("groundY")) and abs(supplied["groundY"] - ground) > 5:
        warnings.append(f"groundY corrected from {supplied['groundY']} to measured {ground}")
    detected = metrics["connectedSupportGroups"] or metrics["bottomGroups"]
    feet = []
    if not floating:
        for raw in supplied.get("feet", []):
            if isinstance(raw, dict):
                foot = dict(raw)
            elif isinstance(raw, (list, tuple)) and len(raw) >= 2:
                foot = {"x": raw[0], "y": raw[1]}
                if len(raw) >= 3:
                    foot["width"] = raw[2]
            else:
                raise ValueError(f"invalid foot entry {raw!r}")
            if not number(foot.get("x")) or not number(foot.get("y")):
                raise ValueError("foot x and y must be finite numbers")
            if not (0 <= foot["x"] < width and 0 <= foot["y"] < height):
                raise ValueError("foot outside image")
            if not number(foot.get("width")):
                nearest = min(detected, key=lambda f: abs(f["x"] - foot["x"])) if detected else None
                foot["width"] = nearest["width"] if nearest else max(8, round(width * 0.1))
            if not (0 < foot["width"] <= width):
                raise ValueError("invalid foot width")
            feet.append({key: round(foot[key], 2) for key in ("x", "y", "width")})
        if not feet:
            feet = detected
            warnings.append("contact feet measured from bottom alpha groups")
        if not feet:
            raise ValueError("no ground contact groups detected")
    return {"width": width, "height": height, "groundY": ground,
            "feet": feet, "floating": floating}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--complete", action="store_true", help="require all 29 species and 57 catalog entries")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    sources = root / "asset_sources/mutants_side_redraw"
    output = root / "images/combat/mutants-side"
    catalog = json.loads((root / "images/combat/catalog.json").read_text())
    ids = [s["id"] for s in catalog["species"]]
    entries = catalog["entries"]
    errors, pending, species, details = [], [], {}, {}
    if len(set(ids)) != len(ids):
        errors.append("catalog contains duplicate species IDs")
    if len(ids) != 29 or len(entries) != 57:
        errors.append(f"expected 29 species and 57 entries; catalog has {len(ids)} and {len(entries)}")
    for entry in entries:
        if entry.get("species") not in ids:
            errors.append(f"catalog entry {entry.get('name')} references unknown species")
    for species_id in ids:
        image_path = output / f"{species_id}.png"
        metadata_path = sources / f"{species_id}.json"
        if not image_path.exists() or not metadata_path.exists():
            pending.append(species_id)
            continue
        warnings = []
        try:
            metadata = json.loads(metadata_path.read_text())
            if metadata.get("id", species_id) != species_id:
                raise ValueError("metadata ID mismatch")
            qa = metadata.get("visualQA")
            if not qa or (isinstance(qa, str) and not qa.lower().startswith("passed")):
                raise ValueError("visualQA must explicitly record passed manual inspection")
            with Image.open(image_path) as image:
                metrics = measure(image)
            contact = contact_metadata(metadata, metrics, species_id, warnings)
            entry = {"image": image_path.relative_to(root).as_posix(), "facing": "left", "contact": contact}
            if "fit" in metadata:
                if not isinstance(metadata["fit"], dict):
                    raise ValueError("fit must be an object")
                entry["fit"] = metadata["fit"]
            species[species_id] = entry
            details[species_id] = {**metrics, "contact": contact, "warnings": warnings,
                                   "visualQA": qa, "metadata": metadata_path.relative_to(root).as_posix()}
        except (ValueError, KeyError, TypeError, OSError) as error:
            errors.append(f"{species_id}: {error}")
    missing_entries = [entry["name"] for entry in entries if entry.get("species") not in species]
    if args.complete and pending:
        errors.append("incomplete release: missing " + ", ".join(pending))
    if args.complete and len(species) != 29:
        errors.append(f"incomplete release: only {len(species)}/29 validated species")
    manifest = {"version": VERSION, "species": species}
    report = {"version": VERSION, "complete": len(species) == 29 and not errors,
              "counts": {"catalogSpecies": len(ids), "catalogEntries": len(entries),
                         "validatedSpecies": len(species), "coveredEntries": len(entries) - len(missing_entries),
                         "pendingSpecies": len(pending), "errors": len(errors)},
              "sharedSpeciesImages": True,
              "pendingCatalogSpecies": pending, "pendingCatalogEntries": missing_entries,
              "errors": errors, "species": details}
    sources.mkdir(parents=True, exist_ok=True)
    (sources / "validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    if not errors:
        output.mkdir(parents=True, exist_ok=True)
        javascript = "/* Generated by tools/build_side_mutants_manifest.py; do not edit. */\n"
        javascript += "(function(root){\n'use strict';\nconst manifest=" + json.dumps(manifest, ensure_ascii=False, separators=(",", ":")) + ";\n"
        javascript += "if(root)root.CombatMutantsSide=manifest;\nif(typeof module==='object'&&module.exports)module.exports=manifest;\n})(typeof window!=='undefined'?window:typeof globalThis!=='undefined'?globalThis:null);\n"
        (output / "manifest.js").write_text(javascript)
    print(f"{len(species)}/29 validated species; {len(entries)-len(missing_entries)}/57 catalog entries; {len(pending)} pending")
    for error in errors:
        print("ERROR:", error)
    raise SystemExit(1 if errors else 0)


if __name__ == "__main__":
    main()
