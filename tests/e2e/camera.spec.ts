import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { boot, chooseMode, hook, state, waitFor, type MiState } from "./helpers";
import { newProgress } from "../../src/game/logic/progress";
import { CLOUD_PUZZLES, CLOUD_STAGES } from "../../src/game/world/cloudisle";
import { CAMERA_PROFILES } from "../../src/scene/cameraProfiles";
import { BEACON_ARENA } from "../../src/game/logic/beacon";
import { GATE_PILLARS, groundY } from "../../src/game/world/island";

type Vec = { x: number; y: number; z: number };
type CameraState = MiState & { camera: MiState["camera"] & {
  profile: string; yaw: number; pitch: number; dist: number; settled: boolean; offset: Vec;
} };
type Sample = { profile: string; x: number; z: number; shot?: [number, number] };
const read = (page: Page) => state(page) as Promise<CameraState>;
const directory = ".tmp/shots/polish2/camera";
const KEYS = { right: "KeyD", left: "KeyA", forward: "KeyW", back: "KeyS" } as const;

// Controls use clear ground, rather than rocks or bridge rails. The bridge
// and pier captures additionally show their centres. The old sanctuary
// entrance (64.5,-127.2) now abuts a Part 1 boulder.
const HOME: Sample[] = [
  { profile: "west-beach", x: -16, z: 0 },
  { profile: "palm-pass", x: -1, z: 1.2 },
  { profile: "east-beach", x: 10, z: 0 },
  { profile: "pier", x: 12, z: 5.7, shot: [13, 10] },
  { profile: "river-bridge", x: 24.5, z: -1 },
  { profile: "far-bank", x: 33, z: 0 },
  { profile: "forest-path", x: 33.8, z: -13 },
  { profile: "forest-glade", x: 38, z: -21 },
  { profile: "forest-bridge", x: 37, z: -24.1, shot: [37, -26.5] },
  { profile: "forest-hills", x: 36, z: -35 },
  { profile: "cliff-top", x: 34, z: -48.3 },
  { profile: "volcano-trail", x: 40.5, z: -65.5 },
  { profile: "ember-slope", x: 58, z: -94 },
  { profile: "volcano-tunnel", x: 64, z: -113 },
  { profile: "sanctuary-courtyard", x: 70, z: -127.2 },
  { profile: "sanctuary-garden", x: 64, z: -137 },
  { profile: "lowland", x: 76, z: -194 },
  { profile: "lowland-rope-foot", x: 75.5, z: -157.5 }
];
const CLOUD: Sample[] = [
  { profile: "cloud", x: 0, z: 1 },
  { profile: "cloud-back-tunnel", x: -17, z: 71 },
  { profile: "beacon-arena", x: 6, z: 169 }
];

function fixture() {
  const p = newProgress();
  for (const id of ["leafy", "bubbo", "puff", "ember", "lumo"] as const)
    p.monsters[id] = { discovered: true, friend: true, invited: true, asked: {}, canKnown: {}, described: { name: true, size: true, part: true } };
  p.metMaple = true; p.endings = 3; p.active = "leafy";
  p.solved = ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame", "groveLilies", "canopyVines", "canopyRope", "causewayGate"];
  p.act2 = { ...p.act2, started: true, lumoTaken: true, descended: true, portFound: true, harbor: true,
    cleared: ["forest1", "grove", "canopy", "causeway", "coast"], tutorial: ["attack", "coins", "special", "eat", "rest", "switch"] };
  p.act3 = { ...p.act3, voyageDone: true, hollowFound: true, cleared: [...CLOUD_STAGES], puzzles: [...CLOUD_PUZZLES],
    observatoryLamps: ["leafy", "bubbo", "puff", "ember"], beaconDefeated: true, skyFortressClue: true,
    family: { met: true, trusted: true, drawingSeen: true, tunnelOpen: true, aftermathSeen: true } };
  return JSON.stringify({ v: 4, progress: p, player: { x: -16, z: 0, yaw: Math.PI / 2 }, seconds: 3000 });
}

async function start(page: Page, cloud = false) {
  await page.addInitScript(save => localStorage.setItem("mi.save.v4", save), fixture());
  const errors = await boot(page);
  await chooseMode(page, "tap");
  await page.getByTestId("btn-continue").click();
  await waitFor(page, s => s.screen === "game" && s.mode === "explore", 60000, "loaded camera fixture");
  if (cloud) await hook(page, "setAct3", { world: "cloud" });
  return errors;
}

async function stand(page: Page, sample: Sample, snap = true) {
  await hook(page, "timeScale", 1);
  await hook(page, "set", { mode: "busy" });
  await hook(page, "teleport", sample.x, sample.z, Math.PI, snap);
  // Consume the placement before reading profile/settled: the previous
  // location may already have the requested profile and a settled camera.
  await hook(page, "renderFrames", 1);
  await waitFor(page, s => (s as CameraState).camera.profile === sample.profile, 60000, `${sample.profile} selected`);
  await waitFor(page, s => (s as CameraState).camera.settled, 60000, `${sample.profile} settled`);
  const s = await read(page);
  expect(Math.hypot(s.player.x - sample.x, s.player.z - sample.z), `${sample.profile}: collision-free fixture`).toBeLessThan(.4);
}

async function noCameraInput(page: Page, label: string) {
  await waitFor(page, s => {
    const c = (s as CameraState).camera;
    if (c.profile !== "beacon-arena") return true;
    const desired = Math.atan2(s.player.x - BEACON_ARENA.x, s.player.z - BEACON_ARENA.z);
    return Math.abs(Math.atan2(Math.sin(c.yaw - desired), Math.cos(c.yaw - desired))) < 1e-7;
  }, 60000, `${label}: radial tracking converged before gestures`);
  await hook(page, "renderFrames", 6);
  const before = (await read(page)).camera;
  await page.mouse.move(600, 270);
  await page.mouse.down();
  await page.mouse.move(940, 430, { steps: 5 });
  await page.mouse.up();
  await page.mouse.wheel(0, 700);
  await page.mouse.wheel(0, -900);
  const canvas = page.locator("canvas");
  for (const [type, x, y, buttons] of [["pointerdown", 600, 270, 1], ["pointermove", 900, 450, 1], ["pointerup", 900, 450, 0]] as const)
    await canvas.dispatchEvent(type, { pointerId: 42, pointerType: "touch", isPrimary: true, clientX: x, clientY: y, buttons, bubbles: true });
  await hook(page, "renderFrames", 3);
  const after = (await read(page)).camera;
  expect(after.profile, `${label}: gestures keep zone`).toBe(before.profile);
  for (const field of ["yaw", "pitch", "dist"] as const)
    expect(after[field], `${label}: mouse/touch drag and wheel keep ${field}`).toBeCloseTo(before[field], 5);
  expect(Math.hypot(after.pos.x - before.pos.x, after.pos.y - before.pos.y, after.pos.z - before.pos.z), `${label}: lens stays fixed`).toBeLessThan(.1);
}

/** Project BOTH endpoints through the camera after the move, including blends. */
async function push(page: Page, key: string) {
  const start = await read(page);
  await hook(page, "setHp", 100);
  await hook(page, "set", { mode: "explore" });
  await page.keyboard.down(key);
  const t0 = Date.now();
  try {
    for (;;) {
      await page.waitForTimeout(100);
      const s = await read(page);
      if (Math.hypot(s.player.x - start.player.x, s.player.z - start.player.z) > .9 || Date.now() - t0 > 4000) break;
    }
  } finally { await page.keyboard.up(key); }
  await hook(page, "set", { mode: "busy" });
  await page.waitForTimeout(250);
  // One browser evaluation prevents a renderer tick between projections.
  return await page.evaluate(before => {
    const api = (window as unknown as { __mi: { state(): CameraState; project(x: number, y: number, z: number): { x: number; y: number } } }).__mi;
    const end = api.state().player;
    const a = api.project(before.x, before.y + .9, before.z), b = api.project(end.x, end.y + .9, end.z);
    return { dx: b.x - a.x, dy: b.y - a.y };
  }, start.player);
}

function directionMatches(dir: string, m: { dx: number; dy: number }, label: string) {
  const context = `${label}: ${dir} moved ${m.dx.toFixed(0)},${m.dy.toFixed(0)} px`;
  // Preserve the original camera regression's directional assertions.
  if (dir === "right") expect(m.dx > 12 && Math.abs(m.dy) < m.dx * .7, context).toBe(true);
  if (dir === "left") expect(-m.dx > 12 && Math.abs(m.dy) < -m.dx * .7, context).toBe(true);
  if (dir === "forward") expect(-m.dy > 4 && Math.abs(m.dx) < -m.dy * 1.2, context).toBe(true);
  if (dir === "back") expect(m.dy > 4 && Math.abs(m.dx) < m.dy * 1.2, context).toBe(true);
}

for (const [world, samples] of [["home", HOME], ["cloud", CLOUD]] as const) {
  test(`Fixed ${world} profiles ignore camera input and retain screen-relative movement after transitions`, async ({ page }) => {
    test.setTimeout(900000);
    const errors = await start(page, world === "cloud");
    for (const sample of samples) {
      await stand(page, sample, false);
      await noCameraInput(page, sample.profile);
      for (const [dir, key] of Object.entries(KEYS)) {
        await stand(page, sample);
        directionMatches(dir, await push(page, key), sample.profile);
      }
    }
    expect(errors).toEqual([]);
  });
}

test("Screen-relative movement follows the live camera during a yaw blend", async ({ page }) => {
  test.setTimeout(180000);
  const errors = await start(page);
  // Adjacent landings keep the player in the view while the camera turns
  // north -> east. Sample a short segment during the blend: a long curved
  // walk projected through its final view would also measure the whole turn.
  for (const [dir, key] of Object.entries(KEYS)) {
    await stand(page, { profile: "far-bank", x: 30.5, z: -1 });
    await hook(page, "teleport", 28.2, -1, Math.PI, false);
    await hook(page, "renderFrames", 1);
    expect((await read(page)).camera.settled, "transition has not been snapped").toBe(false);
    await hook(page, "set", { mode: "explore" });
    await page.keyboard.down(key);
    try {
      const m = await page.evaluate(async held => {
        const api = (window as unknown as { __mi: {
          state(): CameraState; renderFrames(n: number): Promise<void>;
          project(x: number, y: number, z: number): { x: number; y: number };
        } }).__mi;
        const start = api.state().player;
        try {
          for (let frame = 0; frame < 20; frame++) {
            await api.renderFrames(1);
            const p = api.state().player;
            if (Math.hypot(p.x - start.x, p.z - start.z) > .4) break;
          }
        } finally { window.dispatchEvent(new KeyboardEvent("keyup", { code: held, bubbles: true })); }
        const end = api.state();
        const a = api.project(start.x, start.y + .9, start.z), b = api.project(end.player.x, end.player.y + .9, end.player.z);
        return { dx: b.x - a.x, dy: b.y - a.y, settled: end.camera.settled };
      }, key);
      expect(m.settled, "movement was sampled before the blend ended").toBe(false);
      directionMatches(dir, m, "far bank to river bridge blend");
    } finally { await page.keyboard.up(key); }
  }
  expect(errors).toEqual([]);
});

test("Zone border hysteresis holds the incoming view without flip-flopping", async ({ page }) => {
  test.setTimeout(180000);
  const errors = await start(page);
  // The broad beach/pass border keeps collision out of this assertion.
  for (const from of [{ profile: "west-beach", x: -8, z: 1.2 }, { profile: "palm-pass", x: -1, z: 1.2 }]) {
    await stand(page, from);
    for (const x of [-5.08, -4.92, -5.04, -4.96, -5]) {
      await hook(page, "teleport", x, 1.2, Math.PI, false);
      await hook(page, "renderFrames", 4);
      expect((await read(page)).camera.profile, `border approached from ${from.profile}, x=${x}`).toBe(from.profile);
    }
    await hook(page, "renderFrames", 16);
    expect((await read(page)).camera.profile, "standing on the border keeps its view").toBe(from.profile);
  }
  expect(errors).toEqual([]);
});

test("Every camera profile has matched visual evidence and stays within the render budget", async ({ page }) => {
  test.setTimeout(900000);
  const errors = await start(page);
  mkdirSync(directory, { recursive: true });
  const views: Array<{ name: string; width: number; height: number; perf: MiState["perf"]; camera: CameraState["camera"]; player: MiState["player"]; landmarks?: Record<string, { x: number; y: number }> }> = [];
  const capture = async (name: string) => {
    await hook(page, "renderFrames", 4);
    await hook(page, "timeScale", 0);
    await hook(page, "renderFrames", 3);
    const s = await read(page), size = page.viewportSize()!;
    let landmarks: Record<string, { x: number; y: number }> | undefined;
    if (name === "sanctuary-courtyard" || name === "sanctuary-courtyard-west-edge" || name === "sanctuary-courtyard-east-edge") {
      const symbols = Object.entries(GATE_PILLARS).map(([id, p]) => ({ id, x: p.x, y: groundY(p.x, p.z) + 2,
        z: p.z + (id === "gateLeaf" ? .75 : id === "gateFlame" ? .77 : .76) }));
      const projected: Record<string, { x: number; y: number }> = await page.evaluate(points => {
        const api = (window as unknown as { __mi: { state(): CameraState; project(x: number, y: number, z: number): { x: number; y: number } } }).__mi;
        const p = api.state().player;
        // The real player's head centre is 1.3m above its standing feet.
        return Object.fromEntries([
          ["player-head", api.project(p.x, p.y + 1.3, p.z)],
          ...points.map(p => [p.id, api.project(p.x, p.y, p.z)])
        ]);
      }, symbols);
      landmarks = projected;
      for (const [id, point] of Object.entries(projected)) {
        expect.soft(point.x, `${name}: ${id} inside left edge`).toBeGreaterThanOrEqual(0);
        expect.soft(point.x, `${name}: ${id} inside right edge`).toBeLessThanOrEqual(size.width);
        expect.soft(point.y, `${name}: ${id} below top edge`).toBeGreaterThanOrEqual(0);
        expect.soft(point.y, `${name}: ${id} above bottom edge`).toBeLessThanOrEqual(size.height);
      }
    }
    await page.screenshot({ path: `${directory}/${name}-${size.width}x${size.height}.png` });
    views.push({ name, ...size, perf: s.perf, camera: s.camera, player: s.player, landmarks });
    writeFileSync(`${directory}/render-report.json`, JSON.stringify({ views }, null, 2));
    expect.soft(s.perf.calls, `${name}: gameplay draw calls`).toBeLessThanOrEqual(120);
    expect.soft(s.perf.triangles, `${name}: gameplay triangles`).toBeLessThanOrEqual(140000);
    if (name === "volcano-tunnel" || name === "tunnel-exit") {
      expect.soft(s.perf.calls, `${name}: enclosed tunnel draw calls`).toBeLessThanOrEqual(59);
      expect.soft(s.perf.triangles, `${name}: enclosed tunnel triangles remain about 40k`).toBeLessThanOrEqual(46000);
    }
  };
  for (const size of [{ width: 1366, height: 768 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(size);
    for (const sample of HOME) {
      const [x, z] = sample.shot ?? [sample.x, sample.z];
      await stand(page, { ...sample, x, z });
      await capture(sample.profile);
      if (sample.profile === "sanctuary-courtyard") {
        const { progress } = await read(page);
        await hook(page, "set", { progress: { ...progress, solved: progress.solved.filter(id => !id.startsWith("gate")) } });
        await hook(page, "settleSanctuary");
        await capture("sanctuary-courtyard-closed-gate");
        await stand(page, { profile: "sanctuary-courtyard", x: 64, z: -127.2 });
        await capture("sanctuary-courtyard-west-entry");
        for (const [name, x] of [["west-edge", 57.5], ["east-edge", 82.5]] as const) {
          // Approach each shoulder from the courtyard, retaining its incoming
          // view inside the .65m border band, just as continuous walking does.
          await stand(page, { profile: "sanctuary-courtyard", x: 70, z: -127.2 });
          await stand(page, { profile: "sanctuary-courtyard", x, z: -127.2 }, false);
          await capture(`sanctuary-courtyard-${name}`);
        }
        await stand(page, { profile: "sanctuary-courtyard", x: 80.5, z: -131 });
        await capture("sanctuary-courtyard-east-view");
        await hook(page, "set", { progress });
        await hook(page, "settleSanctuary");
      }
    }
    for (const [name, z] of [["tunnel-mouth", -105], ["tunnel-exit", -122]] as const) {
      await stand(page, { profile: "volcano-tunnel", x: 64, z });
      await capture(name);
    }
    // Use real rope interactions both ways. Pause only after the stable
    // follow framing arrives, never replacing the lens with a test shot.
    await page.evaluate(() => history.replaceState(null, "", "?e2e=1"));
    for (const [name, target] of [["cliff-rope-descent", "cliffDown"], ["cliff-rope-ascent", "cliffUp"]] as const) {
      await hook(page, "timeScale", 1);
      await hook(page, "set", { mode: "explore" });
      await hook(page, "goTo", target, .5);
      await waitFor(page, s => s.focus?.id === target && s.mode === "explore", 60000, target);
      await page.keyboard.press("KeyE");
      await page.waitForFunction(() => {
        const api = (window as unknown as { __mi: { state(): CameraState; timeScale(k: number): void } }).__mi;
        const s = api.state();
        if (s.player.climbing && s.camera.profile === "cliff-rope" && s.camera.settled && s.player.y > 6 && s.player.y < 13) { api.timeScale(0); return true; }
        return false;
      }, undefined, { polling: "raf", timeout: 60000 });
      await noCameraInput(page, name);
      await capture(name);
      await hook(page, "timeScale", 1);
      await waitFor(page, s => !s.player.climbing && s.mode === "explore", 60000, `${name} complete`);
    }
    await page.evaluate(() => history.replaceState(null, "", "?e2e=1&fast=1"));
    await hook(page, "setAct3", { world: "cloud" });
    for (const sample of CLOUD) {
      await stand(page, sample);
      await capture(sample.profile);
    }
    await hook(page, "timeScale", 1);
    await hook(page, "setAct3", { world: "home" });
  }
  const covered = new Set(views.map(v => v.camera.profile));
  expect([...covered].sort(), "every authored gameplay profile is captured").toEqual(CAMERA_PROFILES.map(p => p.id).sort());
  expect(errors).toEqual([]);
});
