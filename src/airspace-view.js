import { VISUAL_EPSILON } from "./constants.js";
import { normalizeHudElevation } from "./visual-math.js";

export const AIRSPACE_VIEW_WIDTH = 318;
export const AIRSPACE_VIEW_HEIGHT = 348;

const GROUND_CENTER_X = AIRSPACE_VIEW_WIDTH / 2;
const GROUND_CENTER_Y = 272;
const GROUND_RADIUS_X = 128;
const GROUND_RADIUS_Y = 58;
const MAX_VERTICAL_PIXELS = 188;

/** Stable, non-mutating back-to-front sort for the fixed isometric camera. */
export function sortAirspaceEntries(entries) {
  return [...entries].sort((left, right) => {
    const depth = finiteOr(left.groundY, 0) - finiteOr(right.groundY, 0);
    if (Math.abs(depth) > VISUAL_EPSILON) return depth;
    const elevation = normalizeHudElevation(left.elevation) - normalizeHudElevation(right.elevation);
    if (Math.abs(elevation) > VISUAL_EPSILON) return elevation;
    return String(left.id).localeCompare(String(right.id));
  });
}

/**
 * Filter by real Canvas X/Y separation. This is a visual query only and never
 * participates in PF2e distance, movement, targeting range, or line of effect.
 */
export function collectEntriesWithinRadius(entries, selected, {
  gridSize = 100,
  radiusSpaces = 8
} = {}) {
  if (!selected) return [];
  const safeGridSize = positiveOr(gridSize, 100);
  const safeRadius = Math.max(0, finiteOr(radiusSpaces, 0));

  return entries.map(entry => {
    const dxSpaces = (finiteOr(entry.centerX, 0) - finiteOr(selected.centerX, 0)) / safeGridSize;
    const dySpaces = (finiteOr(entry.centerY, 0) - finiteOr(selected.centerY, 0)) / safeGridSize;
    return {
      ...entry,
      dxSpaces,
      dySpaces,
      distanceSpaces: Math.hypot(dxSpaces, dySpaces)
    };
  }).filter(entry => (entry.id === selected.id)
    || (entry.distanceSpaces <= safeRadius + VISUAL_EPSILON));
}

/**
 * Project actual relative X/Y and elevation into one fixed isometric airspace.
 * Horizontal geometry is linear inside the selected radius; vertical geometry
 * is also linear within the current view and retains exact labels.
 */
export function buildAirspaceView(entries, {
  selectedId = null,
  radiusSpaces = 8,
  gridDistance = 5,
  width = AIRSPACE_VIEW_WIDTH,
  height = AIRSPACE_VIEW_HEIGHT
} = {}) {
  const safeRadius = positiveOr(radiusSpaces, 8);
  const safeGridDistance = positiveOr(gridDistance, 5);
  const safeWidth = positiveOr(width, AIRSPACE_VIEW_WIDTH);
  const safeHeight = positiveOr(height, AIRSPACE_VIEW_HEIGHT);
  const centerX = safeWidth / 2;
  const groundCenterY = safeHeight - (AIRSPACE_VIEW_HEIGHT - GROUND_CENTER_Y);
  const groundRadiusX = Math.min(GROUND_RADIUS_X, (safeWidth - 38) / 2);
  const groundRadiusY = Math.min(GROUND_RADIUS_Y, (safeHeight - 60) / 3);
  const elevations = entries.map(entry => normalizeHudElevation(entry.elevation));
  const minimumElevation = Math.min(0, ...elevations);
  const maximumElevation = Math.max(0, ...elevations);
  const positiveSpan = Math.max(0, maximumElevation);
  const negativeSpan = Math.max(0, -minimumElevation);
  const verticalBudget = Math.min(MAX_VERTICAL_PIXELS, safeHeight - 116);
  const belowBudget = Math.min(46, verticalBudget * 0.24);
  const aboveBudget = verticalBudget - (negativeSpan > 0 ? belowBudget : 0);
  const nominalVerticalScale = (groundRadiusX / (safeRadius * safeGridDistance)) * 0.9;
  const verticalScale = calculateVerticalScale({
    positiveSpan,
    negativeSpan,
    aboveBudget,
    belowBudget,
    nominal: nominalVerticalScale
  });

  const nodes = entries.map(entry => {
    const elevation = normalizeHudElevation(entry.elevation);
    const dx = finiteOr(entry.dxSpaces, 0);
    const dy = finiteOr(entry.dySpaces, 0);
    const groundX = centerX + (((dx - dy) / (safeRadius * Math.SQRT2)) * groundRadiusX);
    const groundY = groundCenterY + (((dx + dy) / (safeRadius * Math.SQRT2)) * groundRadiusY);
    const tokenX = groundX;
    const tokenY = groundY - (elevation * verticalScale);
    const verticalLength = Math.abs(tokenY - groundY);
    return {
      ...entry,
      elevation,
      selected: entry.id === selectedId,
      groundX,
      groundY,
      tokenX,
      tokenY,
      verticalLength,
      lineTop: Math.min(tokenY, groundY),
      lineDirection: elevation < 0 ? "below" : "above"
    };
  });

  return {
    width: safeWidth,
    height: safeHeight,
    centerX,
    groundCenterY,
    groundRadiusX,
    groundRadiusY,
    minimumElevation,
    maximumElevation,
    verticalScale,
    gridLines: buildGroundGrid({ centerX, groundCenterY, groundRadiusX, groundRadiusY }),
    altitudeTicks: buildAltitudeTicks({
      minimumElevation,
      maximumElevation,
      verticalScale,
      groundCenterY
    }),
    nodes: sortAirspaceEntries(nodes)
  };
}

export function formatHeight(value) {
  const elevation = normalizeHudElevation(value);
  const scaled = elevation * 100;
  if (!Number.isFinite(scaled)) return String(elevation);
  const rounded = Math.round(scaled) / 100;
  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function calculateVerticalScale({ positiveSpan, negativeSpan, aboveBudget, belowBudget, nominal }) {
  const scales = [positiveOr(nominal, 1)];
  if (positiveSpan > VISUAL_EPSILON) scales.push(aboveBudget / positiveSpan);
  if (negativeSpan > VISUAL_EPSILON) scales.push(belowBudget / negativeSpan);
  const scale = Math.min(...scales);
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function buildGroundGrid({ centerX, groundCenterY, groundRadiusX, groundRadiusY }) {
  const lines = [];
  for (const fraction of [-1, -0.5, 0, 0.5, 1]) {
    lines.push({
      x1: centerX + ((fraction - -1) * groundRadiusX * 0.5),
      y1: groundCenterY + ((fraction + -1) * groundRadiusY * 0.5),
      x2: centerX + ((fraction - 1) * groundRadiusX * 0.5),
      y2: groundCenterY + ((fraction + 1) * groundRadiusY * 0.5)
    });
    lines.push({
      x1: centerX + ((-1 - fraction) * groundRadiusX * 0.5),
      y1: groundCenterY + ((-1 + fraction) * groundRadiusY * 0.5),
      x2: centerX + ((1 - fraction) * groundRadiusX * 0.5),
      y2: groundCenterY + ((1 + fraction) * groundRadiusY * 0.5)
    });
  }
  return lines;
}

function buildAltitudeTicks({ minimumElevation, maximumElevation, verticalScale, groundCenterY }) {
  const values = new Set([0, minimumElevation, maximumElevation]);
  if (maximumElevation > VISUAL_EPSILON) {
    values.add(maximumElevation / 2);
  }
  if (minimumElevation < -VISUAL_EPSILON) {
    values.add(minimumElevation / 2);
  }
  return [...values]
    .sort((left, right) => right - left)
    .map(elevation => ({
      elevation,
      y: groundCenterY - (elevation * verticalScale),
      major: Math.abs(elevation) <= VISUAL_EPSILON
        || Math.abs(elevation - minimumElevation) <= VISUAL_EPSILON
        || Math.abs(elevation - maximumElevation) <= VISUAL_EPSILON
    }));
}

function positiveOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
