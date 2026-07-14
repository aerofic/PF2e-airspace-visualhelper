const PROJECTION_LINE_COLOR = 0x7faab2;
const PROJECTION_MARKER_COLOR = 0xb9d8dc;
const FOOTPRINT_COLOR = 0x9cc7cc;
const MAX_DASH_SEGMENTS = 512;

/** Draws a ground marker and a manually segmented PIXI projection line. */
export class ProjectionRenderer {
  constructor(graphics) {
    this.graphics = graphics;
    graphics.eventMode = "none";
    graphics.zIndex = 10;
  }

  render(metrics, enabled, {
    standEnabled = false,
    emphasized = false,
    footprintShape = null
  } = {}) {
    const graphics = this.graphics;
    graphics.clear();
    graphics.visible = metrics.flying
      && enabled
      && ((metrics.projection.alpha > 0) || (metrics.projection.reticleAlpha > 0));
    if (!graphics.visible) return;

    const {
      startX,
      startY,
      endX,
      endY,
      markerRadius,
      markerRadiusX = markerRadius,
      markerRadiusY = markerRadius,
      dashLength,
      gapLength,
      lineWidth,
      alpha,
      footprint,
      reticleAlpha = 0
    } = metrics.projection;

    // This is a visual cue only. Foundry's real border, hitArea and snapping
    // remain on the Token placeable at the same ground footprint.
    drawFootprintReticle(graphics, {
      footprint,
      footprintShape,
      dashLength,
      gapLength,
      alpha: Math.min(0.42, reticleAlpha * (emphasized ? 3.8 : 1)),
      width: emphasized ? Math.max(1.5, lineWidth * 0.9) : Math.max(1, lineWidth * 0.58)
    });

    // When the acrylic stand is present it already communicates the vertical
    // axis. Keep the projection guide restrained so the two do not combine
    // into the old bright cyan "laser rod".
    const guideAlpha = alpha * (standEnabled ? 0.18 : 0.72);
    drawDashedLine(graphics, {
      startX,
      startY,
      endX,
      endY,
      dashLength,
      gapLength,
      width: lineWidth,
      color: PROJECTION_LINE_COLOR,
      alpha: guideAlpha
    });

    const markerAlpha = alpha * (standEnabled ? 0.44 : 0.82);
    graphics.lineStyle(Math.max(1.15, lineWidth * 0.82), PROJECTION_MARKER_COLOR, markerAlpha)
      .drawEllipse(endX, endY, markerRadiusX, markerRadiusY);
    graphics.beginFill(PROJECTION_MARKER_COLOR, markerAlpha * 0.09)
      .drawEllipse(endX, endY, markerRadiusX * 0.78, markerRadiusY * 0.72)
      .endFill();
  }
}

/** Draw either Foundry's local Token shape or a bounded dashed fallback. */
export function drawFootprintReticle(graphics, {
  footprint,
  footprintShape,
  dashLength,
  gapLength,
  alpha,
  width
}) {
  if (!Number.isFinite(alpha) || (alpha <= 0) || !Number.isFinite(width) || (width <= 0)) return;
  if (footprintShape && (typeof graphics.drawShape === "function")) {
    try {
      graphics.lineStyle(width, FOOTPRINT_COLOR, alpha).drawShape(footprintShape);
      return;
    } catch (_error) {
      // A later module may expose a non-PIXI shape. Fall back without mutating
      // it or Foundry's actual Token hit area.
    }
  }

  const x = Number(footprint?.x);
  const y = Number(footprint?.y);
  const footprintWidth = Number(footprint?.width);
  const footprintHeight = Number(footprint?.height);
  if (![x, y, footprintWidth, footprintHeight].every(Number.isFinite)) return;
  if ((footprintWidth <= 0) || (footprintHeight <= 0)) return;
  const inset = Math.min(Math.max(width, 1), footprintWidth / 4, footprintHeight / 4);
  const left = x + inset;
  const top = y + inset;
  const right = x + footprintWidth - inset;
  const bottom = y + footprintHeight - inset;
  for (const [startX, startY, endX, endY] of [
    [left, top, right, top],
    [right, top, right, bottom],
    [right, bottom, left, bottom],
    [left, bottom, left, top]
  ]) {
    drawDashedLine(graphics, {
      startX,
      startY,
      endX,
      endY,
      dashLength,
      gapLength,
      width,
      color: FOOTPRINT_COLOR,
      alpha
    });
  }
}

/** Exported for deterministic geometry tests. */
export function drawDashedLine(graphics, {
  startX,
  startY,
  endX,
  endY,
  dashLength,
  gapLength,
  width,
  color,
  alpha
}) {
  const x1 = Number(startX);
  const y1 = Number(startY);
  const x2 = Number(endX);
  const y2 = Number(endY);
  const dash = Number(dashLength);
  const gap = Number(gapLength);
  if (![x1, y1, x2, y2, dash, gap, width, alpha].every(Number.isFinite)) return;
  if ((dash <= 0) || (gap < 0) || (width <= 0) || (alpha <= 0)) return;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || (length <= 0)) return;
  const period = dash + gap;
  if (!Number.isFinite(period) || (period <= 0)) return;
  const unitX = dx / length;
  const unitY = dy / length;
  const requestedSegments = Math.ceil(length / period);
  const segmentCount = Math.min(
    Number.isFinite(requestedSegments) ? requestedSegments : MAX_DASH_SEGMENTS,
    MAX_DASH_SEGMENTS
  );
  if (segmentCount <= 0) return;

  // Preserve the dash/gap ratio while spreading at most 512 segments across
  // extreme custom geometry. This bounds CPU and PIXI command allocation.
  const compressed = requestedSegments > MAX_DASH_SEGMENTS;
  const step = compressed ? length / segmentCount : period;
  const segmentLength = compressed ? step * (dash / period) : dash;

  graphics.lineStyle(width, color, alpha);
  for (let index = 0; index < segmentCount; index += 1) {
    const distance = index * step;
    const segmentEnd = Math.min(distance + segmentLength, length);
    graphics
      .moveTo(x1 + (unitX * distance), y1 + (unitY * distance))
      .lineTo(x1 + (unitX * segmentEnd), y1 + (unitY * segmentEnd));
  }
}

/** Backward-compatible vertical helper retained for integrations and tests. */
export function drawVerticalDashedLine(graphics, {
  x,
  startY,
  endY,
  ...options
}) {
  return drawDashedLine(graphics, {
    startX: x,
    startY,
    endX: x,
    endY,
    ...options
  });
}
