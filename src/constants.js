export const MODULE_ID = "pf2e-flying-visual-helper";
export const SYSTEM_ID = "pf2e";

export const SETTINGS = Object.freeze({
  ENABLED: "enabled",
  ENABLE_ALTITUDE_HUD: "enableAltitudeHud",
  ENABLE_GROUND_PROJECTION: "enableGroundProjection",
  ENABLE_HEIGHT_AXIS: "enableHeightAxis",
  AIRSPACE_RADIUS: "airspaceRadius",
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
  [SETTINGS.AIRSPACE_RADIUS]: 8,
  [SETTINGS.ENABLE_STAND]: true,
  [SETTINGS.ENABLE_SHADOW]: true,
  [SETTINGS.STAND_OPACITY]: 0.55,
  [SETTINGS.SHADOW_OPACITY]: 0.65,
  [SETTINGS.PROJECTION_OPACITY]: 0.48,
  [SETTINGS.SHADOW_DISTANCE_MULTIPLIER]: 1
});

export const VISUAL_EPSILON = 0.001;
export const AIRSPACE_RADIUS_MIN = 1;
export const AIRSPACE_RADIUS_MAX = 30;
export const AIRSPACE_RADIUS_STEP = 1;
export const AIRSPACE_REFRESH_DELAY_MS = 40;
export const PING_DURATION_MS = 2000;
