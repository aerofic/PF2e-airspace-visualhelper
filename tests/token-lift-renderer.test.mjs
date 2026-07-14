import test from "node:test";
import assert from "node:assert/strict";
import { TokenLiftRenderer } from "../src/token-lift-renderer.js";

class Point {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }

  set(x, y) {
    this.x = x;
    this.y = y;
  }
}

function makeToken(x = 50, y = 50) {
  const token = {
    baseX: x,
    baseY: y,
    mesh: { position: new Point(x, y), destroyed: false },
    tooltip: { position: new Point(50, -4), destroyed: false },
    levelIndicator: { position: new Point(50, -24), destroyed: false },
    nameplate: { position: new Point(50, 104), destroyed: false },
    bars: { position: new Point(0, 0), destroyed: false },
    effects: { position: new Point(0, 0), destroyed: false }
  };
  Object.defineProperty(token, "center", {
    get: () => ({ x: token.baseX, y: token.baseY })
  });
  return token;
}

test("reapplies a visual lift after core movement without changing the ground center", () => {
  const token = makeToken();
  const renderer = new TokenLiftRenderer(token);
  renderer.apply({ offsetX: -20, offsetY: -100 });
  assert.deepEqual([token.mesh.position.x, token.mesh.position.y], [30, -50]);
  assert.deepEqual([token.tooltip.position.x, token.tooltip.position.y], [30, -104]);

  token.baseX = 250;
  token.baseY = 150;
  token.mesh.position.set(250, 150);
  renderer.apply({ offsetX: -20, offsetY: -100 });
  assert.deepEqual([token.mesh.position.x, token.mesh.position.y], [230, 50]);
  assert.deepEqual([token.center.x, token.center.y], [250, 150]);

  renderer.restore();
  assert.deepEqual([token.mesh.position.x, token.mesh.position.y], [250, 150]);
  assert.deepEqual([token.tooltip.position.x, token.tooltip.position.y], [50, -4]);
});

test("yields to a later mesh writer without doubling or overwriting it", () => {
  const token = makeToken();
  const renderer = new TokenLiftRenderer(token);
  const pose = { offsetX: -20, offsetY: -100 };
  renderer.apply(pose);

  // Simulate a module whose later refreshToken hook adds five pixels.
  token.mesh.position.x += 5;
  renderer.apply(pose);
  assert.deepEqual([token.mesh.position.x, token.mesh.position.y], [35, -50]);

  // The value no longer exactly matches this module's write, so disabling and
  // teardown preserve it. A later writer may have used absolute positioning.
  renderer.apply(pose, { enabled: false });
  assert.deepEqual([token.mesh.position.x, token.mesh.position.y], [35, -50]);
  renderer.restore();
  assert.deepEqual([token.mesh.position.x, token.mesh.position.y], [35, -50]);
});

test("resumes ownership after a confirmed core position refresh", () => {
  const token = makeToken();
  const renderer = new TokenLiftRenderer(token);
  const pose = { offsetX: -20, offsetY: -100 };
  renderer.apply(pose);
  token.mesh.position.x += 5;
  renderer.apply(pose);

  token.mesh.position.set(token.center.x, token.center.y);
  renderer.apply(pose, { meshBaseRefreshed: true });
  assert.deepEqual([token.mesh.position.x, token.mesh.position.y], [30, -50]);
  renderer.apply(pose, { enabled: false });
  assert.deepEqual([token.mesh.position.x, token.mesh.position.y], [50, 50]);
});

test("moves native Token UI with the art and rebases it after a core size refresh", () => {
  const token = makeToken();
  const renderer = new TokenLiftRenderer(token);
  const pose = { offsetX: -15, offsetY: -80 };
  renderer.apply(pose);

  assert.deepEqual([token.tooltip.position.x, token.tooltip.position.y], [35, -84]);
  assert.deepEqual([token.levelIndicator.position.x, token.levelIndicator.position.y], [35, -104]);
  assert.deepEqual([token.nameplate.position.x, token.nameplate.position.y], [35, 24]);
  assert.deepEqual([token.bars.position.x, token.bars.position.y], [-15, -80]);
  assert.deepEqual([token.effects.position.x, token.effects.position.y], [-15, -80]);

  // _refreshSize resets these native local positions before refreshToken.
  token.tooltip.position.set(60, -6);
  token.levelIndicator.position.set(60, -28);
  token.nameplate.position.set(60, 126);
  renderer.apply(pose, { uiBaseRefreshed: true });
  assert.deepEqual([token.tooltip.position.x, token.tooltip.position.y], [45, -86]);
  assert.deepEqual([token.levelIndicator.position.x, token.levelIndicator.position.y], [45, -108]);
  assert.deepEqual([token.nameplate.position.x, token.nameplate.position.y], [45, 46]);

  renderer.restore();
  assert.deepEqual([token.tooltip.position.x, token.tooltip.position.y], [60, -6]);
  assert.deepEqual([token.levelIndicator.position.x, token.levelIndicator.position.y], [60, -28]);
  assert.deepEqual([token.nameplate.position.x, token.nameplate.position.y], [60, 126]);
});

test("accepts native tooltip content layout changes which retain the lift", () => {
  const token = makeToken();
  const renderer = new TokenLiftRenderer(token);
  const pose = { offsetX: -15, offsetY: -80 };
  renderer.apply(pose);

  // _refreshTooltip derives the indicator y from an already-lifted tooltip.
  token.levelIndicator.position.y -= 6;
  renderer.apply(pose, { uiRetainsOwnedOffset: true });
  assert.deepEqual([token.levelIndicator.position.x, token.levelIndicator.position.y], [35, -110]);
  renderer.restore();
  assert.deepEqual([token.levelIndicator.position.x, token.levelIndicator.position.y], [50, -30]);
});

test("does not mistake a third-party tooltip write for core indicator layout", () => {
  const token = makeToken();
  const renderer = new TokenLiftRenderer(token);
  const pose = { offsetX: -15, offsetY: -80 };
  renderer.apply(pose);

  token.tooltip.position.set(40, -70);
  renderer.apply(pose, { uiRetainsOwnedOffset: true });
  assert.deepEqual([token.tooltip.position.x, token.tooltip.position.y], [40, -70]);
  renderer.restore();
  assert.deepEqual([token.tooltip.position.x, token.tooltip.position.y], [40, -70]);
});

test("does not treat bars or effects containers as core size-reset UI", () => {
  const token = makeToken();
  const renderer = new TokenLiftRenderer(token);
  const pose = { offsetX: -15, offsetY: -80 };
  renderer.apply(pose);

  token.bars.position.set(-8, -70);
  token.effects.position.set(-12, -74);
  renderer.apply(pose, { uiBaseRefreshed: true });
  assert.deepEqual([token.bars.position.x, token.bars.position.y], [-8, -70]);
  assert.deepEqual([token.effects.position.x, token.effects.position.y], [-12, -74]);
  renderer.restore();
  assert.deepEqual([token.bars.position.x, token.bars.position.y], [-8, -70]);
  assert.deepEqual([token.effects.position.x, token.effects.position.y], [-12, -74]);
});

test("restores replaced meshes and does not overwrite a later external position", () => {
  const token = makeToken();
  const renderer = new TokenLiftRenderer(token);
  const firstMesh = token.mesh;
  renderer.apply({ offsetX: -10, offsetY: -80 });

  token.mesh = { position: new Point(50, 50), destroyed: false };
  renderer.apply({ offsetX: -10, offsetY: -80 });
  assert.deepEqual([firstMesh.position.x, firstMesh.position.y], [50, 50]);
  assert.deepEqual([token.mesh.position.x, token.mesh.position.y], [40, -30]);

  token.mesh.position.set(777, 888);
  renderer.restore();
  assert.deepEqual([token.mesh.position.x, token.mesh.position.y], [777, 888]);
});

test("preserves a nearby absolute mesh position written after this module", () => {
  const token = makeToken();
  const renderer = new TokenLiftRenderer(token);
  const pose = { offsetX: -20, offsetY: -100 };
  renderer.apply(pose);

  token.mesh.position.set(40, -40);
  renderer.apply(pose);
  assert.deepEqual([token.mesh.position.x, token.mesh.position.y], [40, -40]);
  renderer.restore();
  assert.deepEqual([token.mesh.position.x, token.mesh.position.y], [40, -40]);
});
