# Mutant combat audio

29 species, 3 hurt and 3 attack variants each: 174 unique mono MP3 files.
Male and female entries share the same species bank. This is a designed
adaptation of licensed creature/animal sounds, not recordings of fictional mutants.

All sources offer CC0 1.0: <https://creativecommons.org/publicdomain/zero/1.0/>. Credits are preserved voluntarily.
No proprietary game sounds or unlicensed STALKER recordings are included.

## Sources

- **80 CC0 creature SFX**, rubberduck: <https://opengameart.org/content/80-cc0-creature-sfx>.
- **80 CC0 creture SFX #2**, rubberduck: <https://opengameart.org/content/80-cc0-creture-sfx-2>.
- **Monster Sound Effects Pack**, Ogrebane: <https://opengameart.org/content/monster-sound-effects-pack>.
- **Monster Sound Effects 2**, Ogrebane: <https://opengameart.org/content/monster-sound-effects-2>.
- **Dog sounds**, pauliuw: <https://opengameart.org/content/dog-sounds>.
- **Dog Snarl Grunt Grumble**, Iwan 'qubodup' Gabovitch: <https://opengameart.org/content/dog-snarl-grunt-grumble>.
- **Squeaky Rat**, Iwan 'qubodup' Gabovitch; underlying CC0 recordings by Zabuhailo and moneykube: <https://opengameart.org/content/squeaky-rat>.
- **Monster snarls**, Darsycho: <https://opengameart.org/content/monster-snarls>.
- **CC0 Deep Monster Roar**, trazzz123: <https://opengameart.org/content/cc0-deep-monster-roar>.

rubberduck states that most first-pack creature sounds are mouth performances
processed with filters. Dog sources include actual recordings; other monster
sources are designed effects. Squeaky Rat is an edited CC0 composite by qubodup
from Zabuhailo/moneykube material as credited on its source page.

## Species design

Native maximum catalog tier guides depth and texture. It is not the dynamically
scaled raid tier. Greater danger does not increase peak loudness: all clips target
-6 dBFS. Large species receive a low chest-roar layer; psychic species receive
short resonance/modulation; wet creatures receive restrained organic texture.

| Species | Native max tier | Character | Pitch base |
|---|---:|---|---:|
| Тушкан (`tushkan`) | 0 | tiny rodent squeak | +2.4 st |
| Слепая собака (`blind-dog`) | 2 | light canine yelp and bark | +0.6 st |
| Чернобыльский пёс (`chernobyl-dog`) | 2 | raspy canine | -1.2 st |
| Кракозябра (`krakozyabra`) | 4 | dry croaking quadruped | -1.5 st |
| Плоть (`flesh`) | 4 | nasal guttural swine mutant | -2.4 st |
| Боров (`boar`) | 6 | heavy snorting swine mutant | -4.0 st |
| Изотоп (`isotope`) | 6 | wet unstable creature | -1.1 st |
| Шарнир (`hinge`) | 8 | clattering jointed creature | -3.0 st |
| Зомби (`zombie`) | 8 | hollow decayed humanoid | -1.8 st |
| Псевдо собака (`pseudodog`) | 10 | deep predatory canine | -3.2 st |
| Рысь (`lynx`) | 10 | sharp feline-like rasp | +1.4 st |
| Чупакабра (`chupacabra`) | 12 | dry toothy predator | -0.5 st |
| Пси собака (`psydog`) | 12 | psychic canine resonance | -3.8 st |
| Кот Баюн (`bayun`) | 14 | resonant psychic feline-like growl | -0.6 st |
| Снорк (`snork`) | 14 | strangled masked rasp | -2.5 st |
| Стрегун (`stregun`) | 16 | coarse clawed quadruped | -3.7 st |
| Филин (`owl`) | 16 | piercing avian-like humanoid screech | +1.8 st |
| Кровосос (`bloodsucker`) | 18 | wet guttural predator | -4.6 st |
| Полтергейст (`poltergeist`) | 18 | airborne spectral shriek | -3.2 st |
| Огненный полтергейст (`fire-poltergeist`) | 20 | hot airy spectral rasp | -4.1 st |
| Излом (`fracture`) | 20 | twisted gravelly humanoid | -4.5 st |
| Бюрер (`burer`) | 22 | compact heavy throat and psychic rumble | -5.0 st |
| Лось (`moose`) | 22 | massive throaty bellow | -7.0 st |
| Контролёр (`controller`) | 24 | deep dissonant psychic humanoid | -5.8 st |
| Стронглав (`stronglav`) | 24 | giant bloodsucker wet chest roar | -8.3 st |
| Химера (`chimera`) | 26 | large layered predatory roar | -8.6 st |
| Электро химера (`electrochimera`) | 26 | large electrically vibrating predator | -8.1 st |
| Наблюдатель (`observer`) | 28 | ominous hollow resonant observer | -6.9 st |
| Псевдогигант (`pseudogiant`) | 28 | heaviest low chest bellow | -10.2 st |

Within every species/event, all three variants use different primary files or
different explicit source intervals. Cross-species reuse is deliberate sound design
with different pitch, body layers and processing. Files are not renamed duplicates.

## Processing and QA

Original archive/download SHA-256, creators, URLs, licenses, member identities,
source intervals, pitch changes, mixes, filters, encoding, output and decoded PCM
hashes are in `audio/mutant-sources.json`. Its `clips` array contains `{path, sha256}`
for every output; `bank[species].hurt/attack` provide the runtime paths.

Processing: mono 44.1 kHz; short onset preroll; speed-coupled pitch conversion;
species-specific CC0 body layers; high/low-pass cleanup; soft saturation; restrained
resonance where appropriate; 6 ms fade-in / 80 ms fade-out; 128 kbps MP3 with decoded
peak normalization. Attack wind-up is trimmed so the first strong accent is near
the beginning. Exact transformations are preserved per clip.

Total bank: **1,986,740 bytes**. Duration range: **0.300–1.120 s**.
All outputs are decoded and checked for finite non-silent PCM, unique PCM hashes,
peak headroom, early onset/attack accents and smooth endpoints. Waveform QA supplements
these checks. Auditory playback is unavailable in the build environment, so no
listening verification or exact animal-species authenticity is claimed.

## Rebuild

```sh
python tools/build_mutant_sounds.py --cache ../audio-source-cache/mutants
```

Requires Python 3, NumPy, SciPy, py7zr and FFmpeg with libmp3lame. The builder
checks original source hashes. Raw archives and recordings remain outside git.
It does not edit combat logic, soundtrack playback, human NPC reactions or weapon sounds.
