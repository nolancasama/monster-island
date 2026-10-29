import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { boot, chooseMode, hook, state, waitFor, speak, tap, type MiState } from "./helpers";
import { BRIDGE, CAMP, TUNNEL, groundY } from "../../src/game/world/island";
import { CANOPY_GAPS } from "../../src/game/world/lowland";

const directory = ".tmp/shots/polish";
const phase = process.env.POLISH_PHASE === "before" ? "before" : "after";
const friends = Object.fromEntries(["leafy", "bubbo", "puff", "ember", "lumo"].map(id => [id, {
  discovered: true, friend: true, invited: true, asked: {}, canKnown: {}, described: { name: true, size: true, part: true }
}]));
const solved = ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame", "canopyVines", "canopyRope"];
const stages = ["forest1", "grove", "canopy", "causeway", "coast"];
function fixture(extra: Record<string, unknown> = {}, player = { x: 70, z: -127, yaw: Math.PI }) {
  return JSON.stringify({ v: 4, progress: {
    monsters: friends, active: "leafy", bag: { apples: 99, fish: 99, berries: 99, meat: 99 }, solved,
    metMaple: true, endings: 3, said: [], act2: {
      started: true, lumoTaken: true, descended: true, hp: 37,
      mp: { leafy: 24, bubbo: 31, puff: 43, ember: 19 }, coins: 25,
      items: { amber: 1 }, upgrades: [], chests: ["forestChest"],
      tutorial: ["attack", "coins", "special", "eat", "switch"], checkpoint: "cliff",
      portFound: true, bought: false, harbor: false, trained: [], zone: "port", cleared: stages, ...extra
    }
  }, player, seconds: 2500 });
}
async function start(page: Page, extra: Record<string, unknown> = {}, mode: "tap" | "speak" = "tap", player?: { x: number; z: number; yaw: number }) {
  await page.addInitScript(text => localStorage.setItem("mi.save.v4", text), fixture(extra, player));
  const errors = await boot(page);
  await chooseMode(page, mode);
  await page.getByTestId("btn-continue").click();
  await waitFor(page, s => s.screen === "game" && s.mode === "explore", 30000, "loaded polish fixture");
  return errors;
}
async function stand(page: Page, x: number, z: number) {
  await hook(page, "timeScale", 1);
  await hook(page, "set", { mode: "busy" });
  await hook(page, "teleport", x, z, Math.PI);
  await hook(page, "follow");
  await hook(page, "setCamera", 0, .46, 9);
  await hook(page, "renderFrames", 8);
  await waitFor(page, s => Math.hypot(s.player.x - x, s.player.z - z) < 1, 30000, `stand ${x},${z}`);
  await waitFor(page, s => (s.camera as MiState["camera"] & { settled: boolean }).settled, 60000, "settled gameplay framing");
}

test("Part 1 visual evidence: bridges, sanctuary, real lowland, tunnel and tent", async ({ page }) => {
  test.setTimeout(900000);
  const errors = await start(page);
  const loaded = await state(page);
  expect(loaded.progress.act2.started, "valid completed prologue fixture retains Act 2").toBe(true);
  await hook(page, "set", { mode: "busy", progress: { ...loaded.progress, solved: loaded.progress.solved.filter(id => !id.startsWith("gate")) } });
  await hook(page, "settleAct2Unlocks");
  for (const category of ["bridges", "sanctuary", "lowland", "tent"]) mkdirSync(`${directory}/${category}`, { recursive: true });
  const reportPath = `${directory}/render-report.json`;
  const prior = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, "utf8")) : {};
  const views: Array<{ name: string; category: string; width: number; height: number; perf: MiState["perf"]; camera: MiState["camera"]; player: MiState["player"]; lowland: unknown; solved: string[]; pillars: MiState["pillars"]; gate: number }> = [];
  const sanctuary = async (open: boolean) => {
    const s = await state(page);
    await hook(page, "set", { progress: { ...s.progress, solved: open ? [...new Set([...s.progress.solved, "gateLeaf", "gateDrop", "gateWing", "gateFlame"])] : s.progress.solved.filter(id => !id.startsWith("gate")) } });
    await hook(page, "settleSanctuary");
  };
  const capture = async (category: string, name: string) => {
    if (phase === "after" && category === "lowland" && !name.startsWith("tunnel")) {
      await waitFor(page, s => {
        const lowland = (s as MiState & { lowland: { visible: boolean; fog: { near: number; far: number } } }).lowland;
        return lowland.visible && Math.abs(lowland.fog.near - 55) < .05 && lowland.fog.far === 260;
      }, 60000, `${name}: real lowland visible through settled constant fog`);
    }
    await hook(page, "renderFrames", 4);
    await hook(page, "timeScale", 0);
    await hook(page, "renderFrames", 3);
    const size = page.viewportSize()!;
    await page.screenshot({ path: `${directory}/${category}/${phase}-${name}-${size.width}x${size.height}.png` });
    const s = await state(page);
    views.push({ name, category, ...size, perf: s.perf, camera: s.camera, player: s.player, lowland: (s as MiState & { lowland: unknown }).lowland, solved: s.progress.solved, pillars: s.pillars, gate: s.gate });
    writeFileSync(reportPath, JSON.stringify({ ...prior, notes: {
      before: "Captured before scene edits. Saved sanctuary pillar/gate poses remained solved while progress flags were unsolved; baseline images honestly retain those saved poses.",
      after: "Sanctuary and exterior lowland captures explicitly settle unsolved pillar/gate poses. Tunnel captures restore the original solved poses for a fair baseline comparison. Original sanctuary approach is a tunnel-lens diagnostic; approach-emerged is the default frame after emerging."
    }, [phase]: views }, null, 2));
    await hook(page, "timeScale", 1);
  };
  await page.setViewportSize({ width: 1366, height: 768 });
  for (const bridge of [{ name: "leafy-ravine", x: BRIDGE.x, z0: BRIDGE.z0, z1: BRIDGE.z1 },
    ...Object.entries(CANOPY_GAPS).map(([name, g]) => ({ name, ...g }))]) {
    const z = (bridge.z0 + bridge.z1) / 2;
    await stand(page, bridge.x, z);
    const y = (await state(page)).player.y;
    for (const [name, pos, at] of [
      ["south-end", [bridge.x + 2.4, y + 2.6, bridge.z1 + 5], [bridge.x, y, bridge.z1 - .7]],
      ["north-end", [bridge.x - 2.4, y + 2.6, bridge.z0 - 5], [bridge.x, y, bridge.z0 + .7]],
      ["centre", [bridge.x + 4, y + 5.5, z + 5], [bridge.x, y, z]],
      ["side", [bridge.x + 8, y + 1.8, z], [bridge.x, y, z]]
    ] as const) {
      await hook(page, "look", pos, at);
      await capture("bridges", `${bridge.name}-${name}`);
    }
  }
  for (const [width, height] of [[1366, 768], [1280, 800]]) {
    await page.setViewportSize({ width, height });
    await sanctuary(false);
    for (const [name, x, z] of [["approach", 64, -126.8], ["courtyard", 70, -128.2]] as const) {
      await stand(page, x, z);
      // Default gameplay framing: placement, not a test-only camera, must reveal the pillars.
      await capture("sanctuary", name);
    }
    if (phase === "after") {
      await stand(page, 70, -127);
      await capture("sanctuary", "approach-emerged");
    }
    for (const [name, x, z] of [["approach", 79, -126.6], ["courtyard", 80.5, -131]] as const) {
      await stand(page, x, z);
      await capture("lowland", name);
    }
    await sanctuary(true);
    for (const [name, z] of [["tunnel-mouth", -105], ["tunnel-centre", -114], ["tunnel-exit", -122]] as const) {
      await stand(page, 64, z);
      await capture("lowland", name);
    }
  }
  if (phase === "after") {
    await page.setViewportSize({ width: 1366, height: 768 });
    const { x, z, yaw } = CAMP.tent;
    await stand(page, x + 3.6, z + 3.6);
    for (const [name, angle] of [["front", 0], ["right", Math.PI / 2], ["back", Math.PI], ["left", Math.PI * 1.5]] as const) {
      await hook(page, "look", [x + Math.sin(angle + yaw) * 8, groundY(x, z) + 3.6, z + Math.cos(angle + yaw) * 8], [x, groundY(x, z) + 1, z]);
      await capture("tent", name);
    }
    const outside = views.filter(v => v.category === "lowland" && !v.name.startsWith("tunnel"));
    expect(outside.filter(v => v.perf.calls > 120 || v.perf.triangles > 140000), "natural lowland viewpoints budget").toEqual([]);
    // The mouth's lens is outside the roof; preserve its report without claiming it is enclosed.
    const tunnel = views.filter(v => v.name.startsWith("tunnel") && v.camera.pos.z < TUNNEL.z1 && v.camera.pos.z > TUNNEL.z0);
    expect(tunnel.filter(v => v.perf.calls > 59 || v.perf.triangles > 46000), "enclosed tunnel budget").toEqual([]);
  }
  expect(errors).toEqual([]);
});

for (const mode of ["tap", "speak"] as const) test(`paid inn: no, insufficient coins and one accepted stay (${mode})`, async ({ page }) => {
  test.skip(phase === "before", "Baseline visual capture precedes implementation");
  test.setTimeout(300000);
  const errors = await start(page, {}, mode, { x: 77, z: -300, yaw: Math.PI });
  for (const c of [
    { coins: 25, id: "noThankYou", words: "no thank you", line: "OK. See you!", paid: false },
    { coins: 9, id: "yesPlease", words: "yes please", line: "Sorry, you need 10 coins.", paid: false },
    { coins: 25, id: "yesPlease", words: "yes please", line: "Good night!", paid: true }
  ]) {
    const before = await state(page);
    await hook(page, "set", { progress: { ...before.progress, act2: { ...before.progress.act2, coins: c.coins } } });
    await hook(page, "goTo", "inn", 1.4);
    await waitFor(page, s => s.mode === "explore" && s.focus?.id === "inn", 60000, "inn approach");
    expect((await state(page)).progress.act2.coins, "approach is free").toBe(c.coins);
    const hp = (await state(page)).act2.hp;
    await page.keyboard.press("KeyE");
    const prompt = await waitFor(page, s => Boolean(s.prompt?.choices.includes("yesPlease")), 60000, "inn invitation");
    expect(prompt.prompt?.question).toBe("Welcome to the Seaside Inn! A room is 10 coins. Would you like a room?");
    // Keep the response on screen: fast-mode's 30ms auto-next is shorter than a SwiftShader frame.
    await page.evaluate(() => history.replaceState(null, "", "?e2e=1"));
    const response = page.waitForFunction(line => (window as unknown as { __mi: { state(): MiState } }).__mi.state().line?.en === line, c.line, { timeout: 60000, polling: "raf" });
    if (mode === "tap") await tap(page, c.id);
    else await speak(page, c.words);
    await response;
    await page.evaluate(() => history.replaceState(null, "", "?e2e=1&fast=1"));
    await page.keyboard.press("Enter");
    const finished = await waitFor(page, s => s.mode === "explore" && !s.prompt && !s.line, 60000, "inn exchange complete");
    expect(finished.progress.act2.coins).toBe(c.coins - (c.paid ? 10 : 0));
    expect(finished.act2.hp).toBe(c.paid ? 100 : hp);
    expect(finished.progress.act2.checkpoint).toBe(c.paid ? "port" : "cliff");
    if (c.paid) expect(Object.values(finished.act2.mp).every(mp => mp === 100)).toBe(true);
    else expect(Object.values(finished.act2.mp).every(mp => mp < 100)).toBe(true);
  }
  expect(errors).toEqual([]);
});

test("Fern Crossing arrival sets the compatible wake point without healing or a rest interaction", async ({ page }) => {
  test.skip(phase === "before", "Baseline visual capture precedes implementation");
  test.setTimeout(180000);
  const errors = await start(page, { portFound: false, zone: "forest1" }, "tap", { x: 76, z: -184, yaw: Math.PI });
  await hook(page, "setHp", 37);
  await hook(page, "teleport", 75.6, -189.2, Math.PI);
  const crossing = await waitFor(page, s => s.act2.zone === "camp" && s.progress.act2.checkpoint === "camp" && s.act2.stance.friend === null, 60000, "Crossing arrival and safe party formation");
  expect(crossing.act2.hp).toBe(37);
  expect(crossing.progress.act2.tutorial).toContain("rest");
  expect(crossing.act2.stance.friend).toBeNull();
  expect(crossing.act2.enemies.filter(enemy => enemy.zone === "camp")).toEqual([]);
  expect(crossing.focus?.id).not.toBe("campRest");
  await expect(page.getByTestId("toast").filter({ hasText: "Fern Crossing" }).first()).toBeVisible();
  await page.keyboard.press("KeyE");
  await hook(page, "renderFrames", 5);
  const after = await state(page);
  expect(after.act2.hp).toBe(37);
  expect(after.prompt).toBeNull();
  expect(after.objective.id).not.toBe("rest");
  expect(errors).toEqual([]);
});

test("legacy camp checkpoint survives reload and knock-out without charging or looping", async ({ page }) => {
  test.skip(phase === "before", "Baseline visual capture precedes implementation");
  test.setTimeout(180000);
  const errors = await start(page, { checkpoint: "camp", zone: "grove", hp: 20 }, "tap", { x: 49, z: -231, yaw: Math.PI });
  expect((await state(page)).progress.act2.checkpoint).toBe("camp");
  await hook(page, "nearEnemy", 0, 1);
  await hook(page, "setHp", 1);
  const awake = await waitFor(page, s => !s.act2.knockedOut && s.mode === "explore" && s.act2.zone === "camp", 90000, "wake at legacy Crossing checkpoint");
  expect(awake.act2.hp).toBeGreaterThanOrEqual(60);
  expect(awake.progress.act2.coins).toBe(25);
  expect(Math.hypot(awake.player.x - 75.6, awake.player.z + 189.2)).toBeLessThan(1);
  const time = awake.playTime;
  const stable = await waitFor(page, s => s.playTime > time + 2, 30000, "wake point stays safe");
  expect(stable.act2.knockedOut).toBe(false);
  expect(stable.act2.zone).toBe("camp");
  expect(stable.act2.hp).toBeGreaterThanOrEqual(60);
  expect(errors).toEqual([]);
});
