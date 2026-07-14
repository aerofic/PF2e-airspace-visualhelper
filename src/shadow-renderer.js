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
    graphics.visible = metrics.flying
      && enabled
      && ((metrics.shadow.alpha > 0) || (metrics.shadow.contactAlpha > 0));
    if (!graphics.visible) return;

    const {
      x,
      y,
      radiusX,
      radiusY,
      alpha,
      contactX,
      contactY,
      contactRadiusX,
      contactRadiusY,
      contactAlpha
    } = metrics.shadow;
    graphics.beginFill(0x000000, alpha * 0.3)
      .drawEllipse(x, y, radiusX * 1.24, radiusY * 1.34)
      .endFill();
    graphics.beginFill(0x000000, alpha * 0.62)
      .drawEllipse(x, y, radiusX * 1.08, radiusY * 1.14)
      .endFill();
    graphics.beginFill(0x000000, alpha * 0.92)
      .drawEllipse(x, y, radiusX * 0.88, radiusY * 0.88)
      .endFill();
    // A compact contact shadow keeps the original grid footprint legible even
    // when the softer height shadow drifts with the simulated light direction.
    graphics.beginFill(0x000000, contactAlpha)
      .drawEllipse(contactX, contactY, contactRadiusX, contactRadiusY)
      .endFill();
  }
}
