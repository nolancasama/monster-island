import { expect, test, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { boot, chooseMode, hook, state, type MiState } from "./helpers";

type Vec = { x: number; y: number; z: number };
type ViewState = MiState & {
  camera: { mode: string; yaw: number; pitch: number; dist: number; framing: string; settled: boolean; offset: Vec };
  lowland: { visible: boolean; fog: { near: number; far: number }; barriers: Record<string, number> };
};
const stages = ["forest1", "grove", "canopy", "causeway", "coast"];
const directory = ".tmp/shots/continuity";
const read = (page: Page) => state(page) as Promise<ViewState>;

/** Every fixture must become observable before its outcome is assessed. */
async function precondition(page: Page, label: string, pred: (s: ViewState) => boolean, timeout = 30000) {
  const until = Date.now() + timeout;
  let s = await read(page);
  while (!pred(s)) {
    if (Date.now() > until) throw new Error(`HARNESS_PRECONDITION_FAILED: ${label}: ${JSON.stringify({ player: s.player, camera: s.camera, zone: s.act2.zone, mode: s.mode, lowland: s.lowland })}`);
    await page.waitForTimeout(60);
    s = await read(page);
  }
  return s;
}

async function start(page: Page) {
  const friends = Object.fromEntries(["leafy", "bubbo", "puff", "ember", "lumo"].map(id => [id, {
    discovered: true, friend: true, invited: true, asked: {}, canKnown: {}, described: { name: true, size: true, part: true }
  }]));
  await page.addInitScript(text => localStorage.setItem("mi.save.v4", text), JSON.stringify({
    v: 4,
    progress: {
      monsters: friends, active: "leafy", bag: { apples: 8, fish: 8, berries: 8, meat: 8 },
      solved: ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame", "canopyVines", "canopyRope"],
      metMaple: true, endings: 3, said: [],
      act2: {
        started: true, lumoTaken: true, descended: true, hp: 100,
        mp: { leafy: 100, bubbo: 100, puff: 100, ember: 100 }, coins: 100, items: { amber: 1 }, upgrades: [],
        chests: ["forestChest"], tutorial: ["attack", "coins", "special", "eat", "rest", "switch"],
        checkpoint: "cliff", portFound: true, bought: false, harbor: false, trained: [], zone: "forest1", cleared: stages
      }
    }, player: { x: 75.5, z: -154.4, yaw: Math.PI }, seconds: 2500
  }));
  const errors = await boot(page);
  await chooseMode(page, "tap");
  await page.getByTestId("btn-continue").click();
  await precondition(page, "loaded lowland exploration", s => s.mode === "explore" && s.screen === "game" && s.lowland.visible);
  return errors;
}

async function gates(page: Page, open: boolean) {
  const { progress } = await read(page);
  await hook(page, "timeScale", 1);
  await hook(page, "set", { mode: "busy", progress: {
    ...progress,
    solved: open ? [...new Set([...progress.solved, "causewayGate"])] : progress.solved.filter(x => x !== "causewayGate"),
    act2: { ...progress.act2, cleared: open ? stages : [] }
  } });
  await hook(page, "settleAct2Unlocks");
  await precondition(page, open ? "all gates withdrawn" : "all gates obstructing", s =>
    s.act2.unlock.causewayGate === Number(open) &&
    stages.every(id => open ? s.lowland.barriers[id] > .995 : s.lowland.barriers[id] < .005));
}

async function stand(page: Page, x: number, z: number) {
  await hook(page, "timeScale", 1);
  await hook(page, "set", { mode: "busy" });
  await hook(page, "teleport", x, z, Math.PI);
  await hook(page, "follow");
  await hook(page, "renderFrames", 2);
  await precondition(page, `standing at ${x},${z}`, s => Math.hypot(s.player.x - x, s.player.z - z) < 1 && s.camera.settled && s.lowland.visible);
}

const connections = [
  { name: "primeval-camp", from: [76, -181.5], to: [76, -188], gate: "forest1" },
  { name: "camp-grove", from: [71, -199], to: [63, -202.5] },
  { name: "camp-canopy", from: [81, -199], to: [91, -201] },
  { name: "grove-causeway", from: [56, -239], to: [61, -246], gate: "grove" },
  { name: "canopy-causeway", from: [98, -239], to: [93, -246], gate: "canopy" },
  { name: "causeway-coast", from: [76, -261], to: [76, -266], gate: "causeway" },
  { name: "coast-port", from: [76, -285], to: [76, -292], gate: "coast" },
  { name: "old-trail", from: [76, -238.5], to: [76, -244] }
] as const;

test("continuous geography, fixed lowland camera, stable rope and Chromebook render budgets", async ({ page }) => {
  test.setTimeout(900000);
  const errors = await start(page);
  mkdirSync(directory, { recursive: true });
  const beforePath = ".tmp/shots/before/render-report.json";
  const before: unknown = existsSync(beforePath) ? JSON.parse(readFileSync(beforePath, "utf8")) : [];
  const after: Array<{ name: string; width: number; height: number; perf: MiState["perf"]; camera: ViewState["camera"]; player: MiState["player"]; fog: ViewState["lowland"]["fog"] }> = [];
  const writeReport = () => writeFileSync(`${directory}/render-report.json`, JSON.stringify({ before, after }, null, 2));
  const capture = async (name: string, width: number, height: number) => {
    await precondition(page, `${name} camera and lowland fog settled`, s => s.camera.settled && s.lowland.visible && Math.abs(s.lowland.fog.near - 55) < .025 && s.lowland.fog.far === 260);
    await hook(page, "renderFrames", 3);
    await page.screenshot({ path: `${directory}/${name}-${width}.png` });
    const s = await read(page);
    if (s.camera.framing === "lowland") {
      const feet = await hook(page, "project", s.player.x, s.player.y, s.player.z) as { x: number; y: number };
      expect(feet.y, `${name}: player clears the bottom controls`).toBeLessThan(height - 110);
      expect(feet.y, `${name}: player remains in frame`).toBeGreaterThan(80);
    }
    after.push({ name, width, height, perf: s.perf, camera: s.camera, player: s.player, fog: s.lowland.fog });
    writeReport();
  };

  // Real keyboard movement crosses two boundaries; pointer and wheel cannot change the lowland framing.
  await stand(page, 76, -181);
  await hook(page, "set", { mode: "explore" });
  await precondition(page, "starting in Primeval", s => s.act2.zone === "forest1" && s.camera.framing === "lowland");
  const fixed = (await read(page)).camera;
  await page.mouse.move(600, 300);
  await page.mouse.down();
  await page.mouse.move(900, 500, { steps: 8 });
  await page.mouse.up();
  await page.mouse.wheel(0, 600);
  await hook(page, "renderFrames", 2);
  const afterInput = (await read(page)).camera;
  expect(afterInput.yaw).toBe(0);
  expect(afterInput.pitch).toBe(fixed.pitch);
  expect(afterInput.dist).toBe(fixed.dist);
  await page.keyboard.down("KeyW");
  try {
    for (const zone of ["camp", "oldTrail"]) {
      const s = await precondition(page, `walking into ${zone}`, s => {
        expect(s.camera.yaw, "heading stays fixed while walking").toBe(0);
        return s.act2.zone === zone;
      }, 45000);
      expect(s.camera.yaw, `${zone} fixed heading`).toBe(0);
      expect(s.camera.framing).toBe("lowland");
    }
  } finally {
    await page.keyboard.up("KeyW");
  }
  await hook(page, "set", { mode: "busy" });

  for (const [width, height] of [[1366, 768], [1280, 800]]) {
    await page.setViewportSize({ width, height });
    for (const [name, x, z] of [["cliff-top-far", 87, -128], ["cliff-top-mid", 75.5, -145], ["cliff-top-near", 75.5, -149.8]] as const) {
      await stand(page, x, z);
      await hook(page, "setCamera", 0, .46, 9);
      await hook(page, "timeScale", 0);
      await capture(name, width, height);
    }

    // Use the real rope interaction at normal speed, including the ascent handoff.
    await page.evaluate(() => history.replaceState(null, "", "?e2e=1"));
    await hook(page, "timeScale", 1);
    await hook(page, "set", { mode: "explore" });
    await hook(page, "goTo", "cliffDown", .5);
    await hook(page, "follow");
    await precondition(page, "rope descent interaction", s => s.focus?.id === "cliffDown" && s.mode === "explore");
    await page.keyboard.press("KeyE");
    const offsets: Vec[] = [];
    for (const y of [13, 9, 5]) {
      await precondition(page, `descent below ${y}m with stable rope framing`, s => s.player.climbing && s.player.y < y && s.camera.framing === "rope" && s.camera.settled, 45000);
      await hook(page, "timeScale", 0);
      await hook(page, "renderFrames", 3);
      const s = await read(page);
      offsets.push(s.camera.offset);
      await capture(`descent-${y}`, width, height);
      await hook(page, "timeScale", 1);
    }
    for (const offset of offsets.slice(1))
      expect(Math.hypot(offset.x - offsets[0].x, offset.y - offsets[0].y, offset.z - offsets[0].z), "constant camera-to-climber offset").toBeLessThan(.15);
    await precondition(page, "rope foot lands on fixed lowland camera", s => !s.player.climbing && s.mode === "explore" && s.act2.zone === "forest1" && s.camera.framing === "lowland" && s.camera.settled, 45000);
    expect((await read(page)).camera.yaw).toBe(0);
    await hook(page, "timeScale", 0);
    await capture("forest-floor-follow", width, height);
    await stand(page, 75.5, -158);
    const floor = (await read(page)).player.y;
    await hook(page, "look", [78.5, floor + 3.4, -165], [75.5, 12, -151]);
    await hook(page, "timeScale", 0);
    await capture("forest-floor-cliff-back", width, height);
    await hook(page, "timeScale", 1);
    await hook(page, "set", { mode: "explore" });
    await hook(page, "goTo", "cliffUp", .5);
    await hook(page, "follow");
    await precondition(page, "rope ascent interaction", s => s.focus?.id === "cliffUp" && s.mode === "explore");
    await page.keyboard.press("KeyE");
    await precondition(page, "ascent midpoint stable framing", s => s.player.climbing && s.player.y > 9 && s.camera.framing === "rope" && s.camera.settled, 45000);
    await hook(page, "timeScale", 0);
    await capture("ascent-midpoint", width, height);
    await hook(page, "timeScale", 1);
    await precondition(page, "return to prologue orbit", s => !s.player.climbing && s.mode === "explore" && s.player.z > -152 && s.camera.framing === "orbit" && s.camera.settled, 45000);

    for (const open of [false, true]) {
      await gates(page, open);
      for (const c of connections) {
        await stand(page, c.from[0], c.from[1]);
        await precondition(page, `${c.name} fixed follow framing`, s => s.camera.framing === "lowland" && s.camera.yaw === 0);
        await hook(page, "timeScale", 0);
        await capture(`${c.name}-${open ? "open" : "locked"}-ahead`, width, height);
      }
    }
    for (const c of connections) {
      await stand(page, c.to[0], c.to[1]);
      const s = await read(page);
      // Mirror the settled gameplay framing to inspect the return approach at the same viewing scale.
      await hook(page, "look", [s.camera.pos.x, s.camera.pos.y, 2 * s.player.z - s.camera.pos.z], [s.camera.target.x, s.camera.target.y, 2 * s.player.z - s.camera.target.z]);
      await hook(page, "timeScale", 0);
      await capture(`${c.name}-back`, width, height);
    }
    for (const [name, x, z] of [
      ["primeval", 68, -168], ["camp", 76, -192], ["grove", 49, -231], ["canopy", 109, -234],
      ["old-trail-centre", 76, -221], ["causeway", 83, -255], ["coast", 66, -275], ["town-arrival", 76, -293], ["town", 74, -307]
    ] as const) {
      await stand(page, x, z);
      await hook(page, "timeScale", 0);
      await capture(name, width, height);
    }
  }
  writeReport();
  expect(after.length).toBe(84);
  // The "-back" views are mirrored inspection cameras the fixed lowland camera never produces; they are reported, not budgeted.
  expect(after.filter(view => !view.name.endsWith("-back") && (view.perf.calls > 120 || view.perf.triangles > 150000)), "every gameplay view stays within 120 calls / 150k triangles").toEqual([]);
  const fogNear = after.map(view => view.fog.near);
  expect(Math.max(...fogNear) - Math.min(...fogNear), "fog stays continuous across boundaries and rope").toBeLessThan(.05);
  expect(after.every(view => view.fog.far === 260), "one lowland visibility distance").toBe(true);
  expect(errors).toEqual([]);
});
