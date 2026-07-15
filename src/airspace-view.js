import { VISUAL_EPSILON } from "./constants.js";
import { normalizeHudElevation } from "./visual-math.js";

export const AIRSPACE_VIEW_WIDTH = 318;
export const AIRSPACE_VIEW_HEIGHT = 348;
export const AIRSPACE_ZOOM_MIN = 0.55;
export const AIRSPACE_ZOOM_MAX = 2.4;
export const AIRSPACE_PITCH_MIN = Math.PI / 10;
export const AIRSPACE_PITCH_MAX = (Math.PI * 2) / 5;
export const DEFAULT_AIRSPACE_CAMERA = Object.freeze({
  yaw: Math.PI / 4,
  pitch: Math.PI / 6,
  zoom: 1
});

const GROUND_CENTER_Y = 272;
const GROUND_RADIUS_X = 230;
const MAX_VERTICAL_PIXELS = 360;

/** Stable, non-mutating back-to-front sort for the current orbit camera. */
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
 * Project actual relative X/Y and elevation into an orbitable local airspace.
 * Horizontal geometry is linear inside the selected radius; vertical geometry
 * is also linear within the current view and retains exact labels.
 */
export function buildAirspaceView(entries, {
  selectedId = null,
  radiusSpaces = 8,
  gridDistance = 5,
  width = AIRSPACE_VIEW_WIDTH,
  height = AIRSPACE_VIEW_HEIGHT,
  camera = DEFAULT_AIRSPACE_CAMERA
} = {}) {
  const safeRadius = positiveOr(radiusSpaces, 8);
  const safeGridDistance = positiveOr(gridDistance, 5);
  const safeWidth = positiveOr(width, AIRSPACE_VIEW_WIDTH);
  const safeHeight = positiveOr(height, AIRSPACE_VIEW_HEIGHT);
  const safeCamera = normalizeAirspaceCamera(camera);
  const centerX = safeWidth / 2;
  const baseGroundRadiusX = Math.min(GROUND_RADIUS_X, (safeWidth - 38) / 2);
  const pitchDepth = Math.sin(safeCamera.pitch);
  const baseGroundRadiusY = baseGroundRadiusX * pitchDepth;
  const defaultGroundDepth = baseGroundRadiusX * Math.sin(DEFAULT_AIRSPACE_CAMERA.pitch);
  const groundCenterY = Math.min(
    safeHeight - (AIRSPACE_VIEW_HEIGHT - GROUND_CENTER_Y),
    safeHeight - defaultGroundDepth - 12
  );
  const groundRadiusX = baseGroundRadiusX * safeCamera.zoom;
  const groundRadiusY = baseGroundRadiusY * safeCamera.zoom;
  const elevations = entries.map(entry => normalizeHudElevation(entry.elevation));
  const minimumElevation = Math.min(0, ...elevations);
  const maximumElevation = Math.max(0, ...elevations);
  const positiveSpan = Math.max(0, maximumElevation);
  const negativeSpan = Math.max(0, -minimumElevation);
  const verticalBudget = Math.min(MAX_VERTICAL_PIXELS, groundCenterY - 48);
  const belowBudget = Math.min(46, verticalBudget * 0.24);
  const aboveBudget = verticalBudget - (negativeSpan > 0 ? belowBudget : 0);
  const nominalVerticalScale = (baseGroundRadiusX / (safeRadius * safeGridDistance))
    * Math.cos(safeCamera.pitch);
  const fittedVerticalScale = calculateVerticalScale({
    positiveSpan,
    negativeSpan,
    aboveBudget,
    belowBudget,
    nominal: nominalVerticalScale
  });
  const verticalScale = fittedVerticalScale * safeCamera.zoom;

  const projectGround = (dx, dy) => projectGroundPoint(dx, dy, {
    centerX,
    groundCenterY,
    radiusSpaces: safeRadius,
    radiusX: baseGroundRadiusX,
    camera: safeCamera
  });

  const nodes = entries.map(entry => {
    const elevation = normalizeHudElevation(entry.elevation);
    const dx = finiteOr(entry.dxSpaces, 0);
    const dy = finiteOr(entry.dySpaces, 0);
    const groundPoint = projectGround(dx, dy);
    const groundX = groundPoint.x;
    const groundY = groundPoint.y;
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
    camera: safeCamera,
    minimumElevation,
    maximumElevation,
    verticalScale,
    gridLines: buildGroundGrid({ radiusSpaces: safeRadius, projectGround }),
    altitudeTicks: buildAltitudeTicks({
      minimumElevation,
      maximumElevation,
      verticalScale,
      groundCenterY
    }),
    nodes: sortAirspaceEntries(nodes)
  };
}

/** Clamp camera state so pointer and wheel input can never create invalid CSS. */
export function normalizeAirspaceCamera(camera = {}) {
  return {
    yaw: normalizeRadians(finiteOr(camera.yaw, DEFAULT_AIRSPACE_CAMERA.yaw)),
    pitch: clamp(
      finiteOr(camera.pitch, DEFAULT_AIRSPACE_CAMERA.pitch),
      AIRSPACE_PITCH_MIN,
      AIRSPACE_PITCH_MAX
    ),
    zoom: clamp(finiteOr(camera.zoom, DEFAULT_AIRSPACE_CAMERA.zoom), AIRSPACE_ZOOM_MIN, AIRSPACE_ZOOM_MAX)
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

function buildGroundGrid({ radiusSpaces, projectGround }) {
  const lines = [];
  for (const fraction of [-1, -0.5, 0, 0.5, 1]) {
    const offset = fraction * radiusSpaces;
    const xStart = projectGround(offset, -radiusSpaces);
    const xEnd = projectGround(offset, radiusSpaces);
    const yStart = projectGround(-radiusSpaces, offset);
    const yEnd = projectGround(radiusSpaces, offset);
    lines.push({
      x1: xStart.x,
      y1: xStart.y,
      x2: xEnd.x,
      y2: xEnd.y
    });
    lines.push({
      x1: yStart.x,
      y1: yStart.y,
      x2: yEnd.x,
      y2: yEnd.y
    });
  }
  return lines;
}

function projectGroundPoint(dx, dy, {
  centerX,
  groundCenterY,
  radiusSpaces,
  radiusX,
  camera
}) {
  const cosYaw = Math.cos(camera.yaw);
  const sinYaw = Math.sin(camera.yaw);
  const rotatedX = (dx * cosYaw) - (dy * sinYaw);
  const rotatedY = (dx * sinYaw) + (dy * cosYaw);
  const horizontalScale = (radiusX / radiusSpaces) * camera.zoom;
  return {
    x: centerX + (rotatedX * horizontalScale),
    y: groundCenterY + (rotatedY * horizontalScale * Math.sin(camera.pitch))
  };
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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeRadians(value) {
  const tau = Math.PI * 2;
  return ((value % tau) + tau) % tau;
}
