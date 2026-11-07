/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test, type Page } from "@playwright/test";
import { boot, chooseMode, hook, state, tap, waitFor } from "./helpers";
import { newProgress } from "../../src/game/logic/progress";
import type { CompanionId } from "../../src/game/data/combat";
import type { StageId } from "../../src/game/world/lowland";

/** Act 2 vertical expansion (docs/ACT2_VERTICAL_EXPANSION.md): every new place,
 * asserted from semantic state; screenshots at both Chromebook sizes are evidence. */
const SHOTS = ".tmp/shots/vertical/spec";

function save(cleared: StageId[], x: number, z: number, friend: CompanionId, edit: (p: ReturnType<typeof newProgress>) => void = () => {}, layer?: string) {
  const p = newProgress();
  for (const id of ["leafy", "bubbo", "puff", "ember", "lumo"] as const)
    p.monsters[id] = { discovered: true, friend: true, asked: {}, canKnown: {}, described: { name: true, size: true, part: true }, invited: true };
  p.active = friend; p.metMaple = true; p.endings = 3;
  p.solved = ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame"];
  p.act2 = { ...p.act2, started: true, lumoTaken: true, descended: true, zone: "grove", checkpoint: "cliff", cleared, tutorial: ["attack", "coins", "special", "eat", "rest", "switch"] };
  edit(p);
  return { v: 4, progress: p, player: { x, z, yaw: Math.PI, ...(layer ? { layer } : {}) }, seconds: 3000 };
}

async function enter(page: Page, s: ReturnType<typeof save>) {
  await page.addInitScript(v => { if (!localStorage.getItem("mi.save.v4")) localStorage.setItem("mi.save.v4", v); }, JSON.stringify(s));
  const errors = await boot(page, "fast=1");
  await chooseMode(page, "tap");
  await page.getByTestId("btn-continue").click();
  await waitFor(page, st => st.mode === "explore", 90_000, "loaded lowland");
  await hook(page, "combatFixture", { enemies: [] });
  return errors;
}

async function shots(page: Page, name: string) {
  const previous = page.viewportSize();
  for (const viewport of [{ width: 1366, height: 768 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await hook(page, "renderFrames", 6);
    await page.screenshot({ path: `${SHOTS}/${name}-${viewport.width}x${viewport.height}.png` });
  }
  if (previous) await page.setViewportSize(previous);
}
const S = async (page: Page) => await state(page) as any;

test("Grove door: closed before the Grove is cleared, open after; one fixed Causeway camera", async ({ page }) => {
  const errors = await enter(page, save(["forest1", "canopy"], 56, -245, "leafy"));
  await hook(page, "teleport", 56, -244.5, Math.PI, true);
  await hook(page, "moveTo", 56, -238);
  expect((await S(page)).player.z).toBeLessThan(-241.4);
  await shots(page, "door-closed");
  for (const [x, z] of [[76, -253], [96, -242.8], [104, -251]]) {
    await hook(page, "teleport", x, z, Math.PI, true);
    await hook(page, "renderFrames", 20);
    const s = await S(page);
    expect(s.camera.profile).toBe("ruined-causeway");
    expect(s.camera.yaw).toBeCloseTo(0, 5);
  }
  expect(errors).toEqual([]);
});

test("Grove door opens once the Grove is cleared", async ({ page }) => {
  await enter(page, save(["forest1", "grove"], 56, -245, "leafy"));
  await hook(page, "teleport", 56, -244.5, Math.PI, true);
  await hook(page, "moveTo", 56, -238);
  expect((await S(page)).player.z).toBeGreaterThan(-241.4);
  await shots(page, "door-open");
});

test("Bubbo's stream ferry: Can you swim? the first time, a short ride afterwards", async ({ page }) => {
  const errors = await enter(page, save(["forest1"], 46, -206, "bubbo"));
  await hook(page, "goTo", "groveStream");
  await waitFor(page, s => s.focus?.id === "groveStream", 20_000, "ask at the stream");
  await page.keyboard.press("KeyE");
  await tap(page, "canSwim");
  await waitFor(page, s => (s as any).act2.groveStream === "swimming", 60_000, "first swim");
  await shots(page, "ferry-first");
  await waitFor(page, s => Boolean(s.prompt?.choices.includes("thankYou")), 60_000, "thank Bubbo");
  await tap(page, "thankYou");
  const south = await waitFor(page, s => s.progress.solved.includes("groveStream") && s.mode === "explore", 60_000, "on the south bank");
  expect(south.player.z).toBeLessThan(-213);
  await waitFor(page, s => s.focus?.id === "groveStream", 20_000, "ride prompt");
  await page.keyboard.press("KeyE");
  const north = await waitFor(page, s => (s as any).act2.groveStream !== "swimming" && s.mode === "explore" && s.player.z > -208, 30_000, "back on the north bank");
  expect(north.player.frozen).toBe(false);
  expect(errors).toEqual([]);
});

test("the cave: walk in through the mouth, explore it dark, pull the seal, open the chest", async ({ page }) => {
  const errors = await enter(page, save(["forest1"], 68.6, -227, "leafy", p => p.solved.push("groveStream")));
  await hook(page, "teleport", 68.6, -227, Math.PI / 2, true);
  await hook(page, "renderFrames", 10);
  for (const key of ["KeyD", "KeyW", "KeyS", "KeyA"]) {
    await page.keyboard.down(key);
    await page.waitForTimeout(900);
    await page.keyboard.up(key);
    if ((await S(page)).player.layer === "cave") break;
  }
  const inside = await waitFor(page, s => (s as any).player.layer === "cave" && (s as any).act2.cave.k >= 1, 20_000, "inside the cave");
  expect(inside.act2.cave.spread).toBe(0);
  expect(inside.act2.cave.eyes).toBeGreaterThan(0);
  expect(inside.lowland.visible).toBe(false);
  await shots(page, "cave-dark");
  await hook(page, "teleport", 71.6, -198.2, Math.atan2(2.2, -1), true, "cave");
  await hook(page, "renderFrames", 10);
  await page.keyboard.press("KeyJ");
  await waitFor(page, s => (s as any).progress.act2.secrets.includes("caveRootSeal"), 20_000, "seal pulled in the dark");
  await hook(page, "teleport", 73, -198.8, Math.atan2(1.15, -.55), false, "cave");
  await waitFor(page, s => s.focus?.id === "caveRootSealChest", 20_000, "chest in reach");
  await page.keyboard.press("KeyE");
  const rich = await waitFor(page, s => (s as any).progress.act2.relics.includes("caveCrystal"), 30_000, "Glow Crystal");
  expect(rich.progress.act2.coins).toBeGreaterThanOrEqual(45);
  await shots(page, "cave-chest-dark");
  expect(errors).toEqual([]);
});

test("Can you make fire? lights the cave, and the lights persist after reloading", async ({ page }) => {
  const errors = await enter(page, save(["forest1"], 64, -227, "ember", p => p.solved.push("groveStream")));
  await hook(page, "goTo", "caveTorches");
  await waitFor(page, s => s.focus?.id === "caveTorches", 20_000, "ask at the mouth");
  await page.keyboard.press("KeyE");
  await tap(page, "canFire");
  await waitFor(page, s => (s as any).act2.cave.spread > 0, 60_000, "brazier lit");
  await shots(page, "torches-lighting");
  await waitFor(page, s => Boolean(s.prompt?.choices.includes("thankYou")), 60_000, "thank Ember");
  await tap(page, "thankYou");
  await waitFor(page, s => s.mode === "explore" && s.progress.solved.includes("caveTorches"), 30_000, "lit");
  await hook(page, "saveNow");
  await page.reload();
  await chooseMode(page, "tap");
  await page.getByTestId("btn-continue").click();
  await waitFor(page, s => s.mode === "explore", 90_000, "reloaded");
  await hook(page, "teleport", 78.6, -214, Math.PI, true, "cave");
  const lit = await waitFor(page, s => (s as any).act2.cave.spread >= 1 && (s as any).act2.cave.litTorches === 12, 20_000, "fully lit after reload");
  expect(lit.progress.solved).toContain("caveTorches");
  await shots(page, "cave-lit");
  expect(errors).toEqual([]);
});

test("Upper Canopy: climb the rope, fall from an unstable leaf to a checkpoint, climb back down", async ({ page }) => {
  const errors = await enter(page, save(["forest1"], 96.9, -235.9, "puff", p => { p.act2.zone = "canopy"; p.solved.push("canopyAscentRope", "canopyVines", "canopyRope"); }));
  await hook(page, "teleport", 96.9, -235.9, Math.PI, true);
  await waitFor(page, s => s.focus?.id === "upperCanopyUp", 15_000, "rope prompt");
  await page.keyboard.press("KeyE");
  const top = await waitFor(page, s => s.mode === "explore" && !s.player.climbing && (s as any).player.layer === "high", 40_000, "on the leaves");
  expect(top.player.y).toBeGreaterThan(19);
  expect(top.camera.profile).toBe("upper-canopy");
  await shots(page, "upper-top");
  await hook(page, "teleport", 104.4, -226.2, Math.PI, true, "high");
  await hook(page, "renderFrames", 10);
  await hook(page, "teleport", 98.4, -211.6, Math.PI, true, "high");
  const back = await waitFor(page, s => s.act2.hp < 100 && !(s as any).player.falling && s.mode === "explore" && !s.player.frozen, 30_000, "fell and returned");
  expect(back.player.layer).toBe("high");
  expect(Math.hypot(back.player.x - 104.4, back.player.z + 226.2)).toBeLessThan(.5);
  await hook(page, "teleport", 97, -234.3, Math.PI, true, "high");
  await waitFor(page, s => s.focus?.id === "upperCanopyDown", 15_000, "down prompt");
  await page.keyboard.press("KeyE");
  const down = await waitFor(page, s => s.mode === "explore" && !s.player.climbing && (s as any).player.layer === "ground", 40_000, "back on the lower Canopy");
  expect(down.act2.zone).toBe("canopy");
  expect(errors).toEqual([]);
});

test("summit: the Summit Star, then Bubbo's bubble down to the Causeway", async ({ page }) => {
  const errors = await enter(page, save(["forest1", "grove"], 77.6, -205.6, "bubbo", p => { p.act2.zone = "summit"; }, "high"));
  expect((await S(page)).player.layer).toBe("high");
  await waitFor(page, s => s.focus?.id === "summitChest", 15_000, "summit chest");
  await page.keyboard.press("KeyE");
  await waitFor(page, s => (s as any).progress.act2.relics.includes("summitStar"), 30_000, "Summit Star");
  await waitFor(page, s => s.mode === "explore", 30_000, "after the chest");
  await hook(page, "teleport", 76.8, -219.4, Math.PI, true, "high");
  await waitFor(page, s => s.focus?.id === "summitBubble", 15_000, "departure stone");
  await page.keyboard.press("KeyE");
  await tap(page, "canHelp");
  await waitFor(page, s => (s as any).act2.bubble === "flying", 30_000, "floating");
  await shots(page, "bubble-flying");
  const landed = await waitFor(page, s => (s as any).act2.bubble === "idle" && s.mode === "explore" && !s.player.frozen, 60_000, "landed");
  expect(landed.player.layer).toBe("ground");
  expect(landed.act2.zone).toBe("causeway");
  expect(Math.hypot(landed.player.x - 84.5, landed.player.z + 254.5)).toBeLessThan(.5);
  await hook(page, "renderFrames", 30);
  expect((await S(page)).camera.profile).toBe("ruined-causeway");
  await shots(page, "bubble-landed");
  expect(errors).toEqual([]);
});

test("the bubble lands in the lower Canopy until a walking route opens the Causeway", async ({ page }) => {
  await enter(page, save(["forest1"], 76.8, -219.4, "bubbo", p => { p.act2.zone = "summit"; p.solved.push("summitBubble"); }, "high"));
  await waitFor(page, s => s.focus?.id === "summitBubble", 15_000, "departure stone");
  await page.keyboard.press("KeyE");
  const landed = await waitFor(page, s => (s as any).act2.bubble === "idle" && s.mode === "explore" && !s.player.frozen && (s as any).player.layer === "ground", 90_000, "landed in the trees");
  expect(landed.act2.zone).toBe("canopy");
  expect(Math.hypot(landed.player.x - 96.9, landed.player.z + 235.9)).toBeLessThan(.5);
});
