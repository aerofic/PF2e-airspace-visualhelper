import { DEFAULT_SETTINGS, MODULE_ID, SETTINGS } from "./constants.js";

const I18N_PREFIX = "PF2E_FLYING_VISUAL_HELPER.Settings";

/** All preferences are client-scoped and mutate no world or PF2e data. */
export function registerSettings(onChange) {
  registerBoolean(SETTINGS.ENABLED, onChange);
  registerBoolean(SETTINGS.ENABLE_ALTITUDE_HUD, onChange);
  registerBoolean(SETTINGS.ENABLE_GROUND_PROJECTION, onChange);
  // Retain the old 0.5.x client key without exposing a dead preference.
  registerBoolean(SETTINGS.ENABLE_HEIGHT_AXIS, onChange, { config: false });
  registerRange(
    SETTINGS.AIRSPACE_RADIUS,
    { min: 1, max: 30, step: 1 },
    onChange,
    { config: false }
  );

  // Preserve the V1 stand/shadow controls while adding V2 features.
  registerBoolean(SETTINGS.ENABLE_STAND, onChange);
  registerBoolean(SETTINGS.ENABLE_SHADOW, onChange);
  registerRange(SETTINGS.STAND_OPACITY, { min: 0, max: 1, step: 0.05 }, onChange);
  registerRange(SETTINGS.SHADOW_OPACITY, { min: 0, max: 1, step: 0.05 }, onChange);
  registerRange(SETTINGS.PROJECTION_OPACITY, { min: 0, max: 1, step: 0.05 }, onChange);
  // Retain the 0.5.x client key for downgrade safety; centered 0.6 shadows no
  // longer expose a directional-distance control.
  registerRange(
    SETTINGS.SHADOW_DISTANCE_MULTIPLIER,
    { min: 0.25, max: 3, step: 0.05 },
    onChange,
    { config: false }
  );
}

/** Read settings once for each batched refresh. */
export function readSettings() {
  return {
    enabled: game.settings.get(MODULE_ID, SETTINGS.ENABLED),
    enableAltitudeHud: game.settings.get(MODULE_ID, SETTINGS.ENABLE_ALTITUDE_HUD),
    enableGroundProjection: game.settings.get(MODULE_ID, SETTINGS.ENABLE_GROUND_PROJECTION),
    airspaceRadius: game.settings.get(MODULE_ID, SETTINGS.AIRSPACE_RADIUS),
    enableStand: game.settings.get(MODULE_ID, SETTINGS.ENABLE_STAND),
    enableShadow: game.settings.get(MODULE_ID, SETTINGS.ENABLE_SHADOW),
    standOpacity: game.settings.get(MODULE_ID, SETTINGS.STAND_OPACITY),
    shadowOpacity: game.settings.get(MODULE_ID, SETTINGS.SHADOW_OPACITY),
    projectionOpacity: game.settings.get(MODULE_ID, SETTINGS.PROJECTION_OPACITY)
  };
}

function registerBoolean(key, onChange, { config = true } = {}) {
  game.settings.register(MODULE_ID, key, {
    name: `${I18N_PREFIX}.${key}.name`,
    hint: `${I18N_PREFIX}.${key}.hint`,
    scope: "client",
    config,
    type: Boolean,
    default: DEFAULT_SETTINGS[key],
    onChange: value => onChange(key, value)
  });
}

function registerRange(key, range, onChange, { config = true } = {}) {
  game.settings.register(MODULE_ID, key, {
    name: `${I18N_PREFIX}.${key}.name`,
    hint: `${I18N_PREFIX}.${key}.hint`,
    scope: "client",
    config,
    type: Number,
    default: DEFAULT_SETTINGS[key],
    range,
    onChange: value => onChange(key, value)
  });
}
