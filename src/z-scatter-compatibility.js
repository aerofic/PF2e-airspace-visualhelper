const Z_SCATTER_MODULE_ID = "z-scatter";
const POSITION_EPSILON = 0.01;

/**
 * Optional, read-only adapter for Z Scatter 2.x visual offsets.
 *
 * Z Scatter exposes no public offset API, but it replaces Token#hitArea with a
 * translated copy of Token#shape whenever it scatters a Token. Reading that
 * translation lets this module compose its stand, lifted mesh, and native UI
 * without touching Z Scatter settings, flags, or internal collections.
 */
export class ZScatterCompatibility {
  #token;
  #baseHitArea = null;
  #ownedHitArea = null;
  #state = createNeutralState();

  constructor(token) {
    this.#token = token;
  }

  get state() {
    return this.#state;
  }

  get available() {
    return isZScatterActive();
  }

  /**
   * Synchronize a translated ground base plus a second selectable area around
   * the visibly lifted Token art. Returns whether the detected scatter offset
   * changed, so callers can cheaply reposition their cached PIXI container.
   */
  sync({ liftX = 0, liftY = 0, enabled = true } = {}) {
    const previousX = this.#state.offsetX;
    const previousY = this.#state.offsetY;
    const available = this.available;
    const moving = !!enabled && available && isTokenMoving(this.#token);
    if (moving) {
      // Z Scatter deliberately suspends its visual offset while Foundry moves
      // a Token. Core then restores the mesh to Token#center and Z Scatter can
      // restore native local UI positions. Keep that exact zero-offset layout
      // authoritative so the flight lift (including native elevation labels)
      // can be recomposed throughout the drag/movement animation.
      this.#restoreHitArea();
      this.#state = createMovementState(this.#token);
      return !positionsEqual(previousX, previousY, 0, 0);
    }

    const active = !!enabled && available;
    if (!active) {
      this.#restoreHitArea();
      this.#state = createNeutralState();
      return !positionsEqual(previousX, previousY, 0, 0);
    }

    const shape = this.#token?.shape;
    let currentHitArea = this.#token?.hitArea;
    if (!shape || (typeof shape.contains !== "function") || !currentHitArea) {
      this.#abandonOwnedHitArea();
      this.#state = createUnsupportedState();
      return !positionsEqual(previousX, previousY, 0, 0);
    }

    if ((currentHitArea === this.#ownedHitArea) && (this.#ownedHitArea?.sourceShape !== shape)) {
      // Core replaced Token#shape but another refresh has not yet replaced the
      // owned union. Never keep a stale geometry reference across shape redraws.
      this.#restoreHitArea();
      currentHitArea = this.#token?.hitArea;
    }

    if (currentHitArea !== this.#ownedHitArea) {
      const translation = readShapeTranslation(shape, currentHitArea);
      if (!translation) {
        // An unrelated module owns a custom hit area. Yield rather than
        // guessing or replacing it; the rest of the flying visual remains safe.
        this.#abandonOwnedHitArea();
        this.#state = createUnsupportedState();
        return !positionsEqual(previousX, previousY, 0, 0);
      }
      this.#baseHitArea = currentHitArea;
      this.#ownedHitArea = new LiftedUnionHitArea(this.#baseHitArea, shape);
      this.#token.hitArea = this.#ownedHitArea;
      this.#state = createSupportedState(this.#token, translation.x, translation.y);
    } else if (this.#state.supported) {
      // Token center and local UI bases can change while the scatter vector
      // stays constant. Refresh exact bases without replacing the hit area.
      this.#state = createSupportedState(this.#token, this.#state.offsetX, this.#state.offsetY);
    }

    this.#ownedHitArea.setLift(
      this.#state.offsetX + finiteOrZero(liftX),
      this.#state.offsetY + finiteOrZero(liftY)
    );
    return !positionsEqual(previousX, previousY, this.#state.offsetX, this.#state.offsetY);
  }

  destroy() {
    this.#restoreHitArea();
    this.#state = createNeutralState();
  }

  #restoreHitArea() {
    if (this.#token && (this.#token.hitArea === this.#ownedHitArea)) {
      this.#token.hitArea = this.#baseHitArea;
    }
    this.#abandonOwnedHitArea();
  }

  #abandonOwnedHitArea() {
    this.#baseHitArea = null;
    this.#ownedHitArea = null;
  }
}

/** A PIXI-compatible hit area which preserves the base and adds lifted art. */
class LiftedUnionHitArea {
  constructor(baseHitArea, sourceShape) {
    this.baseHitArea = baseHitArea;
    this.sourceShape = sourceShape;
    this.liftX = 0;
    this.liftY = 0;
  }

  setLift(x, y) {
    this.liftX = finiteOrZero(x);
    this.liftY = finiteOrZero(y);
  }

  contains(x, y) {
    return !!this.baseHitArea?.contains?.(x, y)
      || !!this.sourceShape?.contains?.(x - this.liftX, y - this.liftY);
  }
}

export function isZScatterActive() {
  return globalThis.game?.modules?.get?.(Z_SCATTER_MODULE_ID)?.active === true;
}

/** Derive a pure translation between two supported PIXI geometry shapes. */
export function readShapeTranslation(source, shifted) {
  if (!source || !shifted) return null;
  if (source === shifted) return { x: 0, y: 0 };

  const sourcePoints = Array.isArray(source.points) ? source.points : null;
  const shiftedPoints = Array.isArray(shifted.points) ? shifted.points : null;
  if (sourcePoints || shiftedPoints) {
    if (!sourcePoints || !shiftedPoints || (sourcePoints.length !== shiftedPoints.length) || !sourcePoints.length) {
      return null;
    }
    const x = Number(shiftedPoints[0]) - Number(sourcePoints[0]);
    const y = Number(shiftedPoints[1]) - Number(sourcePoints[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    for (let index = 0; index < sourcePoints.length; index += 1) {
      const expected = Number(sourcePoints[index]) + (index % 2 === 0 ? x : y);
      if (!numbersEqual(Number(shiftedPoints[index]), expected)) return null;
    }
    return { x, y };
  }

  const x = Number(shifted.x) - Number(source.x);
  const y = Number(shifted.y) - Number(source.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  if (("width" in source) || ("height" in source) || ("width" in shifted) || ("height" in shifted)) {
    if (!numbersEqual(Number(source.width), Number(shifted.width))
      || !numbersEqual(Number(source.height), Number(shifted.height))) return null;
    if (("radius" in source || "radius" in shifted)
      && !numbersEqual(Number(source.radius), Number(shifted.radius))) return null;
    return { x, y };
  }

  if (("radius" in source) || ("radius" in shifted)) {
    if (!numbersEqual(Number(source.radius), Number(shifted.radius))) return null;
    return { x, y };
  }

  return null;
}

function createNeutralState() {
  return {
    active: false,
    supported: false,
    offsetX: 0,
    offsetY: 0,
    bases: null
  };
}

function createUnsupportedState() {
  return {
    active: true,
    supported: false,
    offsetX: 0,
    offsetY: 0,
    bases: null
  };
}

function createSupportedState(token, offsetX, offsetY) {
  const centerX = finiteOrZero(token?.center?.x);
  const centerY = finiteOrZero(token?.center?.y);
  const size = token?.document?.getSize?.() ?? {};
  const width = positiveOr(token?.w, positiveOr(size.width, 0));
  const height = positiveOr(token?.h, positiveOr(size.height, 0));
  return {
    active: true,
    supported: true,
    offsetX,
    offsetY,
    bases: {
      mesh: { x: centerX + offsetX, y: centerY + offsetY },
      tooltip: { x: (width / 2) + offsetX, y: offsetY - 2 },
      nameplate: { x: (width / 2) + offsetX, y: height + 2 + offsetY },
      bars: { x: offsetX, y: offsetY },
      effects: { x: offsetX, y: offsetY }
    }
  };
}

function createMovementState(token) {
  return {
    ...createSupportedState(token, 0, 0),
    active: false,
    suspended: true
  };
}

function isTokenMoving(token) {
  const contexts = token?.animationContexts;
  if (!contexts?.size) return false;
  for (const context of contexts.values()) {
    const target = context?.to;
    if (!target) continue;
    if (((target.x ?? token.x) !== token.x) || ((target.y ?? token.y) !== token.y)) return true;
  }
  return false;
}

function positiveOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && (number > 0) ? number : fallback;
}

function finiteOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function numbersEqual(left, right) {
  return Number.isFinite(left) && Number.isFinite(right)
    && (Math.abs(left - right) <= POSITION_EPSILON);
}

function positionsEqual(x1, y1, x2, y2) {
  return numbersEqual(x1, x2) && numbersEqual(y1, y2);
}
