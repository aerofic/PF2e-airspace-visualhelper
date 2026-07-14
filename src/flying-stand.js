const STAND_EDGE_COLOR = 0x72bcd4;
const STAND_BODY_COLOR = 0xd5f8ff;
const STAND_HIGHLIGHT_COLOR = 0xffffff;
const LIFT_GLOW_COLOR = 0xbcefff;

/** Draws one acrylic tabletop stand without reading any Foundry document. */
export class FlyingStand {
  constructor(graphics) {
    this.graphics = graphics;
    graphics.eventMode = "none";
    graphics.zIndex = 20;
  }

  render(metrics, enabled) {
    const graphics = this.graphics;
    graphics.clear();
    graphics.visible = metrics.flying && enabled && (metrics.stand.opacity > 0);
    if (!graphics.visible) return;

    const { topX, topY, baseX, baseY, length, width, opacity } = metrics.stand;
    const glow = metrics.liftGlow;
    const dx = baseX - topX;
    const dy = baseY - topY;
    const normalX = length > 0 ? -dy / length : 0;
    const normalY = length > 0 ? dx / length : 0;
    const highlightOffset = width * 0.18;

    // The Token art is rendered at the glow. The document footprint and this
    // acrylic base remain fixed at the original grid position.
    graphics.beginFill(LIFT_GLOW_COLOR, glow.alpha)
      .drawEllipse(glow.x, glow.y, glow.radiusX, glow.radiusY)
      .endFill();

    // Four translucent strokes create a readable acrylic shaft without a
    // per-Token BlurFilter. The off-axis highlight makes the lean unambiguous.
    graphics.lineStyle(width + 5, LIFT_GLOW_COLOR, opacity * 0.22)
      .moveTo(topX, topY)
      .lineTo(baseX, baseY);
    graphics.lineStyle(width + 2, STAND_EDGE_COLOR, Math.min(0.85, opacity * 1.45))
      .moveTo(topX, topY)
      .lineTo(baseX, baseY);
    graphics.lineStyle(width, STAND_BODY_COLOR, Math.min(0.74, opacity * 1.08))
      .moveTo(topX, topY)
      .lineTo(baseX, baseY);
    graphics.lineStyle(Math.max(1, width * 0.24), STAND_HIGHLIGHT_COLOR, Math.min(0.94, opacity * 2))
      .moveTo(topX + (normalX * highlightOffset), topY + (normalY * highlightOffset))
      .lineTo(baseX + (normalX * highlightOffset), baseY + (normalY * highlightOffset));

    graphics.lineStyle(0);
    graphics.beginFill(STAND_BODY_COLOR, opacity * 0.34)
      .drawEllipse(metrics.base.x, metrics.base.y, metrics.base.radiusX, metrics.base.radiusY)
      .endFill();
    graphics.lineStyle(Math.max(1.5, width * 0.52), STAND_EDGE_COLOR, Math.min(0.88, opacity * 1.55))
      .drawEllipse(metrics.base.x, metrics.base.y, metrics.base.radiusX, metrics.base.radiusY);
    graphics.lineStyle(Math.max(1, width * 0.2), STAND_HIGHLIGHT_COLOR, Math.min(0.78, opacity * 1.35))
      .drawEllipse(
        metrics.base.x - (metrics.base.radiusX * 0.03),
        metrics.base.y - (metrics.base.radiusY * 0.18),
        metrics.base.radiusX * 0.86,
        metrics.base.radiusY * 0.66
      );
    graphics.lineStyle(0);
    graphics.beginFill(STAND_HIGHLIGHT_COLOR, Math.min(0.92, opacity * 1.8))
      .drawCircle(topX, topY, Math.max(2.5, width * 0.56))
      .endFill();
    graphics.beginFill(STAND_HIGHLIGHT_COLOR, Math.min(0.78, opacity * 1.45))
      .drawCircle(baseX, baseY, Math.max(2.25, width * 0.48))
      .endFill();
  }
}
