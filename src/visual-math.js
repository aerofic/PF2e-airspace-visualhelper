/** Clamp a finite number without relying on Foundry's Number extensions. */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/** Only positive elevation creates Canvas flight geometry. */
export function normalizeFlyingElevation(value) {
  const elevation = Number(value);
  return Number.isFinite(elevation) ? Math.max(0, elevation) : 0;
}

/** Preserve signed finite elevation for the HUD and relationship display. */
export function normalizeHudElevation(value) {
  const elevation = Number(value);
  return Number.isFinite(elevation) ? elevation : 0;
}

const STAND_LEAN_RADIANS = 12 * (Math.PI / 180);
// PIXI cannot usefully render near-Number.MAX coordinates. Bounding source
// dimensions also prevents otherwise finite inputs from overflowing later
// additions and distance calculations.
const MAX_CANVAS_DIMENSION = 1_000_000;
const MAX_HEIGHT_STEPS = 1_000_000;
const MAX_STAND_LEAN_GRIDS = 1.5;
const SHADOW_OUTER_SCALE_X = 1.24;
const SHADOW_OUTER_SCALE_Y = 1.34;
const CONTACT_OUTER_SCALE_X = 1.12;
const CONTACT_OUTER_SCALE_Y = 1.16;

/** A continuous elevation response shared by every visual component. */
export function calculateHeightCurve(elevation, gridDistance = 5) {
  const safeElevation = normalizeFlyingElevation(elevation);
  if (safeElevation === 0) {
    return { steps: 0, takeoff: 0, signal: 0, clearanceGrids: 0 };
  }

  const distance = positiveOr(gridDistance, 5);
  const quotient = safeElevation / distance;
  // Preserve a positive response even for subnormal custom elevation values.
  const steps = clamp(
    Number.isFinite(quotient) ? Math.max(quotient, Number.EPSILON) : MAX_HEIGHT_STEPS,
    Number.EPSILON,
    MAX_HEIGHT_STEPS
  );
  const takeoff = smootherStep(clamp(steps, 0, 1));
  const signal = -Math.expm1(-steps / 10);
  // A logarithmic tabletop scale leaves 5 ft restrained but allocates more
  // screen distance between 20, 60 and 100 ft, where tactical comparisons are
  // most common. The takeoff term keeps the origin continuous and the cap
  // prevents extreme custom elevation from spanning the whole Scene.
  const heightLog = Math.log1p(steps) / Math.LN2;
  const clearanceGrids = clamp(
    (0.06 * takeoff) + (0.11 * Math.pow(heightLog, 1.38)),
    0,
    1.8
  );
  return { steps, takeoff, signal, clearanceGrids };
}

/** Quintic easing with zero velocity at both ends. */
export function smootherStep(value) {
  const t = clamp(finiteOr(value, 0), 0, 1);
  return t * t * t * ((t * ((t * 6) - 15)) + 10);
}

/**
 * Calculate the visual-only pose of a flying Token.
 *
 * The ground anchor is always the center of the TokenDocument footprint. Only
 * the rendered Token mesh uses the returned offset; rules and movement retain
 * the original document coordinates.
 */
export function calculateFlightPose({
  elevation,
  gridSize,
  gridDistance,
  tokenWidth,
  tokenHeight,
  groundX,
  groundY
}) {
  const safeElevation = normalizeFlyingElevation(elevation);
  const safeGridSize = boundedPositiveOr(gridSize, 100);
  const safeGridDistance = positiveOr(gridDistance, 5);
  const width = boundedPositiveOr(tokenWidth, safeGridSize);
  const height = boundedPositiveOr(tokenHeight, safeGridSize);
  const ground = {
    x: boundedGroundCoordinate(groundX, width / 2, width),
    y: boundedGroundCoordinate(groundY, height / 2, height)
  };
  const halfVisual = height * 0.5;
  const heightCurve = calculateHeightCurve(safeElevation, safeGridDistance);

  if (safeElevation === 0) {
    return {
      flying: false,
      ground,
      tokenCenter: { ...ground },
      tokenOffset: { x: 0, y: 0 },
      standTop: { ...ground },
      lift: 0,
      lean: 0,
      halfVisual,
      heightCurve
    };
  }

  // The takeoff envelope removes the old half-Token jump immediately above
  // zero. At one grid step the complete art clears its ground plate, while the
  // logarithmically compressed clearance keeps extreme heights readable.
  const lift = (halfVisual * heightCurve.takeoff)
    + (safeGridSize * heightCurve.clearanceGrids);
  const lean = Math.min(
    lift * Math.tan(STAND_LEAN_RADIANS),
    safeGridSize * MAX_STAND_LEAN_GRIDS
  );
  const tokenOffset = { x: -lean, y: -lift };
  const tokenCenter = {
    x: ground.x + tokenOffset.x,
    y: ground.y + tokenOffset.y
  };

  return {
    flying: true,
    ground,
    tokenCenter,
    tokenOffset,
    standTop: { ...tokenCenter },
    lift,
    lean,
    halfVisual,
    heightCurve
  };
}

/**
 * Convert rules-space elevation into a compressed tabletop visual height.
 * The HUD preserves the exact value; only Canvas geometry is compressed so a
 * 60 ft stand does not obscure twelve 5 ft grid squares.
 */
export function calculateVisualMetrics({
  elevation,
  gridSize,
  gridDistance,
  tokenWidth,
  tokenHeight,
  groundX,
  groundY,
  standOpacity,
  shadowOpacity,
  projectionOpacity,
  shadowDistanceMultiplier
}) {
  const safeElevation = normalizeFlyingElevation(elevation);
  const safeGridSize = boundedPositiveOr(gridSize, 100);
  const safeGridDistance = positiveOr(gridDistance, 5);
  const width = boundedPositiveOr(tokenWidth, safeGridSize);
  const height = boundedPositiveOr(tokenHeight, safeGridSize);
  const pose = calculateFlightPose({
    elevation: safeElevation,
    gridSize: safeGridSize,
    gridDistance: safeGridDistance,
    tokenWidth: width,
    tokenHeight: height,
    groundX,
    groundY
  });

  if (safeElevation === 0) return emptyMetrics({ pose, width, height });

  const { signal, takeoff } = pose.heightCurve;
  const standLength = Math.hypot(
    pose.ground.x - pose.standTop.x,
    pose.ground.y - pose.standTop.y
  );
  const axisX = standLength > 0 ? (pose.ground.x - pose.standTop.x) / standLength : 0;
  const axisY = standLength > 0 ? (pose.ground.y - pose.standTop.y) / standLength : 1;
  const normalX = -axisY;
  const normalY = axisX;
  const lineWidth = clamp(safeGridSize * (0.034 + (signal * 0.007)), 3.25, 7);
  const { equivalentRadius, compressedRadius } = calculateTokenRadii(width, height, safeGridSize);

  const normalizedStandOpacity = clamp(finiteOr(standOpacity, 0), 0, 1);
  const normalizedShadowOpacity = clamp(finiteOr(shadowOpacity, 0), 0, 1);
  const normalizedProjectionOpacity = clamp(finiteOr(projectionOpacity, 0), 0, 1);
  const baseRadiusX = radiusAtFixedCenter(
    pose.ground.x,
    clamp(compressedRadius * 0.74, safeGridSize * 0.16, safeGridSize * 0.46),
    width
  );
  const baseRadiusY = radiusAtFixedCenter(
    pose.ground.y,
    clamp(safeGridSize * 0.075, 5, 12),
    height
  );
  const baseThickness = Math.min(
    clamp(safeGridSize * 0.024, 1.5, 4),
    Math.max(0, height - pose.ground.y - baseRadiusY)
  );

  const distanceMultiplier = clamp(finiteOr(shadowDistanceMultiplier, 1), 0.25, 3);
  const desiredShadowDistance = safeGridSize * clamp(
    (0.05 + (0.32 * signal)) * distanceMultiplier,
    0.02,
    0.55
  );
  const shadowScale = 0.96 - (0.3 * signal);
  const shadowFalloff = 1 - (0.58 * signal);
  const desiredShadowRadiusX = compressedRadius * 0.72 * shadowScale;
  // Account for ShadowRenderer's outer soft ellipse so the complete visual,
  // rather than only its nominal radius, remains in the footprint bounds.
  const shadowRadiusX = Math.min(
    desiredShadowRadiusX,
    width / (2 * SHADOW_OUTER_SCALE_X)
  );
  const shadowRadiusY = Math.min(
    desiredShadowRadiusX * (0.3 - (0.05 * signal)),
    height / (2 * SHADOW_OUTER_SCALE_Y)
  );
  const shadowX = clampEllipseCenter(
    pose.ground.x + (desiredShadowDistance * 0.91),
    shadowRadiusX * SHADOW_OUTER_SCALE_X,
    width
  );
  const shadowY = clampEllipseCenter(
    pose.ground.y + (desiredShadowDistance * 0.41),
    shadowRadiusY * SHADOW_OUTER_SCALE_Y,
    height
  );

  // Contact shadow belongs to the physical ground plate and does not drift or
  // fade with height once the Token has completed its first 5 ft of takeoff.
  const contactRadiusX = Math.min(
    baseRadiusX * 0.78,
    width / (2 * CONTACT_OUTER_SCALE_X)
  );
  const contactRadiusY = Math.min(
    baseRadiusY * 0.62,
    height / (2 * CONTACT_OUTER_SCALE_Y)
  );
  const contactCoreRadiusX = contactRadiusX * 0.58;
  const contactCoreRadiusY = contactRadiusY * 0.54;
  const contactX = clampEllipseCenter(
    pose.ground.x,
    contactRadiusX * CONTACT_OUTER_SCALE_X,
    width
  );
  const contactY = clampEllipseCenter(
    pose.ground.y + (baseRadiusY * 0.34),
    contactRadiusY * CONTACT_OUTER_SCALE_Y,
    height
  );

  const connectorInset = clamp(height * 0.44, safeGridSize * 0.12, height * 0.48);
  const connectorX = pose.standTop.x + (axisX * connectorInset);
  const connectorY = pose.standTop.y + (axisY * connectorInset);
  const perspectiveGrowth = Math.min(0.04, (safeGridSize * 0.02) / equivalentRadius);
  const perspectiveScale = 1 + (signal * perspectiveGrowth);
  const alphaMultiplier = 1 - (0.045 * signal);

  const dashLength = clamp(safeGridSize * 0.065, 5, 10);
  const projectionFalloff = 1 - (0.46 * signal);

  return {
    flying: true,
    height: { ...pose.heightCurve },
    token: {
      offsetX: pose.tokenOffset.x,
      offsetY: pose.tokenOffset.y,
      centerX: pose.tokenCenter.x,
      centerY: pose.tokenCenter.y,
      scale: perspectiveScale,
      alpha: alphaMultiplier,
      bobAmplitude: takeoff * clamp(safeGridSize * (0.008 + (signal * 0.004)), 0.7, 1.4)
    },
    stand: {
      topX: pose.standTop.x,
      topY: pose.standTop.y,
      baseX: pose.ground.x,
      baseY: pose.ground.y,
      length: standLength,
      width: lineWidth,
      opacity: normalizedStandOpacity * takeoff,
      axisX,
      axisY,
      normalX,
      normalY
    },
    connector: {
      x: connectorX,
      y: connectorY,
      length: clamp(safeGridSize * 0.11, 7, 16),
      width: lineWidth * 1.55
    },
    base: {
      x: pose.ground.x,
      y: pose.ground.y,
      radiusX: baseRadiusX,
      radiusY: baseRadiusY,
      thickness: baseThickness,
      pinLength: clamp(safeGridSize * 0.09, 6, 14),
      pinWidth: lineWidth * 1.45
    },
    shadow: {
      x: shadowX,
      y: shadowY,
      radiusX: shadowRadiusX,
      radiusY: shadowRadiusY,
      alpha: normalizedShadowOpacity * shadowFalloff * takeoff,
      contactX,
      contactY,
      contactRadiusX,
      contactRadiusY,
      contactCoreRadiusX,
      contactCoreRadiusY,
      contactAlpha: normalizedShadowOpacity * 0.42 * takeoff
    },
    projection: {
      startX: pose.standTop.x,
      startY: pose.standTop.y,
      endX: pose.ground.x,
      endY: pose.ground.y,
      markerRadius: Math.min(baseRadiusX * 0.72, baseRadiusY * 2.6),
      markerRadiusX: baseRadiusX * 0.72,
      markerRadiusY: baseRadiusY * 0.72,
      dashLength,
      gapLength: dashLength * 0.82,
      lineWidth: clamp(safeGridSize * 0.014, 1.25, 3),
      alpha: normalizedProjectionOpacity * projectionFalloff * takeoff,
      footprint: { x: 0, y: 0, width, height },
      reticleAlpha: normalizedProjectionOpacity * takeoff * (0.08 + (0.04 * (1 - signal)))
    },
    airAccent: {
      x: pose.tokenCenter.x,
      y: pose.tokenCenter.y + (height * 0.38),
      radiusX: clamp(compressedRadius * 0.54, 8, safeGridSize * 0.42),
      radiusY: clamp(safeGridSize * 0.032, 2.5, 6),
      alpha: normalizedStandOpacity * takeoff * (0.055 + (signal * 0.045))
    },
    // Alias retained for integrations written against V2 0.3.x.
    liftGlow: {
      x: pose.tokenCenter.x,
      y: pose.tokenCenter.y + (height * 0.38),
      radiusX: clamp(compressedRadius * 0.54, 8, safeGridSize * 0.42),
      radiusY: clamp(safeGridSize * 0.032, 2.5, 6),
      alpha: normalizedStandOpacity * takeoff * (0.055 + (signal * 0.045))
    }
  };
}

/** Deterministic, reduced-motion-aware idle offset for the shared ticker. */
export function calculateAmbientOffset(
  elapsed,
  phase = 0,
  amplitude = 0,
  period = 3200,
  reducedMotion = false
) {
  if (reducedMotion) return 0;
  const safeAmplitude = clamp(Math.abs(finiteOr(amplitude, 0)), 0, 4);
  if (safeAmplitude === 0) return 0;
  const safeElapsed = Math.max(0, finiteOr(elapsed, 0));
  const safePeriod = clamp(positiveOr(period, 3200), 1000, 10_000);
  const envelope = safeElapsed >= 240 ? 1 : smootherStep(safeElapsed / 240);
  const tau = Math.PI * 2;
  const cycleAngle = ((safeElapsed % safePeriod) / safePeriod) * tau;
  const phaseAngle = finiteOr(phase, 0) % tau;
  return Math.sin((cycleAngle + phaseAngle) % tau)
    * safeAmplitude
    * envelope;
}

/** Duration is bounded so both 5 ft and extreme changes remain responsive. */
export function calculateAnimationDuration(from, to, gridDistance = 5) {
  const delta = Math.abs(normalizeFlyingElevation(to) - normalizeFlyingElevation(from));
  const quotient = delta / positiveOr(gridDistance, 5);
  const deltaSteps = Number.isFinite(quotient) ? quotient : MAX_HEIGHT_STEPS;
  return clamp(240 + (deltaSteps * 18), 260, 650);
}

/** Smooth acceleration and deceleration for stand/projection movement. */
export function easeInOutCosine(progress) {
  const t = clamp(finiteOr(progress, 0), 0, 1);
  return (1 - Math.cos(Math.PI * t)) / 2;
}

function calculateTokenRadii(width, height, gridSize) {
  // sqrt(a) * sqrt(b) avoids an unnecessary width*height overflow.
  const equivalentDiameter = Math.sqrt(width) * Math.sqrt(height);
  const equivalentRadius = Math.max(equivalentDiameter * 0.5, Number.EPSILON);
  const diameterGrids = clamp(equivalentDiameter / gridSize, 0.25, 8);
  const compressedRadius = 0.5 * gridSize * Math.sqrt(diameterGrids);
  return { equivalentRadius, compressedRadius };
}

function emptyMetrics({ pose, width, height }) {
  const ground = pose.ground;
  return {
    flying: false,
    height: { ...pose.heightCurve },
    token: {
      offsetX: 0,
      offsetY: 0,
      centerX: ground.x,
      centerY: ground.y,
      scale: 1,
      alpha: 1,
      bobAmplitude: 0
    },
    stand: {
      topX: ground.x,
      topY: ground.y,
      baseX: ground.x,
      baseY: ground.y,
      length: 0,
      width: 0,
      opacity: 0,
      axisX: 0,
      axisY: 1,
      normalX: -1,
      normalY: 0
    },
    connector: { x: ground.x, y: ground.y, length: 0, width: 0 },
    base: {
      x: ground.x,
      y: ground.y,
      radiusX: 0,
      radiusY: 0,
      thickness: 0,
      pinLength: 0,
      pinWidth: 0
    },
    shadow: {
      x: ground.x,
      y: ground.y,
      radiusX: 0,
      radiusY: 0,
      alpha: 0,
      contactX: ground.x,
      contactY: ground.y,
      contactRadiusX: 0,
      contactRadiusY: 0,
      contactCoreRadiusX: 0,
      contactCoreRadiusY: 0,
      contactAlpha: 0
    },
    projection: {
      startX: ground.x,
      startY: ground.y,
      endX: ground.x,
      endY: ground.y,
      markerRadius: 0,
      markerRadiusX: 0,
      markerRadiusY: 0,
      dashLength: 0,
      gapLength: 0,
      lineWidth: 0,
      alpha: 0,
      footprint: { x: 0, y: 0, width, height },
      reticleAlpha: 0
    },
    airAccent: { x: ground.x, y: ground.y, radiusX: 0, radiusY: 0, alpha: 0 },
    liftGlow: { x: ground.x, y: ground.y, radiusX: 0, radiusY: 0, alpha: 0 }
  };
}

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && (number > 0) ? number : fallback;
}

function boundedPositiveOr(value, fallback) {
  return Math.min(positiveOr(value, fallback), MAX_CANVAS_DIMENSION);
}

function boundedGroundCoordinate(value, fallback, extent) {
  return clamp(finiteOr(value, fallback), 0, extent);
}

function radiusAtFixedCenter(center, desiredRadius, extent) {
  return Math.max(0, Math.min(desiredRadius, center, extent - center));
}

function clampEllipseCenter(center, radius, extent) {
  return clamp(center, radius, Math.max(radius, extent - radius));
}
