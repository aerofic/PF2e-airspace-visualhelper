import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAltitudeAxis,
  filterAltitudeEntries,
  formatFeet,
  sortAltitudeEntries
} from "../src/altitude-axis.js";

const entries = [
  { id: "a", name: "Fifteen", elevation: 15 },
  { id: "b", name: "Thirty Five", elevation: 35 },
  { id: "c", name: "Forty", elevation: 40 },
  { id: "d", name: "Seventy Five", elevation: 75 }
];

test("sorts every real elevation from high to low without 20 ft buckets", () => {
  assert.deepEqual(sortAltitudeEntries(entries).map(entry => entry.elevation), [75, 40, 35, 15]);
});

test("applies the simple all, ground, and air filters", () => {
  const mixed = [...entries, { id: "ground", name: "Ground", elevation: 0 }, { id: "below", name: "Below", elevation: -5 }];
  assert.equal(filterAltitudeEntries(mixed, "all").length, 6);
  assert.deepEqual(filterAltitudeEntries(mixed, "ground").map(entry => entry.id), ["ground"]);
  assert.deepEqual(filterAltitudeEntries(mixed, "air").map(entry => entry.id), ["a", "b", "c", "d"]);
});

test("uses compact relative levels and keeps exact heights in independent nodes", () => {
  const axis = buildAltitudeAxis([...entries, { id: "e", name: "Another Forty", elevation: 40 }]);
  const at = id => axis.nodes.find(node => node.id === id).axisY;
  assert.equal(at("c") - at("d"), 32);
  assert.equal(at("b") - at("c"), 32);
  assert.equal(at("a") - at("b"), 32);
  assert.equal(at("e"), at("c"));
  assert.equal(axis.nodes.filter(node => node.elevation === 40).length, 2);
  assert.equal(axis.levelCount, 4);
  assert.deepEqual(axis.ticks.map(tick => tick.elevation), [75, 40, 35, 15]);
});

test("keeps twenty equal-height Tokens in independent non-overlapping lanes", () => {
  const crowded = Array.from({ length: 20 }, (_, index) => ({
    id: `ground-${index}`,
    name: `Ground ${index}`,
    elevation: 0
  }));
  const axis = buildAltitudeAxis(crowded);
  assert.equal(new Set(axis.nodes.map(node => node.lane)).size, 20);
  assert.equal(Math.max(...axis.nodes.map(node => node.lane)), 19);
  assert.equal(new Set(axis.nodes.map(node => node.axisY)).size, 1);
  assert.ok(axis.width >= 2_800);
});

test("extreme signed elevations consume two relative levels instead of absolute-distance pixels", () => {
  const axis = buildAltitudeAxis([
    { id: "high", name: "High", elevation: Number.MAX_VALUE },
    { id: "low", name: "Low", elevation: -Number.MAX_VALUE }
  ]);
  assert.equal(axis.ticks.length, 2);
  assert.equal(axis.levelCount, 2);
  assert.equal(axis.height, 68);
  assert.ok(Number.isFinite(axis.height));
  assert.ok(axis.nodes.every(node => Number.isFinite(node.axisY)));
});

test("does not impose a height cap when the Scene genuinely contains many levels", () => {
  const crowded = Array.from({ length: 1_000 }, (_, index) => ({
    id: `level-${index}`,
    name: `Level ${index}`,
    elevation: index * 5
  }));
  const axis = buildAltitudeAxis(crowded);
  assert.equal(axis.levelCount, 1_000);
  assert.equal(axis.ticks.length, 1_000);
  assert.ok(axis.height > 24_000);
});

test("formats exact non-bucketed height values", () => {
  assert.equal(formatFeet(35), "35");
  assert.equal(formatFeet(37.5), "37.5");
  assert.equal(formatFeet(Number.NaN), "0");
  assert.equal(formatFeet(Number.MAX_VALUE), String(Number.MAX_VALUE));
  assert.doesNotMatch(formatFeet(Number.MAX_VALUE), /Infinity/);
});
