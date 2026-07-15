import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateAmbientOffset,
  calculateAnimationDuration,
  calculateFlightPose,
  calculateHeightCurve,
  calculateVisualMetrics,
  easeInOutCosine,
  normalizeFlyingElevation,
  normalizeHudElevation,
  smootherStep
} from "../src/visual-math.js";

const base = {
  elevation: 60,
  gridSize: 100,
  gridDistance: 5,
  tokenWidth: 100,
  tokenHeight: 100,
  groundX: 50,
  groundY: 50,
  shadowOpacity: 0.65
};

test("normalizes invalid and non-flying elevations", () => {
  assert.equal(normalizeFlyingElevation(-5), 0);
  assert.equal(normalizeFlyingElevation(Number.NaN), 0);
  assert.equal(normalizeHudElevation(-15), -15);
  assert.equal(normalizeHudElevation(Number.POSITIVE_INFINITY), 0);
});

test("height response stays continuous above zero", () => {
  const zero = calculateVisualMetrics({ ...base, elevation: 0 });
  const tiny = calculateVisualMetrics({ ...base, elevation: Number.MIN_VALUE });
  assert.equal(zero.flying, false);
  assert.equal(zero.token.offsetY, 0);
  assert.equal(zero.shadow.alpha, 0);
  assert.equal(tiny.flying, true);
  assert.ok(tiny.token.offsetY < 0);
  assert.ok(tiny.shadow.alpha > 0);
  assert.ok(tiny.shadow.distance > 0);
});

test("lift and slight shadow drift grow to sixty feet while the silhouette shrinks", () => {
  const samples = [5, 20, 60, 120]
    .map(elevation => calculateVisualMetrics({ ...base, elevation }));
  for (let index = 1; index < samples.length; index += 1) {
    assert.ok(-samples[index].token.offsetY >= -samples[index - 1].token.offsetY);
    assert.ok(samples[index].shadow.distance >= samples[index - 1].shadow.distance);
    assert.ok(samples[index].shadow.projectionScale < samples[index - 1].shadow.projectionScale);
  }
});

test("raises the model exactly five percent per ten feet and caps at thirty percent", () => {
  const expected = new Map([[5, 2.5], [10, 5], [40, 20], [60, 30], [100, 30], [1000, 30]]);
  for (const [elevation, expectedLift] of expected) {
    const pose = calculateFlightPose({ ...base, elevation });
    assert.equal(pose.ground.x, 50);
    assert.equal(pose.ground.y, 50);
    assert.equal(pose.tokenOffset.x, 0);
    assert.equal(pose.lift, expectedLift);
    assert.equal(pose.tokenCenter.y, pose.ground.y - pose.lift);
  }
});

test("keeps the strong takeoff shadow only slightly displaced inside the original footprint", () => {
  for (const elevation of [5, 10, 40, 100, 1000]) {
    const metrics = calculateVisualMetrics({ ...base, elevation });
    const shadow = metrics.shadow;
    assert.equal(shadow.x, shadow.groundX);
    assert.equal(shadow.groundY, 50);
    assert.ok(shadow.y > shadow.groundY);
    assert.ok(shadow.distance > 0 && shadow.distance <= 4.5);
    assert.ok(shadow.alpha > 0.5);
    assert.ok(shadow.width * (1 + shadow.softness) <= 100);
    assert.ok(shadow.y + ((shadow.height * (1 + shadow.softness)) / 2) <= 100);
  }
});

test("contains no acrylic stand, base, connector, or landing-ring metrics", () => {
  const metrics = calculateVisualMetrics(base);
  for (const key of ["stand", "base", "connector", "projection", "liftGlow"]) {
    assert.equal(key in metrics, false);
  }
});

test("passes an irregular local Token center to the fixed shadow anchor", () => {
  const metrics = calculateVisualMetrics({ ...base, groundX: 43.25, groundY: 79.5 });
  assert.deepEqual(
    [metrics.shadow.groundX, metrics.shadow.groundY],
    [43.25, 79.5]
  );
  assert.equal(metrics.token.centerX, 43.25);
  assert.ok(metrics.token.centerY < 79.5);
});

test("all footprint shapes use the same percentage of their own height", () => {
  const offsets = [[100, 100], [200, 100], [100, 300], [250, 150]].map(([width, height]) => ({
    height,
    lift: -calculateVisualMetrics({ ...base, tokenWidth: width, tokenHeight: height }).token.offsetY
  }));
  assert.ok(offsets.every(({ height, lift }) => Math.abs((lift / height) - 0.3) < 1e-9));
});

test("airborne perspective scale and alpha remain subtle and monotonic", () => {
  const low = calculateVisualMetrics({ ...base, elevation: 5 });
  const high = calculateVisualMetrics({ ...base, elevation: 100 });
  assert.ok(low.token.scale >= 1 && high.token.scale >= low.token.scale);
  assert.ok(high.token.scale <= 1.025);
  assert.ok(high.token.alpha <= low.token.alpha);
  assert.ok(high.token.alpha >= 0.98);
});

test("smootherStep is bounded, monotonic, and stable outside its domain", () => {
  assert.equal(smootherStep(-1), 0);
  assert.equal(smootherStep(2), 1);
  assert.ok(smootherStep(0.25) < smootherStep(0.75));
  assert.deepEqual(calculateHeightCurve(0), { steps: 0, takeoff: 0, signal: 0, clearanceGrids: 0 });
});

test("zero elevation hides every flight visual", () => {
  const metrics = calculateVisualMetrics({ ...base, elevation: 0 });
  assert.equal(metrics.flying, false);
  assert.equal(metrics.token.offsetY, 0);
  assert.equal(metrics.shadow.alpha, 0);
  assert.equal(metrics.shadow.width, 0);
});

test("extreme and invalid geometry remains finite and bounded", () => {
  for (const overrides of [
    { elevation: Number.MAX_VALUE, gridSize: Number.MAX_VALUE, tokenWidth: Number.MAX_VALUE },
    { elevation: Number.NaN, gridSize: Number.NaN, shadowOpacity: Number.POSITIVE_INFINITY },
    { elevation: Number.MIN_VALUE, tokenHeight: Number.MIN_VALUE, groundY: Number.MAX_VALUE }
  ]) {
    const metrics = calculateVisualMetrics({ ...base, ...overrides });
    assertAllNumbersFinite(metrics);
    assert.ok(metrics.shadow.distance <= 8);
    assert.ok(Math.abs(metrics.token.offsetY) <= 300_000);
  }
});

test("removed legacy acrylic and distance options cannot change the visual", () => {
  const clean = calculateVisualMetrics(base);
  const legacy = calculateVisualMetrics({
    ...base,
    standOpacity: 1,
    projectionOpacity: 1,
    shadowDistanceMultiplier: Number.MAX_VALUE
  });
  assert.deepEqual(legacy, clean);
});

test("animation easing and duration are bounded", () => {
  assert.equal(easeInOutCosine(-1), 0);
  assert.equal(easeInOutCosine(2), 1);
  assert.ok(calculateAnimationDuration(0, 5) >= 260);
  assert.ok(calculateAnimationDuration(0, Number.MAX_VALUE) <= 650);
});

test("ambient bob remains synchronized, bounded, and reduced-motion aware", () => {
  const metrics = calculateVisualMetrics({ ...base, elevation: 100 });
  const moving = calculateAmbientOffset(1000, 0.4, metrics.token.bobAmplitude, 3200, false);
  assert.ok(Math.abs(moving) <= metrics.token.bobAmplitude);
  assert.equal(calculateAmbientOffset(1000, 0.4, metrics.token.bobAmplitude, 3200, true), 0);
  assert.ok(metrics.token.bobAmplitude < -metrics.token.offsetY);
});

function assertAllNumbersFinite(value) {
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value), `${value} is not finite`);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const nested of Object.values(value)) assertAllNumbersFinite(nested);
}
