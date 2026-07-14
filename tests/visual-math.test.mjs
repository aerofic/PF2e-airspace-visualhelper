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
  smootherStep
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

function assertApproximatelyEqual(actual, expected, tolerance = 1e-9, message) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    message ?? `expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

function collectNumbers(value, numbers = []) {
  if (typeof value === "number") numbers.push(value);
  else if (value && (typeof value === "object")) {
    Object.values(value).forEach(entry => collectNumbers(entry, numbers));
  }
  return numbers;
}

test("normalizes invalid and non-flying elevations", () => {
  assert.equal(normalizeFlyingElevation(-10), 0);
  assert.equal(normalizeFlyingElevation(Number.NaN), 0);
  assert.equal(normalizeFlyingElevation(Number.POSITIVE_INFINITY), 0);
  assert.equal(normalizeFlyingElevation("60"), 60);
});

test("height response is continuous between zero and a tiny positive elevation", () => {
  const zeroCurve = calculateHeightCurve(0, 5);
  const tinyCurve = calculateHeightCurve(Number.MIN_VALUE, 5);
  assert.deepEqual(zeroCurve, { steps: 0, takeoff: 0, signal: 0, clearanceGrids: 0 });
  assert.ok(tinyCurve.steps > 0);
  assert.ok(tinyCurve.takeoff >= 0);
  assert.ok(tinyCurve.signal > 0);
  assert.ok(tinyCurve.clearanceGrids > 0);
  assert.ok(tinyCurve.clearanceGrids < 1e-6);

  const zero = calculateVisualMetrics({ ...base, elevation: 0 });
  const tiny = calculateVisualMetrics({ ...base, elevation: Number.MIN_VALUE });
  assert.ok(Math.abs(tiny.token.offsetX - zero.token.offsetX) < 1e-6);
  assert.ok(Math.abs(tiny.token.offsetY - zero.token.offsetY) < 1e-6);
  assert.ok(tiny.stand.length < 1e-6);
  assert.ok(tiny.stand.opacity < 1e-12);
  assert.ok(tiny.shadow.alpha < 1e-12);
  assert.ok(tiny.shadow.contactAlpha < 1e-12);
  assert.ok(tiny.projection.alpha < 1e-12);
  assert.ok(tiny.projection.reticleAlpha < 1e-12);
  assert.ok(tiny.airAccent.alpha < 1e-12);
});

test("height curve and rendered pose stay monotonic across former visual thresholds", () => {
  for (const elevation of [1, 5, 30, 100]) {
    const delta = Math.max(1e-6, elevation * 1e-6);
    const left = calculateVisualMetrics({ ...base, elevation: elevation - delta });
    const center = calculateVisualMetrics({ ...base, elevation });
    const right = calculateVisualMetrics({ ...base, elevation: elevation + delta });

    assert.ok(left.height.steps <= center.height.steps);
    assert.ok(center.height.steps <= right.height.steps);
    // Permit one ulp of polynomial roundoff around smootherStep(1).
    const epsilon = 1e-12;
    assert.ok(left.height.takeoff <= center.height.takeoff + epsilon);
    assert.ok(center.height.takeoff <= right.height.takeoff + epsilon);
    assert.ok(left.height.signal <= center.height.signal + epsilon);
    assert.ok(center.height.signal <= right.height.signal + epsilon);
    assert.ok(left.height.clearanceGrids <= center.height.clearanceGrids + epsilon);
    assert.ok(center.height.clearanceGrids <= right.height.clearanceGrids + epsilon);
    assert.ok(left.stand.length <= center.stand.length + epsilon);
    assert.ok(center.stand.length <= right.stand.length + epsilon);
    assert.ok(left.token.scale <= center.token.scale + epsilon);
    assert.ok(center.token.scale <= right.token.scale + epsilon);
    assert.ok(left.token.alpha + epsilon >= center.token.alpha);
    assert.ok(center.token.alpha + epsilon >= right.token.alpha);

    // A one-part-per-million input change must not produce a visible pixel jump.
    assert.ok(Math.abs(right.stand.length - left.stand.length) < 0.01);
    assert.ok(Math.abs(right.token.offsetY - left.token.offsetY) < 0.01);
  }
});

test("smootherStep is bounded, monotonic, and stable outside its domain", () => {
  const samples = [-Infinity, -1, 0, 0.25, 0.5, 0.75, 1, 2, Infinity, Number.NaN]
    .map(smootherStep);
  assert.ok(samples.every(value => Number.isFinite(value) && (value >= 0) && (value <= 1)));
  assert.deepEqual(samples.slice(0, 3), [0, 0, 0]);
  assert.equal(samples[6], 1);
  assert.equal(samples[7], 1);
  assert.equal(samples[8], 0);
  assert.equal(samples[9], 0);
  assert.ok(samples[3] < samples[4]);
  assert.ok(samples[4] < samples[5]);
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

test("keeps the acrylic base at the Token footprint while raising the art vertically", () => {
  for (const elevation of [10, 60, 120]) {
    const metrics = calculateVisualMetrics({ ...base, elevation });
    assert.deepEqual([metrics.base.x, metrics.base.y], [50, 50]);
    assert.deepEqual([metrics.stand.baseX, metrics.stand.baseY], [50, 50]);
    assert.deepEqual([metrics.projection.endX, metrics.projection.endY], [50, 50]);
    assert.equal(metrics.token.offsetX, 0);
    assert.ok(metrics.token.offsetY < 0);
    assert.equal(metrics.stand.topX, metrics.stand.baseX);
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

test("uses a strictly vertical stand axis without changing rules coordinates", () => {
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
  assert.equal(pose.lean, 0);
  assert.equal(pose.tokenOffset.x, 0);
  assert.equal(pose.standTop.x, pose.ground.x);
  assert.ok(pose.standTop.y < pose.ground.y);
});

test("keeps pathological custom Token dimensions vertical and finite", () => {
  const pose = calculateFlightPose({
    elevation: 500,
    gridSize: 100,
    gridDistance: 5,
    tokenWidth: 100,
    tokenHeight: 1_000_000
  });
  assert.equal(pose.lean, 0);
  assert.equal(pose.tokenOffset.x, 0);
  assert.equal(pose.standTop.x, pose.ground.x);
  assert.ok(Number.isFinite(pose.lift));
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

test("all supported footprint shapes get the same bottom-edge clearance at five feet and above", () => {
  const dimensions = [
    [100, 100], // 1x1
    [200, 200], // 2x2
    [100, 400], // 1x4
    [200, 300] // 2x3
  ];

  for (const elevation of [5, 30, 100]) {
    const clearances = dimensions.map(([tokenWidth, tokenHeight]) => {
      const metrics = calculateVisualMetrics({
        ...base,
        elevation,
        tokenWidth,
        tokenHeight
      });
      const artBottom = metrics.token.centerY + (tokenHeight / 2);
      return metrics.base.y - artBottom;
    });
    assert.ok(clearances.every(clearance => clearance > 0));
    for (const clearance of clearances.slice(1)) {
      assertApproximatelyEqual(clearance, clearances[0], 1e-9);
    }
  }
});

test("airborne perspective scale and alpha are subtle and monotonic", () => {
  const samples = [0, Number.MIN_VALUE, 1, 5, 30, 100, 1_000, 1_000_000]
    .map(elevation => calculateVisualMetrics({ ...base, elevation }));

  for (const metrics of samples) {
    assert.ok(metrics.token.scale >= 1);
    assert.ok(metrics.token.scale <= 1.04);
    assert.ok(metrics.token.alpha >= 0.95);
    assert.ok(metrics.token.alpha <= 1);
  }
  for (let index = 1; index < samples.length; index += 1) {
    assert.ok(samples[index].token.scale >= samples[index - 1].token.scale);
    assert.ok(samples[index].token.alpha <= samples[index - 1].token.alpha);
  }
});

test("swapping width and height preserves perspective response and bounded ground geometry", () => {
  for (const elevation of [5, 30, 100]) {
    for (const [width, height] of [[100, 400], [200, 300]]) {
      const portrait = calculateVisualMetrics({
        ...base,
        elevation,
        tokenWidth: width,
        tokenHeight: height
      });
      const landscape = calculateVisualMetrics({
        ...base,
        elevation,
        tokenWidth: height,
        tokenHeight: width
      });

      // Scale and alpha use the rotation-invariant equivalent Token radius.
      assertApproximatelyEqual(portrait.token.scale, landscape.token.scale, 1e-9);
      assertApproximatelyEqual(portrait.token.alpha, landscape.token.alpha, 1e-9);

      // The fixed acrylic base remains inside the Token footprint. The cast
      // shadow may extend outside it to preserve an obvious height offset.
      for (const [metrics, footprintWidth, footprintHeight] of [
        [portrait, width, height],
        [landscape, height, width]
      ]) {
        assert.ok(metrics.base.x - metrics.base.radiusX >= 0);
        assert.ok(metrics.base.x + metrics.base.radiusX <= footprintWidth);
        assert.ok(metrics.base.y - metrics.base.radiusY >= 0);
        assert.ok(metrics.base.y + metrics.base.radiusY <= footprintHeight);
        assert.ok(metrics.shadow.radiusX <= 62);
        assert.ok(metrics.shadow.radiusY <= 24);
        assert.ok(Math.hypot(
          metrics.shadow.x - metrics.base.x,
          metrics.shadow.y - metrics.base.y
        ) <= 75 + 1e-9);
      }
    }
  }
});

test("shadow becomes smaller and fainter with elevation", () => {
  const low = calculateVisualMetrics({ ...base, elevation: 10 });
  const high = calculateVisualMetrics({ ...base, elevation: 120 });
  assert.ok(high.shadow.radiusX < low.shadow.radiusX);
  assert.ok(high.shadow.alpha < low.shadow.alpha);
});

test("keeps the height-cast and contact shadows prominent at tactical elevation", () => {
  const metrics = calculateVisualMetrics({
    ...base,
    elevation: 60,
    shadowOpacity: 0.5
  });
  const distance = Math.hypot(
    metrics.shadow.x - metrics.base.x,
    metrics.shadow.y - metrics.base.y
  );

  assert.ok(distance > 35, "60 ft shadow should visibly leave the ground marker");
  assert.ok(metrics.shadow.alpha > 0.4, "cast shadow should survive height falloff");
  assert.ok(metrics.shadow.radiusX > 28, "cast shadow should retain readable area");
  assert.ok(metrics.shadow.contactAlpha >= 0.3, "base contact shadow should remain grounded");
  assert.ok(metrics.shadow.contactCoreAlpha >= 0.38, "contact core should remain distinct");
});

test("cast shadow drifts outward while shrinking and fading after takeoff", () => {
  const elevations = [1, 5, 30, 100, 1_000];
  const samples = elevations.map(elevation => calculateVisualMetrics({ ...base, elevation }));
  const distances = samples.map(metrics => Math.hypot(
    metrics.shadow.x - metrics.base.x,
    metrics.shadow.y - metrics.base.y
  ));

  for (let index = 1; index < distances.length; index += 1) {
    assert.ok(distances[index] >= distances[index - 1]);
    assert.ok(samples[index].shadow.radiusX < samples[index - 1].shadow.radiusX);
    assert.ok(samples[index].shadow.radiusY < samples[index - 1].shadow.radiusY);
  }
  for (let index = 2; index < samples.length; index += 1) {
    assert.ok(samples[index].shadow.alpha < samples[index - 1].shadow.alpha);
  }
});

test("contact shadow geometry and opacity remain fixed after the first five feet", () => {
  const samples = [5, 30, 100, 1_000]
    .map(elevation => calculateVisualMetrics({ ...base, elevation }).shadow);
  const stableKeys = [
    "contactX",
    "contactY",
    "contactRadiusX",
    "contactRadiusY",
    "contactCoreRadiusX",
    "contactCoreRadiusY",
    "contactAlpha",
    "contactCoreAlpha"
  ];

  for (const shadow of samples.slice(1)) {
    for (const key of stableKeys) {
      assertApproximatelyEqual(shadow[key], samples[0][key], 1e-9, `${key} drifted with elevation`);
    }
  }
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

test("keeps the base and contact shadow inside the footprint while bounding the cast shadow", () => {
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
  assert.ok(metrics.base.y + metrics.base.thickness + metrics.base.radiusY <= 100);
  assert.ok(Math.hypot(
    metrics.shadow.x - metrics.base.x,
    metrics.shadow.y - metrics.base.y
  ) <= 75 + 1e-9);
  assert.ok(metrics.shadow.radiusX <= 62);
  assert.ok(metrics.shadow.radiusY <= 24);
  assert.ok(metrics.shadow.contactX - (metrics.shadow.contactRadiusX * 1.12) >= 0);
  assert.ok(metrics.shadow.contactX + (metrics.shadow.contactRadiusX * 1.12) <= 100);
  assert.ok(metrics.shadow.contactY - (metrics.shadow.contactRadiusY * 1.16) >= 0);
  assert.ok(metrics.shadow.contactY + (metrics.shadow.contactRadiusY * 1.16) <= 100);
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
  const numbers = collectNumbers(metrics);
  assert.ok(numbers.length > 0);
  assert.ok(numbers.every(Number.isFinite));
  assert.ok(metrics.base.x <= 1_000_000);
  assert.ok(metrics.base.y <= 1_000_000);
  assert.ok(metrics.stand.length < 4_000_000);
});

test("all numeric outputs stay finite for invalid, subnormal, and extreme inputs", () => {
  const cases = [
    {
      elevation: Number.MIN_VALUE,
      gridSize: Number.MIN_VALUE,
      gridDistance: Number.MIN_VALUE,
      tokenWidth: Number.MIN_VALUE,
      tokenHeight: Number.MIN_VALUE,
      groundX: -Number.MAX_VALUE,
      groundY: Number.MAX_VALUE
    },
    {
      elevation: Number.MAX_VALUE,
      gridSize: Number.MAX_VALUE,
      gridDistance: Number.MIN_VALUE,
      tokenWidth: Number.MAX_VALUE,
      tokenHeight: Number.MAX_VALUE,
      groundX: Number.MAX_VALUE,
      groundY: -Number.MAX_VALUE,
      standOpacity: Number.MAX_VALUE,
      shadowOpacity: -Number.MAX_VALUE,
      projectionOpacity: Number.MAX_VALUE,
      shadowDistanceMultiplier: Number.MAX_VALUE
    },
    {
      elevation: Number.NaN,
      gridSize: Number.POSITIVE_INFINITY,
      gridDistance: Number.NEGATIVE_INFINITY,
      tokenWidth: Number.NaN,
      tokenHeight: Number.POSITIVE_INFINITY,
      groundX: Number.NaN,
      groundY: Number.NEGATIVE_INFINITY,
      standOpacity: Number.NaN,
      shadowOpacity: Number.POSITIVE_INFINITY,
      projectionOpacity: Number.NEGATIVE_INFINITY,
      shadowDistanceMultiplier: Number.NaN
    }
  ];

  for (const input of cases) {
    const metrics = calculateVisualMetrics({ ...base, ...input });
    const pose = calculateFlightPose({ ...base, ...input });
    const curve = calculateHeightCurve(input.elevation, input.gridDistance);
    assert.ok(collectNumbers(metrics).every(Number.isFinite));
    assert.ok(collectNumbers(pose).every(Number.isFinite));
    assert.ok(collectNumbers(curve).every(Number.isFinite));
  }

  for (const input of [
    [Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE, false],
    [Number.MIN_VALUE, Number.MIN_VALUE, Number.MIN_VALUE, Number.MIN_VALUE, false],
    [Number.NaN, Number.NaN, Number.NaN, Number.NaN, false],
    [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 4, 0, true]
  ]) {
    assert.ok(Number.isFinite(calculateAmbientOffset(...input)));
  }
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

test("ambient offset starts at rest and respects amplitude, period, and reduced motion", () => {
  assert.equal(calculateAmbientOffset(0, Math.PI / 2, 4, 1_000), 0);
  assert.equal(calculateAmbientOffset(800, 0, 0, 3_200), 0);
  assert.equal(calculateAmbientOffset(800, 0, 1, 3_200, true), 0);

  const halfAmplitudePeak = calculateAmbientOffset(800, 0, 0.5, 3_200);
  const fullAmplitudePeak = calculateAmbientOffset(800, 0, 1, 3_200);
  assertApproximatelyEqual(halfAmplitudePeak, 0.5, 1e-12);
  assertApproximatelyEqual(fullAmplitudePeak, 1, 1e-12);
  assertApproximatelyEqual(fullAmplitudePeak, halfAmplitudePeak * 2, 1e-12);

  // Each period reaches the same peak amplitude at its own quarter-cycle.
  assertApproximatelyEqual(calculateAmbientOffset(400, 0, 1, 1_600), 1, 1e-12);
  assertApproximatelyEqual(calculateAmbientOffset(800, 0, 1, 3_200), 1, 1e-12);
  assert.ok(Math.abs(calculateAmbientOffset(800, 0, 1, 1_600)) < 1e-12);

  for (let elapsed = 0; elapsed <= 10_000; elapsed += 137) {
    assert.ok(Math.abs(calculateAmbientOffset(elapsed, 0.3, 1.25, 2_400)) <= 1.25 + 1e-12);
  }
});

test("airborne bob amplitude is slightly stronger while remaining restrained", () => {
  const low = calculateVisualMetrics({ ...base, elevation: 5 });
  const high = calculateVisualMetrics({ ...base, elevation: 100 });

  assert.ok(low.token.bobAmplitude >= 1, "a one-grid flight should have a readable float");
  assert.ok(high.token.bobAmplitude > low.token.bobAmplitude);
  assert.ok(high.token.bobAmplitude <= 1.75, "ambient motion must remain subtle");
});
