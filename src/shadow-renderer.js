const SHADOW_COLOR = 0x061014;

/**
 * Strong takeoff-point shadow renderer.
 *
 * Two PIXI Sprites reuse the Token mesh texture so the ground projection keeps
 * the real transparent silhouette. Graphics is only a no-texture fallback.
 * No stand, base, RenderTexture, or filter is created.
 */
export class ShadowRenderer {
  constructor(graphics, { penumbraSprite = null, coreSprite = null } = {}) {
    this.graphics = graphics;
    this.penumbraSprite = penumbraSprite;
    this.coreSprite = coreSprite;
    this.ambientBase = null;

    graphics.eventMode = "none";
    graphics.blendMode = multiplyBlend(graphics.blendMode);
    graphics.zIndex = 0;
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

    const visible = Boolean(metrics.flying && enabled && (shadow.alpha > 0));
    graphics.visible = visible;
    if (!visible) {
      this.ambientBase = null;
      hideSprite(this.penumbraSprite);
      hideSprite(this.coreSprite);
      return;
    }

    const canUseTexture = isUsableTexture(texture)
      && this.penumbraSprite
      && this.coreSprite;
    if (canUseTexture) {
      const pose = { texture, rotation, anchorX, anchorY };
      drawTextureProjection(this.penumbraSprite, shadow, pose, {
        expansion: 1 + finiteOr(shadow.softness, 0),
        alphaWeight: 0.38,
        trail: finiteOr(shadow.softness, 0) * finiteOr(shadow.width, 0) * 0.02
      });
      drawTextureProjection(this.coreSprite, shadow, pose, {
        expansion: 1,
        alphaWeight: 0.96,
        trail: 0
      });
      this.#captureAmbientBase();
      this.applyAmbient(0);
      return;
    }

    this.ambientBase = null;
    hideSprite(this.penumbraSprite);
    hideSprite(this.coreSprite);
    drawFallbackProjection(graphics, shadow);
  }

  /**
   * Synchronize a sub-pixel center drift, density, and scale with airborne bob
   * without rebuilding PIXI Graphics or leaving the takeoff footprint.
   */
  applyAmbient(offsetY = 0) {
    const base = this.ambientBase;
    if (!base) return;
    const rise = clamp(-finiteOr(offsetY, 0), -3, 3);
    const alphaFactor = clamp(1 - (rise * 0.018), 0.93, 1.05);

    applyAmbientSprite(this.coreSprite, base.core, {
      alphaFactor,
      scale: 1 - (rise * 0.003),
      y: rise * 0.18
    });
    applyAmbientSprite(this.penumbraSprite, base.penumbra, {
      alphaFactor: clamp(alphaFactor * (1 - (rise * 0.006)), 0.9, 1.06),
      scale: 1 - (rise * 0.004),
      y: rise * 0.18
    });
  }

  #captureAmbientBase() {
    this.ambientBase = {
      core: snapshotSprite(this.coreSprite),
      penumbra: snapshotSprite(this.penumbraSprite)
    };
  }
}

function drawTextureProjection(sprite, shadow, pose, { expansion, alphaWeight, trail }) {
  const directionX = finiteOr(shadow?.directionX, 0);
  const directionY = finiteOr(shadow?.directionY, 1);
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
  graphics.beginFill(SHADOW_COLOR, alpha * 0.36)
    .drawEllipse(x, y, radiusX * (1 + softness), radiusY * (1 + softness))
    .endFill();
  graphics.beginFill(SHADOW_COLOR, alpha * 0.92)
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

function snapshotSprite(sprite) {
  return {
    x: finiteOr(sprite?.position?.x ?? sprite?.x, 0),
    y: finiteOr(sprite?.position?.y ?? sprite?.y, 0),
    alpha: clampedAlpha(sprite?.alpha),
    width: Math.max(0, finiteOr(sprite?.width, 0)),
    height: Math.max(0, finiteOr(sprite?.height, 0))
  };
}

function applyAmbientSprite(sprite, base, {
  x = 0,
  y = 0,
  alphaFactor = 1,
  scale = 1
} = {}) {
  if (!sprite || !base) return;
  setPosition(sprite, base.x + x, base.y + y);
  sprite.alpha = clampedAlpha(base.alpha * alphaFactor);
  const safeScale = clamp(finiteOr(scale, 1), 0.96, 1.04);
  sprite.width = base.width * safeScale;
  sprite.height = base.height * safeScale;
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
