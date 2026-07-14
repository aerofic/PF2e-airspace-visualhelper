import { FlyingStand } from "./flying-stand.js";
import { ProjectionRenderer } from "./projection-renderer.js";
import { ShadowRenderer } from "./shadow-renderer.js";
import {
  calculateAnimationDuration,
  calculateVisualMetrics,
  easeInOutCosine,
  normalizeFlyingElevation
} from "./visual-math.js";
import { VISUAL_EPSILON } from "./constants.js";

const MIN_ANIMATION_FRAME_MS = 1000 / 30;

/**
 * Reusable PIXI state for one Token. It owns display objects only and never
 * updates TokenDocument, Actor, Item, Combat, distance, or PF2e rule data.
 */
export class FlyingTokenVisual {
  constructor(token, settings, {
    initialElevation = token.document.elevation,
    parent = globalThis.canvas?.primary ?? token
  } = {}) {
    this.token = token;
    this.parent = parent;
    this.settings = settings;
    this.displayElevation = normalizeFlyingElevation(initialElevation);
    this.targetElevation = this.displayElevation;
    this.animation = null;
    this.coreAnimation = null;
    this.followingCoreAnimation = false;
    this.labelAlpha = 1;
    this.lastAnimatedRenderAt = 0;

    this.container = new PIXI.Container();
    this.container.name = "pf2e-flying-visual-helper";
    this.container.eventMode = "none";
    this.container.interactiveChildren = false;
    this.container.sortableChildren = true;
    // PrimaryCanvasGroup sorts elevation before layer. Elevation 0 plus a
    // pre-Token sort layer keeps the translucent ground aid above the map and
    // below normal non-negative Token meshes instead of covering their art.
    const tokenSortLayer = Number(parent?.constructor?.SORT_LAYERS?.TOKENS) || 700;
    this.container.elevation = 0;
    this.container.sortLayer = tokenSortLayer - 1;
    this.container.sort = -1_000_000;
    this.container.zIndex = -1_000_000;

    this.shadowGraphics = this.container.addChild(new PIXI.Graphics());
    this.projectionGraphics = this.container.addChild(new PIXI.Graphics());
    this.standGraphics = this.container.addChild(new PIXI.Graphics());
    this.shadow = new ShadowRenderer(this.shadowGraphics);
    this.projection = new ProjectionRenderer(this.projectionGraphics);
    this.stand = new FlyingStand(this.standGraphics);

    parent.addChild(this.container);
    this.#syncPosition();
    this.#captureNativeTooltip();
    this.render();
  }

  get isAnimating() {
    return this.animation !== null;
  }

  get destroyed() {
    return this.container.destroyed;
  }

  get canRetire() {
    return !this.animation
      && !this.followingCoreAnimation
      && (this.displayElevation <= VISUAL_EPSILON)
      && (this.targetElevation <= VISUAL_EPSILON);
  }

  /** Idempotently reattach after a Token redraw. */
  onDraw() {
    if (!this.container.destroyed && !this.parent.destroyed && (this.container.parent !== this.parent)) {
      this.parent.addChild(this.container);
    }
    this.#syncPosition();
    this.#captureNativeTooltip();
    this.render();
  }

  updateSettings(settings) {
    this.settings = settings;
    this.render();
  }

  /** Start a fallback tween from the current displayed elevation. */
  setElevation(value, { animate = true } = {}) {
    const target = normalizeFlyingElevation(value);
    if ((Math.abs(target - this.targetElevation) <= VISUAL_EPSILON) && this.animation) return false;
    if ((Math.abs(target - this.displayElevation) <= VISUAL_EPSILON) && !this.animation) {
      this.targetElevation = target;
      this.render();
      return false;
    }

    this.targetElevation = target;
    this.followingCoreAnimation = false;
    this.coreAnimation = null;
    const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    if (!animate || reducedMotion) {
      this.animation = null;
      this.displayElevation = target;
      this.labelAlpha = 1;
      this.render();
      return false;
    }

    const gridDistance = canvas.grid?.distance ?? canvas.dimensions?.distance ?? 5;
    this.animation = {
      from: this.displayElevation,
      to: target,
      labelAlphaFrom: this.labelAlpha,
      startedAt: performance.now(),
      duration: calculateAnimationDuration(this.displayElevation, target, gridDistance)
    };
    this.render();
    return true;
  }

  /** Let Foundry's own movement animation drive every elevation frame. */
  beginCoreAnimation(target) {
    this.animation = null;
    this.followingCoreAnimation = true;
    this.targetElevation = normalizeFlyingElevation(target);
    this.coreAnimation = {
      from: this.displayElevation,
      to: this.targetElevation,
      labelAlphaFrom: this.labelAlpha
    };
    this.labelAlpha = 1;
    this.#applyNativeTooltipState();
  }

  /** Apply one interpolated elevation frame supplied by Foundry. */
  syncCoreElevation(value, { active = true } = {}) {
    this.animation = null;
    this.followingCoreAnimation = active;
    this.displayElevation = normalizeFlyingElevation(value);
    const coreAnimation = this.coreAnimation;
    if (coreAnimation && (Math.abs(coreAnimation.to - coreAnimation.from) > VISUAL_EPSILON)) {
      const progress = Math.min(Math.max(
        Math.abs(this.displayElevation - coreAnimation.from) / Math.abs(coreAnimation.to - coreAnimation.from),
        0
      ), 1);
      this.labelAlpha = labelTransitionAlpha(progress, coreAnimation.to, coreAnimation.labelAlphaFrom);
    } else {
      this.labelAlpha = 1;
    }
    if (!active) {
      this.targetElevation = this.displayElevation;
      this.coreAnimation = null;
    }
    // Tooltip alpha is cheap and should track every core frame even when PIXI
    // geometry redraws are throttled to roughly 30 fps.
    this.#applyNativeTooltipState();
    this.#renderAnimationFrame(performance.now(), { force: !active });
  }

  /** @returns {boolean} Whether this visual still needs fallback frames. */
  tick(now) {
    if (!this.animation) return false;
    const { from, to, labelAlphaFrom, startedAt, duration } = this.animation;
    const progress = Math.min(Math.max((now - startedAt) / duration, 0), 1);
    const eased = easeInOutCosine(progress);
    this.displayElevation = from + ((to - from) * eased);

    // Foundry owns the text and units. V2 only fades its public tooltip alpha.
    this.labelAlpha = labelTransitionAlpha(progress, to, labelAlphaFrom);

    if (progress >= 1) {
      this.displayElevation = to;
      this.animation = null;
      this.labelAlpha = 1;
    }

    this.#renderAnimationFrame(now, { force: progress >= 1 });
    return this.animation !== null;
  }

  /** Handle only render flags which affect geometry or the native tooltip. */
  onRefresh(flags = {}) {
    if (flags.refreshPosition || flags.refreshTransform || flags.redraw) this.#syncPosition();
    if (flags.refreshSize || flags.refreshShape || flags.refreshState || flags.refreshVisibility || flags.redraw) {
      this.render();
    } else if (flags.refreshTooltip || flags.refreshElevation) {
      this.#applyNativeTooltipState();
    }
  }

  render() {
    if (this.container.destroyed || this.token.destroyed) return;
    this.#syncPosition();
    const size = this.token.document.getSize();
    const metrics = calculateVisualMetrics({
      elevation: this.displayElevation,
      gridSize: canvas.grid?.size ?? canvas.dimensions?.size ?? 100,
      gridDistance: canvas.grid?.distance ?? canvas.dimensions?.distance ?? 5,
      tokenWidth: size.width,
      tokenHeight: size.height,
      standOpacity: this.settings.standOpacity,
      shadowOpacity: this.settings.shadowOpacity,
      projectionOpacity: this.settings.projectionOpacity,
      shadowDistanceMultiplier: this.settings.shadowDistanceMultiplier
    });

    const visibleToUser = (this.token.visible !== false) && !this.token.document.isSecret;
    const geometryEnabled = this.settings.enableStand
      || this.settings.enableShadow
      || this.settings.enableGroundProjection;
    this.container.visible = metrics.flying && visibleToUser && geometryEnabled;
    this.shadow.render(metrics, this.settings.enableShadow);
    this.projection.render(metrics, this.settings.enableGroundProjection);
    this.stand.render(metrics, this.settings.enableStand);
    this.#applyNativeTooltipState();
    this.lastAnimatedRenderAt = performance.now();
  }

  destroy() {
    this.animation = null;
    this.coreAnimation = null;
    this.#restoreNativeTooltip();
    if (!this.container.destroyed) {
      this.container.removeFromParent();
      this.container.destroy({ children: true });
    }
  }

  #captureNativeTooltip() {
    const tooltip = this.token.tooltip;
    if (!tooltip || tooltip.destroyed || (tooltip === this.nativeTooltip)) return;
    this.#restoreNativeTooltip();
    this.nativeTooltip = tooltip;
    this.tooltipHiddenByModule = false;
    this.tooltipAlphaAnimatedByModule = false;
  }

  #applyNativeTooltipState() {
    this.#captureNativeTooltip();
    const tooltip = this.nativeTooltip;
    if (!tooltip || tooltip.destroyed) return;
    const flying = (this.displayElevation > VISUAL_EPSILON) || (this.targetElevation > VISUAL_EPSILON);

    const shouldHide = flying && !this.settings.enableHeightLabel;
    if (shouldHide && !this.tooltipHiddenByModule) {
      this.tooltipRenderableBeforeModule = tooltip.renderable;
      tooltip.renderable = false;
      this.tooltipHiddenByModule = true;
    } else if (!shouldHide && this.tooltipHiddenByModule) {
      if (tooltip.renderable === false) tooltip.renderable = this.tooltipRenderableBeforeModule;
      this.tooltipHiddenByModule = false;
    }

    const shouldAnimateAlpha = flying && this.settings.enableHeightLabel && (this.labelAlpha < 0.999);
    if (shouldAnimateAlpha) {
      if (!this.tooltipAlphaAnimatedByModule) {
        this.tooltipAlphaBeforeModule = tooltip.alpha;
        this.tooltipAlphaAnimatedByModule = true;
      }
      this.tooltipLastWrittenAlpha = this.tooltipAlphaBeforeModule * this.labelAlpha;
      tooltip.alpha = this.tooltipLastWrittenAlpha;
    } else if (this.tooltipAlphaAnimatedByModule) {
      if (Math.abs(tooltip.alpha - this.tooltipLastWrittenAlpha) <= VISUAL_EPSILON) {
        tooltip.alpha = this.tooltipAlphaBeforeModule;
      }
      this.tooltipAlphaAnimatedByModule = false;
    }
  }

  #restoreNativeTooltip() {
    const tooltip = this.nativeTooltip;
    if (tooltip && !tooltip.destroyed) {
      if (this.tooltipHiddenByModule && (tooltip.renderable === false)) {
        tooltip.renderable = this.tooltipRenderableBeforeModule;
      }
      if (this.tooltipAlphaAnimatedByModule
        && (Math.abs(tooltip.alpha - this.tooltipLastWrittenAlpha) <= VISUAL_EPSILON)) {
        tooltip.alpha = this.tooltipAlphaBeforeModule;
      }
    }
    this.nativeTooltip = null;
    this.tooltipHiddenByModule = false;
    this.tooltipAlphaAnimatedByModule = false;
  }

  #renderAnimationFrame(now, { force = false } = {}) {
    if (!force && ((now - this.lastAnimatedRenderAt) < MIN_ANIMATION_FRAME_MS)) return;
    this.render();
  }

  #syncPosition() {
    if (this.container.destroyed) return;
    const x = Number(this.token.position?.x ?? this.token.document?.x) || 0;
    const y = Number(this.token.position?.y ?? this.token.document?.y) || 0;
    if (this.container.position?.set) this.container.position.set(x, y);
    else {
      this.container.x = x;
      this.container.y = y;
    }
  }
}

function labelTransitionAlpha(progress, target, initialAlpha = 1) {
  if (progress < 0.45) return initialAlpha * (1 - (progress / 0.45));
  return target > 0 ? (progress - 0.45) / 0.55 : 0;
}
