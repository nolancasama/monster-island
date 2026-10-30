import { expect, test, type Page } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { boot, chooseMode, hook, state, waitFor, type MiState } from "./helpers";
import { newProgress } from "../../src/game/logic/progress";
import { newAct3 } from "../../src/game/logic/act3";

// These frame captures already retain screenshots and state. Large trace streams
// can stall Windows/SwiftShader context teardown while transferring image data.
test.use({ trace: "off" });

const folder = ".tmp/shots/polish2/combat";
type Projectile = MiState["act2"]["projectiles"][number];

function combatSave() {
  const p = newProgress();
  for (const id of ["leafy", "bubbo", "puff", "ember", "lumo"] as const)
    p.monsters[id] = { discovered: true, friend: true, asked: {}, canKnown: {}, described: { name: true, size: true, part: true }, invited: true };
  p.active = "leafy"; p.metMaple = true; p.endings = 3;
  p.solved = ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame"];
  p.act2 = { ...p.act2, started: true, lumoTaken: true, descended: true, portFound: true, harbor: true, bought: true,
    zone: "forest1", checkpoint: "camp", tutorial: ["attack", "coins", "special", "eat", "rest", "switch"] };
  return JSON.stringify({ v: 4, progress: p, player: { x: 75, z: -171, yaw: Math.PI }, seconds: 3000 });
}

/** Freeze on the renderer's own frame, including CPU-rendered short telegraphs. */
async function pauseAt(page: Page, wanted: { enemy?: number; state?: string; timerBelow?: number; source?: number; age?: number; shot?: number; zAbove?: number; absent?: number }) {
  await page.waitForFunction(w => {
    const api = (window as unknown as { __mi: { state(): MiState; timeScale(n: number): void } }).__mi;
    const s = api.state(), e = s.act2.enemies.find(e => e.i === w.enemy);
    const shot = s.act2.projectiles.find(p => w.shot !== undefined ? p.id === w.shot : p.hostile && p.source === w.source);
    const match = (w.enemy === undefined || (e !== undefined && e.state === w.state && (w.timerBelow === undefined || e.timer <= w.timerBelow))) &&
      (w.source === undefined && w.shot === undefined || Boolean(shot && shot.age >= (w.age ?? 0) && (w.zAbove === undefined || shot.z >= w.zAbove))) &&
      (w.absent === undefined || !s.act2.projectiles.some(p => p.id === w.absent));
    if (match) { api.timeScale(0); return true; }
    return false;
  }, wanted, { polling: "raf", timeout: 60_000 }).catch(async error => {
    const s = await state(page);
    throw new Error(`${String(error)}; combat frame ${JSON.stringify({ wanted, player: s.player,
      shots: s.act2.projectiles, enemies: s.act2.enemies.filter(e => e.state !== "gone") })}`);
  });
}

for (const size of [{ width: 1366, height: 768 }, { width: 1280, height: 800 }]) {
  const label = `${size.width}x${size.height}`;
  test(`straight projectiles and readable ranged combat ${label}`, async ({ page }) => {
    test.setTimeout(480_000);
    await page.setViewportSize(size);
    await page.addInitScript(save => localStorage.setItem("mi.save.v4", save), combatSave());
    const errors = await boot(page); await chooseMode(page, "tap");
    await page.getByTestId("btn-continue").click();
    await waitFor(page, s => s.mode === "explore" && s.act2.stance.k > .99);
    const views: Array<{ name: string; calls: number; triangles: number; fps: number; player: MiState["player"]; projectiles: Projectile[] }> = [];
    const capture = async (name: string) => {
      await mkdir(folder, { recursive: true });
      await hook(page, "snapCamera"); await hook(page, "renderFrames", 3);
      const s = await state(page);
      await page.screenshot({ path: `${folder}/${name}-${label}.png` });
      views.push({ name: `${name}-${label}`, ...s.perf, player: s.player, projectiles: s.act2.projectiles });
      expect(s.perf.calls, `${name} draw calls`).toBeLessThanOrEqual(120);
      expect(s.perf.triangles, `${name} triangles`).toBeLessThanOrEqual(140_000);
      expect(s.micState).not.toBe("listening");
    };
    const fixture = async (i: number, x: number, z: number, mode = "chase") => {
      await hook(page, "combatFixture", { enemies: [{ i, x, z, state: mode, timer: 20 }] });
      await hook(page, "setHp", 100);
    };
    const launch = async (i: number) => {
      await hook(page, "timeScale", .4);
      await pauseAt(page, { source: i, age: .6 });
      return (await state(page)).act2.projectiles.find(p => p.hostile && p.source === i)!;
    };

    // The forest variant charges in the actual fixed gameplay view, then the
    // player's lateral dodge leaves its committed, straight seed path behind.
    const spitter = (await state(page)).act2.enemies.find(e => e.kind === "forestSpitter" && e.zone === "forest1")!;
    expect(spitter).toBeTruthy();
    await hook(page, "timeScale", 0); await fixture(spitter.i, 75, -178.5);
    await hook(page, "teleport", 75, -171, Math.PI);
    await hook(page, "timeScale", .4);
    await pauseAt(page, { enemy: spitter.i, state: "windup", timerBelow: .4 });
    await capture("forest-spitter-telegraph");
    const seed = await launch(spitter.i); await capture("forest-seed-in-flight");
    await hook(page, "teleport", 80, -171, Math.PI);
    await capture("forest-seed-dodge");
    await hook(page, "timeScale", 1); await pauseAt(page, { absent: seed.id });
    expect((await state(page)).act2.hp).toBe(100);

    await hook(page, "timeScale", 1); await hook(page, "teleport", 77, -274.5, Math.PI);
    await waitFor(page, s => s.act2.zone === "coast" && s.act2.stance.k > .99);
    const shooter = (await state(page)).act2.enemies.find(e => e.kind === "raiderShooter" && e.zone === "coast")!;
    expect(shooter).toBeTruthy();
    await hook(page, "timeScale", 0); await fixture(shooter.i, 77, -282);
    await hook(page, "timeScale", .4); await pauseAt(page, { enemy: shooter.i, state: "windup", timerBelow: .4 });
    await capture("raider-shooter-red-charge");
    const bolt = await launch(shooter.i); await capture("raider-bolt-in-flight");
    // The boulder is behind the initial aim point: dodge after release so
    // line of sight was genuinely open at firing, then observe solid impact.
    await hook(page, "teleport", 73, -274.5, Math.PI);
    await hook(page, "timeScale", .5); await pauseAt(page, { shot: bolt.id, zAbove: -273.2 });
    const nearRock = (await state(page)).act2.projectiles.find(p => p.id === bolt.id)!;
    expect(nearRock.vx).toBeCloseTo(bolt.vx); expect(nearRock.vz).toBeCloseTo(bolt.vz);
    await capture("hostile-bolt-approaching-solid");
    await hook(page, "timeScale", .5); await pauseAt(page, { absent: bolt.id });
    expect((await state(page)).act2.hp).toBe(100); await capture("hostile-bolt-blocked-by-solid");

    // Every player's basic keeps its facing even while an actual chasing
    // enemy moves sideways out of the ray after release.
    for (const [key, friend] of [[2, "bubbo"], [3, "puff"], [4, "ember"]] as const) {
      await hook(page, "timeScale", 1); await hook(page, "teleport", 76, -170, Math.PI);
      await page.keyboard.press(`Digit${key}`);
      await waitFor(page, s => s.act2.zone === "forest1" && s.act2.stance.friend === friend && s.act2.stance.k > .99);
      const enemy = (await state(page)).act2.enemies.find(e => e.zone === "forest1" && e.kind === "snapjaw")!;
      // Puff fires from the left side of this facing. Start its target inside
      // that muzzle's hit corridor with enough room to visibly leave it.
      const enemyX = friend === "puff" ? 74.5 : 75.2;
      await hook(page, "timeScale", 0); await fixture(enemy.i, enemyX, -178, "chase");
      await hook(page, "teleport", 76, -170, Math.PI);
      const before = await state(page); await page.keyboard.press("KeyJ");
      const fired = await state(page), shot = fired.act2.projectiles.find(p => !p.hostile)!;
      expect(shot, `${friend} fires through the real key`).toBeTruthy();
      expect(fired.player.yaw).toBeCloseTo(before.player.yaw);
      await hook(page, "teleport", 70, -170, Math.PI);
      await hook(page, "timeScale", .5); await pauseAt(page, { shot: shot.id, age: .45 });
      const moving = await state(page), now = moving.act2.enemies.find(e => e.i === enemy.i)!;
      expect(now.x).toBeLessThan(enemyX);
      await capture(`${friend}-projectile-misses-moving-enemy`);
      await hook(page, "timeScale", 1); await pauseAt(page, { absent: shot.id });
      expect((await state(page)).act2.enemies.find(e => e.i === enemy.i)!.hp).toBe(before.act2.enemies.find(e => e.i === enemy.i)!.hp);
    }

    // Cloud Isle shares the same slow, committed hostile projectile path.
    await hook(page, "timeScale", 1);
    await hook(page, "setAct3", { ...newAct3(), voyageDone: true, world: "cloud" });
    await hook(page, "cloudArea", "stormbreakCoast");
    await hook(page, "teleport", 0, 19, 0);
    await waitFor(page, s => s.act2.stance.k > .99 && s.player.z > 10);
    const sprite = (await state(page)).act2.enemies.find(e => e.kind === "windSprite" && e.zone === "stormbreakCoast")!;
    await hook(page, "timeScale", 0); await fixture(sprite.i, 0, 26.5);
    await hook(page, "timeScale", .4); await pauseAt(page, { enemy: sprite.i, state: "windup", timerBelow: .4 });
    await capture("cloud-wind-sprite-telegraph");
    const puff = await launch(sprite.i); await capture("cloud-wind-puff-in-flight");
    await hook(page, "teleport", -4, 19, 0);
    await capture("cloud-wind-puff-dodge");
    await hook(page, "timeScale", 1); await pauseAt(page, { absent: puff.id });
    expect((await state(page)).act2.hp).toBe(100);

    // The real raider barricade is a wall in hostile ground. A player's
    // straight bolt must stop on it even though open coast continues beyond.
    await hook(page, "timeScale", 1); await hook(page, "teleport", 5, 50, 0);
    await page.keyboard.press("Digit2");
    await waitFor(page, s => s.act2.stance.friend === "bubbo" && s.act2.stance.k > .99);
    await hook(page, "timeScale", 0); await hook(page, "combatFixture", { enemies: [] });
    await page.keyboard.press("KeyJ");
    const wallShot = (await state(page)).act2.projectiles.find(p => !p.hostile)!;
    expect(wallShot).toBeTruthy();
    await hook(page, "timeScale", .25); await pauseAt(page, { shot: wallShot.id, zAbove: 54 });
    await capture("projectile-approaching-barricade-wall");
    await hook(page, "timeScale", .25); await pauseAt(page, { absent: wallShot.id });
    await capture("projectile-blocked-by-barricade-wall");
    expect(errors).toEqual([]);
    let existing: typeof views = [];
    try { existing = JSON.parse(await readFile(`${folder}/render-report.json`, "utf8")).views; } catch { /* first size */ }
    await writeFile(`${folder}/render-report.json`, JSON.stringify({ budget: { calls: 120, triangles: 140000 }, views: [...existing.filter(v => !v.name.endsWith(label)), ...views] }, null, 2));
    await hook(page, "timeScale", 1);
  });
}

for (const size of [{ width: 1366, height: 768 }, { width: 1280, height: 800 }]) {
  const label = `${size.width}x${size.height}`;
  test(`hostile bolt blocked by the barricade wall ${label}`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(size);
    await page.addInitScript(save => localStorage.setItem("mi.save.v4", save), combatSave());
    const errors = await boot(page); await chooseMode(page, "tap");
    await page.getByTestId("btn-continue").click();
    await waitFor(page, s => s.mode === "explore");
    await hook(page, "setAct3", { ...newAct3(), voyageDone: true, world: "cloud" });
    await hook(page, "cloudArea", "stormbreakCoast");
    await hook(page, "timeScale", 0);
    await hook(page, "teleport", 5, 54, 0);
    const shooter = (await state(page)).act2.enemies.find(e => e.kind === "raiderShooter" && e.zone === "stormbreakCoast")!;
    await hook(page, "combatFixture", { enemies: [{ i: shooter.i, x: 5, z: 46.5, state: "chase" }] });
    await hook(page, "setHp", 100);
    const ground = (await state(page)).player.ground;
    // The wall is north of the player, so a northbound enemy bolt originates
    // behind the native lens. This explicit evidence-only side view keeps the
    // shooter, dodge and real wall visible to both the camera and ranged AI.
    await hook(page, "look", [18, ground + 11, 48], [5, ground + 1, 52]);
    await hook(page, "renderFrames", 3);
    const views: Array<{ name: string; calls: number; triangles: number; fps: number; captureCamera: string; player: MiState["player"]; projectiles: Projectile[] }> = [];
    const capture = async (name: string) => {
      await mkdir(folder, { recursive: true });
      await hook(page, "renderFrames", 3);
      const s = await state(page);
      await page.screenshot({ path: `${folder}/${name}-${label}.png` });
      views.push({ name: `${name}-${label}`, ...s.perf, captureCamera: "evidence-only side view", player: s.player, projectiles: s.act2.projectiles });
      expect(s.perf.calls).toBeLessThanOrEqual(120);
      expect(s.perf.triangles).toBeLessThanOrEqual(140_000);
      expect(s.micState).not.toBe("listening");
    };
    await hook(page, "timeScale", .5);
    await pauseAt(page, { enemy: shooter.i, state: "windup", timerBelow: .4 });
    await capture("cloud-raider-shooter-red-charge");
    await hook(page, "timeScale", .5);
    await pauseAt(page, { source: shooter.i, age: .6 });
    const launched = await state(page);
    const bolt = launched.act2.projectiles.find(p => p.hostile && p.source === shooter.i)!;
    await hook(page, "teleport", 6.5, 54, 0, false);
    await hook(page, "timeScale", .5);
    await pauseAt(page, { shot: bolt.id, zAbove: 55.5 });
    const approaching = (await state(page)).act2.projectiles.find(p => p.id === bolt.id)!;
    expect(approaching.vx).toBeCloseTo(bolt.vx); expect(approaching.vz).toBeCloseTo(bolt.vz);
    await capture("cloud-hostile-bolt-approaching-wall");
    await hook(page, "timeScale", .5);
    await pauseAt(page, { absent: bolt.id });
    const blocked = await state(page);
    expect(blocked.act2.hp).toBe(100);
    // It stops at the wall before either its four-second lifetime or the
    // coast's z=60 boundary can remove it.
    expect(blocked.time - launched.time + bolt.age).toBeLessThan(bolt.life - .25);
    await capture("cloud-hostile-bolt-blocked-by-wall");
    expect(errors).toEqual([]);
    let existing: typeof views = [];
    try { existing = JSON.parse(await readFile(`${folder}/render-report.json`, "utf8")).views; } catch { /* first capture */ }
    const names = new Set(views.map(v => v.name));
    await writeFile(`${folder}/render-report.json`, JSON.stringify({ budget: { calls: 120, triangles: 140000 }, views: [...existing.filter(v => !names.has(v.name)), ...views] }, null, 2));
    await hook(page, "timeScale", 1);
  });
}
