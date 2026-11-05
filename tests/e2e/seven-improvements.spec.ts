import { expect, test, type Page } from "@playwright/test";
import { boot, chooseMode, hook, state, waitFor } from "./helpers";
import { newProgress } from "../../src/game/logic/progress";
import { MAPLE } from "../../src/game/world/island";
import { SECRET_IDS, SECRET_SITES } from "../../src/game/world/elementObjects";

const SHOTS = ".tmp/shots/seven";

function lowlandSave(x: number, z: number, edit: (p: ReturnType<typeof newProgress>) => void = () => {}) {
  const p = newProgress();
  for (const id of ["leafy", "bubbo", "puff", "ember", "lumo"] as const)
    p.monsters[id] = { discovered: true, friend: true, asked: {}, canKnown: {}, described: { name: true, size: true, part: true }, invited: true } as (typeof p.monsters)[typeof id];
  p.active = "bubbo"; p.metMaple = true; p.endings = 3;
  p.solved = ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame", "groveLilies", "canopyVines", "canopyRope"];
  p.act2 = { ...p.act2, started: true, lumoTaken: true, descended: true, portFound: true, harbor: true, zone: "forest1", checkpoint: "cliff",
    cleared: ["forest1", "grove", "canopy", "causeway", "coast"], tutorial: ["attack", "coins", "special", "eat", "rest", "switch"] };
  edit(p);
  return JSON.stringify({ v: 4, progress: p, player: { x, z, yaw: Math.PI }, seconds: 3000 });
}

async function enter(page: Page, x: number, z: number, edit?: (p: ReturnType<typeof newProgress>) => void) {
  await page.addInitScript(save => localStorage.setItem("mi.save.v4", save), lowlandSave(x, z, edit));
  const errors = await boot(page);
  await chooseMode(page, "tap");
  await page.getByTestId("btn-continue").click();
  await waitFor(page, s => s.mode === "explore", 60_000, "exploring");
  await hook(page, "settleAct2Unlocks");
  return errors;
}

/** Hold a real key until the player passes a line, sampling standing height for snaps. */
async function walk(page: Page, key: string, done: (x: number, z: number) => boolean, ms = 40_000) {
  const start = await state(page);
  let last = start.player.y, biggest = 0, p = start.player;
  await page.keyboard.down(key);
  const t0 = Date.now();
  while (Date.now() - t0 < ms && !done(p.x, p.z)) {
    await page.waitForTimeout(80);
    p = (await state(page)).player;
    biggest = Math.max(biggest, Math.abs(p.y - last));
    last = p.y;
  }
  await page.keyboard.up(key);
  return { x: p.x, z: p.z, y: p.y, startY: start.player.y, biggest, arrived: done(p.x, p.z) };
}

test("the player and Maple face each other through the opening conversation", async ({ page }) => {
  const errors = await boot(page);
  await chooseMode(page, "tap");
  await page.getByTestId("btn-start").click();
  await waitFor(page, s => s.line !== null || s.progress.metMaple, 60_000, "Maple speaks");
  await page.waitForTimeout(800);
  const s = await state(page);
  const want = Math.atan2(MAPLE.x - s.player.x, MAPLE.z - s.player.z);
  const off = Math.abs(Math.atan2(Math.sin(want - s.player.yaw), Math.cos(want - s.player.yaw)));
  expect(off, "player faces Maple").toBeLessThan(.05);
  await page.screenshot({ path: `${SHOTS}/maple-opening.png` });
  expect(errors).toEqual([]);
});

test("former camp forest floor stays open to the north, in and out", async ({ page }) => {
  const errors = await enter(page, 86, -170);
  await hook(page, "combatFixture", { enemies: [] });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/former-camp-north-approach.png` });
  const into = await walk(page, "KeyS", (_x, z) => z > -163.5);
  expect(into.arrived, `reached the forest floor from the north, stopped at ${into.x},${into.z}`).toBe(true);
  expect((await state(page)).act2.zone).toBe("forest1");
  await page.screenshot({ path: `${SHOTS}/former-camp-forest.png` });
  const out = await walk(page, "KeyW", (_x, z) => z < -170);
  expect(out.arrived, `left the former camp floor to the north, stopped at ${out.x},${out.z}`).toBe(true);
  expect(errors).toEqual([]);
});

for (const flight of [
  { name: "entrance", foot: [107.5, -183.5], top: [107.5, -202], up: "KeyW", upDone: (_x: number, z: number) => z < -201, downDone: (_x: number, z: number) => z > -184 },
  { name: "exit", foot: [96, -253.5], top: [96, -238.6], up: "KeyS", upDone: (_x: number, z: number) => z > -238.8, downDone: (_x: number, z: number) => z < -253 },
] as const) {
  test(`Canopy ${flight.name} stairs climb and descend smoothly`, async ({ page }) => {
    const errors = await enter(page, flight.foot[0], flight.foot[1]);
    await hook(page, "combatFixture", { enemies: [] });
    await hook(page, "teleport", flight.foot[0], flight.foot[1], Math.PI);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/stairs-${flight.name}-foot.png` });
    const climb = await walk(page, flight.up, flight.upDone);
    console.log(flight.name, "climb", JSON.stringify(climb));
    expect(climb.arrived, `stopped at ${climb.x},${climb.z}`).toBe(true);
    expect(climb.y - climb.startY).toBeGreaterThan(8);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/stairs-${flight.name}-top.png` });
    const down = flight.up === "KeyW" ? "KeyS" : "KeyW";
    const descent = await walk(page, down, flight.downDone);
    console.log(flight.name, "descent", JSON.stringify(descent));
    expect(descent.arrived, `stopped at ${descent.x},${descent.z}`).toBe(true);
    // Side-on evidence of the whole flight.
    const midZ = (flight.foot[1] + flight.top[1]) / 2;
    await hook(page, "look", [flight.foot[0] + 20, 12, midZ + 3], [flight.foot[0], 7, midZ]);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/stairs-${flight.name}-side.png` });
    expect(errors).toEqual([]);
  });
}

test("exit stairs close views", async ({ page }) => {
  await enter(page, 96, -256);
  await hook(page, "combatFixture", { enemies: [] });
  for (const [name, pos, at] of [
    ["looking-up", [96, 5, -262], [96, 6, -245]],
    ["foot-close", [103, 6, -256], [96, 2.5, -250]],
    ["upper", [108, 16, -240], [96, 9, -244]],
  ] as const) {
    await hook(page, "look", [...pos], [...at]);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SHOTS}/exit-${name}.png` });
  }
});

test("three separate pads rise, and normal movement hops across and back", async ({ page }) => {
  const errors = await enter(page, 46, -223.2);
  await hook(page, "combatFixture", { enemies: [] });
  await hook(page, "teleport", 45.8, -223.3, -Math.PI / 2);
  await page.waitForTimeout(1200);
  await hook(page, "look", [41, 11, -214], [40.5, 2, -225]);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/lily-pads.png` });
  await page.evaluate(() => (window as unknown as { __mi: { followCamera?: () => void } }).__mi.followCamera?.());
  await hook(page, "teleport", 45.8, -223.3, -Math.PI / 2);
  await page.waitForTimeout(800);
  const near = (x: number, z: number) => (px: number, pz: number) => Math.hypot(px - x, pz - z) < .9;
  const legs: Array<[string, (x: number, z: number) => boolean]> = [
    ["KeyA", near(42.6, -223.4)], ["KeyW", near(41.4, -226)], ["KeyA", near(38.7, -227.5)], ["KeyS", near(37.04, -225.34)],
    ["KeyW", near(38.7, -227.5)], ["KeyD", near(41.4, -226)], ["KeyS", near(42.6, -223.4)], ["KeyD", near(45.6, -223.2)],
  ];
  for (const [i, [key, done]] of legs.entries()) {
    const leg = await walk(page, key, done, 20_000);
    console.log("hop", i, key, JSON.stringify(leg));
    expect(leg.arrived, `leg ${i} ${key} stopped at ${leg.x},${leg.z}`).toBe(true);
    await page.waitForTimeout(600); // the hop lands at the node's centre
    if (i === 1) await page.screenshot({ path: `${SHOTS}/lily-on-pad.png` });
  }
  expect(errors).toEqual([]);
});

test("the Causeway holds 14 enemies, materialising in smoke by encounter pocket", async ({ page }) => {
  const errors = await enter(page, 60, -252, p => { p.act2.cleared = ["forest1", "grove", "canopy"]; p.act2.zone = "causeway"; });
  const causeway = async () => (await state(page)).act2.enemies.filter(e => e.zone === "causeway");
  expect((await causeway()).length).toBe(14);
  await waitFor(page, s => s.act2.enemies.some(e => e.zone === "causeway" && e.state === "materialising"), 30_000, "first smoke");
  await hook(page, "timeScale", .15);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/smoke-spawn.png` });
  const first = await causeway();
  console.log("states", first.map(e => e.state).join(","));
  expect(first.filter(e => e.state === "dormant").length, "the far pockets are still dormant").toBeGreaterThan(3);
  expect(first.every(e => e.state !== "gone"), "dormant never reads as defeated").toBe(true);
  await hook(page, "timeScale", 1);
  expect(errors).toEqual([]);
});

test("a secret chest is hidden and unfocusable before discovery", async ({ page }) => {
  const errors = await enter(page, 87, -172.5);
  await hook(page, "combatFixture", { enemies: [] });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/chest-hidden.png` });
  expect((await state(page)).focus?.id ?? "").not.toContain("emberThicketChest");
  expect(errors).toEqual([]);
});

test("a discovered secret chest stays revealed after loading, and can be opened", async ({ page }) => {
  const errors = await enter(page, 87.4, -176, p => { p.act2.secrets = ["emberThicket"]; });
  await hook(page, "combatFixture", { enemies: [] });
  await waitFor(page, s => s.focus?.id === "emberThicketChest", 15_000, "focus on the revealed chest");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/chest-revealed.png` });
  expect(errors).toEqual([]);
});

test("every secret conceals its chest before discovery", async ({ page }) => {
  const errors = await enter(page, 87, -172.5);
  await hook(page, "combatFixture", { enemies: [] });
  for (const id of SECRET_IDS) {
    const { approach, chest } = SECRET_SITES[id];
    await hook(page, "teleport", approach.x, approach.z, Math.PI);
    await hook(page, "combatFixture", { enemies: [] });
    await hook(page, "look", [approach.x + (approach.x - chest.x) * .6 + 1.5, 16, approach.z + (approach.z - chest.z) * .6 + 3], [chest.x, 2, chest.z]);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SHOTS}/secret-before-${id}.png` });
  }
  expect(errors).toEqual([]);
});

test("smoke close-up, at quarter speed", async ({ page }) => {
  await enter(page, 80, -258, p => { p.act2.cleared = ["forest1", "grove", "canopy"]; p.act2.zone = "causeway"; });
  await hook(page, "timeScale", .25);
  await hook(page, "look", [84, 6.5, -253], [78, 2.6, -259]);
  await waitFor(page, s => s.act2.enemies.some(e => e.state === "materialising" && Math.hypot(e.x - 78, e.z + 259) < .1), 30_000, "smoke at the shellback");
  for (let i = 0; i < 4; i++) {
    await page.screenshot({ path: `${SHOTS}/smoke-${i}.png` });
    await page.waitForTimeout(350);
  }
});
