import { HUD_FILTERS, VISUAL_EPSILON } from "./constants.js";
import { normalizeHudElevation } from "./visual-math.js";

export const ALTITUDE_STEP_FEET = 5;
export const RELATIVE_LEVEL_GAP_PIXELS = 32;
const AXIS_PADDING = 18;
const MIN_AXIS_WIDTH = 192;
const AXIS_NODE_LEFT = 46;
const AXIS_NODE_WIDTH = 132;
const AXIS_LANE_OFFSET = 138;
const AXIS_TRAILING_SPACE = 12;

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
 * Build a compact relative-height axis.
 *
 * Exact elevations remain visible on every Token node, but vertical pixels no
 * longer claim to be rules distance: each distinct elevation occupies one
 * equally spaced visual level. Tokens at the same elevation share that level
 * and receive independent horizontal lanes. Both dimensions grow with content
 * and deliberately have no hard upper bound.
 */
export function buildAltitudeAxis(entries, {
  levelGap = RELATIVE_LEVEL_GAP_PIXELS,
  padding = AXIS_PADDING,
  nodeLeft = AXIS_NODE_LEFT,
  nodeWidth = AXIS_NODE_WIDTH,
  laneOffset = AXIS_LANE_OFFSET,
  trailingSpace = AXIS_TRAILING_SPACE,
  minimumWidth = MIN_AXIS_WIDTH
} = {}) {
  const safeGap = positiveOr(levelGap, RELATIVE_LEVEL_GAP_PIXELS);
  const safePadding = Math.max(0, finiteOr(padding, AXIS_PADDING));
  const safeNodeLeft = Math.max(0, finiteOr(nodeLeft, AXIS_NODE_LEFT));
  const safeNodeWidth = positiveOr(nodeWidth, AXIS_NODE_WIDTH);
  const safeLaneOffset = positiveOr(laneOffset, AXIS_LANE_OFFSET);
  const safeTrailing = Math.max(0, finiteOr(trailingSpace, AXIS_TRAILING_SPACE));
  const safeMinimumWidth = Math.max(0, finiteOr(minimumWidth, MIN_AXIS_WIDTH));
  const sorted = sortAltitudeEntries(entries);
  const levels = [];

  for (const entry of sorted) {
    const elevation = normalizeHudElevation(entry.elevation);
    const current = levels.at(-1);
    if (!current || (Math.abs(current.elevation - elevation) > VISUAL_EPSILON)) {
      levels.push({ elevation, entries: [entry] });
    } else {
      current.entries.push(entry);
    }
  }

  const nodes = [];
  const ticks = [];
  let maximumLane = 0;
  for (let levelIndex = 0; levelIndex < levels.length; levelIndex += 1) {
    const level = levels[levelIndex];
    const y = safePadding + (levelIndex * safeGap);
    ticks.push({ elevation: level.elevation, y, major: true });
    level.entries.forEach((entry, lane) => {
      maximumLane = Math.max(maximumLane, lane);
      nodes.push({ ...entry, axisY: y, lane, relativeLevel: levelIndex });
    });
  }

  const minimum = levels.at(-1)?.elevation ?? 0;
  const maximum = levels[0]?.elevation ?? 0;
  const height = (safePadding * 2) + (Math.max(0, levels.length - 1) * safeGap);
  const width = Math.max(
    safeMinimumWidth,
    safeNodeLeft + (maximumLane * safeLaneOffset) + safeNodeWidth + safeTrailing
  );

  return { minimum, maximum, height, width, ticks, nodes, levelCount: levels.length };
}

/** Format exact finite heights without forcing them into 5 ft buckets. */
export function formatFeet(value) {
  const elevation = normalizeHudElevation(value);
  const scaled = elevation * 100;
  if (!Number.isFinite(scaled)) return String(elevation);
  const rounded = Math.round(scaled) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function positiveOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && (number > 0) ? number : fallback;
}

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function gameLocale() {
  return globalThis.game?.i18n?.lang ?? undefined;
}
