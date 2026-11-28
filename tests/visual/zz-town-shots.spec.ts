// Controller evidence only (not part of the suite): SHOT_TAG=t1 npx playwright test zz-town-shots
// Port Town revamp (docs/PORT_TOWN_REVAMP.md §9): town, palisade, worn items, panels, combo feedback.
import { test, type Page } from "@playwright/test";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { boot, chooseMode, hook, state, waitFor } from "../e2e/helpers";
import { newProgress } from "../../src/game/logic/progress";
import type { CompanionId } from "../../src/game/data/combat";
import { STAGES } from "../../src/game/world/lowland";
import { WEARABLE_IDS } from "../../src/game/data/wearables";

const TAG = process.env.SHOT_TAG ?? "t1";
const DIR = `.tmp/shots/town/${TAG}`;
const ONLY = process.env.SHOT_ONLY;
test.skip(!process.env.SHOT_TAG, "controller evidence run only");

const OUTFIT = {
  player: { head: "crown", face: "sunglasses" }, leafy: { head: "pirateHat", face: "mustache" },
  bubbo: { head: "bigBow", face: "heartGlasses" }, puff: { head: "partyHat", face: "goggles" }, ember: { head: "knightHelmet" },
};

function save(x: number, z: number, zone: string, upgrades: CompanionId[] = [], active: CompanionId = "leafy") {
  const p = newProgress();
  for (const id of ["leafy", "bubbo", "puff", "ember", "lumo"] as const)
    p.monsters[id] = { discovered: true, friend: true, asked: {}, canKnown: {}, described: { name: true, size: true, part: true }, invited: true };
  p.active = active; p.metMaple = true; p.endings = 3;
  p.solved = ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame", "canopyAscentRope", "canopyVines", "canopyRope"];
  p.act2 = { ...p.act2, started: true, lumoTaken: true, descended: true, portFound: true, bought: true, zone: zone as any, checkpoint: "port",
    cleared: [...STAGES], tutorial: ["attack", "coins", "special", "eat", "rest", "switch"], coins: 400, items: { amber: 3 }, upgrades,
    chests: ["forestChest"], wardrobe: { owned: [...WEARABLE_IDS], worn: OUTFIT as any, visited: true } };
  return { v: 4, progress: p, player: { x, z, yaw: 0 }, seconds: 3000 };
}

async function enter(page: Page, s: ReturnType<typeof save>) {
  await page.addInitScript(v => { if (!localStorage.getItem("mi.save.v4")) localStorage.setItem("mi.save.v4", v); }, JSON.stringify(s));
  await boot(page, "fast=1");
  await chooseMode(page, "tap");
  await page.getByTestId("btn-continue").click();
  await waitFor(page, st => st.mode === "explore", 90_000, "loaded");
  await page.setViewportSize({ width: 1366, height: 768 });
}
const snap = (page: Page, name: string) => page.screenshot({ path: `${DIR}/${name}.png` });
/** Panels rise in over .2 s: let them settle before a capture. */
const snapPanel = async (page: Page, name: string) => { await page.waitForTimeout(450); await snap(page, name); };
async function pose(page: Page, name: string, x: number, z: number, yaw = Math.PI) {
  await hook(page, "follow");
  await hook(page, "teleport", x, z, yaw, true);
  await hook(page, "renderFrames", 40);
  await snap(page, name);
  const s = await state(page) as any;
  console.log(`${name}: profile=${s.camera?.profile} calls=${s.perf?.calls} tris=${s.perf?.triangles}`);
}
async function closeUp(page: Page, name: string, x: number, z: number, from: [number, number], h = 2.2, at = 0.9) {
  const g = await hook(page, "groundAt", x, z) as number;
  await hook(page, "look", [x + from[0], g + h, z + from[1]], [x, g + at, z]);
  await hook(page, "renderFrames", 30);
  await snap(page, name);
}

test("town, palisade and the dressed party", async ({ page }) => {
  test.skip(Boolean(ONLY) && ONLY !== "town");
  test.setTimeout(900_000);
  await enter(page, save(77, -303, "port"));
  await hook(page, "combatFixture", { enemies: [] });
  await pose(page, "plaza", 77, -303);
  await pose(page, "west-market", 67, -300);
  await pose(page, "west-trainer", 67, -311.5);
  await pose(page, "east-clothes", 87, -300);
  await pose(page, "east-inn", 87, -311.5);
  await pose(page, "clothes-landmark", 84, -291.5);
  await pose(page, "harbor", 72, -314.5);
  await pose(page, "gate-inside", 76, -292.5);
  await pose(page, "gate-outside", 76, -283.5);
  await pose(page, "coast-approach", 73, -271);
  // The party in their clothes, facing the camera (north).
  await hook(page, "follow");
  await hook(page, "teleport", 77, -299.5, 0, true);
  await hook(page, "placeMonster", "leafy", 75.4, -300.4, .3);
  await hook(page, "placeMonster", "bubbo", 78.8, -300.6, -.3);
  await hook(page, "placeMonster", "puff", 76.1, -301.6, .15);
  await hook(page, "placeMonster", "ember", 79.9, -302, -.35);
  await hook(page, "renderFrames", 20);
  await closeUp(page, "party-front", 77.6, -300.8, [0, 5.2], 2.6, .9);
  await closeUp(page, "party-high", 77.6, -300.8, [0, 7.5], 5.4, .7);
  await closeUp(page, "player-face", 77, -299.5, [.4, 1.6], 1.7, 1.25);
  await closeUp(page, "leafy-face", 75.4, -300.4, [.5, 1.9], 1.5, .8);
  await closeUp(page, "bubbo-face", 78.8, -300.6, [-.4, 2.1], 1.6, .7);
  await closeUp(page, "puff-face", 76.1, -301.6, [.2, 1.6], 1.3, .6);
  await closeUp(page, "ember-face", 79.9, -302, [-.5, 2.6], 2.3, 1.3);
  await hook(page, "follow");
  // Keepers: Ms. Button up close.
  await closeUp(page, "ms-button", 89.2, -299, [-2.6, .4], 1.9, 1.3);
  // Panels at 1366×768 and 1280×800.
  await hook(page, "follow");
  await hook(page, "set", { panel: "clothes" });
  await page.getByTestId("clothes").waitFor();
  await snapPanel(page, "panel-clothes");
  await page.getByTestId("wear-put-pirateHat").click();
  await page.getByTestId("wear-picker").waitFor();
  await snapPanel(page, "panel-clothes-picker");
  await page.getByTestId("wear-not-now").click();
  await hook(page, "set", { panel: "combos" });
  await page.getByTestId("combos").waitFor();
  await snapPanel(page, "panel-combos");
  await page.setViewportSize({ width: 1280, height: 800 });
  await hook(page, "set", { panel: "clothes" });
  await page.getByTestId("clothes").waitFor();
  await snapPanel(page, "panel-clothes-1280");
  await hook(page, "set", { panel: "combos" });
  await snapPanel(page, "panel-combos-1280");
  await hook(page, "set", { panel: null });
});

test("dressed friends in their fight positions", async ({ page }) => {
  test.skip(Boolean(ONLY) && ONLY !== "stances");
  test.setTimeout(900_000);
  await enter(page, save(70, -276, "coast"));
  await hook(page, "combatFixture", { enemies: [] });
  for (const key of ["Digit1", "Digit2", "Digit3", "Digit4"]) {
    await page.keyboard.press(key);
    const s = await waitFor(page, x => (x as any).act2.stance.k > .99 && (x as any).act2.stance.friend === x.progress.active, 20_000, `stance ${key}`) as any;
    await hook(page, "teleport", 70, -276, 0, true);
    await hook(page, "renderFrames", 20);
    await closeUp(page, `stance-${s.progress.active}`, 70, -276, [1.6, 3.4], 2.6, 1.1);
  }
});

test("combo feedback: Blaze and Slam", async ({ page }) => {
  test.skip(Boolean(ONLY) && ONLY !== "combos");
  test.setTimeout(900_000);
  await enter(page, save(70, -280, "coast", ["leafy", "bubbo", "puff", "ember"], "ember"));
  const coast = ((await state(page)) as any).act2.enemies.filter((e: any) => e.zone === "coast").map((e: any) => e.i);
  // Blaze: two enemies in front of Ember's Inferno.
  await hook(page, "teleport", 70, -280, Math.PI, true);
  await hook(page, "combatFixture", { enemies: [{ i: coast[0], x: 69.2, z: -282.6, state: "recover", timer: 99 }, { i: coast[1], x: 70.8, z: -282.6, state: "recover", timer: 99 }] });
  await waitFor(page, x => (x as any).act2.stance.k > .99, 20_000, "Ember carries the player");
  await hook(page, "renderFrames", 10);
  await page.keyboard.down("KeyK");
  await waitFor(page, x => (x as any).act2.combos.some((c: any) => c.kind === "blaze"), 10_000, "blaze");
  await hook(page, "renderFrames", 6);
  await snap(page, "combo-blaze");
  await page.keyboard.up("KeyK");
  // Slam: Puff blows an enemy into the palisade.
  await page.keyboard.press("Digit3");
  await waitFor(page, x => x.progress.active === "puff" && (x as any).act2.stance.k > .99, 20_000, "Puff on the shoulder");
  await hook(page, "teleport", 70, -284.2, Math.PI, true);
  await hook(page, "combatFixture", { enemies: [{ i: coast[2], x: 70, z: -286.3, state: "recover", timer: 99 }] });
  await hook(page, "renderFrames", 10);
  await page.keyboard.press("KeyJ");
  await waitFor(page, x => (x as any).act2.combos.some((c: any) => c.kind === "slam"), 10_000, "slam");
  await hook(page, "renderFrames", 5);
  await snap(page, "combo-slam");
  console.log("combos:", JSON.stringify(((await state(page)) as any).act2.combos));
});

test("panels only", async ({ page }) => {
  test.skip(ONLY !== "panels");
  test.setTimeout(300_000);
  await enter(page, save(77, -303, "port"));
  for (const [w, h] of [[1366, 768], [1280, 800]]) {
    await page.setViewportSize({ width: w, height: h });
    await hook(page, "set", { panel: "clothes" });
    await page.getByTestId("clothes").waitFor();
    await snapPanel(page, `panel-clothes-${w}`);
    await hook(page, "set", { panel: null });
  }
});
