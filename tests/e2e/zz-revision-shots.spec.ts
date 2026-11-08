// Controller evidence only (not part of the suite): SHOT_TAG=rev npx playwright test zz-revision-shots
import { test, type Page } from "@playwright/test";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { boot, chooseMode, hook, state, tap, waitFor } from "./helpers";
import { newProgress } from "../../src/game/logic/progress";
import type { CompanionId } from "../../src/game/data/combat";
import type { StageId } from "../../src/game/world/lowland";

const TAG = process.env.SHOT_TAG ?? "rev";
const DIR = `.tmp/shots/revision/${TAG}`;
test.skip(!process.env.SHOT_TAG, "controller evidence run only");

function save(cleared: StageId[], x: number, z: number, friend: CompanionId, zone: string) {
  const p = newProgress();
  for (const id of ["leafy", "bubbo", "puff", "ember", "lumo"] as const)
    p.monsters[id] = { discovered: true, friend: true, asked: {}, canKnown: {}, described: { name: true, size: true, part: true }, invited: true };
  p.active = friend; p.metMaple = true; p.endings = 3;
  p.solved = ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame", "canopyAscentRope", "canopyVines", "canopyRope"];
  p.act2 = { ...p.act2, started: true, lumoTaken: true, descended: true, zone: zone as any, checkpoint: "cliff",
    cleared, tutorial: ["attack", "coins", "special", "eat", "rest", "switch"] };
  return { v: 4, progress: p, player: { x, z, yaw: Math.PI }, seconds: 3000 };
}

async function enter(page: Page, s: ReturnType<typeof save>) {
  await page.addInitScript(v => { if (!localStorage.getItem("mi.save.v4")) localStorage.setItem("mi.save.v4", v); }, JSON.stringify(s));
  await boot(page, "fast=1");
  await chooseMode(page, "tap");
  await page.getByTestId("btn-continue").click();
  await waitFor(page, st => st.mode === "explore", 90_000, "loaded lowland");
  await page.setViewportSize({ width: 1366, height: 768 });
}
const snap = (page: Page, name: string) => page.screenshot({ path: `${DIR}/${name}.png` });
async function pose(page: Page, name: string, x: number, z: number, yaw = Math.PI) {
  await hook(page, "teleport", x, z, yaw, true);
  await hook(page, "renderFrames", 30);
  await snap(page, name);
  const s = await state(page) as any;
  console.log(`${name}: profile=${s.camera.profile} calls=${s.perf?.calls} tris=${s.perf?.triangles}`);
}

test("grove crossing", async ({ page }) => {
  test.setTimeout(900_000);
  await enter(page, save(["forest1"], 50, -222, "bubbo", "grove"));
  await hook(page, "combatFixture", { enemies: [] });
  await pose(page, "grove-north-of-stream", 56, -226);
  await pose(page, "grove-old-stream-dry", 46, -210);
  await pose(page, "grove-stream-west", 38, -230);
  await hook(page, "goTo", "groveStream");
  await waitFor(page, st => st.focus?.id === "groveStream", 20_000, "ask at the stream");
  await hook(page, "renderFrames", 10);
  await snap(page, "ferry-ask-north-bank");
  await page.keyboard.press("KeyE");
  await waitFor(page, st => Boolean(st.prompt?.choices.includes("canSwim")), 30_000, "question cards");
  await snap(page, "ferry-question-cards");
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
  await hook(page, "renderFrames", 20);
  await snap(page, "ferry-landed-south-door");
  console.log("after first:", JSON.stringify((await state(page)).player));
});

test("dark cave blocked, then Ember lights it", async ({ page }) => {
  test.setTimeout(900_000);
  await enter(page, save(["forest1"], 64, -227, "ember", "grove"));
  await hook(page, "combatFixture", { enemies: [] });
  await hook(page, "teleport", 67.2, -227, Math.PI / 2, true);
  await hook(page, "renderFrames", 10);
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(1500);
  await snap(page, "cave-dark-blocked");
  await page.keyboard.up("KeyD");
  const st = await state(page) as any;
  console.log("blocked at", st.player.layer, st.player.x.toFixed(2), st.player.z.toFixed(2));
  await hook(page, "goTo", "caveTorches");
  await waitFor(page, s => s.focus?.id === "caveTorches", 20_000, "torch ask");
  await page.keyboard.press("KeyE");
  await waitFor(page, s => Boolean(s.prompt?.choices.includes("canFire") || s.prompt?.choices.length), 30_000, "question cards");
  await snap(page, "cave-ask-cards");
  const choices = ((await state(page)) as any).prompt.choices as string[];
  console.log("choices", choices.join(","));
  await tap(page, choices.find(c => /fire/i.test(c)) ?? choices[0]);
  await hook(page, "timeScale", .5);
  await page.waitForTimeout(2500);
  await snap(page, "cave-ember-lighting");
  await hook(page, "timeScale", 1);
  await waitFor(page, s => s.progress.solved.includes("caveTorches"), 60_000, "lit");
  await waitFor(page, s => Boolean(s.prompt?.choices.includes("thankYou")), 60_000, "thank Ember");
  await tap(page, "thankYou");
  await waitFor(page, s => s.mode === "explore", 60_000, "explore");
  await hook(page, "teleport", 67.2, -216.4, Math.PI / 2, true);
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(2500);
  await page.keyboard.up("KeyD");
  const after = await state(page) as any;
  console.log("mouth B after lighting:", after.player.layer, after.player.x.toFixed(2));
  await hook(page, "renderFrames", 30);
  await snap(page, "cave-entered-lit-mouthB");
});

test("causeway enemies and door threshold", async ({ page }) => {
  test.setTimeout(900_000);
  await enter(page, save(["forest1", "grove", "canopy"], 76, -253, "leafy", "causeway"));
  await hook(page, "renderFrames", 60);
  let s = await state(page) as any;
  const live = s.act2.enemies?.filter((e: any) => e.zone === "causeway") ?? s.combat?.enemies?.filter((e: any) => e.zone === "causeway");
  console.log("causeway live enemies:", live?.length, "remaining:", JSON.stringify(s.act2.stage));
  await snap(page, "causeway-reduced");
  await pose(page, "causeway-east", 98, -252);
  // Walk north from the Causeway through the door, logging the combat zone each step.
  await hook(page, "teleport", 56, -248, Math.PI, true);
  await hook(page, "renderFrames", 10);
  for (let z = -248; z <= -237; z += .5) {
    await hook(page, "teleport", 56, z, Math.PI, false);
    await hook(page, "renderFrames", 3);
    s = await state(page) as any;
    console.log(`north z=${z} combatZone=${s.act2.zone} camera=${s.camera.profile}`);
    if (z === -243 || z === -241) await snap(page, `door-north-${z}`);
  }
  for (let z = -237; z >= -248; z -= .5) {
    await hook(page, "teleport", 56, z, 0, false);
    await hook(page, "renderFrames", 3);
    s = await state(page) as any;
    console.log(`south z=${z} combatZone=${s.act2.zone} camera=${s.camera.profile}`);
  }
});
