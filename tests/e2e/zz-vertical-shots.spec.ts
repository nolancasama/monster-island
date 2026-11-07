// Controller evidence only (not part of the suite): SHOT_TAG=before|after npx playwright test zz-vertical-shots
import { test, type Page } from "@playwright/test";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { boot, chooseMode, hook, state, tap, waitFor } from "./helpers";
import { newProgress } from "../../src/game/logic/progress";
import type { CompanionId } from "../../src/game/data/combat";
import type { StageId } from "../../src/game/world/lowland";

const TAG = process.env.SHOT_TAG ?? "after";
const ONLY = process.env.SHOT_ONLY ?? "";
const DIR = `.tmp/shots/vertical/${TAG}`;
test.skip(!process.env.SHOT_TAG, "controller evidence run only");

function save(cleared: StageId[], x: number, z: number, friend: CompanionId = "leafy") {
  const p = newProgress();
  for (const id of ["leafy", "bubbo", "puff", "ember", "lumo"] as const)
    p.monsters[id] = { discovered: true, friend: true, asked: {}, canKnown: {}, described: { name: true, size: true, part: true }, invited: true };
  p.active = friend; p.metMaple = true; p.endings = 3;
  p.solved = ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame", "canopyAscentRope", "canopyVines", "canopyRope"];
  p.act2 = { ...p.act2, started: true, lumoTaken: true, descended: true, zone: "causeway", checkpoint: "cliff",
    cleared, tutorial: ["attack", "coins", "special", "eat", "rest", "switch"] };
  return { v: 4, progress: p, player: { x, z, yaw: Math.PI }, seconds: 3000 };
}

async function enter(page: Page, s: ReturnType<typeof save>) {
  await page.addInitScript(v => { if (!localStorage.getItem("mi.save.v4")) localStorage.setItem("mi.save.v4", v); }, JSON.stringify(s));
  await boot(page, "fast=1");
  await chooseMode(page, "tap");
  await page.getByTestId("btn-continue").click();
  await waitFor(page, st => st.mode === "explore", 90_000, "loaded lowland");
}

async function pose(page: Page, name: string, x: number, z: number, yaw = Math.PI) {
  if (ONLY && !name.includes(ONLY)) return;
  await hook(page, "teleport", x, z, yaw, true);
  await hook(page, "renderFrames", 30);
  for (const viewport of [{ width: 1366, height: 768 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await hook(page, "renderFrames", 8);
    await page.screenshot({ path: `${DIR}/${name}-${viewport.width}x${viewport.height}.png` });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = await state(page) as any;
  console.log(`${name}: profile=${s.camera.profile} yaw=${s.camera.yaw?.toFixed?.(2)} pitch=${s.camera.pitch?.toFixed?.(2)} calls=${s.perf?.calls} tris=${s.perf?.triangles}`);
}

test("causeway and grove door, grove not cleared", async ({ page }) => {
  test.setTimeout(600_000);
  await enter(page, save(["forest1", "canopy"], 76, -253));
  await hook(page, "combatFixture", { enemies: [] });
  await pose(page, "causeway-centre", 76, -253);
  await pose(page, "causeway-west", 60, -252);
  await pose(page, "causeway-shrine", 103, -251);
  await pose(page, "causeway-rope-foot", 96, -242.8);
  await pose(page, "causeway-north-strip", 84, -243.2);
  await pose(page, "causeway-ne-corner", 112.2, -243);
  await pose(page, "door-closed-causeway-side", 56, -245);
  await pose(page, "door-closed-grove-side", 55, -238);
});

test("grove stream and ferry", async ({ page }) => {
  test.setTimeout(900_000);
  const s = save(["forest1"], 46, -206, "bubbo");
  s.progress.act2.zone = "grove";
  await enter(page, s);
  await hook(page, "combatFixture", { enemies: [] });
  await pose(page, "stream-north-bank", 46, -205.5);
  await pose(page, "stream-west", 35, -206.5);
  await pose(page, "stream-east", 63, -206);
  if (ONLY && !"stream-ferry".includes(ONLY)) return;
  await hook(page, "goTo", "groveStream");
  await waitFor(page, st => st.focus?.id === "groveStream", 20_000, "ask at the stream");
  await page.keyboard.press("KeyE");
  await tap(page, "canSwim");
  await hook(page, "timeScale", .3);
  await waitFor(page, st => (st as any).act2.groveStream === "swimming", 60_000, "first swim");
  await hook(page, "renderFrames", 20);
  await hook(page, "timeScale", 0);
  await snap(page, "ferry-first-swim");
  await hook(page, "timeScale", 1);
  await waitFor(page, st => Boolean(st.prompt?.choices.includes("thankYou")), 60_000, "thank Bubbo");
  await tap(page, "thankYou");
  await waitFor(page, st => st.progress.solved.includes("groveStream") && st.mode === "explore", 60_000, "first crossing done");
  await snap(page, "ferry-landed-south");
  console.log("after first:", JSON.stringify((await state(page)).player));
  await waitFor(page, st => st.focus?.id === "groveStream", 20_000, "ride prompt on south bank");
  await page.keyboard.press("KeyE");
  await hook(page, "timeScale", .3);
  await waitFor(page, st => (st as any).act2.groveStream === "swimming", 30_000, "repeat swim");
  await hook(page, "timeScale", 0);
  await snap(page, "ferry-repeat-swim");
  await hook(page, "timeScale", 1);
  await waitFor(page, st => (st as any).act2.groveStream !== "swimming" && st.mode === "explore", 30_000, "repeat done");
  console.log("after repeat:", JSON.stringify((await state(page)).player));
});

test("cave", async ({ page }) => {
  test.setTimeout(900_000);
  const s = save(["forest1"], 64, -227, "ember");
  s.progress.act2.zone = "grove";
  s.progress.solved.push("groveStream");
  await enter(page, s);
  await hook(page, "combatFixture", { enemies: [] });
  await pose(page, "cave-mouth-outside", 64.5, -226.2, Math.PI / 2);
  // Walk in through the real portal.
  await hook(page, "teleport", 68.6, -227, Math.PI / 2, true);
  await hook(page, "renderFrames", 10);
  for (const key of ["KeyD", "KeyW", "KeyS", "KeyA"]) {
    await page.keyboard.down(key);
    await page.waitForTimeout(900);
    await page.keyboard.up(key);
    const st = await state(page) as any;
    console.log("after", key, st.player.layer, st.player.x.toFixed(2), st.player.z.toFixed(2));
    if (st.player.layer === "cave") break;
  }
  await hook(page, "renderFrames", 30);
  await snap(page, "cave-walked-in");
  console.log("walked:", JSON.stringify((await state(page) as any).act2.cave), JSON.stringify((await state(page) as any).player));
  for (const [name, x, z] of [["cave-mouth-tunnel", 74, -227.2], ["cave-east-arm", 78.6, -214], ["cave-bend", 81.6, -196.6], ["cave-head", 77, -191], ["cave-chamber", 71.2, -197.6]] as const) {
    if (ONLY && !name.includes(ONLY)) continue;
    await hook(page, "teleport", x, z, Math.PI, true, "cave");
    await hook(page, "renderFrames", 30);
    await snap(page, name);
    const st = await state(page) as any;
    console.log(`${name}: layer=${st.player.layer} y=${st.player.y.toFixed(2)} profile=${st.camera.profile} calls=${st.perf?.calls} tris=${st.perf?.triangles} eyes=${st.act2.cave.eyes}`);
  }
});

test("cave puzzles", async ({ page }) => {
  test.setTimeout(900_000);
  const s = save(["forest1"], 64, -227, "ember");
  s.progress.act2.zone = "grove";
  s.progress.solved.push("groveStream");
  await enter(page, s);
  await hook(page, "combatFixture", { enemies: [] });
  await hook(page, "goTo", "caveTorches");
  await waitFor(page, st => st.focus?.id === "caveTorches", 20_000, "ask at the mouth");
  await snap(page, "torch-unlit-mouth");
  await page.keyboard.press("KeyE");
  await tap(page, "canFire");
  await waitFor(page, st => Boolean((st as any).act2.cave && st.mode !== "explore"), 30_000, "script running");
  await hook(page, "timeScale", .3);
  await waitFor(page, st => (st as any).act2.cave.spread > 0, 60_000, "brazier lit");
  await hook(page, "timeScale", 0);
  await snap(page, "torch-braziers-lit");
  await hook(page, "timeScale", 1);
  await waitFor(page, st => Boolean(st.prompt?.choices.includes("thankYou")), 60_000, "thank Ember");
  await tap(page, "thankYou");
  await waitFor(page, st => st.mode === "explore", 30_000, "explore again");
  await hook(page, "timeScale", .15);
  await hook(page, "teleport", 78.6, -219, Math.PI, true, "cave");
  await hook(page, "renderFrames", 20);
  await hook(page, "timeScale", 0);
  const mid = await state(page) as any;
  console.log("mid spread", mid.act2.cave.spread, "lit", mid.act2.cave.litTorches);
  await snap(page, "cave-spreading");
  await hook(page, "timeScale", 1);
  await waitFor(page, st => (st as any).act2.cave.spread >= 1, 30_000, "fully lit");
  for (const [name, x, z] of [["lit-mouth-tunnel", 74, -227.2], ["lit-east-arm", 78.6, -214], ["lit-bend", 81.6, -196.6], ["lit-chamber", 71.2, -197.6]] as const) {
    await hook(page, "teleport", x, z, Math.PI, true, "cave");
    await hook(page, "renderFrames", 30);
    await snap(page, name);
    const st = await state(page) as any;
    console.log(`${name}: calls=${st.perf?.calls} tris=${st.perf?.triangles} eyes=${st.act2.cave.eyes}`);
  }
  // Leafy pulls the root seal; the chest appears; it gives the Glow Crystal.
  await page.keyboard.press("Digit1");
  await waitFor(page, st => st.progress.active === "leafy", 10_000, "Leafy active");
  await hook(page, "teleport", 71.6, -198.2, Math.atan2(73.8 - 71.6, -199.2 + 198.2), true, "cave");
  await hook(page, "renderFrames", 20);
  await snap(page, "seal-closed");
  await page.keyboard.press("KeyJ");
  await waitFor(page, st => (st as any).progress.act2.secrets.includes("caveRootSeal"), 20_000, "seal pulled");
  await hook(page, "renderFrames", 70);
  await snap(page, "seal-open-chest");
  await hook(page, "teleport", 73.0, -198.8, Math.atan2(74.15 - 73, -199.35 + 198.8), false, "cave");
  await waitFor(page, st => st.focus?.id === "caveRootSealChest", 20_000, "chest in reach");
  await page.keyboard.press("KeyE");
  await waitFor(page, st => (st as any).progress.act2.relics.includes("caveCrystal"), 30_000, "relic granted");
  await hook(page, "renderFrames", 10);
  await snap(page, "relic-found");
  console.log("relics", JSON.stringify((await state(page) as any).progress.act2.relics), "coins", (await state(page)).progress.act2.coins);
});

test("upper canopy", async ({ page }) => {
  test.setTimeout(900_000);
  const s = save(["forest1"], 96.9, -235.9, "puff");
  s.progress.act2.zone = "canopy";
  await enter(page, s);
  await hook(page, "combatFixture", { enemies: [] });
  await pose(page, "upper-rope-foot", 96.9, -236.4, Math.PI);
  await pose(page, "upper-from-lower-canopy", 104, -224.2, Math.PI);
  await pose(page, "upper-from-forest", 100, -190, Math.PI);
  // Climb the rope for real.
  await hook(page, "teleport", 96.9, -235.9, Math.PI, true);
  await waitFor(page, st => st.focus?.id === "upperCanopyUp", 15_000, "rope prompt");
  await page.keyboard.press("KeyE");
  await waitFor(page, st => st.player.climbing, 20_000, "climbing");
  await hook(page, "renderFrames", 20);
  await snap(page, "upper-climbing");
  const top = await waitFor(page, st => st.mode === "explore" && !st.player.climbing && (st as any).player.layer === "high", 40_000, "on the leaves");
  console.log("top", JSON.stringify(top.player), (top as any).camera?.profile);
  await hook(page, "renderFrames", 30);
  await snap(page, "upper-rope-top");
  for (const [name, x, z] of [["upper-broadleaf", 104.4, -226.2], ["upper-windward", 110.6, -219.4], ["upper-crown", 101.8, -214.3], ["upper-approach", 90.2, -205.6]] as const) {
    await hook(page, "teleport", x, z, Math.PI, true, "high");
    await hook(page, "renderFrames", 30);
    await snap(page, name);
    const st = await state(page) as any;
    console.log(`${name}: layer=${st.player.layer} y=${st.player.y.toFixed(2)} profile=${st.camera.profile} calls=${st.perf?.calls} tris=${st.perf?.triangles}`);
  }
  // Stand on the unstable shortcut leaf: it warns, then drops; the player falls back to the last checkpoint.
  await hook(page, "teleport", 98.4, -211.6, Math.PI, true, "high");
  await hook(page, "renderFrames", 6);
  await hook(page, "timeScale", .5);
  await page.waitForTimeout(1500);
  await hook(page, "timeScale", 0);
  await snap(page, "upper-unstable-warning");
  await hook(page, "timeScale", 1);
  const back = await waitFor(page, st => st.act2.hp < 100 && !(st as any).player.falling && st.mode === "explore" && !st.player.frozen, 30_000, "fell and back on a checkpoint");
  console.log("back", JSON.stringify(back.player), "hp", back.act2.hp);
});

test("summit and bubble descent", async ({ page }) => {
  test.setTimeout(900_000);
  const s = save(["forest1", "grove"], 76.8, -218.9, "bubbo");
  s.progress.act2.zone = "summit";
  (s.player as any).layer = "high";
  await enter(page, s);
  await hook(page, "combatFixture", { enemies: [] });
  console.log("loaded", JSON.stringify((await state(page) as any).player));
  await hook(page, "teleport", 86, -203.6, -Math.PI / 2, true, "high");
  await hook(page, "renderFrames", 30);
  await snap(page, "summit-bridge");
  await hook(page, "teleport", 77.6, -205.6, Math.PI, true, "high");
  await hook(page, "renderFrames", 30);
  await snap(page, "summit-chest");
  await waitFor(page, st => st.focus?.id === "summitChest", 15_000, "summit chest in reach");
  await page.keyboard.press("KeyE");
  await waitFor(page, st => (st as any).progress.act2.relics.includes("summitStar"), 30_000, "Summit Star");
  await waitFor(page, st => st.mode === "explore", 30_000, "explore after chest");
  await hook(page, "teleport", 76.8, -219.4, Math.PI, true, "high");
  await waitFor(page, st => st.focus?.id === "summitBubble", 15_000, "departure stone");
  await snap(page, "summit-departure");
  await page.keyboard.press("KeyE");
  await tap(page, "canHelp");
  await hook(page, "timeScale", .4);
  await waitFor(page, st => (st as any).act2.bubble === "forming", 30_000, "bubble forming");
  await page.waitForTimeout(900);
  await hook(page, "timeScale", 0);
  await snap(page, "bubble-forming");
  for (const [i, wait] of [[1, 1500], [2, 3000], [3, 3000]] as const) {
    await hook(page, "timeScale", .4);
    await page.waitForTimeout(wait);
    await hook(page, "timeScale", 0);
    await snap(page, `bubble-flight-${i}`);
    console.log(`flight ${i}`, JSON.stringify((await state(page) as any).player), (await state(page) as any).act2.bubble);
  }
  await hook(page, "timeScale", 1);
  const landed = await waitFor(page, st => (st as any).act2.bubble === "idle" && st.mode === "explore" && !st.player.frozen, 60_000, "landed");
  await hook(page, "renderFrames", 40);
  await snap(page, "bubble-landed");
  console.log("landed", JSON.stringify((landed as any).player), (await state(page) as any).camera?.profile, "zone", (await state(page) as any).act2.zone);
});

async function snap(page: Page, name: string) {
  for (const viewport of [{ width: 1366, height: 768 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await hook(page, "renderFrames", 6);
    await page.screenshot({ path: `${DIR}/${name}-${viewport.width}x${viewport.height}.png` });
  }
}

test("grove door, grove cleared", async ({ page }) => {
  test.setTimeout(600_000);
  await enter(page, save(["forest1", "grove"], 56, -246));
  await hook(page, "combatFixture", { enemies: [] });
  await pose(page, "door-open-causeway-side", 56, -245);
  await pose(page, "door-open-grove-side", 55, -238);
  await pose(page, "door-open-threshold", 56, -241.4);
});
