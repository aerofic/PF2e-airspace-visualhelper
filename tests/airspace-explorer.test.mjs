import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

class FakeApplicationV2 {
  constructor() {
    this.rendered = true;
    this.renderCalls = [];
    this.positionCalls = [];
    this.closeCalls = [];
    this.position = { width: 520, height: 600, left: 64, top: 72 };
  }

  render(options = {}) {
    this.renderCalls.push(options);
    return Promise.resolve(this);
  }

  setPosition(position = {}) {
    if (!this.rendered) throw new Error("Window element has not been rendered");
    this.positionCalls.push({ ...position });
    this.position = { ...this.position, ...position };
    return position;
  }

  close(options = {}) {
    this.closeCalls.push(options);
    this.rendered = false;
    return Promise.resolve(this);
  }
}

globalThis.foundry = {
  applications: {
    api: {
      ApplicationV2: FakeApplicationV2,
      HandlebarsApplicationMixin: Base => class extends Base {
        async _prepareContext() { return {}; }
      }
    }
  }
};
globalThis.game = {
  user: { id: "user", isGM: true, targets: new Set() },
  settings: {
    get: (_moduleId, key) => key === "airspaceRadius" ? 8 : true,
    set: async () => undefined
  },
  i18n: {
    localize: key => key,
    format: (key, data) => `${key}:${JSON.stringify(data)}`
  }
};
globalThis.canvas = createEmptyCanvas();
globalThis.CONFIG = {
  Canvas: {
    pings: {
      types: { PULL: "pull", PULSE: "pulse" }
    }
  }
};

const {
  AIRSPACE_EXPLORER_POSITION,
  AirspaceExplorer,
  calculateAirspaceExplorerPosition,
  extractFlySpeed,
  isAirspaceTokenVisible,
  normalizeAirspaceRadius,
  orbitAirspaceCamera,
  zoomAirspaceCamera
} = await import("../src/airspace-explorer.js");

test("uses a native movable ApplicationV2 window and registers no keyboard shortcut", () => {
  assert.deepEqual(AIRSPACE_EXPLORER_POSITION, {
    width: 520,
    height: 600,
    left: 64,
    top: 72
  });
  assert.deepEqual(AirspaceExplorer.DEFAULT_OPTIONS.position, AIRSPACE_EXPLORER_POSITION);
  assert.equal(AirspaceExplorer.DEFAULT_OPTIONS.window.frame, true);
  assert.equal(AirspaceExplorer.DEFAULT_OPTIONS.window.positioned, true);
  assert.equal(AirspaceExplorer.DEFAULT_OPTIONS.window.resizable, true);
  assert.equal("keybindings" in AirspaceExplorer.DEFAULT_OPTIONS, false);
  assert.deepEqual(
    Object.keys(AirspaceExplorer.DEFAULT_OPTIONS.actions).sort(),
    ["resetCamera", "selectToken", "targetToken"]
  );
});

test("opens only when toggle is explicitly invoked and defaults to eight spaces", async () => {
  globalThis.canvas = createEmptyCanvas();
  const explorer = new AirspaceExplorer();
  const context = await explorer._prepareContext({});
  assert.equal(context.radius.value, 8);
  assert.equal(context.hasSelection, false);

  explorer.rendered = false;
  await explorer.toggle();
  const renderOptions = explorer.renderCalls.at(-1);
  assert.equal(renderOptions?.force, true);
  assert.ok(renderOptions?.position.width >= 460);
  assert.ok(renderOptions?.position.height >= 540);
  assert.equal(explorer.positionCalls.length, 0);
});

test("builds a real XYZ view around the controlled Token", async () => {
  const scene = { id: "scene", grid: { units: "ft" } };
  const anchor = createToken({ id: "anchor", scene, x: 100, y: 100, elevation: 20 });
  const nearby = createToken({ id: "nearby", scene, x: 300, y: 100, elevation: 80 });
  globalThis.canvas = createEmptyCanvas({ scene, placeables: [anchor, nearby], controlled: [anchor] });
  const context = await new AirspaceExplorer()._prepareContext({});
  const anchorNode = context.view.nodes.find(node => node.id === "anchor");
  const nearbyNode = context.view.nodes.find(node => node.id === "nearby");

  assert.equal(context.hasSelection, true);
  assert.equal(context.nearbyCount, 2);
  assert.equal(anchorNode.selected, true);
  assert.ok(nearbyNode.groundX > anchorNode.groundX);
  assert.ok(nearbyNode.tokenY < nearbyNode.groundY);
});

test("clamps the live query radius to the supported visual range", () => {
  assert.equal(normalizeAirspaceRadius(-20), 1);
  assert.equal(normalizeAirspaceRadius(8.4), 8);
  assert.equal(normalizeAirspaceRadius(9.6), 10);
  assert.equal(normalizeAirspaceRadius(200), 30);
  assert.equal(normalizeAirspaceRadius(Number.NaN), 8);
});

test("templates expose range, orbit camera, selection, and native Target controls", () => {
  const controls = readFileSync(new URL("../templates/airspace-controls.hbs", import.meta.url), "utf8");
  const view = readFileSync(new URL("../templates/airspace-view.hbs", import.meta.url), "utf8");
  assert.match(controls, /type="range"/);
  assert.match(controls, /data-airspace-radius/);
  assert.match(controls, /data-action="resetCamera"/);
  assert.match(view, /data-airspace-camera/);
  assert.match(view, /data-action="selectToken"/);
  assert.match(view, /data-action="targetToken"/);
  assert.match(view, /class="airspace-grid"/);
  assert.match(view, /class="airspace-height-line/);
});

test("CSS keeps the floating tactical view highly transparent and orbitable", () => {
  const css = readFileSync(new URL("../styles/module.css", import.meta.url), "utf8");
  const rootRule = css.match(/\.pf2e-flying-visual-helper\.airspace-explorer\s*{([^}]+)}/)?.[1] ?? "";
  assert.match(rootRule, /background:\s*rgb\(3 8 12 \/ 0\.06\)/);
  assert.match(rootRule, /position:\s*absolute/);
  assert.match(css, /\.airspace-explorer \.window-header/);
  assert.match(css, /\.airspace-explorer \.window-content/);
  assert.match(css, /\.airspace-explorer \.airspace-stage/);
  assert.match(rootRule, /--airspace-token-art-size:\s*45px/);
  assert.match(rootRule, /--airspace-token-node-width:\s*64px/);
  assert.match(css, /cursor:\s*grab/);
  assert.match(css, /touch-action:\s*none/);
});

test("opening size grows with visible density and stays inside the viewport", () => {
  const small = calculateAirspaceExplorerPosition({
    viewportWidth: 1600,
    viewportHeight: 1000,
    entryCount: 1
  });
  const crowded = calculateAirspaceExplorerPosition({
    viewportWidth: 1600,
    viewportHeight: 1000,
    entryCount: 20
  });
  const constrained = calculateAirspaceExplorerPosition({
    viewportWidth: 700,
    viewportHeight: 600,
    entryCount: 20
  });
  assert.ok(crowded.width > small.width);
  assert.ok(crowded.height > small.height);
  assert.ok(constrained.width <= 604);
  assert.ok(constrained.height <= 488);
});

test("mouse orbit changes yaw and pitch while wheel zoom remains bounded", () => {
  const start = { yaw: Math.PI / 4, pitch: Math.PI / 6, zoom: 1 };
  const orbited = orbitAirspaceCamera(start, { deltaX: 30, deltaY: -20 });
  assert.notEqual(orbited.yaw, start.yaw);
  assert.ok(orbited.pitch > start.pitch);
  assert.ok(zoomAirspaceCamera(start, -120).zoom > 1);
  assert.equal(zoomAirspaceCamera(start, -100_000).zoom, 2.4);
  assert.equal(zoomAirspaceCamera(start, 100_000).zoom, 0.55);
});

test("reads PF2e Fly Speed only with observer permission", () => {
  const actor = {
    isOfType: type => type === "creature",
    testUserPermission: (_user, permission) => permission === "OBSERVER",
    system: { movement: { speeds: { fly: { value: 80 } } } }
  };
  assert.equal(extractFlySpeed(actor, game.user), 80);
  assert.equal(extractFlySpeed({ ...actor, testUserPermission: () => false }, game.user), null);
  assert.equal(extractFlySpeed({ ...actor, system: { movement: { speeds: {} } } }, game.user), null);
});

test("excludes invisible, destroyed, and Secret Tokens", () => {
  const visible = { visible: true, destroyed: false, document: { isSecret: false } };
  assert.equal(isAirspaceTokenVisible(visible), true);
  assert.equal(isAirspaceTokenVisible({ ...visible, visible: false }), false);
  assert.equal(isAirspaceTokenVisible({ ...visible, destroyed: true }), false);
  assert.equal(isAirspaceTokenVisible({ ...visible, document: { isSecret: true } }), false);
});

test("selection pans and pings while Target remains a separate local action", async () => {
  const calls = [];
  const scene = { id: "scene", grid: { units: "ft" } };
  const token = createToken({ id: "dragon", scene, x: 125, y: 275, elevation: 70 });
  token.control = options => calls.push(["control", options]);
  token.panCanvas = async options => calls.push(["pan", options]);
  token.setTarget = (targeted, options) => calls.push(["target", targeted, options]);
  globalThis.canvas = createEmptyCanvas({ scene, placeables: [token] });
  canvas.photosensitiveMode = true;
  canvas.tokens.activate = options => calls.push(["activate", options]);
  canvas.controls = { drawPing: (point, options) => calls.push(["ping", point, options]) };

  const explorer = new AirspaceExplorer();
  await AirspaceExplorer.DEFAULT_OPTIONS.actions.selectToken.call(
    explorer,
    createActionEvent(),
    { dataset: { tokenId: token.id } }
  );
  AirspaceExplorer.DEFAULT_OPTIONS.actions.targetToken.call(
    explorer,
    createActionEvent(),
    { dataset: { tokenId: token.id } }
  );

  assert.deepEqual(calls.map(call => call[0]), ["activate", "control", "pan", "ping", "target"]);
  assert.equal(calls.at(-1)[1], true);
  assert.equal(calls.at(-1)[2].releaseOthers, false);
  assert.equal(calls.at(-1)[2].user, game.user);
});

function createToken({ id, scene, x, y, elevation }) {
  return {
    id,
    visible: true,
    destroyed: false,
    center: { x, y },
    document: {
      parent: scene,
      isSecret: false,
      name: id,
      elevation,
      playersCanSeeName: true,
      texture: { src: `${id}.webp` },
      canUserModify: () => true
    },
    actor: null,
    panCanvas: async () => undefined,
    control: () => undefined,
    setTarget: () => undefined
  };
}

function createEmptyCanvas({ scene = null, placeables = [], controlled = [] } = {}) {
  const currentScene = scene ?? { id: "scene", grid: { units: "ft" } };
  return {
    ready: true,
    scene: currentScene,
    grid: { size: 100, units: "ft" },
    dimensions: { size: 100 },
    tokens: {
      placeables,
      controlled,
      get: id => placeables.find(token => token.id === id) ?? null,
      activate: () => undefined
    }
  };
}

function createActionEvent() {
  return {
    preventDefault() {},
    stopPropagation() {}
  };
}
