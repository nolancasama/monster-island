import { expect, test, type Page } from "@playwright/test";
import { boot, chooseMode, hook, state, waitFor, type MiState } from "./helpers";
import { newProgress } from "../../src/game/logic/progress";
import { COMBAT, type CompanionId } from "../../src/game/data/combat";
import { ENEMY_SPAWNS } from "../../src/game/world/lowland";

function forestSave(friend: CompanionId) {
  const p = newProgress();
  for (const id of ["leafy", "bubbo", "puff", "ember", "lumo"] as const)
    p.monsters[id] = { discovered: true, friend: true, asked: {}, canKnown: {}, described: { name: true, size: true, part: true }, invited: true };
  p.active = friend; p.metMaple = true; p.endings = 3;
  p.solved = ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame"];
  p.act2 = { ...p.act2, started: true, lumoTaken: true, descended: true, portFound: true, harbor: true,
    zone: "forest1", checkpoint: "camp", tutorial: ["attack", "coins", "special", "eat", "rest", "switch"] };
  return JSON.stringify({ v: 4, progress: p, player: { x: 75, z: -171, yaw: Math.PI }, seconds: 3000 });
}

/** Setup failures are harness failures; outcomes below remain normal product assertions. */
async function precondition(page: Page, predicate: (s: MiState) => boolean, label: string) {
  return waitFor(page, predicate, 30_000, label).catch(error => {
    throw new Error(`HARNESS_PRECONDITION_FAILED: ${label}: ${String(error)}`);
  });
}

async function enterForest(page: Page, friend: CompanionId) {
  try {
    expect(ENEMY_SPAWNS[1]).toMatchObject({ zone: "forest1", kind: "gloomlet" });
    expect(ENEMY_SPAWNS[1].optional, "element fixture uses a required base enemy").not.toBe(true);
    await page.addInitScript(save => localStorage.setItem("mi.save.v4", save), forestSave(friend));
    const errors = await boot(page);
    await chooseMode(page, "tap");
    await page.getByTestId("btn-continue").click();
    await precondition(page, s => s.mode === "explore" && s.act2.zone === "forest1" &&
      s.act2.stance.friend === friend && s.act2.stance.k > .99, `${friend} mounted in forest1`);
    return errors;
  } catch (error) {
    throw new Error(`HARNESS_PRECONDITION_FAILED: enter forest as ${friend}: ${String(error)}`);
  }
}

async function faceEnemy(page: Page, friend: CompanionId) {
  // Keep the same real light spawn in front, with no other victims or projectiles.
  await hook(page, "timeScale", 0);
  await hook(page, "combatFixture", { enemies: [{ i: 1, x: 75, z: -174, state: "recover", timer: 10 }] });
  await hook(page, "teleport", 75, -171, Math.PI);
  await hook(page, "setMp", friend, 100);
  await precondition(page, s => {
    const e = s.act2.enemies.find(e => e.i === 1);
    return s.mode === "explore" && s.act2.zone === "forest1" && s.progress.active === friend &&
      s.act2.mp[friend] === 100 && !s.act2.inferno && !s.act2.cyclone && !s.act2.bombChain && Boolean(e && e.zone === "forest1" && e.kind === "gloomlet" &&
        e.hp === 20 && !e.control && !e.burning && e.air === 0 && e.z < s.player.z) &&
      Math.abs(s.player.yaw - Math.PI) < .01;
  }, `${friend} faces a fresh light enemy with full MP`);
}

// Browser acceptance and the intentional wrong-target self-check are controller-owned.
// Negative control: temporarily expect held Ember J to snare rather than burn; run
// that case and require failure, then restore the burning assertion below.
for (const friend of ["ember", "bubbo", "leafy", "puff"] as const) {
  test(`${friend}: free J and MP special in the first forest`, async ({ page }) => {
    const errors = await enterForest(page, friend);
    await faceEnemy(page, friend);
    if (friend === "ember") await page.keyboard.down("KeyJ");
    else await page.keyboard.press("KeyJ");
    await hook(page, "timeScale", .2);
    const basic = await waitFor(page, s => {
      const e = s.act2.enemies.find(e => e.i === 1)!;
      return friend === "ember" ? e.burning : friend === "bubbo" ? e.control === "trapped" && e.air > 0
        : friend === "leafy" ? e.control === "grabbed" || e.control === "flung" : e.control === "flung";
    }, 10_000, `${friend} J enemy effect`);
    expect(basic.act2.mp[friend]).toBe(100);
    if (friend === "ember") {
      expect(basic.act2.enemies[1].panic).not.toBeNull();
      await page.keyboard.up("KeyJ");
      await waitFor(page, s => s.act2.breath === null, 2000, "release stops fire");
    }

    await faceEnemy(page, friend);
    await page.keyboard.press("KeyK");
    // Observe the launch while frozen, before regeneration or projectile travel.
    const launch = await state(page);
    expect(launch.act2.mp[friend]).toBe(100 - COMBAT[friend].special.cost);
    await hook(page, "timeScale", .2);
    await waitFor(page, s => friend === "ember" ? s.act2.enemies[1].burning && s.act2.inferno !== null
      : friend === "bubbo" ? s.act2.bombChain !== null
      : friend === "leafy" ? s.act2.enemies[1].control === "snared"
      : Boolean(s.act2.cyclone?.carried.includes(1)), 10_000, `${friend} K special effect`);
    expect(errors).toEqual([]);
  });
}

test.describe("touch", () => {
  test.use({ hasTouch: true });
  test("Inferno tap completes its fixed burst without holding", async ({ page }) => {
  await enterForest(page, "ember");
  await hook(page, "set", { touch: true });
  await faceEnemy(page, "ember");
  await page.getByTestId("btn-special").tap();
  const start = await state(page);
  expect(start.act2.inferno).toMatchObject({ age: 0, held: false });
  expect(start.act2.mp.ember).toBe(85);
  await hook(page, "timeScale", .2);
  await waitFor(page, s => Boolean(s.act2.inferno && s.act2.inferno.age >= 1 && !s.act2.inferno.held), 15_000, "tap burst lasts at least one second");
  const end = await waitFor(page, s => s.act2.inferno === null, 10_000, "tap burst finishes");
  expect(end.time - start.time).toBeGreaterThanOrEqual(1.2);
  expect(end.time - start.time).toBeLessThan(1.5);
  });

  test("Inferno touch hold sustains beyond three seconds until release", async ({ page }) => {
    await enterForest(page, "ember");
    await hook(page, "set", { touch: true });
    await faceEnemy(page, "ember");
    await page.getByTestId("btn-special").dispatchEvent("pointerdown", { pointerId: 1, pointerType: "touch", button: 0, buttons: 1 });
    expect((await state(page)).act2.mp.ember).toBe(85);
    await hook(page, "timeScale", .5);
    await waitFor(page, s => Boolean(s.act2.inferno && s.act2.inferno.age > 3.2 && s.act2.inferno.held), 15_000, "touch hold extends fire beyond three seconds");
    await page.getByTestId("btn-special").dispatchEvent("pointerup", { pointerId: 1, pointerType: "touch", button: 0, buttons: 0 });
    await waitFor(page, s => s.act2.inferno === null, 10_000, "touch release ends extended fire");
    expect((await state(page)).act2.mp.ember).toBeLessThan(85);
  });
});

test("keyboard hold extends Inferno until K is released", async ({ page }) => {
  await enterForest(page, "ember");
  await faceEnemy(page, "ember");
  await page.keyboard.down("KeyK");
  await hook(page, "timeScale", .5);
  await waitFor(page, s => Boolean(s.act2.inferno && s.act2.inferno.age > 3.2 && s.act2.inferno.held), 15_000, "keyboard hold extends fire beyond three seconds");
  await page.keyboard.up("KeyK");
  await waitFor(page, s => s.act2.inferno === null, 10_000, "key-up ends extended fire");
  expect((await state(page)).act2.mp.ember).toBeLessThan(85);
});

test("Cloud Isle ship still shows Coming Soon", async ({ page }) => {
  await enterForest(page, "puff");
  await hook(page, "goTo", "harbor", 1.4);
  await precondition(page, s => s.mode === "explore" && s.focus?.id === "harbor" && s.focus.kind === "npc" && s.progress.act2.harbor, "harbor keeper reachable after the lead");
  expect((await state(page)).cloudIsleOpen).toBe(false);
  await page.keyboard.press("KeyE");
  await waitFor(page, s => s.act2.banner === "Cloud Isle — Coming Soon!", 15_000, "locked ship banner");
  await expect(page.getByTestId("objective")).toContainText("Cloud Isle — Coming Soon!");
  expect((await state(page)).act2.ship.visible).toBe(false);
});
