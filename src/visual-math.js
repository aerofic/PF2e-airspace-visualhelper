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
const SHADOW_DIRECTION_Y = 0;

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
  // A strict top-down camera collapses vertical distance. Preserve only a
  // tiny screen-space parallax so the model can breathe without appearing to
  // occupy a different grid square. Shadow travel carries the real height cue.
  const clearanceGrids = clamp(
    (0.025 * takeoff) + (0.035 * signal),
    0,
    0.06
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

  // In top-down tactical mode the physical support lies on the camera axis.
  // A bounded 2.5-6% grid parallax prevents a perfectly static appearance but
  // never exposes a side-view stand or displaces the model into another cell.
  const lift = safeGridSize * heightCurve.clearanceGrids;
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
  projectionOpacity
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
  const equivalentRadius = calculateEquivalentRadius(width, height);

  const normalizedStandOpacity = clamp(finiteOr(standOpacity, 0), 0, 1);
  const normalizedShadowOpacity = clamp(finiteOr(shadowOpacity, 0), 0, 1);
  const normalizedProjectionOpacity = clamp(finiteOr(projectionOpacity, 0), 0, 1);
  // Keep the established dense acrylic base: its refractive rim extends only
  // a few pixels past the artwork and is independent from the cast shadow.
  const rimOvershoot = clamp(safeGridSize * 0.045, 3, 7);
  const baseRadiusX = (width * 0.5) + rimOvershoot;
  const baseRadiusY = (height * 0.5) + rimOvershoot;
  const baseThickness = clamp(safeGridSize * 0.015, 1, 3);

  // The shadow stays directly below the TokenDocument footprint. It is a
  // grounded depth cue, never a second tactical position in a nearby square.
  // Additional legacy options are safely ignored by object destructuring.
  const desiredShadowDistance = 0;
  const shadowX = pose.ground.x;
  const shadowY = pose.ground.y;
  // Parallel light preserves silhouette proportions. A 90% core plus a small
  // penumbra keeps the full effect within the original Token footprint even
  // during ambient breathing.
  const shadowProjectionScale = 0.9;
  const shadowSoftness = 0.045 + (0.045 * signal);
  const shadowFalloff = 0.94 - (0.08 * signal);
  const shadowWidth = Math.min(width * shadowProjectionScale, safeGridSize * 8);
  const shadowHeight = Math.min(height * shadowProjectionScale, safeGridSize * 8);
  const shadowRadiusX = shadowWidth * 0.5;
  const shadowRadiusY = shadowHeight * 0.5;
  // The acrylic rod has a fixed physical diameter. Elevation changes the
  // length of its cast, never the apparent width of the object casting it.
  const shaftShadowWidth = clamp(safeGridSize * 0.045, 3.5, 7);
  const shaftShadowAlpha = normalizedShadowOpacity * takeoff * (0.9 - (0.08 * signal));
  // Only the small rod foot contacts the ground; a Token-sized concentric
  // contact disc was the source of the misleading halo in 0.5.0.
  const contactRadiusX = clamp(safeGridSize * 0.07, 5, 10);
  const contactRadiusY = contactRadiusX * 0.72;
  const contactCoreRadiusX = contactRadiusX * 0.52;
  const contactCoreRadiusY = contactRadiusY * 0.5;
  const contactX = pose.ground.x;
  const contactY = pose.ground.y + (baseThickness * 0.5);

  const perspectiveGrowth = Math.min(0.025, (safeGridSize * 0.0125) / equivalentRadius);
  const perspectiveScale = 1 + (signal * perspectiveGrowth);
  const alphaMultiplier = 1 - (0.018 * signal);

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
      bobAmplitude: takeoff * clamp(safeGridSize * (0.011 + (signal * 0.011)), 1.1, 2.25)
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
      x: pose.ground.x,
      y: pose.ground.y,
      length: 0,
      width: lineWidth * 1.25,
      radius: clamp(safeGridSize * 0.055, 4, 8)
    },
    base: {
      x: pose.ground.x,
      y: pose.ground.y,
      radiusX: baseRadiusX,
      radiusY: baseRadiusY,
      thickness: baseThickness,
      innerRadiusX: Math.max(0, baseRadiusX - rimOvershoot),
      innerRadiusY: Math.max(0, baseRadiusY - rimOvershoot),
      rimWidth: clamp(safeGridSize * 0.018, 1.5, 3.5)
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
      shaftStartX: pose.ground.x,
      shaftStartY: pose.ground.y,
      shaftEndX: shadowX,
      shaftEndY: shadowY,
      shaftWidth: shaftShadowWidth,
      shaftAlpha: shaftShadowAlpha,
      contactX,
      contactY,
      contactRadiusX,
      contactRadiusY,
      contactCoreRadiusX,
      contactCoreRadiusY,
      contactAlpha: normalizedShadowOpacity * 0.42 * takeoff,
      contactCoreAlpha: normalizedShadowOpacity * 0.58 * takeoff
    },
    projection: {
      startX: pose.ground.x,
      startY: pose.ground.y,
      endX: pose.ground.x,
      endY: pose.ground.y,
      markerRadius: Math.min(baseRadiusX, baseRadiusY),
      markerRadiusX: baseRadiusX * 1.025,
      markerRadiusY: baseRadiusY * 1.025,
      dashLength,
      gapLength: dashLength * 0.82,
      lineWidth: clamp(safeGridSize * 0.014, 1.25, 3),
      alpha: normalizedProjectionOpacity * projectionFalloff * takeoff,
      footprint: { x: 0, y: 0, width, height },
      reticleAlpha: normalizedProjectionOpacity * takeoff * (0.1 + (0.05 * (1 - signal)))
    },
    airAccent: {
      x: pose.tokenCenter.x,
      y: pose.ground.y,
      radiusX: baseRadiusX,
      radiusY: baseRadiusY,
      alpha: 0
    },
    // Alias retained for integrations written against V2 0.3.x.
    liftGlow: {
      x: pose.tokenCenter.x,
      y: pose.ground.y,
      radiusX: baseRadiusX,
      radiusY: baseRadiusY,
      alpha: 0
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

function calculateEquivalentRadius(width, height) {
  // sqrt(a) * sqrt(b) avoids an unnecessary width*height overflow.
  const equivalentDiameter = Math.sqrt(width) * Math.sqrt(height);
  return Math.max(equivalentDiameter * 0.5, Number.EPSILON);
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
      width: 0,
      height: 0,
      alpha: 0,
      distance: 0,
      directionX: SHADOW_DIRECTION_X,
      directionY: SHADOW_DIRECTION_Y,
      projectionScale: 1,
      softness: 0,
      shaftStartX: ground.x,
      shaftStartY: ground.y,
      shaftEndX: ground.x,
      shaftEndY: ground.y,
      shaftWidth: 0,
      shaftAlpha: 0,
      contactX: ground.x,
      contactY: ground.y,
      contactRadiusX: 0,
      contactRadiusY: 0,
      contactCoreRadiusX: 0,
      contactCoreRadiusY: 0,
      contactAlpha: 0,
      contactCoreAlpha: 0
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
