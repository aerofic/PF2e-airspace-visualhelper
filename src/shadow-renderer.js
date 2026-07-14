/** Soft projected shadow renderer; avoids one BlurFilter allocation per Token. */
export class ShadowRenderer {
  constructor(graphics) {
    this.graphics = graphics;
    graphics.eventMode = "none";
    graphics.blendMode = PIXI.BLEND_MODES.MULTIPLY;
    graphics.zIndex = 0;
  }

  render(metrics, enabled) {
    const graphics = this.graphics;
    graphics.clear();
    graphics.visible = metrics.flying && enabled;
    if (!graphics.visible) return;

    const { x, y, radiusX, radiusY, alpha } = metrics.shadow;
    graphics.beginFill(0x000000, alpha * 0.16)
      .drawEllipse(x, y, radiusX * 1.24, radiusY * 1.34)
      .endFill();
    graphics.beginFill(0x000000, alpha * 0.3)
      .drawEllipse(x, y, radiusX * 1.08, radiusY * 1.14)
      .endFill();
    graphics.beginFill(0x000000, alpha * 0.48)
      .drawEllipse(x, y, radiusX * 0.88, radiusY * 0.88)
      .endFill();
  }
}
