const SHADOW_COLOR = 0x071014;

/** Soft projected shadow renderer; avoids one BlurFilter allocation per Token. */
export class ShadowRenderer {
  constructor(graphics) {
    this.graphics = graphics;
    graphics.eventMode = "none";
    graphics.blendMode = globalThis.PIXI?.BLEND_MODES?.MULTIPLY ?? graphics.blendMode ?? 0;
    graphics.zIndex = 0;
  }

  render(metrics, enabled) {
    const graphics = this.graphics;
    graphics.clear();
    const shadow = metrics.shadow;
    graphics.visible = Boolean(
      metrics.flying
      && enabled
      && ((shadow.alpha > 0) || (shadow.contactAlpha > 0) || (shadow.contactCoreAlpha > 0))
    );
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
    } = shadow;

    // Three nested ellipses approximate a soft penumbra without allocating a
    // BlurFilter per Token. Deliberately strong MULTIPLY weights keep the cast
    // shadow readable on bright, textured battlemaps and at high elevation.
    graphics.beginFill(SHADOW_COLOR, alpha * 0.28)
      .drawEllipse(x, y, radiusX * 1.24, radiusY * 1.34)
      .endFill();
    graphics.beginFill(SHADOW_COLOR, alpha * 0.46)
      .drawEllipse(x, y, radiusX * 1.07, radiusY * 1.12)
      .endFill();
    graphics.beginFill(SHADOW_COLOR, alpha * 0.68)
      .drawEllipse(x, y, radiusX * 0.84, radiusY * 0.84)
      .endFill();

    // The outer contact shadow marks the exact ground footprint. A tighter
    // core supplies physical weight at the acrylic plate without using a
    // per-Token blur filter.
    graphics.beginFill(SHADOW_COLOR, contactAlpha * 0.76)
      .drawEllipse(contactX, contactY, contactRadiusX * 1.12, contactRadiusY * 1.16)
      .endFill();
    graphics.beginFill(
      SHADOW_COLOR,
      finiteOr(shadow.contactCoreAlpha, contactAlpha * 0.94)
    ).drawEllipse(
      contactX,
      contactY,
      finiteOr(shadow.contactCoreRadiusX, contactRadiusX * 0.54),
      finiteOr(shadow.contactCoreRadiusY, contactRadiusY * 0.62)
    ).endFill();
  }
}

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
