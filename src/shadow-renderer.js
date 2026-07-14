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
      && ((shadow.alpha > 0)
        || (shadow.shaftAlpha > 0)
        || (shadow.contactAlpha > 0)
        || (shadow.contactCoreAlpha > 0))
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

    // The vertical acrylic shaft casts a separate ground-plane shadow along
    // the same light vector as the airborne model. A broad penumbra plus a
    // tapered core creates depth without a per-Token BlurFilter.
    drawShaftShadow(graphics, shadow);

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

function drawShaftShadow(graphics, shadow) {
  const startX = finiteOr(shadow?.shaftStartX, shadow?.contactX);
  const startY = finiteOr(shadow?.shaftStartY, shadow?.contactY);
  const endX = finiteOr(shadow?.shaftEndX, shadow?.x);
  const endY = finiteOr(shadow?.shaftEndY, shadow?.y);
  const alpha = Math.min(1, Math.max(0, finiteOr(shadow?.shaftAlpha, 0)));
  const width = Math.min(64, Math.max(0, finiteOr(shadow?.shaftWidth, 0)));
  const dx = endX - startX;
  const dy = endY - startY;
  const length = Math.hypot(dx, dy);
  if (!(length > 0) || !(alpha > 0) || !(width > 0)) return;

  const normalX = -dy / length;
  const normalY = dx / length;
  drawTaperedPolygon(graphics, {
    startX,
    startY,
    endX,
    endY,
    normalX,
    normalY,
    startHalfWidth: width * 0.65,
    endHalfWidth: width * 1.1,
    alpha: alpha * 0.38
  });
  drawTaperedPolygon(graphics, {
    startX,
    startY,
    endX,
    endY,
    normalX,
    normalY,
    startHalfWidth: width * 0.28,
    endHalfWidth: width * 0.5,
    alpha: alpha * 0.72
  });
}

function drawTaperedPolygon(graphics, data) {
  const {
    startX,
    startY,
    endX,
    endY,
    normalX,
    normalY,
    startHalfWidth,
    endHalfWidth,
    alpha
  } = data;
  const points = [
    startX - (normalX * startHalfWidth), startY - (normalY * startHalfWidth),
    startX + (normalX * startHalfWidth), startY + (normalY * startHalfWidth),
    endX + (normalX * endHalfWidth), endY + (normalY * endHalfWidth),
    endX - (normalX * endHalfWidth), endY - (normalY * endHalfWidth)
  ];
  graphics.beginFill(SHADOW_COLOR, alpha);
  if (typeof graphics.drawPolygon === "function") graphics.drawPolygon(points);
  else {
    graphics.moveTo(points[0], points[1]);
    for (let index = 2; index < points.length; index += 2) {
      graphics.lineTo(points[index], points[index + 1]);
    }
    graphics.lineTo(points[0], points[1]);
  }
  graphics.endFill();
}

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
