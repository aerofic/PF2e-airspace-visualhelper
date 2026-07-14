import { HUD_FILTERS, VISUAL_EPSILON } from "./constants.js";
import { normalizeHudElevation } from "./visual-math.js";

export const ALTITUDE_STEP_FEET = 5;
const PIXELS_PER_STEP = 24;
const AXIS_PADDING = 32;
const MIN_AXIS_SPAN_FEET = 25;
const CLOSE_NODE_PIXELS = 30;
const MAX_AXIS_TICKS = 240;
const MAX_AXIS_BODY_PIXELS = 24_000;
const MIN_AXIS_WIDTH = 720;
const AXIS_NODE_LEFT = 80;
const AXIS_NODE_WIDTH = 245;
const AXIS_LANE_OFFSET = 252;
const AXIS_TRAILING_SPACE = 32;

/** Stable, non-mutating high-to-low sort. Every Token remains its own row. */
export function sortAltitudeEntries(entries) {
  return [...entries].sort((left, right) => {
    const heightDifference = normalizeHudElevation(right.elevation) - normalizeHudElevation(left.elevation);
    if (Math.abs(heightDifference) > VISUAL_EPSILON) return heightDifference;
    const nameDifference = String(left.name).localeCompare(String(right.name), gameLocale());
    return nameDifference || String(left.id).localeCompare(String(right.id));
  });
}

/** Apply the intentionally simple ALL / GROUND / AIR filter. */
export function filterAltitudeEntries(entries, filter = HUD_FILTERS.ALL) {
  if (filter === HUD_FILTERS.GROUND) {
    return entries.filter(entry => Math.abs(normalizeHudElevation(entry.elevation)) <= VISUAL_EPSILON);
  }
  if (filter === HUD_FILTERS.AIR) {
    return entries.filter(entry => normalizeHudElevation(entry.elevation) > VISUAL_EPSILON);
  }
  return [...entries];
}

/**
 * Build a linear vertical axis. Token positions are never bucketed or merged;
 * a 5 ft difference always occupies the same pixel distance at every height.
 */
export function buildAltitudeAxis(entries, {
  step = ALTITUDE_STEP_FEET,
  pixelsPerStep = PIXELS_PER_STEP,
  padding = AXIS_PADDING,
  minimumSpan = MIN_AXIS_SPAN_FEET
} = {}) {
  const safeStep = positiveOr(step, ALTITUDE_STEP_FEET);
  const safePixels = positiveOr(pixelsPerStep, PIXELS_PER_STEP);
  const safePadding = Math.max(0, Number(padding) || 0);
  const sorted = sortAltitudeEntries(entries);
  const elevations = sorted.map(entry => normalizeHudElevation(entry.elevation));
  const actualMinimum = Math.min(0, ...elevations);
  const actualMaximum = Math.max(0, ...elevations);
  const snappedMinimum = Math.floor(actualMinimum / safeStep) * safeStep;
  const minimum = Number.isFinite(snappedMinimum) ? snappedMinimum : actualMinimum;
  const snappedMaximum = Math.ceil(actualMaximum / safeStep) * safeStep;
  const maximum = Math.max(
    minimum + positiveOr(minimumSpan, MIN_AXIS_SPAN_FEET),
    Number.isFinite(snappedMaximum) ? snappedMaximum : actualMaximum
  );
  const rawSteps = (maximum / safeStep) - (minimum / safeStep);
  const steps = Number.isFinite(rawSteps)
    ? Math.max(1, Math.ceil(rawSteps))
    : Number.MAX_SAFE_INTEGER;
  // Preserve a linear scale while bounding pathological Scene elevations to a
  // browser-safe scroll height. Normal PF2e encounters retain 24 px per 5 ft.
  const bodyHeight = Math.min(steps * safePixels, MAX_AXIS_BODY_PIXELS);
  const height = (safePadding * 2) + bodyHeight;
  const yForElevation = elevation => safePadding
    + (stableAxisRatio(normalizeHudElevation(elevation), minimum, maximum) * bodyHeight);

  // Tick density is presentational only. Token nodes always retain their exact
  // linearly-proportional position, but huge spans cannot create unbounded DOM.
  const tickSegments = Math.min(steps, MAX_AXIS_TICKS);
  const ticks = Array.from({ length: tickSegments + 1 }, (_, index) => {
    const ratio = index / tickSegments;
    const elevation = stableInterpolate(maximum, minimum, ratio);
    return {
      elevation,
      y: safePadding + (ratio * bodyHeight),
      major: (index === 0) || (index === tickSegments) || isMajorTick(elevation, safeStep)
    };
  });

  const laneLastY = [];
  const nodes = sorted.map(entry => {
    const y = yForElevation(entry.elevation);
    let lane = laneLastY.findIndex(lastY => Math.abs(lastY - y) >= CLOSE_NODE_PIXELS);
    // Lanes are intentionally unbounded: every Token remains independently
    // reachable even when twenty creatures share elevation 0 in a normal fight.
    if (lane < 0) lane = laneLastY.length;
    laneLastY[lane] = y;
    return { ...entry, axisY: y, lane };
  });
  const maximumLane = nodes.reduce((highest, node) => Math.max(highest, node.lane), 0);
  const width = Math.max(
    MIN_AXIS_WIDTH,
    AXIS_NODE_LEFT + (maximumLane * AXIS_LANE_OFFSET) + AXIS_NODE_WIDTH + AXIS_TRAILING_SPACE
  );

  return { minimum, maximum, height, width, ticks, nodes };
}

/** Format exact finite heights without forcing them into 5 ft buckets. */
export function formatFeet(value) {
  const elevation = normalizeHudElevation(value);
  const scaled = elevation * 100;
  if (!Number.isFinite(scaled)) return String(elevation);
  const rounded = Math.round(scaled) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function isMajorTick(value, step) {
  const majorStep = step * 5;
  return Math.abs(value % majorStep) <= VISUAL_EPSILON;
}

function positiveOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && (number > 0) ? number : fallback;
}

/** Calculate an overflow-safe ratio where maximum maps to 0 and minimum to 1. */
function stableAxisRatio(value, minimum, maximum) {
  if (maximum === minimum) return 0;
  const scale = Math.max(Math.abs(minimum), Math.abs(maximum), Math.abs(value), 1);
  const denominator = (maximum / scale) - (minimum / scale);
  if (!Number.isFinite(denominator) || (Math.abs(denominator) <= Number.EPSILON)) return 0;
  return Math.min(Math.max(((maximum / scale) - (value / scale)) / denominator, 0), 1);
}

/** Convex interpolation avoids overflowing maximum - minimum. */
function stableInterpolate(maximum, minimum, ratio) {
  if (ratio <= 0) return maximum;
  if (ratio >= 1) return minimum;
  return (maximum * (1 - ratio)) + (minimum * ratio);
}

function gameLocale() {
  return globalThis.game?.i18n?.lang ?? undefined;
}
