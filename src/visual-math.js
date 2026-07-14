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
const MAX_STAND_LEAN_GRIDS = 1.5;
const SHADOW_OUTER_SCALE_X = 1.24;
const SHADOW_OUTER_SCALE_Y = 1.34;

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
  // Keep enough of the art above the original footprint for elongated Tokens.
  // The old 1.5-grid upper cap left 1x4 and 2x3 art overlapping the base.
  const halfVisual = Math.max(height * 0.5, safeGridSize * 0.3);

  if (safeElevation === 0) {
    return {
      flying: false,
      ground,
      tokenCenter: { ...ground },
      tokenOffset: { x: 0, y: 0 },
      standTop: { ...ground },
      lift: 0,
      lean: 0,
      halfVisual
    };
  }

  const gridSteps = safeElevation / safeGridDistance;
  const heightBand = safeElevation <= 30 ? 0 : safeElevation <= 100 ? 1 : 2;
  const bandBoost = 1 + (heightBand * 0.06);
  const clearance = clamp(
    safeGridSize * (0.08 + (0.18 * Math.sqrt(gridSteps))) * bandBoost,
    safeGridSize * 0.18,
    safeGridSize * 1.6
  );
  const lift = halfVisual + clearance;
  // Target 12 degrees from vertical. The generous cap is only a guard for
  // pathological custom Token dimensions, not a normal pose constraint.
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
    halfVisual
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

  if (safeElevation === 0) {
    return emptyMetrics({ pose });
  }

  const gridSteps = safeElevation / safeGridDistance;
  const heightBand = safeElevation <= 30 ? 0 : safeElevation <= 100 ? 1 : 2;
  const standLength = Math.hypot(
    pose.ground.x - pose.standTop.x,
    pose.ground.y - pose.standTop.y
  );
  const lineWidth = clamp(safeGridSize * (0.048 + (heightBand * 0.004)), 4, 9);
  const tokenReference = Math.min(width, height);

  const distanceMultiplier = clamp(Number(shadowDistanceMultiplier) || 1, 0.25, 3);
  const shadowDistance = clamp(
    pose.lift * 0.14 * distanceMultiplier,
    safeGridSize * 0.04,
    safeGridSize * 0.42
  );
  const shadowScale = clamp(1 - (Math.log1p(gridSteps) * 0.08), 0.62, 0.96);
  const shadowFalloff = clamp(1.08 - (Math.log1p(gridSteps) * 0.12), 0.42, 1);
  const desiredShadowRadiusX = tokenReference * 0.38 * shadowScale;
  // Account for ShadowRenderer's outer soft ellipse so the complete visual,
  // rather than only its nominal radius, remains in the footprint bounds.
  const shadowRadiusX = Math.min(
    desiredShadowRadiusX,
    width / (2 * SHADOW_OUTER_SCALE_X)
  );
  const shadowRadiusY = Math.min(
    desiredShadowRadiusX * 0.34,
    height / (2 * SHADOW_OUTER_SCALE_Y)
  );
  const shadowX = clampEllipseCenter(
    pose.ground.x + (shadowDistance * 0.82),
    shadowRadiusX * SHADOW_OUTER_SCALE_X,
    width
  );
  const shadowY = clampEllipseCenter(
    pose.ground.y + (shadowDistance * 0.36),
    shadowRadiusY * SHADOW_OUTER_SCALE_Y,
    height
  );

  const projectionFalloff = clamp(1.02 - (Math.log1p(gridSteps) * 0.1), 0.35, 0.96);
  const dashLength = clamp(safeGridSize * 0.07, 5, 11);
  const normalizedStandOpacity = clamp(Number(standOpacity) || 0, 0, 1);
  const normalizedShadowOpacity = clamp(Number(shadowOpacity) || 0, 0, 1);
  const baseRadiusX = radiusAtFixedCenter(
    pose.ground.x,
    clamp(tokenReference * 0.28, safeGridSize * 0.14, safeGridSize * 0.4),
    width
  );
  const baseRadiusY = radiusAtFixedCenter(
    pose.ground.y,
    clamp(safeGridSize * 0.075, 5, 11),
    height
  );
  const contactRadiusX = Math.min(baseRadiusX * 0.92, width / 2);
  const contactRadiusY = Math.min(baseRadiusY * 1.08, height / 2);
  const contactX = clampEllipseCenter(pose.ground.x, contactRadiusX, width);
  const contactY = clampEllipseCenter(
    pose.ground.y + (baseRadiusY * 0.28),
    contactRadiusY,
    height
  );

  return {
    flying: true,
    token: {
      offsetX: pose.tokenOffset.x,
      offsetY: pose.tokenOffset.y,
      centerX: pose.tokenCenter.x,
      centerY: pose.tokenCenter.y
    },
    stand: {
      topX: pose.standTop.x,
      topY: pose.standTop.y,
      baseX: pose.ground.x,
      baseY: pose.ground.y,
      length: standLength,
      width: lineWidth,
      opacity: normalizedStandOpacity
    },
    base: {
      x: pose.ground.x,
      y: pose.ground.y,
      radiusX: baseRadiusX,
      radiusY: baseRadiusY
    },
    shadow: {
      x: shadowX,
      y: shadowY,
      radiusX: shadowRadiusX,
      radiusY: shadowRadiusY,
      alpha: normalizedShadowOpacity * shadowFalloff,
      contactX,
      contactY,
      contactRadiusX,
      contactRadiusY,
      contactAlpha: normalizedShadowOpacity * 0.3
    },
    projection: {
      startX: pose.standTop.x,
      startY: pose.standTop.y,
      endX: pose.ground.x,
      endY: pose.ground.y,
      markerRadius: Math.min(
        clamp(tokenReference * 0.12, 6, safeGridSize * 0.2),
        pose.ground.x,
        width - pose.ground.x,
        pose.ground.y,
        height - pose.ground.y
      ),
      dashLength,
      gapLength: dashLength * 0.68,
      lineWidth: clamp(safeGridSize * 0.022, 1.75, 4.5),
      alpha: clamp(Number(projectionOpacity) || 0, 0, 1) * projectionFalloff
    },
    liftGlow: {
      x: pose.tokenCenter.x,
      y: pose.tokenCenter.y,
      radiusX: clamp(tokenReference * 0.19, 8, safeGridSize * 0.3),
      radiusY: clamp(safeGridSize * 0.035, 3, 6),
      alpha: normalizedStandOpacity * clamp(0.16 + (heightBand * 0.03), 0.16, 0.22)
    }
  };
}

/** Duration is bounded so both 5 ft and extreme changes remain responsive. */
export function calculateAnimationDuration(from, to, gridDistance = 5) {
  const deltaSteps = Math.abs(normalizeFlyingElevation(to) - normalizeFlyingElevation(from))
    / positiveOr(gridDistance, 5);
  return clamp(240 + (deltaSteps * 18), 260, 650);
}

/** Smooth acceleration and deceleration for stand/projection movement. */
export function easeInOutCosine(progress) {
  const t = clamp(progress, 0, 1);
  return (1 - Math.cos(Math.PI * t)) / 2;
}

function emptyMetrics({ pose }) {
  return {
    flying: false,
    token: {
      offsetX: 0,
      offsetY: 0,
      centerX: pose.ground.x,
      centerY: pose.ground.y
    },
    stand: {
      topX: pose.ground.x,
      topY: pose.ground.y,
      baseX: pose.ground.x,
      baseY: pose.ground.y,
      length: 0,
      width: 0,
      opacity: 0
    },
    base: { x: pose.ground.x, y: pose.ground.y, radiusX: 0, radiusY: 0 },
    shadow: {
      x: pose.ground.x,
      y: pose.ground.y,
      radiusX: 0,
      radiusY: 0,
      alpha: 0,
      contactX: pose.ground.x,
      contactY: pose.ground.y,
      contactRadiusX: 0,
      contactRadiusY: 0,
      contactAlpha: 0
    },
    projection: {
      startX: pose.ground.x,
      startY: pose.ground.y,
      endX: pose.ground.x,
      endY: pose.ground.y,
      markerRadius: 0,
      dashLength: 0,
      gapLength: 0,
      lineWidth: 0,
      alpha: 0
    },
    liftGlow: { x: pose.ground.x, y: pose.ground.y, radiusX: 0, radiusY: 0, alpha: 0 }
  };
}

function positiveOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && (number > 0) ? number : fallback;
}

function boundedPositiveOr(value, fallback) {
  return Math.min(positiveOr(value, fallback), MAX_CANVAS_DIMENSION);
}

function boundedGroundCoordinate(value, fallback, extent) {
  const number = Number(value);
  return clamp(Number.isFinite(number) ? number : fallback, 0, extent);
}

function radiusAtFixedCenter(center, desiredRadius, extent) {
  return Math.max(0, Math.min(desiredRadius, center, extent - center));
}

function clampEllipseCenter(center, radius, extent) {
  return clamp(center, radius, Math.max(radius, extent - radius));
}
