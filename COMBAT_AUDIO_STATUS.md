# Combat gunshots — 2026-09-29

The complete ordinary weapon catalog is mapped: 116 firearms, 18 sound families,
34 MP3 files, 945,799 bytes. Administrative weapon 85 ("Убиваю взглядом") is
intentionally silent. Exact model recordings are not available for every weapon:
related firearm recordings and modest playback-rate adjustments are used. See
`audio/GUNSHOT_SOURCES.md` and `audio/gunshot-sources.json` for CC0 provenance.

`audio/combat-audio.js` wraps the existing CombatScene after side-scene loads.
Player attacks, including misses, and actual armed NPC replies trigger sounds.
Mutants and radiation-only deaths do not trigger gunshots. Pending replies are
cancelled when the scene closes; duplicate results share one presentation promise.

## Requested attack series

| Gameplay class | Weapons | Shots per attack | Interval |
| --- | ---: | ---: | ---: |
| Pistols and revolvers | 26 | 3 | 180 ms |
| Automatics, SMGs and the ordinary Vepr carbine | 19 | 3 | 100 ms |
| Machine guns | 11 | 6 | 100 ms |
| Rifle progression, including X-17 and Gauss | 29 | 2 | 350 ms |
| Sawed-off double-barrel (ID 4) | 1 | 2 | 260 ms |
| Repeating shotguns, including Saiga-12 | 30 | 3 | 260 ms |

Each sound starts a scene pulse on the same scheduling callback. Modular weapon
flames last 70 ms, leaving visible gaps even in the 100 ms automatic series. The
legacy first-person fallback repeats its supported recoil; it has no reviewed
muzzle coordinates. Reduced-motion preferences still suppress animated flashes.

CombatScene.react now returns a promise that waits for every pulse and playing
sound tail. The client holds the turn lock and delays HP, combat logs, death and
victory/reward handling until it finishes. A series sends exactly one action to
the existing server endpoint and applies its damage once. It does not multiply
damage, consume extra turns or change server combat rules. Accepted results still
apply if presentation is cancelled or fails, provided the same battle is active.

## Wound reactions

`audio/combat-reactions.js` adds two player hurt variants and eight hostile NPC
variants: ten distinct recorded takes, 98,625 bytes in total. The player retains
one voice with two variations; NPC recordings come from three other voice groups.
The next clip is chosen randomly from the role's ready variants, excluding its
previous clip. An unavailable alternate never delays the combat turn. Credits, original source hashes
and processing details are in `audio/REACTION_SOURCES.md` and
`audio/reaction-sources.json`.

An NPC reacts once when an attack reports finite positive playerDamage and the
server's enemy kind is `npc`. The player reacts once when enemyTurn.hit is true
and its finite damage is positive, including attacks by mutants. Misses, fully
absorbed hits and radiation alone do not trigger wound sounds. Human NPC vocals
are not applied to mutant or unidentified targets.

The reaction begins 80 ms after the relevant burst's final shot. Non-shooting
enemy attacks still trigger the player's reaction. Reactions share the turn's
cancellation and audio-tail wait, without adding flashes, damage or requests.

## Mutant voices

`audio/combat-mutants.js` covers all 29 species and all 57 gameplay names,
including the female variants. Each species has three hurt clips and three
attack clips: 174 distinct sound designs in total. Both sexes use the exact same
six files. Native catalog tiers shape the voices; location-adjusted battle tiers
do not change them. Licensed creature and animal recordings are adapted into
species profiles, with deeper layered textures for larger and more dangerous
mutants. Sources and reproducible processing are documented in
`audio/MUTANT_SOURCES.md` and `audio/mutant-sources.json`.

Resolution uses explicit mutant identity and the gameplay name, independently of
image loading. Gameplay/art spelling differences for pseudodog, psydog and
electrochimera, as well as Russian ё/е, resolve to the same species. Unknown names
and NPCs never borrow a mutant voice. Only the current species' six clips and
the player's two wound clips preload for a mutant encounter; the decoded cache
remains bounded at 24 buffers.

Positive player damage triggers one mutant hurt reaction after the final shot.
An actual enemy turn triggers one mutant attack sound even on a miss, but a
player hurt reaction requires a confirmed positive hit. Victory, successful
escape, rejected actions and radiation-only death do not create an attack.
Hurt and attack variants avoid their own last audible clip independently.

The attack sound and `scene.mutantAttack(token)` start together. The existing
creature scale animation peaks at 120 ms, matching the player's wound reaction,
and returns to rest by 360 ms. Both renderers support this timing; reduced motion
suppresses movement. Final HP/death awaits the full audio tails and any active
attack movement, with no second lunge, extra muzzle flashes or extra damage.
Mute keeps the visual timing; leaving a battle cancels its sounds and movement.

Effects use a separate WebAudio bus and limiter. The existing soundtrack keeps
playing through its own HTMLAudio element. The ♫ panel has independent music and
«Звуки боя» controls; effects default to enabled at 65%, stored as `zone.combatSound`.
The sound bank is served from the frontend origin, independently of SERVER_URL.

## Verification

- Catalog coverage, source hashes, byte budget, and script ordering passed.
- Playback/timing tests cover exact series lengths, paired shot/pulse timing,
  completion after sound tails, mute, cancellation, and inline about:blank startup.
- Client turn tests cover one server request, deferred lethal HP and rewards,
  duplicate taps, consumable locking, stale battles and presentation failures.
- Existing combat effects, fighter scene, and legacy race tests passed.
- Real Chromium 1243 smoke test passed: all 218 MP3s decode with distinct, nonzero samples;
  trusted input unlocks WebAudio; three shots overlap while music time advances;
  independent mutes, NPC timing/cancellation, duplicate suppression, reduced
  motion, saved settings and 320×480 settings layout work without browser errors.
- The browser also verifies all five distinct burst cases (3/6/2/2/3 shots),
  paired sound/pulse starts, actual audio completion before the result boundary,
  3+2 and 6+6 player/NPC sequences with complete tails, and six visual pulses
  when effects are muted. The longest measured single-weapon case was 2.30 s.
- Wound playback is identified by the actual decoded PCM: both player takes and
  varying NPC takes use the correct role, never repeat consecutively, and play
  once per damaging turn. Damage gates, the 80 ms reaction offset, full hurt
  tails before final HP/death, mute and cancellation passed in Chromium.
- All 29 mutant species passed actual-PCM playback checks using server names,
  including shared male/female profiles and spelling aliases. The browser checks
  independent three-variant selection, attack/hurt gates, 120 ms impact, 360 ms
  visual completion floor, and all sound tails. The dedicated renderer harness
  verifies geometry, reduced motion, cancellation and no duplicate final lunge.
- Browser soundtrack transport uses a documented local PCM fixture; that test
  does not claim to validate the six externally hosted ambient recordings.

Run lightweight checks with the `Combat audio` GitHub workflow. Reproduce the
browser test with Playwright installed and `node tests/combat_audio.browser.cjs`
(set CHROMIUM_EXECUTABLE_PATH if using an existing Chromium binary). Rebuild the
manifest with `node tools/build_combat_sound_manifest.cjs`; audio reconstruction
instructions are in the source credits files. Regenerate the mutant name/sound
manifest with `node tools/build_mutant_sound_manifest.cjs`.
