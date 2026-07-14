import test from "node:test";
import assert from "node:assert/strict";

class FakeApplicationV2 {}
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
globalThis.game = { user: { id: "user" } };

const {
  ALTITUDE_HUD_DEFAULT_POSITION,
  AltitudeHud,
  buildAltitudeRelations,
  extractFlySpeed,
  isHudTokenVisible
} = await import("../src/altitude-hud.js");

test("defaults to a wide top strip while leaving horizontal centering to Foundry", () => {
  assert.deepEqual(AltitudeHud.DEFAULT_OPTIONS.position, ALTITUDE_HUD_DEFAULT_POSITION);
  assert.equal(ALTITUDE_HUD_DEFAULT_POSITION.top, 52);
  assert.ok(ALTITUDE_HUD_DEFAULT_POSITION.width > ALTITUDE_HUD_DEFAULT_POSITION.height * 3);
  assert.equal("left" in ALTITUDE_HUD_DEFAULT_POSITION, false);
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
