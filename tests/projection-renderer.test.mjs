import test from "node:test";
import assert from "node:assert/strict";
import { drawVerticalDashedLine } from "../src/projection-renderer.js";

class FakeGraphics {
  commands = [];
  lineStyle(...args) { this.commands.push(["lineStyle", ...args]); return this; }
  moveTo(...args) { this.commands.push(["moveTo", ...args]); return this; }
  lineTo(...args) { this.commands.push(["lineTo", ...args]); return this; }
}

test("draws bounded vertical dash segments on one exact x coordinate", () => {
  const graphics = new FakeGraphics();
  drawVerticalDashedLine(graphics, {
    x: 50,
    startY: 100,
    endY: 137,
    dashLength: 8,
    gapLength: 4,
    width: 2,
    color: 0xffffff,
    alpha: 0.4
  });
  const points = graphics.commands.filter(command => ["moveTo", "lineTo"].includes(command[0]));
  assert.ok(points.length > 0);
  assert.ok(points.every(command => command[1] === 50));
  assert.ok(points.filter(command => command[0] === "lineTo").every(command => command[2] <= 137));
});

test("does not draw invalid or zero-length projection lines", () => {
  const graphics = new FakeGraphics();
  drawVerticalDashedLine(graphics, {
    x: 50,
    startY: 100,
    endY: 100,
    dashLength: 8,
    gapLength: 4,
    width: 2,
    color: 0xffffff,
    alpha: 0.4
  });
  assert.equal(graphics.commands.length, 0);
});
