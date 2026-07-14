/**
 * Reconcile an already user-opened HUD with current module availability.
 * This function intentionally has no opening path: enabling settings, world
 * readiness, hook refreshes, and Scene changes must never create the HUD.
 */
export async function reconcileHudAvailability(hud, {
  moduleReady = false,
  canvasReady = false,
  enabled = false,
  enableAltitudeHud = false
} = {}) {
  const available = !!moduleReady && !!canvasReady && !!enabled && !!enableAltitudeHud;
  if (!available) {
    if (hud?.rendered) await hud.close({ animate: false });
    return;
  }

  if (hud?.rendered) hud.requestRefresh({ immediate: true });
}

/** Close any HUD carried over from a previous Canvas before the Scene is used. */
export async function resetHudForScene(hud) {
  if (hud?.rendered) await hud.close({ animate: false });
}
