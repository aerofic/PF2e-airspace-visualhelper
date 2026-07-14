const ACRYLIC_BODY_COLOR = 0xcce7ec;
const ACRYLIC_EDGE_COLOR = 0x8eb6c0;
const ACRYLIC_HIGHLIGHT_COLOR = 0xf4ffff;
const ACRYLIC_UNDERSIDE_COLOR = 0x627b82;

/**
 * Draw a top-down acrylic flight plate.
 *
 * A vertical support is coincident with the camera axis in Foundry's
 * orthographic view, so V0.5 deliberately does not draw its side length. The
 * plate rim, central rod end and optional X-ray spokes are the physically
 * plausible features visible from above.
 */
export class FlyingStand {
  constructor(bodyGraphics, specularGraphics) {
    this.bodyGraphics = bodyGraphics;
    this.specularGraphics = specularGraphics;

    bodyGraphics.eventMode = "none";
    bodyGraphics.zIndex = 20;
    bodyGraphics.blendMode = blendMode("NORMAL", bodyGraphics.blendMode);

    specularGraphics.eventMode = "none";
    specularGraphics.zIndex = 30;
    specularGraphics.blendMode = blendMode(
      "SCREEN",
      blendMode("NORMAL", specularGraphics.blendMode)
    );
  }

  render(metrics, enabled, { emphasized = false } = {}) {
    const body = this.bodyGraphics;
    const specular = this.specularGraphics;
    body.clear();
    specular.clear();

    const opacity = clamp(finiteOr(metrics?.stand?.opacity, 0), 0, 1);
    const radiusX = Math.max(0, finiteOr(metrics?.base?.radiusX, 0));
    const radiusY = Math.max(0, finiteOr(metrics?.base?.radiusY, 0));
    const visible = Boolean(metrics.flying && enabled && (opacity > 0) && (radiusX > 0) && (radiusY > 0));
    body.visible = visible;
    specular.visible = visible;
    if (!visible) return;

    drawTopDownPlate(body, specular, metrics.base, {
      opacity,
      lineWidth: Math.max(1, finiteOr(metrics.stand.width, 1)),
      emphasized
    });
    drawRodEnd(body, specular, metrics.connector, { opacity, emphasized });
  }
}

function drawTopDownPlate(body, specular, base, { opacity, lineWidth, emphasized }) {
  const x = finiteOr(base?.x, 0);
  const y = finiteOr(base?.y, 0);
  const radiusX = Math.max(0, finiteOr(base?.radiusX, 0));
  const radiusY = Math.max(0, finiteOr(base?.radiusY, 0));
  const innerRadiusX = clamp(finiteOr(base?.innerRadiusX, radiusX * 0.9), 0, radiusX);
  const innerRadiusY = clamp(finiteOr(base?.innerRadiusY, radiusY * 0.9), 0, radiusY);
  const rimWidth = clamp(finiteOr(base?.rimWidth, lineWidth * 0.5), 1, 4);
  const emphasis = emphasized ? 1.55 : 1;

  // Almost the entire fill lives behind the Token art. Only the few-pixel
  // overshoot and refractive edge remain visible in the normal top-down view.
  body.beginFill(
    ACRYLIC_UNDERSIDE_COLOR,
    Math.min(0.11, opacity * 0.12 * emphasis)
  ).drawEllipse(x, y, radiusX, radiusY).endFill();
  body.beginFill(
    ACRYLIC_BODY_COLOR,
    Math.min(0.08, opacity * 0.09 * emphasis)
  ).drawEllipse(x, y, innerRadiusX, innerRadiusY).endFill();

  specular.lineStyle(
    rimWidth,
    ACRYLIC_EDGE_COLOR,
    Math.min(0.68, opacity * 0.82 * emphasis)
  ).drawEllipse(x, y, radiusX, radiusY);
  specular.lineStyle(
    Math.max(0.75, rimWidth * 0.48),
    ACRYLIC_HIGHLIGHT_COLOR,
    Math.min(0.5, opacity * 0.58 * emphasis)
  ).drawEllipse(x, y, innerRadiusX, innerRadiusY);

  // Broken highlight arcs read as acrylic refraction instead of a selection
  // ring. They also remain legible where circular Token frames cover the fill.
  drawEllipseArc(specular, {
    x,
    y,
    radiusX: radiusX * 0.985,
    radiusY: radiusY * 0.985,
    start: Math.PI * 1.08,
    end: Math.PI * 1.48,
    width: Math.max(0.9, rimWidth * 0.56),
    color: ACRYLIC_HIGHLIGHT_COLOR,
    alpha: Math.min(0.72, opacity * 0.92 * emphasis)
  });
  drawEllipseArc(specular, {
    x,
    y,
    radiusX: radiusX * 0.985,
    radiusY: radiusY * 0.985,
    start: Math.PI * 0.08,
    end: Math.PI * 0.3,
    width: Math.max(0.75, rimWidth * 0.42),
    color: ACRYLIC_EDGE_COLOR,
    alpha: Math.min(0.42, opacity * 0.54 * emphasis)
  });

  if (emphasized) drawXraySpokes(specular, { x, y, radiusX, radiusY, rimWidth, opacity });
}

function drawRodEnd(body, specular, connector, { opacity, emphasized }) {
  const x = finiteOr(connector?.x, 0);
  const y = finiteOr(connector?.y, 0);
  const radius = Math.max(0, finiteOr(connector?.radius, connector?.width * 0.5));
  if (!(radius > 0)) return;
  const emphasis = emphasized ? 1.65 : 1;

  // In a true top view the vertical rod is visible only as its circular end.
  // It usually remains beneath Token art, becoming an X-ray cue when exposed.
  body.beginFill(ACRYLIC_UNDERSIDE_COLOR, Math.min(0.18, opacity * 0.2 * emphasis))
    .drawEllipse(x, y, radius, radius)
    .endFill();
  specular.lineStyle(
    Math.max(0.8, radius * 0.18),
    ACRYLIC_HIGHLIGHT_COLOR,
    Math.min(0.62, opacity * 0.76 * emphasis)
  ).drawEllipse(x, y, radius, radius);
}

function drawXraySpokes(graphics, { x, y, radiusX, radiusY, rimWidth, opacity }) {
  graphics.lineStyle(
    Math.max(0.75, rimWidth * 0.4),
    ACRYLIC_EDGE_COLOR,
    Math.min(0.34, opacity * 0.46)
  );
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    graphics.moveTo(
      x + (cos * radiusX * 0.82),
      y + (sin * radiusY * 0.82)
    ).lineTo(
      x + (cos * radiusX * 0.98),
      y + (sin * radiusY * 0.98)
    );
  }
}

function drawEllipseArc(graphics, {
  x,
  y,
  radiusX,
  radiusY,
  start,
  end,
  width,
  color,
  alpha
}) {
  if (!(radiusX > 0) || !(radiusY > 0) || !(alpha > 0) || !(end > start)) return;
  const segments = 12;
  graphics.lineStyle(width, color, alpha);
  for (let index = 0; index <= segments; index += 1) {
    const angle = start + (((end - start) * index) / segments);
    const px = x + (Math.cos(angle) * radiusX);
    const py = y + (Math.sin(angle) * radiusY);
    if (index === 0) graphics.moveTo(px, py);
    else graphics.lineTo(px, py);
  }
}

function blendMode(name, fallback) {
  return globalThis.PIXI?.BLEND_MODES?.[name] ?? fallback ?? 0;
}

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
