#!/usr/bin/env python3
"""Build 3 hurt + 3 attack CC0 creature designs for each of 29 mutant species.

Requires numpy, scipy, ffmpeg and py7zr. Raw archives/recordings stay outside git.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import datetime
import functools
import hashlib
import json
import math
from pathlib import Path, PurePosixPath
import subprocess
import sys
import urllib.request
import zipfile

import numpy as np
from scipy.signal import butter, resample, sosfilt

ROOT = Path(__file__).resolve().parents[1]
RATE = 44100
CC0 = "https://creativecommons.org/publicdomain/zero/1.0/"
SOURCES = {
    "creatures1": ("80 CC0 creature SFX", "rubberduck", "80-cc0-creature-sfx", "80-CC0-creature-SFX_0.zip", "creatures1.zip", "5d4002eea42f278e76543bb36e8ddd2cb978588a13271984191d8228f5d26768"),
    "creatures2": ("80 CC0 creture SFX #2", "rubberduck", "80-cc0-creture-sfx-2", "80-CC0-creature-sfx-2.zip", "creatures2.zip", "6d251aeaaaa9c2fffed8fc2f64bab3104725ceabf9259a8441994e7a20cfe22f"),
    "ogrebane1": ("Monster Sound Effects Pack", "Ogrebane", "monster-sound-effects-pack", "monster_sfx_pack.zip", "ogrebane1.zip", "f39c5ae356b1fc01284057ee48e35ec1a52fcc84bfa959b77d0a696adc8459e4"),
    "ogrebane2": ("Monster Sound Effects 2", "Ogrebane", "monster-sound-effects-2", "monster_sfx_pack_2.zip", "ogrebane2.zip", "8d9831e5596446ebafb8e6a958e757f07cbd385f9e417b4d9704d63a05a2cd63"),
    "dogs": ("Dog sounds", "pauliuw", "dog-sounds", "dog.7z", "dogs.7z", "ecee65b849048790e963952dd15c74889c89d7c948a629e041caa631886d7662"),
    "dogsnarls": ("Dog Snarl Grunt Grumble", "Iwan 'qubodup' Gabovitch", "dog-snarl-grunt-grumble", "dog_0.7z", "dogsnarls.7z", "fbd39c35b8743651f48e423d61ca3cee4e67f33ae3a28b5ef4eef0dd46bb043e"),
    "rats": ("Squeaky Rat", "Iwan 'qubodup' Gabovitch; underlying CC0 recordings by Zabuhailo and moneykube", "squeaky-rat", "qubodupSqueakyRat.7z", "rats.7z", "966649ba0e136ec2d473623e15d11710b7fcc8f73a30897758453e8d43bb75a7"),
}
LOOSE_SOURCES = {
    "snarls/monster-snarls.ogg": ("Monster snarls", "Darsycho", "monster-snarls", "monster-snarls_0.ogg", "7401193d0cc5eb193379cf326c8868d6823a284ebc32ffaa298c1a94d2e25994"),
    "snarls/monster-snarls-2.ogg": ("Monster snarls", "Darsycho", "monster-snarls", "monster-snarls-2_0.ogg", "dbc7b5e621892b5dbc27ee25230b57daaddbc83daadfb20131988b7367f967e1"),
    "snarls/monsters-snarls-3.ogg": ("Monster snarls", "Darsycho", "monster-snarls", "monsters-snarls-3_0.ogg", "5917d2697b8688b2c59e592d448d473ae0eeaed83802541ebd19bc87f97fe8a7"),
    "snarls/monster-snarl-attack.ogg": ("Monster snarls", "Darsycho", "monster-snarls", "monster-snarl-attack.ogg", "34bf1ceef265725abf00ab3263bbbb492792e126bb1619addd4a5d3ad123347f"),
    "snarls/monster-snarl-5.ogg": ("Monster snarls", "Darsycho", "monster-snarls", "monster-snarl-5.ogg", "aeaf9ab0f25cb8b035a3257913206afd8ba33d47876106291d38dfac7e5c07aa"),
    "deep/monster_roar.wav": ("CC0 Deep Monster Roar", "trazzz123", "cc0-deep-monster-roar", "monster_roar.wav", "040d2841619c732098c30a638731317d13d7647e5ce1a75a3246219ce4b162ff"),
}


def c(pack, kind, *numbers):
    return [f"creatures{pack}/{kind}_{n:02}.ogg" for n in numbers]


def o(pack, *numbers):
    return [f"ogrebane{pack}/monster-{n}.wav" for n in numbers]


RAT = "rats/qubodupSqueakyRat/qubodupSqueakyRat"
DOG = "dogs/Dog/"
SNARL = "dogsnarls/dog/"
PREDATOR = ["snarls/monster-snarl-attack.ogg@0.0:0.82", "snarls/monsters-snarls-3.ogg@0.5:1.35", "snarls/monster-snarl-5.ogg@0.3:1.15"]
# key, localized name, native maximum species tier, character, pitch semitones,
# three separate hurt takes, three separate attack takes. Male/female share it.
PROFILES = [
    ("tushkan", "Тушкан", 0, "tiny rodent squeak", 2.4, [RAT+"Pain.flac"]+c(1,"bug",1,2), [RAT+"Attack.flac"]+c(1,"bug",3,4)),
    ("blind-dog", "Слепая собака", 2, "light canine yelp and bark", .6, [DOG+"Sad Dog.wav@0.3:1.1", DOG+"Sad Dog.wav@2.2:3.0", SNARL+"dog-grumble.flac"], [DOG+"Dog Bark.wav", DOG+"Dog Bark 2.wav", DOG+"Dog Bark 3.wav"]),
    ("chernobyl-dog", "Чернобыльский пёс", 2, "raspy canine", -1.2, [SNARL+"dog-snarl.flac", SNARL+"dog-growl.flac", DOG+"Sad Dog 1.wav@1.2:2.0"], [DOG+"Dog Bark 2.wav", DOG+"Dog Bark 3.wav", DOG+"Dog Bark.wav"]),
    ("krakozyabra", "Кракозябра", 4, "dry croaking quadruped", -1.5, c(1,"hurt",2,4,5), c(2,"attack",2,3,4)),
    ("flesh", "Плоть", 4, "nasal guttural swine mutant", -2.4, c(1,"grunt",1,3,5), c(1,"burp",1,2)+c(1,"troll",1)),
    ("boar", "Боров", 6, "heavy snorting swine mutant", -4.0, c(1,"grunt",2,4)+c(2,"grunt",8), c(1,"roar",1,3)+c(2,"grunt",7)),
    ("isotope", "Изотоп", 6, "wet unstable creature", -1.1, c(1,"alien",1,2,5), c(2,"alien",7,8,9)),
    ("hinge", "Шарнир", 8, "clattering jointed creature", -3.0, c(2,"monster",9,10,11), c(2,"attack",2,3,4)),
    ("zombie", "Зомби", 8, "hollow decayed humanoid", -1.8, o(1,3,4,5), o(1,7,9,10)),
    ("pseudodog", "Псевдо собака", 10, "deep predatory canine", -3.2, [SNARL+"dog-growl.flac"]+c(2,"monster",12,15), PREDATOR),
    ("lynx", "Рысь", 10, "sharp feline-like rasp", 1.4, c(2,"monster",13,14,15), ["snarls/monster-snarls.ogg@0.05:0.85", "snarls/monster-snarls-2.ogg@1.0:1.7", "snarls/monsters-snarls-3.ogg@2.8:3.6"]),
    ("chupacabra", "Чупакабра", 12, "dry toothy predator", -.5, c(1,"monster",2,3,6), o(2,3,4,7)),
    ("psydog", "Пси собака", 12, "psychic canine resonance", -3.8, [SNARL+"dog-grumble.flac", SNARL+"dog-growl.flac", SNARL+"dog-snarl.flac"], [DOG+"Dog Bark.wav", DOG+"Dog Bark 3.wav", PREDATOR[0]]),
    ("bayun", "Кот Баюн", 14, "resonant psychic feline-like growl", -.6, c(2,"grunt",6,7,9), c(2,"alien",10,11,12)),
    ("snork", "Снорк", 14, "strangled masked rasp", -2.5, o(2,5,6,8), o(1,1,6,8)),
    ("stregun", "Стрегун", 16, "coarse clawed quadruped", -3.7, c(2,"monster",8,12,18), c(1,"monster",1,4,7)),
    ("owl", "Филин", 16, "piercing avian-like humanoid screech", 1.8, c(1,"scream",1,2)+c(2,"monster",19), c(2,"roar",4,5,6)),
    ("bloodsucker", "Кровосос", 18, "wet guttural predator", -4.6, c(2,"monster",16,17,18), PREDATOR),
    ("poltergeist", "Полтергейст", 18, "airborne spectral shriek", -3.2, c(1,"alien",3,4)+c(2,"alien",7), c(2,"alien",9,10,12)),
    ("fire-poltergeist", "Огненный полтергейст", 20, "hot airy spectral rasp", -4.1, c(1,"weird",3)+c(2,"weird",7,9), c(1,"spit",1,2,3)),
    ("fracture", "Излом", 20, "twisted gravelly humanoid", -4.5, o(2,9,10,11), o(2,12,13,14)),
    ("burer", "Бюрер", 22, "compact heavy throat and psychic rumble", -5.0, c(1,"troll",1,2,3), o(2,15,16,17)),
    ("moose", "Лось", 22, "massive throaty bellow", -7.0, c(1,"roar",2)+c(2,"roar",4,5), PREDATOR),
    ("controller", "Контролёр", 24, "deep dissonant psychic humanoid", -5.8, c(2,"monster",19,20)+o(2,1), c(1,"alien",1,3,6)),
    ("stronglav", "Стронглав", 24, "giant bloodsucker wet chest roar", -8.3, o(1,7,8,9), [PREDATOR[0], "snarls/monster-snarls-2.ogg@2.7:3.55", PREDATOR[2]]),
    ("chimera", "Химера", 26, "large layered predatory roar", -8.6, o(2,3,11,16), PREDATOR),
    ("electrochimera", "Электро химера", 26, "large electrically vibrating predator", -8.1, c(2,"roar",4,5,6), ["snarls/monster-snarls.ogg@1.4:2.25", "snarls/monsters-snarls-3.ogg@2.8:3.65", "snarls/monster-snarl-5.ogg@1.9:2.8"]),
    ("observer", "Наблюдатель", 28, "ominous hollow resonant observer", -6.9, c(2,"alien",7,8,10), c(2,"monster",17,19,20)),
    ("pseudogiant", "Псевдогигант", 28, "heaviest low chest bellow", -10.2, c(2,"roar",4,5,6), ["snarls/monster-snarls.ogg@0.05:0.95", "snarls/monsters-snarls-3.ogg@.5:1.4", "snarls/monster-snarl-5.ogg@.3:1.2"]),
]
PSYCHIC = {"psydog", "bayun", "poltergeist", "fire-poltergeist", "controller", "observer", "burer"}
GIANTS = {"moose", "stronglav", "chimera", "electrochimera", "pseudogiant"}
WET = {"bloodsucker", "stronglav", "isotope", "flesh"}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def download(url, path, expected):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "MutantAudioBuilder/1.0"}), timeout=90) as r:
            path.write_bytes(r.read())
            path.with_name(path.name + ".download.json").write_text(json.dumps({"url": url, "downloaded_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(), "last_modified": r.headers.get("Last-Modified")}, indent=2))
    if sha(path.read_bytes()) != expected:
        raise RuntimeError(f"Original source changed: {path.name}")


def prepare_sources(cache):
    records = []
    for key, (title, creator, page, remote, local, checksum) in SOURCES.items():
        url = "https://opengameart.org/sites/default/files/" + remote
        archive = cache / local
        download(url, archive, checksum)
        directory = cache / key
        directory.mkdir(exist_ok=True)
        if local.endswith(".zip"):
            with zipfile.ZipFile(archive) as z:
                for member in z.namelist():
                    if member.lower().endswith((".wav", ".ogg", ".flac")) and not member.startswith("__MACOSX"):
                        (directory / PurePosixPath(member).name).write_bytes(z.read(member))
        elif not any(directory.rglob("*.flac")) and not any(directory.rglob("*.wav")):
            try:
                import py7zr
            except ImportError:
                local_deps = ROOT.parent / "audio-source-cache/python-deps"
                sys.path.insert(0, str(local_deps))
                import py7zr
            with py7zr.SevenZipFile(archive) as z:
                assert all(".." not in PurePosixPath(n).parts and not n.startswith("/") for n in z.getnames())
                z.extractall(path=directory)
        meta_path = archive.with_name(archive.name + ".download.json")
        records.append({"id": key, "title": title, "creator": creator, "source_page": "https://opengameart.org/content/" + page,
                        "download_url": url, "license": "CC0-1.0", "license_url": CC0, "original_sha256": checksum,
                        "original_bytes": archive.stat().st_size, "download": json.loads(meta_path.read_text()) if meta_path.exists() else {},
                        "license_checked_on": "2026-09-29"})
    for local, (title, creator, page, remote, checksum) in LOOSE_SOURCES.items():
        path = cache / local
        url = "https://opengameart.org/sites/default/files/" + remote
        download(url, path, checksum)
        meta_path = path.with_name(path.name + ".download.json")
        records.append({"id": local, "title": title, "creator": creator, "source_page": "https://opengameart.org/content/" + page,
                        "download_url": url, "license": "CC0-1.0", "license_url": CC0, "original_sha256": checksum,
                        "original_bytes": path.stat().st_size, "download": json.loads(meta_path.read_text()) if meta_path.exists() else {},
                        "license_checked_on": "2026-09-29"})
    return records


@functools.lru_cache(maxsize=256)
def decode(path):
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(RATE), "-f", "f32le", "pipe:1"])
    return np.frombuffer(raw, dtype="<f4").copy()


def asset_segment(cache, reference, pitch, event):
    relative, _, window = reference.partition("@")
    original = decode(str(cache / relative))
    lo, hi = (0, len(original)) if not window else tuple(round(float(v) * RATE) for v in window.split(":"))
    hi = min(hi, len(original))
    piece = original[lo:hi].copy()
    active = np.flatnonzero(np.abs(piece) >= float(np.max(np.abs(piece))) * .06)
    start = max(0, int(active[0]) - round(.008 * RATE))
    end = min(len(piece), int(active[-1]) + round(.05 * RATE))
    piece = piece[start:end]
    ratio = 2 ** (pitch / 12)
    piece = resample(piece, max(1, round(len(piece) / ratio))).astype(np.float32)
    if event == "attack":
        # Crop wind-up before the first strong accent, ensuring a prompt lunge.
        accent = int(np.flatnonzero(np.abs(piece) >= float(np.max(np.abs(piece))) * .35)[0])
        skipped = max(0, accent - round(.015 * RATE))
        piece = piece[skipped:]
    else:
        skipped = 0
    source_id = relative if relative in LOSE_KEYS else relative.split("/")[0]
    if relative.startswith("ogrebane"):
        pack = relative.split("/")[0]
        archive_member = ("monster_sfx_pack/" if pack == "ogrebane1" else "monster_sfx_pack_2/") + PurePosixPath(relative).name
    else:
        archive_member = relative.split("/", 1)[1] if source_id in SOURCES else None
    return piece, {"reference": reference, "source_id": source_id, "original_relative_file": relative,
                   "archive_member": archive_member, "original_sha256": sha((cache / relative).read_bytes()),
                   "original_duration_seconds": len(original) / RATE,
                   "cut_start_seconds": (lo + start) / RATE, "cut_end_seconds": (lo + end) / RATE,
                   "pitch_semitones": pitch, "pitch_method": "resampling, speed changes with pitch",
                   "post_pitch_attack_lead_removed_seconds": skipped / RATE}


LOSE_KEYS = set(LOOSE_SOURCES)


def normalized(piece):
    return piece / max(float(np.max(np.abs(piece))), 1e-9)


def fit(piece, n):
    return np.pad(piece[:n], (0, max(0, n - len(piece))))


def encode_mp3(samples, path):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(RATE), "-ac", "1", "-i", "pipe:0",
                    "-map_metadata", "-1", "-c:a", "libmp3lame", "-b:a", "128k", "-id3v2_version", "0", "-write_xing", "1", str(path)],
                   input=np.asarray(samples, dtype="<f4").tobytes(), check=True)


def build_clip(cache, output, profile, event, variant):
    key, name, tier, character, pitch, hurts, attacks = profile
    refs = hurts if event == "hurt" else attacks
    primary_ref = refs[variant - 1]
    # Each of the three takes has its own source; small within-species tuning
    # strengthens variation while keeping male/female identity shared.
    actual_pitch = pitch + (variant - 2) * .27 + (.4 if event == "hurt" else -.25)
    primary, primary_meta = asset_segment(cache, primary_ref, actual_pitch, event)
    max_seconds = (1.12 if key in GIANTS else .93) if event == "attack" else (1.06 if key in GIANTS else .87)
    length = max(round(.30 * RATE), min(round(max_seconds * RATE), len(primary) + round(.055 * RATE)))
    main = fit(normalized(primary), length)
    source_meta = [{**primary_meta, "role": "primary", "mix_gain": 1.0}]
    # Family-specific secondary material supplies body/texture without turning
    # every creature into the same growl. Low-tier animals remain essentially dry.
    secondary_ref = None
    body_amount = 0.0
    if key in GIANTS:
        secondary_ref = f"deep/monster_roar.wav@{.2 + (variant - 1) * 1.15:.2f}:{1.02 + (variant - 1) * 1.15:.2f}"
        body_amount = .23 + tier / 180
    elif key in WET:
        secondary_ref = c(2, "slime", (variant + (0 if event == "hurt" else 3)))[0]
        body_amount = .12 + tier / 220
    elif key in PSYCHIC:
        secondary_ref = c(2, "alien", variant + 8)[0]
        body_amount = .13 + tier / 220
    elif tier >= 8:
        secondary_ref = o(2, (variant + (8 if event == "hurt" else 11)))[0]
        body_amount = .06 + tier / 260
    if secondary_ref:
        secondary, meta = asset_segment(cache, secondary_ref, min(-2, pitch - 1.8), event)
        secondary = fit(normalized(secondary), length)
        if key in GIANTS:
            secondary = sosfilt(butter(2, 380, btype="lowpass", fs=RATE, output="sos"), secondary)
        main += secondary * body_amount
        source_meta.append({**meta, "role": "body/texture", "mix_gain": body_amount})
    main -= np.mean(main)
    highpass = 45 if key in GIANTS else 70 if tier >= 12 else 100
    main = sosfilt(butter(2, highpass, btype="highpass", fs=RATE, output="sos"), main)
    lowpass = 4100 if key in GIANTS else 5700 if tier >= 16 else 7600
    main = sosfilt(butter(2, lowpass, btype="lowpass", fs=RATE, output="sos"), main)
    saturation = .75 + tier / 32
    main = np.tanh(main * saturation) / math.tanh(saturation)
    t = np.arange(length) / RATE
    ring_hz = 0
    if key in PSYCHIC:
        ring_hz = 31 + variant * 7
        main = main * (.83 + .17 * np.cos(2 * math.pi * ring_hz * t))
    elif key == "electrochimera":
        ring_hz = 72 + variant * 11
        main = main * (.69 + .31 * np.cos(2 * math.pi * ring_hz * t))
    delay_ms = 0
    if key in GIANTS or key in PSYCHIC:
        delay_ms = 34 if key in GIANTS else 47
        delay = round(delay_ms / 1000 * RATE)
        main[delay:] += main[:-delay].copy() * (.12 if key in GIANTS else .18)
    fade_in = round(.006 * RATE)
    fade_out = round(.08 * RATE)
    main[:fade_in] *= np.linspace(0, 1, fade_in)
    main[-fade_out:] *= np.linspace(1, 0, fade_out)
    path = output / f"{key}-{event}-{variant}.mp3"
    target = 10 ** (-6 / 20)
    gain = target / float(np.max(np.abs(main)))
    best = None
    for _ in range(5):
        encode_mp3(main * gain, path)
        decode.cache_clear()  # outputs were rewritten; never reuse stale PCM.
        decoded = decode(str(path))
        peak = float(np.max(np.abs(decoded)))
        error = 20 * math.log10(peak / target)
        if best is None or abs(error) < best[0]:
            best = (abs(error), path.read_bytes(), decoded.copy(), gain)
        if abs(error) < .08:
            break
        gain *= target / peak
    _, encoded, decoded, gain = best
    path.write_bytes(encoded)
    peak = float(np.max(np.abs(decoded)))
    rms = float(np.sqrt(np.mean(decoded * decoded)))
    peak_db = 20 * math.log10(peak)
    onset = int(np.flatnonzero(np.abs(decoded) >= peak * .03)[0]) / RATE
    accent = int(np.flatnonzero(np.abs(decoded) >= peak * .35)[0]) / RATE
    duration = len(decoded) / RATE
    assert .29 <= duration <= 1.21, (path.name, duration)
    assert abs(peak_db + 6) < .65, (path.name, peak_db)
    assert rms > .008 and onset < .09, (path.name, rms, onset)
    assert abs(float(decoded[-1])) < .002, (path.name, "hard endpoint")
    assert event != "attack" or accent < .115, (path.name, "attack accent is late", accent)
    return {"path": str(path.relative_to(ROOT)), "sha256": sha(encoded),
            "decoded_pcm_sha256": sha(np.asarray(decoded, dtype="<f4").tobytes()), "bytes": len(encoded),
            "species": key, "species_name": name, "event": event, "variant": variant,
            "duration_seconds": duration, "sources": source_meta,
            "processing": {"sample_rate": RATE, "channels": 1, "codec": "MP3 libmp3lame", "bitrate_bps": 128000,
                           "highpass_hz": highpass, "lowpass_hz": lowpass, "saturation_drive": saturation,
                           "ring_modulation_hz": ring_hz, "short_body_delay_ms": delay_ms,
                           "fade_in_seconds": fade_in / RATE, "fade_out_seconds": fade_out / RATE,
                           "normalization_gain_db": 20 * math.log10(gain)},
            "qa": {"decoded_peak_dbfs": peak_db, "rms_dbfs": 20 * math.log10(rms),
                   "onset_seconds": onset, "first_strong_accent_seconds": accent, "final_sample": float(decoded[-1])}}


def write_docs(manifest):
    lines = ["# Mutant combat audio", "", "29 species, 3 hurt and 3 attack variants each: 174 unique mono MP3 files.",
             "Male and female entries share the same species bank. This is a designed", "adaptation of licensed creature/animal sounds, not recordings of fictional mutants.", "",
             "All sources offer CC0 1.0: <" + CC0 + ">. Credits are preserved voluntarily.",
             "No proprietary game sounds or unlicensed STALKER recordings are included.", "", "## Sources", ""]
    seen = set()
    for s in manifest["sources"]:
        if s["source_page"] in seen:
            continue
        seen.add(s["source_page"])
        lines += [f"- **{s['title']}**, {s['creator']}: <{s['source_page']}>."]
    lines += ["", "rubberduck states that most first-pack creature sounds are mouth performances", "processed with filters. Dog sources include actual recordings; other monster", "sources are designed effects. Squeaky Rat is an edited CC0 composite by qubodup", "from Zabuhailo/moneykube material as credited on its source page.", "",
              "## Species design", "", "Native maximum catalog tier guides depth and texture. It is not the dynamically", "scaled raid tier. Greater danger does not increase peak loudness: all clips target", "-6 dBFS. Large species receive a low chest-roar layer; psychic species receive", "short resonance/modulation; wet creatures receive restrained organic texture.", "",
              "| Species | Native max tier | Character | Pitch base |", "|---|---:|---|---:|"]
    for p in manifest["species"]:
        lines.append(f"| {p['name']} (`{p['id']}`) | {p['native_max_tier']} | {p['character']} | {p['base_pitch_semitones']:+.1f} st |")
    lines += ["", "Within every species/event, all three variants use different primary files or", "different explicit source intervals. Cross-species reuse is deliberate sound design", "with different pitch, body layers and processing. Files are not renamed duplicates.", "",
              "## Processing and QA", "", "Original archive/download SHA-256, creators, URLs, licenses, member identities,", "source intervals, pitch changes, mixes, filters, encoding, output and decoded PCM", "hashes are in `audio/mutant-sources.json`. Its `clips` array contains `{path, sha256}`", "for every output; `bank[species].hurt/attack` provide the runtime paths.", "",
              "Processing: mono 44.1 kHz; short onset preroll; speed-coupled pitch conversion;", "species-specific CC0 body layers; high/low-pass cleanup; soft saturation; restrained", "resonance where appropriate; 6 ms fade-in / 80 ms fade-out; 128 kbps MP3 with decoded", "peak normalization. Attack wind-up is trimmed so the first strong accent is near", "the beginning. Exact transformations are preserved per clip.", "",
              f"Total bank: **{manifest['total_output_bytes']:,} bytes**. Duration range: " + f"**{manifest['qa']['duration_min_seconds']:.3f}–{manifest['qa']['duration_max_seconds']:.3f} s**.",
              "All outputs are decoded and checked for finite non-silent PCM, unique PCM hashes,", "peak headroom, early onset/attack accents and smooth endpoints. Waveform QA supplements", "these checks. Auditory playback is unavailable in the build environment, so no", "listening verification or exact animal-species authenticity is claimed.", "",
              "## Rebuild", "", "```sh", "python tools/build_mutant_sounds.py --cache ../audio-source-cache/mutants", "```", "",
              "Requires Python 3, NumPy, SciPy, py7zr and FFmpeg with libmp3lame. The builder", "checks original source hashes. Raw archives and recordings remain outside git.", "It does not edit combat logic, soundtrack playback, human NPC reactions or weapon sounds.", ""]
    (ROOT / "audio/MUTANT_SOURCES.md").write_text("\n".join(lines))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, default=ROOT.parent / "audio-source-cache/mutants")
    parser.add_argument("--species", help="Only build comma-separated species; useful during QA, does not write final manifests")
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    source_records = prepare_sources(args.cache)
    output = ROOT / "audio/mutants"
    output.mkdir(parents=True, exist_ok=True)
    chosen = set(args.species.split(",")) if args.species else None
    clips, species, bank = [], [], {}
    for profile in PROFILES:
        key, name, tier, character, pitch, hurt, attack = profile
        if chosen and key not in chosen:
            continue
        assert len(set(hurt)) == 3 and len(set(attack)) == 3, key
        bank[key] = {"hurt": [], "attack": []}
        species.append({"id": key, "name": name, "native_max_tier": tier, "character": character,
                        "base_pitch_semitones": pitch, "sexes_share_bank": True})
        for event in ["hurt", "attack"]:
            for variant in range(1, 4):
                clip = build_clip(args.cache, output, profile, event, variant)
                clips.append(clip)
                bank[key][event].append(clip["path"])
        print(key, "6 clips", sum(c["bytes"] for c in clips if c["species"] == key), "bytes", flush=True)
    assert len({c["sha256"] for c in clips}) == len(clips)
    assert len({c["decoded_pcm_sha256"] for c in clips}) == len(clips)
    if chosen:
        print("Partial QA build complete; final manifests unchanged.")
        return
    assert len(clips) == 174 and len(species) == 29
    manifest = {"schema_version": 1, "created_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "license": "CC0-1.0", "license_url": CC0,
                "notice": "Original per-species sound designs derived from licensed creature and animal sources; not authentic recordings of fictional mutants. Male/female catalog entries share each species bank.",
                "qa_limitations": "Decoded signal/waveform checks; audio input is unavailable, so listening verification is not claimed.",
                "build": {"script": "tools/build_mutant_sounds.py", "ffmpeg": subprocess.check_output(["ffmpeg", "-version"], text=True).splitlines()[0]},
                "sources": source_records, "species": species, "clips": clips, "bank": bank,
                "total_output_bytes": sum(c["bytes"] for c in clips),
                "qa": {"unique_encoded_files": len(clips), "unique_decoded_pcm": len(clips),
                       "duration_min_seconds": min(c["duration_seconds"] for c in clips),
                       "duration_max_seconds": max(c["duration_seconds"] for c in clips),
                       "peak_min_dbfs": min(c["qa"]["decoded_peak_dbfs"] for c in clips),
                       "peak_max_dbfs": max(c["qa"]["decoded_peak_dbfs"] for c in clips),
                       "max_attack_accent_seconds": max(c["qa"]["first_strong_accent_seconds"] for c in clips if c["event"] == "attack")}}
    (ROOT / "audio/mutant-sources.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    write_docs(manifest)
    print(json.dumps({"total_output_bytes": manifest["total_output_bytes"], "qa": manifest["qa"]}))


if __name__ == "__main__":
    main()
