#!/usr/bin/env python3
"""Build short, distinct CC0 human pain reactions (Python/numpy/scipy/ffmpeg)."""
from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import math
from pathlib import Path
import subprocess
import urllib.request
import zipfile

import numpy as np
from scipy.signal import butter, sosfilt

ROOT = Path(__file__).resolve().parents[1]
RATE = 44100
SOURCE_PAGE = "https://opengameart.org/content/male-gruntyelling-sounds"
SOURCE_URL = "https://opengameart.org/sites/default/files/yelling%20sounds.zip"
ARCHIVE_SHA256 = "e9100a4e3b9dcd146993089970dc6097dcf9935fa4683b196040012bad65d67a"
LICENSE_URL = "https://creativecommons.org/publicdomain/zero/1.0/"
SELECTION = [
    ("player-hurt-1", "3grunt1.wav", "vocalist-3"),
    ("player-hurt-2", "3grunt2.wav", "vocalist-3"),
    ("enemy-hurt-1", "1yell1.wav", "vocalist-1"),
    ("enemy-hurt-2", "1yell9.wav", "vocalist-1"),
    ("enemy-hurt-3", "1yell15.wav", "vocalist-1"),
    ("enemy-hurt-4", "2yell1.wav", "vocalist-2"),
    ("enemy-hurt-5", "2yell10.wav", "vocalist-2"),
    ("enemy-hurt-6", "yell12.wav", "vocalist-unprefixed"),
    ("enemy-hurt-7", "yell13.wav", "vocalist-unprefixed"),
    ("enemy-hurt-8", "yell7.wav", "vocalist-unprefixed"),
]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def decode(path):
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(path),
                                   "-ac", "1", "-ar", str(RATE), "-f", "f32le", "pipe:1"])
    return np.frombuffer(raw, dtype="<f4").copy()


def encode(samples, path):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(RATE), "-ac", "1",
                    "-i", "pipe:0", "-map_metadata", "-1", "-c:a", "libmp3lame", "-b:a", "128k",
                    "-ar", str(RATE), "-ac", "1", "-id3v2_version", "0", "-write_xing", "1", str(path)],
                   input=np.asarray(samples, dtype="<f4").tobytes(), check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, default=ROOT.parent / "audio-source-cache/reactions")
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    archive_path = args.cache / "yelling-sounds.zip"
    if not archive_path.exists():
        request = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "CombatReactionsBuilder/1.0"})
        with urllib.request.urlopen(request, timeout=90) as response:
            archive_path.write_bytes(response.read())
    original_archive = archive_path.read_bytes()
    if digest(original_archive) != ARCHIVE_SHA256:
        raise SystemExit("Source archive changed; review source and license before rebuilding.")
    output_dir = ROOT / "audio/reactions"
    output_dir.mkdir(parents=True, exist_ok=True)
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    manifest = {
        "schema_version": 1, "created_utc": now,
        "source": {"title": "Male Grunt/Yelling sounds", "creator": "HaelDB",
                   "source_page": SOURCE_PAGE, "download_url": SOURCE_URL,
                   "license": "CC0-1.0", "license_url": LICENSE_URL,
                   "license_note": "The creator page offers CC0 and OGA-BY 3.0; this bank uses the CC0 option.",
                   "license_checked_on": "2026-09-29", "archive_sha256": ARCHIVE_SHA256,
                   "archive_bytes": len(original_archive),
                   "downloaded_utc": datetime.datetime.fromtimestamp(archive_path.stat().st_mtime, datetime.timezone.utc).isoformat()},
        "selection_note": "Two distinct short grunt recordings for the player, and eight different short reactions from the other three file-prefix groups for human NPCs. No pitch-shifted duplicates. Voice grouping follows source filenames and the author's four-vocalist description.",
        "qa_limitations": "Decoded signal and waveforms checked. Auditory playback was unavailable in the build environment; nonverbal classification follows the creator's grunt/yelling pack description and selected short durations. No generated speech, words or extra sounds were added.",
        "build": {"script": "tools/build_combat_reactions.py",
                  "ffmpeg": subprocess.check_output(["ffmpeg", "-version"], text=True).splitlines()[0]},
        "clips": [], "bank": {"player": [], "enemy": []},
    }
    archive = zipfile.ZipFile(archive_path)
    for key, filename, vocalist in SELECTION:
        member = "yelling sounds/" + filename
        original_bytes = archive.read(member)
        raw_path = args.cache / filename
        raw_path.write_bytes(original_bytes)
        original = decode(raw_path)
        # Retain the full short reaction with 12 ms preroll and 75 ms quiet tail.
        active = np.flatnonzero(np.abs(original) >= float(np.max(np.abs(original))) * .02)
        start = max(0, int(active[0]) - round(.012 * RATE))
        end = min(len(original), int(active[-1]) + round(.075 * RATE))
        clip = original[start:end].copy()
        dc = float(np.mean(clip))
        clip -= dc
        clip = sosfilt(butter(2, 65, btype="highpass", fs=RATE, output="sos"), clip).astype(np.float32)
        fade_in = round(.005 * RATE)
        fade_out = round(.045 * RATE)
        clip[:fade_in] *= np.linspace(0, 1, fade_in)
        clip[-fade_out:] *= np.linspace(1, 0, fade_out)
        peak_target = 10 ** (-6 / 20)
        gain = peak_target / float(np.max(np.abs(clip)))
        path = output_dir / (key + ".mp3")
        best = None
        for _ in range(6):
            encode(clip * gain, path)
            decoded = decode(path)
            peak = float(np.max(np.abs(decoded)))
            error_db = 20 * math.log10(peak / peak_target)
            if best is None or abs(error_db) < best[0]:
                best = (abs(error_db), path.read_bytes(), decoded, gain)
            if abs(error_db) < .08:
                break
            gain *= peak_target / peak
        _, encoded, decoded, gain = best
        path.write_bytes(encoded)
        peak = float(np.max(np.abs(decoded)))
        peak_db = 20 * math.log10(peak)
        onset = int(np.flatnonzero(np.abs(decoded) >= peak * .02)[0]) / RATE
        duration = len(decoded) / RATE
        assert .25 <= duration <= .9, (key, duration)
        assert abs(peak_db + 6) <= .4, (key, peak_db)
        assert abs(float(decoded[-1])) < .002, (key, "hard tail")
        assert onset < .05, (key, onset)
        record = {"key": key, "path": str(path.relative_to(ROOT)), "sha256": digest(encoded), "bytes": len(encoded),
                  "role": "player" if key.startswith("player") else "enemy", "source_vocalist_group": vocalist,
                  "original_archive_member": member, "original_sha256": digest(original_bytes),
                  "original_bytes": len(original_bytes), "original_duration_seconds": len(original) / RATE,
                  "cut_start_seconds": start / RATE, "cut_end_seconds": end / RATE,
                  "duration_seconds": duration,
                  "processing": {"mono": True, "sample_rate": RATE, "codec": "MP3 libmp3lame", "bitrate_bps": 128000,
                                 "dc_removed": dc, "highpass": "65 Hz second-order Butterworth, causal",
                                 "fade_in_seconds": fade_in / RATE, "fade_out_seconds": fade_out / RATE,
                                 "gain_db": 20 * math.log10(gain), "pitch_changed": False},
                  "qa": {"decoded_peak_dbfs": peak_db, "attack_seconds": onset, "final_sample": float(decoded[-1])}}
        manifest["clips"].append(record)
        manifest["bank"][record["role"]].append(record["path"])
        print(key, f"{duration:.4f}s", len(encoded), f"{peak_db:.3f}dBFS", flush=True)
    assert len({clip["sha256"] for clip in manifest["clips"]}) == len(SELECTION)
    manifest["total_output_bytes"] = sum(clip["bytes"] for clip in manifest["clips"])
    (ROOT / "audio/reaction-sources.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print("Total bytes:", manifest["total_output_bytes"])


if __name__ == "__main__":
    main()
