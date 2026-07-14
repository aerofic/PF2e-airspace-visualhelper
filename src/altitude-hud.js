import {
  HUD_FILTERS,
  HUD_REFRESH_DELAY_MS,
  NEARBY_RADIUS_GRID_SPACES,
  PING_DURATION_MS,
  VISUAL_EPSILON
} from "./constants.js";
import {
  buildAltitudeAxis,
  filterAltitudeEntries,
  formatFeet,
  sortAltitudeEntries
} from "./altitude-axis.js";
import { readSettings } from "./settings.js";
import { normalizeHudElevation } from "./visual-math.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Default to a tiny navigation-style status bar centered near the Canvas top. */
export const ALTITUDE_HUD_DEFAULT_POSITION = Object.freeze({
  width: 360,
  height: 32,
  top: 52
});

/** The proportional axis and Token details are created only on demand. */
export const ALTITUDE_HUD_EXPANDED_POSITION = Object.freeze({
  width: 520,
  height: 260,
  top: 52
});

/** ApplicationV2 airspace HUD for the currently viewed Scene. */
export class AltitudeHud extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "pf2e-flying-visual-helper-airspace",
    classes: ["pf2e-flying-visual-helper", "airspace-hud"],
    window: {
      frame: false,
      positioned: true,
      title: "PF2E_FLYING_VISUAL_HELPER.Hud.title",
      resizable: false,
      minimizable: false
    },
    // Omitting left lets ApplicationV2 center the HUD horizontally on its
    // first render. Its stored position remains user-draggable thereafter.
    position: { ...ALTITUDE_HUD_DEFAULT_POSITION },
    actions: {
      toggleDetails: AltitudeHud.#onToggleDetails,
      closeHud: AltitudeHud.#onCloseHud,
      setFilter: AltitudeHud.#onSetFilter,
      focusToken: AltitudeHud.#onFocusToken
    }
  };

  static PARTS = {
    main: {
      template: "modules/pf2e-flying-visual-helper/templates/altitude-hud.hbs",
      scrollable: [".airspace-axis-scroll", ".airspace-compact-list"]
    }
  };

  #filter = HUD_FILTERS.ALL;
  #expanded = false;
  #selectedTokenId = null;
  #refreshTimer = null;
  #listenerAbortController = null;

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const settings = readSettings();
    const unit = getSceneDistanceUnit();
    const allEntries = collectVisibleTokenEntries({ unit });
    const filteredEntries = sortAltitudeEntries(filterAltitudeEntries(allEntries, this.#filter));
    const selected = resolveSelectedEntry(allEntries, this.#selectedTokenId);
    const relations = this.#expanded
      ? buildAltitudeRelations(selected, allEntries, {
        gridSize: canvas.grid?.size ?? canvas.dimensions?.size ?? 100,
        radiusSpaces: NEARBY_RADIUS_GRID_SPACES
      }).map(relation => ({
        ...relation,
        relationText: formatRelation(relation, unit),
        relationActionLabel: `${relation.name}, ${formatRelation(relation, unit)}, ${relation.accessibleLabel}`
      }))
      : [];

    // The proportional axis can be several hundred DOM nodes in pathological
    // Scenes. Do not even calculate it while the 32 px navigation bar is shut.
    const showHeightAxis = this.#expanded && settings.enableHeightAxis;
    const axis = showHeightAxis ? buildAltitudeAxis(filteredEntries) : null;

    const filterIcons = {
      [HUD_FILTERS.ALL]: "fa-layer-group",
      [HUD_FILTERS.GROUND]: "fa-arrow-down",
      [HUD_FILTERS.AIR]: "fa-arrow-up"
    };
    const filters = Object.values(HUD_FILTERS).map(filter => ({
      id: filter,
      active: filter === this.#filter,
      label: game.i18n.localize(`PF2E_FLYING_VISUAL_HELPER.Hud.filter.${filter}`),
      icon: filterIcons[filter]
    }));
    const summarySelected = filteredEntries.find(entry => entry.id === selected?.id) ?? null;
    const summary = buildHudSummary({ selected: summarySelected, entries: filteredEntries, unit });

    return {
      ...context,
      filters,
      isExpanded: this.#expanded,
      showHeightAxis,
      hasTokens: filteredEntries.length > 0,
      entries: filteredEntries,
      axis: axis ? {
        ...axis,
        ticks: axis.ticks.map(tick => ({
          ...tick,
          label: tick.major ? `${formatFeet(tick.elevation)} ${unit}` : ""
        }))
      } : null,
      summaryLabel: summary.label,
      summaryAccessibleLabel: summary.accessibleLabel,
      summaryTooltipText: summary.tooltipText,
      toggleDetailsLabel: game.i18n.localize(this.#expanded
        ? "PF2E_FLYING_VISUAL_HELPER.Hud.collapseDetails"
        : "PF2E_FLYING_VISUAL_HELPER.Hud.expandDetails"),
      selected: selected ? {
        ...selected,
        elevationLabel: `${formatFeet(selected.elevation)} ${unit}`
      } : null,
      relations,
      hasRelations: relations.length > 0,
      noNearbyAirText: game.i18n.format("PF2E_FLYING_VISUAL_HELPER.Hud.noNearbyAir", {
        radius: NEARBY_RADIUS_GRID_SPACES
      })
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.#listenerAbortController?.abort();
    this.#listenerAbortController = new AbortController();
    const { signal } = this.#listenerAbortController;
    const dragHandle = this.parts.main?.querySelector(".airspace-drag-handle");
    if (dragHandle) activateHudDragging(dragHandle, this, { signal });
    const viewport = this.parts.main?.querySelector(".airspace-axis-scroll");
    if (viewport) activateDragScrolling(viewport, { signal });
  }

  _preClose(options) {
    // Re-opening must always return to the unobtrusive navigation bar. Resize
    // while the element still exists because ApplicationV2 removes it before
    // _onClose runs.
    this.#expanded = false;
    this.#setModePosition(ALTITUDE_HUD_DEFAULT_POSITION);
    return super._preClose(options);
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
    this.#expanded = false;
    return this.render({ force: true });
  }

  /** Debounce hook bursts and never reopen a HUD the user manually closed. */
  requestRefresh({ immediate = false } = {}) {
    if (!this.rendered) return;
    if (this.#refreshTimer !== null) clearTimeout(this.#refreshTimer);
    if (immediate) {
      this.#refreshTimer = null;
      void this.render({ parts: ["main"] });
      return;
    }
    this.#refreshTimer = setTimeout(() => {
      this.#refreshTimer = null;
      if (this.rendered) void this.render({ parts: ["main"] });
    }, HUD_REFRESH_DELAY_MS);
  }

  onControlToken(token, controlled) {
    if (controlled) this.#selectedTokenId = token?.id ?? null;
    else if (token?.id === this.#selectedTokenId) {
      this.#selectedTokenId = canvas.tokens?.controlled?.at(-1)?.id ?? null;
    }
    this.requestRefresh();
  }

  #setModePosition(modePosition) {
    const currentWidth = Number(this.position?.width);
    const currentLeft = Number(this.position?.left);
    const nextPosition = {
      width: modePosition.width,
      height: modePosition.height
    };
    // Expand around the current horizontal center instead of jumping away
    // from a location chosen by the user.
    if (Number.isFinite(currentWidth) && Number.isFinite(currentLeft)) {
      nextPosition.left = currentLeft + ((currentWidth - modePosition.width) / 2);
    }
    this.setPosition(nextPosition);
  }

  static async #onToggleDetails(event) {
    event.preventDefault();
    this.#expanded = !this.#expanded;
    this.#setModePosition(this.#expanded
      ? ALTITUDE_HUD_EXPANDED_POSITION
      : ALTITUDE_HUD_DEFAULT_POSITION);
    await this.render({ parts: ["main"] });
    this.parts?.main
      ?.querySelector("#pf2e-fvh-airspace-summary")
      ?.focus({ preventScroll: true });
  }

  static #onCloseHud(event) {
    event.preventDefault();
    return this.close();
  }

  static async #onSetFilter(event, target) {
    event.preventDefault();
    const filter = target.dataset.filter;
    if (!Object.values(HUD_FILTERS).includes(filter) || (filter === this.#filter)) return;
    this.#filter = filter;
    await this.render({ parts: ["main"] });
    this.parts?.main
      ?.querySelector(`[data-action="setFilter"][data-filter="${filter}"]`)
      ?.focus({ preventScroll: true });
  }

  static async #onFocusToken(event, target) {
    event.preventDefault();
    const tokenId = target.dataset.tokenId;
    const token = canvas.ready
      ? (canvas.tokens?.get?.(tokenId) ?? canvas.tokens?.placeables?.find(candidate => candidate.id === tokenId))
      : null;
    if (!isHudTokenVisible(token) || (token.document?.parent !== canvas.scene)) return;

    // This is an explicit selection action. Activate the public Token layer
    // only for a user allowed to control the document; never force ownership.
    if (token.document.canUserModify?.(game.user, "update")) {
      canvas.tokens.activate({ tool: "select" });
      token.control({ releaseOthers: true });
    }
    // A player may still pan to and locally ping a visible Token they do not own.
    const reducedMotion = canvas.photosensitiveMode
      || (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false);
    await token.panCanvas({ force: true, duration: reducedMotion ? 0 : 250 });
    if (!canvas.ready || token.destroyed || !isHudTokenVisible(token)) return;

    const style = reducedMotion
      ? CONFIG.Canvas.pings.types.PULL
      : CONFIG.Canvas.pings.types.PULSE;
    void canvas.controls.drawPing(token.center, {
      style,
      user: game.user,
      duration: PING_DURATION_MS
    });
  }
}

/** Build privacy-filtered display rows from rendered Token placeables only. */
export function collectVisibleTokenEntries({ unit = "ft" } = {}) {
  if (!canvas.ready) return [];
  return (canvas.tokens?.placeables ?? [])
    .filter(isHudTokenVisible)
    .map(token => createTokenEntry(token, unit));
}

export function isHudTokenVisible(token) {
  return !!token
    && !token.destroyed
    && (token.visible === true)
    && !token.document?.isSecret;
}

/** Read PF2e's final prepared Fly Speed; return null when it must stay hidden. */
export function extractFlySpeed(actor, user = game.user) {
  if (!actor) return null;
  if (actor.isOfType && !actor.isOfType("creature")) return null;
  if (actor.testUserPermission && !actor.testUserPermission(user, "OBSERVER")) return null;
  const fly = actor.system?.movement?.speeds?.fly;
  const value = Number(fly?.value);
  return fly && Number.isFinite(value) ? value : null;
}

/** Compare elevation only; the 2D radius is a visual HUD filter, not rules distance. */
export function buildAltitudeRelations(selected, entries, {
  gridSize = 100,
  radiusSpaces = NEARBY_RADIUS_GRID_SPACES
} = {}) {
  if (!selected) return [];
  const radius = Math.max(0, Number(gridSize) || 100) * Math.max(0, Number(radiusSpaces) || 0);
  const radiusSquared = radius * radius;

  return entries
    .filter(entry => (entry.id !== selected.id) && (entry.elevation > VISUAL_EPSILON))
    .filter(entry => {
      const dx = entry.centerX - selected.centerX;
      const dy = entry.centerY - selected.centerY;
      return ((dx * dx) + (dy * dy)) <= radiusSquared;
    })
    .map(entry => {
      const signedDelta = entry.elevation - selected.elevation;
      const direction = Math.abs(signedDelta) <= VISUAL_EPSILON
        ? "same"
        : signedDelta > 0 ? "above" : "below";
      return {
        ...entry,
        direction,
        delta: Math.abs(signedDelta)
      };
    })
    .sort((left, right) => left.delta - right.delta || right.elevation - left.elevation);
}

function createTokenEntry(token, unit) {
  const elevation = normalizeHudElevation(token.document.elevation);
  const name = getVisibleTokenName(token);
  const flySpeed = extractFlySpeed(token.actor ?? token.document.actor);
  const elevationLabel = `${formatFeet(elevation)} ${unit}`;
  const flySpeedLabel = flySpeed === null ? null : `${formatFeet(flySpeed)} ${getPf2eFeetUnit()}`;
  const details = [
    name,
    `${game.i18n.localize("PF2E_FLYING_VISUAL_HELPER.Hud.elevation")}: ${elevationLabel}`
  ];
  if (flySpeedLabel) {
    details.push(`${game.i18n.localize("PF2E_FLYING_VISUAL_HELPER.Hud.flySpeed")}: ${flySpeedLabel}`);
  }
  return {
    id: token.id,
    name,
    img: token.document.texture?.src ?? token.actor?.img ?? "icons/svg/mystery-man.svg",
    elevation,
    elevationLabel,
    flySpeed,
    flySpeedLabel,
    hasFlySpeed: flySpeed !== null,
    tooltipText: details.join(" · "),
    accessibleLabel: details.join(", "),
    centerX: Number(token.center?.x) || 0,
    centerY: Number(token.center?.y) || 0
  };
}

function getVisibleTokenName(token) {
  if (game.user.isGM || (token.document.playersCanSeeName !== false)) return token.document.name;
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

function formatRelation(relation, unit) {
  if (relation.direction === "same") {
    return game.i18n.localize("PF2E_FLYING_VISUAL_HELPER.Hud.relation.same");
  }
  return game.i18n.format(`PF2E_FLYING_VISUAL_HELPER.Hud.relation.${relation.direction}`, {
    delta: formatFeet(relation.delta),
    unit
  });
}

function buildHudSummary({ selected, entries, unit }) {
  const count = entries.length;
  if (count === 0) {
    const label = game.i18n.localize("PF2E_FLYING_VISUAL_HELPER.Hud.summary.empty");
    return { label, accessibleLabel: label, tooltipText: label };
  }

  const maximum = `${formatFeet(entries[0].elevation)} ${unit}`;
  const key = selected
    ? "PF2E_FLYING_VISUAL_HELPER.Hud.summary.selected"
    : "PF2E_FLYING_VISUAL_HELPER.Hud.summary.count";
  const label = game.i18n.format(key, {
    name: selected?.name ?? "",
    elevation: selected ? `${formatFeet(selected.elevation)} ${unit}` : maximum,
    count
  });
  return {
    label,
    accessibleLabel: `${game.i18n.localize("PF2E_FLYING_VISUAL_HELPER.Hud.title")}. ${label}`,
    tooltipText: entries.map(entry => entry.accessibleLabel).join(" • ")
  };
}

function getSceneDistanceUnit() {
  return String(canvas.grid?.units ?? canvas.scene?.grid?.units ?? "ft").trim() || "ft";
}

function getPf2eFeetUnit() {
  const key = "PF2E.TravelSpeed.FeetAcronym";
  const localized = game.i18n.localize(key);
  return localized === key ? "ft" : localized;
}

function activateDragScrolling(viewport, { signal } = {}) {
  let dragging = false;
  let pointerId = null;
  let originX = 0;
  let originY = 0;
  let originScrollLeft = 0;
  let originScrollTop = 0;

  viewport.addEventListener("pointerdown", event => {
    if ((event.button !== 0) || event.target.closest("[data-action]")) return;
    dragging = true;
    pointerId = event.pointerId;
    originX = event.clientX;
    originY = event.clientY;
    originScrollLeft = viewport.scrollLeft;
    originScrollTop = viewport.scrollTop;
    viewport.setPointerCapture(pointerId);
    viewport.classList.add("is-dragging");
  }, { signal });

  viewport.addEventListener("pointermove", event => {
    if (!dragging || (event.pointerId !== pointerId)) return;
    viewport.scrollLeft = originScrollLeft - (event.clientX - originX);
    viewport.scrollTop = originScrollTop - (event.clientY - originY);
  }, { signal });

  const stopDragging = event => {
    if (!dragging || (event.pointerId !== pointerId)) return;
    dragging = false;
    if (viewport.hasPointerCapture(pointerId)) viewport.releasePointerCapture(pointerId);
    pointerId = null;
    viewport.classList.remove("is-dragging");
  };
  viewport.addEventListener("pointerup", stopDragging, { signal });
  viewport.addEventListener("pointercancel", stopDragging, { signal });
}

/** Pointer-captured drag and keyboard movement for the frameless HUD. */
function activateHudDragging(handle, application, { signal } = {}) {
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
