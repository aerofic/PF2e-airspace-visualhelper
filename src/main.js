import { AltitudeHud } from "./altitude-hud.js";
import { MODULE_ID, SETTINGS, SYSTEM_ID } from "./constants.js";
import { FlyingVisualLayer } from "./flying-visual-layer.js";
import { readSettings, registerSettings } from "./settings.js";

const flyingVisualLayer = new FlyingVisualLayer();
const altitudeHud = new AltitudeHud();
let moduleReady = false;

Hooks.once("init", () => {
  console.info(`${MODULE_ID} | Initializing V2 airspace helper`);
  registerSettings(onSettingChange);
});

Hooks.once("ready", () => {
  if (game.system.id !== SYSTEM_ID) {
    console.warn(`${MODULE_ID} | Disabled because the active system is not PF2e.`);
    return;
  }

  moduleReady = true;
  if (canvas.ready) flyingVisualLayer.activate(canvas);
  void syncHudVisibility({ autoOpen: true });
});

Hooks.on("canvasReady", readyCanvas => {
  if (game.system.id !== SYSTEM_ID) return;
  flyingVisualLayer.activate(readyCanvas);
  if (game.ready) void syncHudVisibility({ autoOpen: true });
});

Hooks.on("canvasTearDown", tearingDownCanvas => {
  flyingVisualLayer.deactivate(tearingDownCanvas);
  if (altitudeHud.rendered) void altitudeHud.close({ animate: false });
});

Hooks.on("drawToken", token => {
  flyingVisualLayer.onDrawToken(token);
  altitudeHud.requestRefresh();
});

Hooks.on("refreshToken", (token, flags = {}) => {
  flyingVisualLayer.onRefreshToken(token, flags);
});

Hooks.on("destroyToken", token => {
  flyingVisualLayer.onDestroyToken(token);
  altitudeHud.requestRefresh();
});

Hooks.on("createToken", document => {
  if (document.parent === canvas.scene) altitudeHud.requestRefresh();
});

Hooks.on("deleteToken", document => {
  if (document.parent === canvas.scene) altitudeHud.requestRefresh();
});

Hooks.on("updateToken", (document, changes, options, userId) => {
  flyingVisualLayer.onUpdateToken(document, changes, options, userId);
  if ((document.parent === canvas.scene) && tokenChangesAffectHud(changes)) altitudeHud.requestRefresh();
});

Hooks.on("moveToken", (document, movement, operation, user) => {
  flyingVisualLayer.onMoveToken(document, movement, operation, user);
  if (document.parent === canvas.scene) altitudeHud.requestRefresh();
});

Hooks.on("controlToken", (token, controlled) => {
  altitudeHud.onControlToken(token, controlled);
});

Hooks.on("updateActor", (actor, changes) => {
  if (!altitudeHud.rendered || !("name" in changes || "system" in changes)) return;
  if (actorHasSceneToken(actor)) altitudeHud.requestRefresh();
});

// PF2e prepared Fly Speed can be contributed by embedded Items and Rule
// Elements without a separate updateActor hook. Refresh only for actors which
// actually have a rendered Token in the viewed Scene.
for (const hookName of ["createItem", "updateItem", "deleteItem"]) {
  Hooks.on(hookName, item => {
    if (!altitudeHud.rendered) return;
    const actor = item.parent;
    if (actor?.documentName === "Actor" && actorHasSceneToken(actor)) altitudeHud.requestRefresh();
  });
}

// Visibility changes are debounced; repeated sight updates during one movement
// produce one HUD render after the burst rather than one render per frame.
Hooks.on("sightRefresh", () => altitudeHud.requestRefresh());

Hooks.on("updateScene", (scene, changes) => {
  if (scene !== canvas.scene) return;
  if ("grid" in changes) flyingVisualLayer.refreshAll();
  if ("grid" in changes || "name" in changes) altitudeHud.requestRefresh();
});

Hooks.on("getSceneControlButtons", controls => {
  if (game.system.id !== SYSTEM_ID || !controls.tokens?.tools) return;
  const settings = readSettings();
  controls.tokens.tools.pf2eAirspaceHud = {
    name: "pf2eAirspaceHud",
    title: "PF2E_FLYING_VISUAL_HELPER.Hud.controlButton",
    icon: "fa-solid fa-layer-group",
    order: 90,
    button: true,
    visible: settings.enabled && settings.enableAltitudeHud,
    onChange: () => void altitudeHud.toggle()
  };
});

function onSettingChange(key, _value) {
  if (!moduleReady || (game.system.id !== SYSTEM_ID)) return;
  flyingVisualLayer.refreshSettings();

  if ((key === SETTINGS.ENABLED) || (key === SETTINGS.ENABLE_ALTITUDE_HUD)) {
    void syncHudVisibility({ autoOpen: true });
    void ui.controls?.render({ reset: true });
    return;
  }
  altitudeHud.requestRefresh({ immediate: key === SETTINGS.ENABLE_HEIGHT_AXIS });
}

async function syncHudVisibility({ autoOpen = false } = {}) {
  const settings = readSettings();
  const shouldShow = moduleReady
    && canvas.ready
    && settings.enabled
    && settings.enableAltitudeHud;
  if (!shouldShow) {
    if (altitudeHud.rendered) await altitudeHud.close({ animate: false });
    return;
  }

  if (altitudeHud.rendered) altitudeHud.requestRefresh({ immediate: true });
  else if (autoOpen) await altitudeHud.render({ force: true });
}

function tokenChangesAffectHud(changes) {
  return [
    "elevation",
    "x",
    "y",
    "name",
    "hidden",
    "disposition",
    "texture",
    "actorId"
  ].some(key => key in changes);
}

function actorHasSceneToken(actor) {
  return !!canvas.ready && (canvas.tokens?.placeables?.some(token => token.actor === actor) ?? false);
}
