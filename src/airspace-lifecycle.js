/**
 * Reconcile an already user-opened panel with module availability. There is
 * intentionally no opening path: only the visible Token-control button opens.
 */
export async function reconcileAirspaceAvailability(airspace, {
  moduleReady = false,
  canvasReady = false,
  enabled = false,
  enableAirspace = false
} = {}) {
  const available = !!moduleReady && !!canvasReady && !!enabled && !!enableAirspace;
  if (!available) {
    if (airspace?.rendered) await airspace.close({ animate: false });
    return;
  }

  if (airspace?.rendered) airspace.requestRefresh({ immediate: true, includeControls: true });
}

/** Never carry an open tactical view into another Scene. */
export async function resetAirspaceForScene(airspace) {
  if (airspace?.rendered) await airspace.close({ animate: false });
}
