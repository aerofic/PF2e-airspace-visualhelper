export const MODULE_ID = "pf2e-flying-visual-helper";
export const SYSTEM_ID = "pf2e";

export const SETTINGS = Object.freeze({
  ENABLED: "enabled",
  ENABLE_ALTITUDE_HUD: "enableAltitudeHud",
  ENABLE_GROUND_PROJECTION: "enableGroundProjection",
  ENABLE_HEIGHT_AXIS: "enableHeightAxis",
  ENABLE_HEIGHT_LABEL: "enableHeightLabel",
  ENABLE_STAND: "enableStand",
  ENABLE_SHADOW: "enableShadow",
  STAND_OPACITY: "standOpacity",
  SHADOW_OPACITY: "shadowOpacity",
  PROJECTION_OPACITY: "projectionOpacity",
  SHADOW_DISTANCE_MULTIPLIER: "shadowDistanceMultiplier"
});

export const DEFAULT_SETTINGS = Object.freeze({
  [SETTINGS.ENABLED]: true,
  [SETTINGS.ENABLE_ALTITUDE_HUD]: true,
  [SETTINGS.ENABLE_GROUND_PROJECTION]: true,
  [SETTINGS.ENABLE_HEIGHT_AXIS]: true,
  [SETTINGS.ENABLE_HEIGHT_LABEL]: true,
  [SETTINGS.ENABLE_STAND]: true,
  [SETTINGS.ENABLE_SHADOW]: true,
  [SETTINGS.STAND_OPACITY]: 0.4,
  [SETTINGS.SHADOW_OPACITY]: 0.35,
  [SETTINGS.PROJECTION_OPACITY]: 0.42,
  [SETTINGS.SHADOW_DISTANCE_MULTIPLIER]: 1
});

export const HUD_FILTERS = Object.freeze({
  ALL: "all",
  GROUND: "ground",
  AIR: "air"
});

export const VISUAL_EPSILON = 0.001;
export const NEARBY_RADIUS_GRID_SPACES = 8;
export const HUD_REFRESH_DELAY_MS = 50;
export const PING_DURATION_MS = 2000;
