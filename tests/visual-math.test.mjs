import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateAnimationDuration,
  calculateFlightPose,
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

test("lift, stand length, and bounded shadow drift grow with elevation", () => {
  const low = calculateVisualMetrics({ ...base, elevation: 10 });
  const medium = calculateVisualMetrics({ ...base, elevation: 60 });
  const high = calculateVisualMetrics({ ...base, elevation: 120 });
  assert.ok(low.token.offsetY > medium.token.offsetY);
  assert.ok(medium.token.offsetY > high.token.offsetY);
  assert.ok(low.stand.length < medium.stand.length);
  assert.ok(medium.stand.length < high.stand.length);
  assert.ok(low.shadow.y < medium.shadow.y);
  assert.ok(medium.shadow.y < high.shadow.y);
});

test("keeps the acrylic base at the Token footprint while leaning the art up-left", () => {
  for (const elevation of [10, 60, 120]) {
    const metrics = calculateVisualMetrics({ ...base, elevation });
    assert.deepEqual([metrics.base.x, metrics.base.y], [50, 50]);
    assert.deepEqual([metrics.stand.baseX, metrics.stand.baseY], [50, 50]);
    assert.deepEqual([metrics.projection.endX, metrics.projection.endY], [50, 50]);
    assert.ok(metrics.token.offsetX < 0);
    assert.ok(metrics.token.offsetY < 0);
    assert.ok(metrics.stand.topX < metrics.stand.baseX);
    assert.ok(metrics.stand.topY < metrics.stand.baseY);
    assert.deepEqual(
      [metrics.stand.topX, metrics.stand.topY],
      [metrics.token.centerX, metrics.token.centerY]
    );
  }
});

test("passes an irregular local Token center through every fixed ground anchor", () => {
  const metrics = calculateVisualMetrics({
    ...base,
    elevation: 60,
    tokenWidth: 120,
    tokenHeight: 180,
    groundX: 43.25,
    groundY: 79.5
  });
  assert.deepEqual([metrics.base.x, metrics.base.y], [43.25, 79.5]);
  assert.deepEqual([metrics.stand.baseX, metrics.stand.baseY], [43.25, 79.5]);
  assert.deepEqual([metrics.projection.endX, metrics.projection.endY], [43.25, 79.5]);
  assert.deepEqual(
    [metrics.stand.topX, metrics.stand.topY],
    [metrics.token.centerX, metrics.token.centerY]
  );
});

test("uses a true twelve-degree stand axis without changing rules coordinates", () => {
  const pose = calculateFlightPose({
    elevation: 500,
    gridSize: 100,
    gridDistance: 5,
    tokenWidth: 100,
    tokenHeight: 100
  });
  assert.deepEqual(pose.ground, { x: 50, y: 50 });
  assert.ok(pose.lift > 0);
  assert.deepEqual(pose.standTop, pose.tokenCenter);
  const axisX = pose.ground.x - pose.standTop.x;
  const axisY = pose.ground.y - pose.standTop.y;
  const angleFromVertical = Math.atan2(Math.abs(axisX), Math.abs(axisY));
  assert.ok(Math.abs(angleFromVertical - (12 * (Math.PI / 180))) < 1e-12);
});

test("caps stand lean only for pathological custom Token dimensions", () => {
  const pose = calculateFlightPose({
    elevation: 500,
    gridSize: 100,
    gridDistance: 5,
    tokenWidth: 100,
    tokenHeight: 1_000_000
  });
  assert.equal(pose.lean, 150);
  assert.ok(Math.atan2(pose.lean, pose.lift) < (12 * (Math.PI / 180)));
});

test("raises elongated 1x4 and 2x3 Token art fully above its fixed base", () => {
  for (const [tokenWidth, tokenHeight] of [[100, 400], [200, 300]]) {
    const pose = calculateFlightPose({
      elevation: 5,
      gridSize: 100,
      gridDistance: 5,
      tokenWidth,
      tokenHeight
    });
    const raisedArtBottom = pose.tokenCenter.y + (tokenHeight / 2);
    assert.ok(raisedArtBottom < pose.ground.y);
    assert.deepEqual(pose.standTop, pose.tokenCenter);
  }
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

test("ground projection ends at the fixed acrylic base and fades with height", () => {
  const low = calculateVisualMetrics({ ...base, elevation: 10 });
  const high = calculateVisualMetrics({ ...base, elevation: 120 });
  assert.deepEqual(
    [low.projection.startX, low.projection.startY],
    [low.stand.topX, low.stand.topY]
  );
  assert.deepEqual(
    [high.projection.endX, high.projection.endY],
    [high.base.x, high.base.y]
  );
  assert.ok(high.projection.alpha < low.projection.alpha);
});

test("keeps the full soft shadow and base inside the original footprint", () => {
  const metrics = calculateVisualMetrics({
    ...base,
    elevation: 1_000_000,
    shadowDistanceMultiplier: 3,
    groundX: 8,
    groundY: 94
  });
  assert.ok(metrics.base.x - metrics.base.radiusX >= 0);
  assert.ok(metrics.base.x + metrics.base.radiusX <= 100);
  assert.ok(metrics.base.y - metrics.base.radiusY >= 0);
  assert.ok(metrics.base.y + metrics.base.radiusY <= 100);
  assert.ok(metrics.shadow.x - (metrics.shadow.radiusX * 1.24) >= -1e-9);
  assert.ok(metrics.shadow.x + (metrics.shadow.radiusX * 1.24) <= 100 + 1e-9);
  assert.ok(metrics.shadow.y - (metrics.shadow.radiusY * 1.34) >= -1e-9);
  assert.ok(metrics.shadow.y + (metrics.shadow.radiusY * 1.34) <= 100 + 1e-9);
  assert.ok(metrics.shadow.contactX - metrics.shadow.contactRadiusX >= 0);
  assert.ok(metrics.shadow.contactX + metrics.shadow.contactRadiusX <= 100);
  assert.ok(metrics.shadow.contactY - metrics.shadow.contactRadiusY >= 0);
  assert.ok(metrics.shadow.contactY + metrics.shadow.contactRadiusY <= 100);
  assert.ok(metrics.shadow.contactAlpha > 0);
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

test("Number.MAX_VALUE-like geometry inputs are safely bounded and finite", () => {
  const metrics = calculateVisualMetrics({
    ...base,
    elevation: Number.MAX_VALUE,
    gridSize: Number.MAX_VALUE,
    gridDistance: Number.MIN_VALUE,
    tokenWidth: Number.MAX_VALUE,
    tokenHeight: Number.MAX_VALUE,
    groundX: Number.MAX_VALUE,
    groundY: Number.MAX_VALUE,
    shadowDistanceMultiplier: Number.MAX_VALUE
  });
  const numbers = [];
  const collectNumbers = value => {
    if ((typeof value === "number")) numbers.push(value);
    else if (value && (typeof value === "object")) Object.values(value).forEach(collectNumbers);
  };
  collectNumbers(metrics);
  assert.ok(numbers.length > 0);
  assert.ok(numbers.every(Number.isFinite));
  assert.ok(metrics.base.x <= 1_000_000);
  assert.ok(metrics.base.y <= 1_000_000);
  assert.ok(metrics.stand.length < 4_000_000);
});

test("shadow multiplier changes shadow drift without changing the stand", () => {
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
