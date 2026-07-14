import { FlyingTokenVisual } from "./flying-token-visual.js";
import { VISUAL_EPSILON } from "./constants.js";
import { readSettings } from "./settings.js";
import { normalizeFlyingElevation } from "./visual-math.js";

/**
 * Canvas lifecycle manager for all flight visuals in the viewed Scene.
 * Visuals live in PrimaryCanvasGroup just below normal Token meshes. Foundry's
 * refreshPosition hook synchronizes x/y and previews without rebuilding their
 * height-dependent geometry.
 */
export class FlyingVisualLayer {
  #canvas = null;
  #visuals = new Map();
  #animating = new Set();
  #ticker = null;
  #tickerActive = false;
  #settings = null;
  #sceneId = null;

  #onTick = () => {
    const now = performance.now();
    for (const visual of this.#animating) {
      if (!visual.tick(now)) {
        this.#animating.delete(visual);
        if (visual.canRetire) this.#removeVisual(visual.token);
      }
    }
    if (this.#animating.size === 0) this.#stopTicker();
  };

  activate(readyCanvas) {
    if (!readyCanvas?.ready || !readyCanvas.scene) return;
    if ((this.#canvas === readyCanvas) && (this.#sceneId === readyCanvas.scene.id) && this.#settings) return;
    if (this.#canvas && (this.#canvas !== readyCanvas)) this.deactivate(this.#canvas);
    this.#canvas = readyCanvas;
    this.#sceneId = readyCanvas.scene.id;
    this.#settings = readSettings();
    this.#clearVisuals();
    if (!this.#settings.enabled) return;
    for (const token of readyCanvas.tokens?.placeables ?? []) this.#ensureVisual(token, { ifFlying: true });
  }

  deactivate(tearingDownCanvas) {
    if (this.#canvas && tearingDownCanvas && (tearingDownCanvas !== this.#canvas)) return;
    this.#clearVisuals();
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
      return;
    }

    for (const visual of this.#visuals.values()) visual.updateSettings(this.#settings);
    for (const token of canvas.tokens?.placeables ?? []) {
      const visual = this.#ensureVisual(token, { ifFlying: true });
      visual?.updateSettings(this.#settings);
    }
  }

  refreshAll() {
    if (!this.#settings?.enabled || !this.#canvas?.ready) return;
    for (const token of this.#canvas.tokens?.placeables ?? []) {
      const visual = this.#ensureVisual(token, { ifFlying: true });
      visual?.updateSettings(this.#settings);
    }
  }

  onDrawToken(token) {
    if (!this.#isCurrentToken(token) || !this.#settings?.enabled) return;
    const visual = this.#ensureVisual(token, { ifFlying: true });
    visual?.onDraw();
  }

  onRefreshToken(token, flags = {}) {
    if (!this.#isCurrentToken(token) || !this.#settings?.enabled) return;
    const visual = this.#ensureVisual(token, { ifFlying: true });
    if (!visual) return;

    if (flags.refreshElevation
      && (visual.followingCoreAnimation || token.isPreview || !visual.isAnimating)) {
      const coreAnimationActive = hasCoreElevationAnimation(token);
      this.#animating.delete(visual);
      visual.syncCoreElevation(token.document.elevation, { active: coreAnimationActive });
      visual.onRefresh(flags);
      if (visual.canRetire) this.#removeVisual(token);
      if (this.#animating.size === 0) this.#stopTicker();
      return;
    }
    visual.onRefresh(flags);
  }

  onDestroyToken(token) {
    this.#removeVisual(token);
  }

  onUpdateToken(document, changes, options, _userId) {
    if (!this.#settings?.enabled || !this.#isCurrentDocument(document)) return;
    const token = document.object;
    if (!token || token.destroyed) return;
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
    }
    // x/y movement only updates the Primary container transform in refreshToken;
    // geometry is not recalculated for horizontal movement.
  }

  onMoveToken(document, movement, operation, _user) {
    if (!this.#settings?.enabled || !this.#isCurrentDocument(document)) return;
    const destinationElevation = movement?.destination?.elevation;
    if (!Number.isFinite(destinationElevation) || !document.object) return;
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
    if (visual.setElevation(target, { animate })) {
      this.#animating.add(visual);
      this.#startTicker();
    } else if (visual.canRetire) {
      this.#removeVisual(visual.token);
    }
  }

  #followCoreAnimation(visual, elevation) {
    this.#animating.delete(visual);
    visual.beginCoreAnimation(elevation);
    if (this.#animating.size === 0) this.#stopTicker();
  }

  #ensureVisual(token, { ifFlying = false, initialElevation } = {}) {
    if (!this.#isCurrentToken(token) || token.destroyed) return null;
    const existing = this.#visuals.get(token);
    if (existing && !existing.destroyed) return existing;
    if (existing) {
      this.#animating.delete(existing);
      existing.destroy();
      this.#visuals.delete(token);
    }
    if (ifFlying && (normalizeFlyingElevation(token.document.elevation) <= 0)) return null;
    const visual = new FlyingTokenVisual(token, this.#settings, {
      initialElevation,
      parent: this.#canvas.primary ?? token
    });
    this.#visuals.set(token, visual);
    return visual;
  }

  #removeVisual(token) {
    const visual = this.#visuals.get(token);
    if (!visual) return;
    this.#animating.delete(visual);
    visual.destroy();
    this.#visuals.delete(token);
    if (this.#animating.size === 0) this.#stopTicker();
  }

  #isCurrentToken(token) {
    return !!this.#canvas?.ready
      && !!token
      && (token.document?.parent === this.#canvas.scene);
  }

  #isCurrentDocument(document) {
    return !!this.#canvas?.ready && (document?.parent === this.#canvas.scene);
  }

  #startTicker() {
    if (this.#tickerActive || !this.#canvas?.app?.ticker) return;
    this.#ticker = this.#canvas.app.ticker;
    this.#ticker.add(this.#onTick);
    this.#tickerActive = true;
  }

  #stopTicker() {
    if (this.#tickerActive) this.#ticker?.remove(this.#onTick);
    this.#ticker = null;
    this.#tickerActive = false;
  }

  #clearVisuals() {
    this.#stopTicker();
    this.#animating.clear();
    for (const visual of this.#visuals.values()) visual.destroy();
    this.#visuals.clear();
  }
}

/** Does any active core Token animation currently interpolate elevation? */
export function hasCoreElevationAnimation(token) {
  const contexts = token.animationContexts;
  if (!contexts?.size) return false;
  const currentElevation = normalizeFlyingElevation(token.document?.elevation);
  for (const context of contexts.values()) {
    let previousElevation = currentElevation;
    for (const segment of [context?.to, ...(context?.chain ?? []).map(link => link?.to)]) {
      const targetElevation = Number(segment?.elevation);
      if (!Number.isFinite(targetElevation)) continue;
      const normalizedTarget = normalizeFlyingElevation(targetElevation);
      if (Math.abs(normalizedTarget - previousElevation) > VISUAL_EPSILON) return true;
      previousElevation = normalizedTarget;
    }
  }
  return false;
}
