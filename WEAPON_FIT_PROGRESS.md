# Sequential weapon fitting

Updated 2026-09-29.

The catalog contains 113 weapons and 96 armor suits. Keep one transparent source
PNG per weapon. Store each suit's fitting as position, rotation, uniform scale
and necessary foreground contours. Review composites are temporary QA output,
not runtime assets and must not be packaged into the APK.

## Accepted release

Remington 870 MCS, weapon **114**, has been visually reviewed on all 96 suits.
The exact accepted renderer/source fingerprints and per-suit verdicts are in
`asset_sources/combat_weapon_fits/114-review.json`.

This release corrects both hand contacts, detached stock ends, shifted-arm
seams and demonstrated cropped fingertips. Other weapons and shared armor
images/definitions retain their previous fits. No source PNG was added or edited.

## Remaining queue

Publish and verify 114 before starting the next weapon. Next: **32, Saiga-12K**,
then **20, Saiga-410**, then the remaining catalog. The other 112 weapons are
not certified by the 114 review or by the automated render-coverage check.

`asset_sources/combat_weapon_fits/heavy-source-anchors.json` records the inspected
source contact surfaces for all 87 heavy weapons. This is source inspection,
not acceptance of their armor combinations. Weapons 52 and 55 deliberately
have no accepted support surface and require an individual pose decision.

## Reproduce the current weapon review

Use the existing modular source PNGs, preserving their hashes. The review cache
contains `ID-heavy.png`, `hands/ID-heavy.png`, and `weapons/ID.png`.

```sh
node tools/fit_combat_weapon.cjs --weapon 114 --report /tmp/114-fit.json
node tools/review_weapon_fits.cjs --weapon 114 --cache /path/to/cache --out /tmp/114-review
node tests/combat_weapon_contacts.test.cjs
node tests/combat_fighters.test.cjs
node tests/combat_fighters_baseline.test.cjs
node tests/combat_fighters_compact.test.cjs
node tests/combat_weapon_review.test.cjs
node tests/combat_fighters_layers.raster.cjs
node tests/combat_fighters_compact.raster.cjs
```

Render checks do not replace visual inspection. Inspect all 96 hand contacts,
stock connections and arm silhouettes before accepting a weapon. Publish that
one weapon, verify the deployed bytes and refresh the game, then proceed.
