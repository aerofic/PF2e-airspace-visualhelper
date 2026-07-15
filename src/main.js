import { AirspaceExplorer } from "./airspace-explorer.js";
import { reconcileAirspaceAvailability, resetAirspaceForScene } from "./airspace-lifecycle.js";
import { MODULE_ID, SETTINGS, SYSTEM_ID } from "./constants.js";
import { FlyingVisualLayer } from "./flying-visual-layer.js";
import { readSettings, registerSettings } from "./settings.js";

const flyingVisualLayer = new FlyingVisualLayer();
const airspaceExplorer = new AirspaceExplorer();
let moduleReady = false;

Hooks.once("init", () => {
  console.info(`${MODULE_ID} | Initializing 0.6 airspace explorer`);
  registerSettings(onSettingChange);
});

Hooks.once("ready", () => {
  if (game.system.id !== SYSTEM_ID) {
    console.warn(`${MODULE_ID} | Disabled because the active system is not PF2e.`);
    return;
  }

  moduleReady = true;
  if (canvas.ready) flyingVisualLayer.activate(canvas);
  void syncAirspaceAvailability();
});

Hooks.on("canvasReady", readyCanvas => {
  if (game.system.id !== SYSTEM_ID) return;
  flyingVisualLayer.activate(readyCanvas);
  // Every Scene begins with the panel closed. Only the explicit Token-control
  // button opens the airspace explorer; no keyboard binding is registered.
  void resetAirspaceForScene(airspaceExplorer);
});

Hooks.on("canvasTearDown", tearingDownCanvas => {
  flyingVisualLayer.deactivate(tearingDownCanvas);
  if (airspaceExplorer.rendered) void airspaceExplorer.close({ animate: false });
});

Hooks.on("drawToken", token => {
  flyingVisualLayer.onDrawToken(token);
  airspaceExplorer.requestRefresh({ includeControls: true });
});

Hooks.on("refreshToken", (token, flags = {}) => {
  flyingVisualLayer.onRefreshToken(token, flags);
});

Hooks.on("destroyToken", token => {
  flyingVisualLayer.onDestroyToken(token);
  airspaceExplorer.requestRefresh({ includeControls: true });
});

Hooks.on("createToken", document => {
  if (document.parent === canvas.scene) airspaceExplorer.requestRefresh({ includeControls: true });
});

Hooks.on("deleteToken", document => {
  if (document.parent === canvas.scene) airspaceExplorer.requestRefresh({ includeControls: true });
});

Hooks.on("updateToken", (document, changes, options, userId) => {
  flyingVisualLayer.onUpdateToken(document, changes, options, userId);
  if ((document.parent === canvas.scene) && tokenChangesAffectAirspace(changes)) {
    airspaceExplorer.requestRefresh({ includeControls: true });
  }
});

Hooks.on("moveToken", (document, movement, operation, user) => {
  flyingVisualLayer.onMoveToken(document, movement, operation, user);
  if (document.parent === canvas.scene) airspaceExplorer.requestRefresh({ includeControls: true });
});

Hooks.on("controlToken", (token, controlled) => {
  flyingVisualLayer.onRefreshToken(token, { refreshVisibility: true });
  airspaceExplorer.onControlToken(token, controlled);
});

Hooks.on("targetToken", () => airspaceExplorer.requestRefresh());

Hooks.on("hoverToken", token => {
  flyingVisualLayer.onRefreshToken(token, { refreshVisibility: true });
});

Hooks.on("updateActor", (actor, changes) => {
  if (!airspaceExplorer.rendered || !("name" in changes || "system" in changes)) return;
  if (actorHasSceneToken(actor)) airspaceExplorer.requestRefresh({ includeControls: true });
});

// PF2e prepared Fly Speed can be contributed by embedded Items and Rule
// Elements without a separate updateActor hook.
for (const hookName of ["createItem", "updateItem", "deleteItem"]) {
  Hooks.on(hookName, item => {
    if (!airspaceExplorer.rendered) return;
    const actor = item.parent;
    if (actor?.documentName === "Actor" && actorHasSceneToken(actor)) {
      airspaceExplorer.requestRefresh({ includeControls: true });
    }
  });
}

Hooks.on("sightRefresh", () => airspaceExplorer.requestRefresh({ includeControls: true }));

Hooks.on("updateScene", (scene, changes) => {
  if (scene !== canvas.scene) return;
  if ("grid" in changes) flyingVisualLayer.refreshAll();
  if ("grid" in changes || "name" in changes) airspaceExplorer.requestRefresh({ includeControls: true });
});

Hooks.on("getSceneControlButtons", controls => {
  if (game.system.id !== SYSTEM_ID || !controls.tokens?.tools) return;
  const settings = readSettings();
  controls.tokens.tools.pf2eAirspaceExplorer = {
    name: "pf2eAirspaceExplorer",
    title: "PF2E_FLYING_VISUAL_HELPER.Airspace.controlButton",
    icon: "fa-solid fa-cubes",
    order: 90,
    button: true,
    visible: settings.enabled && settings.enableAltitudeHud,
    onChange: () => void airspaceExplorer.toggle()
  };
});

function onSettingChange(key, value) {
  if (!moduleReady || game.system.id !== SYSTEM_ID) return;

  if (key === SETTINGS.AIRSPACE_RADIUS) {
    airspaceExplorer.setRadius(value);
    return;
  }

  if ((key === SETTINGS.ENABLED) || (key === SETTINGS.ENABLE_ALTITUDE_HUD)) {
    flyingVisualLayer.refreshSettings();
    void syncAirspaceAvailability();
    void ui.controls?.render({ reset: true });
    return;
  }

  flyingVisualLayer.refreshSettings();
}

async function syncAirspaceAvailability() {
  const settings = readSettings();
  await reconcileAirspaceAvailability(airspaceExplorer, {
    moduleReady,
    canvasReady: canvas.ready,
    enabled: settings.enabled,
    enableAirspace: settings.enableAltitudeHud
  });
}

function tokenChangesAffectAirspace(changes) {
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
