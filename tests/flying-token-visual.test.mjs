import test from "node:test";
import assert from "node:assert/strict";
import { FlyingTokenVisual } from "../src/flying-token-visual.js";
import { FlyingVisualLayer, hasCoreElevationAnimation } from "../src/flying-visual-layer.js";

class FakePoint {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
    this.setCalls = 0;
  }

  set(x, y) {
    this.x = x;
    this.y = y;
    this.setCalls += 1;
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
    this._alpha = 1;
    this.alphaWrites = 0;
    this.position = new FakePoint();
    this.scale = new FakePoint(1, 1);
  }

  get x() { return this.position.x; }
  set x(value) { this.position.x = value; }
  get y() { return this.position.y; }
  set y(value) { this.position.y = value; }
  get alpha() { return this._alpha; }
  set alpha(value) { this._alpha = value; this.alphaWrites += 1; }

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
  drawPolygon(...args) { this.commands.push(["drawPolygon", ...args]); return this; }
  drawShape(...args) { this.commands.push(["drawShape", ...args]); return this; }
  endFill() { this.commands.push(["endFill"]); return this; }
}

globalThis.PIXI = {
  Container: FakeContainer,
  Graphics: FakeGraphics,
  BLEND_MODES: { NORMAL: "normal", SCREEN: "screen", MULTIPLY: "multiply" },
  UPDATE_PRIORITY: { NORMAL: 0, PRIMARY: 3 }
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
  token.shape = { type: "test-token-shape" };
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
  assert.equal(visual.container.children.length, 4);
  assert.ok(visual.container.children.every(child => child instanceof FakeGraphics));

  visual.updateSettings({ ...settings, enableHeightLabel: false });
  assert.equal(token.tooltip.renderable, false);

  visual.destroy();
  assert.equal(token.tooltip.renderable, true);
  assert.equal(token.tooltip.alpha, 1);
  assert.deepEqual([token.mesh.x, token.mesh.y], [token.center.x, token.center.y]);
  assert.deepEqual([token.mesh.scale.x, token.mesh.scale.y], [1, 1]);
  assert.equal(token.mesh.alpha, 1);
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

  assert.equal(visual.tick(startedAt + duration), true);
  assert.equal(visual.isAnimating, false);
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
  const commandReferences = visual.container.children.map(graphics => graphics.commands);

  assert.deepEqual(
    [visual.container.x + visual.metrics.base.x, visual.container.y + visual.metrics.base.y],
    [token.center.x, token.center.y]
  );
  assert.ok(offset.x < 0 && offset.y < 0);
  assert.ok(Math.abs(
    token.tooltip.x - (50 + offset.x + visual.metrics.token.labelOffsetX)
  ) < 1e-9);
  assert.ok(Math.abs(
    token.tooltip.y - (-4 + offset.y + visual.metrics.token.labelOffsetY)
  ) < 1e-9);

  // Simulate Foundry's refreshPosition at a snapped drag destination. Core
  // resets the mesh to center before the module's refreshToken hook runs.
  setTokenPosition(token, 500, 400);
  visual.onRefresh({ refreshPosition: true, refreshVisibility: true });

  assert.deepEqual([token.document.x, token.document.y], [500, 400]);
  assert.deepEqual([visual.container.x, visual.container.y], [500, 400]);
  assert.deepEqual(
    [visual.container.x + visual.metrics.base.x, visual.container.y + visual.metrics.base.y],
    [token.center.x, token.center.y]
  );
  assert.ok(Math.abs(token.mesh.x - (token.center.x + offset.x)) < 1e-9);
  assert.ok(Math.abs(token.mesh.y - (token.center.y + offset.y)) < 1e-9);
  assert.equal(visual.standGraphics.commands.length, standCommandCount);
  visual.container.children.forEach((graphics, index) => {
    assert.strictEqual(graphics.commands, commandReferences[index]);
  });

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

test("renders layered acrylic material, restrained highlights, and dual shadow groups", () => {
  const token = makeToken(60);
  const visual = new FlyingTokenVisual(token, settings);
  const standPolygons = visual.standGraphics.commands.filter(command => command[0] === "drawPolygon");
  const specularLines = visual.standSpecularGraphics.commands
    .filter(command => command[0] === "lineStyle");
  const shadowFills = visual.shadowGraphics.commands.filter(command => command[0] === "beginFill");

  assert.ok(standPolygons.length >= 3);
  assert.ok(specularLines.length >= 5);
  assert.ok(Math.max(...specularLines.map(command => command[1])) <= 1.5);
  assert.equal(visual.standSpecularGraphics.blendMode, "screen");
  assert.equal(shadowFills.length, 5);
  assert.ok(Math.max(...shadowFills.map(command => command[2])) > 0.1);
  assert.equal(
    [...visual.standGraphics.commands, ...visual.standSpecularGraphics.commands]
      .some(command => command[0] === "drawCircle"),
    false
  );
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

test("ambient motion updates only the cached pose and never rebuilds PIXI geometry", () => {
  const token = makeToken(60);
  token.id = "ambient-token";
  const visual = new FlyingTokenVisual(token, settings);
  const bodyCommands = visual.standGraphics.commands;
  const specularCommands = visual.standSpecularGraphics.commands;
  const shadowCommands = visual.shadowGraphics.commands;
  const projectionCommands = visual.projectionGraphics.commands;
  const staticMeshY = token.mesh.y;
  const scaleWrites = token.mesh.scale.setCalls;
  const alphaWrites = token.mesh.alphaWrites;
  const positionWrites = token.mesh.position.setCalls;

  for (const elapsed of [900, 950, 1000]) visual.tick(visual.ambientStartedAt + elapsed);

  assert.strictEqual(visual.standGraphics.commands, bodyCommands);
  assert.strictEqual(visual.standSpecularGraphics.commands, specularCommands);
  assert.strictEqual(visual.shadowGraphics.commands, shadowCommands);
  assert.strictEqual(visual.projectionGraphics.commands, projectionCommands);
  assert.equal(token.mesh.scale.setCalls, scaleWrites);
  assert.equal(token.mesh.alphaWrites, alphaWrites);
  assert.ok(token.mesh.position.setCalls > positionWrites);
  assert.ok(Math.abs(token.mesh.y - staticMeshY) <= visual.metrics.token.bobAmplitude + 1e-9);
  assert.ok(Math.abs(token.mesh.y - staticMeshY) > 1e-6);
  visual.destroy();
});

test("reduced-motion keeps the static airborne treatment without a ticker requirement", () => {
  const previousMatchMedia = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: true });
  try {
    const token = makeToken(60);
    const visual = new FlyingTokenVisual(token, settings);
    assert.equal(visual.requiresTicker, false);
    assert.equal(visual.tick(performance.now() + 1000), false);
    assert.equal(visual.ambientOffsetY, 0);
    assert.ok(token.mesh.y < token.center.y);
    visual.destroy();
  } finally {
    globalThis.matchMedia = previousMatchMedia;
  }
});

test("draws Foundry's footprint shape more clearly while hovered or controlled", () => {
  const token = makeToken(60);
  const visual = new FlyingTokenVisual(token, settings);
  const normalLineAlphas = visual.projectionGraphics.commands
    .filter(command => command[0] === "lineStyle")
    .map(command => Number(command[3]) || 0);
  assert.ok(visual.projectionGraphics.commands.some(command => command[0] === "drawShape"));

  token.controlled = true;
  visual.onRefresh({ refreshState: true });
  const emphasizedLineAlphas = visual.projectionGraphics.commands
    .filter(command => command[0] === "lineStyle")
    .map(command => Number(command[3]) || 0);
  assert.ok(Math.max(...emphasizedLineAlphas) > Math.max(...normalLineAlphas));
  visual.destroy();
});

test("does not double the lift when core refreshes position and elevation together", () => {
  const token = makeToken(10);
  const visual = new FlyingTokenVisual(token, settings);
  visual.beginCoreAnimation(60);

  setTokenPosition(token, 200, 200);
  token.document.elevation = 30;
  visual.onRefresh({ refreshPosition: true, refreshElevation: true });
  visual.lastAnimatedRenderAt = Number.NEGATIVE_INFINITY;
  visual.syncCoreElevation(30, { active: true });
  const expected = [
    token.center.x + visual.metrics.token.offsetX,
    token.center.y + visual.metrics.token.offsetY
  ];
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
  assert.equal(ticker.priorities.get([...ticker.callbacks][0]), 4);
  assert.ok(tokens.every(token => token.children.length === 0));
  assert.equal(readyCanvas.primary.children.length, 50);
  layer.deactivate(readyCanvas);
  assert.equal(ticker.callbacks.size, 0);
  assert.ok(tokens.every(token => token.children.length === 0));
  assert.equal(readyCanvas.primary.children.length, 0);
});

test("uses one shared low-frequency ticker for fifty already-flying Tokens", () => {
  const scene = { id: "scene-ambient-performance" };
  const tokens = Array.from({ length: 50 }, (_, index) => {
    const token = makeToken(60);
    token.id = `ambient-${index}`;
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

  assert.equal(ticker.callbacks.size, 1);
  assert.equal(readyCanvas.primary.children.length, 50);
  const commandReferences = readyCanvas.primary.children.map(container => ({
    shadow: container.children[0].commands,
    projection: container.children[1].commands,
    body: container.children[2].commands,
    specular: container.children[3].commands
  }));
  for (const callback of ticker.callbacks) callback();
  readyCanvas.primary.children.forEach((container, index) => {
    assert.strictEqual(container.children[0].commands, commandReferences[index].shadow);
    assert.strictEqual(container.children[1].commands, commandReferences[index].projection);
    assert.strictEqual(container.children[2].commands, commandReferences[index].body);
    assert.strictEqual(container.children[3].commands, commandReferences[index].specular);
  });

  layer.deactivate(readyCanvas);
  assert.equal(ticker.callbacks.size, 0);
});

test("does not start ambient ticker work when reduced motion is requested", () => {
  const previousMatchMedia = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: true });
  try {
    const scene = { id: "scene-reduced-motion" };
    const token = makeToken(60);
    token.document.parent = scene;
    token.document.object = token;
    const ticker = new FakeTicker();
    const readyCanvas = makeCanvas(scene, [token], ticker);
    globalThis.canvas = readyCanvas;
    installGameSettings();
    const layer = new FlyingVisualLayer();
    layer.activate(readyCanvas);

    assert.equal(ticker.callbacks.size, 0);
    assert.equal(readyCanvas.primary.children.length, 1);
    layer.deactivate(readyCanvas);
  } finally {
    globalThis.matchMedia = previousMatchMedia;
  }
});

test("responds to live reduced-motion changes and removes its listener on teardown", () => {
  const previousMatchMedia = globalThis.matchMedia;
  const motionQuery = new FakeMotionQuery(false);
  globalThis.matchMedia = () => motionQuery;
  try {
    const scene = { id: "scene-live-motion-preference" };
    const token = makeToken(60);
    token.document.parent = scene;
    token.document.object = token;
    const ticker = new FakeTicker();
    const readyCanvas = makeCanvas(scene, [token], ticker);
    globalThis.canvas = readyCanvas;
    installGameSettings();
    const layer = new FlyingVisualLayer();
    layer.activate(readyCanvas);

    assert.equal(motionQuery.listeners.size, 1);
    assert.equal(ticker.callbacks.size, 1);
    motionQuery.setMatches(true);
    assert.equal(ticker.callbacks.size, 0);
    assert.ok(token.mesh.y < token.center.y, "the static airborne pose remains enabled");
    motionQuery.setMatches(false);
    assert.equal(ticker.callbacks.size, 1);

    layer.deactivate(readyCanvas);
    assert.equal(ticker.callbacks.size, 0);
    assert.equal(motionQuery.listeners.size, 0);
  } finally {
    globalThis.matchMedia = previousMatchMedia;
  }
});

test("live reduced motion retires a Token whose landing tween is in progress", () => {
  const previousMatchMedia = globalThis.matchMedia;
  const motionQuery = new FakeMotionQuery(false);
  globalThis.matchMedia = () => motionQuery;
  try {
    const scene = { id: "scene-reduced-landing" };
    const token = makeToken(60);
    token.document.parent = scene;
    token.document.object = token;
    const ticker = new FakeTicker();
    const readyCanvas = makeCanvas(scene, [token], ticker);
    globalThis.canvas = readyCanvas;
    installGameSettings();
    const layer = new FlyingVisualLayer();
    layer.activate(readyCanvas);

    token.document.elevation = 0;
    layer.onUpdateToken(token.document, { elevation: 0 }, { animate: true }, "user");
    assert.equal(readyCanvas.primary.children.length, 1);
    assert.equal(ticker.callbacks.size, 1);
    motionQuery.setMatches(true);
    assert.equal(readyCanvas.primary.children.length, 0);
    assert.equal(ticker.callbacks.size, 0);
    assert.deepEqual([token.mesh.x, token.mesh.y], [token.center.x, token.center.y]);
    layer.deactivate(readyCanvas);
  } finally {
    globalThis.matchMedia = previousMatchMedia;
  }
});

test("hiding and revealing an airborne Token restores and reapplies every owned pose", () => {
  const scene = { id: "scene-visibility" };
  const token = makeToken(60);
  token.document.parent = scene;
  token.document.object = token;
  const ticker = new FakeTicker();
  const readyCanvas = makeCanvas(scene, [token], ticker);
  globalThis.canvas = readyCanvas;
  installGameSettings();
  const layer = new FlyingVisualLayer();
  layer.activate(readyCanvas);

  assert.equal(ticker.callbacks.size, 1);
  assert.ok(token.mesh.y < token.center.y);
  assert.ok(token.mesh.scale.x > 1);
  assert.ok(token.mesh.alpha < 1);

  token.visible = false;
  layer.onRefreshToken(token, { refreshVisibility: true });
  assert.equal(ticker.callbacks.size, 0);
  assert.deepEqual([token.mesh.x, token.mesh.y], [token.center.x, token.center.y]);
  assert.deepEqual([token.mesh.scale.x, token.mesh.scale.y], [1, 1]);
  assert.equal(token.mesh.alpha, 1);
  assert.deepEqual([token.tooltip.x, token.tooltip.y], [50, -4]);

  token.visible = true;
  layer.onRefreshToken(token, { refreshVisibility: true });
  assert.equal(ticker.callbacks.size, 1);
  assert.ok(token.mesh.y < token.center.y);
  assert.ok(token.mesh.scale.x > 1);
  assert.ok(token.mesh.alpha < 1);
  layer.deactivate(readyCanvas);
});

test("runtime disable, re-enable, and landing at zero fully reconcile the Scene", () => {
  const scene = { id: "scene-settings-lifecycle" };
  const token = makeToken(60);
  token.document.parent = scene;
  token.document.object = token;
  const ticker = new FakeTicker();
  const readyCanvas = makeCanvas(scene, [token], ticker);
  globalThis.canvas = readyCanvas;
  const values = installGameSettings();
  const layer = new FlyingVisualLayer();
  layer.activate(readyCanvas);
  assert.equal(readyCanvas.primary.children.length, 1);
  assert.equal(ticker.callbacks.size, 1);

  values.enabled = false;
  layer.refreshSettings();
  assert.equal(readyCanvas.primary.children.length, 0);
  assert.equal(ticker.callbacks.size, 0);
  assert.deepEqual([token.mesh.x, token.mesh.y], [token.center.x, token.center.y]);
  assert.deepEqual([token.mesh.scale.x, token.mesh.scale.y], [1, 1]);
  assert.equal(token.mesh.alpha, 1);

  values.enabled = true;
  layer.refreshSettings();
  assert.equal(readyCanvas.primary.children.length, 1);
  assert.equal(ticker.callbacks.size, 1);

  token.document.elevation = 0;
  layer.onUpdateToken(token.document, { elevation: 0 }, { animate: false }, "user");
  assert.equal(readyCanvas.primary.children.length, 0);
  assert.equal(ticker.callbacks.size, 0);
  assert.deepEqual([token.mesh.x, token.mesh.y], [token.center.x, token.center.y]);
  assert.deepEqual([token.mesh.scale.x, token.mesh.scale.y], [1, 1]);
  assert.equal(token.mesh.alpha, 1);
  layer.deactivate(readyCanvas);
});

test("ignores a late teardown from the previous Scene", () => {
  const sceneA = { id: "scene-a" };
  const sceneB = { id: "scene-b" };
  const tokenA = makeToken(60);
  const tokenB = makeToken(60);
  tokenA.document.parent = sceneA;
  tokenA.document.object = tokenA;
  tokenB.document.parent = sceneB;
  tokenB.document.object = tokenB;
  const canvasA = makeCanvas(sceneA, [tokenA], new FakeTicker());
  const canvasB = makeCanvas(sceneB, [tokenB], new FakeTicker());
  installGameSettings();
  const layer = new FlyingVisualLayer();

  globalThis.canvas = canvasA;
  layer.activate(canvasA);
  globalThis.canvas = canvasB;
  layer.activate(canvasB);
  assert.equal(canvasA.primary.children.length, 0);
  assert.equal(canvasB.primary.children.length, 1);
  layer.deactivate(canvasA);
  assert.equal(canvasB.primary.children.length, 1);
  assert.equal(canvasB.app.ticker.callbacks.size, 1);
  layer.deactivate(canvasB);
  assert.equal(canvasB.primary.children.length, 0);
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

  assert.equal(ticker.callbacks.size, 1);
  assert.equal(token.children.length, 0);
  assert.equal(readyCanvas.primary.children.length, 1);
  const stand = readyCanvas.primary.children[0].children[2];
  assert.ok(stand.commands.some(command => command[0] === "drawPolygon"));
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
  const stand = visualContainer.children[3];
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

test("yields native tooltip alpha to a module which writes later during the fade", () => {
  const token = makeToken(10);
  const visual = new FlyingTokenVisual(token, settings);
  visual.beginCoreAnimation(60);
  visual.syncCoreElevation(30, { active: true });
  assert.ok(token.tooltip.alpha < 1);

  token.tooltip.alpha = 0.37;
  visual.syncCoreElevation(40, { active: true });
  assert.equal(token.tooltip.alpha, 0.37);
  visual.syncCoreElevation(60, { active: false });
  assert.equal(token.tooltip.alpha, 0.37);
  visual.destroy();
  assert.equal(token.tooltip.alpha, 0.37);
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
  priorities = new Map();
  add(callback, _context, priority) {
    this.callbacks.add(callback);
    this.priorities.set(callback, priority);
  }
  remove(callback) {
    this.callbacks.delete(callback);
    this.priorities.delete(callback);
  }
}

class FakeMotionQuery {
  constructor(matches) {
    this.matches = matches;
    this.listeners = new Set();
  }

  addEventListener(type, listener) {
    if (type === "change") this.listeners.add(listener);
  }

  removeEventListener(type, listener) {
    if (type === "change") this.listeners.delete(listener);
  }

  setMatches(matches) {
    this.matches = matches;
    for (const listener of this.listeners) listener({ matches });
  }
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

function installGameSettings(overrides = {}) {
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
    shadowDistanceMultiplier: 1,
    ...overrides
  };
  globalThis.game = { settings: { get: (_moduleId, key) => values[key] } };
  return values;
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
