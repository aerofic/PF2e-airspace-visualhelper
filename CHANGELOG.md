# Changelog

## 0.4.0 — Layered Acrylic Flight Presentation

- Rebuilt the flight stand as layered acrylic with a restrained transparent body, refractive edges, and narrow specular highlights instead of a laser-like glow.
- Redesigned the fixed ground base as a translucent elliptical plate with visible thickness, inner and outer rims, a lower pin, and a natural top connector beneath the Token art.
- Separated and strengthened contact and height-cast shadows while preserving elevation-dependent scale, drift, opacity, and complete footprint bounds.
- Added a non-interactive Foundry-shape footprint cue which strengthens on hover or control without moving the native border or hit area.
- Replaced discrete height bands with one continuous takeoff and compressed-height curve, including finite bounds for extreme elevation and Token dimensions.
- Added reversible airborne Mesh scale, alpha, lower-rim accent, and deterministic shared low-frequency bobbing for every visible elevated Token, with reduced-motion support.
- Kept Foundry VTT's native elevation tooltip and Level indicator, applying only a reversible layout offset to avoid the lifted art.
- Preserved TokenDocument coordinates, hit areas, movement, snapping, vision, PF2e rules, dynamic Token Rings, and third-party per-property last-write ownership.

## 0.3.1 — Ultra-Compact Navigation HUD

- Replaced the always-open top panel with a frameless, highly translucent `360 × 32` navigation-style summary bar.
- Condensed ALL, GROUND, and AIR filtering into accessible icon controls with localized tooltips and labels.
- Added a compact live summary for the selected Token, visible Token count, and highest matching elevation.
- Moved the proportional altitude axis, nearby relations, hover details, and Token focus interactions behind an explicit expand control so the full tactical view remains available on demand.
- Added a dedicated drag handle and localized expand, collapse, close, and summary accessibility text.

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
