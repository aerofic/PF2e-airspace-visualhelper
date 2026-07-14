import test from "node:test";
import assert from "node:assert/strict";
import { drawDashedLine, drawVerticalDashedLine } from "../src/projection-renderer.js";

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

test("draws bounded dashed segments along an inclined acrylic stand", () => {
  const graphics = new FakeGraphics();
  drawDashedLine(graphics, {
    startX: 20,
    startY: 10,
    endX: 60,
    endY: 90,
    dashLength: 9,
    gapLength: 5,
    width: 2,
    color: 0xffffff,
    alpha: 0.5
  });
  const points = graphics.commands.filter(command => ["moveTo", "lineTo"].includes(command[0]));
  assert.ok(points.length > 0);
  assert.deepEqual(points[0], ["moveTo", 20, 10]);
  for (const [, x, y] of points) {
    assert.ok(Number.isFinite(x) && Number.isFinite(y));
    assert.ok(x >= 20 && x <= 60);
    assert.ok(y >= 10 && y <= 90);
    assert.ok(Math.abs(((x - 20) * 2) - (y - 10)) < 0.000_001);
  }
});

test("caps extreme finite projection geometry at 512 dash segments", () => {
  const graphics = new FakeGraphics();
  drawDashedLine(graphics, {
    startX: 0,
    startY: 0,
    endX: 1_000_000_000_000,
    endY: 1_000_000_000_000,
    dashLength: Number.MIN_VALUE,
    gapLength: 0,
    width: 2,
    color: 0xffffff,
    alpha: 0.5
  });
  const moves = graphics.commands.filter(command => command[0] === "moveTo");
  const lines = graphics.commands.filter(command => command[0] === "lineTo");
  assert.equal(moves.length, 512);
  assert.equal(lines.length, 512);
  assert.ok(lines.flatMap(command => command.slice(1)).every(Number.isFinite));
});

test("rejects endpoints whose computed projection length is non-finite", () => {
  const graphics = new FakeGraphics();
  drawDashedLine(graphics, {
    startX: -Number.MAX_VALUE,
    startY: 0,
    endX: Number.MAX_VALUE,
    endY: 0,
    dashLength: 8,
    gapLength: 4,
    width: 2,
    color: 0xffffff,
    alpha: 0.5
  });
  assert.equal(graphics.commands.length, 0);
});
