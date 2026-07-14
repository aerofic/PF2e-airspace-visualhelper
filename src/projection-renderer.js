const PROJECTION_LINE_COLOR = 0x9ee9f5;
const PROJECTION_MARKER_COLOR = 0xd8fbff;
const MAX_DASH_SEGMENTS = 512;

/** Draws a ground marker and a manually segmented PIXI projection line. */
export class ProjectionRenderer {
  constructor(graphics) {
    this.graphics = graphics;
    graphics.eventMode = "none";
    graphics.zIndex = 10;
  }

  render(metrics, enabled) {
    const graphics = this.graphics;
    graphics.clear();
    graphics.visible = metrics.flying && enabled && (metrics.projection.alpha > 0);
    if (!graphics.visible) return;

    const {
      startX,
      startY,
      endX,
      endY,
      markerRadius,
      dashLength,
      gapLength,
      lineWidth,
      alpha
    } = metrics.projection;
    drawDashedLine(graphics, {
      startX,
      startY,
      endX,
      endY,
      dashLength,
      gapLength,
      width: lineWidth,
      color: PROJECTION_LINE_COLOR,
      alpha: alpha * 0.86
    });

    graphics.lineStyle(Math.max(1.5, lineWidth), PROJECTION_MARKER_COLOR, Math.min(1, alpha * 1.12))
      .drawCircle(endX, endY, markerRadius);
    graphics.beginFill(PROJECTION_MARKER_COLOR, alpha * 0.14)
      .drawCircle(endX, endY, markerRadius * 0.78)
      .endFill();
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
