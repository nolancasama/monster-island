import { expect, test, type Page } from "@playwright/test";
import { boot, chooseMode, hook, state, tap, waitFor } from "./helpers";
import { newProgress } from "../../src/game/logic/progress";
import { waterAt } from "../../src/game/logic/water";
import { COMBAT, MP_REGEN, type CompanionId } from "../../src/game/data/combat";
import { CANOPY_ROPES, CHESTS, ENEMY_SPAWNS } from "../../src/game/world/lowland";

const SHOTS = ".tmp/shots/water-ropes";
const near = (p: { x: number; z: number } | null, q: { x: number; z: number }) => p !== null && Math.hypot(p.x - q.x, p.z - q.z) < .12;

function lowlandSave(friend: CompanionId = "puff", edit: (p: ReturnType<typeof newProgress>) => void = () => {}) {
  const p = newProgress();
  for (const id of ["leafy", "bubbo", "puff", "ember", "lumo"] as const)
    p.monsters[id] = { discovered: true, friend: true, asked: {}, canKnown: {}, described: { name: true, size: true, part: true }, invited: true };
  p.active = friend; p.metMaple = true; p.endings = 3;
  p.solved = ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame"];
  p.act2 = { ...p.act2, started: true, lumoTaken: true, descended: true, zone: "forest1", checkpoint: "cliff",
    cleared: ["forest1"], tutorial: ["attack", "coins", "special", "eat", "rest", "switch"] };
  edit(p);
  // Start off the legacy stairs: this is a new arrival, not a migrated Canopy save.
  return { v: 4, progress: p, player: { x: 75.5, z: -154.4, yaw: Math.PI }, seconds: 3000 };
}

async function enter(page: Page, save = lowlandSave(), query = "fast=1") {
  await page.addInitScript(s => { if (!localStorage.getItem("mi.save.v4")) localStorage.setItem("mi.save.v4", s); }, JSON.stringify(save));
  const errors = await boot(page, query);
  await chooseMode(page, "tap");
  await page.getByTestId("btn-continue").click();
  await waitFor(page, s => s.mode === "explore", 60_000, "loaded lowland");
  return errors;
}

/** The controller receives both requested display sizes for each representative pose. */
async function shots(page: Page, name: string) {
  const previous = page.viewportSize();
  for (const viewport of [{ width: 1366, height: 768 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await hook(page, "renderFrames", 4);
    await page.screenshot({ path: `${SHOTS}/${name}-${viewport.width}x${viewport.height}.png` });
  }
  if (previous) await page.setViewportSize(previous);
}

test("Can you fly: wrong question, Puff pays out the rope, ties it, and it persists", async ({ page }) => {
  const errors = await enter(page);
  await hook(page, "combatFixture", { enemies: [] });
  await hook(page, "goTo", "canopyAscentRope");
  const before = await waitFor(page, s => s.focus?.id === "canopyAscentRope", 15_000, "ask at the coil");
  expect(before.progress.solved).not.toContain("canopyAscentRope");
  expect(before.act2.canopyAscentRope).toMatchObject({ carried: false, payout: 0, tied: 0 });
  await shots(page, "entrance-coil");
  await page.keyboard.press("KeyE");
  await tap(page, "canSwim");
  await waitFor(page, s => Boolean(s.prompt?.buttons && s.prompt.choices.includes("canFly")), 30_000, "retry after wrong question");
  expect((await state(page)).progress.solved).not.toContain("canopyAscentRope");
  await hook(page, "timeScale", .15);
  await tap(page, "canFly");
  const flying = await waitFor(page, s => s.act2.canopyAscentRope.carried && s.act2.canopyAscentRope.payout > .2 && s.act2.canopyAscentRope.payout < .8, 60_000, "Puff carrying the rope upward");
  expect(flying.progress.solved).not.toContain("canopyAscentRope");
  await hook(page, "timeScale", 0);
  await shots(page, "puff-rope-flight");
  await hook(page, "timeScale", .15);
  const later = await waitFor(page, s => s.act2.canopyAscentRope.carried && s.act2.canopyAscentRope.payout > flying.act2.canopyAscentRope.payout + .1, 60_000, "coil paying out continuously");
  expect(later.act2.canopyAscentRope.payout).toBeGreaterThan(flying.act2.canopyAscentRope.payout);
  await waitFor(page, s => s.act2.canopyAscentRope.carried && s.act2.canopyAscentRope.payout > .94 && s.act2.canopyAscentRope.payout < 1, 60_000, "anchor loop");
  await hook(page, "timeScale", 0);
  await shots(page, "puff-anchor-loop");
  await hook(page, "timeScale", 1);
  await tap(page, "thankYou");
  const solved = await waitFor(page, s => s.mode === "explore" && s.progress.solved.includes("canopyAscentRope"), 30_000, "permanent rope");
  expect(solved.act2.canopyAscentRope).toMatchObject({ carried: false, payout: 1, tied: 1 });
  await waitFor(page, s => s.focus?.id === "canopyEntranceUp", 10_000, "climb replaces ask");
  await shots(page, "entrance-rope-tied");
  await hook(page, "saveNow");
  await page.reload();
  await page.getByTestId("btn-continue").click();
  const loaded = await waitFor(page, s => s.mode === "explore", 60_000, "reloaded tied rope");
  expect(loaded.progress.solved).toContain("canopyAscentRope");
  expect(loaded.act2.canopyAscentRope).toMatchObject({ carried: false, payout: 1, tied: 1 });
  await hook(page, "combatFixture", { enemies: [] });
  await hook(page, "teleport", CANOPY_ROPES.entrance.foot.x, CANOPY_ROPES.entrance.foot.z, Math.PI);
  await waitFor(page, s => s.focus?.id === "canopyEntranceUp", 10_000, "saved rope climb prompt");
  await shots(page, "entrance-rope-reloaded");
  expect(errors).toEqual([]);
});

test("the right fly question with the wrong helper leaves the coil unsolved", async ({ page }) => {
  const errors = await enter(page, lowlandSave("bubbo"));
  await hook(page, "combatFixture", { enemies: [] });
  await hook(page, "goTo", "canopyAscentRope");
  await waitFor(page, s => s.focus?.id === "canopyAscentRope", 15_000, "unsolved rope");
  await page.keyboard.press("KeyE");
  await tap(page, "canFly");
  const after = await waitFor(page, s => s.mode === "explore", 30_000, "wrong helper returns control");
  expect(after.progress.solved).not.toContain("canopyAscentRope");
  expect(after.act2.canopyAscentRope.tied).toBe(0);
  expect(errors).toEqual([]);
});

for (const name of ["entrance", "exit"] as const) {
  test(`${name} rope climbs both ways, dismounts, and updates the safe landing`, async ({ page }) => {
    const rope = CANOPY_ROPES[name], focus = name === "entrance" ? "canopyEntrance" : "canopyExit";
    const errors = await enter(page, lowlandSave("bubbo", p => {
      p.solved.push("canopyAscentRope", "canopyVines", "canopyRope");
      p.act2.cleared = ["forest1", "grove", "canopy"];
    }));
    await hook(page, "combatFixture", { enemies: [] });
    await hook(page, "teleport", rope.foot.x, rope.foot.z, rope.facing);
    const foot = await waitFor(page, s => s.focus?.id === `${focus}Up` && s.act2.stance.k > .99, 15_000, "mounted at rope foot");
    expect(foot.act2.stance.friend).toBe("bubbo");
    await shots(page, `${name}-foot`);
    await hook(page, "timeScale", .25);
    await page.keyboard.press("KeyE");
    const climbing = await waitFor(page, s => s.player.climbing && s.player.y > foot.player.ground + 2, 30_000, "single interaction climb");
    expect(climbing.player.riding).toBe(false);
    expect(climbing.act2.stance.friend).toBe(null);
    await hook(page, "timeScale", 0);
    await shots(page, `${name}-climbing`);
    await hook(page, "timeScale", 1);
    const top = await waitFor(page, s => s.mode === "explore" && !s.player.climbing && near(s.player, rope.top), 30_000, "on the deck");
    expect(top.act2.zone).toBe("canopy");
    expect(top.player.ground - foot.player.ground).toBeGreaterThan(8);
    expect(top.player.frozen).toBe(false);
    expect(near(top.player.safeGround, rope.top)).toBe(true);
    await shots(page, `${name}-top`);
    await waitFor(page, s => s.focus?.id === `${focus}Down`, 10_000, "down prompt");
    await page.keyboard.press("KeyE");
    const down = await waitFor(page, s => s.mode === "explore" && !s.player.climbing && near(s.player, rope.foot), 30_000, "back at foot");
    expect(down.act2.zone).toBe(name === "entrance" ? "forest1" : "causeway");
    expect(down.player.frozen).toBe(false);
    expect(near(down.player.safeGround, rope.foot)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("the Causeway cannot climb the exit rope before Canopy is cleared", async ({ page }) => {
  // Keep this line open for the assertions and screenshots (fast mode advances it in 30 ms).
  const errors = await enter(page, lowlandSave("puff", p => { p.act2.cleared = ["forest1", "grove"]; }), "");
  await hook(page, "combatFixture", { enemies: [] });
  const rope = CANOPY_ROPES.exit;
  await hook(page, "teleport", rope.foot.x, rope.foot.z, rope.facing);
  await waitFor(page, s => s.focus?.id === "canopyExitUp", 15_000, "exit foot prompt");
  await page.keyboard.press("KeyE");
  const refused = await waitFor(page, s => s.line !== null, 10_000, "friendly refusal");
  expect(refused.line!.en).toMatch(/canopy/i);
  expect(refused.player.climbing).toBe(false);
  await shots(page, "exit-refused");
  await page.keyboard.press("Enter");
  const after = await waitFor(page, s => s.mode === "explore", 30_000, "refusal finishes");
  expect(near(after.player, rope.foot)).toBe(true);
  expect(after.progress.act2.cleared).not.toContain("canopy");
  expect(errors).toEqual([]);
});

test("a burning enemy runs into a rendered stream and extinguishes alive", async ({ page }) => {
  const errors = await enter(page, lowlandSave("ember"));
  const i = ENEMY_SPAWNS.findIndex(e => e.zone === "grove" && e.kind === "gloomlet");
  expect(i).toBeGreaterThanOrEqual(0);
  // Aim the deterministic first panic heading into the southern stream, away
  // from the intersecting ribbons near the Grove entrance.
  const enemy = { x: 48, z: -233.05 }, away = -Math.sin(i * 1.73) * 1.2;
  const player = { x: enemy.x - Math.sin(away) * 2.2, z: enemy.z - Math.cos(away) * 2.2 };
  expect(waterAt(enemy.x, enemy.z, "home")).toBe("none");
  expect(waterAt(48, -231.75, "home")).toBe("shallow");
  await hook(page, "timeScale", 0);
  await hook(page, "combatFixture", { enemies: [{ i, ...enemy, state: "recover", timer: 30 }] });
  await hook(page, "teleport", player.x, player.z, Math.atan2(enemy.x - player.x, enemy.z - player.z));
  await hook(page, "timeScale", .1);
  const ready = await waitFor(page, s => s.act2.zone === "grove" && s.act2.stance.friend === "ember" && s.act2.stance.k > .99, 30_000, "Ember at the stream");
  expect(near(ready.player, player), "fixture stands on the intended dry-bank approach").toBe(true);
  await page.keyboard.down("KeyJ");
  const lit = await waitFor(page, s => Boolean(s.act2.enemies.find(e => e.i === i)?.burning), 30_000, "ignited on dry bank");
  await page.keyboard.up("KeyJ");
  expect(lit.act2.enemies.find(e => e.i === i)!.panic).not.toBeNull();
  const wet = await waitFor(page, s => {
    const e = s.act2.enemies.find(e => e.i === i)!;
    return !e.burning && !e.panic && e.panicResistUntil > s.time && waterAt(e.x, e.z, "home") === "shallow";
  }, 30_000, "stream extinguishes panic");
  const enemyAfter = wet.act2.enemies.find(e => e.i === i)!;
  expect(enemyAfter.hp).toBeGreaterThan(0);
  expect(["ko", "gone"]).not.toContain(enemyAfter.state);
  await hook(page, "timeScale", 0);
  await shots(page, "stream-extinguish");
  expect(errors).toEqual([]);
});

test("paid Inferno pauses Ember regeneration while other friends regenerate", async ({ page }) => {
  const errors = await enter(page, lowlandSave("ember"));
  await hook(page, "combatFixture", { enemies: [] });
  await waitFor(page, s => s.act2.stance.friend === "ember" && s.act2.stance.k > .99, 30_000, "Ember mounted");
  await hook(page, "timeScale", 0);
  await hook(page, "setMp", "ember", 80);
  await hook(page, "setMp", "puff", 40);
  await page.keyboard.down("KeyK");
  const start = await state(page);
  expect(start.act2.mp.ember).toBe(80 - COMBAT.ember.special.cost);
  await hook(page, "timeScale", .25);
  await waitFor(page, s => (s.act2.inferno?.age ?? 0) > 1, 30_000, "sustained Inferno");
  await hook(page, "timeScale", 0);
  const active = await state(page), age = active.act2.inferno!.age;
  expect(active.act2.mp.ember).toBeCloseTo(start.act2.mp.ember - 12 * age, 3);
  expect(active.act2.mp.puff).toBeCloseTo(start.act2.mp.puff + MP_REGEN * (active.time - start.time), 3);
  await shots(page, "inferno-regen-paused");
  await page.keyboard.up("KeyK");
  await hook(page, "timeScale", 1);
  await waitFor(page, s => s.act2.inferno === null, 15_000, "Inferno ends");
  const ended = await state(page);
  const regenerated = await waitFor(page, s => s.time > ended.time + .5, 15_000, "normal regen resumes");
  expect(regenerated.act2.mp.ember).toBeGreaterThan(ended.act2.mp.ember + .8);
  expect(errors).toEqual([]);
});

test("the deck chest camera stays above the walking surface and returns to follow", async ({ page }) => {
  const errors = await enter(page, lowlandSave("puff", p => { p.solved.push("canopyAscentRope", "canopyVines", "canopyRope"); p.act2.cleared.push("canopy"); }));
  await hook(page, "combatFixture", { enemies: [] });
  const chest = CHESTS.find(c => c.id === "canopyChest")!;
  await hook(page, "teleport", chest.x, chest.z + 1.5, Math.PI);
  const before = await waitFor(page, s => s.focus?.id === chest.id, 15_000, "deck chest focus");
  await hook(page, "timeScale", .1);
  await page.keyboard.press("KeyE");
  await waitFor(page, s => s.camera.mode === "shot", 10_000, "chest camera");
  await hook(page, "timeScale", 0);
  await hook(page, "renderFrames", 12);
  const shot = await state(page);
  expect(shot.camera.pos.y).toBeGreaterThanOrEqual(before.player.ground + 1);
  expect(shot.camera.target.y).toBeGreaterThan(before.player.ground);
  await shots(page, "canopy-chest-camera");
  await hook(page, "timeScale", 1);
  const after = await waitFor(page, s => s.mode === "explore" && s.camera.mode === "follow", 30_000, "follow after chest");
  expect(after.progress.act2.chests).toContain(chest.id);
  expect(errors).toEqual([]);
});

test("a v4 Forest Camp save keeps its floor position, treasure and progress", async ({ page }) => {
  const save = JSON.parse(JSON.stringify(lowlandSave("puff")));
  save.progress.act2.zone = "camp";
  save.progress.act2.checkpoint = "camp";
  delete save.progress.act2.cleared;
  save.progress.act2.coins = 47;
  save.progress.act2.chests = ["forestChest"];
  save.player = { x: 86, z: -164, yaw: Math.PI };
  const errors = await enter(page, save);
  const loaded = await state(page);
  expect(loaded.progress.act2.checkpoint).toBe("cliff");
  expect(loaded.act2.zone).toBe("forest1");
  expect(loaded.progress.act2.cleared).toContain("forest1");
  expect(loaded.progress.act2.chests).toContain("forestChest");
  expect(loaded.progress.act2.coins).toBe(47);
  expect(near(loaded.player, save.player)).toBe(true);
  expect(loaded.progress.solved).not.toContain("canopyAscentRope");
  await hook(page, "combatFixture", { enemies: [] });
  await shots(page, "former-camp-save");
  await hook(page, "teleport", 80, -253, Math.PI);
  await hook(page, "combatFixture", { enemies: [] });
  await shots(page, "causeway");
  expect(errors).toEqual([]);
});
