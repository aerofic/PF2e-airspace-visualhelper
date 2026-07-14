import test from "node:test";
import assert from "node:assert/strict";
import {
  reconcileHudAvailability,
  resetHudForScene
} from "../src/hud-lifecycle.js";

function makeHud({ rendered = false } = {}) {
  return {
    rendered,
    closeCalls: [],
    refreshCalls: [],
    renderCalls: [],
    async close(options) {
      this.closeCalls.push(options);
      this.rendered = false;
    },
    requestRefresh(options) {
      this.refreshCalls.push(options);
    },
    async render(options) {
      this.renderCalls.push(options);
      this.rendered = true;
    }
  };
}

const AVAILABLE = Object.freeze({
  moduleReady: true,
  canvasReady: true,
  enabled: true,
  enableAltitudeHud: true
});

test("keeps an available HUD closed until the user explicitly opens it", async () => {
  const hud = makeHud();
  await reconcileHudAvailability(hud, AVAILABLE);

  assert.equal(hud.rendered, false);
  assert.deepEqual(hud.renderCalls, []);
  assert.deepEqual(hud.refreshCalls, []);
  assert.deepEqual(hud.closeCalls, []);
});

test("refreshes an already user-opened HUD without creating a new window", async () => {
  const hud = makeHud({ rendered: true });
  await reconcileHudAvailability(hud, AVAILABLE);

  assert.deepEqual(hud.refreshCalls, [{ immediate: true }]);
  assert.deepEqual(hud.renderCalls, []);
  assert.deepEqual(hud.closeCalls, []);
});

test("closes an open HUD when its module setting becomes unavailable", async () => {
  const hud = makeHud({ rendered: true });
  await reconcileHudAvailability(hud, { ...AVAILABLE, enableAltitudeHud: false });

  assert.equal(hud.rendered, false);
  assert.deepEqual(hud.closeCalls, [{ animate: false }]);
  assert.deepEqual(hud.renderCalls, []);
});

test("closes a carried HUD whenever a new Scene Canvas becomes ready", async () => {
  const hud = makeHud({ rendered: true });
  await resetHudForScene(hud);

  assert.equal(hud.rendered, false);
  assert.deepEqual(hud.closeCalls, [{ animate: false }]);
  assert.deepEqual(hud.renderCalls, []);
});
