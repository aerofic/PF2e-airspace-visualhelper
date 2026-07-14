import { VISUAL_EPSILON } from "./constants.js";

const ART_UI_KEYS = ["tooltip", "levelIndicator", "nameplate", "bars", "effects"];
const SIZE_REFRESHED_UI_KEYS = new Set(["tooltip", "levelIndicator", "nameplate"]);

/**
 * Applies a reversible visual offset to Foundry's Primary Token mesh and the
 * non-interactive UI which visually belongs to the artwork.
 *
 * TokenDocument coordinates, the Token container, hit area, border, targeting,
 * ruler, vision source, movement path, and grid snapping remain untouched.
 */
export class TokenLiftRenderer {
  #token;
  #meshTarget;
  #meshScaleTarget;
  #meshAlphaTarget;
  #uiTargets = new Map();
  #enabled = false;
  #offsetX = 0;
  #offsetY = 0;
  #labelOffsetX = 0;
  #labelOffsetY = 0;

  constructor(token) {
    this.#token = token;
    this.#meshTarget = new ReversibleOffsetTarget(() => readTokenCenter(this.#token));
    this.#meshScaleTarget = new ReversibleScaleTarget();
    this.#meshAlphaTarget = new ReversibleAlphaTarget();
    for (const key of ART_UI_KEYS) this.#uiTargets.set(key, new ReversibleOffsetTarget());
  }

  /** Apply the visual pose after Foundry has completed its normal refresh. */
  apply({
    offsetX = 0,
    offsetY = 0,
    scale = 1,
    alpha = 1,
    labelOffsetX = 0,
    labelOffsetY = 0,
    ambientOffsetY = 0
  } = {}, {
    enabled = true,
    meshBaseRefreshed = false,
    meshScaleBaseRefreshed = false,
    meshAlphaBaseRefreshed = false,
    uiBaseRefreshed = false,
    uiRetainsOwnedOffset = false
  } = {}) {
    this.#enabled = !!enabled;
    this.#offsetX = enabled ? finiteOrZero(offsetX) : 0;
    this.#offsetY = enabled ? finiteOrZero(offsetY) : 0;
    this.#labelOffsetX = enabled ? finiteOrZero(labelOffsetX) : 0;
    this.#labelOffsetY = enabled ? finiteOrZero(labelOffsetY) : 0;
    const ambientY = enabled ? finiteOrZero(ambientOffsetY) : 0;
    const mesh = this.#token?.mesh;

    this.#meshTarget.applyXY(
      mesh,
      this.#offsetX,
      this.#offsetY + ambientY,
      meshBaseRefreshed
    );
    this.#meshScaleTarget.apply(mesh, enabled ? scale : 1, meshScaleBaseRefreshed);
    this.#meshAlphaTarget.apply(mesh, enabled ? alpha : 1, meshAlphaBaseRefreshed);
    for (const [key, target] of this.#uiTargets) {
      const isNativeElevationLabel = (key === "tooltip") || (key === "levelIndicator");
      target.applyXY(
        this.#token?.[key],
        this.#offsetX + (isNativeElevationLabel ? this.#labelOffsetX : 0),
        this.#offsetY + ambientY + (isNativeElevationLabel ? this.#labelOffsetY : 0),
        // v14 _refreshSize resets these three container positions; bars and
        // effects only redraw their children and retain their container pose.
        uiBaseRefreshed && SIZE_REFRESHED_UI_KEYS.has(key),
        // In v14 _refreshTooltip derives only levelIndicator.y from the
        // already-lifted tooltip. Other native UI positions are untouched.
        uiRetainsOwnedOffset && (key === "levelIndicator")
      );
    }
  }

  /**
   * Hot path for the shared ambient ticker. It updates only owned positions,
   * creates no per-target pose/options objects, and never rewrites scale or
   * alpha.
   */
  applyAmbient(ambientOffsetY = 0) {
    if (!this.#enabled) return;
    const ambientY = finiteOrZero(ambientOffsetY);
    this.#meshTarget.updateOwnedOffset(
      this.#token?.mesh,
      this.#offsetX,
      this.#offsetY + ambientY
    );
    for (const [key, target] of this.#uiTargets) {
      const isNativeElevationLabel = (key === "tooltip") || (key === "levelIndicator");
      target.updateOwnedOffset(
        this.#token?.[key],
        this.#offsetX + (isNativeElevationLabel ? this.#labelOffsetX : 0),
        this.#offsetY + ambientY + (isNativeElevationLabel ? this.#labelOffsetY : 0)
      );
    }
  }

  /** Rebase only the Primary mesh after Foundry moves it back to token.center. */
  rebaseMeshPosition(ambientOffsetY = 0) {
    if (!this.#enabled) return;
    this.#meshTarget.applyXY(
      this.#token?.mesh,
      this.#offsetX,
      this.#offsetY + finiteOrZero(ambientOffsetY),
      true
    );
  }

  /** Remove only this module's additive pose from every surviving target. */
  restore() {
    this.#meshTarget.restore();
    this.#meshScaleTarget.restore();
    this.#meshAlphaTarget.restore();
    for (const target of this.#uiTargets.values()) target.restore();
    this.#enabled = false;
    this.#offsetX = this.#offsetY = 0;
    this.#labelOffsetX = this.#labelOffsetY = 0;
  }
}

/**
 * Tracks one display object's position without replacing its Point, anchor, or
 * pivot. A centered target stores its base relative to token.center; a local UI
 * target stores its normal local position.
 */
class ReversibleOffsetTarget {
  constructor(referenceProvider = null) {
    this.referenceProvider = referenceProvider;
    this.target = null;
    this.baseX = 0;
    this.baseY = 0;
    this.lastWrittenX = null;
    this.lastWrittenY = null;
    this.ownedX = 0;
    this.ownedY = 0;
    this.lastReferenceX = null;
    this.lastReferenceY = null;
    this.yieldedToLaterWriter = false;
  }

  applyXY(target, ownedX, ownedY, baseRefreshed = false, retainsOwnedOffset = false) {
    if (!target || target.destroyed) {
      if (target !== this.target) this.restore();
      return;
    }

    if (target !== this.target) {
      this.restore();
      this.target = target;
      this.#resetTracking();
    }

    const position = target.position ?? target;
    const currentX = Number(position?.x);
    const currentY = Number(position?.y);
    if (!Number.isFinite(currentX) || !Number.isFinite(currentY)) return;
    let referenceX = currentX;
    let referenceY = currentY;
    if (this.referenceProvider) {
      const reference = this.referenceProvider();
      const providedX = Number(reference?.x);
      const providedY = Number(reference?.y);
      if (Number.isFinite(providedX) && Number.isFinite(providedY)) {
        referenceX = providedX;
        referenceY = providedY;
      }
    }
    const hasLastWrite = this.lastWrittenX !== null;
    const matchesLastWrite = hasLastWrite && positionsEqual(
      currentX,
      currentY,
      this.lastWrittenX,
      this.lastWrittenY
    );
    const referenceChanged = hasLastWrite
      && this.referenceProvider
      && (this.lastReferenceX !== null)
      && !positionsEqual(referenceX, referenceY, this.lastReferenceX, this.lastReferenceY);

    if (!hasLastWrite || baseRefreshed || referenceChanged) {
      // An authoritative core refresh wins even when its new base happens to
      // equal our previous visual write; equality alone cannot disprove it.
      this.#captureBase(currentX, currentY, referenceX, referenceY);
      this.yieldedToLaterWriter = false;
    } else if (!matchesLastWrite) {
      if (retainsOwnedOffset) {
        // Core refreshed local UI content using an already-lifted tooltip.
        // Fold only its known local delta into the unlifted base.
        this.baseX += currentX - this.lastWrittenX;
        this.baseY += currentY - this.lastWrittenY;
        this.yieldedToLaterWriter = false;
      } else {
        // A later module owns this position now. Arbitrary absolute and
        // additive writes cannot be distinguished safely, so yield until a
        // confirmed core base refresh instead of doubling or clobbering it.
        this.yieldedToLaterWriter = true;
        return;
      }
    } else {
      this.yieldedToLaterWriter = false;
    }

    this.ownedX = finiteOrZero(ownedX);
    this.ownedY = finiteOrZero(ownedY);
    const baseX = this.referenceProvider ? referenceX + this.baseX : this.baseX;
    const baseY = this.referenceProvider ? referenceY + this.baseY : this.baseY;
    const x = baseX + this.ownedX;
    const y = baseY + this.ownedY;
    writePosition(target, x, y);
    this.lastWrittenX = x;
    this.lastWrittenY = y;
    this.lastReferenceX = this.referenceProvider ? referenceX : null;
    this.lastReferenceY = this.referenceProvider ? referenceY : null;
  }

  /** Update a proven owned position without recapturing any core base. */
  updateOwnedOffset(target, ownedX, ownedY) {
    if (!target || target.destroyed || (target !== this.target) || (this.lastWrittenX === null)) return;
    const position = target.position ?? target;
    const currentX = Number(position?.x);
    const currentY = Number(position?.y);
    if (!Number.isFinite(currentX) || !Number.isFinite(currentY)) return;
    if (!positionsEqual(currentX, currentY, this.lastWrittenX, this.lastWrittenY)) {
      this.yieldedToLaterWriter = true;
      return;
    }

    const nextOwnedX = finiteOrZero(ownedX);
    const nextOwnedY = finiteOrZero(ownedY);
    const x = currentX - this.ownedX + nextOwnedX;
    const y = currentY - this.ownedY + nextOwnedY;
    this.ownedX = nextOwnedX;
    this.ownedY = nextOwnedY;
    writePosition(target, x, y);
    this.lastWrittenX = x;
    this.lastWrittenY = y;
    this.yieldedToLaterWriter = false;
  }

  restore() {
    const target = this.target;
    const position = target?.position ?? target;
    const currentX = Number(position?.x);
    const currentY = Number(position?.y);
    if (target && !target.destroyed && Number.isFinite(currentX) && Number.isFinite(currentY)
      && (this.lastWrittenX !== null)
      && ((Math.abs(this.ownedX) > VISUAL_EPSILON) || (Math.abs(this.ownedY) > VISUAL_EPSILON))) {
      // Exact last-write ownership is the only safe restoration proof. Any
      // differing value belongs to a later writer and must be preserved.
      if (!this.yieldedToLaterWriter && positionsEqual(
        currentX,
        currentY,
        this.lastWrittenX,
        this.lastWrittenY
      )) {
        writePosition(target, currentX - this.ownedX, currentY - this.ownedY);
      }
    }

    this.target = null;
    this.#resetTracking();
  }

  #captureBase(currentX, currentY, referenceX, referenceY) {
    if (this.referenceProvider) {
      this.baseX = currentX - referenceX;
      this.baseY = currentY - referenceY;
    } else {
      this.baseX = currentX;
      this.baseY = currentY;
    }
  }

  #resetTracking() {
    this.baseX = 0;
    this.baseY = 0;
    this.lastWrittenX = null;
    this.lastWrittenY = null;
    this.ownedX = 0;
    this.ownedY = 0;
    this.lastReferenceX = null;
    this.lastReferenceY = null;
    this.yieldedToLaterWriter = false;
  }
}

/**
 * Reversibly multiplies both axes of a mesh's core-authored scale. The axes are
 * kept independent so a negative Foundry scale (for example, a flipped texture)
 * retains its sign. As with positions, an unconfirmed later write causes this
 * tracker alone to yield ownership.
 */
class ReversibleScaleTarget {
  constructor() {
    this.target = null;
    this.baseX = 1;
    this.baseY = 1;
    this.lastWrittenX = null;
    this.lastWrittenY = null;
    this.ownedFactor = 1;
    this.yieldedToLaterWriter = false;
  }

  apply(target, factor, baseRefreshed = false) {
    if (!target || target.destroyed) {
      if (target !== this.target) this.restore();
      return;
    }

    if (target !== this.target) {
      this.restore();
      this.target = target;
      this.#resetTracking();
    }

    const current = readScale(target);
    if (!current) return;
    const hasLastWrite = this.lastWrittenX !== null;
    const matchesLastWrite = hasLastWrite && positionsEqual(
      current.x,
      current.y,
      this.lastWrittenX,
      this.lastWrittenY
    );

    if (!hasLastWrite || baseRefreshed) {
      this.#captureBase(current);
      this.yieldedToLaterWriter = false;
    } else if (!matchesLastWrite) {
      this.yieldedToLaterWriter = true;
      return;
    } else {
      this.yieldedToLaterWriter = false;
    }

    this.ownedFactor = finiteNonNegativeOrOne(factor);
    const x = this.baseX * this.ownedFactor;
    const y = this.baseY * this.ownedFactor;
    writeScale(target, x, y);
    this.lastWrittenX = x;
    this.lastWrittenY = y;
  }

  restore() {
    const target = this.target;
    const current = readScale(target);
    if (target && !target.destroyed && current && (this.lastWrittenX !== null)
      && (Math.abs(this.ownedFactor - 1) > VISUAL_EPSILON)) {
      if (!this.yieldedToLaterWriter && positionsEqual(
        current.x,
        current.y,
        this.lastWrittenX,
        this.lastWrittenY
      )) {
        writeScale(target, this.baseX, this.baseY);
      }
    }

    this.target = null;
    this.#resetTracking();
  }

  #captureBase(current) {
    this.baseX = current.x;
    this.baseY = current.y;
  }

  #resetTracking() {
    this.baseX = 1;
    this.baseY = 1;
    this.lastWrittenX = null;
    this.lastWrittenY = null;
    this.ownedFactor = 1;
    this.yieldedToLaterWriter = false;
  }
}

/**
 * Reversibly attenuates the mesh's core-authored alpha. The factor is clamped
 * to [0, 1], so this visual treatment can never make a Token more opaque than
 * Foundry or another earlier visibility owner intended.
 */
class ReversibleAlphaTarget {
  constructor() {
    this.target = null;
    this.baseAlpha = 1;
    this.lastWrittenAlpha = null;
    this.ownedFactor = 1;
    this.yieldedToLaterWriter = false;
  }

  apply(target, factor, baseRefreshed = false) {
    if (!target || target.destroyed) {
      if (target !== this.target) this.restore();
      return;
    }

    if (target !== this.target) {
      this.restore();
      this.target = target;
      this.#resetTracking();
    }

    const current = readAlpha(target);
    if (current === null) return;
    const hasLastWrite = this.lastWrittenAlpha !== null;
    const matchesLastWrite = hasLastWrite
      && numbersEqual(current, this.lastWrittenAlpha);

    if (!hasLastWrite || baseRefreshed) {
      this.baseAlpha = current;
      this.yieldedToLaterWriter = false;
    } else if (!matchesLastWrite) {
      this.yieldedToLaterWriter = true;
      return;
    } else {
      this.yieldedToLaterWriter = false;
    }

    this.ownedFactor = clampedAlphaFactor(factor);
    const alpha = this.baseAlpha > 0
      ? this.baseAlpha * this.ownedFactor
      : this.baseAlpha;
    writeAlpha(target, Math.min(this.baseAlpha, alpha));
    this.lastWrittenAlpha = Math.min(this.baseAlpha, alpha);
  }

  restore() {
    const target = this.target;
    const current = readAlpha(target);
    if (target && !target.destroyed && (current !== null)
      && (this.lastWrittenAlpha !== null)
      && (Math.abs(this.ownedFactor - 1) > VISUAL_EPSILON)) {
      if (!this.yieldedToLaterWriter && numbersEqual(current, this.lastWrittenAlpha)) {
        writeAlpha(target, this.baseAlpha);
      }
    }

    this.target = null;
    this.#resetTracking();
  }

  #resetTracking() {
    this.baseAlpha = 1;
    this.lastWrittenAlpha = null;
    this.ownedFactor = 1;
    this.yieldedToLaterWriter = false;
  }
}

function readTokenCenter(token) {
  const center = token?.center;
  if (!center) return null;
  const x = Number(center.x);
  const y = Number(center.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function readPosition(displayObject) {
  if (!displayObject) return null;
  const position = displayObject.position ?? displayObject;
  const x = Number(position.x);
  const y = Number(position.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function writePosition(displayObject, x, y) {
  const position = displayObject.position ?? displayObject;
  if (position?.set) position.set(x, y);
  else {
    position.x = x;
    position.y = y;
  }
}

function readScale(displayObject) {
  const scale = displayObject?.scale;
  const x = Number(scale?.x);
  const y = Number(scale?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function writeScale(displayObject, x, y) {
  const scale = displayObject?.scale;
  if (scale?.set) scale.set(x, y);
  else if (scale) {
    scale.x = x;
    scale.y = y;
  }
}

function readAlpha(displayObject) {
  const alpha = Number(displayObject?.alpha);
  return Number.isFinite(alpha) ? alpha : null;
}

function writeAlpha(displayObject, alpha) {
  displayObject.alpha = alpha;
}

function finiteOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function finiteNonNegativeOrOne(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 1;
}

function clampedAlphaFactor(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.min(1, Math.max(0, number));
}

function numbersEqual(value1, value2) {
  return Math.abs(value1 - value2) <= VISUAL_EPSILON;
}

function positionsEqual(x1, y1, x2, y2) {
  return (Math.abs(x1 - x2) <= VISUAL_EPSILON)
    && (Math.abs(y1 - y2) <= VISUAL_EPSILON);
}
