# Changelog

## 0.5.3 — Solar Parallel-Light Projection

- Replaced the 0.5.2 finite point-light magnification with a solar parallel-light model.
- Keeps the Token texture's dense projected silhouette at exactly 1.0× its real Canvas footprint at every elevation; it no longer grows or shrinks with height.
- Retains elevation-dependent penumbra expansion and gentle density falloff, matching the Sun's finite angular diameter without distorting the Token silhouette.
- Preserves the readable low-altitude rod ordering and the default projection length of approximately one third of rules elevation.
- Preserves the dense acrylic base, native elevation labels, HUD, Z Scatter compatibility, movement, targeting, and all PF2e rule boundaries.
- Added regression coverage for fixed silhouette size across elevation while retaining monotonic softness, opacity, distance, and finite extreme-input bounds.

## 0.5.2 — Readable Low-Altitude Physical Projection

- Increased the default upper-right rod projection from one tenth to approximately one third of rules elevation, preserving an exact zero origin and linear elevation response.
- Raised the projected rod above the Token cast but kept the complete visual container below real Token artwork, so the short 10 ft rod remains readable without drawing across the character image.
- Strengthened the rod width and its two-layer umbra/penumbra contrast, especially at 10–40 ft.
- Added a bounded finite-light perspective model: Token texture projections grow approximately 1.017× at 10 ft, 1.071× at 40 ft, and 1.20× at 100 ft on a standard 5 ft grid.
- Increased penumbra spread continuously with elevation and reduced density according to projected area while retaining visibility on textured maps.
- Preserved the dense acrylic base, native elevation label ownership, HUD behavior, Z Scatter compatibility, movement, targeting, PF2e rules, and TokenDocument coordinates.
- Added regression coverage for the one-third projection ratio, 10 ft rod clearance, renderer ordering, perspective scale, falloff, and extreme finite inputs.

## 0.5.1 — Linear Texture-Accurate Height Shadows

- Replaced the 0.5.0 concentric circular shadow approximation with two non-interactive PIXI Sprites that share the current Token texture and preserve its real alpha silhouette.
- Made upper-right projection distance begin at exactly zero and grow linearly with elevation; at the default multiplier, each 5 ft adds one tenth of a Canvas grid until the extreme-geometry safety cap.
- Projected the acrylic rod from the exact Foundry footprint to the Token silhouette, giving the complete support-plus-model assembly one continuous light direction.
- Kept the projected Token at its real footprint size while elevation increases travel and penumbra softness instead of incorrectly shrinking it into a disc.
- Reduced the ground contact to a compact rod-foot shadow while preserving the established dense acrylic plate and its refractive rings as a separate material cue.
- Reuses Foundry's texture without RenderTexture, filters, per-frame geometry allocation, interaction, or document writes; mesh refreshes immediately replace both projected silhouettes.
- Preserved native elevation labels, HUD behavior, Z Scatter compatibility, movement and targeting, PF2e rules, and all TokenDocument coordinates.
- Added regression coverage for zero-origin linearity, fixed upper-right direction, true-size silhouettes, rod continuity, texture replacement, finite safety bounds, and renderer teardown.

## 0.5.0 — Top-Down Tactical Flight Plates

- Replaced the side-view raised-model composition with a top-down tactical mode: Token art now remains concentric with its rules footprint and uses at most roughly six pixels of visual parallax.
- Rebuilt the acrylic support as a plate rim extending only 3–7 pixels beyond the Token, with refractive arcs and the circular end of the camera-aligned vertical rod.
- Removed the continuously visible shaft body and its long ground shadow, which cannot be seen from a strict orthographic top view.
- Rebuilt the height cast as four near-circular Token-disc shadow layers displaced toward the upper-right, plus two restrained concentric plate-contact layers.
- Replaced the vertical projection guide with a four-arc landing ring at the exact Foundry footprint; hover and control add a bounded X-Ray treatment without changing interaction.
- Kept native Foundry/PF2e elevation labels attached to the Token's small visual parallax and preserved Z Scatter composition, dual hit areas, drag previews, sorting, animations, reduced-motion handling, and reversible teardown.
- Kept TokenDocument coordinates, snapping, vision, targeting, movement, distance, Actor, Item, Combat, and PF2e rules untouched.
- Updated settings text and regression coverage for the new top-down invariants and renderer geometry.

## 0.4.16 — Cylindrical Upper-Right Shadows

- Added a dedicated ground-plane shadow for the vertical acrylic shaft, running from the fixed plate into the airborne Token's height-cast shadow.
- Added a longitudinal dark plane to the acrylic shaft so its highlight, transparent midtone, and shaded side read as a cylindrical solid.
- Rendered the shaft shadow as a strong three-layer tapered MULTIPLY shape with a broad penumbra, middle tone, and dense umbra, without using BlurFilter.
- Unified the shaft and Token shadows under the same upper-right cast vector and Shadow Opacity setting so they read as one physical stand-and-model assembly.
- Rebuilt the Token cast as four rotated directional layers and retained the dense two-layer plate contact shadow, for nine cached shadow layers per flying Token.
- Made shaft-shadow length follow elevation and Shadow Distance Multiplier while keeping its start locked to the true Token footprint.
- Preserved the strictly vertical 0.4.14 stand, denser acrylic plate, compact sleeve connector, non-interactive Canvas behavior, and all rule boundaries.
- Added regression coverage for strong effective shaft opacity, tapered geometry, exact plate-to-cast-shadow continuity, elevation response, and full visual integration.

## 0.4.14 — Vertical Stand Axis

- Replaced the twelve-degree stand lean with a strictly vertical acrylic axis from the fixed ground-plate center to the lifted Token center.
- Removed all horizontal airborne-art displacement, eliminating the sideways kite-string silhouette while keeping the ground footprint and movement target unambiguous.
- Kept the strong down-right height-cast shadow, dense contact shadow, perspective scale, and ambient float as the primary depth cues.
- Preserved the denser 0.4.13 acrylic plate and the compact sleeve-only top connector; no clamp geometry was restored.
- Kept `TokenDocument` position, movement, snapping, hit areas, vision, targeting, and PF2e rules unchanged.
- Added regression coverage for exact vertical alignment across ordinary, irregular-center, multi-grid, and pathological Token dimensions.

## 0.4.13 — Denser Base Without Clamp

- Restored only the denser acrylic plate requested from 0.4.11: stronger top material, underside depth, and refractive outer edge.
- Kept enough transparency for the battlemap to remain visible beneath the fixed ground plate.
- Kept the 0.4.12 clamp removal complete: no crossbar, rectangular bracket, side jaws, or clamp-only geometry metrics were restored.
- Retained the original compact top connector sleeve and every unrelated 0.4.10–0.4.12 improvement.
- Added a regression assertion for the denser plate plus an exact three-polygon assertion preventing the removed clamp geometry from returning.

## 0.4.12 — Remove Top Clamp Experiment

- Removed the complete 0.4.11 crossbar-and-jaw clamp experiment after in-game evaluation showed an unnatural rectangular bracket beneath circular Token art.
- Restored the original compact top connector sleeve used by 0.4.10.
- Restored the original 0.4.10 acrylic plate top, underside, and refractive-edge opacity treatment.
- Removed all clamp-only metrics, renderer geometry, documentation claims, and regression assertions.
- Kept the stronger 0.4.10 height-shadow system and every unrelated visual, HUD, movement-label, and Z Scatter improvement unchanged.

## 0.4.11 — Denser Base and Physical Token Clamp

- Increased the acrylic plate's top and underside material density so the fixed ground base has a clearer physical presence while the map remains visible beneath it.
- Strengthened the plate's refractive outer edge without changing the shaft's restrained transparent treatment.
- Rebuilt the top attachment as a load-bearing sleeve, a wide crossbar, and two short acrylic jaws which visibly cradle the Token rim.
- Positioned the crossbar just outside the Token's lower edge and let same-height Token art naturally cover the jaw tips, creating a seated clamp instead of a kite-string silhouette.
- Scaled clamp span, depth, and jaw length from grid and Token visual size with finite caps for normal, multi-grid, and pathological Token dimensions.
- Kept every new part inside the existing non-interactive body/specular PIXI.Graphics pair with no document, hit-area, movement, or rule changes.
- Added regression coverage for plate density, six-part stand geometry, clamp width, clamp scaling, and bounded connector metrics.

## 0.4.10 — Strong Height Shadows

- Reworked the height-cast shadow into a much darker, higher-contrast three-layer MULTIPLY treatment that remains readable on bright and textured maps.
- Increased cast-shadow travel and allowed it to extend beyond the original Token footprint instead of losing most of its height offset to footprint clamping.
- Reduced high-elevation size and opacity falloff so the cast shadow remains broad and visible at common tactical heights.
- Strengthened the fixed acrylic-base contact shadow and its dense core while keeping both inside the true ground footprint.
- Raised the default Shadow Opacity from 0.50 to 0.65; the existing client setting still provides the full 0–1 adjustment range.
- Preserved the event-free PIXI.Graphics implementation with no BlurFilter, per-frame geometry rebuild, Token data write, or rule impact.
- Added regression thresholds for cast distance, visible area, effective layered opacity, contact strength, and finite extreme-height bounds.

## 0.4.9 — Lifted Labels During Movement

- Fixed Foundry/PF2e native elevation labels dropping to the acrylic base while an airborne Token is dragged or animated to a new grid position with Z Scatter active.
- Represented Z Scatter's intentional movement suspension as an authoritative zero-offset layout, allowing the airborne lift to remain composed without retaining a stale scatter offset.
- Kept label text, unit formatting, styling, visibility, alpha, and native relative placement under Foundry/PF2e ownership.
- Preserved Z Scatter's hit-area ownership during movement and restored its latest scattered layout after movement ends.
- Added renderer-level and full Canvas-visual regression coverage for the movement transition.

## 0.4.8 — Stronger Ambient Float

- Increased the airborne Token bob amplitude by approximately 25% for a more readable hovering effect.
- Preserved the existing low-frequency period, eased startup envelope, deterministic phase separation, and shared ticker.
- Kept the motion bounded to 1.75 Canvas pixels and disabled under reduced-motion preferences.
- Continued moving native artwork UI and elevation labels with the same ambient offset without rebuilding stand, shadow, or projection geometry.
- Added regression coverage for the stronger but restrained elevation-responsive amplitude.

## 0.4.7 — Z Scatter Label Refresh Ordering

- Fixed native elevation labels dropping back to the acrylic base when the Z Scatter toolbar toggle refreshed every Token.
- Recognized a confirmed Foundry core geometry refresh as an authoritative transition even when it runs before Z Scatter's `refreshToken` hook.
- Immediately recomposed the known Z Scatter base, airborne lift, and native label position instead of permanently yielding ownership.
- Preserved the existing last-write protection for unconfirmed third-party positions and kept label content, style, alpha, and visibility untouched.
- Added a deterministic regression test for the core-before-Z-Scatter refresh order and exact teardown restoration.

## 0.4.6 — Visible Acrylic Base Layering

- Made each acrylic stand container participate in Primary Canvas sorting at its flying Token's current animated visual elevation.
- Placed the stand above lower and ground Token artwork while retaining a pre-Token sort layer so same-height Token art remains on top.
- Invalidated Primary sorting only when the displayed elevation changes, including smooth takeoff and landing animation frames.
- Kept the stand non-interactive and left `TokenDocument.elevation`, movement, hit areas, and PF2e rules untouched.
- Added regression coverage for ground/stand/flying-art order, animation-height updates, sort invalidation, and document-data immutability.

## 0.4.5 — Full HUD on Activation

- Removed the compact summary-bar state, disclosure action, chevron, and all expand/collapse transitions from the Airspace HUD.
- Made the Token-control button open the complete height axis, nearby relations, and Token list immediately.
- Preserved click-to-open lifecycle behavior: the HUD still starts closed and closes on every Scene change.
- Kept adaptive uncapped sizing, filters, dragging, Token focus, and the explicit close action in the single full-view state.
- Added regression coverage proving that no collapsed-summary path remains in the ApplicationV2 actions or Handlebars template.

## 0.4.4 — Native Labels Follow Lifted Tokens

- Made Foundry/PF2e native elevation tooltip and Level-indicator positions follow the exact airborne Mesh lift while retaining their original relative placement above Token artwork.
- Synchronized label position through fallback and core elevation animation, ambient bobbing, horizontal movement, redraws, and Z Scatter layout changes.
- Kept label text, units, font styling, alpha, and renderable state under exclusive Foundry/PF2e ownership; the removed `Enable Height Label` setting remains removed.
- Restored reversible per-property position ownership so teardown and landing return labels to their current core/Z Scatter bases without overwriting later third-party writes.
- Added regression coverage for lifted placement, core tooltip refreshes, Z Scatter rebasing, animation alpha preservation, ambient motion, and exact teardown restoration.

## 0.4.3 — Click-to-Open Airspace HUD

- Removed every automatic HUD-open path from world readiness, Canvas readiness, Scene changes, and runtime setting changes.
- Made a newly viewed Scene always start with the Airspace HUD closed; the Token-control button is now the only opening path.
- Kept availability reconciliation limited to refreshing an already user-opened HUD or closing it when the module/HUD setting becomes unavailable.
- Added isolated lifecycle regression tests proving that valid settings never create a window and Scene changes close any carried HUD state.

## 0.4.2 — Untouched Native Elevation Labels

- Removed all writes to Foundry/PF2e native elevation tooltip and Level-indicator positions; they now remain exactly where core places them instead of following lifted Token artwork.
- Removed native elevation-label alpha animation and renderable toggling so the module cannot change their appearance or visibility.
- Removed the obsolete `Enable Height Label` client setting; Foundry/PF2e now has exclusive ownership of native height-number presentation.
- Kept airborne Mesh lift, artwork UI, acrylic stands, shadows, HUD data, and Z Scatter selection compatibility independent from native elevation UI.
- Added regression coverage for position, visibility, alpha, core refreshes, animation, Z Scatter layouts, later third-party writes, and teardown.

## 0.4.1 — Adaptive HUD and Z Scatter Compatibility

- Replaced absolute 5 ft pixel spacing with compact relative visual levels while preserving every Token's exact elevation and strict high-to-low ordering.
- Removed expanded-HUD width and height caps so the ApplicationV2 window grows to contain every filtered Token without an internal axis viewport.
- Shortened altitude Token cards from 225 px to 132 px and retained independent horizontal lanes for Tokens at the same elevation.
- Added an optional, feature-detected Z Scatter 2.2.4 adapter which composes its visual offset into the acrylic base, lifted Mesh, and native Token UI without reading private module state.
- Added a reversible union hit area so both the scattered ground footprint and visibly lifted airborne art can select and drag the same Token when air and ground artwork overlap.
- Suspended compatibility ownership during Foundry movement animation, yielded to unknown third-party hit areas, and restored the latest Z Scatter layout on teardown.
- Added focused regression coverage for relative layout growth, uncapped HUD dimensions, exact external-layout composition, dual-region selection, movement suspension, and late Z Scatter writes.

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
