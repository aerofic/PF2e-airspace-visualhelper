# Changelog

## 0.3.0 — Ground-Anchored Flight Stand

- Reversed the flight illusion: the acrylic base now stays at the TokenDocument footprint while the Token mesh rises up-left.
- Added reversible PrimarySpriteMesh and native visual-UI offsets which do not change Token coordinates, hit areas, snapping, movement, vision, or rules data; Foundry still owns the elevation tooltip text and units.
- Kept drag previews and horizontal movement aligned by the ground base and reapplied the cached visual pose after core refreshes.
- Replaced the vertical shaft with a roughly 12-degree inclined acrylic stand whose top connects to the raised Token center, including elongated and non-rectangular Token footprints.
- Strengthened the stand, height shadow, contact shadow, and ground projection while keeping the complete soft-shadow bounds inside the original footprint.
- Added mesh/UI restoration and exact last-write protection for disable, redraw, elevation zero, Canvas teardown, and later module position writes.

## 0.2.1 — Translucent Top HUD

- Changed the Airspace HUD default layout to a wide, horizontally centered top strip.
- Made the header, panel, nodes, and relation surfaces translucent without reducing text opacity.
- Added compact horizontal scrolling plus responsive and high-contrast fallbacks.

## 0.2.0 — V2 Airspace HUD

- Added the ApplicationV2 Airspace HUD with a proportional 5 ft altitude axis.
- Added ALL, GROUND, and AIR filters.
- Added Token focus, permission-safe selection, Canvas pan, and local two-second Ping highlighting.
- Added PF2e prepared Fly Speed hover details with observer-permission checks.
- Added nearby airborne altitude-difference relationships.
- Added an exact vertical ground projection, dashed line, and projection opacity setting.
- Split stand, shadow, and projection drawing into independent PIXI renderers under `src/`.
- Preserved Foundry's native Token elevation tooltip instead of duplicating map labels.
- Added visibility/Secret filtering and debounced HUD updates.

## 0.1.0 — V1 Flight Stand

- Added elevation-driven transparent stands, height shadows, native elevation-label controls, and smooth height animation.
