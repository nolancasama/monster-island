// Controller evidence only (not part of the suite): SHOT_TAG=a1 npx playwright test zz-env-shots
// Environment, town and voyage improvements (2026-11-16): the canopy rope approach, riding, cover piles,
// Port Town (signs, hat, anchor, statue, counters, pier, boat, hidden NPC and chest) and the pirate ship.
import { test, type Page } from "@playwright/test";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { boot, chooseMode, hook, state, waitFor } from "./helpers";
import { newProgress } from "../../src/game/logic/progress";
import type { CompanionId } from "../../src/game/data/combat";
import { STAGES } from "../../src/game/world/lowland";
import { SHIP } from "../../src/game/world/pirateShip";

const TAG = process.env.SHOT_TAG ?? "a1";
const DIR = `.tmp/shots/env/${TAG}`;
const ONLY = process.env.SHOT_ONLY;
test.skip(!process.env.SHOT_TAG, "controller evidence run only");

function save(x: number, z: number, zone: string, active: CompanionId = "leafy", patch?: (p: any) => void) {
  const p = newProgress();
  for (const id of ["leafy", "bubbo", "puff", "ember", "lumo"] as const)
    p.monsters[id] = { discovered: true, friend: true, asked: {}, canKnown: {}, described: { name: true, size: true, part: true }, invited: true };
  p.active = active; p.metMaple = true; p.endings = 3;
  p.solved = ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame", "canopyAscentRope", "canopyVines", "canopyRope"];
  p.act2 = { ...p.act2, started: true, lumoTaken: true, descended: true, portFound: true, bought: true, zone: zone as any, checkpoint: "port",
    cleared: [...STAGES], tutorial: ["attack", "coins", "special", "eat", "rest", "switch"], coins: 400, items: { amber: 3 }, upgrades: [], chests: ["forestChest"] };
  p.bag = { apples: 2, fish: 1, bananas: 3 } as any;
  patch?.(p);
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
async function pose(page: Page, name: string, x: number, z: number, yaw = Math.PI) {
  await hook(page, "follow");
  await hook(page, "teleport", x, z, yaw, true);
  await hook(page, "renderFrames", 40);
  await snap(page, name);
  const s = await state(page) as any;
  console.log(`${name}: at=(${s.player?.x?.toFixed(2)},${s.player?.z?.toFixed(2)}) profile=${s.camera?.profile} calls=${s.perf?.calls} tris=${s.perf?.triangles}`);
}
async function closeUp(page: Page, name: string, x: number, z: number, from: [number, number], h = 2.2, at = 0.9) {
  const g = await hook(page, "groundAt", x, z) as number;
  await hook(page, "look", [x + from[0], g + h, z + from[1]], [x, g + at, z]);
  await hook(page, "renderFrames", 30);
  await snap(page, name);
}

test("canopy rope approach and riding", async ({ page }) => {
  test.skip(Boolean(ONLY) && ONLY !== "canopy");
  test.setTimeout(900_000);
  await enter(page, save(107.5, -196, "forest1", "leafy"));
  await hook(page, "combatFixture", { enemies: [] });
  await pose(page, "rope-foot", 107.5, -197.5);
  await pose(page, "rope-west", 104.6, -198.6);
  await pose(page, "rope-east", 110.4, -197);
  await pose(page, "rope-corner", 113, -195);
  // Walking probes: where does the player actually stop?
  for (const [name, x, z] of [["probe-west", 96, -199], ["probe-east", 116, -199.5], ["probe-southwest", 100, -199.8]] as const) {
    await hook(page, "teleport", 107, -197, 0, true);
    await hook(page, "moveTo", x, z);
    const s = await state(page) as any;
    console.log(`${name}: wanted (${x},${z}) stopped at (${s.player.x.toFixed(2)},${s.player.z.toFixed(2)})`);
  }
  await closeUp(page, "rope-overview", 104, -197, [0, 12], 9, 0);
  for (const f of ["bubbo", "ember"] as const) {
    await page.keyboard.press(f === "bubbo" ? "Digit2" : "Digit4");
    await hook(page, "teleport", 107, -192, Math.PI, true);
    await hook(page, "renderFrames", 60);
    await snap(page, `ride-${f}-still`);
    await page.keyboard.down("KeyS");
    await page.waitForTimeout(500);
    await snap(page, `ride-${f}-run`);
    await page.keyboard.up("KeyS");
  }
});

test("cover piles", async ({ page }) => {
  test.skip(Boolean(ONLY) && ONLY !== "piles");
  test.setTimeout(900_000);
  await enter(page, save(109.5, -208.5, "canopy", "puff"));
  await hook(page, "combatFixture", { enemies: [] });
  await pose(page, "pile-puff-leaves", 109.5, -207.5);
  await pose(page, "pile-canopy-reeds", 114, -205.4);
  await pose(page, "pile-grove-reeds", 60, -219);
  await pose(page, "pile-ember-thicket", 87, -170);
});

test("Port Town", async ({ page }) => {
  test.skip(Boolean(ONLY) && ONLY !== "town");
  test.setTimeout(900_000);
  await enter(page, save(77, -303, "port"));
  await hook(page, "combatFixture", { enemies: [] });
  await pose(page, "plaza", 77, -303);
  await pose(page, "plaza-south", 77, -309);
  await pose(page, "west-market", 67, -300);
  await pose(page, "west-trainer", 67, -311.5);
  await pose(page, "east-clothes", 87, -300);
  await pose(page, "east-inn", 87, -311.5);
  await pose(page, "harbor", 72, -314.5);
  await pose(page, "pier", 76, -326);
  await pose(page, "pier-end", 76, -334);
  await pose(page, "behind-market", 56.5, -304);
  await pose(page, "behind-inn", 98.3, -311);
  await closeUp(page, "signs-west", 63, -305, [9, 4], 4.5, 2.6);
  await closeUp(page, "signs-east", 91, -305, [-9, 4], 4.5, 2.6);
  await closeUp(page, "hat", 93, -299, [-8, 5], 7, 4.2);
  await closeUp(page, "hat-north", 93, -299, [-1, 9], 6, 4.2);
  await closeUp(page, "anchor", 67.6, -317.4, [0, 3.2], 1.9, 1.7);
  await closeUp(page, "fountain", 77, -306, [0, 6], 3.5, 0.8);
  await closeUp(page, "counter-harbor", 69.8, -316, [1.5, 4], 2.2, 0.8);
  await closeUp(page, "counter-market", 64.4, -299, [4, 2], 2.2, 0.8);
  await closeUp(page, "boat", 79.6, -333, [-6, 8], 4, 0.8);
  await closeUp(page, "pier-side", 76, -330, [7, 2], 1.8, 0.4);
  // Can the player walk through the harbour counter (customer side → keeper)?
  await hook(page, "teleport", 69.8, -314.4, Math.PI, true);
  await hook(page, "moveTo", 69.8, -316.6);
  const s = await state(page) as any;
  console.log(`counter probe: stopped at (${s.player.x.toFixed(2)},${s.player.z.toFixed(2)})`);
});

test("pirate ship deck", async ({ page }) => {
  test.skip(Boolean(ONLY) && ONLY !== "ship");
  test.setTimeout(900_000);
  await enter(page, save(71.5, -315.5, "port"));
  await hook(page, "voyageShow", true);
  const L = (x: number, z: number) => ({ x: SHIP.x + x, z: SHIP.z + z });
  for (const [name, x, z] of [["deck-stern", 0, 6], ["deck-mid", 0.5, -10.5], ["hold", 0, -4.5], ["galley", 0, -14.5], ["fishing", 0.3, 17]] as const) {
    const w = L(x, z);
    await pose(page, name, w.x, w.z);
  }
  const side = L(0, 0);
  await hook(page, "look", [side.x + 26, 9, side.z + 6], [side.x, 4, side.z - 2]);
  await hook(page, "renderFrames", 30);
  await snap(page, "ship-side");
  await hook(page, "look", [side.x - 10, 14, side.z + 34], [side.x, 3, side.z - 2]);
  await hook(page, "renderFrames", 30);
  await snap(page, "ship-stern-high");
  await hook(page, "look", [side.x + 30, 7, side.z - 4], [side.x, 6, side.z - 4]);
  await hook(page, "renderFrames", 30);
  await snap(page, "sails-broadside");
});
