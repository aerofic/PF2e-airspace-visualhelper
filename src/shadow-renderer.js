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

    // A rotated four-layer ellipse follows the same light vector as the
    // cylindrical shaft shadow. The dense umbra is shifted toward the base,
    // leaving a softer trailing edge like a solid elevated object.
    drawTokenCastShadow(graphics, shadow, { majorScale: 1.28, minorScale: 1.38, weight: 0.22 });
    drawTokenCastShadow(graphics, shadow, { majorScale: 1.06, minorScale: 1.13, weight: 0.48 });
    drawTokenCastShadow(graphics, shadow, { majorScale: 0.82, minorScale: 0.82, weight: 0.78 });
    drawTokenCastShadow(graphics, shadow, {
      majorScale: 0.62,
      minorScale: 0.62,
      weight: 0.92,
      offsetAlong: -radiusX * 0.12
    });

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
    startHalfWidth: width * 0.8,
    endHalfWidth: width * 1.45,
    alpha: alpha * 0.28
  });
  drawTaperedPolygon(graphics, {
    startX,
    startY,
    endX,
    endY,
    normalX,
    normalY,
    startHalfWidth: width * 0.48,
    endHalfWidth: width * 0.82,
    alpha: alpha * 0.52
  });
  drawTaperedPolygon(graphics, {
    startX,
    startY,
    endX,
    endY,
    normalX,
    normalY,
    startHalfWidth: width * 0.2,
    endHalfWidth: width * 0.4,
    alpha: alpha * 0.82
  });
}

function drawTokenCastShadow(graphics, shadow, {
  majorScale,
  minorScale,
  weight,
  offsetAlong = 0
}) {
  const baseX = finiteOr(shadow?.shaftStartX, shadow?.contactX);
  const baseY = finiteOr(shadow?.shaftStartY, shadow?.contactY);
  const x = finiteOr(shadow?.x, baseX);
  const y = finiteOr(shadow?.y, baseY);
  const dx = x - baseX;
  const dy = y - baseY;
  const length = Math.hypot(dx, dy);
  const axisX = length > 0 ? dx / length : 1;
  const axisY = length > 0 ? dy / length : 0;
  const normalX = -axisY;
  const normalY = axisX;
  const radiusMajor = Math.max(0, finiteOr(shadow?.radiusX, 0) * majorScale);
  const radiusMinor = Math.max(0, finiteOr(shadow?.radiusY, 0) * minorScale);
  const alpha = Math.min(1, Math.max(0, finiteOr(shadow?.alpha, 0) * weight));
  if (!(radiusMajor > 0) || !(radiusMinor > 0) || !(alpha > 0)) return;

  const centerX = x + (axisX * offsetAlong);
  const centerY = y + (axisY * offsetAlong);
  const points = [];
  const segments = 24;
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    const along = Math.cos(angle) * radiusMajor;
    const across = Math.sin(angle) * radiusMinor;
    points.push(
      centerX + (axisX * along) + (normalX * across),
      centerY + (axisY * along) + (normalY * across)
    );
  }
  drawFilledPolygon(graphics, points, alpha);
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
  drawFilledPolygon(graphics, points, alpha);
}

function drawFilledPolygon(graphics, points, alpha) {
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
