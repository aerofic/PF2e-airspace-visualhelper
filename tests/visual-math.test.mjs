import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateAnimationDuration,
  calculateVisualMetrics,
  easeInOutCosine,
  normalizeFlyingElevation
} from "../src/visual-math.js";

const base = {
  gridSize: 100,
  gridDistance: 5,
  tokenWidth: 100,
  tokenHeight: 100,
  standOpacity: 0.4,
  shadowOpacity: 0.35,
  projectionOpacity: 0.42,
  shadowDistanceMultiplier: 1
};

test("normalizes invalid and non-flying elevations", () => {
  assert.equal(normalizeFlyingElevation(-10), 0);
  assert.equal(normalizeFlyingElevation(Number.NaN), 0);
  assert.equal(normalizeFlyingElevation(Number.POSITIVE_INFINITY), 0);
  assert.equal(normalizeFlyingElevation("60"), 60);
});

test("stand length and shadow distance grow with elevation", () => {
  const low = calculateVisualMetrics({ ...base, elevation: 10 });
  const medium = calculateVisualMetrics({ ...base, elevation: 60 });
  const high = calculateVisualMetrics({ ...base, elevation: 120 });
  assert.ok(low.stand.length < medium.stand.length);
  assert.ok(medium.stand.length < high.stand.length);
  assert.ok(low.shadow.y < medium.shadow.y);
  assert.ok(medium.shadow.y < high.shadow.y);
});

test("shadow becomes smaller and fainter with elevation", () => {
  const low = calculateVisualMetrics({ ...base, elevation: 10 });
  const high = calculateVisualMetrics({ ...base, elevation: 120 });
  assert.ok(high.shadow.radiusX < low.shadow.radiusX);
  assert.ok(high.shadow.alpha < low.shadow.alpha);
});

test("zero elevation hides all flight geometry", () => {
  const metrics = calculateVisualMetrics({ ...base, elevation: 0 });
  assert.equal(metrics.flying, false);
  assert.equal(metrics.stand.length, 0);
  assert.equal(metrics.shadow.alpha, 0);
  assert.equal(metrics.projection.alpha, 0);
});

test("zero stand opacity also removes the stand lift glow", () => {
  const metrics = calculateVisualMetrics({ ...base, elevation: 60, standOpacity: 0 });
  assert.equal(metrics.stand.opacity, 0);
  assert.equal(metrics.liftGlow.alpha, 0);
});

test("ground projection remains directly below the Token and fades with height", () => {
  const low = calculateVisualMetrics({ ...base, elevation: 10 });
  const high = calculateVisualMetrics({ ...base, elevation: 120 });
  assert.equal(low.projection.x, low.stand.centerX);
  assert.equal(high.projection.x, high.stand.centerX);
  assert.equal(low.projection.endY, low.stand.groundY);
  assert.ok(high.projection.endY > low.projection.endY);
  assert.ok(high.projection.alpha < low.projection.alpha);
});

test("grid fallbacks and extreme heights remain finite and bounded", () => {
  const metrics = calculateVisualMetrics({
    ...base,
    elevation: 1_000_000,
    gridSize: 0,
    gridDistance: 0
  });
  assert.ok(Number.isFinite(metrics.stand.length));
  assert.ok(metrics.stand.length <= 320);
  assert.ok(Number.isFinite(metrics.shadow.x));
});

test("shadow multiplier changes projection without changing the stand", () => {
  const near = calculateVisualMetrics({ ...base, elevation: 60, shadowDistanceMultiplier: 0.5 });
  const far = calculateVisualMetrics({ ...base, elevation: 60, shadowDistanceMultiplier: 2 });
  assert.equal(near.stand.length, far.stand.length);
  assert.ok(near.shadow.y < far.shadow.y);
});

test("animation easing and duration are bounded", () => {
  assert.equal(easeInOutCosine(0), 0);
  assert.equal(easeInOutCosine(1), 1);
  assert.ok(easeInOutCosine(0.25) < easeInOutCosine(0.75));
  assert.equal(calculateAnimationDuration(0, 0), 260);
  assert.equal(calculateAnimationDuration(0, 10_000), 650);
});
