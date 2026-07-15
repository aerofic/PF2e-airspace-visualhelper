import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAirspaceView,
  collectEntriesWithinRadius,
  formatHeight,
  sortAirspaceEntries
} from "../src/airspace-view.js";

const selected = { id: "anchor", name: "Anchor", elevation: 20, centerX: 0, centerY: 0 };

test("filters the local airspace by real Canvas radius without changing entries", () => {
  const entries = [
    selected,
    { id: "edge", elevation: 40, centerX: 300, centerY: 400 },
    { id: "outside", elevation: 60, centerX: 301, centerY: 400 }
  ];
  const result = collectEntriesWithinRadius(entries, selected, {
    gridSize: 100,
    radiusSpaces: 5
  });
  assert.deepEqual(result.map(entry => entry.id), ["anchor", "edge"]);
  assert.equal(result[1].distanceSpaces, 5);
  assert.equal("distanceSpaces" in entries[1], false, "source rows remain immutable");
});

test("projects actual X, Y, and elevation into a fixed isometric view", () => {
  const entries = collectEntriesWithinRadius([
    selected,
    { id: "east", name: "East", elevation: 20, centerX: 200, centerY: 0 },
    { id: "south", name: "South", elevation: 20, centerX: 0, centerY: 200 },
    { id: "high", name: "High", elevation: 80, centerX: 0, centerY: 0 },
    { id: "ground", name: "Ground", elevation: 0, centerX: 0, centerY: 0 }
  ], selected, { gridSize: 100, radiusSpaces: 8 });
  const view = buildAirspaceView(entries, { selectedId: selected.id, radiusSpaces: 8 });
  const at = id => view.nodes.find(node => node.id === id);

  assert.equal(at("ground").tokenY, at("ground").groundY);
  assert.equal(at("anchor").groundX, at("high").groundX);
  assert.equal(at("anchor").groundY, at("high").groundY);
  assert.ok(at("high").tokenY < at("anchor").tokenY);
  assert.equal(
    (at("anchor").groundY - at("anchor").tokenY) / 20,
    (at("high").groundY - at("high").tokenY) / 80,
    "all elevations share one literal vertical scale"
  );
  assert.ok(at("east").groundX > at("anchor").groundX);
  assert.ok(at("south").groundX < at("anchor").groundX);
  assert.ok(at("east").groundY > at("anchor").groundY);
  assert.ok(at("south").groundY > at("anchor").groundY);
});

test("keeps selected Token centered and responds continuously to range changes", () => {
  const entry = { ...selected, dxSpaces: 0, dySpaces: 0, distanceSpaces: 0 };
  const nearby = { id: "nearby", elevation: 20, dxSpaces: 4, dySpaces: 0, distanceSpaces: 4 };
  const narrow = buildAirspaceView([entry, nearby], { selectedId: selected.id, radiusSpaces: 4 });
  const wide = buildAirspaceView([entry, nearby], { selectedId: selected.id, radiusSpaces: 8 });
  const anchor = narrow.nodes.find(node => node.id === selected.id);
  const narrowNearby = narrow.nodes.find(node => node.id === "nearby");
  const wideNearby = wide.nodes.find(node => node.id === "nearby");

  assert.equal(anchor.groundX, narrow.centerX);
  assert.equal(anchor.groundY, narrow.groundCenterY);
  assert.ok(Math.abs(narrowNearby.groundX - narrow.centerX)
    > Math.abs(wideNearby.groundX - wide.centerX));
});

test("keeps extreme signed elevations finite and proportional", () => {
  const view = buildAirspaceView([
    { id: "high", elevation: Number.MAX_VALUE, dxSpaces: 0, dySpaces: 0 },
    { id: "low", elevation: -Number.MAX_VALUE, dxSpaces: 0, dySpaces: 0 }
  ]);
  assert.ok(Number.isFinite(view.verticalScale));
  assert.ok(view.nodes.every(node => [
    node.groundX,
    node.groundY,
    node.tokenX,
    node.tokenY,
    node.verticalLength
  ].every(Number.isFinite)));
});

test("sorts projected units back-to-front and formats exact heights", () => {
  const sorted = sortAirspaceEntries([
    { id: "front", groundY: 200, elevation: 0 },
    { id: "back-high", groundY: 100, elevation: 60 },
    { id: "back-low", groundY: 100, elevation: 10 }
  ]);
  assert.deepEqual(sorted.map(entry => entry.id), ["back-low", "back-high", "front"]);
  assert.equal(formatHeight(37.5), "37.5");
  assert.equal(formatHeight(Number.NaN), "0");
  assert.equal(formatHeight(Number.MAX_VALUE), String(Number.MAX_VALUE));
});
