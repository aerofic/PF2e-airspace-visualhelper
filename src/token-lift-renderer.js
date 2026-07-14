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
  #uiTargets = new Map();

  constructor(token) {
    this.#token = token;
    this.#meshTarget = new ReversibleOffsetTarget(() => readTokenCenter(this.#token));
    for (const key of ART_UI_KEYS) this.#uiTargets.set(key, new ReversibleOffsetTarget());
  }

  /** Apply the visual pose after Foundry has completed its normal refresh. */
  apply({ offsetX = 0, offsetY = 0 } = {}, {
    enabled = true,
    meshBaseRefreshed = false,
    uiBaseRefreshed = false,
    uiRetainsOwnedOffset = false
  } = {}) {
    const ownedOffset = {
      x: enabled ? finiteOrZero(offsetX) : 0,
      y: enabled ? finiteOrZero(offsetY) : 0
    };

    this.#meshTarget.apply(this.#token?.mesh, ownedOffset, {
      baseRefreshed: meshBaseRefreshed
    });
    for (const [key, target] of this.#uiTargets) {
      target.apply(this.#token?.[key], ownedOffset, {
        // v14 _refreshSize resets these three container positions; bars and
        // effects only redraw their children and retain their container pose.
        baseRefreshed: uiBaseRefreshed && SIZE_REFRESHED_UI_KEYS.has(key),
        // In v14 _refreshTooltip derives only levelIndicator.y from the
        // already-lifted tooltip. Other native UI positions are untouched.
        retainsOwnedOffset: uiRetainsOwnedOffset && (key === "levelIndicator")
      });
    }
  }

  /** Remove only this module's additive pose from every surviving target. */
  restore() {
    this.#meshTarget.restore();
    for (const target of this.#uiTargets.values()) target.restore();
  }
}

/**
 * Tracks one display object without replacing its Point, anchor, pivot, scale,
 * or alpha. A centered target stores its base relative to token.center; a local
 * UI target stores its normal local position.
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
    this.lastReference = null;
    this.yieldedToLaterWriter = false;
  }

  apply(target, ownedOffset, {
    baseRefreshed = false,
    retainsOwnedOffset = false
  } = {}) {
    if (!target || target.destroyed) {
      if (target !== this.target) this.restore();
      return;
    }

    if (target !== this.target) {
      this.restore();
      this.target = target;
      this.#resetTracking();
    }

    const current = readPosition(target);
    if (!current) return;
    const reference = this.#readReference(current);
    const hasLastWrite = this.lastWrittenX !== null;
    const matchesLastWrite = hasLastWrite && positionsEqual(
      current.x,
      current.y,
      this.lastWrittenX,
      this.lastWrittenY
    );
    const referenceChanged = hasLastWrite
      && reference
      && this.lastReference
      && !positionsEqual(reference.x, reference.y, this.lastReference.x, this.lastReference.y);

    if (!hasLastWrite) {
      this.#captureBase(current, reference);
      this.yieldedToLaterWriter = false;
    } else if (!matchesLastWrite) {
      if (baseRefreshed || referenceChanged) {
        // Foundry (or an earlier hook) supplied an absolute unlifted base.
        this.#captureBase(current, reference);
        this.yieldedToLaterWriter = false;
      } else if (retainsOwnedOffset) {
        // Core refreshed local UI content using an already-lifted tooltip.
        // Fold only its known local delta into the unlifted base.
        this.baseX += current.x - this.lastWrittenX;
        this.baseY += current.y - this.lastWrittenY;
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

    const base = this.#resolveBase(reference);
    this.ownedX = finiteOrZero(ownedOffset.x);
    this.ownedY = finiteOrZero(ownedOffset.y);
    const x = base.x + this.ownedX;
    const y = base.y + this.ownedY;
    writePosition(target, x, y);
    this.lastWrittenX = x;
    this.lastWrittenY = y;
    this.lastReference = reference ? { ...reference } : null;
  }

  restore() {
    const target = this.target;
    const current = readPosition(target);
    if (target && !target.destroyed && current && (this.lastWrittenX !== null)
      && ((Math.abs(this.ownedX) > VISUAL_EPSILON) || (Math.abs(this.ownedY) > VISUAL_EPSILON))) {
      // Exact last-write ownership is the only safe restoration proof. Any
      // differing value belongs to a later writer and must be preserved.
      if (!this.yieldedToLaterWriter && positionsEqual(
        current.x,
        current.y,
        this.lastWrittenX,
        this.lastWrittenY
      )) {
        writePosition(target, current.x - this.ownedX, current.y - this.ownedY);
      }
    }

    this.target = null;
    this.#resetTracking();
  }

  #captureBase(current, reference) {
    if (this.referenceProvider) {
      this.baseX = current.x - reference.x;
      this.baseY = current.y - reference.y;
    } else {
      this.baseX = current.x;
      this.baseY = current.y;
    }
  }

  #resolveBase(reference) {
    if (!this.referenceProvider) return { x: this.baseX, y: this.baseY };
    return { x: reference.x + this.baseX, y: reference.y + this.baseY };
  }

  #readReference(current) {
    if (!this.referenceProvider) return null;
    return this.referenceProvider() ?? current;
  }

  #resetTracking() {
    this.baseX = 0;
    this.baseY = 0;
    this.lastWrittenX = null;
    this.lastWrittenY = null;
    this.ownedX = 0;
    this.ownedY = 0;
    this.lastReference = null;
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

function finiteOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function positionsEqual(x1, y1, x2, y2) {
  return (Math.abs(x1 - x2) <= VISUAL_EPSILON)
    && (Math.abs(y1 - y2) <= VISUAL_EPSILON);
}
