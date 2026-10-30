// Slice K evidence only: matched old/new cameras, real renderer statistics.
// npm run build first, then serve npm run preview on port 4176.
// node scripts/cloud-kit-shots.mjs before|after
import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const phase = process.argv[2];
if (!["before", "after"].includes(phase)) throw new Error("Expected before or after");
const folder = ".tmp/shots/expansion/kit";
await mkdir(folder, { recursive: true });
if (phase === "after") {
  const baseline = JSON.parse(await readFile(`${folder}/render-report.json`, "utf8").catch(() => "{\"views\":[]}"));
  if (baseline.views.filter(v => v.phase === "before").length !== 40) {
    throw new Error("HARNESS_PRECONDITION_FAILED: capture all 40 baseline views against the old build first");
  }
}
const stubFile = await readFile("tests/e2e/stubs.ts", "utf8");
const stubs = stubFile.slice(stubFile.indexOf("`") + 1, stubFile.lastIndexOf("`"));
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const views = [];
const errors = [];
try {
  for (const [width, height] of [[1366, 768], [1280, 800]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    page.on("pageerror", e => errors.push(e.message));
    await page.addInitScript(stubs);
    await page.goto(`${process.env.MI_URL ?? "http://127.0.0.1:4176"}/?e2e=1&debug=1&fast=1`);
    await page.getByTestId("title").waitFor();
    await page.getByTestId("title-settings").click();
    const mic = page.getByTestId("toggle-mic");
    if ((await mic.getAttribute("aria-checked")) === "true") await mic.click();
    await page.getByTestId("settings-close").click();
    await page.getByTestId("btn-start").click();
    const ready = async (predicate, arg) => {
      try { await page.waitForFunction(predicate, arg, { polling: "raf", timeout: 30000 }); }
      catch (e) { throw new Error(`HARNESS_PRECONDITION_FAILED: ${e.message}`); }
    };
    await ready(() => window.__mi?.state().mode === "explore");
    await page.evaluate(() => {
      const api = window.__mi, p = api.state().progress;
      for (const m of Object.values(p.monsters)) Object.assign(m, { discovered: true, friend: true, invited: true });
      p.active = "leafy"; p.metMaple = true; p.endings = 3;
      p.solved = ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame"];
      Object.assign(p.act2, { started: true, lumoTaken: true, descended: true, portFound: true, harbor: true, bought: true,
        checkpoint: "port", zone: "port", cleared: ["forest1", "grove", "canopy", "causeway", "coast"],
        tutorial: ["attack", "coins", "special", "eat", "rest", "switch"] });
      api.set({ progress: p });
      api.setAct3({ world: "cloud", voyageDone: true, hollowFound: true,
        family: { met: true, trusted: true, drawingSeen: true, tunnelOpen: true, aftermathSeen: false },
        cleared: ["stormbreakCoast", "skyrootCanopy", "thunderGrotto", "ancientObservatory"],
        puzzles: ["coastWindmill", "coastCrate", "canopyVine", "canopyGlide", "canopyGust", "grottoRaft", "grottoBoiler", "obsLeafy", "obsBubbo", "obsPuff", "obsEmber"],
        observatoryLamps: ["leafy", "bubbo", "puff", "ember"] });
      api.timeScale(0);
    });
    await ready(() => window.__mi.state().act3.world === "cloud" && window.__mi.state().act3.mountedWorlds[0] === "cloud");
    const shots = [
      { name: "dock", area: "cloudDock" },
      { name: "coast", area: "stormbreakCoast" },
      { name: "waterfall", area: "stormbreakCoast", player: [-7, 43] },
      { name: "hollow", area: "hiddenHollow" },
      { name: "tunnel", area: "backTunnel" },
      { name: "junction", area: "windfallJunction" },
      { name: "canopy", area: "skyrootCanopy" },
      { name: "grotto", area: "thunderGrotto" },
      { name: "observatory-approach", area: "observatoryApproach" },
      { name: "observatory", area: "ancientObservatory" },
      { name: "beacon", area: "stormBeacon" },
      { name: "conifer-front", area: "stormbreakCoast", pos: [7, 5, 2], at: [13, 2.8, 10] },
      { name: "conifer-side", area: "stormbreakCoast", pos: [23, 5, 10], at: [13, 2.8, 10] },
      { name: "conifer-back", area: "stormbreakCoast", pos: [13, 7, 21], at: [13, 2.8, 10] },
      { name: "giant-front", area: "skyrootCanopy", pos: [-47, 18, 89], at: [-30, 13, 106] },
      { name: "giant-side", area: "skyrootCanopy", pos: [-13, 19, 99], at: [-30, 13, 106] },
      { name: "giant-back", area: "skyrootCanopy", pos: [-42, 24, 121], at: [-30, 13, 106] },
      { name: "walkway-front", area: "skyrootCanopy", pos: [-34, 22, 101], at: [-20, 18, 110] },
      { name: "walkway-side", area: "skyrootCanopy", pos: [-7, 23, 111], at: [-24, 18, 114] },
      { name: "walkway-back", area: "skyrootCanopy", pos: [-35, 27, 127], at: [-20, 20, 115] },
    ];
    for (const shot of shots) {
      const frameTimeMs = await page.evaluate(async s => {
        const api = window.__mi;
        api.cloudArea(s.area);
        if (s.player) api.teleport(...s.player);
        if (s.pos) api.look(s.pos, s.at); else api.follow();
        api.snapCamera();
        const start = performance.now();
        await api.renderFrames(5);
        return (performance.now() - start) / 5;
      }, shot);
      await ready(s => {
        const state = window.__mi.state();
        return state.camera.settled && state.act3.world === "cloud" && state.act3.zone === s.area;
      }, shot);
      const state = await page.evaluate(() => window.__mi.state());
      const file = `${phase}-${shot.name}-${width}x${height}.png`;
      await page.screenshot({ path: `${folder}/${file}` });
      views.push({ phase, name: shot.name, size: `${width}x${height}`, screenshot: file,
        cameraKind: shot.pos ? "close-up" : "gameplay", camera: state.camera,
        calls: state.perf.calls, triangles: state.perf.triangles, fps: state.perf.fps,
        frameTimeMs });
      console.log(`${file}: ${state.perf.calls} calls, ${state.perf.triangles} triangles`);
    }
    await page.close();
  }
} finally {
  await browser.close();
  let previous = { views: [] };
  try { previous = JSON.parse(await readFile(`${folder}/render-report.json`, "utf8")); } catch { /* first run */ }
  const all = [...previous.views.filter(v => v.phase !== phase), ...views];
  const comparisons = all.filter(v => v.phase === "after").map(v => {
    const old = all.find(b => b.phase === "before" && b.name === v.name && b.size === v.size);
    return { name: v.name, size: v.size, callsDelta: old ? v.calls - old.calls : null,
      trianglesDelta: old ? v.triangles - old.triangles : null,
      withinBudget: v.calls <= 120 && v.triangles <= 140000,
      noWorse: Boolean(old && v.calls <= old.calls && v.triangles <= old.triangles) };
  });
  await writeFile(`${folder}/render-report.json`, JSON.stringify({ budget: { calls: 120, triangles: 140000 },
    source: "Live WebGL renderer, existing __mi state/perf and pinned/follow camera hooks; paused identical solved chapter fixture",
    views: all, comparisons, errors }, null, 2));
  if (errors.length) throw new Error(errors.join("\n"));
  if (phase === "after" && comparisons.some(v => !v.withinBudget || !v.noWorse)) throw new Error("Render budget or baseline regression; see render-report.json");
}
