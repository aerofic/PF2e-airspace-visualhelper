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
    x: 59,
    y: 31,
    radiusX: 46,
    radiusY: 46,
    alpha: 0.3,
    shaftStartX: 50,
    shaftStartY: 50,
    shaftEndX: 50,
    shaftEndY: 50,
    shaftWidth: 0,
    shaftAlpha: 0,
    contactX: 50,
    contactY: 52,
    contactRadiusX: 52,
    contactRadiusY: 52,
    contactCoreRadiusX: 45,
    contactCoreRadiusY: 45,
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

test("uses four top-down Token and two concentric contact shadow layers without filters", () => {
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
    6
  );
  assert.equal(graphics.commands.filter(command => command[0] === "drawPolygon").length, 4);
  const fills = graphics.commands.filter(command => command[0] === "beginFill");
  assert.ok(
    fills.every(command => command[2] > 0 && command[2] <= 0.42),
    "each physical layer remains translucent even though their overlap is dense"
  );
  const castOpacity = fills.slice(0, 4)
    .reduce((combined, command) => 1 - ((1 - combined) * (1 - command[2])), 0);
  assert.ok(castOpacity > 0.35, "layered cast shadow should remain clearly readable");

  renderer.render(metrics, false);
  assert.equal(graphics.visible, false);
  assert.deepEqual(graphics.commands, []);
});
