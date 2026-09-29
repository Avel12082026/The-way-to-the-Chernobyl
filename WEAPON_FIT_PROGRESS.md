# Sequential weapon fitting

Updated 2026-09-29.

The catalog contains 113 weapons and 96 armor suits. Keep one transparent source
PNG per weapon. Store each suit's fitting as position, rotation, uniform scale
and necessary foreground contours. Review composites are temporary QA output,
not runtime assets and must not be packaged into the APK.

## Accepted releases

Remington 870 MCS, weapon **114**, has been visually reviewed on all 96 suits.
The exact accepted renderer/source fingerprints and per-suit verdicts are in
`asset_sources/combat_weapon_fits/114-review.json`.
Published as `4e20d7b9f7b24f5ce1ab9f09a00ad1e6d9074f30`: Pages succeeded,
served index/renderer bytes matched the release, and Telegram loaded its new
script version after a fresh reload.

Saiga-12K, weapon **32**, has also been visually reviewed on all 96 suits.
Its accepted fingerprints and verdicts are in
`asset_sources/combat_weapon_fits/32-review.json`. The 32 release preserves every
previously accepted 114 fit, all shared PNGs and runtime drawing code.
Published as `a102fe8a136670e1dbc3b26164f26509a24bbfcf`: Pages succeeded,
live index/renderer bytes matched, and Telegram loaded the new script version.

Saiga-410, weapon **20**, is accepted on all 96 suits; see
`asset_sources/combat_weapon_fits/20-review.json`. Its source PNG remains
unchanged and the accepted 114/32 fits are preserved exactly.
Published as `c5877de40346eb8470b797668aea21566ad5ddf1`: live index and
renderer bytes matched the release; the existing Telegram game reloaded successfully.

These releases correct both hand contacts, detached stock ends, shifted-arm
seams and demonstrated cropped fingertips. Other weapons and shared armor
images/definitions retain their previous fits. No source PNG was added or edited.

## Fitting rule clarified by the user — 2026-09-29

For shotguns, automatic weapons and rifles, shoulder contact is optional.
The buttstock may tuck between the character's bent elbow and side. Prioritize
an intact right-hand grip with the index at the trigger and the left palm on
the actual fore-end. Keep the stock/receiver continuous and hide the rear stock
behind the near arm where the pose calls for it. Do not redraw characters with
individual weapons: retain one transparent source PNG per weapon.

## Remaining queue

Current weapon is **10, Saiga-12**. Its contact/seam refinement has been
reviewed on all 96 suits; see `10-review.json`. The shared PNG, all other
weapon fits and renderer code remain unchanged. The inspected support surface
includes the smooth rear handguard, reducing support-arm translations from
38 to 1 and eliminating clipped sleeve gaps.

The earlier shoulder-only TODO for suits 43, 45–56, 60, 61 and 64 is superseded
by the user's explicit low-ready fitting rule above. All 16 stock occlusions
were reinspected and accepted: continuous stocks tuck behind the near arm,
with intact grip/fore-end contacts and sleeve seams. No new pose PNGs are used.

After publishing and verifying 10, continue remaining heavy IDs ascending
(starting with **11, АКС-74У**), then pistol poses. The other 109 weapons are
not certified by the 114/32/20/10 reviews.

`asset_sources/combat_weapon_fits/heavy-source-anchors.json` records the inspected
source contact surfaces for all 87 heavy weapons. This is source inspection,
not acceptance of their armor combinations. Weapons 52 and 55 deliberately
have no accepted support surface and require an individual pose decision.

## Reproduce the current weapon review

Use the existing modular source PNGs, preserving their hashes. The review cache
contains `ID-heavy.png`, `hands/ID-heavy.png`, and `weapons/ID.png`.

```sh
node tools/fit_combat_weapon.cjs --weapon 10 --report /tmp/10-fit.json
node tools/review_weapon_fits.cjs --weapon 10 --cache /path/to/cache --out /tmp/10-review
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

## Existing unrelated CI failure

The Zone map navigation workflow fails the Barman consumable string assertion
in`tests/rostok_barman_trade_client.test.cjs`. The referenced`ui/trade-menu.js`
is byte-identical to the pre-fitting base`eda12ac2`; the expected string was
already absent there. Weapon-contact, baseline and rendering checks pass.
