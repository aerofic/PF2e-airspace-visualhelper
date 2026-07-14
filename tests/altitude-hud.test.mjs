import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

class FakeApplicationV2 {
  constructor() {
    this.rendered = true;
    this.renderCalls = [];
    this.positionCalls = [];
    this.closeCalls = [];
    this.position = { width: 360, height: 32, left: 100, top: 52 };
  }

  render(options = {}) {
    this.renderCalls.push(options);
    return Promise.resolve(this);
  }

  setPosition(position = {}) {
    this.positionCalls.push({ ...position });
    this.position = { ...this.position, ...position };
    return position;
  }

  close(options = {}) {
    this.closeCalls.push(options);
    this.rendered = false;
    return Promise.resolve(this);
  }
}
globalThis.foundry = {
  applications: {
    api: {
      ApplicationV2: FakeApplicationV2,
      HandlebarsApplicationMixin: Base => class extends Base {
        async _prepareContext() { return {}; }
      }
    }
  }
};
globalThis.game = {
  user: { id: "user", isGM: true },
  settings: {
    get: (_moduleId, key) => key === "enableHeightAxis"
  },
  i18n: {
    localize: key => key,
    format: (key, data) => `${key}:${JSON.stringify(data)}`
  }
};
globalThis.canvas = createEmptyCanvas();
globalThis.CONFIG = {
  Canvas: {
    pings: {
      types: { PULL: "pull", PULSE: "pulse" }
    }
  }
};

const {
  ALTITUDE_HUD_EXPANDED_POSITION,
  AltitudeHud,
  buildAltitudeRelations,
  calculateExpandedHudPosition,
  extractFlySpeed,
  isHudTokenVisible
} = await import("../src/altitude-hud.js");

test("defaults directly to the full frameless top HUD", () => {
  assert.deepEqual(ALTITUDE_HUD_EXPANDED_POSITION, { width: 360, height: 73, top: 52 });
  assert.deepEqual(AltitudeHud.DEFAULT_OPTIONS.position, ALTITUDE_HUD_EXPANDED_POSITION);
  assert.equal("left" in ALTITUDE_HUD_EXPANDED_POSITION, false);
  assert.equal(AltitudeHud.DEFAULT_OPTIONS.window.frame, false);
  assert.equal(AltitudeHud.DEFAULT_OPTIONS.window.resizable, false);
  assert.equal(AltitudeHud.DEFAULT_OPTIONS.window.minimizable, false);
});

test("registers full HUD actions without a collapsed-summary toggle", () => {
  const actions = AltitudeHud.DEFAULT_OPTIONS.actions;
  for (const action of ["closeHud", "setFilter", "focusToken"]) {
    assert.equal(typeof actions[action], "function", `${action} should be an ApplicationV2 action`);
  }
  assert.equal("toggleDetails" in actions, false);
});

test("always prepares the full detail state and opens it directly", async () => {
  globalThis.canvas = createEmptyCanvas();
  const hud = new AltitudeHud();
  const context = await hud._prepareContext({});
  assert.equal("isExpanded" in context, false);
  assert.equal(context.showHeightAxis, true);
  assert.ok(context.axis, "the full HUD should calculate the relative axis immediately");
  assert.deepEqual(context.relations, []);

  hud.rendered = false;
  await hud.toggle();
  assert.equal(hud.renderCalls.at(-1)?.force, true);
});

test("sizes the expanded HUD from all relative levels without a maximum cap", () => {
  const axis = { width: 1_840, height: 25_600 };
  const position = calculateExpandedHudPosition({ axis, entryCount: 800, hasSelected: true });
  assert.deepEqual(position, { width: 1_840, height: 25_681, top: 52 });

  const listPosition = calculateExpandedHudPosition({ entryCount: 9 });
  assert.deepEqual(listPosition, { width: 360, height: 202, top: 52 });
});

test("keeps the selected filter while resizing the full HUD", async () => {
  globalThis.canvas = createEmptyCanvas();
  const hud = new AltitudeHud();
  const setFilter = AltitudeHud.DEFAULT_OPTIONS.actions.setFilter;
  const event = createActionEvent();

  await setFilter.call(hud, event, { dataset: { filter: "air" } });
  assert.equal((await hud._prepareContext({})).filters.find(filter => filter.active)?.id, "air");
  assertMainPartRender(hud.renderCalls.at(-1));
  assertPositionWasApplied(hud, ALTITUDE_HUD_EXPANDED_POSITION);
});

test("closes a frameless HUD through its explicit ApplicationV2 action", async () => {
  const hud = new AltitudeHud();
  const event = createActionEvent();

  await AltitudeHud.DEFAULT_OPTIONS.actions.closeHud.call(hud, event, {});

  assert.equal(event.prevented, 1);
  assert.equal(hud.closeCalls.length, 1);
});

test("template always renders details and exposes no collapsed-summary control", () => {
  const template = readFileSync(new URL("../templates/altitude-hud.hbs", import.meta.url), "utf8");
  const detailsElement = /<(?:section|div)\b[^>]*\bclass=["'][^"']*\bairspace-details\b[^"']*["'][^>]*>/i.exec(template);
  assert.ok(detailsElement, "template should contain an .airspace-details region");
  assert.doesNotMatch(template, /{{#if\s+isExpanded\s*}}/);
  assert.doesNotMatch(template, /data-action=["']toggleDetails["']/);
  assert.doesNotMatch(template, /id=["']pf2e-fvh-airspace-summary["']/);
  assert.match(template, /class=["']airspace-title["']/);

  const closeTag = findButtonTag(template, "closeHud");
  assert.match(closeTag, /\btype=["']button["']/);
  assert.match(closeTag, /\baria-label=["'][^"']+["']/);
  assert.match(template, /class=["']airspace-axis["'][^>]*style=["'][^"']*width:\s*{{axis\.width}}px/);
  assert.doesNotMatch(template, /min-width:\s*{{axis\.width}}px/);
});

test("CSS removes viewport caps and substantially shortens altitude Token cards", () => {
  const css = readFileSync(new URL("../styles/module.css", import.meta.url), "utf8");
  const rootRule = css.match(/\.pf2e-flying-visual-helper\.airspace-hud\s*{([^}]+)}/)?.[1] ?? "";
  const nodeRule = css.match(/button\.airspace-token-node\s*{([^}]+)}/)?.[1] ?? "";
  assert.doesNotMatch(rootRule, /max-(?:inline|block)-size/);
  assert.match(nodeRule, /inline-size:\s*132px/);
  assert.doesNotMatch(nodeRule, /inline-size:\s*225px/);
});

test("reads PF2e prepared Fly Speed only with observer permission", () => {
  const actor = {
    isOfType: type => type === "creature",
    testUserPermission: (_user, permission) => permission === "OBSERVER",
    system: { movement: { speeds: { fly: { value: 80 } } } }
  };
  assert.equal(extractFlySpeed(actor, game.user), 80);
  assert.equal(extractFlySpeed({ ...actor, testUserPermission: () => false }, game.user), null);
  assert.equal(extractFlySpeed({ ...actor, system: { movement: { speeds: {} } } }, game.user), null);
});

test("builds visual nearby altitude differences without rules distance", () => {
  const selected = { id: "dragon", name: "Dragon", elevation: 80, centerX: 0, centerY: 0 };
  const entries = [
    selected,
    { id: "wizard", name: "Wizard", elevation: 35, centerX: 100, centerY: 0 },
    { id: "griffin", name: "Griffin", elevation: 60, centerX: 200, centerY: 0 },
    { id: "ground", name: "Fighter", elevation: 0, centerX: 100, centerY: 0 },
    { id: "far", name: "Far Bat", elevation: 20, centerX: 2_000, centerY: 0 }
  ];
  const relations = buildAltitudeRelations(selected, entries, { gridSize: 100, radiusSpaces: 8 });
  assert.deepEqual(relations.map(entry => [entry.id, entry.delta, entry.direction]), [
    ["griffin", 20, "below"],
    ["wizard", 45, "below"]
  ]);
});

test("excludes invisible, destroyed, and Secret Tokens from HUD rows", () => {
  const visible = { visible: true, destroyed: false, document: { isSecret: false } };
  assert.equal(isHudTokenVisible(visible), true);
  assert.equal(isHudTokenVisible({ ...visible, visible: false }), false);
  assert.equal(isHudTokenVisible({ ...visible, destroyed: true }), false);
  assert.equal(isHudTokenVisible({ ...visible, document: { isSecret: true } }), false);
});

test("preserves Token focus, pan, and ping interaction in the expanded HUD", async () => {
  const calls = [];
  const scene = { id: "scene" };
  const token = {
    id: "dragon",
    visible: true,
    destroyed: false,
    center: { x: 125, y: 275 },
    document: {
      parent: scene,
      isSecret: false,
      canUserModify: (_user, permission) => permission === "update"
    },
    control: options => calls.push(["control", options]),
    panCanvas: async options => calls.push(["pan", options])
  };
  globalThis.canvas = {
    ...createEmptyCanvas(),
    scene,
    photosensitiveMode: true,
    tokens: {
      placeables: [token],
      controlled: [],
      get: id => id === token.id ? token : null,
      activate: options => calls.push(["activate", options])
    },
    controls: {
      drawPing: (point, options) => calls.push(["ping", point, options])
    }
  };

  const event = createActionEvent();
  await AltitudeHud.DEFAULT_OPTIONS.actions.focusToken.call(
    new AltitudeHud(),
    event,
    { dataset: { tokenId: token.id } }
  );

  assert.equal(event.prevented, 1);
  assert.deepEqual(calls.map(call => call[0]), ["activate", "control", "pan", "ping"]);
  assert.deepEqual(calls[0][1], { tool: "select" });
  assert.deepEqual(calls[1][1], { releaseOthers: true });
  assert.deepEqual(calls[2][1], { force: true, duration: 0 });
  assert.deepEqual(calls[3][1], token.center);
  assert.equal(calls[3][2].style, "pull");
  assert.equal(calls[3][2].user, game.user);
});

function createEmptyCanvas() {
  const scene = { id: "scene", grid: { units: "ft" } };
  return {
    ready: true,
    scene,
    grid: { size: 100, units: "ft" },
    dimensions: { size: 100 },
    tokens: {
      placeables: [],
      controlled: [],
      get: () => null
    }
  };
}

function createActionEvent() {
  return {
    prevented: 0,
    preventDefault() {
      this.prevented += 1;
    }
  };
}

function assertMainPartRender(options) {
  assert.deepEqual(options?.parts, ["main"]);
  assert.notEqual(options?.force, true, "full HUD data refreshes should remain partial renders");
}

function assertPositionWasApplied(hud, expected) {
  const candidates = [
    ...hud.positionCalls,
    ...hud.renderCalls.map(call => call?.position).filter(Boolean)
  ];
  assert.ok(
    candidates.some(position => (position.width === expected.width) && (position.height === expected.height)),
    `expected HUD dimensions ${expected.width}x${expected.height}`
  );
}

function findButtonTag(template, action) {
  const tag = [...template.matchAll(/<button\b[^>]*>/gi)]
    .map(match => match[0])
    .find(candidate => new RegExp(`\\bdata-action=["']${escapeRegExp(action)}["']`).test(candidate));
  assert.ok(tag, `template should include a ${action} button`);
  return tag;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
