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

## Remaining queue

Current weapon is **10, Saiga-12**. Its contact/seam refinement is ready for
publication and has been visually reviewed on all96 suits. See `10-review.json`.
The shared PNG, all other weapon fits and renderer code remain unchanged.
The reviewed support surface now includes the smooth rear handguard, reducing
support-arm translations from38 to1 and eliminating clipped sleeve gaps.

**Do not mark10 fully finished or advance to11 yet:** source poses43,45–56,
60,61,64 hold the stock against chest/upper arm below the shoulder pocket.
Hand contacts and sleeve continuity are reviewed, but the requested strict
shoulder placement needs a separate pose adjustment. Save and preserve the
current contact improvements while finishing this detail.

After completing10, continue remaining heavy IDs ascending, then pistol poses.
The other109 weapons are not certified by the 114/32/20 or10 contact reviews.

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
