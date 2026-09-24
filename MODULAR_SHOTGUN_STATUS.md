# Modular shotgun combat — 2026-09-24

Added all 29 shotgun IDs from the live game catalog to all 96 existing heavy armor poses. Reused 96 body PNGs, 96 shared hand PNGs and 29 weapon PNGs from the saved checkpoint branch. No generated armor+weapon pair images. Existing 26 pistol layers/96 pistol poses retain identical anchors and scale.

Runtime images: 439 unique URLs total (192 pose bodies, 192 shared hand layers, 55 guns). Only equipped layers load; switching pose uses pistol or heavy according to actual weapon ID. Player/NPC share resources, with whole-group reflection for NPC. The existing requirement for actual NPC armor data from the server remains; no equipment is invented.

Shotgun IDs: 20,106,107,108,109,110,111,19,112,113,114,32,115,116,44,117,62,118,50,119,56,120,121,68,122,123,74,124,125.

Fitting: 2,784 numeric combinations; 963 base placements preserved, 1,821 calibrated using fixed primary grip with uniform scale and rotation toward a support region. Source PNGs unchanged. Final uniform scales 0.28906–0.59794; angles -19.398–24.993 degrees. The compact KSG and magazine-fed shotguns have individual adjustments. TOZ-194 may rest on the underside of the barrels beyond its short wooden fore-end. Authoritative values are CombatFighters.data.pairAdjustments in fighters.js.

A shared per-pose polygon redraws the existing near forearm over the stock before the hand layer. No additional bitmap is loaded for this occlusion.

Validation:
- All 221 added PNGs have transparent and opaque pixels.
- Numeric alpha audit: all 2,784 shotgun combinations intersect both primary and support-hand masks; no empty hand intersections. Intersection alone does not establish anatomical correctness.
- Visual review: all 29 shotguns on armors 1,32,64,96 (116 compositions), and the near-arm overlay on all 96 armors with weapon 108.
- Runtime tests cover all 5,280 pistol+shotgun combinations, shared URLs, pose changes, NPC reflection, clipping order, cache reuse, HP updates, fallback and stale loads; original pistol settings have unchanged fingerprints.
- Full individual pixel-perfect artistic approval of all 2,784 shotgun pairs is NOT claimed. Fingers, shoulder-stock contact and unusual intersections remain candidates for in-game visual refinement.
- No animations or APK build added; no claim of APK size reduction.

Only index.html script cache versions changed in this update. Keep the full restored index; never save connector truncation markers such as bytes omitted into source.
