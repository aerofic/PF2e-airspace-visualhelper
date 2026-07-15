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
  static SORT_LAYERS = { TOKENS: 700 };

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

test("sorts the takeoff shadow below ground and flying Token artwork", () => {
  const parent = new FakeContainer();
  const token = makeToken(60);
  const visual = new FlyingTokenVisual(token, settings, { parent });
  const groundTokenMesh = { id: "ground", elevation: 0, sortLayer: 700, sort: 0 };
  const ownFlyingMesh = { id: "flying", elevation: 60, sortLayer: 700, sort: 0 };
  visual.container.id = "shadow";

  const ordered = [ownFlyingMesh, visual.container, groundTokenMesh]
    .sort(comparePrimaryDisplayObjects)
    .map(object => object.id);
  assert.deepEqual(ordered, ["shadow", "ground", "flying"]);
  assert.equal(visual.container.elevation, 0);
  assert.equal(visual.container.sortLayer, 699);
  assert.equal(visual.container.eventMode, "none");
  assert.equal(visual.container.interactiveChildren, false);

  visual.setElevation(20, { animate: false });
  assert.equal(visual.container.elevation, 0);
  assert.equal(token.document.elevation, 60, "visual sorting must not write Token data");
  visual.destroy();
});

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

class FakeSprite extends FakeContainer {
  constructor() {
    super();
    this.anchor = new FakePoint(0.5, 0.5);
    this.texture = null;
    this.width = 0;
    this.height = 0;
    this.rotation = 0;
    this.tint = 0xffffff;
  }
}

class FakeRectangle {
  constructor(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  contains(x, y) {
    return x >= this.x && x <= this.x + this.width
      && y >= this.y && y <= this.y + this.height;
  }
}

globalThis.PIXI = {
  Container: FakeContainer,
  Graphics: FakeGraphics,
  Sprite: FakeSprite,
  Rectangle: FakeRectangle,
  BLEND_MODES: { NORMAL: "normal", SCREEN: "screen", MULTIPLY: "multiply" },
  UPDATE_PRIORITY: { NORMAL: 0, PRIMARY: 3 }
};
globalThis.canvas = {
  grid: { size: 100, distance: 5 },
  dimensions: { size: 100, distance: 5 }
};
globalThis.matchMedia = () => ({ matches: false });

const settings = {
  enableShadow: true,
  shadowOpacity: 0.35
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
  token.mesh = new FakeSprite();
  token.mesh.texture = { id: `${token.id}-texture`, destroyed: false };
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
  token.w = 100;
  token.h = 100;
  return token;
}

test("moves native elevation UI with the artwork without changing visibility or alpha", () => {
  const token = makeToken(60);
  token.tooltip.position.set(63, -7);
  token.tooltip.alpha = 0.43;
  token.tooltip.renderable = true;
  token.levelIndicator.position.set(61, -29);
  const visual = new FlyingTokenVisual(token, settings);
  const { offsetX, offsetY } = visual.metrics.token;

  assert.equal(token.tooltip.renderable, true);
  assert.equal(token.tooltip.alpha, 0.43);
  assertClose(token.tooltip.x, 63 + offsetX);
  assertClose(token.tooltip.y, -7 + offsetY);
  assertClose(token.levelIndicator.x, 61 + offsetX);
  assertClose(token.levelIndicator.y, -29 + offsetY);
  assert.equal(visual.container.children.length, 3);
  assert.ok(visual.container.children[0] instanceof FakeGraphics);
  assert.ok(visual.container.children.slice(1).every(child => child instanceof FakeSprite));

  visual.updateSettings({ ...settings });
  assert.equal(token.tooltip.renderable, true);
  assert.equal(token.tooltip.alpha, 0.43);
  assertClose(token.tooltip.x, 63 + offsetX);
  assertClose(token.tooltip.y, -7 + offsetY);
  assertClose(token.levelIndicator.x, 61 + offsetX);
  assertClose(token.levelIndicator.y, -29 + offsetY);

  visual.destroy();
  assert.equal(token.tooltip.renderable, true);
  assert.equal(token.tooltip.alpha, 0.43);
  assert.deepEqual([token.mesh.x, token.mesh.y], [token.center.x, token.center.y]);
  assert.deepEqual([token.mesh.scale.x, token.mesh.scale.y], [1, 1]);
  assert.equal(token.mesh.alpha, 1);
  assertClose(token.tooltip.x, 63);
  assertClose(token.tooltip.y, -7);
  assertClose(token.levelIndicator.x, 61);
  assertClose(token.levelIndicator.y, -29);
  assert.equal(visual.container.destroyed, true);
});

test("smoothly interpolates lift and shadow state without changing Token data", () => {
  const token = makeToken(0);
  const visual = new FlyingTokenVisual(token, settings);
  const originalElevation = token.document.elevation;
  const originalGetSize = token.document.getSize;

  assert.equal(visual.setElevation(60), true);
  const { startedAt, duration } = visual.animation;
  assert.equal(visual.tick(startedAt + (duration / 2)), true);
  assert.ok(visual.displayElevation > 0 && visual.displayElevation < 60);
  assert.equal(visual.shadowCoreSprite.visible, true);
  assert.equal(visual.shadowPenumbraSprite.visible, true);
  assert.ok(token.mesh.y < token.center.y);

  assert.equal(visual.tick(startedAt + duration), true);
  assert.equal(visual.isAnimating, false);
  assert.equal(visual.displayElevation, 60);
  assert.equal(token.document.elevation, originalElevation);
  assert.equal(token.document.getSize, originalGetSize);
  visual.destroy();
});

test("keeps the takeoff shadow snapped while only the rendered mesh moves", () => {
  const token = makeToken(60);
  setTokenPosition(token, 200, 300);
  const visual = new FlyingTokenVisual(token, settings);
  const offset = {
    x: token.mesh.x - token.center.x,
    y: token.mesh.y - token.center.y
  };
  const shadowCommands = visual.shadowGraphics.commands;

  assert.deepEqual(
    [visual.container.x + visual.metrics.shadow.groundX, visual.container.y + visual.metrics.shadow.groundY],
    [token.center.x, token.center.y]
  );
  assert.equal(offset.x, 0);
  assert.ok(offset.y < 0);
  assertClose(token.tooltip.x, 50 + offset.x);
  assertClose(token.tooltip.y, -4 + offset.y);
  assertClose(token.levelIndicator.x, 50 + offset.x);
  assertClose(token.levelIndicator.y, -24 + offset.y);

  // Simulate Foundry's refreshPosition at a snapped drag destination. Core
  // resets the mesh to center before the module's refreshToken hook runs.
  setTokenPosition(token, 500, 400);
  visual.onRefresh({ refreshPosition: true, refreshVisibility: true });

  assert.deepEqual([token.document.x, token.document.y], [500, 400]);
  assert.deepEqual([visual.container.x, visual.container.y], [500, 400]);
  assert.deepEqual(
    [visual.container.x + visual.metrics.shadow.groundX, visual.container.y + visual.metrics.shadow.groundY],
    [token.center.x, token.center.y]
  );
  assert.ok(Math.abs(token.mesh.x - (token.center.x + offset.x)) < 1e-9);
  assert.ok(Math.abs(token.mesh.y - (token.center.y + offset.y)) < 1e-9);
  assert.strictEqual(visual.shadowGraphics.commands, shadowCommands);

  visual.destroy();
  assert.deepEqual([token.mesh.x, token.mesh.y], [token.center.x, token.center.y]);
  assert.deepEqual([token.tooltip.x, token.tooltip.y], [50, -4]);
});

test("keeps the shadow on the rules square while composing Z Scatter into lifted art", () => {
  const previousGame = globalThis.game;
  globalThis.game = {
    modules: new Map([["z-scatter", { active: true }]])
  };
  try {
    const token = makeToken(60);
    const sourceShape = new FakeRectangle(0, 0, 100, 100);
    token.shape = sourceShape;
    applyFakeZScatter(token, 18, -10);
    const visual = new FlyingTokenVisual(token, settings);
    visual.setReducedMotion(true);

    assert.equal(visual.requiresTicker, true, "Z Scatter monitoring must survive reduced motion");
    assert.deepEqual([visual.container.x, visual.container.y], [0, 0]);
    assertClose(token.mesh.x, 68 + visual.metrics.token.offsetX);
    assertClose(token.mesh.y, 40 + visual.metrics.token.offsetY);
    assertClose(token.tooltip.x, 68 + visual.metrics.token.offsetX);
    assertClose(token.tooltip.y, -12 + visual.metrics.token.offsetY);
    assert.equal(token.hitArea.contains(20, 0), true, "scattered base should remain clickable");
    assert.equal(
      token.hitArea.contains(50 + 18 + visual.metrics.token.offsetX, 50 - 10 + visual.metrics.token.offsetY),
      true,
      "lifted art should gain a second selectable region"
    );

    // Z Scatter writes directly outside refreshToken during its queued layout.
    const latestScatterHitArea = applyFakeZScatter(token, -14, 12);
    visual.tick(performance.now() + 200);
    assert.deepEqual([visual.container.x, visual.container.y], [0, 0]);
    assertClose(token.mesh.x, 36 + visual.metrics.token.offsetX);
    assertClose(token.mesh.y, 62 + visual.metrics.token.offsetY);
    assertClose(token.tooltip.x, 36 + visual.metrics.token.offsetX);
    assertClose(token.tooltip.y, 10 + visual.metrics.token.offsetY);

    visual.destroy();
    assert.strictEqual(token.hitArea, latestScatterHitArea);
    assert.deepEqual([token.mesh.x, token.mesh.y], [36, 62]);
    assert.deepEqual([token.tooltip.x, token.tooltip.y], [36, 10]);
  } finally {
    globalThis.game = previousGame;
  }
});

test("keeps the native height label above the Token while Z Scatter suspends for movement", () => {
  const previousGame = globalThis.game;
  globalThis.game = {
    modules: new Map([["z-scatter", { active: true }]])
  };
  try {
    const token = makeToken(60);
    token.shape = new FakeRectangle(0, 0, 100, 100);
    const scatteredHitArea = applyFakeZScatter(token, 18, -10);
    const visual = new FlyingTokenVisual(token, settings);
    visual.setReducedMotion(true);
    const { offsetX, offsetY } = visual.metrics.token;

    token.animationContexts.set("movement", { to: { x: 100, y: 0 } });
    // Core restores the moving mesh, while Z Scatter's zero-offset movement
    // presentation restores the native local UI anchors.
    token.mesh.position.set(token.center.x, token.center.y);
    token.tooltip.position.set(50, -2);
    token.nameplate.position.set(50, 102);
    token.bars.position.set(0, 0);
    token.effects.position.set(0, 0);
    visual.onRefresh({ refreshPosition: true });

    assert.deepEqual([visual.container.x, visual.container.y], [0, 0]);
    assertClose(token.mesh.x, token.center.x + offsetX);
    assertClose(token.mesh.y, token.center.y + offsetY);
    assertClose(token.tooltip.x, 50 + offsetX);
    assertClose(token.tooltip.y, -2 + offsetY);
    assert.ok(token.tooltip.y < -2, "native height label must remain above the lifted Token");

    visual.destroy();
    assert.strictEqual(token.hitArea, scatteredHitArea);
    assert.deepEqual([token.tooltip.x, token.tooltip.y], [50, -2]);
  } finally {
    globalThis.game = previousGame;
  }
});

test("anchors non-rectangular Token shapes to Foundry's actual local center", () => {
  const token = makeToken(60);
  token.localCenter = { x: 42, y: 61 };
  token.mesh.position.set(token.center.x, token.center.y);
  setTokenPosition(token, 200, 300);
  const visual = new FlyingTokenVisual(token, settings);

  assert.deepEqual([visual.metrics.shadow.groundX, visual.metrics.shadow.groundY], [42, 61]);
  assert.deepEqual(
    [visual.container.x + visual.metrics.shadow.groundX, visual.container.y + visual.metrics.shadow.groundY],
    [token.center.x, token.center.y]
  );
  visual.destroy();
  assert.deepEqual([token.mesh.x, token.mesh.y], [token.center.x, token.center.y]);
});

test("renders the Token texture silhouette on its original ground square", () => {
  const token = makeToken(60);
  const visual = new FlyingTokenVisual(token, settings);
  assert.equal(visual.shadowGraphics.commands.length, 0, "texture path needs no fallback geometry");
  assert.equal(visual.shadowCoreSprite.texture, token.mesh.texture);
  assert.equal(visual.shadowCoreSprite.visible, true);
  assert.equal(visual.shadowPenumbraSprite.visible, true);
  assertClose(visual.shadowCoreSprite.x, visual.metrics.shadow.x);
  assertClose(visual.shadowCoreSprite.y, visual.metrics.shadow.y);
  assertClose(visual.shadowCoreSprite.x, visual.metrics.shadow.groundX);
  assert.ok(visual.shadowCoreSprite.y > visual.metrics.shadow.groundY);
  assertClose(visual.shadowCoreSprite.width, visual.metrics.shadow.width);
  assertClose(visual.shadowCoreSprite.height, visual.metrics.shadow.height);
  assert.ok(visual.shadowPenumbraSprite.width > visual.shadowCoreSprite.width);
  assert.ok(visual.shadowCoreSprite.alpha > visual.shadowPenumbraSprite.alpha);
  visual.destroy();
});

test("refreshes both projected silhouettes when Foundry replaces the Token texture", () => {
  const token = makeToken(60);
  const visual = new FlyingTokenVisual(token, settings);
  const originalTexture = token.mesh.texture;
  const replacementTexture = { id: "replacement-token-texture" };

  assert.equal(visual.shadowCoreSprite.texture, originalTexture);
  assert.equal(visual.shadowPenumbraSprite.texture, originalTexture);

  token.mesh.texture = replacementTexture;
  visual.onRefresh({ refreshMesh: true });

  assert.equal(visual.shadowCoreSprite.texture, replacementTexture);
  assert.equal(visual.shadowPenumbraSprite.texture, replacementTexture);
  visual.destroy();
});

test("keeps airborne lift active when the optional shadow is fully transparent", () => {
  const token = makeToken(60);
  const visual = new FlyingTokenVisual(token, {
    ...settings,
    shadowOpacity: 0
  });

  assert.equal(visual.container.visible, false);
  assert.equal(token.mesh.x, token.center.x);
  assert.ok(token.mesh.y < token.center.y);
  assert.ok(token.tooltip.y < -4);
  visual.destroy();
});

test("ambient motion updates only the cached pose and never rebuilds PIXI geometry", () => {
  const token = makeToken(60);
  token.id = "ambient-token";
  const visual = new FlyingTokenVisual(token, settings);
  const shadowCommands = visual.shadowGraphics.commands;
  const staticMeshY = token.mesh.y;
  const scaleWrites = token.mesh.scale.setCalls;
  const alphaWrites = token.mesh.alphaWrites;
  const positionWrites = token.mesh.position.setCalls;
  const shadowWidths = [visual.shadowCoreSprite.width];
  const shadowAlphas = [visual.shadowCoreSprite.alpha];

  for (const elapsed of [900, 950, 1000]) {
    visual.tick(visual.ambientStartedAt + elapsed);
    shadowWidths.push(visual.shadowCoreSprite.width);
    shadowAlphas.push(visual.shadowCoreSprite.alpha);
  }

  assert.strictEqual(visual.shadowGraphics.commands, shadowCommands);
  assert.equal(token.mesh.scale.setCalls, scaleWrites);
  assert.equal(token.mesh.alphaWrites, alphaWrites);
  assert.ok(token.mesh.position.setCalls > positionWrites);
  assert.ok(Math.abs(token.mesh.y - staticMeshY) <= visual.metrics.token.bobAmplitude + 1e-9);
  assert.ok(Math.abs(token.mesh.y - staticMeshY) > 1e-6);
  assertClose(visual.shadowCoreSprite.x, visual.metrics.shadow.x);
  assert.ok(
    Math.abs(visual.shadowCoreSprite.y - visual.metrics.shadow.y)
      <= (visual.metrics.token.bobAmplitude * 0.18) + 1e-9
  );
  assert.ok(new Set(shadowWidths).size > 1, "ground shadow scale should follow airborne bob");
  assert.ok(new Set(shadowAlphas).size > 1, "ground shadow density should follow airborne bob");
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
    shadow: container.children[0].commands
  }));
  for (const callback of ticker.callbacks) callback();
  readyCanvas.primary.children.forEach((container, index) => {
    assert.strictEqual(container.children[0].commands, commandReferences[index].shadow);
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
  const shadow = readyCanvas.primary.children[0].children[2];
  assert.equal(shadow.visible, true);
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
  const initialMeshY = token.mesh.y;
  layer.onUpdateToken(token.document, { elevation: 60 }, {}, "user");

  token.document.elevation = 30;
  layer.onRefreshToken(token, { refreshElevation: true });
  assert.equal(visualContainer.visible, true);

  token.document.elevation = 60;
  token.animationContexts.clear();
  layer.onRefreshToken(token, { refreshElevation: true });
  assert.ok(token.mesh.y < initialMeshY);

  token.document.isSecret = true;
  layer.onRefreshToken(token, { refreshState: true });
  assert.equal(visualContainer.visible, false);
  assert.deepEqual([token.mesh.x, token.mesh.y], [token.center.x, token.center.y]);
  layer.deactivate(readyCanvas);
});

test("moves native height UI above core elevation frames without fading it", () => {
  const token = makeToken(10);
  token.tooltip.alpha = 0.74;
  const visual = new FlyingTokenVisual(token, settings);
  visual.beginCoreAnimation(30);
  visual.syncCoreElevation(30, { active: false });
  assert.equal(token.tooltip.alpha, 0.74);
  assertClose(token.tooltip.x, 50 + visual.metrics.token.offsetX);
  assertClose(token.tooltip.y, -4 + visual.metrics.token.offsetY);
  assertClose(token.levelIndicator.x, 50 + visual.metrics.token.offsetX);
  assertClose(token.levelIndicator.y, -24 + visual.metrics.token.offsetY);
  visual.beginCoreAnimation(60);
  visual.syncCoreElevation(60, { active: false });
  assert.equal(token.tooltip.alpha, 0.74);
  assertClose(token.tooltip.x, 50 + visual.metrics.token.offsetX);
  assertClose(token.tooltip.y, -4 + visual.metrics.token.offsetY);
  visual.destroy();
});

test("preserves later native elevation UI writes through animation and teardown", () => {
  const token = makeToken(10);
  const visual = new FlyingTokenVisual(token, settings);
  visual.beginCoreAnimation(60);
  visual.syncCoreElevation(30, { active: true });

  token.tooltip.alpha = 0.37;
  token.tooltip.position.set(72, -11);
  token.levelIndicator.position.set(70, -31);
  visual.syncCoreElevation(40, { active: true });
  assert.equal(token.tooltip.alpha, 0.37);
  assert.deepEqual([token.tooltip.x, token.tooltip.y], [72, -11]);
  assert.deepEqual([token.levelIndicator.x, token.levelIndicator.y], [70, -31]);
  visual.syncCoreElevation(60, { active: false });
  assert.equal(token.tooltip.alpha, 0.37);
  visual.destroy();
  assert.equal(token.tooltip.alpha, 0.37);
  assert.deepEqual([token.tooltip.x, token.tooltip.y], [72, -11]);
  assert.deepEqual([token.levelIndicator.x, token.levelIndicator.y], [70, -31]);
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
    tokens: { placeables: tokens, objects: new FakeContainer() },
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
    enableShadow: true,
    shadowOpacity: 0.35,
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

function applyFakeZScatter(token, offsetX, offsetY) {
  const hitArea = new FakeRectangle(
    token.shape.x + offsetX,
    token.shape.y + offsetY,
    token.shape.width,
    token.shape.height
  );
  token.hitArea = hitArea;
  token.mesh.position.set(token.center.x + offsetX, token.center.y + offsetY);
  token.tooltip.position.set((token.w / 2) + offsetX, offsetY - 2);
  token.nameplate.position.set((token.w / 2) + offsetX, token.h + 2 + offsetY);
  token.bars.position.set(offsetX, offsetY);
  token.effects.position.set(offsetX, offsetY);
  return hitArea;
}

function assertClose(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) <= 0.000001, message ?? `${actual} != ${expected}`);
}

function comparePrimaryDisplayObjects(left, right) {
  return (Number(left.elevation) - Number(right.elevation))
    || (Number(left.sortLayer) - Number(right.sortLayer))
    || (Number(left.sort) - Number(right.sort));
}

test("keeps negative-elevation Token artwork visible above the map", () => {
  const scene = { id: "scene-subterranean" };
  const token = makeToken(-5);
  token.isVisible = true;
  token.visible = false;
  token.renderable = false;
  token.document.parent = scene;
  token.document.object = token;
  const readyCanvas = makeCanvas(scene, [token], new FakeTicker());
  globalThis.canvas = readyCanvas;
  installGameSettings();
  const layer = new FlyingVisualLayer();
  layer.activate(readyCanvas);

  assert.equal(readyCanvas.primary.children.length, 0);
  assert.equal(readyCanvas.tokens.objects.children.length, 1);
  const subterranean = readyCanvas.tokens.objects.children[0];
  assert.equal(subterranean.visible, true);
  assert.equal(subterranean.children[0].texture, token.mesh.texture);

  token.document.elevation = 0;
  layer.onUpdateToken(token.document, { elevation: 0 }, { animate: false }, "user");
  assert.equal(subterranean.visible, false);
  layer.deactivate(readyCanvas);
  assert.equal(readyCanvas.tokens.objects.children.length, 0);
});
