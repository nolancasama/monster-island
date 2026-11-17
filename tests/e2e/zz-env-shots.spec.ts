// Controller evidence only (not part of the suite): SHOT_TAG=a1 npx playwright test zz-env-shots
// Environment, town and voyage improvements (2026-11-16): the canopy rope approach, riding, cover piles,
// Port Town (signs, hat, anchor, statue, counters, pier, boat, hidden NPC and chest) and the pirate ship.
import { test, type Page } from "@playwright/test";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { boot, chooseMode, hook, state, tap, waitFor } from "./helpers";
import { newProgress } from "../../src/game/logic/progress";
import type { CompanionId } from "../../src/game/data/combat";
import { STAGES } from "../../src/game/world/lowland";
import { SHIP, SPOT } from "../../src/game/world/pirateShip";
import { PHRASES } from "../../src/game/logic/english";

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
async function view(page: Page, name: string, pos: [number, number, number], at: [number, number, number]) {
  await hook(page, "look", pos, at);
  await hook(page, "renderFrames", 30);
  await snap(page, name);
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
  for (const id of ["puffLeaves", "canopyDryReeds", "groveDryReeds", "emberThicket"]) {
    await hook(page, "follow");
    await hook(page, "nearSecret", id);
    await hook(page, "renderFrames", 40);
    await snap(page, `pile-${id}`);
  }
});

test("piles cleared by fire and wind, and Ember's scorch", async ({ page }) => {
  test.skip(Boolean(ONLY) && ONLY !== "burn");
  test.setTimeout(900_000);
  await enter(page, save(111.6, -209.7, "canopy", "puff"));
  await hook(page, "combatFixture", { enemies: [] });
  // Puff's wind on the leaves.
  await hook(page, "follow");
  await hook(page, "nearSecret", "puffLeaves");
  await hook(page, "renderFrames", 40);
  await page.keyboard.press("KeyJ");
  for (const [ms, name] of [[120, "wind-1"], [300, "wind-2"], [700, "wind-3"]] as const) { await page.waitForTimeout(ms); await snap(page, name); }
  // Ember's fire on the sticks, then the scorched grass recovering.
  await page.keyboard.press("Digit4");
  await hook(page, "nearSecret", "canopyDryReeds");
  await hook(page, "renderFrames", 60);
  await page.keyboard.down("KeyJ");
  await page.waitForTimeout(700);
  await snap(page, "fire-1");
  await page.keyboard.up("KeyJ");
  await page.waitForTimeout(900);
  await snap(page, "fire-2");
  await page.waitForTimeout(1600);
  await snap(page, "fire-3-cleared");
  await hook(page, "teleport", 76.5, -166, Math.PI, true);
  await hook(page, "renderFrames", 60);
  await page.keyboard.down("KeyJ");
  await page.waitForTimeout(1200);
  await page.keyboard.up("KeyJ");
  await page.waitForTimeout(800);
  await snap(page, "scorch-1");
  await hook(page, "look", [76.5, 9, -158], [76.5, 0, -170]);
  await hook(page, "renderFrames", 10);
  await snap(page, "scorch-2-top");
  // The marks lie just past Ember's mouth, behind the rider from the follow camera:
  // breathe across the grass beside the path (facing west) and look from the south.
  await hook(page, "teleport", 74.5, -164, -Math.PI / 2, true);
  await hook(page, "renderFrames", 30);
  await page.keyboard.down("KeyJ");
  await page.waitForTimeout(1200);
  await page.keyboard.up("KeyJ");
  await page.waitForTimeout(800);
  await hook(page, "look", [74, 4.5, -170], [72, 0, -164]);
  await hook(page, "renderFrames", 10);
  await snap(page, "scorch-2-grass");
  await page.waitForTimeout(10_500);
  await hook(page, "renderFrames", 10);
  await snap(page, "scorch-3-recovering");
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
  await view(page, "boat", [86.5, 4.6, -322.5], [79, 0.6, -331]);
  await view(page, "pier-side", [83, 3.2, -326], [76.5, 1.0, -331]);
  await closeUp(page, "statue", 77, -306, [0, 7.5], 3.6, 2.2);
  await closeUp(page, "statue-quarter", 77, -306, [5, 5], 3.2, 2.2);
  await pose(page, "pippa-approach", 57.2, -305.6);
  await closeUp(page, "pippa", 55.6, -308.6, [0.8, 3.2], 1.9, 1.0);
  await closeUp(page, "seaside-chest", 98.6, -314, [0, 3], 2.2, 0.4);
  await closeUp(page, "counter-clothes", 88.25, -299, [-4, 2], 2.2, 0.8);
  await closeUp(page, "hat-east", 93, -299, [6, 3], 7.5, 4.6);
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

/** Story beats worth a frame during the departure and capture (normal speed: lines wait for Space). */
const BEATS: Record<string, string> = {
  "Look! A big ship!": "v1-sighted", "Stop! Stop that boat!": "v3-stop", "Ropes, crew! Bring them here!": "v4-ropes",
  "Ahoy! I'm Captain Redbeard!": "v5-huddle-reveal", "Monster soup!": "v7-monster-soup", "My crew needs help. Talk to them!": "v8-crew-home",
};

test("voyage departure, sighting and capture (normal speed)", async ({ page }) => {
  test.skip(Boolean(ONLY) && ONLY !== "capture");
  test.setTimeout(1_500_000);
  const bag: Record<string, number> = { apples: 2, fish: 1 };
  await page.addInitScript(v => { if (!localStorage.getItem("mi.save.v4")) localStorage.setItem("mi.save.v4", v); },
    JSON.stringify(save(71.5, -315.5, "port", "leafy", p => { p.act2.harbor = true; p.bag = bag; })));
  await boot(page, "");
  await chooseMode(page, "tap");
  await page.getByTestId("btn-continue").click();
  await waitFor(page, st => st.mode === "explore", 90_000, "loaded");
  await page.setViewportSize({ width: 1366, height: 768 });
  await hook(page, "openCloudShip", true);
  await hook(page, "openPirateVoyage", true);
  await hook(page, "goTo", "harbor", 1.4);
  await waitFor(page, st => st.focus?.id === "harbor" && st.mode === "explore", 15_000, "at Gull");
  await snap(page, "v0-berth");
  await page.keyboard.press("KeyE");
  let last = "", prompts = 0, sampling = false, prev: any = null, worst = 0, approachShots = 0;
  const t0 = Date.now();
  for (;;) {
    const st = await state(page) as any;
    if (sampling && st.camera) {
      // Camera continuity: the biggest jump between samples ~150 ms apart while the ship appears.
      if (prev) worst = Math.max(worst, Math.hypot(st.camera.pos.x - prev.x, st.camera.pos.y - prev.y, st.camera.pos.z - prev.z));
      prev = { ...st.camera.pos };
    }
    if (st.mode === "explore" && st.progress.act3.voyage.stage === "captured") break;
    if (Date.now() - t0 > 1_400_000) throw new Error("capture did not finish");
    if (st.line && st.line.en !== last) {
      last = st.line.en;
      if (last === "What a nice day! The sea is calm.") { await page.keyboard.press("Space"); sampling = true; last = ""; await page.waitForTimeout(150); continue; }
      if (BEATS[last]) { await hook(page, "renderFrames", 6); await snap(page, BEATS[last]); }
      if (last === "Look! A big ship!") {
        console.log(`sighting: largest camera step between samples ${worst.toFixed(2)} m`);
        await page.keyboard.press("Space");
        for (; approachShots < 3; approachShots++) { await page.waitForTimeout(1600); await snap(page, `v2-approach-${approachShots}`); }
        last = "";
        continue;
      }
      if (last === "Ropes, crew! Bring them here!") {
        sampling = false;
        await page.keyboard.press("Space");
        await page.waitForTimeout(350);
        await snap(page, "v4b-fade");
        last = "";
        continue;
      }
      await page.keyboard.press("Space");
    } else if (st.prompt?.buttons && st.prompt.status === "ready") {
      const c = st.prompt.choices as string[], q = st.prompt.question ?? "";
      if (c.includes("yesIDo") && prompts++ < 2) { await hook(page, "renderFrames", 4); await snap(page, `v6-question-${prompts}`); }
      const food = Object.keys(bag).find(f => q.includes(f));
      const said = st.prompt.kind === "command" ? c.find(id => (PHRASES as any)[id]?.en === st.prompt.sentences[0]) : undefined;
      const pick = said ?? (c.includes("yesIDo") ? (food && bag[food] ? "yesIDo" : "noIDont") : c.includes("yesTheyCan") ? "yesTheyCan" : c[0]);
      await tap(page, pick);
      last = "";
    } else if (!st.line) last = "";
    await page.waitForTimeout(150);
  }
  console.log(`capture: largest camera step between samples ${worst.toFixed(2)} m`);
  await hook(page, "renderFrames", 30);
  await snap(page, "v9-free-roam");
});

test("voyage cooking: the panel, the markers and the held dish", async ({ page }) => {
  test.skip(Boolean(ONLY) && ONLY !== "cooking");
  test.setTimeout(1_200_000);
  await enter(page, save(71.5, -315.5, "port", "ember", p => { p.act2.harbor = true; }));
  await hook(page, "openCloudShip", true);
  await hook(page, "openPirateVoyage", true);
  await hook(page, "voyageJump", "jobs", []);
  await waitFor(page, st => st.mode === "explore", 30_000, "on the ship");
  const L = (x: number, z: number) => ({ x: SHIP.x + x, z: SHIP.z + z });
  const stand = async (local: { x: number; z: number }, at: { x: number; z: number }) => {
    const s = L(local.x, local.z);
    await hook(page, "teleport", s.x, s.z, Math.atan2(at.x - s.x, at.z - s.z), true);
  };
  const pressE = async (focus: string) => {
    await waitFor(page, s => s.focus?.id === focus && s.mode === "explore", 15_000, `focus ${focus}`);
    await page.keyboard.press("KeyE");
    await page.waitForTimeout(150);
  };
  await stand({ x: SPOT.cook.x - 1.1, z: -14.4 }, L(SPOT.cook.x, SPOT.cook.z));
  await pressE("crew:pepper");
  const shots = new Set<string>();
  let held = false;
  const t0 = Date.now();
  for (;;) {
    const st = await state(page) as any, v = await hook(page, "voyage") as any;
    if (st.progress.act3.voyage.jobs.includes("cooking")) break;
    if (Date.now() - t0 > 1_100_000) throw new Error("cooking did not finish");
    if (st.prompt?.buttons && st.prompt.status === "ready") {
      const c = st.prompt.choices as string[];
      const said = st.prompt.kind === "command" ? c.find(id => (PHRASES as any)[id]?.en === st.prompt.sentences[0]) : undefined;
      await tap(page, said ?? (c.includes("yesIDo") ? "yesIDo" : c[0]));
      continue;
    }
    if (st.mode !== "explore" || v.phase !== "cooking") { await page.waitForTimeout(100); continue; }
    const c = v.cook, stove = L(SPOT.stove.x, SPOT.stove.z);
    if (!shots.has("hud")) { shots.add("hud"); await snap(page, "c1-panel-top-centre"); }
    if (!c.lit) { await stand({ x: 0, z: -15.2 }, stove); await page.keyboard.press("KeyJ"); continue; }
    if (c.pot) {
      await stand({ x: 0, z: -15.2 }, stove);
      if (!held && c.heat < 0.66) { await page.keyboard.down("KeyJ"); held = true; }
      else if (held && c.heat > 0.76) { await page.keyboard.up("KeyJ"); held = false; }
      await page.waitForTimeout(80);
      continue;
    }
    if (held) { await page.keyboard.up("KeyJ"); held = false; }
    if (c.dish && !v.carry) {
      // Within the dish's 2.2 m reach of the stove (local z -16.5).
      await stand({ x: -0.5, z: -15.4 }, stove);
      if (!shots.has("ready")) { shots.add("ready"); await hook(page, "renderFrames", 20); await snap(page, "c2-dish-ready-marker"); }
      await pressE("pot");
      continue;
    }
    if (v.carry?.kind === "dish" && c.order) {
      const who = v.crew[c.order.who];
      if (!shots.has("carry")) {
        shots.add("carry");
        await hook(page, "renderFrames", 20);
        await snap(page, "c3-carrying-delivery-marker");
        const p = (await state(page) as any).player;
        await hook(page, "look", [p.x + Math.sin(p.yaw) * 2.6 + 0.8, p.y + 1.5, p.z + Math.cos(p.yaw) * 2.6], [p.x, p.y + 0.85, p.z]);
        await hook(page, "renderFrames", 10);
        await snap(page, "c4-held-dish-front");
        await hook(page, "look", [p.x + Math.cos(p.yaw) * 2.4, p.y + 1.3, p.z - Math.sin(p.yaw) * 2.4], [p.x, p.y + 0.85, p.z]);
        await hook(page, "renderFrames", 10);
        await snap(page, "c5-held-dish-side");
        await hook(page, "follow");
      }
      await hook(page, "teleport", who.x - 1.3, who.z + 0.4, Math.atan2(1.3, -0.4), true);
      await pressE(`crew:${c.order.who}`);
      continue;
    }
    if (v.carry?.kind === "food") { await stand({ x: -0.5, z: -15.4 }, stove); await pressE("pot"); continue; }
    if (c.order && !v.carry) {
      const crate = { fish: -15.9, meat: -15.1, apples: -14.3, bananas: -13.6 }[c.order.food as string]!;
      await stand({ x: SPOT.supplies.x + 1.15, z: crate }, L(SPOT.supplies.x, crate));
      await pressE(`crate:${c.order.food}`);
      continue;
    }
    const next = ["tom", "sam", "max"].find(id => !c.orders.some((o: any) => o.who === id));
    if (next) { const w = v.crew[next]; await hook(page, "teleport", w.x - 1.4, w.z + 0.3, Math.atan2(1.4, -0.3), true); await pressE(`crew:${next}`); }
    await page.waitForTimeout(100);
  }
  if (held) await page.keyboard.up("KeyJ");
});

/** Riding comfort and Port Town geometry fixes (2026-11-17): every sign, the awnings, pier, hat and inn sign. */
test("town geometry fixes", async ({ page }) => {
  test.skip(Boolean(ONLY) && ONLY !== "fixes");
  test.setTimeout(900_000);
  await enter(page, save(77, -303, "port"));
  await hook(page, "combatFixture", { enemies: [] });
  // Every sign board, face on and from the plaza side.
  const signs: Array<[string, number, number, number]> = [
    ["market", 64.05, 2.1, -296.3], ["clothes", 89.95, 2.3, -296.3], ["trainer", 64.05, 2.2, -309.55],
    ["inn", 89.45, 3.5, -309.3], ["harbor", 66, 2.2, -317.4], ["gate", 76, 4.6, -288.1],
  ];
  for (const [name, x, y, z] of signs) {
    const g = await hook(page, "groundAt", x, z) as number;
    await view(page, `sign-${name}`, [x, g + y + 0.5, z + 3.2], [x, g + y, z]);
    await view(page, `sign-${name}-angle`, [x + (x < 77 ? 3 : -3), g + y + 1.2, z + 3], [x, g + y, z]);
  }
  // The awnings: front, the high camera's angle, and from below; then a slow camera slide for flicker.
  for (const [name, x, dir] of [["market", 63.45, 1], ["clothes", 90.55, -1]] as const) {
    const g = await hook(page, "groundAt", x, -299) as number;
    await view(page, `awning-${name}-front`, [x + dir * 4, g + 2.6, -299], [x, g + 2.7, -299]);
    await view(page, `awning-${name}-high`, [x + dir * 6, g + 7, -293], [x, g + 2.7, -299]);
    await view(page, `awning-${name}-end`, [x + dir * 1.6, g + 2.2, -295.6], [x, g + 2.75, -298]);
    for (let i = 0; i < 4; i++) await view(page, `awning-${name}-slide-${i}`, [x + dir * 9, g + 6, -291 + i * 0.07], [x, g + 2.7, -299]);
  }
  // Each awning's south support from beside and below, where it meets the fabric.
  for (const [name, x, dir] of [["market", 63.2, 1], ["clothes", 90.8, -1]] as const) {
    const g = await hook(page, "groundAt", x, -301.5) as number;
    await view(page, `awning-${name}-support`, [x + dir * 2.4, g + 2.1, -303.8], [x + dir * .3, g + 2.55, -301.5]);
    await view(page, `awning-${name}-support-top`, [x + dir * 2.2, g + 4.2, -303.2], [x + dir * .4, g + 2.6, -301.5]);
  }
  // The pier: above, side, walking along it; a slide for flicker; and Gull's boat beside it.
  const q = await hook(page, "groundAt", 76, -321) as number;
  await view(page, "pier-above", [79, q + 9, -320], [76, q, -330]);
  await view(page, "pier-side-low", [81.5, q + 1.2, -326], [76, q, -329]);
  for (let i = 0; i < 4; i++) await view(page, `pier-slide-${i}`, [86, q + 5, -318 + i * 0.07], [76, q, -330]);
  await pose(page, "pier-walk", 76, -330);
  // The hat: from the plaza and from both side approaches.
  await closeUp(page, "hat-plaza", 93, -299, [-12, -4], 6.5, 5);
  await closeUp(page, "hat-north-approach", 93, -299, [-4, 11], 6, 5);
  await closeUp(page, "hat-south-approach", 93, -299, [-5, -9], 6, 5);
  await closeUp(page, "hat-level", 93, -299, [0, 9], 5.3, 5.3);
  // The inn's moon sign (no words) and its SEASIDE INN board.
  const ig = await hook(page, "groundAt", 89.7, -314.5) as number;
  await view(page, "inn-moon", [86.7, ig + 3, -314.5], [89.7, ig + 2.62, -314.5]);
  await view(page, "inn-moon-angle", [87, ig + 3.6, -312], [89.7, ig + 2.62, -314.5]);
  for (let i = 0; i < 3; i++) await view(page, `inn-both-slide-${i}`, [84, ig + 4, -306 + i * 0.07], [89.6, ig + 3, -312]);
});

test("riding comfort", async ({ page }) => {
  test.skip(Boolean(ONLY) && ONLY !== "ride");
  test.setTimeout(900_000);
  await enter(page, save(107.5, -196, "forest1", "leafy"));
  await hook(page, "combatFixture", { enemies: [] });
  for (const f of ["bubbo", "ember"] as const) {
    await page.keyboard.press(f === "bubbo" ? "Digit2" : "Digit4");
    await hook(page, "teleport", 100, -190, Math.PI / 2, true);
    await hook(page, "renderFrames", 60);
    await snap(page, `ride-${f}-0-still`);
    // Walking east, seen side-on by the follow camera: a burst through a few strides.
    await page.keyboard.down("KeyD");
    await page.waitForTimeout(400);
    for (let i = 0; i < 6; i++) { await snap(page, `ride-${f}-1-walk-${i}`); await page.waitForTimeout(90); }
    await page.keyboard.up("KeyD");
    // A turn, then an attack.
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(250);
    await snap(page, `ride-${f}-2-turn`);
    await page.keyboard.up("KeyW");
    await page.keyboard.press("KeyJ");
    for (let i = 0; i < 3; i++) { await page.waitForTimeout(110); await snap(page, `ride-${f}-3-attack-${i}`); }
  }
});
