const ACRYLIC_BODY_COLOR = 0xcce7ec;
const ACRYLIC_EDGE_COLOR = 0x8eb6c0;
const ACRYLIC_HIGHLIGHT_COLOR = 0xf4ffff;
const ACRYLIC_UNDERSIDE_COLOR = 0x627b82;
const AIR_ACCENT_COLOR = 0xa9d7df;

/**
 * Draws one layered acrylic tabletop stand without reading Foundry documents.
 *
 * The low-alpha body and the refractive highlights deliberately live in
 * separate Graphics objects. This keeps the shaft transparent while allowing
 * a narrow SCREEN highlight to stay legible on both dark and light maps.
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

  render(metrics, enabled) {
    const body = this.bodyGraphics;
    const specular = this.specularGraphics;
    body.clear();
    specular.clear();

    const visible = Boolean(
      metrics.flying
      && enabled
      && (metrics.stand.opacity > 0)
      && (metrics.stand.length > 0)
    );
    body.visible = visible;
    specular.visible = visible;
    if (!visible) return;

    const { topX, topY, baseX, baseY, length, opacity } = metrics.stand;
    const width = Math.max(1, finiteOr(metrics.stand.width, 1));
    const dx = baseX - topX;
    const dy = baseY - topY;
    const unitX = length > 0 ? dx / length : 0;
    const unitY = length > 0 ? dy / length : 1;
    const normalX = finiteOr(metrics.stand.normalX, -unitY);
    const normalY = finiteOr(metrics.stand.normalY, unitX);

    drawShaftBody(body, {
      topX,
      topY,
      baseX,
      baseY,
      normalX,
      normalY,
      width,
      opacity
    });
    drawBase(body, specular, metrics.base, { opacity, width });
    drawBottomPin(body, specular, metrics.base, {
      baseX,
      baseY,
      unitX,
      unitY,
      normalX,
      normalY,
      opacity,
      width
    });
    drawTopConnector(body, specular, metrics.connector, {
      topX,
      topY,
      length,
      unitX,
      unitY,
      normalX,
      normalY,
      opacity,
      width
    });
    drawRefractiveEdges(specular, {
      topX,
      topY,
      baseX,
      baseY,
      normalX,
      normalY,
      width,
      opacity
    });
    drawAirAccent(specular, metrics.airAccent ?? metrics.liftGlow, opacity);
  }
}

function drawShaftBody(graphics, data) {
  const {
    topX,
    topY,
    baseX,
    baseY,
    normalX,
    normalY,
    width,
    opacity
  } = data;
  const topHalf = width * 0.22;
  const baseHalf = width * 0.46;

  // A subtly tapered sheet reads as transparent acrylic instead of a neon
  // line. Even at opacity 1 the broad body never becomes opaque.
  drawFilledPolygon(graphics, [
    topX - (normalX * topHalf), topY - (normalY * topHalf),
    topX + (normalX * topHalf), topY + (normalY * topHalf),
    baseX + (normalX * baseHalf), baseY + (normalY * baseHalf),
    baseX - (normalX * baseHalf), baseY - (normalY * baseHalf)
  ], ACRYLIC_BODY_COLOR, Math.min(0.16, opacity * 0.22));
}

function drawRefractiveEdges(graphics, data) {
  const {
    topX,
    topY,
    baseX,
    baseY,
    normalX,
    normalY,
    width,
    opacity
  } = data;
  const edgeOffset = width * 0.4;
  const edgeWidth = clamp(width * 0.2, 1, 1.5);

  graphics.lineStyle(edgeWidth, ACRYLIC_EDGE_COLOR, Math.min(0.48, opacity * 0.68))
    .moveTo(topX - (normalX * edgeOffset), topY - (normalY * edgeOffset))
    .lineTo(baseX - (normalX * edgeOffset), baseY - (normalY * edgeOffset));
  graphics.lineStyle(edgeWidth, ACRYLIC_EDGE_COLOR, Math.min(0.4, opacity * 0.54))
    .moveTo(topX + (normalX * edgeOffset), topY + (normalY * edgeOffset))
    .lineTo(baseX + (normalX * edgeOffset), baseY + (normalY * edgeOffset));

  // The highlight is deliberately narrow and off-axis. There is no wide glow
  // stroke, so overlapping the projection line cannot form a laser-like rod.
  const highlightOffset = width * 0.14;
  graphics.lineStyle(
    clamp(width * 0.14, 0.75, 1.15),
    ACRYLIC_HIGHLIGHT_COLOR,
    Math.min(0.62, opacity * 0.9)
  )
    .moveTo(topX + (normalX * highlightOffset), topY + (normalY * highlightOffset))
    .lineTo(baseX + (normalX * highlightOffset), baseY + (normalY * highlightOffset));
}

function drawBase(body, specular, base, { opacity, width }) {
  const radiusX = Math.max(0, finiteOr(base?.radiusX, 0));
  const radiusY = Math.max(0, finiteOr(base?.radiusY, 0));
  if ((radiusX === 0) || (radiusY === 0)) return;

  const x = finiteOr(base?.x, 0);
  const y = finiteOr(base?.y, 0);
  const thickness = clamp(
    finiteOr(base?.thickness, radiusY * 0.32),
    0,
    Math.max(0, radiusY * 0.65)
  );

  // A visibly denser underside and top surface give the plate physical
  // presence while preserving enough transparency to read the map beneath.
  body.beginFill(ACRYLIC_UNDERSIDE_COLOR, Math.min(0.26, opacity * 0.38))
    .drawEllipse(x, y + thickness, radiusX, radiusY)
    .endFill();
  body.beginFill(ACRYLIC_BODY_COLOR, Math.min(0.22, opacity * 0.34))
    .drawEllipse(x, y, radiusX, radiusY)
    .endFill();

  specular.lineStyle(
    clamp(width * 0.22, 1, 1.5),
    ACRYLIC_EDGE_COLOR,
    Math.min(0.52, opacity * 0.82)
  ).drawEllipse(x, y + (thickness * 0.32), radiusX, radiusY);
  specular.lineStyle(
    clamp(width * 0.13, 0.75, 1),
    ACRYLIC_HIGHLIGHT_COLOR,
    Math.min(0.3, opacity * 0.48)
  ).drawEllipse(
    x - (radiusX * 0.025),
    y - (radiusY * 0.12),
    radiusX * 0.86,
    radiusY * 0.7
  );
}

function drawBottomPin(body, specular, base, data) {
  const {
    baseX,
    baseY,
    unitX,
    unitY,
    normalX,
    normalY,
    opacity,
    width
  } = data;
  const baseRadiusY = Math.max(0, finiteOr(base?.radiusY, 0));
  const length = clamp(
    finiteOr(base?.pinLength, Math.max(width * 1.35, baseRadiusY * 0.7)),
    width * 0.8,
    Math.max(width * 2.2, baseRadiusY * 1.25)
  );
  const halfWidth = Math.max(0.65, finiteOr(base?.pinWidth, width * 0.54) / 2);
  const innerX = baseX - (unitX * length);
  const innerY = baseY - (unitY * length);

  drawFilledPolygon(body, orientedQuad({
    ax: baseX,
    ay: baseY,
    bx: innerX,
    by: innerY,
    normalX,
    normalY,
    halfWidth
  }), ACRYLIC_BODY_COLOR, Math.min(0.2, opacity * 0.32));
  specular.lineStyle(
    clamp(width * 0.16, 0.8, 1.2),
    ACRYLIC_EDGE_COLOR,
    Math.min(0.42, opacity * 0.68)
  ).moveTo(innerX, innerY).lineTo(baseX, baseY);
}

function drawTopConnector(body, specular, connector, data) {
  const {
    topX,
    topY,
    length: standLength,
    unitX,
    unitY,
    normalX,
    normalY,
    opacity,
    width
  } = data;
  const length = clamp(
    finiteOr(connector?.length, Math.min(width * 2.1, standLength * 0.12)),
    width,
    Math.max(width, standLength * 0.22)
  );
  const connectorWidth = Math.max(width * 0.72, finiteOr(connector?.width, width * 1.2));
  const centerX = finiteOr(connector?.x, topX + (unitX * length * 0.5));
  const centerY = finiteOr(connector?.y, topY + (unitY * length * 0.5));
  const ax = centerX - (unitX * length * 0.5);
  const ay = centerY - (unitY * length * 0.5);
  const bx = centerX + (unitX * length * 0.5);
  const by = centerY + (unitY * length * 0.5);

  drawFilledPolygon(body, orientedQuad({
    ax,
    ay,
    bx,
    by,
    normalX,
    normalY,
    halfWidth: connectorWidth * 0.5
  }), ACRYLIC_BODY_COLOR, Math.min(0.22, opacity * 0.34));
  specular.lineStyle(
    clamp(width * 0.18, 0.9, 1.3),
    ACRYLIC_EDGE_COLOR,
    Math.min(0.46, opacity * 0.72)
  ).moveTo(ax + (normalX * connectorWidth * 0.38), ay + (normalY * connectorWidth * 0.38))
    .lineTo(bx + (normalX * connectorWidth * 0.38), by + (normalY * connectorWidth * 0.38));
}

function drawAirAccent(graphics, accent, standOpacity) {
  if (!accent || !(accent.alpha > 0) || !(accent.radiusX > 0) || !(accent.radiusY > 0)) return;
  // PIXI Graphics retains the previous shaft highlight lineStyle; explicitly
  // clear it so the subtle lower-rim fill cannot acquire a bright white ring.
  graphics.lineStyle(0);
  graphics.beginFill(
    AIR_ACCENT_COLOR,
    Math.min(0.1, accent.alpha, standOpacity * 0.2)
  ).drawEllipse(accent.x, accent.y, accent.radiusX, accent.radiusY).endFill();
}

function orientedQuad({ ax, ay, bx, by, normalX, normalY, halfWidth }) {
  return [
    ax - (normalX * halfWidth), ay - (normalY * halfWidth),
    ax + (normalX * halfWidth), ay + (normalY * halfWidth),
    bx + (normalX * halfWidth), by + (normalY * halfWidth),
    bx - (normalX * halfWidth), by - (normalY * halfWidth)
  ];
}

function drawFilledPolygon(graphics, points, color, alpha) {
  graphics.beginFill(color, alpha);
  if (typeof graphics.drawPolygon === "function") graphics.drawPolygon(points);
  else {
    graphics.moveTo(points[0], points[1]);
    for (let index = 2; index < points.length; index += 2) {
      graphics.lineTo(points[index], points[index + 1]);
    }
    graphics.lineTo(points[0], points[1]);
  }
  graphics.endFill();
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
