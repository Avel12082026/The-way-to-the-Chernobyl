# Combat gunshots — 2026-09-29

The complete ordinary weapon catalog is mapped: 116 firearms, 18 sound families,
34 MP3 files, 945,799 bytes. Administrative weapon 85 ("Убиваю взглядом") is
intentionally silent. Exact model recordings are not available for every weapon:
related firearm recordings and modest playback-rate adjustments are used. See
`audio/GUNSHOT_SOURCES.md` and `audio/gunshot-sources.json` for CC0 provenance.

`audio/combat-audio.js` wraps the existing CombatScene after side-scene loads.
Player attacks, including misses, and actual armed NPC replies trigger sounds.
Mutants and radiation-only deaths do not trigger gunshots. Pending replies are
cancelled when the scene closes; duplicate results are ignored. Existing visuals
and combat/server state are unchanged.

Effects use a separate WebAudio bus and limiter. The existing soundtrack keeps
playing through its own HTMLAudio element. The ♫ panel has independent music and
gunshot controls; effects default to enabled at 65%, stored as `zone.combatSound`.
The sound bank is served from the frontend origin, independently of SERVER_URL.

## Verification

- Catalog coverage, source hashes, byte budget, and script ordering passed.
- All 11 playback/timing unit tests passed, including initialization in inline
  about:blank previews used by the quest browser tests.
- Existing combat effects, fighter scene, and legacy race tests passed.
- Real Chromium 1243 smoke test passed: all 34 MP3s decode with nonzero samples;
  trusted input unlocks WebAudio; three shots overlap while music time advances;
  independent mutes, NPC timing/cancellation, duplicate suppression, reduced
  motion, saved settings and 320×480 settings layout work without browser errors.
- Browser soundtrack transport uses a documented local PCM fixture; that test
  does not claim to validate the six externally hosted ambient recordings.

Run lightweight checks with the `Combat audio` GitHub workflow. Reproduce the
browser test with Playwright installed and `node tests/combat_audio.browser.cjs`
(set CHROMIUM_EXECUTABLE_PATH if using an existing Chromium binary). Rebuild the
manifest with `node tools/build_combat_sound_manifest.cjs`; audio reconstruction
instructions are in the source credits file.
