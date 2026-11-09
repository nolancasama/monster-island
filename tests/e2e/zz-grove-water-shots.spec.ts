// Controller evidence only: SHOT_TAG=after npx playwright test zz-grove-water-shots
import { expect, test, type Page } from "@playwright/test";
import { boot, chooseMode, hook, state, tap, waitFor } from "./helpers";
import { newProgress } from "../../src/game/logic/progress";
import { CAVE_MOUTHS, GROVE_CROSSING, GROVE_DOOR, lowlandY } from "../../src/game/world/lowland";
import { GROVE_STREAM_FERRY } from "../../src/game/world/groveStream";
import { SHALLOW_WATER_DEPTH, shallowWaterAt } from "../../src/game/world/groveShallows";
import { gatesOf, isWalkable } from "../../src/game/world/collision";

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

/** A body-clear, three-metre strip in the shared authored water data. */
function wadingStrip() {
  const gates = gatesOf(save().progress);
  for (let z = -215; z >= -235; z -= .5) for (let x = 34; x <= 65; x += .5) {
    let clear = true;
    for (let dx = -1; dx <= 1 && clear; dx += .5) for (let dz = 0; dz >= -3; dz -= .5)
      if (!shallowWaterAt(x + dx, z + dz) || !isWalkable(x + dx, z + dz, gates, .55)) { clear = false; break; }
    if (clear) return { x, z };
  }
  throw new Error("No clear ankle-water strip for Grove evidence");
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

for (const viewport of [{ width: 1366, height: 768 }, { width: 1280, height: 800 }]) {
  test(`Grove flooded forest evidence at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    test.setTimeout(600_000);
    await page.setViewportSize(viewport);
    const start = wadingStrip(), loaded = save();
    loaded.player = { ...start, yaw: Math.PI };
    loaded.progress.solved.push("groveStream", "caveTorches");
    loaded.progress.act2.zone = "grove";
    await page.addInitScript(value => localStorage.setItem("mi.save.v4", value), JSON.stringify(loaded));
    await boot(page, "fast=1");
    await chooseMode(page, "tap");
    await page.getByTestId("btn-continue").click();
    await waitFor(page, s => s.mode === "explore", 90_000, "loaded flooded forest");
    await hook(page, "combatFixture", { enemies: [] });
    const snap = async (name: string) => {
      await hook(page, "renderFrames", 6);
      await page.screenshot({ path: `${DIR}/${name}-${viewport.width}x${viewport.height}.png` });
    };
    const ground = lowlandY(start.x, start.z);
    await hook(page, "look", [start.x, ground + 3.5, start.z + 6], [start.x, ground + .45, start.z - 1]);
    await hook(page, "renderFrames", 20);
    const still = await state(page);
    expect(shallowWaterAt(still.player.x, still.player.z)).toBe(true);
    // `ground` is the feet; `y` is the body. Feet must sit under the ankle-water surface.
    expect(still.player.ground).toBeLessThan(lowlandY(still.player.x, still.player.z) + SHALLOW_WATER_DEPTH);
    await snap("player-wading-feet-under");

    // Real keyboard footsteps populate the pooled splash/ripple trail. Freeze
    // in the observing frame so slow screenshot transport cannot age it away.
    await page.keyboard.down("ArrowUp");
    try {
      await page.waitForFunction(({ x, z }) => {
        const api = (window as unknown as { __mi: { state(): { player: { x: number; z: number } }; timeScale(k: number): void } }).__mi;
        const player = api.state().player;
        if (Math.hypot(player.x - x, player.z - z) < 1.3) return false;
        api.timeScale(0);
        return true;
      }, start, { polling: "raf", timeout: 30_000 });
    } finally {
      await page.keyboard.up("ArrowUp");
    }
    const trail = await state(page);
    expect(shallowWaterAt(trail.player.x, trail.player.z)).toBe(true);
    // Re-aim the fixed evidence lens at the player so the trail is in frame.
    // Known artifact: freezing time inside the rAF poll can drop the rider from
    // this frame; an unfrozen wet walk shows the rider normally (checked 2026-11-09).
    const tg = lowlandY(trail.player.x, trail.player.z);
    await hook(page, "look", [trail.player.x + 1.5, tg + 3.2, trail.player.z + 5.5], [trail.player.x, tg + .45, trail.player.z]);
    await snap("ripple-trail");

    await hook(page, "combatFixture", { enemies: [{ i: 5, x: start.x + .8, z: start.z, state: "chase" }] });
    await hook(page, "timeScale", .35);
    await hook(page, "renderFrames", 18);
    await hook(page, "timeScale", 0);
    const enemy = (await state(page)).act2.enemies.find(e => e.i === 5)!;
    expect(shallowWaterAt(enemy.x, enemy.z)).toBe(true);
    expect(enemy.state).not.toBe("ko");
    await snap("enemy-wading");

    // A burning enemy in ankle water: one white steam burst (and one hiss).
    await hook(page, "combatFixture", { enemies: [{ i: 5, x: enemy.x, z: enemy.z, state: "chase", burn: true }] });
    await hook(page, "timeScale", .35);
    await hook(page, "renderFrames", 12);
    await hook(page, "timeScale", 0);
    const steamed = (await state(page)).act2.enemies.find(e => e.i === 5)!;
    expect(steamed.burn).toBeNull();
    await snap("steam-extinguish");
    await hook(page, "combatFixture", { enemies: [] });

    await hook(page, "teleport", GROVE_CROSSING.near.x, GROVE_CROSSING.near.z, Math.PI, true);
    await hook(page, "follow");
    await snap("lily-pond");
    for (const [index, mouth] of CAVE_MOUTHS.entries()) {
      await hook(page, "teleport", mouth.groundX0 + .6, mouth.z, Math.PI / 2, true);
      await hook(page, "follow");
      await snap(`cave-mouth-${index + 1}`);
    }
    await hook(page, "teleport", start.x, start.z, Math.PI, true);
    await hook(page, "look", [50, ground + 37, -195], [50, ground, -225]);
    await snap("wide-grove-overview");
  });
}
