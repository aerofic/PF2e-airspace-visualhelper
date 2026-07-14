import test from "node:test";
import assert from "node:assert/strict";
import { FlyingStand } from "../src/flying-stand.js";
import { ShadowRenderer } from "../src/shadow-renderer.js";

class FakeGraphics {
  constructor() {
    this.commands = [];
    this.visible = true;
    this.blendMode = undefined;
  }

  clear() { this.commands = []; return this; }
  lineStyle(...args) { this.commands.push(["lineStyle", ...args]); return this; }
  moveTo(...args) { this.commands.push(["moveTo", ...args]); return this; }
  lineTo(...args) { this.commands.push(["lineTo", ...args]); return this; }
  beginFill(...args) { this.commands.push(["beginFill", ...args]); return this; }
  drawPolygon(...args) { this.commands.push(["drawPolygon", ...args]); return this; }
  drawEllipse(...args) { this.commands.push(["drawEllipse", ...args]); return this; }
  endFill() { this.commands.push(["endFill"]); return this; }
}

class FakePoint {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  set(x, y) {
    this.x = x;
    this.y = y;
  }
}

class FakeSprite {
  constructor() {
    this.position = new FakePoint();
    this.anchor = new FakePoint(0.5, 0.5);
    this.visible = false;
    this.alpha = 1;
    this.width = 0;
    this.height = 0;
    this.rotation = 0;
    this.texture = null;
  }

  get x() { return this.position.x; }
  get y() { return this.position.y; }
}

globalThis.PIXI = {
  BLEND_MODES: {
    NORMAL: "normal",
    SCREEN: "screen",
    MULTIPLY: "multiply"
  }
};

const metrics = {
  flying: true,
  stand: {
    topX: 50,
    topY: 46,
    baseX: 50,
    baseY: 50,
    length: 4,
    width: 6,
    opacity: 0.5
  },
  base: {
    x: 50,
    y: 50,
    radiusX: 55,
    radiusY: 55,
    thickness: 2,
    innerRadiusX: 50,
    innerRadiusY: 50,
    rimWidth: 2
  },
  connector: { x: 50, y: 50, length: 0, width: 7, radius: 6 },
  shadow: {
    x: 84.64,
    y: 30,
    radiusX: 50,
    radiusY: 50,
    width: 100,
    height: 100,
    alpha: 0.3,
    distance: 40,
    directionX: Math.sqrt(3) / 2,
    directionY: -0.5,
    softness: 0.05,
    shaftStartX: 50,
    shaftStartY: 50,
    shaftEndX: 84.64,
    shaftEndY: 30,
    shaftWidth: 4,
    shaftAlpha: 0.28,
    contactX: 50,
    contactY: 52,
    contactRadiusX: 8,
    contactRadiusY: 6,
    contactCoreRadiusX: 4,
    contactCoreRadiusY: 3,
    contactAlpha: 0.12,
    contactCoreAlpha: 0.09
  }
};

test("draws a concentric top-down acrylic rim and circular rod end", () => {
  const body = new FakeGraphics();
  const specular = new FakeGraphics();
  const renderer = new FlyingStand(body, specular);

  assert.equal(body.eventMode, "none");
  assert.equal(specular.eventMode, "none");
  assert.equal(body.zIndex, 20);
  assert.equal(specular.zIndex, 30);
  assert.equal(body.blendMode, "normal");
  assert.equal(specular.blendMode, "screen");

  renderer.render(metrics, true);
  assert.equal(body.visible, true);
  assert.equal(specular.visible, true);
  assert.equal(body.commands.filter(command => command[0] === "drawPolygon").length, 0);
  assert.ok(body.commands.filter(command => command[0] === "drawEllipse").length >= 3);
  assert.ok(specular.commands.filter(command => command[0] === "drawEllipse").length >= 3);
  assert.equal(
    [...body.commands, ...specular.commands].some(command => command[0] === "drawCircle"),
    false
  );

  const lineWidths = specular.commands
    .filter(command => command[0] === "lineStyle")
    .map(command => command[1]);
  assert.ok(lineWidths.length >= 5);
  assert.ok(Math.max(...lineWidths) <= 3.5, "top-down rim stays bounded and cannot become a laser rod");
  assert.ok(
    Math.max(...body.commands
      .filter(command => command[0] === "beginFill")
      .map(command => command[2])) <= 0.11,
    "the plate fill stays transparent beneath Token art"
  );

  const normalLineCount = specular.commands.filter(command => command[0] === "lineTo").length;
  renderer.render(metrics, true, { emphasized: true });
  assert.ok(
    specular.commands.filter(command => command[0] === "lineTo").length > normalLineCount,
    "hover or control adds only the short X-ray rim spokes"
  );

  renderer.render(metrics, false);
  assert.equal(body.visible, false);
  assert.equal(specular.visible, false);
  assert.deepEqual(body.commands, []);
  assert.deepEqual(specular.commands, []);
});

test("projects the rod and reuses the Token texture for a real silhouette", () => {
  const graphics = new FakeGraphics();
  const penumbra = new FakeSprite();
  const core = new FakeSprite();
  const renderer = new ShadowRenderer(graphics, {
    penumbraSprite: penumbra,
    coreSprite: core
  });
  const texture = { id: "token-texture", destroyed: false };

  assert.equal(graphics.eventMode, "none");
  assert.equal(graphics.blendMode, "multiply");
  assert.equal(graphics.zIndex, 0);
  assert.equal(graphics.filters, undefined);

  renderer.render(metrics, true, { texture, rotation: 0.25, anchorX: 0.5, anchorY: 0.5 });
  assert.equal(graphics.visible, true);
  assert.equal(
    graphics.commands.filter(command => command[0] === "beginFill").length,
    4
  );
  assert.equal(graphics.commands.filter(command => command[0] === "drawPolygon").length, 2);
  const fills = graphics.commands.filter(command => command[0] === "beginFill");
  assert.ok(
    fills.every(command => command[2] > 0 && command[2] <= 0.42),
    "each physical layer remains translucent even though their overlap is dense"
  );
  assert.equal(core.texture, texture);
  assert.equal(penumbra.texture, texture);
  assert.equal(core.visible, true);
  assert.equal(penumbra.visible, true);
  assert.equal(core.x, metrics.shadow.x);
  assert.equal(core.y, metrics.shadow.y);
  assert.equal(core.width, metrics.shadow.width);
  assert.equal(core.height, metrics.shadow.height);
  assert.equal(core.rotation, 0.25);
  assert.ok(penumbra.width > core.width);
  assert.ok(core.alpha > penumbra.alpha);
  assert.equal(core.eventMode, "none");
  assert.equal(core.blendMode, "multiply");

  renderer.render(metrics, false);
  assert.equal(graphics.visible, false);
  assert.equal(core.visible, false);
  assert.equal(penumbra.visible, false);
  assert.deepEqual(graphics.commands, []);
});
