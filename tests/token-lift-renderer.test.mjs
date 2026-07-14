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
    mesh: {
      position: new Point(x, y),
      scale: new Point(1, 1),
      alpha: 0.8,
      destroyed: false
    },
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

function assertClose(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) <= 0.000001, message ?? `${actual} != ${expected}`);
}

test("reapplies a visual lift after core movement without changing the ground center", () => {
  const token = makeToken();
  const renderer = new TokenLiftRenderer(token);
  renderer.apply({ offsetX: -20, offsetY: -100 });
  assert.deepEqual([token.mesh.position.x, token.mesh.position.y], [30, -50]);
  assert.deepEqual([token.tooltip.position.x, token.tooltip.position.y], [30, -104]);
  assert.deepEqual([token.levelIndicator.position.x, token.levelIndicator.position.y], [30, -124]);

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

test("composes and reacquires exact Z Scatter bases without claiming its offset", () => {
  const token = makeToken();
  const renderer = new TokenLiftRenderer(token);
  const layout = {
    active: true,
    supported: true,
    offsetX: 10,
    offsetY: 5,
    bases: {
      mesh: { x: 60, y: 55 },
      tooltip: { x: 60, y: 3 },
      nameplate: { x: 60, y: 111 },
      bars: { x: 10, y: 5 },
      effects: { x: 10, y: 5 }
    }
  };

  // Simulate Z Scatter's exact visual write before this module composes lift.
  token.mesh.position.set(60, 55);
  token.tooltip.position.set(60, 3);
  token.nameplate.position.set(60, 111);
  token.bars.position.set(10, 5);
  token.effects.position.set(10, 5);
  renderer.apply({
    offsetX: -20,
    offsetY: -50
  }, { externalLayout: layout });

  assert.deepEqual([token.mesh.position.x, token.mesh.position.y], [40, 5]);
  assert.deepEqual([token.tooltip.position.x, token.tooltip.position.y], [40, -47]);
  assert.deepEqual([token.nameplate.position.x, token.nameplate.position.y], [40, 61]);
  assert.deepEqual([token.bars.position.x, token.bars.position.y], [-10, -45]);
  assert.deepEqual([token.levelIndicator.position.x, token.levelIndicator.position.y], [40, -69]);

  // Z Scatter may write outside refreshToken. The low-frequency compatibility
  // pass recognizes only these exact bases and safely reapplies the lift.
  token.mesh.position.set(60, 55);
  token.tooltip.position.set(60, 3);
  token.nameplate.position.set(60, 111);
  token.bars.position.set(10, 5);
  token.effects.position.set(10, 5);
  renderer.applyAmbient(1, layout);
  assert.deepEqual([token.mesh.position.x, token.mesh.position.y], [40, 6]);
  assert.deepEqual([token.tooltip.position.x, token.tooltip.position.y], [40, -46]);

  renderer.restore();
  assert.deepEqual([token.mesh.position.x, token.mesh.position.y], [60, 55]);
  assert.deepEqual([token.tooltip.position.x, token.tooltip.position.y], [60, 3]);
  assert.deepEqual([token.nameplate.position.x, token.nameplate.position.y], [60, 111]);
  assert.deepEqual([token.bars.position.x, token.bars.position.y], [10, 5]);
  assert.deepEqual([token.levelIndicator.position.x, token.levelIndicator.position.y], [50, -24]);
});

test("recomposes lifted labels when core refresh runs before Z Scatter", () => {
  const token = makeToken();
  const renderer = new TokenLiftRenderer(token);
  const pose = { offsetX: -20, offsetY: -50 };
  const layout = {
    active: true,
    supported: true,
    offsetX: 10,
    offsetY: 5,
    bases: {
      mesh: { x: 60, y: 55 },
      tooltip: { x: 60, y: 3 },
      nameplate: { x: 60, y: 111 },
      bars: { x: 10, y: 5 },
      effects: { x: 10, y: 5 }
    }
  };

  token.mesh.position.set(60, 55);
  token.tooltip.position.set(60, 3);
  token.nameplate.position.set(60, 111);
  renderer.apply(pose, { externalLayout: layout });
  assert.deepEqual([token.tooltip.position.x, token.tooltip.position.y], [40, -47]);

  // Enabling Z Scatter calls Token.refresh() for every Token. Core size and
  // transform work can run before Z Scatter's refreshToken hook, temporarily
  // restoring native ground positions while the detected scatter layout is
  // still authoritative.
  token.mesh.position.set(50, 50);
  token.tooltip.position.set(50, -4);
  token.levelIndicator.position.set(50, -24);
  token.nameplate.position.set(50, 104);
  renderer.apply(pose, {
    externalLayout: layout,
    meshBaseRefreshed: true,
    uiBaseRefreshed: true
  });

  assert.deepEqual([token.mesh.position.x, token.mesh.position.y], [40, 5]);
  assert.deepEqual([token.tooltip.position.x, token.tooltip.position.y], [40, -47]);
  assert.deepEqual([token.levelIndicator.position.x, token.levelIndicator.position.y], [40, -69]);
  assert.deepEqual([token.nameplate.position.x, token.nameplate.position.y], [40, 61]);
  renderer.restore();
  assert.deepEqual([token.mesh.position.x, token.mesh.position.y], [60, 55]);
  assert.deepEqual([token.tooltip.position.x, token.tooltip.position.y], [60, 3]);
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

test("moves native elevation labels with the artwork and rebases core layout", () => {
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

test("keeps the Level indicator above lifted artwork through tooltip refreshes", () => {
  const token = makeToken();
  const renderer = new TokenLiftRenderer(token);
  const pose = { offsetX: -15, offsetY: -80 };
  renderer.apply(pose);

  token.tooltip.position.set(63, -7);
  token.levelIndicator.position.y -= 6;
  renderer.apply(pose, { uiRetainsOwnedOffset: true });
  assert.deepEqual([token.tooltip.position.x, token.tooltip.position.y], [63, -7]);
  assert.deepEqual([token.levelIndicator.position.x, token.levelIndicator.position.y], [35, -110]);
  renderer.restore();
  assert.deepEqual([token.tooltip.position.x, token.tooltip.position.y], [63, -7]);
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

test("composes ambient motion into artwork UI and native elevation-label positions", () => {
  const token = makeToken();
  const renderer = new TokenLiftRenderer(token);
  renderer.apply({
    offsetX: -10,
    offsetY: -30,
    ambientOffsetY: 2
  });

  assert.deepEqual([token.mesh.position.x, token.mesh.position.y], [40, 22]);
  assert.deepEqual([token.tooltip.position.x, token.tooltip.position.y], [40, -32]);
  assert.deepEqual([token.levelIndicator.position.x, token.levelIndicator.position.y], [40, -52]);
  assert.deepEqual([token.nameplate.position.x, token.nameplate.position.y], [40, 76]);
  assert.deepEqual([token.bars.position.x, token.bars.position.y], [-10, -28]);
  assert.deepEqual([token.effects.position.x, token.effects.position.y], [-10, -28]);

  renderer.restore();
  assert.deepEqual([token.mesh.position.x, token.mesh.position.y], [50, 50]);
  assert.deepEqual([token.tooltip.position.x, token.tooltip.position.y], [50, -4]);
  assert.deepEqual([token.levelIndicator.position.x, token.levelIndicator.position.y], [50, -24]);
  assert.deepEqual([token.nameplate.position.x, token.nameplate.position.y], [50, 104]);
});

test("multiplies positive and negative core scale axes and attenuates core alpha", () => {
  const token = makeToken();
  token.mesh.scale.set(-2, 3);
  token.mesh.alpha = 0.6;
  const renderer = new TokenLiftRenderer(token);

  renderer.apply({ scale: 1.25, alpha: 0.75 });
  assert.deepEqual([token.mesh.scale.x, token.mesh.scale.y], [-2.5, 3.75]);
  assertClose(token.mesh.alpha, 0.45);

  renderer.restore();
  assert.deepEqual([token.mesh.scale.x, token.mesh.scale.y], [-2, 3]);
  assertClose(token.mesh.alpha, 0.6);
});

test("clamps visual alpha so it cannot increase the core-authored opacity", () => {
  const token = makeToken();
  token.mesh.alpha = 0.4;
  const renderer = new TokenLiftRenderer(token);

  renderer.apply({ alpha: 2 });
  assertClose(token.mesh.alpha, 0.4);

  renderer.apply({ alpha: -1 });
  assertClose(token.mesh.alpha, 0);

  renderer.apply({ enabled: false });
  assertClose(token.mesh.alpha, 0.4);
});

test("position, scale, and alpha yield independently to later writers", () => {
  const token = makeToken();
  const renderer = new TokenLiftRenderer(token);
  const pose = { offsetX: -10, offsetY: -30, scale: 1.2, alpha: 0.75 };
  renderer.apply(pose);

  token.mesh.scale.set(7, -9);
  renderer.apply(pose);
  assert.deepEqual([token.mesh.position.x, token.mesh.position.y], [40, 20]);
  assert.deepEqual([token.mesh.scale.x, token.mesh.scale.y], [7, -9]);
  assertClose(token.mesh.alpha, 0.6);

  token.mesh.alpha = 0.37;
  token.mesh.position.set(123, 456);
  renderer.apply(pose);
  assert.deepEqual([token.mesh.position.x, token.mesh.position.y], [123, 456]);
  assert.deepEqual([token.mesh.scale.x, token.mesh.scale.y], [7, -9]);
  assertClose(token.mesh.alpha, 0.37);

  renderer.restore();
  assert.deepEqual([token.mesh.position.x, token.mesh.position.y], [123, 456]);
  assert.deepEqual([token.mesh.scale.x, token.mesh.scale.y], [7, -9]);
  assertClose(token.mesh.alpha, 0.37);
});

test("rebases scale and alpha only after their confirmed core refresh flags", () => {
  const token = makeToken();
  const renderer = new TokenLiftRenderer(token);
  const pose = { scale: 1.1, alpha: 0.8 };
  renderer.apply(pose);

  token.mesh.scale.set(-4, 5);
  token.mesh.alpha = 0.4;
  renderer.apply(pose, {
    meshScaleBaseRefreshed: true,
    meshAlphaBaseRefreshed: true
  });
  assertClose(token.mesh.scale.x, -4.4);
  assertClose(token.mesh.scale.y, 5.5);
  assertClose(token.mesh.alpha, 0.32);

  renderer.restore();
  assert.deepEqual([token.mesh.scale.x, token.mesh.scale.y], [-4, 5]);
  assertClose(token.mesh.alpha, 0.4);
});

test("authoritative core refresh rebases even when its value equals the last visual write", () => {
  const token = makeToken();
  const renderer = new TokenLiftRenderer(token);
  const pose = { offsetX: -10, scale: 1.2, alpha: 0.5 };
  renderer.apply(pose);
  assert.deepEqual([token.mesh.position.x, token.mesh.position.y], [40, 50]);
  assert.deepEqual([token.mesh.scale.x, token.mesh.scale.y], [1.2, 1.2]);
  assertClose(token.mesh.alpha, 0.4);
  assert.deepEqual([token.tooltip.position.x, token.tooltip.position.y], [40, -4]);

  // Core writes new bases which happen to equal every previous module value.
  token.baseX = 40;
  token.mesh.position.set(40, 50);
  token.mesh.scale.set(1.2, 1.2);
  token.mesh.alpha = 0.4;
  token.tooltip.position.set(40, -4);
  renderer.apply(pose, {
    meshBaseRefreshed: true,
    meshScaleBaseRefreshed: true,
    meshAlphaBaseRefreshed: true,
    uiBaseRefreshed: true
  });

  assert.deepEqual([token.mesh.position.x, token.mesh.position.y], [30, 50]);
  assert.deepEqual([token.mesh.scale.x, token.mesh.scale.y], [1.44, 1.44]);
  assertClose(token.mesh.alpha, 0.2);
  assert.deepEqual([token.tooltip.position.x, token.tooltip.position.y], [30, -4]);
  renderer.restore();
  assert.deepEqual([token.mesh.position.x, token.mesh.position.y], [40, 50]);
  assert.deepEqual([token.mesh.scale.x, token.mesh.scale.y], [1.2, 1.2]);
  assertClose(token.mesh.alpha, 0.4);
  assert.deepEqual([token.tooltip.position.x, token.tooltip.position.y], [40, -4]);
});

test("restores all owned pose components on mesh replacement", () => {
  const token = makeToken();
  const renderer = new TokenLiftRenderer(token);
  const firstMesh = token.mesh;
  renderer.apply({ offsetX: -10, offsetY: -20, scale: 1.25, alpha: 0.5 });

  token.mesh = {
    position: new Point(80, 90),
    scale: new Point(-3, 2),
    alpha: 0.6,
    destroyed: false
  };
  token.baseX = 80;
  token.baseY = 90;
  renderer.apply({ offsetX: -10, offsetY: -20, scale: 1.25, alpha: 0.5 });

  assert.deepEqual([firstMesh.position.x, firstMesh.position.y], [50, 50]);
  assert.deepEqual([firstMesh.scale.x, firstMesh.scale.y], [1, 1]);
  assertClose(firstMesh.alpha, 0.8);
  assert.deepEqual([token.mesh.position.x, token.mesh.position.y], [70, 70]);
  assert.deepEqual([token.mesh.scale.x, token.mesh.scale.y], [-3.75, 2.5]);
  assertClose(token.mesh.alpha, 0.3);

  renderer.restore();
  assert.deepEqual([token.mesh.position.x, token.mesh.position.y], [80, 90]);
  assert.deepEqual([token.mesh.scale.x, token.mesh.scale.y], [-3, 2]);
  assertClose(token.mesh.alpha, 0.6);
});
