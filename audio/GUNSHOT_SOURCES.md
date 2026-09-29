# Gunshot audio bank

This bank contains **34 compact MP3 clips from 18 CC0 source families**, totalling
945,799 bytes. Each of the 16 recorded firearm families has two different isolated
shots. The suppressed and fictional energy families each have one designed effect.

These are recordings of the models identified below, with family/caliber proxies
used for game weapons that are not present in the source collection. The bank does
**not** claim to contain an authentic recording of every game weapon. Variations
within a recorded family are separate original shots, not duplicated files with
different names. A suppressed effect is a cinematic sound design, and the Gauss
effect is fictional energy audio.

## Sources and permission

All included sources are **CC0 1.0 Universal**:
<https://creativecommons.org/publicdomain/zero/1.0/>.

1. **The Free Firearm Sound Library** — Ben Jaszczak, Brian Nelson, Kevin Heras,
   Matthew Nanney. Source and licensing statement:
   <https://opengameart.org/node/21826>. The source explicitly permits use for
   personal or professional applications without royalties or credit.
   Individual original WAV files were downloaded from the public mirror
   <https://github.com/buddingmonkey/FreeFirearmsSFXLibrary>.
   Original recording descriptions are preserved in
   <https://raw.githubusercontent.com/buddingmonkey/FreeFirearmsSFXLibrary/main/Prepared%20Master%20Sheet.csv>.
2. **Hollywood-style pistol silencer sound effect** — bart.
   <https://opengameart.org/content/hollywood-style-pistol-silencer-sound-effect>.
   Original WAV: <https://opengameart.org/sites/default/files/silencer.wav>.
   The creator states no credit is necessary.
3. **Doomsday Laser Cannon Sound Effect** — TAD.
   <https://opengameart.org/content/doomsday-laser-cannon-sound-effect>.
   Original short WAV:
   <https://opengameart.org/sites/default/files/doomsday_laser_cannon_short.wav>.

License pages were checked on 2026-09-29. Credits are retained here voluntarily.

## Bank keys and original recording identities

Weapon names and ammunition labels below are transcribed from the library's
accompanying metadata; physical model/caliber identification has not been
independently verified. In particular, its Mossberg Model 190 entry says
"12 gauge", and that source description is retained rather than silently changed.

Each two-variant key has `audio/gunshots/<key>-1.mp3` and `<key>-2.mp3`.
The two designed effects have only `<key>-1.mp3`.

| Key | Original recording / effect | Variants |
|---|---|---:|
| pistol45 | 1911 .45 | 2 |
| pistol380 | Bersa .380 | 2 |
| pistol9 | Walther PPQ 9 mm | 2 |
| revolver38 | Smith & Wesson 642 .38 Special | 2 |
| ak762 | AK-47 7.62x39 mm | 2 |
| ar556 | AR-15 / M4 .223 / 5.56x45 mm | 2 |
| smg9 | Carl Gustav M45 9 mm | 2 |
| ppsh | PPSh 7.62x25 mm | 2 |
| shotgun_cd | Charles Daly 12 gauge | 2 |
| shotgun_winchester | Winchester Model 12, 12 gauge | 2 |
| shotgun_mossberg | Mossberg Model 190, 12 gauge | 2 |
| shotgun_benelli | Benelli Nova 12 gauge | 2 |
| mosin | Mosin Nagant 7.62x54 mm | 2 |
| sks | Norinco SKS 7.62x39 mm | 2 |
| rifle300 | Savage Model 10 .300 AAC Blackout | 2 |
| rifle3006 | Tikka T3 .30-06 | 2 |
| suppressed | bart cinematic silencer effect | 1 |
| gauss | TAD fictional energy discharge | 1 |

## Processing and verification

- Decode to float32, downmix to mono, and resample to 44,100 Hz.
- Locate each selected isolated shot and retain 8 ms before its onset.
- Each field-recording clip is 1.70 seconds, including approximately 1.692 seconds
  after onset. No subsequent shot or recorded burst is included.
- Remove constant DC offset and sub-30 Hz microphone rumble with a second-order
  high-pass, soften file boundaries with a short fade, and preserve the recorded
  decay. The final 90 ms fades to zero.
- Preserve the complete useful suppressed sound in 0.65 seconds, removing only
  its long trailing silence.
- Remove the Gauss source's 1.992-second charging prelude to align its discharge
  with the shot event. Preserve the remaining 1.508-second designed energy tail,
  with a final 150 ms fade.
- Encode mono MP3 at 128 kbps. Correct gain after decoding the MP3 so playback
  peaks remain approximately -3 dBFS, including encoder overshoot.
- Verify decoded onset timing, one loud discharge cluster, peak headroom and a
  smooth endpoint for every clip. Inspect output waveforms for isolated attacks
  and retained decay. This is waveform and decode verification, not a claim of
  listening on every target device.

Full provenance and measured QA values are in `audio/gunshot-sources.json`: exact
download URLs, creators, license, download timestamps and HTTP metadata, original
SHA-256, cut timestamps, gain and fades, output SHA-256 and byte counts. Its `bank`
object lists all runtime paths. Raw source recordings are kept outside the game
repository to avoid adding roughly 100 MB to the shipped game.

## Rebuild

Requirements: Python 3 with NumPy and SciPy, and FFmpeg with `libmp3lame`.

```sh
python tools/build_gunshot_bank.py --cache ../audio-source-cache
```

Use `--analyze` to download originals and print candidate shot peaks without
changing the sound bank. A normal rebuild checks existing original hashes and
stops if a downloaded source has changed. The bank builder does not touch weapon
mapping, playback code, soundtrack code or application entry points.
