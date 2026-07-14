const SHADOW_COLOR = 0x061014;

/**
 * Directional top-down shadow renderer.
 *
 * Graphics owns only the projected acrylic rod and its small ground contact.
 * When supplied, two PIXI Sprites reuse the Token mesh texture so the cast
 * shadow preserves the real transparent silhouette instead of approximating
 * it with concentric circles. No texture, RenderTexture, or filter is created.
 */
export class ShadowRenderer {
  constructor(graphics, { penumbraSprite = null, coreSprite = null } = {}) {
    this.graphics = graphics;
    this.penumbraSprite = penumbraSprite;
    this.coreSprite = coreSprite;

    graphics.eventMode = "none";
    graphics.blendMode = multiplyBlend(graphics.blendMode);
    // The projected rod must remain visible where it crosses the Token cast,
    // especially at 10-40 ft. It still remains below real Token artwork because
    // the owning Primary container uses the pre-Token sort layer.
    graphics.zIndex = 2;
    configureStaticSprite(penumbraSprite, -1);
    configureStaticSprite(coreSprite, 1);
  }

  render(metrics, enabled, {
    texture = null,
    rotation = 0,
    anchorX = 0.5,
    anchorY = 0.5
  } = {}) {
    const graphics = this.graphics;
    const shadow = metrics.shadow;
    graphics.clear();

    const visible = Boolean(
      metrics.flying
      && enabled
      && ((shadow.alpha > 0)
        || (shadow.shaftAlpha > 0)
        || (shadow.contactAlpha > 0)
        || (shadow.contactCoreAlpha > 0))
    );
    graphics.visible = visible;
    if (!visible) {
      hideSprite(this.penumbraSprite);
      hideSprite(this.coreSprite);
      return;
    }

    drawProjectedRod(graphics, shadow);
    drawRodContact(graphics, shadow);

    const canUseTexture = isUsableTexture(texture)
      && this.penumbraSprite
      && this.coreSprite;
    if (canUseTexture) {
      const pose = { texture, rotation, anchorX, anchorY };
      drawTextureProjection(this.penumbraSprite, shadow, pose, {
        expansion: 1 + finiteOr(shadow.softness, 0),
        alphaWeight: 0.26,
        trail: finiteOr(shadow.softness, 0) * finiteOr(shadow.width, 0) * 0.08
      });
      drawTextureProjection(this.coreSprite, shadow, pose, {
        expansion: 1,
        alphaWeight: 0.82,
        trail: 0
      });
      return;
    }

    hideSprite(this.penumbraSprite);
    hideSprite(this.coreSprite);
    drawFallbackProjection(graphics, shadow);
  }
}

function drawProjectedRod(graphics, shadow) {
  const startX = finiteOr(shadow?.shaftStartX, shadow?.contactX);
  const startY = finiteOr(shadow?.shaftStartY, shadow?.contactY);
  const endX = finiteOr(shadow?.shaftEndX, shadow?.x);
  const endY = finiteOr(shadow?.shaftEndY, shadow?.y);
  const alpha = clampedAlpha(shadow?.shaftAlpha);
  const width = clamp(finiteOr(shadow?.shaftWidth, 0), 0, 64);
  const dx = endX - startX;
  const dy = endY - startY;
  const length = Math.hypot(dx, dy);
  if (!(length > 0) || !(alpha > 0) || !(width > 0)) return;

  const normalX = -dy / length;
  const normalY = dx / length;
  const softness = clamp(finiteOr(shadow?.softness, 0), 0, 0.5);
  drawRodPolygon(graphics, {
    startX,
    startY,
    endX,
    endY,
    normalX,
    normalY,
    startHalfWidth: width * (0.62 + softness),
    endHalfWidth: width * (0.8 + (softness * 1.5)),
    alpha: alpha * 0.38
  });
  drawRodPolygon(graphics, {
    startX,
    startY,
    endX,
    endY,
    normalX,
    normalY,
    startHalfWidth: width * 0.28,
    endHalfWidth: width * (0.36 + (softness * 0.35)),
    alpha: alpha * 0.92
  });
}

function drawRodPolygon(graphics, data) {
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

function drawRodContact(graphics, shadow) {
  const alpha = clampedAlpha(shadow?.contactAlpha);
  const coreAlpha = clampedAlpha(shadow?.contactCoreAlpha);
  const x = finiteOr(shadow?.contactX, 0);
  const y = finiteOr(shadow?.contactY, 0);
  const radiusX = Math.max(0, finiteOr(shadow?.contactRadiusX, 0));
  const radiusY = Math.max(0, finiteOr(shadow?.contactRadiusY, 0));
  if ((alpha > 0) && (radiusX > 0) && (radiusY > 0)) {
    graphics.beginFill(SHADOW_COLOR, alpha * 0.72)
      .drawEllipse(x, y, radiusX, radiusY)
      .endFill();
  }
  const coreRadiusX = Math.max(0, finiteOr(shadow?.contactCoreRadiusX, 0));
  const coreRadiusY = Math.max(0, finiteOr(shadow?.contactCoreRadiusY, 0));
  if ((coreAlpha > 0) && (coreRadiusX > 0) && (coreRadiusY > 0)) {
    graphics.beginFill(SHADOW_COLOR, coreAlpha)
      .drawEllipse(x, y, coreRadiusX, coreRadiusY)
      .endFill();
  }
}

function drawTextureProjection(sprite, shadow, pose, { expansion, alphaWeight, trail }) {
  const directionX = finiteOr(shadow?.directionX, 1);
  const directionY = finiteOr(shadow?.directionY, 0);
  sprite.texture = pose.texture;
  sprite.anchor?.set?.(
    clamp(finiteOr(pose.anchorX, 0.5), 0, 1),
    clamp(finiteOr(pose.anchorY, 0.5), 0, 1)
  );
  setPosition(
    sprite,
    finiteOr(shadow?.x, 0) + (directionX * trail),
    finiteOr(shadow?.y, 0) + (directionY * trail)
  );
  sprite.width = Math.max(0, finiteOr(shadow?.width, 0) * expansion);
  sprite.height = Math.max(0, finiteOr(shadow?.height, 0) * expansion);
  sprite.rotation = finiteOr(pose.rotation, 0);
  sprite.tint = SHADOW_COLOR;
  sprite.alpha = clampedAlpha(shadow?.alpha) * alphaWeight;
  sprite.visible = (sprite.width > 0) && (sprite.height > 0) && (sprite.alpha > 0);
}

function drawFallbackProjection(graphics, shadow) {
  const alpha = clampedAlpha(shadow?.alpha);
  const radiusX = Math.max(0, finiteOr(shadow?.radiusX, 0));
  const radiusY = Math.max(0, finiteOr(shadow?.radiusY, 0));
  if (!(alpha > 0) || !(radiusX > 0) || !(radiusY > 0)) return;
  const softness = clamp(finiteOr(shadow?.softness, 0), 0, 0.5);
  const x = finiteOr(shadow?.x, 0);
  const y = finiteOr(shadow?.y, 0);
  graphics.beginFill(SHADOW_COLOR, alpha * 0.24)
    .drawEllipse(x, y, radiusX * (1 + softness), radiusY * (1 + softness))
    .endFill();
  graphics.beginFill(SHADOW_COLOR, alpha * 0.76)
    .drawEllipse(x, y, radiusX, radiusY)
    .endFill();
}

function configureStaticSprite(sprite, zIndex) {
  if (!sprite) return;
  sprite.eventMode = "none";
  sprite.blendMode = multiplyBlend(sprite.blendMode);
  sprite.zIndex = zIndex;
  sprite.visible = false;
  sprite.tint = SHADOW_COLOR;
}

function hideSprite(sprite) {
  if (sprite) sprite.visible = false;
}

function isUsableTexture(texture) {
  return !!texture && !texture.destroyed;
}

function multiplyBlend(fallback) {
  return globalThis.PIXI?.BLEND_MODES?.MULTIPLY ?? fallback ?? 0;
}

function setPosition(displayObject, x, y) {
  if (displayObject.position?.set) displayObject.position.set(x, y);
  else {
    displayObject.x = x;
    displayObject.y = y;
  }
}

function clampedAlpha(value) {
  return clamp(finiteOr(value, 0), 0, 1);
}

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
