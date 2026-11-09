// Controller evidence only: SHOT_TAG=after npx playwright test zz-grove-water-shots
import { expect, test, type Page } from "@playwright/test";
import { boot, chooseMode, hook, state, tap, waitFor } from "./helpers";
import { newProgress } from "../../src/game/logic/progress";
import { GROVE_DOOR } from "../../src/game/world/lowland";
import { GROVE_STREAM_FERRY } from "../../src/game/world/groveStream";

const DIR = `.tmp/shots/grove-water/${process.env.SHOT_TAG ?? "after"}`;
test.skip(!process.env.SHOT_TAG, "controller evidence run only");

function save() {
  const p = newProgress();
  for (const id of ["leafy", "bubbo", "puff", "ember", "lumo"] as const)
    p.monsters[id] = { discovered: true, friend: true, invited: true, asked: {}, canKnown: {}, described: { name: true, size: true, part: true } };
  p.active = "bubbo"; p.metMaple = true; p.endings = 3;
  p.solved = ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame"];
  p.act2 = { ...p.act2, started: true, descended: true, lumoTaken: true, zone: "forest1", checkpoint: "cliff",
    cleared: ["forest1"], tutorial: ["attack", "coins", "special", "eat", "rest", "switch"] };
  return { v: 4, progress: p, player: { ...GROVE_STREAM_FERRY.north, yaw: Math.PI }, seconds: 3000 };
}

/** Freeze in the same browser frame that observes the phase/progress. */
async function pauseAt(page: Page, phase: "boarding" | "swimming" | "dismounting", fromZ: number, toZ: number, fraction = 0) {
  await page.waitForFunction(({ phase, fromZ, toZ, fraction }) => {
    const api = (window as unknown as { __mi: {
      state(): { act2: { groveStream: string }; player: { z: number; riding: boolean } };
      timeScale(value: number): void;
    } }).__mi;
    const s = api.state();
    if (s.act2.groveStream !== phase || phase === "boarding" && !s.player.riding
      || (s.player.z - fromZ) / (toZ - fromZ) < fraction) return false;
    api.timeScale(0);
    return true;
  }, { phase, fromZ, toZ, fraction }, { polling: "raf", timeout: 90_000 });
}

for (const side of ["north", "south"] as const) for (const viewport of [{ width: 1366, height: 768 }, { width: 1280, height: 800 }]) {
  test(`Grove water: ${side} departure at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    test.setTimeout(600_000);
    await page.setViewportSize(viewport);
    await page.addInitScript(value => localStorage.setItem("mi.save.v4", value), JSON.stringify(save()));
    await boot(page, "fast=1");
    await chooseMode(page, "tap");
    await page.getByTestId("btn-continue").click();
    await waitFor(page, s => s.mode === "explore", 90_000, "loaded entrance bank");
    await hook(page, "combatFixture", { enemies: [] });
    const snap = async (name: string) => {
      await hook(page, "renderFrames", 6);
      await page.screenshot({ path: `${DIR}/${side}-${name}-${viewport.width}x${viewport.height}.png` });
    };
    const pose = async (name: string, x: number, z: number) => {
      await hook(page, "teleport", x, z, Math.PI, true);
      await hook(page, "renderFrames", 30);
      await snap(name);
    };
    await pose("forest-bank", GROVE_STREAM_FERRY.north.x, GROVE_STREAM_FERRY.north.z);
    const from = GROVE_STREAM_FERRY[side], to = GROVE_STREAM_FERRY[side === "north" ? "south" : "north"];
    await hook(page, "teleport", from.x, from.z, Math.atan2(to.x - from.x, to.z - from.z), true);
    await waitFor(page, s => s.focus?.id === "groveStream", 20_000, "entrance stream ask");
    await page.keyboard.press("KeyE");
    await hook(page, "timeScale", .25);
    await tap(page, "canSwim");
    await pauseAt(page, "boarding", from.z, to.z, .06);
    await snap("boarding");
    expect((await state(page)).camera.profile).toBe("grove-stream-ferry");
    for (const [index, fraction] of [[1, .22], [2, .5], [3, .78]] as const) {
      await hook(page, "timeScale", .35);
      await pauseAt(page, "swimming", from.z, to.z, fraction);
      await snap(`swim-${index}`);
      expect((await state(page)).act2.zone).toBe(side === "north" ? "forest1" : "grove");
    }
    await hook(page, "timeScale", .25);
    await pauseAt(page, "dismounting", from.z, to.z, .995);
    await snap("landing");
    await hook(page, "timeScale", 1);
    await waitFor(page, s => Boolean(s.prompt?.choices.includes("thankYou")), 60_000, "thank Bubbo");
    await tap(page, "thankYou");
    await waitFor(page, s => s.mode === "explore" && s.progress.solved.includes("groveStream"), 60_000, "landed");
    await pose("old-door-channel-dry", 56, -233.8);
    await pose("door", GROVE_DOOR.x, GROVE_DOOR.z + 3.4);
  });
}
