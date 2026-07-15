import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

class FakeApplicationV2 {
  constructor() {
    this.rendered = true;
    this.renderCalls = [];
    this.positionCalls = [];
    this.closeCalls = [];
    this.position = { width: 340, height: 486, left: 64, top: 72 };
  }

  render(options = {}) {
    this.renderCalls.push(options);
    return Promise.resolve(this);
  }

  setPosition(position = {}) {
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
  extractFlySpeed,
  isAirspaceTokenVisible,
  normalizeAirspaceRadius
} = await import("../src/airspace-explorer.js");

test("uses a fixed frameless side panel and registers no keyboard shortcut", () => {
  assert.deepEqual(AIRSPACE_EXPLORER_POSITION, {
    width: 340,
    height: 486,
    left: 64,
    top: 72
  });
  assert.deepEqual(AirspaceExplorer.DEFAULT_OPTIONS.position, AIRSPACE_EXPLORER_POSITION);
  assert.equal(AirspaceExplorer.DEFAULT_OPTIONS.window.frame, false);
  assert.equal(AirspaceExplorer.DEFAULT_OPTIONS.window.resizable, false);
  assert.equal("keybindings" in AirspaceExplorer.DEFAULT_OPTIONS, false);
  assert.deepEqual(
    Object.keys(AirspaceExplorer.DEFAULT_OPTIONS.actions).sort(),
    ["closeAirspace", "selectToken", "targetToken"]
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
  assert.equal(explorer.renderCalls.at(-1)?.force, true);
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

test("templates expose a range slider, separate selection, and native Target toggle", () => {
  const controls = readFileSync(new URL("../templates/airspace-controls.hbs", import.meta.url), "utf8");
  const view = readFileSync(new URL("../templates/airspace-view.hbs", import.meta.url), "utf8");
  assert.match(controls, /type="range"/);
  assert.match(controls, /data-airspace-radius/);
  assert.match(view, /data-action="selectToken"/);
  assert.match(view, /data-action="targetToken"/);
  assert.match(view, /class="airspace-grid"/);
  assert.match(view, /class="airspace-height-line/);
});

test("CSS keeps the translucent tactical view compact", () => {
  const css = readFileSync(new URL("../styles/module.css", import.meta.url), "utf8");
  const rootRule = css.match(/\.pf2e-flying-visual-helper\.airspace-explorer\s*{([^}]+)}/)?.[1] ?? "";
  assert.match(rootRule, /background:\s*rgb\(3 8 12 \/ 0\.18\)/);
  assert.match(css, /\.airspace-explorer \.airspace-stage/);
  assert.match(css, /width:\s*30px/);
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
