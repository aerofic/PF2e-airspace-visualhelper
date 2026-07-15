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
  formatHeight
} from "./airspace-view.js";
import { normalizeHudElevation } from "./visual-math.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export const AIRSPACE_EXPLORER_POSITION = Object.freeze({
  width: 340,
  height: 486,
  left: 64,
  top: 72
});

/** ApplicationV2 controller for the local, selected-Token-centered airspace. */
export class AirspaceExplorer extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "pf2e-flying-visual-helper-airspace",
    classes: ["pf2e-flying-visual-helper", "airspace-explorer"],
    window: {
      frame: false,
      positioned: true,
      title: "PF2E_FLYING_VISUAL_HELPER.Airspace.title",
      resizable: false,
      minimizable: false
    },
    position: { ...AIRSPACE_EXPLORER_POSITION },
    actions: {
      closeAirspace: AirspaceExplorer.#onCloseAirspace,
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
        gridDistance: canvas.grid?.distance ?? canvas.dimensions?.distance ?? 5
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
    const dragHandle = this.parts.controls?.querySelector(".airspace-drag-handle");
    if (dragHandle) activateAirspaceDragging(dragHandle, this, { signal });

    const radiusInput = this.parts.controls?.querySelector("[data-airspace-radius]");
    if (radiusInput) this.#activateRadiusInput(radiusInput, { signal });
  }

  _onClose(options) {
    this.#listenerAbortController?.abort();
    this.#listenerAbortController = null;
    if (this.#refreshTimer !== null) clearTimeout(this.#refreshTimer);
    this.#refreshTimer = null;
    super._onClose(options);
  }

  async toggle() {
    if (this.rendered) return this.close();
    return this.render({ force: true });
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
    this.requestRefresh({ immediate: true });
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

  static #onCloseAirspace(event) {
    event.preventDefault();
    return this.close();
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

/** Pointer-captured dragging; arrow keys only move the focused panel handle. */
function activateAirspaceDragging(handle, application, { signal } = {}) {
  let pointerId = null;
  let originX = 0;
  let originY = 0;
  let originLeft = 0;
  let originTop = 0;

  handle.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    event.preventDefault();
    pointerId = event.pointerId;
    originX = event.clientX;
    originY = event.clientY;
    originLeft = Number(application.position?.left) || 0;
    originTop = Number(application.position?.top) || 0;
    handle.setPointerCapture(pointerId);
    handle.classList.add("is-dragging");
  }, { signal });

  handle.addEventListener("pointermove", event => {
    if (event.pointerId !== pointerId) return;
    application.setPosition({
      left: originLeft + (event.clientX - originX),
      top: originTop + (event.clientY - originY)
    });
  }, { signal });

  const stopDragging = event => {
    if (event.pointerId !== pointerId) return;
    if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
    pointerId = null;
    handle.classList.remove("is-dragging");
  };
  handle.addEventListener("pointerup", stopDragging, { signal });
  handle.addEventListener("pointercancel", stopDragging, { signal });

  handle.addEventListener("keydown", event => {
    const directions = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1]
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    const step = event.shiftKey ? 1 : 10;
    application.setPosition({
      left: (Number(application.position?.left) || 0) + (direction[0] * step),
      top: (Number(application.position?.top) || 0) + (direction[1] * step)
    });
  }, { signal });
}
