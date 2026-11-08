import { expect, test, type Page } from "@playwright/test";
import { boot, chooseMode, hook, state, tap, waitFor } from "./helpers";
import { newProgress } from "../../src/game/logic/progress";
import { COMBAT, type CompanionId } from "../../src/game/data/combat";
import { CAVE_MOUTHS, CHESTS, trailPoint, type StageId } from "../../src/game/world/lowland";
import { CAVE_ALCOVE, CAVE_BRAZIERS, CAVE_CHAMBER, CAVE_CHEST, CAVE_ENTRY, CAVE_PORTALS, CAVE_ROUTE, CAVE_SEAL, CAVE_TORCHES } from "../../src/game/world/cave";
import { GROVE_STREAM_FERRY } from "../../src/game/world/groveStream";

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
const S = state;

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

for (const side of ["north", "south"] as const) {
test(`Bubbo's stream ferry: first ask from ${side}, a short ride afterwards`, async ({ page }) => {
  const from = GROVE_STREAM_FERRY[side];
  const to = GROVE_STREAM_FERRY[side === "north" ? "south" : "north"];
  // Load north so save migration does not grant the puzzle before the south-bank ask.
  const errors = await enter(page, save(["forest1"], GROVE_STREAM_FERRY.north.x, GROVE_STREAM_FERRY.north.z, "bubbo"));
  expect((await state(page)).progress.solved).not.toContain("groveStream");
  await hook(page, "teleport", from.x, from.z, Math.atan2(to.x - from.x, to.z - from.z), true);
  await waitFor(page, s => s.focus?.id === "groveStream", 20_000, "ask at the stream");
  await page.keyboard.press("KeyE");
  await tap(page, "canSwim");
  await waitFor(page, s => s.act2.groveStream === "swimming", 60_000, "first swim");
  await shots(page, `ferry-first-${side}`);
  await waitFor(page, s => Boolean(s.prompt?.choices.includes("thankYou")), 60_000, "thank Bubbo");
  await tap(page, "thankYou");
  const crossed = await waitFor(page, s => s.progress.solved.includes("groveStream") && s.mode === "explore", 60_000, "on the opposite bank");
  expect(Math.hypot(crossed.player.x - to.x, crossed.player.z - to.z)).toBeLessThan(.5);
  await waitFor(page, s => s.focus?.id === "groveStream", 20_000, "ride prompt");
  await page.keyboard.press("KeyE");
  const returned = await waitFor(page, s => s.act2.groveStream !== "swimming" && s.mode === "explore" && Math.hypot(s.player.x - from.x, s.player.z - from.z) < .5, 30_000, "back on the starting bank");
  expect(returned.player.frozen).toBe(false);
  expect(errors).toEqual([]);
});
}

for (const fixture of [
  { bank: "north", zone: "grove", granted: false },
  { bank: "south", zone: "grove", granted: true },
  { bank: "south", zone: "canopy", granted: false },
] as const) {
  test(`stream save migration: ${fixture.zone} save on ${fixture.bank} bank grants=${fixture.granted}`, async ({ page }) => {
    const at = GROVE_STREAM_FERRY[fixture.bank];
    const errors = await enter(page, save(["forest1", "grove", "canopy"], at.x, at.z, "bubbo", p => {
      p.act2.zone = fixture.zone;
      p.solved.push("groveLilies");
    }));
    expect((await state(page)).progress.solved.includes("groveStream")).toBe(fixture.granted);
    expect(errors).toEqual([]);
  });
}

async function walkIntoCave(page: Page, mouthIndex: number) {
  const mouth = CAVE_MOUTHS[mouthIndex], portal = CAVE_PORTALS[mouthIndex];
  const x = portal.at.x - portal.enter - .3;
  await hook(page, "teleport", x, mouth.z, Math.PI / 2, true);
  expect((await state(page)).player.layer).toBe("ground");
  // Keyboard movement crosses the actual portal, without forcing a cave layer.
  for (const key of ["KeyD", "KeyW", "KeyS", "KeyA"]) {
    await page.keyboard.down(key);
    await page.waitForTimeout(900);
    await page.keyboard.up(key);
    if ((await state(page)).player.layer === "cave") break;
    await hook(page, "teleport", x, mouth.z, Math.PI / 2, true);
  }
  return waitFor(page, s => s.player.layer === "cave" && s.act2.cave.k >= 1, 20_000, `inside via ${portal.id}`);
}

for (const index of [0, 1]) {
test(`the dark cave blocks mouth ${index + 1} and offers Ember's ask in front`, async ({ page }) => {
  const mouth = CAVE_MOUTHS[index];
  const errors = await enter(page, save(["forest1"], mouth.portalX - 1, mouth.z, "ember", p => p.solved.push("groveStream")));
  await hook(page, "moveTo", mouth.portalX + 1, mouth.z);
  const blocked = await state(page);
  expect(blocked.player.layer).toBe("ground");
  expect(blocked.player.x).toBeLessThanOrEqual(mouth.portalX);
  await waitFor(page, s => s.focus?.id === "caveTorches", 20_000, "ask from the blocked opening");
  // Select the screen direction that pushes east, using the actual follow camera.
  const yaw = (await state(page)).camera.yaw;
  const key = Math.abs(Math.cos(yaw)) >= Math.abs(Math.sin(yaw))
    ? (Math.cos(yaw) >= 0 ? "KeyD" : "KeyA")
    : (Math.sin(yaw) >= 0 ? "KeyS" : "KeyW");
  await page.keyboard.down(key);
  await expect(page.getByText("It's too dark!", { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.keyboard.up(key);
  expect((await state(page)).player.layer).toBe("ground");
  await shots(page, `cave-blocked-${index + 1}`);
  await page.keyboard.press("KeyE");
  await tap(page, "canFire");
  await waitFor(page, s => Boolean(s.prompt?.choices.includes("thankYou")), 60_000, "thank Ember");
  await tap(page, "thankYou");
  await waitFor(page, s => s.mode === "explore" && s.progress.solved.includes("caveTorches"), 30_000, "mouths unlocked");
  expect((await walkIntoCave(page, index)).lowland.visible).toBe(false);
  expect(errors).toEqual([]);
});
}

test("a legacy dark-cave save stays inside, can exit, pull the seal and open the chest", async ({ page }) => {
  const chest = CHESTS.find(c => c.layer === "cave" && c.x === CAVE_CHEST.x && c.z === CAVE_CHEST.z)!;
  const errors = await enter(page, save(["forest1"], CAVE_ENTRY.x, CAVE_ENTRY.z, "leafy", p => p.solved.push("groveStream"), "cave"));
  const inside = await waitFor(page, s => s.player.layer === "cave" && s.act2.cave.k >= 1, 20_000, "legacy save inside");
  expect(inside.act2.cave.spread).toBe(0);
  expect(inside.act2.cave.eyes).toBeGreaterThan(0);
  expect(inside.lowland.visible).toBe(false);
  await shots(page, "cave-dark");
  for (const mouth of CAVE_MOUTHS) {
    await hook(page, "teleport", mouth.portalX + 1, mouth.z, -Math.PI / 2, true, "cave");
    // Portal transitions run during actual movement, not the moveTo collision probe.
    await page.keyboard.down("KeyA");
    await waitFor(page, s => s.player.layer === "ground", 20_000, "exit remains open in the dark");
    await page.keyboard.up("KeyA");
    expect((await state(page)).progress.solved).not.toContain("caveTorches");
  }
  await hook(page, "teleport", CAVE_CHAMBER.x, CAVE_CHAMBER.z, Math.atan2(CAVE_SEAL.x - CAVE_CHAMBER.x, CAVE_SEAL.z - CAVE_CHAMBER.z), true, "cave");
  await hook(page, "renderFrames", 10);
  await page.keyboard.press("KeyJ");
  await waitFor(page, s => s.progress.act2.secrets.includes(chest.secret!), 20_000, "seal pulled in the dark");
  const approach = { x: CAVE_ALCOVE.x + CAVE_ALCOVE.r, z: CAVE_ALCOVE.z };
  await hook(page, "teleport", approach.x, approach.z, Math.atan2(CAVE_CHEST.x - approach.x, CAVE_CHEST.z - approach.z), false, "cave");
  await waitFor(page, s => s.focus?.id === chest.id, 20_000, "chest in reach");
  await page.keyboard.press("KeyE");
  const rich = await waitFor(page, s => s.progress.act2.relics.includes(chest.relic!), 30_000, "Glow Crystal");
  expect(rich.progress.act2.coins).toBeGreaterThanOrEqual(chest.coins);
  await shots(page, "cave-chest-dark");
  expect(errors).toEqual([]);
});

test("Fire Breath and Inferno on cave lighting objects leave the cave dark", async ({ page }) => {
  const errors = await enter(page, save(["forest1"], CAVE_ENTRY.x, CAVE_ENTRY.z, "ember", p => p.solved.push("groveStream"), "cave"));
  let specialReadyAt = 0;
  // Distinct targets let each attack prove a fresh element hit, on both layers.
  for (const [object, layer, key] of [
    [CAVE_BRAZIERS[0], "ground", "KeyJ"], [CAVE_BRAZIERS[1], "ground", "KeyK"],
    [CAVE_TORCHES[0], "cave", "KeyJ"], [CAVE_TORCHES[1], "cave", "KeyK"],
  ] as const) {
    const at = layer === "ground" ? { x: 68, z: CAVE_MOUTHS[0].z } : trailPoint(CAVE_ROUTE, object.s);
    await hook(page, "teleport", at.x, at.z, Math.atan2(object.x - at.x, object.z - at.z), true, layer);
    await waitFor(page, s => s.act2.stance.friend === "ember" && s.act2.stance.k >= .99, 20_000, "Ember ready");
    await hook(page, "setMp", "ember", 100);
    if (key === "KeyK") await waitFor(page, s => s.time >= specialReadyAt, 20_000, "Inferno cooldown");
    await page.keyboard.down(key);
    if (key === "KeyK") {
      const fired = await waitFor(page, s => s.act2.inferno !== null, 10_000, "Inferno launched");
      specialReadyAt = fired.time + COMBAT.ember.special.cooldown;
    }
    await waitFor(page, s => {
      const objects = (s.act2 as typeof s.act2 & { elementObjects: Array<{ id: string; state: string }> }).elementObjects;
      return objects.some(o => o.id === object.id && o.state === "lit");
    }, 20_000, `${key} hits ${object.id}`);
    await page.keyboard.up(key);
    await waitFor(page, s => s.act2.breath === null && s.act2.inferno === null, 15_000, "attack finished");
    const dark = await state(page);
    expect(dark.progress.solved).not.toContain("caveTorches");
    expect(dark.act2.cave.spread).toBe(0);
  }
  expect(errors).toEqual([]);
});

test("Can you make fire? lights the cave, and the lights persist after reloading", async ({ page }) => {
  const mouth = CAVE_MOUTHS[0];
  const errors = await enter(page, save(["forest1"], mouth.groundX0, mouth.z, "ember", p => p.solved.push("groveStream")));
  await hook(page, "goTo", "caveTorches");
  await waitFor(page, s => s.focus?.id === "caveTorches", 20_000, "ask at the mouth");
  await page.keyboard.press("KeyE");
  await tap(page, "canFire");
  await waitFor(page, s => s.act2.cave.spread > 0, 60_000, "brazier lit");
  await shots(page, "torches-lighting");
  await waitFor(page, s => Boolean(s.prompt?.choices.includes("thankYou")), 60_000, "thank Ember");
  await tap(page, "thankYou");
  await waitFor(page, s => s.mode === "explore" && s.progress.solved.includes("caveTorches"), 30_000, "lit");
  await hook(page, "saveNow");
  await page.reload();
  await chooseMode(page, "tap");
  await page.getByTestId("btn-continue").click();
  await waitFor(page, s => s.mode === "explore", 90_000, "reloaded");
  // The saved solve permanently opens both real portals.
  for (const index of [0, 1]) await walkIntoCave(page, index);
  const lit = await waitFor(page, s => s.act2.cave.spread >= 1 && s.act2.cave.litTorches === CAVE_TORCHES.length, 20_000, "fully lit after reload");
  expect(lit.progress.solved).toContain("caveTorches");
  await shots(page, "cave-lit");
  expect(errors).toEqual([]);
});

test("Upper Canopy: climb the rope, fall from an unstable leaf to a checkpoint, climb back down", async ({ page }) => {
  const errors = await enter(page, save(["forest1"], 96.9, -235.9, "puff", p => { p.act2.zone = "canopy"; p.solved.push("canopyAscentRope", "canopyVines", "canopyRope"); }));
  await hook(page, "teleport", 96.9, -235.9, Math.PI, true);
  await waitFor(page, s => s.focus?.id === "upperCanopyUp", 15_000, "rope prompt");
  await page.keyboard.press("KeyE");
  const top = await waitFor(page, s => s.mode === "explore" && !s.player.climbing && s.player.layer === "high", 40_000, "on the leaves");
  expect(top.player.y).toBeGreaterThan(19);
  expect(top.camera.profile).toBe("upper-canopy");
  await shots(page, "upper-top");
  await hook(page, "teleport", 104.4, -226.2, Math.PI, true, "high");
  await hook(page, "renderFrames", 10);
  await hook(page, "teleport", 98.4, -211.6, Math.PI, true, "high");
  const back = await waitFor(page, s => s.act2.hp < 100 && !s.player.falling && s.mode === "explore" && !s.player.frozen, 30_000, "fell and returned");
  expect(back.player.layer).toBe("high");
  expect(Math.hypot(back.player.x - 104.4, back.player.z + 226.2)).toBeLessThan(.5);
  await hook(page, "teleport", 97, -234.3, Math.PI, true, "high");
  await waitFor(page, s => s.focus?.id === "upperCanopyDown", 15_000, "down prompt");
  await page.keyboard.press("KeyE");
  // The combat tick assigns the zone a frame after the layer switch.
  const down = await waitFor(page, s => s.mode === "explore" && !s.player.climbing && s.player.layer === "ground" && s.act2.zone !== null, 40_000, "back on the lower Canopy");
  expect(down.act2.zone).toBe("canopy");
  expect(errors).toEqual([]);
});

test("summit: the Summit Star, then Bubbo's bubble down to the Causeway", async ({ page }) => {
  const errors = await enter(page, save(["forest1", "grove"], 77.6, -205.6, "bubbo", p => { p.act2.zone = "summit"; }, "high"));
  expect((await S(page)).player.layer).toBe("high");
  await waitFor(page, s => s.focus?.id === "summitChest", 15_000, "summit chest");
  await page.keyboard.press("KeyE");
  await waitFor(page, s => s.progress.act2.relics.includes("summitStar"), 30_000, "Summit Star");
  await waitFor(page, s => s.mode === "explore", 30_000, "after the chest");
  await hook(page, "teleport", 76.8, -219.4, Math.PI, true, "high");
  await waitFor(page, s => s.focus?.id === "summitBubble", 15_000, "departure stone");
  await page.keyboard.press("KeyE");
  await tap(page, "canHelp");
  await waitFor(page, s => s.act2.bubble === "flying", 30_000, "floating");
  await shots(page, "bubble-flying");
  const landed = await waitFor(page, s => s.act2.bubble === "idle" && s.mode === "explore" && !s.player.frozen, 60_000, "landed");
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
  const landed = await waitFor(page, s => s.act2.bubble === "idle" && s.mode === "explore" && !s.player.frozen && s.player.layer === "ground", 90_000, "landed in the trees");
  expect(landed.act2.zone).toBe("canopy");
  expect(Math.hypot(landed.player.x - 96.9, landed.player.z + 235.9)).toBeLessThan(.5);
});
