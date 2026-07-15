import test from "node:test";
import assert from "node:assert/strict";
import {
  ZScatterCompatibility,
  isZScatterActive,
  readShapeTranslation
} from "../src/z-scatter-compatibility.js";

class Rectangle {
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

globalThis.game = {
  modules: new Map([["z-scatter", { active: true }]])
};

function makeToken() {
  const shape = new Rectangle(0, 0, 100, 100);
  return {
    x: 200,
    y: 300,
    w: 100,
    h: 100,
    center: { x: 250, y: 350 },
    shape,
    hitArea: new Rectangle(15, -8, 100, 100),
    animationContexts: new Map(),
    document: { getSize: () => ({ width: 100, height: 100 }) }
  };
}

test("detects Z Scatter and derives supported shape translations", () => {
  assert.equal(isZScatterActive(), true);
  assert.deepEqual(
    readShapeTranslation(new Rectangle(0, 0, 100, 100), new Rectangle(15, -8, 100, 100)),
    { x: 15, y: -8 }
  );
  assert.equal(
    readShapeTranslation(new Rectangle(0, 0, 100, 100), new Rectangle(15, -8, 90, 100)),
    null
  );
});

test("preserves the scattered base and adds a selectable lifted-art area", () => {
  const token = makeToken();
  const scatteredHitArea = token.hitArea;
  const adapter = new ZScatterCompatibility(token);

  assert.equal(adapter.sync({ liftX: -20, liftY: -45 }), true);
  assert.equal(adapter.state.supported, true);
  assert.deepEqual([adapter.state.offsetX, adapter.state.offsetY], [15, -8]);
  assert.deepEqual(adapter.state.bases.mesh, { x: 265, y: 342 });
  assert.equal(token.hitArea.contains(20, 0), true, "scattered Token base should stay selectable");
  assert.equal(token.hitArea.contains(0, -45), true, "visibly lifted Token art should also be selectable");
  assert.equal(token.hitArea.contains(500, 500), false);

  adapter.destroy();
  assert.strictEqual(token.hitArea, scatteredHitArea);
});

test("adds lifted-art selection when Z Scatter leaves different elevations at zero offset", () => {
  const token = makeToken();
  token.hitArea = token.shape;
  const originalHitArea = token.hitArea;
  const adapter = new ZScatterCompatibility(token);

  adapter.sync({ liftX: -20, liftY: -45 });
  assert.equal(adapter.state.supported, true);
  assert.deepEqual([adapter.state.offsetX, adapter.state.offsetY], [0, 0]);
  assert.equal(token.hitArea.contains(50, 50), true, "ground footprint should remain selectable");
  assert.equal(token.hitArea.contains(30, -20), true, "lifted art should be selectable without scatter");

  adapter.destroy();
  assert.strictEqual(token.hitArea, originalHitArea);
});

test("reacquires an exact later Z Scatter write but yields to unknown hit areas", () => {
  const token = makeToken();
  const adapter = new ZScatterCompatibility(token);
  adapter.sync({ liftX: -20, liftY: -45 });

  const nextScatter = new Rectangle(-12, 9, 100, 100);
  token.hitArea = nextScatter;
  assert.equal(adapter.sync({ liftX: -20, liftY: -45 }), true);
  assert.deepEqual([adapter.state.offsetX, adapter.state.offsetY], [-12, 9]);

  const thirdPartyHitArea = { contains: () => true, kind: "custom" };
  token.hitArea = thirdPartyHitArea;
  adapter.sync({ liftX: -20, liftY: -45 });
  assert.equal(adapter.state.supported, false);
  assert.strictEqual(token.hitArea, thirdPartyHitArea);
  adapter.destroy();
  assert.strictEqual(token.hitArea, thirdPartyHitArea);
});

test("suspends composition during core movement and restores Z Scatter ownership", () => {
  const token = makeToken();
  const scatteredHitArea = token.hitArea;
  const adapter = new ZScatterCompatibility(token);
  adapter.sync({ liftX: -20, liftY: -45 });

  token.animationContexts.set("movement", { to: { x: 300, y: 300 } });
  adapter.sync({ liftX: -20, liftY: -45 });
  assert.equal(adapter.state.active, false);
  assert.equal(adapter.state.supported, true);
  assert.equal(adapter.state.suspended, true);
  assert.deepEqual([adapter.state.offsetX, adapter.state.offsetY], [0, 0]);
  assert.deepEqual(adapter.state.bases.mesh, { x: 250, y: 350 });
  assert.deepEqual(adapter.state.bases.tooltip, { x: 50, y: -2 });
  assert.strictEqual(token.hitArea, scatteredHitArea);
});
