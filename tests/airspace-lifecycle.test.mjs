import test from "node:test";
import assert from "node:assert/strict";
import {
  reconcileAirspaceAvailability,
  resetAirspaceForScene
} from "../src/airspace-lifecycle.js";

function makeAirspace({ rendered = false } = {}) {
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
  enableAirspace: true
});

test("keeps an available airspace panel closed until its side button is clicked", async () => {
  const airspace = makeAirspace();
  await reconcileAirspaceAvailability(airspace, AVAILABLE);
  assert.equal(airspace.rendered, false);
  assert.deepEqual(airspace.renderCalls, []);
  assert.deepEqual(airspace.refreshCalls, []);
});

test("refreshes an already open panel without opening another window", async () => {
  const airspace = makeAirspace({ rendered: true });
  await reconcileAirspaceAvailability(airspace, AVAILABLE);
  assert.deepEqual(airspace.refreshCalls, [{ immediate: true, includeControls: true }]);
  assert.deepEqual(airspace.renderCalls, []);
});

test("closes an open panel when disabled", async () => {
  const airspace = makeAirspace({ rendered: true });
  await reconcileAirspaceAvailability(airspace, { ...AVAILABLE, enableAirspace: false });
  assert.equal(airspace.rendered, false);
  assert.deepEqual(airspace.closeCalls, [{ animate: false }]);
});

test("closes a carried panel whenever a new Scene becomes ready", async () => {
  const airspace = makeAirspace({ rendered: true });
  await resetAirspaceForScene(airspace);
  assert.equal(airspace.rendered, false);
  assert.deepEqual(airspace.closeCalls, [{ animate: false }]);
});
