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

    const { centerX, tokenCenterY, tokenBottomY, groundY, width, opacity } = metrics.stand;
    const glow = metrics.liftGlow;

    // A faint socket at the Token center visually anchors the stand while the
    // stronger acrylic shaft begins at the lower edge to keep artwork legible.
    graphics.beginFill(LIFT_GLOW_COLOR, glow.alpha)
      .drawEllipse(glow.x, glow.y, glow.radiusX, glow.radiusY)
      .endFill();
    graphics.lineStyle(Math.max(1, width * 0.42), STAND_BODY_COLOR, opacity * 0.16)
      .moveTo(centerX, tokenCenterY)
      .lineTo(centerX, tokenBottomY);

    graphics.lineStyle(width + 2, STAND_EDGE_COLOR, opacity * 0.38)
      .moveTo(centerX, tokenBottomY)
      .lineTo(centerX, groundY);
    graphics.lineStyle(width, STAND_BODY_COLOR, opacity * 0.72)
      .moveTo(centerX, tokenBottomY)
      .lineTo(centerX, groundY);
    graphics.lineStyle(Math.max(1, width * 0.22), STAND_HIGHLIGHT_COLOR, opacity * 0.82)
      .moveTo(centerX - (width * 0.12), tokenBottomY)
      .lineTo(centerX - (width * 0.12), groundY);

    graphics.lineStyle(0);
    graphics.beginFill(STAND_BODY_COLOR, opacity * 0.3)
      .drawEllipse(metrics.base.x, metrics.base.y, metrics.base.radiusX, metrics.base.radiusY)
      .endFill();
    graphics.beginFill(STAND_HIGHLIGHT_COLOR, opacity * 0.34)
      .drawCircle(centerX, tokenCenterY, Math.max(1.5, width * 0.48))
      .endFill();
  }
}
