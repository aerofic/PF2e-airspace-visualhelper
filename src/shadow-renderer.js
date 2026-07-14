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

    // A horizontal Token disc retains a near-identical silhouette from above.
    // Four nested, direction-aligned shapes supply a soft trailing penumbra
    // and dense base-facing edge without a per-Token BlurFilter allocation.
    drawTokenCastShadow(graphics, shadow, { majorScale: 1.18, minorScale: 1.18, weight: 0.2 });
    drawTokenCastShadow(graphics, shadow, { majorScale: 1.07, minorScale: 1.07, weight: 0.42 });
    drawTokenCastShadow(graphics, shadow, { majorScale: 0.94, minorScale: 0.94, weight: 0.68 });
    drawTokenCastShadow(graphics, shadow, {
      majorScale: 0.78,
      minorScale: 0.78,
      weight: 0.86,
      offsetAlong: -radiusX * 0.09
    });

    // The plate contact remains concentric with the Token. Most of these fills
    // sit behind the artwork; only a restrained grounding halo is visible.
    graphics.beginFill(SHADOW_COLOR, contactAlpha * 0.76)
      .drawEllipse(contactX, contactY, contactRadiusX * 1.04, contactRadiusY * 1.04)
      .endFill();
    graphics.beginFill(
      SHADOW_COLOR,
      finiteOr(shadow.contactCoreAlpha, contactAlpha * 0.94)
    ).drawEllipse(
      contactX,
      contactY,
      finiteOr(shadow.contactCoreRadiusX, contactRadiusX * 0.86),
      finiteOr(shadow.contactCoreRadiusY, contactRadiusY * 0.86)
    ).endFill();
  }
}

function drawTokenCastShadow(graphics, shadow, {
  majorScale,
  minorScale,
  weight,
  offsetAlong = 0
}) {
  const baseX = finiteOr(shadow?.contactX, shadow?.shaftStartX);
  const baseY = finiteOr(shadow?.contactY, shadow?.shaftStartY);
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
  const segments = 32;
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
