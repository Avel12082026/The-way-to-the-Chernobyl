#!/usr/bin/env python3
"""Rebuild the CC0 gunshot bank. Requires Python 3, numpy, scipy and ffmpeg.

Raw recordings remain outside the repository. Outputs and their full provenance
are written to audio/gunshots and audio/gunshot-sources.json.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import datetime
import hashlib
import json
import math
import subprocess
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
from scipy.signal import butter, find_peaks, sosfilt

ROOT = Path(__file__).resolve().parents[1]
SAMPLE_RATE = 44100
CC0 = "https://creativecommons.org/publicdomain/zero/1.0/"
FFSL_PAGE = "https://opengameart.org/node/21826"
FFSL_BASE = "https://raw.githubusercontent.com/buddingmonkey/FreeFirearmsSFXLibrary/main/Prepared%20SFX/"
FFSL_AUTHORS = ["Ben Jaszczak", "Brian Nelson", "Kevin Heras", "Matthew Nanney"]
RECORDINGS = [
    ("pistol45", "1911/A_42P.wav", "1911 .45 pistol"),
    ("pistol380", "Bersa/F_47P.wav", "Bersa .380 pistol"),
    ("pistol9", "Walther PPQ/X_39P.wav", "Walther PPQ 9 mm pistol"),
    ("revolver38", "Smith & Wesson 642/V_27P.wav", "Smith & Wesson 642 .38 Special revolver"),
    ("ak762", "AK-47/C_28P.wav", "AK-47 7.62x39 mm rifle"),
    ("ar556", "AR-15/D_32P.wav", "AR-15 / M4 .223 / 5.56x45 mm rifle"),
    ("smg9", "Carl Gustav M45/G_31P.wav", "Carl Gustav M45 9 mm submachine gun"),
    ("ppsh", "PPSh/P_30P.wav", "PPSh 7.62x25 mm submachine gun"),
    ("shotgun_cd", "CD/H_21P.wav", "Charles Daly 12 gauge pump-action shotgun"),
    ("shotgun_winchester", "Model 12/K_22P.wav", "Winchester Model 12 12 gauge pump-action shotgun"),
    ("shotgun_mossberg", "Mossberg/N_30P.wav", "Mossberg Model 190 12 gauge bolt-action shotgun"),
    ("shotgun_benelli", "Nova/O_21P.wav", "Benelli Nova 12 gauge pump-action shotgun"),
    ("mosin", "Mosin Nagant/M_21P.wav", "Mosin Nagant 7.62x54 mm bolt-action rifle"),
    ("sks", "SKS/U_14P.wav", "Norinco SKS 7.62x39 mm carbine"),
    ("rifle300", "Savage 10 .300 Blackout/T_27P.wav", "Savage Model 10 .300 AAC Blackout bolt-action rifle"),
    ("rifle3006", "Tikka/W_29P.wav", "Tikka T3 .30-06 bolt-action rifle"),
]
SOURCES = [{"key": key, "url": FFSL_BASE + urllib.parse.quote(path, safe="/"),
            "original_filename": path, "recorded_weapon": description,
            "creator": FFSL_AUTHORS, "source_page": FFSL_PAGE,
            "collection": "The Free Firearm Sound Library", "kind": "field recording"}
           for key, path, description in RECORDINGS]
SOURCES += [
    {"key": "suppressed", "url": "https://opengameart.org/sites/default/files/silencer.wav",
     "original_filename": "silencer.wav", "recorded_weapon": None, "creator": ["bart"],
     "source_page": "https://opengameart.org/content/hollywood-style-pistol-silencer-sound-effect",
     "collection": "Hollywood-style pistol silencer sound effect", "kind": "designed silencer effect"},
    {"key": "gauss", "url": "https://opengameart.org/sites/default/files/doomsday_laser_cannon_short.wav",
     "original_filename": "doomsday_laser_cannon_short.wav", "recorded_weapon": None,
     "creator": ["TAD"], "source_page": "https://opengameart.org/content/doomsday-laser-cannon-sound-effect",
     "collection": "Doomsday Laser Cannon Sound Effect", "kind": "designed fictional energy effect"},
]

# Reviewed shot-peak locations in the original recordings, in seconds. A second
# variation is a different recorded shot, never a pitch-shifted duplicate.
SHOT_ANCHORS = {
    "pistol45": [.94, 5.00], "pistol380": [.33, 4.41],
    "pistol9": [1.40, 6.44], "revolver38": [.80, 6.21],
    "ak762": [.61, 3.26], "ar556": [.70, 5.64],
    "smg9": [.31, 3.50], "ppsh": [.97, 4.38],
    "shotgun_cd": [.46, 3.07], "shotgun_winchester": [.84, 7.44],
    "shotgun_mossberg": [1.70, 4.96], "shotgun_benelli": [.43, 3.46],
    "mosin": [1.03, 5.02], "sks": [3.57, 6.75],
    "rifle300": [.95, 4.96], "rifle3006": [.58, 5.67],
}


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def download(source, cache):
    target = cache / (source["key"] + ".wav")
    meta_path = cache / (source["key"] + ".download.json")
    if not target.exists():
        request = urllib.request.Request(source["url"], headers={"User-Agent": "GunshotBankBuilder/1.0"})
        with urllib.request.urlopen(request, timeout=120) as response:
            data = response.read()
            metadata = {"downloaded_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                        "last_modified": response.headers.get("Last-Modified"), "etag": response.headers.get("ETag")}
        target.write_bytes(data)
        meta_path.write_text(json.dumps(metadata, indent=2) + "\n")
    metadata = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    return source, target, metadata


def decode(path):
    result = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SAMPLE_RATE),
                             "-f", "f32le", "pipe:1"], check=True, capture_output=True)
    return np.frombuffer(result.stdout, dtype="<f4").copy()


def envelope(samples):
    hop = 441  # 10 ms peaks reveal repeated shots and their decay.
    padded = np.pad(samples, (0, (-len(samples)) % hop))
    return np.max(np.abs(padded).reshape(-1, hop), axis=1)


def analyze(source, samples):
    env = envelope(samples)
    peaks, _ = find_peaks(env, height=max(float(env.max()) * .35, .005), distance=50, prominence=float(env.max()) * .25)
    return {"key": source["key"], "seconds": round(len(samples) / SAMPLE_RATE, 5),
            "peak": round(float(np.max(np.abs(samples))), 5),
            "peaks_seconds": [round(float(p) / 100, 3) for p in peaks],
            "peak_levels": [round(float(env[p]), 4) for p in peaks]}


def cut_positions(source, samples):
    key = source["key"]
    if key == "suppressed":
        return [(0, round(.65 * SAMPLE_RATE), "Complete designed discharge and decay; only trailing silence removed.")]
    if key == "gauss":
        return [(round(1.992 * SAMPLE_RATE), len(samples),
                 "Remove 1.992 s charging prelude; retain discharge and the designed energy tail. Final 150 ms faded.")]
    positions = []
    for anchor in SHOT_ANCHORS[key]:
        lo = max(0, round((anchor - .14) * SAMPLE_RATE))
        hi = min(len(samples), round((anchor + .08) * SAMPLE_RATE))
        local = np.abs(samples[lo:hi])
        # The recordings have <0.15% full-scale room noise and abrupt impulses.
        # A 2% local-peak threshold finds the impulse; 8 ms preroll keeps its edge.
        onset = lo + int(np.flatnonzero(local >= float(local.max()) * .02)[0])
        start = max(0, onset - round(.008 * SAMPLE_RATE))
        end = min(len(samples), start + round(1.70 * SAMPLE_RATE))
        positions.append((start, end, "Distinct isolated single shot; 8 ms pre-onset and 1.692 s decay retained."))
    return positions


def encode_mp3(samples, target):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SAMPLE_RATE),
                    "-ac", "1", "-i", "pipe:0", "-map_metadata", "-1", "-c:a", "libmp3lame",
                    "-b:a", "128k", "-ar", str(SAMPLE_RATE), "-ac", "1", "-id3v2_version", "0",
                    "-write_xing", "1", str(target)], input=np.asarray(samples, dtype="<f4").tobytes(), check=True)


def make_clip(source, samples, cut, number, output_dir):
    start, end, note = cut
    clip = samples[start:end].copy()
    dc = float(np.mean(clip))
    clip -= dc
    # A 30 Hz high-pass removes source infrasonic mic movement, especially in
    # the Tikka recording, without removing useful mobile-speaker shot detail.
    clip = sosfilt(butter(2, 30, btype="highpass", fs=SAMPLE_RATE, output="sos"), clip).astype(np.float32)
    # Submillisecond ramp only smooths a nonzero file edge; it ends before the
    # field-recording impulse. Suppressed source has no available preroll.
    fade_in = round((.0005 if source["key"] == "suppressed" else .002) * SAMPLE_RATE)
    fade_out = round((.15 if source["key"] == "gauss" else .09) * SAMPLE_RATE)
    clip[:fade_in] *= np.linspace(0, 1, fade_in, dtype=np.float32)
    clip[-fade_out:] *= np.linspace(1, 0, fade_out, dtype=np.float32)
    target_peak = 10 ** (-3 / 20)
    gain = target_peak / float(np.max(np.abs(clip)))
    path = output_dir / f"{source['key']}-{number}.mp3"
    # Correct encoder overshoot as well as raw PCM level, keeping final MP3
    # playback close to -3 dBFS with generous headroom for mixing under music.
    best = None
    for _ in range(8):
        encode_mp3(clip * gain, path)
        decoded = decode(path)
        decoded_peak = float(np.max(np.abs(decoded)))
        error_db = 20 * math.log10(decoded_peak / target_peak)
        if best is None or abs(error_db) < best[0]:
            best = (abs(error_db), path.read_bytes(), decoded, decoded_peak, gain)
        if abs(error_db) <= .08:
            break
        gain *= target_peak / decoded_peak
    _, encoded, decoded, decoded_peak, gain = best
    path.write_bytes(encoded)
    env = envelope(decoded)
    active = np.flatnonzero(env >= float(env.max()) * .5)
    clusters = []
    for frame in active:
        if not clusters or frame - clusters[-1][-1] > 20:
            clusters.append([int(frame)])
        else:
            clusters[-1].append(int(frame))
    tail = decoded[-round(.02 * SAMPLE_RATE):]
    tail_rms = float(np.sqrt(np.mean(tail * tail)))
    peak_db = 20 * math.log10(decoded_peak)
    onset_sample = int(np.flatnonzero(np.abs(decoded) >= decoded_peak * .02)[0])
    assert decoded_peak < .85, (source["key"], "clip would risk clipping")
    assert abs(peak_db + 3) < .4, (source["key"], "peak normalization did not converge")
    assert len(clusters) == 1, (source["key"], "more than one loud discharge")
    assert onset_sample / SAMPLE_RATE < .04, (source["key"], "late attack")
    assert abs(float(decoded[-1])) < .002, (source["key"], "hard end")
    return {"path": str(path.relative_to(ROOT)), "sha256": sha256(path), "bytes": path.stat().st_size,
            "cut_start_seconds": round(start / SAMPLE_RATE, 7), "cut_end_seconds": round(end / SAMPLE_RATE, 7),
            "duration_seconds": round(len(decoded) / SAMPLE_RATE, 7), "cut_note": note,
            "processing": {"downmix": "ffmpeg stereo-to-mono float32, resample to 44100 Hz",
                           "dc_removed": dc, "highpass": "30 Hz second-order Butterworth, causal",
                           "fade_in_seconds": fade_in / SAMPLE_RATE,
                           "fade_out_seconds": fade_out / SAMPLE_RATE,
                           "gain_db": round(20 * math.log10(gain), 5),
                           "codec": "MP3 libmp3lame", "bitrate_bps": 128000,
                           "sample_rate": SAMPLE_RATE, "channels": 1},
            "qa": {"decoded_peak_dbfs": round(peak_db, 4), "loud_discharge_clusters": len(clusters),
                   "attack_seconds": round(onset_sample / SAMPLE_RATE, 7),
                   "last_20ms_rms_dbfs": round(20 * math.log10(max(tail_rms, 1e-12)), 2),
                   "final_sample": float(decoded[-1])}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, default=ROOT.parent / "audio-source-cache")
    parser.add_argument("--analyze", action="store_true", help="download and report shot candidates without creating clips")
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        records = list(pool.map(lambda source: download(source, args.cache), SOURCES))
    if args.analyze:
        for source, path, metadata in records:
            print(json.dumps(analyze(source, decode(path))))
        return
    manifest_path = ROOT / "audio/gunshot-sources.json"
    existing = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    hashes = {source["key"]: source["original_sha256"] for source in existing.get("sources", [])}
    output_dir = ROOT / "audio/gunshots"
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest = {"schema_version": 1, "created_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "license": "CC0-1.0", "license_url": CC0,
                "notice": "A compact set of real recorded weapon families and designed effects, not authentic recordings of every game weapon. Model mappings may use family/caliber proxies.",
                "source_metadata_csv": "https://raw.githubusercontent.com/buddingmonkey/FreeFirearmsSFXLibrary/main/Prepared%20Master%20Sheet.csv",
                "build": {"script": "tools/build_gunshot_bank.py", "ffmpeg": subprocess.check_output(["ffmpeg", "-version"], text=True).splitlines()[0]},
                "sources": [], "bank": {}}
    for source, path, downloaded in records:
        digest = sha256(path)
        if source["key"] in hashes and hashes[source["key"]] != digest:
            raise SystemExit(f"Original source changed for {source['key']}; review before rebuilding.")
        samples = decode(path)
        clips = [make_clip(source, samples, cut, i + 1, output_dir)
                 for i, cut in enumerate(cut_positions(source, samples))]
        manifest["sources"].append({**source, "license": "CC0-1.0", "license_url": CC0,
                                    "license_checked_on": "2026-09-29", "original_sha256": digest,
                                    "original_bytes": path.stat().st_size, "original_duration_seconds": len(samples) / SAMPLE_RATE,
                                    "download": downloaded, "outputs": clips})
        manifest["bank"][source["key"]] = [clip["path"] for clip in clips]
        print(source["key"], " ".join(clip["path"] for clip in clips), flush=True)
    manifest["total_output_bytes"] = sum(clip["bytes"] for source in manifest["sources"] for clip in source["outputs"])
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print("Total bytes:", manifest["total_output_bytes"])


if __name__ == "__main__":
    main()
