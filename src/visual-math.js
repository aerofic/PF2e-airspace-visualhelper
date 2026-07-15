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

// PIXI cannot usefully render near-Number.MAX coordinates. Bounding source
// dimensions also prevents otherwise finite inputs from overflowing later
// additions and distance calculations.
const MAX_CANVAS_DIMENSION = 1_000_000;
const MAX_HEIGHT_STEPS = 1_000_000;
const SHADOW_DIRECTION_X = 0;
const SHADOW_DIRECTION_Y = 1;

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
  // Exact tactical presentation curve: each 10 ft lifts the artwork by 5% of
  // its own footprint height, capped at 30% from 60 ft onward.
  const visualLift = safeElevation / 200;
  const clearanceGrids = clamp(
    Number.isFinite(visualLift) ? Math.max(visualLift, Number.MIN_VALUE) : 0.3,
    Number.MIN_VALUE,
    0.3
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
      lift: 0,
      lean: 0,
      halfVisual,
      heightCurve
    };
  }

  // Offset is proportional to this Token's own footprint, not global grid size.
  const lift = height * heightCurve.clearanceGrids;
  const lean = 0;
  const tokenOffset = { x: 0, y: -lift };
  const tokenCenter = {
    x: ground.x + tokenOffset.x,
    y: ground.y + tokenOffset.y
  };

  return {
    flying: true,
    ground,
    tokenCenter,
    tokenOffset,
    lift,
    lean,
    halfVisual,
    heightCurve
  };
}

/**
 * Convert rules-space elevation into a compressed tabletop lift and shadow.
 * The HUD preserves the exact value; Canvas geometry remains inside or very
 * near the Token's real footprint.
 */
export function calculateVisualMetrics({
  elevation,
  gridSize,
  gridDistance,
  tokenWidth,
  tokenHeight,
  groundX,
  groundY,
  shadowOpacity
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

  if (safeElevation === 0) return emptyMetrics({ pose });

  const { signal, takeoff } = pose.heightCurve;
  const equivalentRadius = calculateEquivalentRadius(width, height);

  const normalizedShadowOpacity = clamp(finiteOr(shadowOpacity, 0), 0, 1);
  // Let the cast center drift only a small fraction of the visual lift. The
  // strict cap keeps it unmistakably attached to the original rules square.
  const desiredShadowDistance = clamp(
    pose.lift * 0.15,
    0,
    Math.min(height * 0.045, 6)
  );
  const shadowX = pose.ground.x;
  const shadowY = pose.ground.y + desiredShadowDistance;
  const shadowProjectionScale = 0.88 - (0.1 * signal);
  const shadowSoftness = 0.055 + (0.065 * signal);
  const shadowFalloff = 1 - (0.14 * signal);
  const shadowWidth = Math.min(width * shadowProjectionScale, safeGridSize * 8);
  const shadowHeight = Math.min(height * shadowProjectionScale, safeGridSize * 8);
  const shadowRadiusX = shadowWidth * 0.5;
  const shadowRadiusY = shadowHeight * 0.5;

  const perspectiveGrowth = Math.min(0.025, (safeGridSize * 0.0125) / equivalentRadius);
  const perspectiveScale = 1 + (signal * perspectiveGrowth);
  const alphaMultiplier = 1 - (0.018 * signal);

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
      bobAmplitude: takeoff * clamp(safeGridSize * (0.011 + (signal * 0.011)), 1.1, 2.25)
    },
    shadow: {
      x: shadowX,
      y: shadowY,
      radiusX: shadowRadiusX,
      radiusY: shadowRadiusY,
      width: shadowWidth,
      height: shadowHeight,
      alpha: normalizedShadowOpacity * shadowFalloff * takeoff,
      distance: desiredShadowDistance,
      directionX: SHADOW_DIRECTION_X,
      directionY: SHADOW_DIRECTION_Y,
      projectionScale: shadowProjectionScale,
      softness: shadowSoftness,
      groundX: pose.ground.x,
      groundY: pose.ground.y
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

/** Smooth acceleration and deceleration for elevation visual changes. */
export function easeInOutCosine(progress) {
  const t = clamp(finiteOr(progress, 0), 0, 1);
  return (1 - Math.cos(Math.PI * t)) / 2;
}

function calculateEquivalentRadius(width, height) {
  // sqrt(a) * sqrt(b) avoids an unnecessary width*height overflow.
  const equivalentDiameter = Math.sqrt(width) * Math.sqrt(height);
  return Math.max(equivalentDiameter * 0.5, Number.EPSILON);
}

function emptyMetrics({ pose }) {
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
    shadow: {
      x: ground.x,
      y: ground.y,
      radiusX: 0,
      radiusY: 0,
      width: 0,
      height: 0,
      alpha: 0,
      distance: 0,
      directionX: SHADOW_DIRECTION_X,
      directionY: SHADOW_DIRECTION_Y,
      projectionScale: 1,
      softness: 0,
      groundX: ground.x,
      groundY: ground.y
    }
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
