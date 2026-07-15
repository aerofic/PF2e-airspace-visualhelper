import { isZScatterActive, readShapeTranslation } from "./z-scatter-compatibility.js";

const FALLBACK_COLOR = 0xd0d0d0;

/**
 * Displays a non-interactive copy of a negative-elevation Token above the map.
 * The copy is hosted by TokenLayer rather than the native Token, so Foundry's
 * below-ground Primary occlusion cannot hide it.
 */
export class SubterraneanTokenVisual {
  constructor(token, { parent = token?.parent } = {}) {
    this.token = token;
    this.parent = parent;
    this.container = createDisplay("Container");
    this.sprite = createDisplay("Sprite");
    this.graphics = createGraphics();

    configureDisplay(this.container);
    configureDisplay(this.sprite);
    configureDisplay(this.graphics);
    this.container?.addChild?.(this.sprite);
    this.container?.addChild?.(this.graphics);
    this.render();
  }

  get destroyed() {
    return !!this.container?.destroyed;
  }

  render({ elevation = this.token?.document?.elevation } = {}) {
    if (this.destroyed || this.token?.destroyed) return;
    this.#attach();
    syncContainer(this.container, this.token);

    const visible = isSubterraneanElevation(elevation)
      && isVisibleToUser(this.token)
      && !this.token.document?.isSecret;
    if (this.container) this.container.visible = visible;
    if (!visible) {
      hide(this.sprite);
      hide(this.graphics);
      return;
    }

    const texture = this.token.mesh?.texture;
    const offset = readScatterOffset(this.token);
    if (this.sprite && isUsableTexture(texture)) {
      syncSprite(this.sprite, this.token, texture, offset);
      this.sprite.visible = true;
      hide(this.graphics);
    } else {
      hide(this.sprite);
      drawFallback(this.graphics, this.token, offset);
    }
  }

  destroy() {
    this.container?.removeFromParent?.();
    this.sprite?.destroy?.({ texture: false, baseTexture: false });
    this.graphics?.destroy?.({ children: true });
    this.container?.destroy?.({ children: false });
  }

  #attach() {
    const parent = this.parent ?? this.token?.parent ?? this.token?.layer?.objects;
    const container = this.container;
    if (!parent || !container || typeof parent.addChild !== "function") return;
    this.parent = parent;

    const children = Array.isArray(parent.children) ? parent.children : null;
    const containerIndex = children?.indexOf(container) ?? -1;
    const tokenIndex = children?.indexOf(this.token) ?? -1;
    if ((container.parent === parent) && (tokenIndex < 0 || containerIndex === tokenIndex - 1)) return;

    container.removeFromParent?.();
    const insertionIndex = Array.isArray(parent.children) ? parent.children.indexOf(this.token) : -1;
    if (insertionIndex >= 0 && typeof parent.addChildAt === "function") parent.addChildAt(container, insertionIndex);
    else parent.addChild(container);
  }
}

export function isSubterraneanElevation(value) {
  const elevation = Number(value);
  return Number.isFinite(elevation) && elevation < 0;
}

function createDisplay(name) {
  const Display = globalThis.PIXI?.[name];
  return typeof Display === "function" ? new Display() : null;
}

function createGraphics() {
  const Graphics = globalThis.PIXI?.smooth?.SmoothGraphics ?? globalThis.PIXI?.Graphics;
  return typeof Graphics === "function" ? new Graphics() : null;
}

function configureDisplay(display) {
  if (!display) return;
  display.eventMode = "none";
  display.interactive = false;
  display.interactiveChildren = false;
  display.visible = false;
}

function syncContainer(container, token) {
  if (!container) return;
  setPosition(container, finite(token.position?.x ?? token.document?.x), finite(token.position?.y ?? token.document?.y));
  container.zIndex = finite(token.zIndex);
  if ("sortLayer" in token) container.sortLayer = token.sortLayer;
  if ("sort" in token) container.sort = token.sort;
}

function syncSprite(sprite, token, texture, offset) {
  const size = token.document?.getSize?.() ?? {};
  const mesh = token.mesh;
  const center = localCenter(token, size);
  sprite.texture = texture;
  sprite.anchor?.set?.(finite(mesh?.anchor?.x, 0.5), finite(mesh?.anchor?.y, 0.5));
  setPosition(sprite, center.x + offset.x, center.y + offset.y);
  sprite.width = positive(mesh?.width, positive(size.width, 1));
  sprite.height = positive(mesh?.height, positive(size.height, 1));
  sprite.rotation = finite(mesh?.rotation);
  sprite.tint = 0xffffff;
  sprite.alpha = 1;
}

function drawFallback(graphics, token, offset) {
  if (!graphics) return;
  const size = token.document?.getSize?.() ?? {};
  const width = positive(size.width, 1);
  const height = positive(size.height, 1);
  graphics.clear?.();
  setPosition(graphics, offset.x, offset.y);
  graphics.lineStyle?.({ width: 3, color: FALLBACK_COLOR, alpha: 0.95 });
  if (token.shape && typeof graphics.drawShape === "function") graphics.drawShape(token.shape);
  else graphics.drawRect?.(0, 0, width, height);
  graphics.visible = true;
}

function readScatterOffset(token) {
  if (!isZScatterActive()) return { x: 0, y: 0 };
  return readShapeTranslation(token?.shape, token?.hitArea) ?? { x: 0, y: 0 };
}

function localCenter(token, size) {
  return {
    x: finite(token.center?.x, positive(size.width, 1) / 2) - finite(token.position?.x ?? token.document?.x),
    y: finite(token.center?.y, positive(size.height, 1) / 2) - finite(token.position?.y ?? token.document?.y)
  };
}

function isVisibleToUser(token) {
  return typeof token?.isVisible === "boolean" ? token.isVisible : token?.visible !== false;
}

function isUsableTexture(texture) {
  if (!texture || texture.destroyed || texture === globalThis.PIXI?.Texture?.EMPTY) return false;
  const valid = texture.valid ?? texture.source?.valid ?? texture.source?.isValid ?? texture.baseTexture?.valid;
  if (valid === false) return false;
  const width = Number(texture.width ?? texture.orig?.width ?? texture.frame?.width);
  const height = Number(texture.height ?? texture.orig?.height ?? texture.frame?.height);
  return !(Number.isFinite(width) && width <= 0) && !(Number.isFinite(height) && height <= 0);
}

function setPosition(display, x, y) {
  if (display?.position?.set) display.position.set(x, y);
  else if (display) {
    display.x = x;
    display.y = y;
  }
}

function hide(display) {
  if (display) display.visible = false;
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
