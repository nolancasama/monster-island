// Port Town extras (2026-11-16): Pippa behind the Food Market ("Do you like apples?"),
// the chest behind the Seaside Inn (opens once and stays open after a reload),
// solid shop counters and the pier level with the quay.
import { expect, test, type Page } from "@playwright/test";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { boot, chooseMode, hook, state, tap, waitFor } from "./helpers";
import { newProgress } from "../../src/game/logic/progress";
import { PIER2, PIPPA, SEASIDE_CHEST, SERVICES, STAGES } from "../../src/game/world/lowland";

function save(x: number, z: number) {
  const p = newProgress();
  for (const id of ["leafy", "bubbo", "puff", "ember", "lumo"] as const)
    p.monsters[id] = { discovered: true, friend: true, asked: {}, canKnown: {}, described: { name: true, size: true, part: true }, invited: true };
  p.active = "leafy"; p.metMaple = true; p.endings = 3;
  p.solved = ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame", "canopyAscentRope", "canopyVines", "canopyRope"];
  p.act2 = { ...p.act2, started: true, lumoTaken: true, descended: true, portFound: true, bought: true, zone: "port" as any, checkpoint: "port",
    cleared: [...STAGES], tutorial: ["attack", "coins", "special", "eat", "rest", "switch"], coins: 100, chests: ["forestChest"] };
  p.bag = { apples: 1 } as any;
  return JSON.stringify({ v: 4, progress: p, player: { x, z, yaw: Math.PI }, seconds: 3000 });
}

async function enter(page: Page, x: number, z: number) {
  await page.addInitScript((v) => { if (!localStorage.getItem("mi.save.v4")) localStorage.setItem("mi.save.v4", v); }, save(x, z));
  const errors = await boot(page, "fast=1");
  await chooseMode(page, "tap");
  await page.getByTestId("btn-continue").click();
  await waitFor(page, (s) => s.mode === "explore", 90_000, "loaded");
  return errors;
}

/** Advance lines until a prompt or exploring. */
async function untilPromptOrExplore(page: Page) {
  return waitFor(page, (s) => Boolean(s.prompt?.buttons && s.prompt.status === "ready") || (s.mode === "explore" && !s.line), 30_000, "prompt or explore");
}

test("Pippa asks whether you like apples, answers both replies, and can be asked again", async ({ page }) => {
  const errors = await enter(page, 56.6, -303.5);
  await hook(page, "teleport", PIPPA.x + 0.3, PIPPA.z - 1.6, 0, true);
  await waitFor(page, (s) => s.focus?.id === "pippa", 15_000, "focus on Pippa");
  for (const [answer, reply] of [["yesIDo", "Me too! Apples are yummy!"], ["noIDont", "Oh, okay! I like apples. They're sweet!"]] as const) {
    await page.keyboard.press("KeyE");
    const s = await untilPromptOrExplore(page);
    expect(s.prompt?.choices).toEqual(expect.arrayContaining(["yesIDo", "noIDont"]));
    expect(s.prompt?.question).toBe("Do you like apples?");
    await tap(page, answer);
    await waitFor(page, (x) => x.line?.en === reply, 15_000, `reply to ${answer}`);
    await waitFor(page, (x) => x.mode === "explore" && x.focus?.id === "pippa", 30_000, "back to exploring");
  }
  expect(errors).toEqual([]);
});

test("the chest behind the Seaside Inn opens once and stays open after a reload", async ({ page }) => {
  const errors = await enter(page, SEASIDE_CHEST.x, SEASIDE_CHEST.z + 1.6);
  await waitFor(page, (s) => s.focus?.id === "seasideChest", 15_000, "focus on the chest");
  const before = await state(page);
  await page.keyboard.press("KeyE");
  await waitFor(page, (s) => s.progress.act2.chests.includes("seasideChest") && s.mode === "explore", 30_000, "opened");
  const after = await state(page);
  expect(after.progress.act2.coins).toBe(before.progress.act2.coins + 20);
  expect((after.progress.bag as any).fish ?? 0).toBe(((before.progress.bag as any).fish ?? 0) + 1);
  await hook(page, "saveNow");
  await page.reload();
  await page.getByTestId("btn-continue").click();
  const back = await waitFor(page, (s) => s.mode === "explore", 60_000, "continued");
  expect(back.progress.act2.chests).toContain("seasideChest");
  expect(back.progress.act2.coins).toBe(after.progress.act2.coins);
  await page.waitForTimeout(800);
  expect((await state(page)).focus?.id ?? "").not.toBe("seasideChest");
  expect(errors).toEqual([]);
});

test("shop counters are solid and the pier is level with the quay", async ({ page }) => {
  const errors = await enter(page, 77, -303);
  for (const id of Object.keys(SERVICES) as Array<keyof typeof SERVICES>) {
    const { keeper: k, counter: c } = SERVICES[id];
    const dx = c.x - k.x, dz = c.z - k.z, d = Math.hypot(dx, dz);
    await hook(page, "teleport", c.x + (dx / d) * 1.3, c.z + (dz / d) * 1.3, Math.atan2(-dx, -dz), true);
    const q = await hook(page, "moveTo", k.x, k.z) as { x: number; z: number };
    expect(Math.hypot(q.x - c.x, q.z - c.z), id).toBeGreaterThan(c.d / 2 + 0.3);
  }
  await hook(page, "teleport", PIER2.x, PIER2.z1 + 1.2, Math.PI, true);
  const quay = (await state(page)).player.y;
  await hook(page, "teleport", PIER2.x, PIER2.z0 + 2, Math.PI, true);
  await hook(page, "renderFrames", 4);
  const deck = (await state(page)).player.y;
  expect(deck - quay).toBeGreaterThanOrEqual(-0.01);
  expect(deck - quay).toBeLessThan(0.15);
  expect(errors).toEqual([]);
});
