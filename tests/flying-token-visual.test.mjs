import test from "node:test";
import assert from "node:assert/strict";
import { FlyingTokenVisual } from "../src/flying-token-visual.js";
import { FlyingVisualLayer, hasCoreElevationAnimation } from "../src/flying-visual-layer.js";

class FakePoint {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  set(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }
}

class FakeContainer {
  constructor() {
    this.children = [];
    this.parent = null;
    this.destroyed = false;
    this.visible = true;
    this.renderable = true;
    this.alpha = 1;
    this.position = new FakePoint();
  }

  get x() { return this.position.x; }
  set x(value) { this.position.x = value; }
  get y() { return this.position.y; }
  set y(value) { this.position.y = value; }

  addChild(child) {
    child.removeFromParent();
    child.parent = this;
    this.children.push(child);
    return child;
  }

  removeFromParent() {
    if (!this.parent) return this;
    const index = this.parent.children.indexOf(this);
    if (index >= 0) this.parent.children.splice(index, 1);
    this.parent = null;
    return this;
  }

  destroy({ children = false } = {}) {
    this.removeFromParent();
    if (children) for (const child of this.children.splice(0)) child.destroy?.({ children: true });
    this.destroyed = true;
  }
}

class FakeGraphics extends FakeContainer {
  constructor() {
    super();
    this.commands = [];
  }

  clear() { this.commands = []; return this; }
  lineStyle(...args) { this.commands.push(["lineStyle", ...args]); return this; }
  moveTo(...args) { this.commands.push(["moveTo", ...args]); return this; }
  lineTo(...args) { this.commands.push(["lineTo", ...args]); return this; }
  beginFill(...args) { this.commands.push(["beginFill", ...args]); return this; }
  drawEllipse(...args) { this.commands.push(["drawEllipse", ...args]); return this; }
  drawCircle(...args) { this.commands.push(["drawCircle", ...args]); return this; }
  endFill() { this.commands.push(["endFill"]); return this; }
}

globalThis.PIXI = {
  Container: FakeContainer,
  Graphics: FakeGraphics,
  BLEND_MODES: { MULTIPLY: "multiply" }
};
globalThis.canvas = {
  grid: { size: 100, distance: 5 },
  dimensions: { size: 100, distance: 5 }
};
globalThis.matchMedia = () => ({ matches: false });

const settings = {
  enableStand: true,
  enableShadow: true,
  enableGroundProjection: true,
  enableHeightLabel: true,
  standOpacity: 0.4,
  shadowOpacity: 0.35,
  projectionOpacity: 0.42,
  shadowDistanceMultiplier: 1
};

function makeToken(elevation) {
  const token = new FakeContainer();
  token.id = "test-token";
  token.visible = true;
  token.document = {
    x: 0,
    y: 0,
    elevation,
    isSecret: false,
    getSize: () => ({ width: 100, height: 100 })
  };
  Object.defineProperty(token, "center", {
    get() {
      const size = token.document.getSize();
      const local = token.localCenter ?? { x: size.width / 2, y: size.height / 2 };
      return new FakePoint(token.document.x + local.x, token.document.y + local.y);
    }
  });
  token.mesh = new FakeContainer();
  token.mesh.position.set(token.center.x, token.center.y);
  token.tooltip = new FakeContainer();
  token.tooltip.position.set(50, -4);
  token.levelIndicator = new FakeContainer();
  token.levelIndicator.position.set(50, -24);
  token.nameplate = new FakeContainer();
  token.nameplate.position.set(50, 104);
  token.bars = new FakeContainer();
  token.effects = new FakeContainer();
  token.animationContexts = new Map();
  return token;
}

test("uses the native tooltip and restores it after disabling or teardown", () => {
  const token = makeToken(60);
  const visual = new FlyingTokenVisual(token, settings);

  assert.equal(token.tooltip.renderable, true);
  assert.equal(visual.container.children.length, 3);
  assert.ok(visual.container.children.every(child => child instanceof FakeGraphics));

  visual.updateSettings({ ...settings, enableHeightLabel: false });
  assert.equal(token.tooltip.renderable, false);

  visual.destroy();
  assert.equal(token.tooltip.renderable, true);
  assert.equal(token.tooltip.alpha, 1);
  assert.deepEqual([token.mesh.x, token.mesh.y], [token.center.x, token.center.y]);
  assert.deepEqual([token.tooltip.x, token.tooltip.y], [50, -4]);
  assert.deepEqual([token.levelIndicator.x, token.levelIndicator.y], [50, -24]);
  assert.equal(visual.container.destroyed, true);
});

test("smoothly interpolates stand and shadow state without changing Token data", () => {
  const token = makeToken(0);
  const visual = new FlyingTokenVisual(token, settings);
  const originalElevation = token.document.elevation;
  const originalGetSize = token.document.getSize;

  assert.equal(visual.setElevation(60), true);
  const { startedAt, duration } = visual.animation;
  assert.equal(visual.tick(startedAt + (duration / 2)), true);
  assert.ok(visual.displayElevation > 0 && visual.displayElevation < 60);
  assert.ok(visual.standGraphics.commands.length > 0);
  assert.ok(visual.shadowGraphics.commands.length > 0);
  assert.ok(visual.projectionGraphics.commands.length > 0);
  assert.ok(token.mesh.y < token.center.y);

  assert.equal(visual.tick(startedAt + duration), false);
  assert.equal(visual.displayElevation, 60);
  assert.equal(token.document.elevation, originalElevation);
  assert.equal(token.document.getSize, originalGetSize);
  visual.destroy();
});

test("keeps the ground base snapped while only the rendered mesh moves", () => {
  const token = makeToken(60);
  setTokenPosition(token, 200, 300);
  const visual = new FlyingTokenVisual(token, settings);
  const offset = {
    x: token.mesh.x - token.center.x,
    y: token.mesh.y - token.center.y
  };
  const standCommandCount = visual.standGraphics.commands.length;

  assert.deepEqual(
    [visual.container.x + visual.metrics.base.x, visual.container.y + visual.metrics.base.y],
    [token.center.x, token.center.y]
  );
  assert.ok(offset.x < 0 && offset.y < 0);
  assert.ok(Math.abs(token.tooltip.x - (50 + offset.x)) < 1e-9);
  assert.ok(Math.abs(token.tooltip.y - (-4 + offset.y)) < 1e-9);

  // Simulate Foundry's refreshPosition at a snapped drag destination. Core
  // resets the mesh to center before the module's refreshToken hook runs.
  setTokenPosition(token, 500, 400);
  visual.onRefresh({ refreshPosition: true });

  assert.deepEqual([token.document.x, token.document.y], [500, 400]);
  assert.deepEqual([visual.container.x, visual.container.y], [500, 400]);
  assert.deepEqual(
    [visual.container.x + visual.metrics.base.x, visual.container.y + visual.metrics.base.y],
    [token.center.x, token.center.y]
  );
  assert.deepEqual(
    [token.mesh.x, token.mesh.y],
    [token.center.x + offset.x, token.center.y + offset.y]
  );
  assert.equal(visual.standGraphics.commands.length, standCommandCount);

  visual.destroy();
  assert.deepEqual([token.mesh.x, token.mesh.y], [token.center.x, token.center.y]);
  assert.deepEqual([token.tooltip.x, token.tooltip.y], [50, -4]);
});

test("anchors non-rectangular Token shapes to Foundry's actual local center", () => {
  const token = makeToken(60);
  token.localCenter = { x: 42, y: 61 };
  token.mesh.position.set(token.center.x, token.center.y);
  setTokenPosition(token, 200, 300);
  const visual = new FlyingTokenVisual(token, settings);

  assert.deepEqual([visual.metrics.base.x, visual.metrics.base.y], [42, 61]);
  assert.deepEqual(
    [visual.container.x + visual.metrics.base.x, visual.container.y + visual.metrics.base.y],
    [token.center.x, token.center.y]
  );
  visual.destroy();
  assert.deepEqual([token.mesh.x, token.mesh.y], [token.center.x, token.center.y]);
});

test("renders a clearly readable acrylic rim, shaft, and contact shadow", () => {
  const token = makeToken(60);
  const visual = new FlyingTokenVisual(token, settings);
  const standLines = visual.standGraphics.commands.filter(command => command[0] === "lineStyle");
  const shadowFills = visual.shadowGraphics.commands.filter(command => command[0] === "beginFill");

  assert.ok(Math.max(...standLines.map(command => command[1])) >= 10);
  assert.ok(Math.max(...standLines.map(command => Number(command[3]) || 0)) >= 0.8);
  assert.equal(shadowFills.length, 4);
  assert.ok(Math.max(...shadowFills.map(command => command[2])) > 0.2);
  visual.destroy();
});

test("keeps the Token grounded when every support effect is fully transparent", () => {
  const token = makeToken(60);
  const visual = new FlyingTokenVisual(token, {
    ...settings,
    standOpacity: 0,
    shadowOpacity: 0,
    projectionOpacity: 0
  });

  assert.equal(visual.container.visible, false);
  assert.deepEqual([token.mesh.x, token.mesh.y], [token.center.x, token.center.y]);
  assert.deepEqual([token.tooltip.x, token.tooltip.y], [50, -4]);
  visual.destroy();
});

test("does not double the lift when core refreshes position and elevation together", () => {
  const token = makeToken(10);
  const visual = new FlyingTokenVisual(token, settings);
  visual.beginCoreAnimation(60);

  setTokenPosition(token, 200, 200);
  token.document.elevation = 30;
  visual.lastAnimatedRenderAt = Number.NEGATIVE_INFINITY;
  visual.syncCoreElevation(30, { active: true });
  const expected = [
    token.center.x + visual.metrics.token.offsetX,
    token.center.y + visual.metrics.token.offsetY
  ];
  assert.deepEqual([token.mesh.x, token.mesh.y], expected);

  visual.onRefresh({ refreshPosition: true, refreshElevation: true });
  assert.deepEqual([token.mesh.x, token.mesh.y], expected);
  visual.destroy();
});

test("creates an independent visual for an elevated drag preview", () => {
  const scene = { id: "scene-preview" };
  const original = makeToken(60);
  const preview = makeToken(60);
  preview.id = original.id;
  preview.isPreview = true;
  setTokenPosition(preview, 300, 200);
  for (const token of [original, preview]) {
    token.document.parent = scene;
    token.document.object = token;
  }

  const ticker = new FakeTicker();
  const readyCanvas = makeCanvas(scene, [original], ticker);
  globalThis.canvas = readyCanvas;
  installGameSettings();
  const layer = new FlyingVisualLayer();
  layer.activate(readyCanvas);
  layer.onDrawToken(preview);

  assert.equal(original.children.length, 0);
  assert.equal(preview.children.length, 0);
  assert.equal(readyCanvas.primary.children.length, 2);
  assert.notEqual(readyCanvas.primary.children[0], readyCanvas.primary.children[1]);
  const previewVisual = readyCanvas.primary.children.find(child => child.x === 300 && child.y === 200);
  assert.ok(previewVisual);
  assert.deepEqual([previewVisual.x + 50, previewVisual.y + 50], [preview.center.x, preview.center.y]);
  assert.ok(preview.mesh.y < preview.center.y);

  setTokenPosition(preview, 500, 400);
  layer.onRefreshToken(preview, { refreshPosition: true });
  assert.deepEqual([previewVisual.x + 50, previewVisual.y + 50], [preview.center.x, preview.center.y]);
  assert.ok(preview.mesh.y < preview.center.y);
  layer.deactivate(readyCanvas);
  assert.equal(readyCanvas.primary.children.length, 0);
});

test("uses one shared ticker for fifty fallback elevation animations", () => {
  const scene = { id: "scene-performance" };
  const tokens = Array.from({ length: 50 }, (_, index) => {
    const token = makeToken(0);
    token.id = `token-${index}`;
    token.document.parent = scene;
    token.document.object = token;
    return token;
  });
  const ticker = new FakeTicker();
  const readyCanvas = makeCanvas(scene, tokens, ticker);
  globalThis.canvas = readyCanvas;
  installGameSettings();
  const layer = new FlyingVisualLayer();
  layer.activate(readyCanvas);

  for (const token of tokens) {
    token.document.elevation = 60;
    layer.onUpdateToken(token.document, { elevation: 60 }, {}, "user");
  }

  assert.equal(ticker.callbacks.size, 1);
  assert.ok(tokens.every(token => token.children.length === 0));
  assert.equal(readyCanvas.primary.children.length, 50);
  layer.deactivate(readyCanvas);
  assert.equal(ticker.callbacks.size, 0);
  assert.ok(tokens.every(token => token.children.length === 0));
  assert.equal(readyCanvas.primary.children.length, 0);
});

test("respects an immediate elevation update when animation is disabled", () => {
  const scene = { id: "scene-no-animation" };
  const token = makeToken(0);
  token.document.parent = scene;
  token.document.object = token;
  const ticker = new FakeTicker();
  const readyCanvas = makeCanvas(scene, [token], ticker);
  globalThis.canvas = readyCanvas;
  installGameSettings();
  const layer = new FlyingVisualLayer();
  layer.activate(readyCanvas);

  token.document.elevation = 60;
  layer.onUpdateToken(token.document, { elevation: 60 }, { animate: false }, "user");

  assert.equal(ticker.callbacks.size, 0);
  assert.equal(token.children.length, 0);
  assert.equal(readyCanvas.primary.children.length, 1);
  const stand = readyCanvas.primary.children[0].children[2];
  assert.ok(stand.commands.some(command => command[0] === "lineTo"));
  layer.deactivate(readyCanvas);
});

test("samples core elevation frames and hides geometry for secret Tokens", () => {
  const scene = { id: "scene-core-animation" };
  const token = makeToken(10);
  token.document.parent = scene;
  token.document.object = token;
  token.animationContexts.set("movement", { to: { elevation: 60 }, chain: [] });
  const ticker = new FakeTicker();
  const readyCanvas = makeCanvas(scene, [token], ticker);
  globalThis.canvas = readyCanvas;
  installGameSettings();
  const layer = new FlyingVisualLayer();
  layer.activate(readyCanvas);
  const visualContainer = readyCanvas.primary.children[0];
  const stand = visualContainer.children[2];
  const initialTopY = minimumLineY(stand);
  layer.onUpdateToken(token.document, { elevation: 60 }, {}, "user");

  token.document.elevation = 30;
  layer.onRefreshToken(token, { refreshElevation: true });
  assert.equal(visualContainer.visible, true);

  token.document.elevation = 60;
  token.animationContexts.clear();
  layer.onRefreshToken(token, { refreshElevation: true });
  const finalTopY = minimumLineY(stand);
  assert.ok(finalTopY < initialTopY);

  token.document.isSecret = true;
  layer.onRefreshToken(token, { refreshState: true });
  assert.equal(visualContainer.visible, false);
  assert.deepEqual([token.mesh.x, token.mesh.y], [token.center.x, token.center.y]);
  layer.deactivate(readyCanvas);
});

test("fades the native height tooltip during a core elevation animation", () => {
  const token = makeToken(10);
  const visual = new FlyingTokenVisual(token, settings);
  visual.beginCoreAnimation(60);
  visual.syncCoreElevation(30, { active: true });
  assert.ok(token.tooltip.alpha < 1);
  assert.ok(token.tooltip.alpha >= 0);
  visual.syncCoreElevation(60, { active: false });
  assert.equal(token.tooltip.alpha, 1);
  visual.destroy();
});

test("does not treat a horizontal core movement segment as elevation animation", () => {
  const token = makeToken(0);
  token.animationContexts.set("movement", {
    to: { x: 100, y: 100, elevation: 0 },
    chain: [{ to: { x: 200, y: 100, elevation: 0 } }]
  });
  assert.equal(hasCoreElevationAnimation(token), false);
  token.animationContexts.get("movement").chain[0].to.elevation = 30;
  assert.equal(hasCoreElevationAnimation(token), true);
  token.animationContexts.get("movement").chain[0].to.elevation = 0;
  token.animationContexts.get("movement").to.elevation = 30;
  assert.equal(hasCoreElevationAnimation(token), true);
});

class FakeTicker {
  callbacks = new Set();
  add(callback) { this.callbacks.add(callback); }
  remove(callback) { this.callbacks.delete(callback); }
}

function makeCanvas(scene, tokens, ticker) {
  return {
    ready: true,
    scene,
    tokens: { placeables: tokens },
    grid: { size: 100, distance: 5 },
    dimensions: { size: 100, distance: 5 },
    primary: new FakeContainer(),
    app: { ticker }
  };
}

function installGameSettings() {
  const values = {
    enabled: true,
    enableAltitudeHud: true,
    enableGroundProjection: true,
    enableHeightAxis: true,
    enableStand: true,
    enableShadow: true,
    enableHeightLabel: true,
    standOpacity: 0.4,
    shadowOpacity: 0.35,
    projectionOpacity: 0.42,
    shadowDistanceMultiplier: 1
  };
  globalThis.game = { settings: { get: (_moduleId, key) => values[key] } };
}

function setTokenPosition(token, x, y) {
  token.document.x = x;
  token.document.y = y;
  token.position.set(x, y);
  token.mesh.position.set(token.center.x, token.center.y);
}

function minimumLineY(graphics) {
  return Math.min(...graphics.commands
    .filter(command => ["moveTo", "lineTo"].includes(command[0]))
    .map(command => command[2]));
}
