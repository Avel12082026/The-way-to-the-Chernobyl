# Raid, item information and multiple quests — 2026-09-20

## Scope
Scene geometry remains 3:2. No changes to hand sprites, detector placement, button captions, scene height or history height. No changes to the Stalcoin market transaction code.

## Item information
The common item information renderer adds the actual use level (research suits use the existing 135…570 level schedule). Detector use and shop unlock are explicitly separate: existing server equipment code does not impose the detector purchase-level gate on equipping. No new equipment restrictions are introduced.

Catalogue value is labelled as an estimate, not a market average. The market figure is the weighted price per item of current matching listings: sum(total lot prices) / sum(lot quantities). Stalbytes and Stalcoins are never combined. Gear upgrade levels and crafted-artifact identities remain separate. Empty/offline markets show no fabricated average. This is not a completed-sales price history.

## Environmental damage
Baseline direct HP/dose by tier: 1=6/6; 2=10/10; 3=15/14; 4=22/18; 5=30/23; 6=40/28; 7=52/34; 8=66/40; 9=180/120. Each uses a ±5% variation. Armour and equipped artifacts reduce the appropriate values with diminishing returns; negative protection increases them. Ordinary tiers are calibrated for unmodified equipment. Each search deals direct anomaly damage, never immediate radiation sickness; radiation 100 no longer kills automatically while searching. Searches still consume attempts and retain existing artifact/passive penalties and rewards, except that a dead search cannot claim loot.

Accumulated radiation remains on the player after bypass/finish and damages HP on subsequent travel/combat actions through the existing server radiation-damage function. Antirad can remove it before that next action. Artifact leakage adds contamination rather than also duplicating direct HP damage.

Named tier-9 anomalies use the mean of the eight ordinary anomaly protections plus any direct named-anomaly resistance. They penetrate ordinary and unmodified suits (at most 15% mitigation). Environmental upgrades of research suits gradually lift this cap to 75% at 50 invested upgrades. Bullet/impact upgrades do not grant that specialist environmental benefit. Administrator equipment remains outside the ordinary-player cap. This is still dangerous, not immunity.

The base travel cost is 2 hunger + 2 thirst; existing artifact drawbacks and consumable costs are separate.

## Quest UI and persistence
`quests.activeIds` replaces the one-active-quest restriction, with `activeId` retained as a compatibility alias. Existing selection is migrated. Single activation appends; batch activation activates all accepted quests; deactivation does not abandon a quest. Turn-in/abandon removes only the relevant ID. The accepted limit remains 8. Existing inventory can still be handed in immediately at base; server receipts prevent duplicate rewards.

The 72px raid tracker scrolls internally and preserves its scroll position as progress updates. Each quest has its own readiness colour. Global raid scrolling stays disabled. The EXP regression was caused by a broad first-child CSS selector hiding the green fill; the selector now targets only the radiation text label.

## Validation / deployment
Tests include actual patched route bodies from the owner's supplied server (SHA-256 7d481279dc1b6eb7c2425fa8a8a905270a917d64369dc5eefe944f37b4dc6759), executed against in-memory SQLite. No production-player writes are made during tests. Test fixtures contain only relevant routes/helpers and catalogues, never server credentials.

The updater accepts only the reviewed server and quest-module hashes, verifies candidate hashes and syntax before changing files, stops writers during atomic code replacement, waits up to 40 seconds for versioned HTTP readiness, and restores prior code on failure. It never restores an old database over gameplay progress. Client publication does not itself install backend changes: the server ZIP must be installed separately over SSH.
