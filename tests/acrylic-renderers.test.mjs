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
    topX: 30,
    topY: -60,
    baseX: 50,
    baseY: 50,
    length: Math.hypot(20, 110),
    width: 6,
    opacity: 0.5
  },
  base: {
    x: 50,
    y: 50,
    radiusX: 28,
    radiusY: 8,
    thickness: 3,
    pinLength: 9,
    pinWidth: 4
  },
  connector: { x: 31, y: -54, length: 13, width: 8 },
  airAccent: { x: 30, y: -60, radiusX: 18, radiusY: 4, alpha: 0.08 },
  shadow: {
    x: 59,
    y: 54,
    radiusX: 23,
    radiusY: 7,
    alpha: 0.3,
    shaftStartX: 50,
    shaftStartY: 50,
    shaftEndX: 59,
    shaftEndY: 54,
    shaftWidth: 4,
    shaftAlpha: 0.5,
    contactX: 50,
    contactY: 52,
    contactRadiusX: 22,
    contactRadiusY: 8,
    contactCoreRadiusX: 10,
    contactCoreRadiusY: 4,
    contactAlpha: 0.24,
    contactCoreAlpha: 0.3
  }
};

test("layers a restrained acrylic body, plate, pin, connector, and SCREEN highlights", () => {
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
  assert.equal(
    body.commands.filter(command => command[0] === "drawPolygon").length,
    4,
    "shaft body, cylindrical shade plane, bottom pin, and compact connector sleeve are drawn"
  );
  assert.ok(body.commands.filter(command => command[0] === "drawEllipse").length >= 2);
  assert.ok(specular.commands.filter(command => command[0] === "drawEllipse").length >= 3);
  assert.equal(
    [...body.commands, ...specular.commands].some(command => command[0] === "drawCircle"),
    false
  );

  const lineWidths = specular.commands
    .filter(command => command[0] === "lineStyle")
    .map(command => command[1]);
  assert.ok(lineWidths.length >= 5);
  assert.ok(Math.max(...lineWidths) <= 1.5, "no wide laser-like stroke is emitted");
  assert.equal(lineWidths.at(-1), 0, "the air accent must not inherit a bright shaft outline");
  assert.ok(
    Math.max(...body.commands
      .filter(command => command[0] === "beginFill")
      .map(command => command[2])) >= 0.19,
    "acrylic plate should retain the denser physical treatment"
  );

  renderer.render(metrics, false);
  assert.equal(body.visible, false);
  assert.equal(specular.visible, false);
  assert.deepEqual(body.commands, []);
  assert.deepEqual(specular.commands, []);
});

test("uses three shaft, four Token, and two contact shadow layers without filters", () => {
  const graphics = new FakeGraphics();
  const renderer = new ShadowRenderer(graphics);

  assert.equal(graphics.eventMode, "none");
  assert.equal(graphics.blendMode, "multiply");
  assert.equal(graphics.zIndex, 0);
  assert.equal(graphics.filters, undefined);

  renderer.render(metrics, true);
  assert.equal(graphics.visible, true);
  assert.equal(
    graphics.commands.filter(command => command[0] === "beginFill").length,
    9
  );
  assert.equal(graphics.commands.filter(command => command[0] === "drawPolygon").length, 7);
  const fills = graphics.commands.filter(command => command[0] === "beginFill");
  assert.ok(
    fills.every(command => command[2] > 0 && command[2] <= 0.42),
    "each physical layer remains translucent even though their overlap is dense"
  );
  const shaftOpacity = fills.slice(0, 3)
    .reduce((combined, command) => 1 - ((1 - combined) * (1 - command[2])), 0);
  assert.ok(shaftOpacity > 0.45, "shaft shadow should read as a strong physical cast shadow");
  const castOpacity = fills.slice(3, 7)
    .reduce((combined, command) => 1 - ((1 - combined) * (1 - command[2])), 0);
  assert.ok(castOpacity > 0.35, "layered cast shadow should remain clearly readable");

  renderer.render(metrics, false);
  assert.equal(graphics.visible, false);
  assert.deepEqual(graphics.commands, []);
});
