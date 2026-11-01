import { expect, test, type Page } from "@playwright/test";
import { boot, chooseMode, hook, state, waitFor } from "./helpers";
import { newProgress } from "../../src/game/logic/progress";
import type { CompanionId } from "../../src/game/data/combat";

const SHOTS = ".tmp/shots/feel";

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

async function enterForest(page: Page, friend: CompanionId) {
  await page.addInitScript(save => localStorage.setItem("mi.save.v4", save), forestSave(friend));
  const errors = await boot(page);
  await chooseMode(page, "tap");
  await page.getByTestId("btn-continue").click();
  await waitFor(page, s => s.mode === "explore" && s.act2.zone === "forest1" && s.act2.stance.friend === friend && s.act2.stance.k > .99, 30_000, `${friend} mounted`);
  return errors;
}

/** One gloomlet (i 1) 3 m ahead, doing nothing for a long time, with full MP. */
async function faceEnemy(page: Page, friend: CompanionId) {
  await hook(page, "timeScale", 0);
  await hook(page, "combatFixture", { enemies: [{ i: 1, x: 75, z: -174, state: "recover", timer: 10 }] });
  await hook(page, "teleport", 75, -171, Math.PI);
  await hook(page, "setMp", friend, 100);
  await waitFor(page, s => s.act2.enemies.find(e => e.i === 1)?.hp === 20, 30_000, "fresh enemy");
}

async function canvasPoint(page: Page) {
  const box = (await page.locator("canvas").first().boundingBox())!;
  return { x: box.x + box.width * .5, y: box.y + box.height * .35 };
}

test("left mouse holds fire and releases at once, with keyboard parity", async ({ page }) => {
  const errors = await enterForest(page, "ember");
  await faceEnemy(page, "ember");
  await hook(page, "timeScale", .2);
  const c = await canvasPoint(page);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down({ button: "left" });
  await waitFor(page, s => s.act2.breath !== null && s.act2.breath.held, 10_000, "left click breathes");
  await waitFor(page, s => (s.act2.breath?.age ?? 0) > .3, 20_000, "fire keeps going while held");
  await page.mouse.up({ button: "left" });
  await waitFor(page, s => s.act2.breath === null, 3000, "release stops fire");
  const hp = (await state(page)).act2.enemies[1].hp;
  await page.waitForTimeout(600);
  await page.keyboard.down("KeyJ");
  await waitFor(page, s => s.act2.breath !== null, 10_000, "J breathes");
  await page.keyboard.up("KeyJ");
  await waitFor(page, s => s.act2.breath === null, 3000, "J release stops fire");
  expect((await state(page)).act2.enemies[1].hp).toBeLessThan(hp);
  expect(errors).toEqual([]);
});

test("right mouse sustains Inferno; the canvas blocks the context menu", async ({ page }) => {
  const errors = await enterForest(page, "ember");
  await faceEnemy(page, "ember");
  await hook(page, "timeScale", .2);
  const c = await canvasPoint(page);
  await page.mouse.move(c.x, c.y);
  const blocked = page.evaluate(() => new Promise<boolean>(r => document.querySelector("canvas")!.addEventListener("contextmenu", e => setTimeout(() => r(e.defaultPrevented)), { once: true })));
  await page.mouse.down({ button: "right" });
  await waitFor(page, s => s.act2.inferno !== null && s.act2.inferno.held, 10_000, "right click starts Inferno");
  await page.mouse.up({ button: "right" });
  expect(await blocked).toBe(true);
  await waitFor(page, s => s.act2.inferno === null, 40_000, "burst ends after release");
  expect(errors).toEqual([]);
});

test("a chord: right pressed while left is held still fires the special", async ({ page }) => {
  await enterForest(page, "bubbo");
  await faceEnemy(page, "bubbo");
  await hook(page, "timeScale", .2);
  const c = await canvasPoint(page);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down({ button: "left" });
  await waitFor(page, s => s.act2.mp.bubbo === 100, 5000, "left costs no MP");
  await page.mouse.down({ button: "right" });
  await waitFor(page, s => s.act2.mp.bubbo < 100, 10_000, "right spends MP in a chord");
  await page.mouse.up({ button: "right" });
  await page.mouse.up({ button: "left" });
});

test("a click on a HUD button never attacks", async ({ page }) => {
  await enterForest(page, "ember");
  await faceEnemy(page, "ember");
  await hook(page, "timeScale", .2);
  const eat = page.locator(".moves-legend button").first();
  await expect(eat).toBeVisible();
  const box = (await eat.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down({ button: "left" });
  await page.waitForTimeout(300);
  expect((await state(page)).act2.breath).toBeNull();
  await page.mouse.up({ button: "left" });
});

test("held fire stops for a menu and needs a fresh press afterwards", async ({ page }) => {
  await enterForest(page, "ember");
  await faceEnemy(page, "ember");
  await hook(page, "timeScale", .2);
  await page.keyboard.down("KeyJ");
  await waitFor(page, s => s.act2.breath !== null, 10_000, "fire on");
  await hook(page, "set", { settingsOpen: true });
  await waitFor(page, s => s.act2.breath === null, 5000, "menu stops fire");
  await hook(page, "set", { settingsOpen: false });
  await page.waitForTimeout(400);
  expect((await state(page)).act2.breath).toBeNull();
  await page.keyboard.up("KeyJ");
});

test("burning panic: stream, attached flames, 2-3 s, in bounds", async ({ page }) => {
  const errors = await enterForest(page, "ember");
  await faceEnemy(page, "ember");
  await hook(page, "timeScale", .25);
  await page.keyboard.down("KeyJ");
  await waitFor(page, s => (s.act2.breath?.age ?? 0) > .1, 20_000, "stream established");
  await hook(page, "timeScale", 0);
  await page.screenshot({ path: `${SHOTS}/01-stream.png` });
  await hook(page, "timeScale", .25);
  const lit = await waitFor(page, s => s.act2.enemies[1].panic !== null, 20_000, "ignites");
  const panic = lit.act2.enemies[1].panic!;
  expect(panic.until - panic.t0).toBeCloseTo(2.5, 5);
  await page.keyboard.up("KeyJ");
  await waitFor(page, s => s.time > panic.t0 + .5, 20_000, "panic running");
  await hook(page, "timeScale", 0);
  await page.screenshot({ path: `${SHOTS}/02-panic.png` });
  await hook(page, "timeScale", .25);
  const during = await waitFor(page, s => s.time > panic.t0 + 1, 20_000, "floor time");
  expect(during.act2.enemies[1].hp).toBeGreaterThan(0);
  expect(during.act2.enemies[1].zone).toBe("forest1");
  const done = await waitFor(page, s => ["ko", "gone"].includes(s.act2.enemies[1].state) || s.act2.enemies[1].panic === null, 30_000, "panic ends or KO");
  expect(done.time - panic.t0).toBeLessThan(3.2);
  expect(errors).toEqual([]);
});

test.describe("touch", () => {
  test.use({ hasTouch: true });
  test("the basic button holds fire and stops on release", async ({ page }) => {
    await enterForest(page, "ember");
    await hook(page, "set", { touch: true });
    await faceEnemy(page, "ember");
    await hook(page, "timeScale", .2);
    const b = page.getByTestId("btn-basic");
    await b.dispatchEvent("pointerdown", { pointerId: 1, pointerType: "touch", button: 0, buttons: 1 });
    await waitFor(page, s => (s.act2.breath?.age ?? 0) > .2, 20_000, "touch hold breathes");
    await b.dispatchEvent("pointerup", { pointerId: 1, pointerType: "touch", button: 0, buttons: 0 });
    await waitFor(page, s => s.act2.breath === null, 3000, "touch release stops");
  });
});
