import { expect, test, type Page } from "@playwright/test";
import { boot, chooseMode, hook, state, tap, waitFor } from "./helpers";
import { newProgress } from "../../src/game/logic/progress";
import type { CompanionId } from "../../src/game/data/combat";

const SHOTS = ".tmp/shots/grove-canopy";

function forestSave(friend: CompanionId) {
  const p = newProgress();
  for (const id of ["leafy", "bubbo", "puff", "ember", "lumo"] as const)
    p.monsters[id] = { discovered: true, friend: true, asked: {}, canKnown: {}, described: { name: true, size: true, part: true }, invited: true };
  p.active = friend; p.metMaple = true; p.endings = 3;
  p.solved = ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame"];
  p.act2 = { ...p.act2, started: true, lumoTaken: true, descended: true, portFound: true, harbor: true,
    zone: "forest1", checkpoint: "camp", tutorial: ["attack", "coins", "special", "eat", "rest", "switch"] };
  return JSON.stringify({ v: 4, progress: p, player: { x: 75, z: -171, yaw: Math.PI }, seconds: 3000 });
}

async function enterForest(page: Page, friend: CompanionId) {
  await page.addInitScript(save => localStorage.setItem("mi.save.v4", save), forestSave(friend));
  const errors = await boot(page);
  await chooseMode(page, "tap");
  await page.getByTestId("btn-continue").click();
  await waitFor(page, s => s.mode === "explore" && s.act2.zone === "forest1" && s.act2.stance.friend === friend && s.act2.stance.k > .99, 30_000, `${friend} mounted`);
  return errors;
}

async function faceEnemy(page: Page, friend: CompanionId) {
  await hook(page, "timeScale", 0);
  await hook(page, "combatFixture", { enemies: [{ i: 1, x: 75, z: -174, state: "recover", timer: 30 }] });
  await hook(page, "teleport", 75, -171, Math.PI);
  await hook(page, "setMp", friend, 100);
  await waitFor(page, s => s.act2.enemies.find(e => e.i === 1)?.hp === 20, 30_000, "fresh enemy");
}

type Extra = { act2: {
  gustFrame: { frame: number; drawn: boolean; attached: boolean; beakValid: boolean; root: { x: number; y: number; z: number }; beak: { x: number; y: number; z: number } };
  swings: Array<{ enemy: number; control: string | null; centre: { x: number; z: number }; sweep: number; phase: string }>;
} };

test("Fire Breath stays orange and Inferno renders blue, on the same enemy and ground", async ({ page }) => {
  const errors = await enterForest(page, "ember");
  await faceEnemy(page, "ember");
  await hook(page, "timeScale", .15);
  await page.keyboard.down("KeyJ");
  await waitFor(page, s => (s.act2.breath?.age ?? 0) > .12, 60_000, "breath");
  await hook(page, "timeScale", 0);
  await page.screenshot({ path: `${SHOTS}/a1-fire-breath.png` });
  await hook(page, "timeScale", .15);
  await page.keyboard.up("KeyJ");
  await waitFor(page, s => s.act2.breath === null, 30_000, "breath ends");
  await faceEnemy(page, "ember");
  await hook(page, "timeScale", .15);
  await page.keyboard.down("KeyK");
  await waitFor(page, s => (s.act2.inferno?.age ?? 0) > .25, 60_000, "inferno");
  await hook(page, "timeScale", 0);
  await page.screenshot({ path: `${SHOTS}/a2-inferno.png` });
  await hook(page, "timeScale", .15);
  await page.keyboard.up("KeyK");
  expect(errors).toEqual([]);
});

test("Puff's gust root is on the beak on every attached frame while walking and turning", async ({ page }) => {
  const errors = await enterForest(page, "puff");
  await hook(page, "combatFixture", { enemies: [] });
  await hook(page, "teleport", 75, -163, Math.PI);
  let samples = 0, worst = 0, shot = false;
  const seen = new Set<number>();
  for (const key of ["KeyW", "KeyS", "KeyA", "KeyD"]) {
    await page.keyboard.down(key);
    await page.waitForTimeout(250);
    await page.keyboard.down("KeyJ");
    const end = Date.now() + 1500;
    while (Date.now() < end) {
      const f = ((await state(page)) as unknown as Extra).act2.gustFrame;
      if (f.drawn && f.attached && !seen.has(f.frame)) {
        seen.add(f.frame); samples++;
        worst = Math.max(worst, Math.hypot(f.root.x - f.beak.x, f.root.y - f.beak.y, f.root.z - f.beak.z));
        if (!shot) { shot = true; await page.screenshot({ path: `${SHOTS}/a3-puff-gust-moving.png` }); }
      }
    }
    await page.keyboard.up("KeyJ");
    await page.keyboard.up(key);
  }
  console.log(`gust samples ${samples}, worst root-to-beak ${worst.toFixed(4)} m`);
  expect(samples).toBeGreaterThan(3);
  expect(worst).toBeLessThan(.01);
  expect(errors).toEqual([]);
});

test("a single grabbed enemy circles the live player through a full turn, then flies", async ({ page }) => {
  const errors = await enterForest(page, "leafy");
  await faceEnemy(page, "leafy");
  await hook(page, "timeScale", .08);
  await page.keyboard.press("KeyJ");
  await waitFor(page, s => (s as unknown as Extra).act2.swings.some(w => w.control === "grabbed"), 30_000, "grabbed");
  let last = 0, total = 0, prev: number | null = null, shots = 0, releasedAt: { x: number; z: number } | null = null;
  const end = Date.now() + 60_000;
  while (Date.now() < end) {
    const s = await state(page), w = (s as unknown as Extra).act2.swings[0], e = s.act2.enemies.find(e => e.i === 1)!;
    if (!w) break;
    if (w.control !== "grabbed") { releasedAt = { x: e.x, z: e.z }; break; }
    // Measured independently of the swing's own counter, around the live player.
    const a = Math.atan2(e.x - s.player.x, e.z - s.player.z);
    if (prev !== null) total += Math.abs(Math.atan2(Math.sin(a - prev), Math.cos(a - prev)));
    prev = a; last = w.sweep;
    const at = Math.floor(total / (Math.PI / 2));
    if (at >= shots && shots < 4) { await hook(page, "timeScale", 0); await page.screenshot({ path: `${SHOTS}/a4-swing-${shots}.png` }); await hook(page, "timeScale", .08); shots++; }
  }
  console.log(`measured sweep ${(total * 180 / Math.PI).toFixed(0)} deg, recorded ${(last * 180 / Math.PI).toFixed(0)} deg`);
  expect(releasedAt).not.toBeNull();
  expect(total).toBeGreaterThanOrEqual(Math.PI * 2 * .9);
  await hook(page, "timeScale", .5);
  await page.waitForTimeout(900);
  await hook(page, "timeScale", 0);
  await page.screenshot({ path: `${SHOTS}/a5-swing-thrown.png` });
  const after = (await state(page)).act2.enemies.find(e => e.i === 1)!;
  expect(Math.hypot(after.x - releasedAt!.x, after.z - releasedAt!.z)).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});

type Crossing = { act2: { groveCrossing: string; unlock: { groveLilies?: number } } };

test("Bubbo carries the player over first, then only the pads rise, and the return walks", async ({ page }) => {
  const save = JSON.parse(forestSave("bubbo"));
  save.progress.act2.cleared = ["forest1"];
  save.player = { x: 46, z: -224, yaw: -Math.PI / 2 };
  save.progress.act2.zone = "grove";
  await page.addInitScript(s => { if (!localStorage.getItem("mi.save.v4")) localStorage.setItem("mi.save.v4", s); }, JSON.stringify(save));
  const errors = await boot(page);
  await chooseMode(page, "tap");
  await page.getByTestId("btn-continue").click();
  await waitFor(page, s => s.mode === "explore" && s.act2.zone === "grove", 30_000, "in the grove");
  await hook(page, "combatFixture", { enemies: [] });
  await hook(page, "goTo", "groveLilies", 1.4);
  await waitFor(page, s => s.mode === "explore" && s.focus?.id === "groveLilies", 15_000, "focus");
  await page.keyboard.press("KeyE");
  await tap(page, "canSwim");
  // Land under the island, the bank and a bank tree, sampled before anything has moved.
  const probe = async () => page.evaluate(() => {
    const mi = (window as unknown as { __mi: { groundAt?(x: number, z: number): number } }).__mi;
    return mi.groundAt ? [mi.groundAt(35.4, -223.2), mi.groundAt(46, -224), mi.groundAt(33, -226)] : null;
  });
  const before = await probe();
  const shots = new Set<string>();
  let riding = false, solvedBeforeLanding = false;
  const end = Date.now() + 90_000;
  while (Date.now() < end) {
    const s = await state(page), c = (s as unknown as Crossing).act2.groveCrossing;
    if (s.player.riding) riding = true;
    if (c === "swimming" && s.progress.solved.includes("groveLilies")) solvedBeforeLanding = true;
    if (!shots.has(c) && c !== "idle") { shots.add(c); await page.screenshot({ path: `${SHOTS}/b-${c}.png` }); }
    if (c === "raising" && ((s as unknown as Crossing).act2.unlock.groveLilies ?? 0) > .5 && !shots.has("half")) { shots.add("half"); await page.screenshot({ path: `${SHOTS}/b-raising-half.png` }); }
    if (c === "complete") break;
  }
  expect(riding).toBe(true);
  expect(solvedBeforeLanding).toBe(false);
  expect([...shots]).toEqual(expect.arrayContaining(["boarding", "swimming", "dismounting", "raising", "complete"]));
  expect(await probe()).toEqual(before);
  await waitFor(page, s => Boolean(s.prompt?.choices.includes("thankYou")) || s.mode === "explore", 30_000, "thanks or explore");
  if ((await state(page)).prompt) await tap(page, "thankYou");
  await waitFor(page, s => s.mode === "explore", 30_000, "explore");
  const landed = await state(page);
  expect(Math.hypot(landed.player.x - 35.4, landed.player.z + 223.2)).toBeLessThan(3);
  await page.screenshot({ path: `${SHOTS}/b-island-after.png` });
  // Real keys back over the pads to the bank; the ground height follows the pads.
  await hook(page, "teleport", 37, -223.2, Math.PI / 2);
  await page.keyboard.down("KeyD");
  await waitFor(page, s => s.player.x > 45, 30_000, "walks back east");
  await page.keyboard.up("KeyD");
  // Reload: raised, no replay.
  await page.evaluate(() => (window as unknown as { __mi: { saveNow(): void } }).__mi.saveNow());
  await page.reload();
  await chooseMode(page, "tap").catch(() => {});
  await page.getByTestId("btn-continue").click();
  const back = await waitFor(page, s => s.mode === "explore", 30_000, "reloaded");
  expect(back.progress.solved).toContain("groveLilies");
  expect((back as unknown as Crossing).act2.unlock.groveLilies).toBe(1);
  await hook(page, "teleport", 41, -223.2, 0);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/b-reloaded-pads.png` });
  expect(errors).toEqual([]);
});

test("views of the expanded stages, in budget", async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 1272 });
  await page.goto("about:blank");
  const { readFileSync } = await import("node:fs");
  await page.setContent(`<body style="margin:0;background:#000">${readFileSync(".tmp/maps/lowland.svg", "utf8")}</body>`);
  await page.locator("svg").screenshot({ path: `${SHOTS}/map.png` });
  await page.setViewportSize({ width: 1366, height: 768 });
  const save = JSON.parse(forestSave("puff"));
  save.progress.solved.push("groveLilies", "canopyVines", "canopyRope");
  save.progress.act2.cleared = ["forest1", "grove", "canopy"];
  await page.addInitScript(s => localStorage.setItem("mi.save.v4", s), JSON.stringify(save));
  const errors = await boot(page);
  await chooseMode(page, "tap");
  await page.getByTestId("btn-continue").click();
  await waitFor(page, s => s.mode === "explore", 30_000, "loaded");
  await hook(page, "settleAct2Unlocks");
  const views: Array<[string, number, number, number]> = [
    ["grove-entry", 48, -210, Math.PI], ["grove-east", 62, -222, Math.PI], ["grove-lobe", 58, -198, Math.PI], ["grove-south", 50, -236, Math.PI],
    ["canopy-entry", 100, -207, Math.PI], ["canopy-gap", 106, -214.6, Math.PI], ["canopy-broken", 104, -220.5, Math.PI], ["canopy-ring", 92, -228, Math.PI], ["canopy-north", 106, -236, Math.PI],
  ];
  for (const [name, x, z, yaw] of views) {
    await hook(page, "teleport", x, z, yaw);
    await hook(page, "combatFixture", { enemies: [] });
    await page.waitForTimeout(1500);
    const s = await state(page) as unknown as { perf?: { calls: number; triangles: number }; player: { x: number; z: number } };
    console.log(name, s.player.x.toFixed(1), s.player.z.toFixed(1), JSON.stringify(s.perf ?? null));
    await page.screenshot({ path: `${SHOTS}/c-${name}.png` });
  }
  expect(errors).toEqual([]);
});

const canopySave = (friend: CompanionId) => {
  const save = JSON.parse(forestSave(friend));
  save.progress.act2.cleared = ["forest1"];
  save.progress.act2.zone = "canopy";
  save.player = { x: 100, z: -212, yaw: Math.PI };
  return save;
};
type Falling = { player: { falling: boolean; teeter: number; y: number }; act2: { hp: number; enemies: Array<{ i: number; plunge: boolean; state: string; x: number; z: number }>; cleared: string[]; coins?: number } };

test("the player teeters, falls into the Canopy gap, loses HP and lands safely with nothing lost", async ({ page }) => {
  await page.addInitScript(s => localStorage.setItem("mi.save.v4", s), JSON.stringify(canopySave("leafy")));
  const errors = await boot(page, "");
  await chooseMode(page, "tap");
  await page.getByTestId("btn-continue").click();
  await waitFor(page, s => s.mode === "explore" && s.act2.zone === "canopy", 30_000, "in the canopy");
  await hook(page, "combatFixture", { enemies: [] });
  await hook(page, "setHp", 100);
  // A tap at the edge cancels: no fall without a sustained push.
  await hook(page, "teleport", 100, -215.6, Math.PI);
  await page.waitForTimeout(1200);
  const before = await state(page);
  const y0 = before.player.y;
  // Recorded every rendered frame in the page: a screenshot round trip outlasts the fall.
  await page.evaluate(() => {
    const mi = (window as unknown as { __mi: { state(): { player: { falling: boolean; y: number } } } }).__mi;
    const log = { lowest: Infinity, frames: 0, ended: false };
    (window as unknown as { __fall: typeof log }).__fall = log;
    const tick = () => {
      const p = mi.state().player;
      if (p.falling) { log.frames++; log.lowest = Math.min(log.lowest, p.y); }
      else if (log.frames) log.ended = true;
      if (!log.ended) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.keyboard.down("KeyW");
  await page.waitForFunction(y => (window as unknown as { __fall: { lowest: number } }).__fall.lowest < y - 1.5, y0, { timeout: 40_000, polling: "raf" });
  await page.keyboard.up("KeyW");
  await page.screenshot({ path: `${SHOTS}/d-fall-midair.png` });
  await page.waitForFunction(() => (window as unknown as { __fall: { ended: boolean } }).__fall.ended, undefined, { timeout: 40_000 });
  const log = await page.evaluate(() => (window as unknown as { __fall: { lowest: number; frames: number } }).__fall);
  console.log(`fell from ${y0.toFixed(1)} to ${log.lowest.toFixed(1)} over ${log.frames} frames`);
  expect(y0 - log.lowest).toBeGreaterThan(2);
  const after = await waitFor(page, s => s.mode === "explore", 30_000, "explore after fall");
  expect(after.act2.hp).toBe(88);
  expect(after.progress.act2.cleared).toEqual(before.progress.act2.cleared);
  expect(after.player.ground).toBeGreaterThan(y0 - 1);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/d-landed.png` });
  // The ordinary boundary still blocks: pushing east at the outer rim never falls.
  await hook(page, "teleport", 118.2, -212, Math.PI / 2);
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(1500);
  await page.keyboard.up("KeyD");
  expect(((await state(page)) as unknown as Falling).player.falling).toBe(false);
  expect(errors).toEqual([]);
});

test("Puff's blast knocks an enemy off a ledge: it drops, counts as defeated, and rewards stay on ground", async ({ page }) => {
  await page.addInitScript(s => localStorage.setItem("mi.save.v4", s), JSON.stringify(canopySave("puff")));
  const errors = await boot(page);
  await chooseMode(page, "tap");
  await page.getByTestId("btn-continue").click();
  await waitFor(page, s => s.mode === "explore" && s.act2.zone === "canopy" && s.act2.stance.friend === "puff" && s.act2.stance.k > .99, 30_000, "puff mounted");
  const gloom = (await state(page)).act2.enemies.find(e => e.zone === "canopy" && e.kind === "gloomlet")!;
  await hook(page, "timeScale", 0);
  await hook(page, "combatFixture", { enemies: [{ i: gloom.i, x: 100, z: -215, state: "recover", timer: 30 }] });
  await hook(page, "teleport", 100, -212, Math.PI);
  await hook(page, "renderFrames", 3);
  await hook(page, "timeScale", .25);
  await page.keyboard.press("KeyJ");
  const seen = await waitFor(page, s => (s as unknown as Falling).act2.enemies.find(e => e.i === gloom.i)!.plunge, 60_000, "plunge");
  await hook(page, "timeScale", .1);
  await page.waitForTimeout(1500);
  await hook(page, "timeScale", 0);
  await page.screenshot({ path: `${SHOTS}/d-enemy-plunge.png` });
  await hook(page, "timeScale", 1);
  await waitFor(page, s => s.act2.enemies.find(e => e.i === gloom.i)!.state === "gone", 30_000, "gone");
  expect(seen.act2.enemies.find(e => e.i === gloom.i)!.x).toBeCloseTo(100, 0);
  expect(errors).toEqual([]);
});
