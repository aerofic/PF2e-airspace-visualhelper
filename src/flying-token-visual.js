import { FlyingStand } from "./flying-stand.js";
import { ProjectionRenderer } from "./projection-renderer.js";
import { ShadowRenderer } from "./shadow-renderer.js";
import { TokenLiftRenderer } from "./token-lift-renderer.js";
import { ZScatterCompatibility } from "./z-scatter-compatibility.js";
import {
  calculateAmbientOffset,
  calculateAnimationDuration,
  calculateVisualMetrics,
  easeInOutCosine,
  normalizeFlyingElevation
} from "./visual-math.js";
import { VISUAL_EPSILON } from "./constants.js";

const MIN_ANIMATION_FRAME_MS = 1000 / 30;
const MIN_AMBIENT_FRAME_MS = 1000 / 24;
const MIN_COMPATIBILITY_FRAME_MS = 1000 / 10;

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
    this.lastAmbientApplyAt = Number.NEGATIVE_INFINITY;
    this.lastCompatibilityApplyAt = Number.NEGATIVE_INFINITY;
    this.ambientOffsetY = 0;
    this.ambientStartedAt = performance.now();
    const motionSeed = stableStringHash(token.id ?? token.document?.id ?? "flying-token");
    this.ambientPhase = ((motionSeed % 10_000) / 10_000) * Math.PI * 2;
    this.ambientPeriod = 2800 + (motionSeed % 801);
    this.reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    this.metrics = null;
    this.lastProjectionEmphasized = null;
    this.liftEnabled = false;
    this.zScatterCompatibility = new ZScatterCompatibility(token);

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
    this.standSpecularGraphics = this.container.addChild(new PIXI.Graphics());
    this.shadow = new ShadowRenderer(this.shadowGraphics);
    this.projection = new ProjectionRenderer(this.projectionGraphics);
    this.stand = new FlyingStand(this.standGraphics, this.standSpecularGraphics);
    this.tokenLift = new TokenLiftRenderer(token);

    parent.addChild(this.container);
    this.#syncCompatibility({ enabled: this.displayElevation > 0 });
    this.#syncPosition();
    this.#captureNativeTooltip();
    this.render();
  }

  get isAnimating() {
    return this.animation !== null;
  }

  /** Whether the shared Scene ticker still has useful work for this Token. */
  get requiresTicker() {
    return this.isAnimating || this.needsAmbientMotion || this.needsCompatibilityMonitoring;
  }

  get needsAmbientMotion() {
    return !this.reducedMotion
      && !this.animation
      && !this.followingCoreAnimation
      && !!this.metrics?.flying
      && !!this.container.visible
      && ((this.metrics?.token?.bobAmplitude ?? 0) > VISUAL_EPSILON);
  }

  get needsCompatibilityMonitoring() {
    return this.liftEnabled
      && !!this.container.visible
      && (this.zScatterCompatibility.available || this.zScatterCompatibility.state.active);
  }

  get destroyed() {
    return this.container.destroyed;
  }

  get canRetire() {
    return !this.animation
      && !this.followingCoreAnimation
      && (this.displayElevation <= 0)
      && (this.targetElevation <= 0);
  }

  /** Idempotently reattach after a Token redraw. */
  onDraw() {
    if (!this.container.destroyed && !this.parent.destroyed && (this.container.parent !== this.parent)) {
      this.parent.addChild(this.container);
    }
    this.#syncCompatibility({ enabled: this.liftEnabled || (this.displayElevation > 0) });
    this.#syncPosition();
    this.#captureNativeTooltip();
    this.render();
  }

  updateSettings(settings) {
    this.settings = settings;
    this.render();
  }

  /** React to a live prefers-reduced-motion change without recreating PIXI. */
  setReducedMotion(value) {
    const reduced = !!value;
    if (reduced === this.reducedMotion) return;
    this.reducedMotion = reduced;
    this.#resetAmbientMotion({ apply: true });
    this.ambientStartedAt = performance.now();
    if (reduced && this.animation) {
      this.displayElevation = this.targetElevation;
      this.animation = null;
      this.labelAlpha = 1;
      this.render();
    }
  }

  /** Start a fallback tween from the current displayed elevation. */
  setElevation(value, { animate = true } = {}) {
    const target = normalizeFlyingElevation(value);
    if ((target === this.targetElevation) && this.animation) return false;
    if ((target === this.displayElevation) && !this.animation) {
      this.targetElevation = target;
      this.render();
      return false;
    }

    this.targetElevation = target;
    this.followingCoreAnimation = false;
    this.coreAnimation = null;
    this.#resetAmbientMotion();
    if (!animate || this.reducedMotion) {
      this.animation = null;
      this.displayElevation = target;
      this.labelAlpha = 1;
      this.render();
      this.ambientStartedAt = performance.now();
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
    this.#resetAmbientMotion();
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
      this.ambientStartedAt = performance.now();
    }
    // Tooltip alpha is cheap and should track every core frame even when PIXI
    // geometry redraws are throttled to roughly 30 fps.
    this.#applyNativeTooltipState();
    this.#renderAnimationFrame(performance.now(), { force: !active });
  }

  /** @returns {boolean} Whether this visual still needs shared ticker frames. */
  tick(now) {
    if (this.animation) {
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
        this.ambientStartedAt = now;
      }

      this.#applyNativeTooltipState();
      this.#renderAnimationFrame(now, { force: progress >= 1 });
    }

    if (this.needsCompatibilityMonitoring
      && ((now - this.lastCompatibilityApplyAt) >= MIN_COMPATIBILITY_FRAME_MS)) {
      this.#syncCompatibility({ enabled: true });
      this.#syncPosition();
      this.tokenLift.applyAmbient(this.ambientOffsetY, this.zScatterCompatibility.state);
      this.lastCompatibilityApplyAt = now;
    }

    if (this.needsAmbientMotion && ((now - this.lastAmbientApplyAt) >= MIN_AMBIENT_FRAME_MS)) {
      this.ambientOffsetY = calculateAmbientOffset(
        now - this.ambientStartedAt,
        this.ambientPhase,
        this.metrics.token.bobAmplitude,
        this.ambientPeriod,
        this.reducedMotion
      );
      this.#syncCompatibility({ enabled: true });
      this.#syncPosition();
      this.tokenLift.applyAmbient(this.ambientOffsetY, this.zScatterCompatibility.state);
      this.lastAmbientApplyAt = now;
    } else if (!this.needsAmbientMotion && (Math.abs(this.ambientOffsetY) > VISUAL_EPSILON)) {
      this.#resetAmbientMotion({ apply: true });
    }
    return this.requiresTicker;
  }

  /** Handle only render flags which affect geometry or the native tooltip. */
  onRefresh(flags = {}) {
    this.#syncCompatibility({ enabled: this.liftEnabled || (this.displayElevation > 0) });
    const positionRefreshed = flags.refreshPosition || flags.refreshTransform || flags.redraw;
    const uiBaseRefreshed = flags.refreshSize || flags.refreshTransform || flags.redraw;
    const uiRetainsOwnedOffset = flags.refreshTooltip && !uiBaseRefreshed;
    const meshScaleBaseRefreshed = flags.refreshSize
      || flags.refreshTransform
      || flags.refreshMesh
      || flags.redraw;
    const meshAlphaBaseRefreshed = flags.refreshState || flags.refreshMesh || flags.redraw;
    if (positionRefreshed) this.#syncPosition();
    if (flags.refreshSize || flags.refreshShape || flags.redraw) {
      this.render({
        meshBaseRefreshed: positionRefreshed,
        meshScaleBaseRefreshed,
        meshAlphaBaseRefreshed,
        uiBaseRefreshed,
        uiRetainsOwnedOffset
      });
      return;
    }
    if (flags.refreshState || flags.refreshVisibility) {
      this.#updateVisibility();
      this.#refreshProjectionEmphasis();
    }
    // Horizontal movement does not rebuild any Graphics. Foundry has just put
    // the Primary mesh back at token.center, so reapply the cached visual pose.
    const canUsePositionFastPath = positionRefreshed
      && !meshScaleBaseRefreshed
      && !meshAlphaBaseRefreshed
      && !uiBaseRefreshed
      && !uiRetainsOwnedOffset
      && !this.zScatterCompatibility.state.supported
      && this.liftEnabled
      && this.#shouldEnableTokenLift();
    if (canUsePositionFastPath) {
      this.tokenLift.rebaseMeshPosition(this.ambientOffsetY, this.zScatterCompatibility.state);
    } else {
      this.#applyTokenLift({
        meshBaseRefreshed: positionRefreshed,
        meshScaleBaseRefreshed,
        meshAlphaBaseRefreshed,
        uiBaseRefreshed,
        uiRetainsOwnedOffset
      });
    }
    if (flags.refreshTooltip || flags.refreshElevation) this.#applyNativeTooltipState();
  }

  render({
    meshBaseRefreshed = false,
    meshScaleBaseRefreshed = false,
    meshAlphaBaseRefreshed = false,
    uiBaseRefreshed = false,
    uiRetainsOwnedOffset = false
  } = {}) {
    if (this.container.destroyed || this.token.destroyed) return;
    this.#syncCompatibility({ enabled: (this.displayElevation > 0) || (this.targetElevation > 0) });
    this.#syncPosition();
    const size = this.token.document.getSize();
    const ground = this.#getLocalGround(size);
    const metrics = calculateVisualMetrics({
      elevation: this.displayElevation,
      gridSize: canvas.grid?.size ?? canvas.dimensions?.size ?? 100,
      gridDistance: canvas.grid?.distance ?? canvas.dimensions?.distance ?? 5,
      tokenWidth: size.width,
      tokenHeight: size.height,
      groundX: ground.x,
      groundY: ground.y,
      standOpacity: this.settings.standOpacity,
      shadowOpacity: this.settings.shadowOpacity,
      projectionOpacity: this.settings.projectionOpacity,
      shadowDistanceMultiplier: this.settings.shadowDistanceMultiplier
    });
    this.metrics = metrics;
    this.#syncCompatibility({ enabled: this.#shouldEnableTokenLift(metrics) });
    this.#syncPosition();

    this.#updateVisibility();
    this.#renderGeometry();
    this.#applyTokenLift({
      meshBaseRefreshed,
      meshScaleBaseRefreshed,
      meshAlphaBaseRefreshed,
      uiBaseRefreshed,
      uiRetainsOwnedOffset
    });
    this.#applyNativeTooltipState();
    this.lastAnimatedRenderAt = performance.now();
  }

  destroy() {
    this.animation = null;
    this.coreAnimation = null;
    this.ambientOffsetY = 0;
    this.liftEnabled = false;
    this.tokenLift.restore();
    this.zScatterCompatibility.destroy();
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
    this.tooltipAlphaYielded = false;
  }

  #applyNativeTooltipState() {
    this.#captureNativeTooltip();
    const tooltip = this.nativeTooltip;
    if (!tooltip || tooltip.destroyed) return;
    const flying = (this.displayElevation > 0) || (this.targetElevation > 0);

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
        this.tooltipAlphaYielded = false;
      } else if (!this.tooltipAlphaYielded
        && (Math.abs(tooltip.alpha - this.tooltipLastWrittenAlpha) > VISUAL_EPSILON)) {
        // A later module now owns tooltip alpha. Yield for the remainder of
        // this transition instead of overwriting or restoring its value.
        this.tooltipAlphaYielded = true;
      }
      if (!this.tooltipAlphaYielded) {
        this.tooltipLastWrittenAlpha = this.tooltipAlphaBeforeModule * this.labelAlpha;
        tooltip.alpha = this.tooltipLastWrittenAlpha;
      }
    } else if (this.tooltipAlphaAnimatedByModule) {
      if (!this.tooltipAlphaYielded
        && (Math.abs(tooltip.alpha - this.tooltipLastWrittenAlpha) <= VISUAL_EPSILON)) {
        tooltip.alpha = this.tooltipAlphaBeforeModule;
      }
      this.tooltipAlphaAnimatedByModule = false;
      this.tooltipAlphaYielded = false;
    }
  }

  #restoreNativeTooltip() {
    const tooltip = this.nativeTooltip;
    if (tooltip && !tooltip.destroyed) {
      if (this.tooltipHiddenByModule && (tooltip.renderable === false)) {
        tooltip.renderable = this.tooltipRenderableBeforeModule;
      }
      if (this.tooltipAlphaAnimatedByModule
        && !this.tooltipAlphaYielded
        && (Math.abs(tooltip.alpha - this.tooltipLastWrittenAlpha) <= VISUAL_EPSILON)) {
        tooltip.alpha = this.tooltipAlphaBeforeModule;
      }
    }
    this.nativeTooltip = null;
    this.tooltipHiddenByModule = false;
    this.tooltipAlphaAnimatedByModule = false;
    this.tooltipAlphaYielded = false;
  }

  #renderAnimationFrame(now, { force = false } = {}) {
    if (!force && ((now - this.lastAnimatedRenderAt) < MIN_ANIMATION_FRAME_MS)) return;
    this.render();
  }

  #applyTokenLift({
    meshBaseRefreshed = false,
    meshScaleBaseRefreshed = false,
    meshAlphaBaseRefreshed = false,
    uiBaseRefreshed = false,
    uiRetainsOwnedOffset = false
  } = {}) {
    const metrics = this.metrics;
    if (!metrics) return;
    const enabled = this.#shouldEnableTokenLift(metrics);
    metrics.token.ambientOffsetY = this.ambientOffsetY;
    this.tokenLift.apply(metrics.token, {
      enabled,
      meshBaseRefreshed,
      meshScaleBaseRefreshed,
      meshAlphaBaseRefreshed,
      uiBaseRefreshed,
      uiRetainsOwnedOffset,
      externalLayout: this.zScatterCompatibility.state
    });
    this.liftEnabled = enabled;
  }

  #shouldEnableTokenLift(metrics = this.metrics) {
    if (!metrics) return false;
    const visibleToUser = (this.token.visible !== false) && !this.token.document.isSecret;
    return metrics.flying && visibleToUser && this.#hasVisibleGeometry(metrics);
  }

  #updateVisibility() {
    const metrics = this.metrics;
    if (!metrics) return;
    const visibleToUser = (this.token.visible !== false) && !this.token.document.isSecret;
    const geometryEnabled = this.#hasVisibleGeometry(metrics);
    this.container.visible = metrics.flying && visibleToUser && geometryEnabled;
  }

  #renderGeometry() {
    const metrics = this.metrics;
    if (!metrics) return;
    this.shadow.render(metrics, this.settings.enableShadow);
    this.#renderProjection();
    this.stand.render(metrics, this.settings.enableStand);
  }

  #renderProjection() {
    const metrics = this.metrics;
    if (!metrics) return;
    const emphasized = !!(this.token.controlled || this.token.hover);
    this.projection.render(metrics, this.settings.enableGroundProjection, {
      standEnabled: this.settings.enableStand && (metrics.stand.opacity > VISUAL_EPSILON),
      emphasized,
      footprintShape: this.token.shape ?? null
    });
    this.lastProjectionEmphasized = emphasized;
  }

  #refreshProjectionEmphasis() {
    const emphasized = !!(this.token.controlled || this.token.hover);
    if (emphasized !== this.lastProjectionEmphasized) this.#renderProjection();
  }

  #resetAmbientMotion({ apply = false } = {}) {
    const hadOffset = Math.abs(this.ambientOffsetY) > VISUAL_EPSILON;
    this.ambientOffsetY = 0;
    this.lastAmbientApplyAt = Number.NEGATIVE_INFINITY;
    if (apply && hadOffset) {
      this.#syncCompatibility({ enabled: this.liftEnabled });
      this.tokenLift.applyAmbient(0, this.zScatterCompatibility.state);
    }
  }

  #hasVisibleGeometry(metrics) {
    return (this.settings.enableStand && (metrics.stand.opacity > VISUAL_EPSILON))
      || (this.settings.enableShadow
        && ((metrics.shadow.alpha > VISUAL_EPSILON) || (metrics.shadow.contactAlpha > VISUAL_EPSILON)))
      || (this.settings.enableGroundProjection && (metrics.projection.alpha > VISUAL_EPSILON));
  }

  #syncPosition() {
    if (this.container.destroyed) return;
    const layout = this.zScatterCompatibility.state;
    const scatterX = layout.supported ? layout.offsetX : 0;
    const scatterY = layout.supported ? layout.offsetY : 0;
    const x = (Number(this.token.position?.x ?? this.token.document?.x) || 0) + scatterX;
    const y = (Number(this.token.position?.y ?? this.token.document?.y) || 0) + scatterY;
    if (this.container.position?.set) this.container.position.set(x, y);
    else {
      this.container.x = x;
      this.container.y = y;
    }
  }

  #getLocalGround(size) {
    const centerX = Number(this.token.center?.x);
    const centerY = Number(this.token.center?.y);
    const originX = Number(this.container.position?.x ?? this.container.x);
    const originY = Number(this.container.position?.y ?? this.container.y);
    const layout = this.zScatterCompatibility.state;
    const scatterX = layout.supported ? layout.offsetX : 0;
    const scatterY = layout.supported ? layout.offsetY : 0;
    return {
      x: Number.isFinite(centerX) && Number.isFinite(originX)
        ? centerX + scatterX - originX
        : size.width / 2,
      y: Number.isFinite(centerY) && Number.isFinite(originY)
        ? centerY + scatterY - originY
        : size.height / 2
    };
  }

  #syncCompatibility({ enabled = this.liftEnabled } = {}) {
    const tokenMetrics = this.metrics?.token;
    return this.zScatterCompatibility.sync({
      enabled,
      liftX: tokenMetrics?.offsetX ?? 0,
      liftY: (tokenMetrics?.offsetY ?? 0) + this.ambientOffsetY
    });
  }
}

function labelTransitionAlpha(progress, target, initialAlpha = 1) {
  if (progress < 0.45) return initialAlpha * (1 - (progress / 0.45));
  return target > 0 ? (progress - 0.45) / 0.55 : 0;
}

/** Small deterministic FNV-1a hash; avoids synchronized ambient motion. */
function stableStringHash(value) {
  const string = String(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < string.length; index += 1) {
    hash ^= string.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
