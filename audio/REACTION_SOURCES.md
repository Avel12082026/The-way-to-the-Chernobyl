# Human combat reaction sounds

Ten distinct recorded reactions: two consistent player grunt variations and
eight human NPC variations drawn from the other three source voice groups.
The bank is 98,625 bytes, mono 44.1 kHz MP3 at 128 kbps. Every output has a
different original source recording; none is a pitch-shifted duplicate.

## Original source and permission

**Male Grunt/Yelling sounds**, by **HaelDB**:
<https://opengameart.org/content/male-gruntyelling-sounds>.

Download: <https://opengameart.org/sites/default/files/yelling%20sounds.zip>.

The creator's page offers both OGA-BY 3.0 and **CC0 1.0 Universal**. This bank uses
the CC0 option: <https://creativecommons.org/publicdomain/zero/1.0/>.
The source page describes four male vocalists recorded with a Neumann microphone
and an Avalon 2022 preamp. Voice groups below follow source filename prefixes;
the individual performers are not named. License checked on 2026-09-29.
Credit is retained voluntarily even though CC0 does not require attribution.

Original archive SHA-256:
`e9100a4e3b9dcd146993089970dc6097dcf9935fa4683b196040012bad65d67a`.

## Selections

The archive contains both brief reactions and longer screams. These selections
retain individual short responses, leaving out the longer recordings.

| Output in `audio/reactions/` | Original member in `yelling sounds/` | Voice group | Duration |
|---|---|---|---:|
| player-hurt-1.mp3 | 3grunt1.wav | 3 | 0.4338 s |
| player-hurt-2.mp3 | 3grunt2.wav | 3 | 0.6925 s |
| enemy-hurt-1.mp3 | 1yell1.wav | 1 | 0.5058 s |
| enemy-hurt-2.mp3 | 1yell9.wav | 1 | 0.3823 s |
| enemy-hurt-3.mp3 | 1yell15.wav | 1 | 0.4741 s |
| enemy-hurt-4.mp3 | 2yell1.wav | 2 | 0.4828 s |
| enemy-hurt-5.mp3 | 2yell10.wav | 2 | 0.6841 s |
| enemy-hurt-6.mp3 | yell12.wav | unprefixed | 0.5795 s |
| enemy-hurt-7.mp3 | yell13.wav | unprefixed | 0.5613 s |
| enemy-hurt-8.mp3 | yell7.wav | unprefixed | 0.6891 s |

## Transformations and verification

Each full short response was trimmed with 12 ms preroll and up to 75 ms trailing
decay. Processing removes DC offset and sub-65 Hz microphone rumble, adds 5 ms
fade-in and 45 ms fade-out, downmixes to mono, and normalizes decoded MP3 peaks
to approximately -6 dBFS. No words, synthesized speech, music or additional
effects were added. Original timing and pitch are preserved.

Decoded output peaks range from -6.079 to -5.921 dBFS. All ten clips have unique
SHA-256 hashes and clean endpoints. Durations, onset timing and waveforms were
checked. Auditory playback was unavailable in the build environment, so this
does not claim listening verification for intelligible words or vocal character;
selection follows the creator's grunt/yelling description and short source takes.

Exact archive and member identities, original/output SHA-256 hashes, source URL,
license, download timestamp, cuts, processing and measured QA values are preserved
in `audio/reaction-sources.json`. Its `clips` array includes `{path, sha256}` for
every output; `bank.player` and `bank.enemy` list the respective runtime paths.

## Rebuild

```sh
python tools/build_combat_reactions.py --cache ../audio-source-cache/reactions
```

Requires Python 3, NumPy, SciPy and FFmpeg with libmp3lame. Raw recordings remain
outside the game repository. The builder verifies the original archive hash and
does not edit playback logic, damage handling, soundtrack code or weapon sounds.

Intended playback: one reaction per damaging combat attack, selected by the
damaged actor, with no reaction on a miss and no repeats for individual burst
pulses. NPC recordings are intended for human opponents; player reactions may
also follow damage inflicted by a mutant. Triggering and random selection are
implemented separately from this asset bank.
