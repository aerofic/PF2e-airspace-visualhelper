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
  standOpacity,
  shadowOpacity,
  projectionOpacity,
  shadowDistanceMultiplier
}) {
  const safeElevation = normalizeFlyingElevation(elevation);
  const safeGridSize = positiveOr(gridSize, 100);
  const safeGridDistance = positiveOr(gridDistance, 5);
  const width = positiveOr(tokenWidth, safeGridSize);
  const height = positiveOr(tokenHeight, safeGridSize);
  const centerX = width / 2;
  const tokenCenterY = height / 2;
  const tokenBottomY = height - clamp(safeGridSize * 0.035, 2, 6);

  if (safeElevation === 0) {
    return emptyMetrics({ centerX, tokenCenterY, tokenBottomY, height });
  }

  const gridSteps = safeElevation / safeGridDistance;
  const heightBand = safeElevation <= 30 ? 0 : safeElevation <= 100 ? 1 : 2;
  const bandBoost = 1 + (heightBand * 0.06);
  const standLength = clamp(
    safeGridSize * (0.12 + (0.32 * Math.sqrt(gridSteps))) * bandBoost,
    safeGridSize * 0.28,
    safeGridSize * 3.2
  );
  const groundY = height + standLength;
  const lineWidth = clamp(safeGridSize * (0.035 + (heightBand * 0.004)), 2.25, 8);
  const tokenReference = Math.min(width, height);

  const distanceMultiplier = clamp(Number(shadowDistanceMultiplier) || 1, 0.25, 3);
  const shadowDistance = standLength * distanceMultiplier;
  const shadowScale = clamp(0.98 - (Math.log1p(gridSteps) * 0.075), 0.58, 0.94);
  const shadowFalloff = clamp(0.94 - (Math.log1p(gridSteps) * 0.17), 0.2, 0.88);
  const shadowRadiusX = tokenReference * 0.34 * shadowScale;

  const projectionFalloff = clamp(0.98 - (Math.log1p(gridSteps) * 0.14), 0.28, 0.92);
  const dashLength = clamp(safeGridSize * 0.06, 4, 10);
  const normalizedStandOpacity = clamp(Number(standOpacity) || 0, 0, 1);

  return {
    flying: true,
    stand: {
      centerX,
      tokenCenterY,
      tokenBottomY,
      groundY,
      length: standLength,
      width: lineWidth,
      opacity: normalizedStandOpacity
    },
    base: {
      x: centerX,
      y: groundY,
      radiusX: clamp(tokenReference * 0.17, 7, safeGridSize * 0.28),
      radiusY: clamp(safeGridSize * 0.035, 2.5, 6)
    },
    shadow: {
      x: centerX + (shadowDistance * 0.22),
      y: height + shadowDistance,
      radiusX: shadowRadiusX,
      radiusY: shadowRadiusX * 0.32,
      alpha: clamp(Number(shadowOpacity) || 0, 0, 1) * shadowFalloff
    },
    projection: {
      x: centerX,
      startY: tokenBottomY,
      endY: groundY,
      markerRadius: clamp(tokenReference * 0.105, 5, safeGridSize * 0.18),
      dashLength,
      gapLength: dashLength * 0.75,
      lineWidth: clamp(safeGridSize * 0.018, 1.5, 4),
      alpha: clamp(Number(projectionOpacity) || 0, 0, 1) * projectionFalloff
    },
    liftGlow: {
      x: centerX,
      y: tokenCenterY,
      radiusX: clamp(tokenReference * 0.16, 7, safeGridSize * 0.28),
      radiusY: clamp(safeGridSize * 0.024, 2, 5),
      alpha: normalizedStandOpacity * clamp(0.055 + (heightBand * 0.018), 0.055, 0.095)
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

function emptyMetrics({ centerX, tokenCenterY, tokenBottomY, height }) {
  return {
    flying: false,
    stand: {
      centerX,
      tokenCenterY,
      tokenBottomY,
      groundY: height,
      length: 0,
      width: 0,
      opacity: 0
    },
    base: { x: centerX, y: height, radiusX: 0, radiusY: 0 },
    shadow: { x: centerX, y: height, radiusX: 0, radiusY: 0, alpha: 0 },
    projection: {
      x: centerX,
      startY: tokenBottomY,
      endY: height,
      markerRadius: 0,
      dashLength: 0,
      gapLength: 0,
      lineWidth: 0,
      alpha: 0
    },
    liftGlow: { x: centerX, y: tokenCenterY, radiusX: 0, radiusY: 0, alpha: 0 }
  };
}

function positiveOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && (number > 0) ? number : fallback;
}
