const PROJECTION_LINE_COLOR = 0x9ee9f5;
const PROJECTION_MARKER_COLOR = 0xd8fbff;

/** Draws an exact vertical ground marker and a manually segmented PIXI line. */
export class ProjectionRenderer {
  constructor(graphics) {
    this.graphics = graphics;
    graphics.eventMode = "none";
    graphics.zIndex = 10;
  }

  render(metrics, enabled) {
    const graphics = this.graphics;
    graphics.clear();
    graphics.visible = metrics.flying && enabled;
    if (!graphics.visible) return;

    const { x, startY, endY, markerRadius, dashLength, gapLength, lineWidth, alpha } = metrics.projection;
    drawVerticalDashedLine(graphics, {
      x,
      startY,
      endY,
      dashLength,
      gapLength,
      width: lineWidth,
      color: PROJECTION_LINE_COLOR,
      alpha: alpha * 0.7
    });

    graphics.lineStyle(Math.max(1.5, lineWidth), PROJECTION_MARKER_COLOR, Math.min(1, alpha * 1.12))
      .drawCircle(x, endY, markerRadius);
    graphics.beginFill(PROJECTION_MARKER_COLOR, alpha * 0.08)
      .drawCircle(x, endY, markerRadius * 0.78)
      .endFill();
  }
}

/** Exported for deterministic geometry tests. */
export function drawVerticalDashedLine(graphics, {
  x,
  startY,
  endY,
  dashLength,
  gapLength,
  width,
  color,
  alpha
}) {
  const start = Number(startY);
  const end = Number(endY);
  const dash = Number(dashLength);
  const gap = Number(gapLength);
  if (![x, start, end, dash, gap, width, alpha].every(Number.isFinite)) return;
  if ((end <= start) || (dash <= 0) || (gap < 0) || (width <= 0) || (alpha <= 0)) return;

  graphics.lineStyle(width, color, alpha);
  for (let y = start; y < end; y += dash + gap) {
    graphics.moveTo(x, y).lineTo(x, Math.min(y + dash, end));
  }
}
