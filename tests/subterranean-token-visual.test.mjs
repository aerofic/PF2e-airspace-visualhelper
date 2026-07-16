import test from "node:test";
import assert from "node:assert/strict";
import { SubterraneanTokenVisual, isSubterraneanElevation } from "../src/subterranean-token-visual.js";

class Point {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  set(x, y) { this.x = x; this.y = y; }
}

class Container {
  constructor() { this.children = []; this.parent = null; this.position = new Point(); this.visible = true; this.destroyed = false; }
  get x() { return this.position.x; }
  get y() { return this.position.y; }
  addChild(child) { child.removeFromParent?.(); child.parent = this; this.children.push(child); return child; }
  addChildAt(child, index) { child.removeFromParent?.(); child.parent = this; this.children.splice(index, 0, child); return child; }
  removeFromParent() { if (!this.parent) return; const index = this.parent.children.indexOf(this); if (index >= 0) this.parent.children.splice(index, 1); this.parent = null; }
  destroy() { this.removeFromParent(); this.destroyed = true; }
}

class Sprite extends Container {
  constructor() { super(); this.anchor = new Point(0.5, 0.5); this.texture = null; this.width = 0; this.height = 0; this.rotation = 0; }
}

class Graphics extends Container {
  constructor() { super(); this.commands = []; }
  clear() { this.commands = []; }
  lineStyle(...args) { this.commands.push(["lineStyle", ...args]); }
  drawShape(...args) { this.commands.push(["drawShape", ...args]); }
  drawRect(...args) { this.commands.push(["drawRect", ...args]); }
}

globalThis.PIXI = { Container, Sprite, Graphics };

function makeToken(elevation = -5) {
  const token = new Container();
  token.position.set(100, 200);
  token.document = { x: 100, y: 200, elevation, isSecret: false, getSize: () => ({ width: 80, height: 60 }) };
  token.center = { x: 140, y: 230 };
  token.mesh = new Sprite();
  token.mesh.texture = { destroyed: false, width: 80, height: 60 };
  token.mesh.width = 80;
  token.mesh.height = 60;
  token.mesh.anchor.set(0.25, 0.75);
  token.shape = { type: "rectangle" };
  token.isVisible = true;
  return token;
}

test("classifies only finite negative elevation as subterranean", () => {
  assert.equal(isSubterraneanElevation(-5), true);
  assert.equal(isSubterraneanElevation(0), false);
  assert.equal(isSubterraneanElevation(Infinity), false);
});

test("renders a neutral non-interactive underground state in a dedicated overlay", () => {
  const overlay = new Container();
  const token = makeToken(-5);
  token.visible = false;
  token.renderable = false;
  const originalHitArea = { contains: () => true };
  token.hitArea = originalHitArea;

  const visual = new SubterraneanTokenVisual(token, { parent: overlay });
  assert.strictEqual(visual.container.parent, overlay);
  assert.deepEqual(overlay.children, [visual.container]);
  assert.equal(visual.container.visible, true);
  assert.equal(visual.container.eventMode, "none");
  assert.equal(visual.sprite.visible, true);
  assert.strictEqual(visual.sprite.texture, token.mesh.texture);
  assert.equal(visual.sprite.tint, 0x909090);
  assert.equal(visual.sprite.alpha, 0.78);
  assert.equal(visual.sprite.filters, undefined);
  assert.equal(visual.graphics.visible, true);
  assert.deepEqual(visual.graphics.commands[0], ["lineStyle", { width: 3, color: 0xf0f0f0, alpha: 0.95 }]);
  assert.strictEqual(token.hitArea, originalHitArea);
  visual.destroy();
  assert.equal(overlay.children.length, 0);
});

test("hides without leaking and falls back while texture is unusable", () => {
  const objects = new Container();
  const token = makeToken(-10);
  objects.addChild(token);
  token.mesh.texture = { destroyed: false, valid: false, width: 80, height: 60 };
  const visual = new SubterraneanTokenVisual(token, { parent: objects });
  assert.equal(visual.sprite.visible, false);
  assert.equal(visual.graphics.visible, true);

  token.isVisible = false;
  visual.render();
  assert.equal(visual.container.visible, false);
  token.isVisible = true;
  token.document.elevation = 0;
  visual.render();
  assert.equal(visual.container.visible, false);
  visual.destroy();
});
