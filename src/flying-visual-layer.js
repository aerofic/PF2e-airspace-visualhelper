import { FlyingTokenVisual } from "./flying-token-visual.js";
import { SubterraneanTokenVisual, isSubterraneanElevation } from "./subterranean-token-visual.js";
import { VISUAL_EPSILON } from "./constants.js";
import { readSettings } from "./settings.js";
import { normalizeFlyingElevation, normalizeHudElevation } from "./visual-math.js";

/**
 * Canvas lifecycle manager for all flight visuals in the viewed Scene.
 * The takeoff shadow remains fixed at the TokenDocument footprint. A
 * reversible Primary mesh offset applies the bounded height cue, while
 * Foundry's refreshPosition hook keeps movement previews snapped to the rules
 * position without rebuilding shadow geometry.
 */
export class FlyingVisualLayer {
  #canvas = null;
  #visuals = new Map();
  #subterraneanVisuals = new Map();
  // A single shared ticker drives both fallback elevation tweens and the
  // inexpensive idle drift of visible airborne Tokens. Individual visuals
  // never register their own PIXI ticker callbacks.
  #ticking = new Set();
  #ticker = null;
  #tickerActive = false;
  #settings = null;
  #sceneId = null;
  #motionQuery = null;

  #onMotionPreferenceChange = event => {
    const reduced = !!(event?.matches ?? this.#motionQuery?.matches);
    for (const visual of this.#visuals.values()) {
      visual.setReducedMotion(reduced);
      if (visual.canRetire) this.#removeVisual(visual.token);
      else this.#syncTicker(visual);
    }
    if (this.#ticking.size === 0) this.#stopTicker();
  };

  #onTick = () => {
    const now = performance.now();
    // Deleting the current Set entry during iteration is defined and safe;
    // avoid allocating a snapshot array on every ambient frame.
    for (const visual of this.#ticking) {
      if (!visual.tick(now)) {
        this.#ticking.delete(visual);
        if (visual.canRetire) this.#removeVisual(visual.token);
      }
    }
    if (this.#ticking.size === 0) this.#stopTicker();
  };

  activate(readyCanvas) {
    if (!readyCanvas?.ready || !readyCanvas.scene) return;
    if ((this.#canvas === readyCanvas) && (this.#sceneId === readyCanvas.scene.id) && this.#settings) {
      this.#syncAllTickers();
      return;
    }
    if (this.#canvas && (this.#canvas !== readyCanvas)) this.deactivate(this.#canvas);
    this.#canvas = readyCanvas;
    this.#sceneId = readyCanvas.scene.id;
    this.#settings = readSettings();
    this.#clearVisuals();
    if (!this.#settings.enabled) {
      this.#disconnectMotionPreference();
      return;
    }
    this.#connectMotionPreference();
    for (const token of readyCanvas.tokens?.placeables ?? []) {
      this.#syncSubterraneanVisual(token);
      this.#ensureVisual(token, { ifFlying: true });
    }
    this.#syncAllTickers();
  }

  deactivate(tearingDownCanvas) {
    if (this.#canvas && tearingDownCanvas && (tearingDownCanvas !== this.#canvas)) return;
    this.#clearVisuals();
    this.#disconnectMotionPreference();
    this.#canvas = null;
    this.#settings = null;
    this.#sceneId = null;
  }

  refreshSettings() {
    this.#settings = readSettings();
    if (!canvas.ready || !canvas.scene) return;
    this.#canvas ??= canvas;
    if (!this.#settings.enabled) {
      this.#clearVisuals();
      this.#disconnectMotionPreference();
      return;
    }
    this.#connectMotionPreference();

    const updated = new Set();
    for (const visual of this.#visuals.values()) {
      visual.updateSettings(this.#settings);
      this.#syncTicker(visual);
      updated.add(visual);
    }
    for (const token of canvas.tokens?.placeables ?? []) {
      this.#syncSubterraneanVisual(token);
      const visual = this.#ensureVisual(token, { ifFlying: true });
      if (visual && !updated.has(visual)) {
        visual.updateSettings(this.#settings);
        this.#syncTicker(visual);
      }
    }
    this.#syncAllTickers();
  }

  refreshAll() {
    if (!this.#settings?.enabled || !this.#canvas?.ready) return;
    for (const token of this.#canvas.tokens?.placeables ?? []) {
      this.#syncSubterraneanVisual(token);
      const visual = this.#ensureVisual(token, { ifFlying: true });
      visual?.updateSettings(this.#settings);
      this.#syncTicker(visual);
    }
  }

  onDrawToken(token) {
    if (!this.#isCurrentToken(token) || !this.#settings?.enabled) return;
    this.#syncSubterraneanVisual(token);
    const visual = this.#ensureVisual(token, { ifFlying: true });
    visual?.onDraw();
    this.#syncTicker(visual);
  }

  onRefreshToken(token, flags = {}) {
    if (!this.#isCurrentToken(token) || !this.#settings?.enabled) return;
    this.#syncSubterraneanVisual(token);
    const visual = this.#ensureVisual(token, { ifFlying: true });
    if (!visual) return;

    if (flags.refreshElevation
      && (visual.followingCoreAnimation || token.isPreview || !visual.isAnimating)) {
      const coreAnimationActive = hasCoreElevationAnimation(token);
      this.#ticking.delete(visual);
      // Consume Foundry's authoritative position/size/state bases before the
      // interpolated elevation render reapplies this module's pose. Reversing
      // these calls would make same-frame refresh flags capture our own write.
      visual.onRefresh(flags);
      visual.syncCoreElevation(token.document.elevation, { active: coreAnimationActive });
      if (visual.canRetire) this.#removeVisual(token);
      else this.#syncTicker(visual, { suspended: coreAnimationActive });
      if (this.#ticking.size === 0) this.#stopTicker();
      return;
    }
    visual.onRefresh(flags);
    this.#syncTicker(visual);
  }

  onDestroyToken(token) {
    this.#removeSubterraneanVisual(token);
    this.#removeVisual(token);
  }

  onUpdateToken(document, changes, options, _userId) {
    if (!this.#settings?.enabled || !this.#isCurrentDocument(document)) return;
    const token = document.object;
    if (!token || token.destroyed) return;
    const targetElevation = "elevation" in changes
      ? normalizeHudElevation(changes.elevation)
      : normalizeHudElevation(document.elevation);
    this.#syncSubterraneanVisual(token, targetElevation);
    if (isSubterraneanElevation(targetElevation)) {
      this.#removeVisual(token);
      return;
    }
    const needsFlightVisual = ("elevation" in changes)
      && (normalizeFlyingElevation(changes.elevation) > 0);
    const visual = this.#ensureVisual(token, {
      ifFlying: !needsFlightVisual,
      initialElevation: needsFlightVisual ? 0 : undefined
    });
    if (!visual) return;

    if ("elevation" in changes) {
      if (hasCoreElevationAnimation(token)) this.#followCoreAnimation(visual, changes.elevation);
      else this.#animateVisual(visual, changes.elevation, { animate: options?.animate !== false });
    } else if (["width", "height", "shape", "texture"].some(key => key in changes)) {
      visual.render();
      this.#syncTicker(visual);
    } else {
      this.#syncTicker(visual);
    }
    // x/y movement only updates the ground container and reapplies the cached
    // mesh offset in refreshToken; geometry is not recalculated.
  }

  onMoveToken(document, movement, operation, _user) {
    if (!this.#settings?.enabled || !this.#isCurrentDocument(document)) return;
    const destinationElevation = movement?.destination?.elevation;
    if (!Number.isFinite(destinationElevation) || !document.object) return;
    this.#syncSubterraneanVisual(document.object, destinationElevation);
    if (isSubterraneanElevation(destinationElevation)) {
      this.#removeVisual(document.object);
      return;
    }
    const visual = this.#ensureVisual(document.object, {
      ifFlying: normalizeFlyingElevation(destinationElevation) <= 0,
      initialElevation: normalizeFlyingElevation(destinationElevation) > 0 ? 0 : undefined
    });
    if (!visual) return;
    if (hasCoreElevationAnimation(document.object)) this.#followCoreAnimation(visual, destinationElevation);
    else {
      const animate = (operation?.animate !== false) && (operation?.animation?.duration !== 0);
      this.#animateVisual(visual, destinationElevation, { animate });
    }
  }

  #animateVisual(visual, elevation, { animate = true } = {}) {
    const target = normalizeFlyingElevation(elevation);
    visual.setElevation(target, { animate });
    if (visual.canRetire) {
      this.#removeVisual(visual.token);
    } else {
      // Immediate updates may still require ambient motion even though they
      // did not create an elevation tween.
      this.#syncTicker(visual);
    }
  }

  #followCoreAnimation(visual, elevation) {
    this.#ticking.delete(visual);
    visual.beginCoreAnimation(elevation);
    // Foundry supplies every intermediate elevation frame while its own core
    // animation is active; registering our ticker would duplicate that work.
    this.#syncTicker(visual, { suspended: true });
  }

  #ensureVisual(token, { ifFlying = false, initialElevation } = {}) {
    if (!this.#isCurrentToken(token) || token.destroyed) return null;
    const existing = this.#visuals.get(token);
    if (existing && !existing.destroyed) {
      this.#syncTicker(existing);
      return existing;
    }
    if (existing) {
      this.#ticking.delete(existing);
      existing.destroy();
      this.#visuals.delete(token);
    }
    if (ifFlying && (normalizeFlyingElevation(token.document.elevation) <= 0)) return null;
    const visual = new FlyingTokenVisual(token, this.#settings, {
      initialElevation,
      parent: this.#canvas.primary ?? token
    });
    visual.setReducedMotion(!!this.#motionQuery?.matches);
    this.#visuals.set(token, visual);
    this.#syncTicker(visual);
    return visual;
  }

  #syncSubterraneanVisual(token, elevation = token?.document?.elevation) {
    if (!this.#isCurrentToken(token) || token.destroyed) return;
    let visual = this.#subterraneanVisuals.get(token);
    if (!isSubterraneanElevation(elevation)) {
      visual?.render({ elevation });
      return;
    }
    if (!visual || visual.destroyed) {
      visual?.destroy?.();
      visual = new SubterraneanTokenVisual(token, {
        parent: this.#canvas?.tokens?.objects ?? token.parent
      });
      this.#subterraneanVisuals.set(token, visual);
    }
    visual.render({ elevation });
  }

  #removeSubterraneanVisual(token) {
    const visual = this.#subterraneanVisuals.get(token);
    if (!visual) return;
    visual.destroy();
    this.#subterraneanVisuals.delete(token);
  }

  #removeVisual(token) {
    const visual = this.#visuals.get(token);
    if (!visual) return;
    this.#ticking.delete(visual);
    visual.destroy();
    this.#visuals.delete(token);
    if (this.#ticking.size === 0) this.#stopTicker();
  }

  #isCurrentToken(token) {
    return !!this.#canvas?.ready
      && !!token
      && (token.document?.parent === this.#canvas.scene);
  }

  #isCurrentDocument(document) {
    return !!this.#canvas?.ready && (document?.parent === this.#canvas.scene);
  }

  /**
   * Reconcile one visual with the shared ticker after any lifecycle, settings,
   * elevation, visibility, or refresh-state change.
   */
  #syncTicker(visual, { suspended = false } = {}) {
    if (!visual || visual.destroyed || suspended || !visual.requiresTicker) {
      if (visual) this.#ticking.delete(visual);
      if (this.#ticking.size === 0) this.#stopTicker();
      return;
    }
    this.#ticking.add(visual);
    this.#startTicker();
  }

  #syncAllTickers() {
    for (const visual of this.#visuals.values()) this.#syncTicker(visual);
    if (this.#ticking.size === 0) this.#stopTicker();
  }

  #connectMotionPreference() {
    if (this.#motionQuery || (typeof globalThis.matchMedia !== "function")) return;
    const query = globalThis.matchMedia("(prefers-reduced-motion: reduce)");
    if (!query) return;
    this.#motionQuery = query;
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", this.#onMotionPreferenceChange);
    } else if (typeof query.addListener === "function") {
      query.addListener(this.#onMotionPreferenceChange);
    }
  }

  #disconnectMotionPreference() {
    const query = this.#motionQuery;
    if (!query) return;
    if (typeof query.removeEventListener === "function") {
      query.removeEventListener("change", this.#onMotionPreferenceChange);
    } else if (typeof query.removeListener === "function") {
      query.removeListener(this.#onMotionPreferenceChange);
    }
    this.#motionQuery = null;
  }

  #startTicker() {
    if (this.#tickerActive || !this.#canvas?.app?.ticker) return;
    this.#ticker = this.#canvas.app.ticker;
    // Run after Foundry applies pending Token render flags (OBJECTS), but just
    // before Canvas.primary.update refreshes transforms, bounds, and depth
    // masks. This prevents the small ambient mesh offset from leaving Primary
    // geometry one frame behind at transparency or occlusion boundaries.
    const priorities = globalThis.PIXI?.UPDATE_PRIORITY ?? {};
    const primaryPriority = priorities.PRIMARY ?? ((priorities.NORMAL ?? 0) + 3);
    this.#ticker.add(this.#onTick, undefined, primaryPriority + 1);
    this.#tickerActive = true;
  }

  #stopTicker() {
    if (this.#tickerActive) this.#ticker?.remove(this.#onTick);
    this.#ticker = null;
    this.#tickerActive = false;
  }

  #clearVisuals() {
    this.#stopTicker();
    this.#ticking.clear();
    for (const visual of this.#visuals.values()) visual.destroy();
    this.#visuals.clear();
    for (const visual of this.#subterraneanVisuals.values()) visual.destroy();
    this.#subterraneanVisuals.clear();
  }
}

/** Does any active core Token animation currently interpolate elevation? */
export function hasCoreElevationAnimation(token) {
  const contexts = token.animationContexts;
  if (!contexts?.size) return false;
  const currentElevation = normalizeFlyingElevation(token.document?.elevation);
  for (const context of contexts.values()) {
    let previousElevation = currentElevation;
    const primaryElevation = Number(context?.to?.elevation);
    if (Number.isFinite(primaryElevation)) {
      const normalizedTarget = normalizeFlyingElevation(primaryElevation);
      if (Math.abs(normalizedTarget - previousElevation) > VISUAL_EPSILON) return true;
      previousElevation = normalizedTarget;
    }
    for (const link of context?.chain ?? []) {
      const targetElevation = Number(link?.to?.elevation);
      if (!Number.isFinite(targetElevation)) continue;
      const normalizedTarget = normalizeFlyingElevation(targetElevation);
      if (Math.abs(normalizedTarget - previousElevation) > VISUAL_EPSILON) return true;
      previousElevation = normalizedTarget;
    }
  }
  return false;
}
