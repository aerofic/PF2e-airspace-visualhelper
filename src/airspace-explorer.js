import {
  AIRSPACE_RADIUS_MAX,
  AIRSPACE_RADIUS_MIN,
  AIRSPACE_RADIUS_STEP,
  AIRSPACE_REFRESH_DELAY_MS,
  MODULE_ID,
  PING_DURATION_MS,
  SETTINGS
} from "./constants.js";
import { readSettings } from "./settings.js";
import {
  buildAirspaceView,
  collectEntriesWithinRadius,
  DEFAULT_AIRSPACE_CAMERA,
  formatHeight,
  normalizeAirspaceCamera
} from "./airspace-view.js";
import { normalizeHudElevation } from "./visual-math.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export const AIRSPACE_EXPLORER_POSITION = Object.freeze({
  width: 520,
  height: 600,
  left: 64,
  top: 72
});

/** ApplicationV2 controller for the local, selected-Token-centered airspace. */
export class AirspaceExplorer extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "pf2e-flying-visual-helper-airspace",
    classes: ["pf2e-flying-visual-helper", "airspace-explorer"],
    window: {
      // Use Foundry's real ApplicationV2 frame. Besides the native title bar,
      // this supplies the .application positioning and z-index contract which
      // makes the explorer a draggable workspace window instead of body flow.
      frame: true,
      positioned: true,
      title: "PF2E_FLYING_VISUAL_HELPER.Airspace.title",
      resizable: true,
      minimizable: false
    },
    position: { ...AIRSPACE_EXPLORER_POSITION },
    actions: {
      resetCamera: AirspaceExplorer.#onResetCamera,
      selectToken: AirspaceExplorer.#onSelectToken,
      targetToken: AirspaceExplorer.#onTargetToken
    }
  };

  static PARTS = {
    controls: {
      template: "modules/pf2e-flying-visual-helper/templates/airspace-controls.hbs"
    },
    view: {
      template: "modules/pf2e-flying-visual-helper/templates/airspace-view.hbs"
    }
  };

  #selectedTokenId = null;
  #radiusSpaces = null;
  #refreshTimer = null;
  #listenerAbortController = null;
  #cameraGestureAbortController = null;
  #cameraFrame = null;
  #camera = { ...DEFAULT_AIRSPACE_CAMERA };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    if (this.#radiusSpaces === null) {
      this.#radiusSpaces = normalizeAirspaceRadius(readSettings().airspaceRadius);
    }
    const unit = getSceneDistanceUnit();
    const allEntries = collectVisibleTokenEntries({ unit });
    const selected = resolveSelectedEntry(allEntries, this.#selectedTokenId);
    const nearbyEntries = collectEntriesWithinRadius(allEntries, selected, {
      gridSize: canvas.grid?.size ?? canvas.dimensions?.size ?? 100,
      radiusSpaces: this.#radiusSpaces
    });
    const view = selected
      ? buildAirspaceView(nearbyEntries, {
        selectedId: selected.id,
        radiusSpaces: this.#radiusSpaces,
        gridDistance: canvas.grid?.distance ?? canvas.dimensions?.distance ?? 5,
        width: Math.max(318, (Number(this.position?.width) || AIRSPACE_EXPLORER_POSITION.width) - 18),
        // Native header and the merged compact toolbar consume about 54 px.
        // Keep a small safety allowance for borders and viewport clamping.
        height: Math.max(348, (Number(this.position?.height) || AIRSPACE_EXPLORER_POSITION.height) - 66),
        camera: this.#camera
      })
      : null;

    return {
      ...context,
      radius: {
        min: AIRSPACE_RADIUS_MIN,
        max: AIRSPACE_RADIUS_MAX,
        step: AIRSPACE_RADIUS_STEP,
        value: this.#radiusSpaces,
        label: formatRadiusLabel(this.#radiusSpaces)
      },
      hasSelection: !!selected,
      selected: selected ? {
        ...selected,
        elevationLabel: `${formatHeight(selected.elevation)} ${unit}`
      } : null,
      nearbyCount: nearbyEntries.length,
      camera: {
        zoomLabel: `${this.#camera.zoom.toFixed(1)}×`
      },
      view: view ? {
        ...view,
        altitudeTicks: view.altitudeTicks.map(tick => ({
          ...tick,
          label: `${formatHeight(tick.elevation)} ${unit}`
        })),
        nodes: view.nodes.map(node => ({
          ...node,
          elevationLabel: `${formatHeight(node.elevation)} ${unit}`,
          targetLabel: game.i18n.format(
            node.targeted
              ? "PF2E_FLYING_VISUAL_HELPER.Airspace.untargetToken"
              : "PF2E_FLYING_VISUAL_HELPER.Airspace.targetToken",
            { name: node.name }
          ),
          distanceLabel: node.selected
            ? game.i18n.localize("PF2E_FLYING_VISUAL_HELPER.Airspace.anchor")
            : game.i18n.format("PF2E_FLYING_VISUAL_HELPER.Airspace.distance", {
              distance: formatHeight(node.distanceSpaces)
            })
        }))
      } : null,
      selectPrompt: game.i18n.localize("PF2E_FLYING_VISUAL_HELPER.Airspace.selectPrompt")
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.#listenerAbortController?.abort();
    this.#listenerAbortController = new AbortController();
    const { signal } = this.#listenerAbortController;

    const radiusInput = this.parts.controls?.querySelector("[data-airspace-radius]");
    if (radiusInput) this.#activateRadiusInput(radiusInput, { signal });

    const stage = this.parts.view?.querySelector("[data-airspace-camera]");
    if (stage) {
      activateAirspaceCamera(stage, {
        getCamera: () => this.#camera,
        onCameraChange: camera => {
          this.#camera = camera;
          this.#queueCameraRefresh();
        },
        onGestureController: controller => {
          this.#cameraGestureAbortController?.abort();
          this.#cameraGestureAbortController = controller;
        },
        onGestureState: active => this.element?.classList?.toggle("is-orbiting", active)
      }, { signal });
    }
  }

  _onClose(options) {
    this.#listenerAbortController?.abort();
    this.#listenerAbortController = null;
    this.#cameraGestureAbortController?.abort();
    this.#cameraGestureAbortController = null;
    this.element?.classList?.remove("is-orbiting");
    if (this.#refreshTimer !== null) clearTimeout(this.#refreshTimer);
    this.#refreshTimer = null;
    cancelFrame(this.#cameraFrame);
    this.#cameraFrame = null;
    super._onClose(options);
  }

  async toggle() {
    if (this.rendered) return this.close();
    const position = calculateAirspaceExplorerPosition({
      viewportWidth: globalThis.innerWidth,
      viewportHeight: globalThis.innerHeight,
      entryCount: collectVisibleTokenEntries().length
    });

    // ApplicationV2#setPosition requires an existing HTMLElement. Passing the
    // opening geometry through render lets Foundry apply it after first insert.
    return this.render({ force: true, position });
  }

  /** Debounce hook bursts and never reopen a panel the user closed. */
  requestRefresh({ immediate = false, includeControls = false } = {}) {
    if (!this.rendered) return;
    if (this.#refreshTimer !== null) clearTimeout(this.#refreshTimer);
    const parts = includeControls ? ["controls", "view"] : ["view"];
    if (immediate) {
      this.#refreshTimer = null;
      void this.render({ parts });
      return;
    }
    this.#refreshTimer = setTimeout(() => {
      this.#refreshTimer = null;
      if (this.rendered) void this.render({ parts });
    }, AIRSPACE_REFRESH_DELAY_MS);
  }

  onControlToken(token, controlled) {
    if (controlled) this.#selectedTokenId = token?.id ?? null;
    else if (token?.id === this.#selectedTokenId) {
      this.#selectedTokenId = canvas.tokens?.controlled?.at(-1)?.id ?? null;
    }
    this.requestRefresh({ immediate: true, includeControls: true });
  }

  setRadius(value, { refresh = true } = {}) {
    const radius = normalizeAirspaceRadius(value);
    if (radius === this.#radiusSpaces) return false;
    this.#radiusSpaces = radius;
    if (refresh) this.requestRefresh({ includeControls: true });
    return true;
  }

  #activateRadiusInput(input, { signal } = {}) {
    const output = this.parts.controls?.querySelector("[data-airspace-radius-output]");
    input.addEventListener("input", event => {
      const radius = normalizeAirspaceRadius(event.currentTarget.value);
      this.#radiusSpaces = radius;
      if (output) output.textContent = formatRadiusLabel(radius);
      this.requestRefresh();
    }, { signal });
    input.addEventListener("change", event => {
      const radius = normalizeAirspaceRadius(event.currentTarget.value);
      this.#radiusSpaces = radius;
      void game.settings.set(MODULE_ID, SETTINGS.AIRSPACE_RADIUS, radius);
      this.requestRefresh({ immediate: true });
    }, { signal });
  }

  static #onResetCamera(event) {
    event.preventDefault();
    this.#camera = { ...DEFAULT_AIRSPACE_CAMERA };
    this.#queueCameraRefresh();
  }

  static async #onSelectToken(event, target) {
    event.preventDefault();
    const token = resolveActionToken(target.dataset.tokenId);
    if (!token) return;

    if (token.document.canUserModify?.(game.user, "update")) {
      canvas.tokens.activate({ tool: "select" });
      token.control({ releaseOthers: true });
    }
    const reducedMotion = prefersReducedMotion();
    await token.panCanvas({ force: true, duration: reducedMotion ? 0 : 250 });
    if (!resolveActionToken(token.id)) return;

    const style = reducedMotion
      ? CONFIG.Canvas.pings.types.PULL
      : CONFIG.Canvas.pings.types.PULSE;
    void canvas.controls.drawPing(token.center, {
      style,
      user: game.user,
      duration: PING_DURATION_MS
    });
  }

  static #onTargetToken(event, target) {
    event.preventDefault();
    event.stopPropagation();
    const token = resolveActionToken(target.dataset.tokenId);
    if (!token) return;
    const targeted = game.user?.targets?.has?.(token) ?? false;
    token.setTarget(!targeted, {
      user: game.user,
      releaseOthers: false,
      groupSelection: true
    });
    this.requestRefresh({ immediate: true });
  }

  #queueCameraRefresh() {
    if (!this.rendered || this.#cameraFrame !== null) return;
    this.#cameraFrame = requestFrame(() => {
      this.#cameraFrame = null;
      if (this.rendered) void this.render({ parts: ["view"] });
    });
  }
}

/** Build privacy-filtered rows from rendered Token placeables only. */
export function collectVisibleTokenEntries({ unit = "ft" } = {}) {
  if (!canvas.ready) return [];
  return (canvas.tokens?.placeables ?? [])
    .filter(isAirspaceTokenVisible)
    .map(token => createTokenEntry(token, unit));
}

export function isAirspaceTokenVisible(token) {
  return !!token
    && !token.destroyed
    && token.visible === true
    && !token.document?.isSecret;
}

/** Read PF2e's final prepared Fly Speed and respect Observer privacy. */
export function extractFlySpeed(actor, user = game.user) {
  if (!actor) return null;
  if (actor.isOfType && !actor.isOfType("creature")) return null;
  if (actor.testUserPermission && !actor.testUserPermission(user, "OBSERVER")) return null;
  const fly = actor.system?.movement?.speeds?.fly;
  const value = Number(fly?.value);
  return fly && Number.isFinite(value) ? value : null;
}

export function normalizeAirspaceRadius(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 8;
  const stepped = Math.round(number / AIRSPACE_RADIUS_STEP) * AIRSPACE_RADIUS_STEP;
  return Math.min(Math.max(stepped, AIRSPACE_RADIUS_MIN), AIRSPACE_RADIUS_MAX);
}

/** Calculate one stable opening size; an active panel never jumps as Tokens move. */
export function calculateAirspaceExplorerPosition({
  viewportWidth = 1280,
  viewportHeight = 800,
  entryCount = 0
} = {}) {
  const safeViewportWidth = positiveFiniteOr(viewportWidth, 1280);
  const safeViewportHeight = positiveFiniteOr(viewportHeight, 800);
  const density = Math.min(Math.sqrt(Math.max(0, Number(entryCount) || 0)) * 34, 170);
  const availableWidth = Math.max(360, safeViewportWidth - 96);
  const availableHeight = Math.max(460, safeViewportHeight - 112);
  const width = Math.round(Math.min(Math.max(460 + density, 460), 720, availableWidth));
  const height = Math.round(Math.min(Math.max(540 + (density * 0.72), 540), 760, availableHeight));
  return {
    width,
    height,
    left: Math.min(AIRSPACE_EXPLORER_POSITION.left, Math.max(12, safeViewportWidth - width - 12)),
    top: Math.min(AIRSPACE_EXPLORER_POSITION.top, Math.max(12, safeViewportHeight - height - 12))
  };
}

function createTokenEntry(token, unit) {
  const elevation = normalizeHudElevation(token.document.elevation);
  const name = getVisibleTokenName(token);
  const flySpeed = extractFlySpeed(token.actor ?? token.document.actor);
  const elevationLabel = `${formatHeight(elevation)} ${unit}`;
  const flySpeedLabel = flySpeed === null ? null : `${formatHeight(flySpeed)} ${getPf2eFeetUnit()}`;
  const details = [
    name,
    `${game.i18n.localize("PF2E_FLYING_VISUAL_HELPER.Airspace.elevation")}: ${elevationLabel}`
  ];
  if (flySpeedLabel) {
    details.push(`${game.i18n.localize("PF2E_FLYING_VISUAL_HELPER.Airspace.flySpeed")}: ${flySpeedLabel}`);
  }
  return {
    id: token.id,
    name,
    img: token.document.texture?.src ?? token.actor?.img ?? "icons/svg/mystery-man.svg",
    elevation,
    flySpeed,
    flySpeedLabel,
    hasFlySpeed: flySpeed !== null,
    targeted: game.user?.targets?.has?.(token) ?? false,
    tooltipText: details.join(" · "),
    accessibleLabel: details.join(", "),
    centerX: Number(token.center?.x) || 0,
    centerY: Number(token.center?.y) || 0
  };
}

function getVisibleTokenName(token) {
  if (game.user.isGM || token.document.playersCanSeeName !== false) return token.document.name;
  const key = "PF2E.Token.Mystified.TheCreature";
  const localized = game.i18n.localize(key);
  return localized === key ? game.i18n.localize("TOKEN.Token") : localized;
}

function resolveSelectedEntry(entries, selectedTokenId) {
  const selected = selectedTokenId
    ? entries.find(entry => entry.id === selectedTokenId)
    : null;
  if (selected) return selected;
  const controlledId = canvas.tokens?.controlled?.at(-1)?.id;
  return controlledId ? entries.find(entry => entry.id === controlledId) ?? null : null;
}

function resolveActionToken(tokenId) {
  if (!canvas.ready) return null;
  const token = canvas.tokens?.get?.(tokenId)
    ?? canvas.tokens?.placeables?.find(candidate => candidate.id === tokenId);
  return isAirspaceTokenVisible(token) && token.document?.parent === canvas.scene ? token : null;
}

function getSceneDistanceUnit() {
  return String(canvas.grid?.units ?? canvas.scene?.grid?.units ?? "ft").trim() || "ft";
}

function getPf2eFeetUnit() {
  const key = "PF2E.TravelSpeed.FeetAcronym";
  const localized = game.i18n.localize(key);
  return localized === key ? "ft" : localized;
}

function formatRadiusLabel(radius) {
  return game.i18n.format("PF2E_FLYING_VISUAL_HELPER.Airspace.rangeValue", { radius });
}

function prefersReducedMotion() {
  return canvas.photosensitiveMode
    || (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false);
}

function positiveFiniteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

/** Orbit on blank stage space and zoom around the current view with the wheel. */
export function activateAirspaceCamera(stage, {
  getCamera,
  onCameraChange,
  onGestureController,
  onGestureState
} = {}, { signal } = {}) {
  stage.addEventListener("pointerdown", event => {
    if (event.button !== 0 || event.target?.closest?.("button, input, a")) return;
    event.preventDefault();
    const controller = new AbortController();
    onGestureController?.(controller);
    onGestureState?.(true);
    let previousX = event.clientX;
    let previousY = event.clientY;
    const eventTarget = globalThis.window ?? globalThis;

    eventTarget.addEventListener("pointermove", moveEvent => {
      const deltaX = moveEvent.clientX - previousX;
      const deltaY = moveEvent.clientY - previousY;
      previousX = moveEvent.clientX;
      previousY = moveEvent.clientY;
      if ((deltaX === 0) && (deltaY === 0)) return;
      onCameraChange?.(orbitAirspaceCamera(getCamera?.(), { deltaX, deltaY }));
    }, { signal: controller.signal });

    const stop = () => {
      onGestureState?.(false);
      controller.abort();
    };
    eventTarget.addEventListener("pointerup", stop, { once: true, signal: controller.signal });
    eventTarget.addEventListener("pointercancel", stop, { once: true, signal: controller.signal });
  }, { signal });

  stage.addEventListener("wheel", event => {
    if (event.target?.closest?.("button, input, a")) return;
    event.preventDefault();
    onCameraChange?.(zoomAirspaceCamera(getCamera?.(), event.deltaY));
  }, { passive: false, signal });
}

export function orbitAirspaceCamera(camera, { deltaX = 0, deltaY = 0 } = {}) {
  const current = normalizeAirspaceCamera(camera);
  return normalizeAirspaceCamera({
    ...current,
    yaw: current.yaw + (Number(deltaX) * 0.009),
    pitch: current.pitch - (Number(deltaY) * 0.006)
  });
}

export function zoomAirspaceCamera(camera, deltaY = 0) {
  const current = normalizeAirspaceCamera(camera);
  const wheelDelta = Number(deltaY);
  const factor = Number.isFinite(wheelDelta) ? Math.exp(-wheelDelta * 0.0015) : 1;
  return normalizeAirspaceCamera({ ...current, zoom: current.zoom * factor });
}

function requestFrame(callback) {
  return globalThis.requestAnimationFrame?.(callback)
    ?? globalThis.setTimeout(callback, 16);
}

function cancelFrame(frame) {
  if (frame === null) return;
  if (globalThis.cancelAnimationFrame) globalThis.cancelAnimationFrame(frame);
  else globalThis.clearTimeout(frame);
}
