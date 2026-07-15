import test from "node:test";
import assert from "node:assert/strict";
import { ShadowRenderer } from "../src/shadow-renderer.js";

class Point {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  set(x, y) { this.x = x; this.y = y; }
}

class Graphics {
  constructor() {
    this.commands = [];
    this.blendMode = "normal";
    this.visible = true;
  }
  clear() { this.commands = []; return this; }
  beginFill(...args) { this.commands.push(["beginFill", ...args]); return this; }
  drawEllipse(...args) { this.commands.push(["drawEllipse", ...args]); return this; }
  endFill() { this.commands.push(["endFill"]); return this; }
}

class Sprite {
  constructor() {
    this.position = new Point();
    this.anchor = new Point(0.5, 0.5);
    this.blendMode = "normal";
    this.visible = false;
    this.width = 0;
    this.height = 0;
    this.alpha = 0;
  }
  get x() { return this.position.x; }
  get y() { return this.position.y; }
}

globalThis.PIXI = { BLEND_MODES: { MULTIPLY: "multiply" } };

const metrics = {
  flying: true,
  shadow: {
    x: 50,
    y: 50,
    radiusX: 40,
    radiusY: 40,
    width: 80,
    height: 80,
    alpha: 0.62,
    softness: 0.1,
    directionX: 0,
    directionY: 1
  }
};

test("reuses the real Token texture for a strong non-interactive takeoff shadow", () => {
  const graphics = new Graphics();
  const penumbra = new Sprite();
  const core = new Sprite();
  const texture = { id: "token", destroyed: false };
  const renderer = new ShadowRenderer(graphics, { penumbraSprite: penumbra, coreSprite: core });

  renderer.render(metrics, true, { texture });

  assert.equal(graphics.eventMode, "none");
  assert.equal(graphics.commands.length, 0);
  assert.equal(core.texture, texture);
  assert.equal(core.visible, true);
  assert.equal(penumbra.visible, true);
  assert.deepEqual([core.x, core.y], [50, 50]);
  assert.ok(core.alpha > penumbra.alpha);
  assert.ok(penumbra.width > core.width);
});

test("synchronizes bob through a tiny bounded center, scale, and density drift", () => {
  const graphics = new Graphics();
  const penumbra = new Sprite();
  const core = new Sprite();
  const renderer = new ShadowRenderer(graphics, { penumbraSprite: penumbra, coreSprite: core });
  renderer.render(metrics, true, { texture: { destroyed: false } });
  const base = { x: core.x, y: core.y, width: core.width, alpha: core.alpha };

  renderer.applyAmbient(-2);

  assert.equal(core.x, base.x);
  assert.ok(core.y > base.y);
  assert.ok(core.y - base.y <= 0.36);
  assert.ok(core.width < base.width);
  assert.ok(core.alpha < base.alpha);
  assert.equal(graphics.commands.length, 0);
});

test("falls back to a strong two-layer ellipse without a usable texture", () => {
  const graphics = new Graphics();
  const renderer = new ShadowRenderer(graphics);
  renderer.render(metrics, true);
  assert.equal(graphics.commands.filter(command => command[0] === "drawEllipse").length, 2);
  assert.equal(graphics.blendMode, "multiply");
});
