// Matched HOME frontier evidence, with the existing follow and story lookout cameras.
// Run against the pre-wall build with --phase=before, then the current build
// with --phase=after. Example: node scripts/shots-wall.mjs http://127.0.0.1:4176 --phase=after
// The pre-wall bundle from this implementation is preserved in
// .tmp/shots/expansion/wall/before-build/. No-port capture:
// node scripts/shots-wall.mjs --phase=after --dist dist
import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distArg = process.argv.indexOf("--dist");
if (distArg !== -1 && !process.argv[distArg + 1]) throw new Error("--dist needs a directory");
const dist = distArg === -1 ? null : fs.realpathSync(path.resolve(root, process.argv[distArg + 1]));
const base = dist ? "http://mi.local" : process.argv.find(a => /^https?:/.test(a)) ?? "http://127.0.0.1:4176";
const contentTypes = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".webp": "image/webp", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg",
  ".wasm": "application/wasm", ".glb": "model/gltf-binary" };
const phase = process.argv.includes("--phase=before") ? "before" : "after";
const directory = path.join(root, ".tmp/shots/expansion/wall");
fs.mkdirSync(directory, { recursive: true });
const reportPath = path.join(directory, "render-report.json");
const report = fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath, "utf8")) : { views: [] };
report.budget = { calls: 120, triangles: 140000, addedCalls: 3, addedTriangles: 4000, addedTrianglesOverBaseline: 1000 };
report.semanticState = "window.__mi.state().progress.act2.started (existing read-only state)";
report.views = report.views.filter(v => v.phase !== phase);
report.status = "incomplete";
delete report.acceptance; // Acceptance belongs to the controller, not this capture runner.
delete report.capture;
delete report.failure;
delete report.failures;
const flush = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
const source = fs.readFileSync(path.join(root, "tests/e2e/stubs.ts"), "utf8");
const stubs = source.slice(source.indexOf("`") + 1, source.lastIndexOf("`"));
const friends = Object.fromEntries(["leafy", "bubbo", "puff", "ember", "lumo"].map(id => [id, {
  discovered: true, friend: true, invited: true, asked: {}, canKnown: {}, described: { name: true, size: true, part: true },
}]));
const seed = JSON.stringify({ v: 4, progress: {
  monsters: friends, active: "leafy", metMaple: true, endings: 3, bag: {}, said: [],
  solved: ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame", "groveLilies", "canopyVines", "canopyRope", "causewayGate"],
  act2: { started: true, lumoTaken: true, descended: true, hp: 100, mp: { leafy: 100, bubbo: 100, puff: 100, ember: 100 },
    coins: 25, cleared: ["forest1", "grove", "canopy", "causeway", "coast"], tutorial: ["attack", "coins", "special", "eat", "rest", "switch"],
    items: {}, upgrades: [], chests: [], checkpoint: "cliff", portFound: true, bought: false, harbor: false, trained: [], zone: "forest1" },
}, player: { x: 75.5, z: -148.2, yaw: Math.PI }, seconds: 2500 });

let browser;
const captureFailures = [];
try {
  browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  for (const [width, height] of [[1366, 768], [1280, 800]]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    if (dist) await context.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== base) return route.abort();
      const requested = path.resolve(dist, `.${decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname)}`);
      if (!requested.startsWith(dist + path.sep)) return route.fulfill({ status: 403, body: "Forbidden" });
      try {
        const file = fs.realpathSync(requested);
        if (!file.startsWith(dist + path.sep)) return route.fulfill({ status: 403, body: "Forbidden" });
        await route.fulfill({ status: 200, contentType: contentTypes[path.extname(file)] ?? "application/octet-stream", body: fs.readFileSync(file) });
      } catch { await route.fulfill({ status: 404, body: "Not found" }); }
    });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.addInitScript(stubs);
    await page.addInitScript(save => {
      localStorage.setItem("mi.save.v4", save);
      localStorage.setItem("mi.settings.v1", JSON.stringify({ mic: false }));
    }, seed);
    const call = (name, ...args) => page.evaluate(([n, a]) => window.__mi[n](...a), [name, args]);
    const read = () => page.evaluate(() => window.__mi.state());
    const until = async (label, predicate) => {
      await expect.poll(async () => predicate(await read()), { timeout: 60000, message: `HARNESS_PRECONDITION_FAILED: ${label}` }).toBe(true);
    };
    await page.goto(`${base.replace(/\/$/, "")}/?e2e=1`);
    await expect(page.getByTestId("btn-continue"), "HARNESS_PRECONDITION_FAILED: valid completed-prologue save").toBeVisible();
    await page.getByTestId("btn-continue").click();
    await until("loaded home exploration", s => s.screen === "game" && s.mode === "explore" && s.progress.act2.started);
    const progress = (await read()).progress;
    await call("set", { mode: "busy" });

    async function place(x, z, profile) {
      await call("timeScale", 1);
      await call("teleport", x, z, Math.PI);
      await call("follow");
      await call("renderFrames", 1);
      await until(`placement ${x},${z}`, s => Math.hypot(s.player.x - x, s.player.z - z) < .1);
      await until(`${profile} follow camera`, s => s.camera.profile === profile && s.camera.settled);
    }
    async function capture(name, started) {
      await call("timeScale", 0);
      await call("renderFrames", 5);
      const s = await read();
      if (s.progress.act2.started !== started) throw new Error("HARNESS_PRECONDITION_FAILED: requested gate progress");
      const perf = await page.evaluate(async () => {
        const samples = [], times = [];
        let previous = performance.now();
        for (let i = 0; i < 8; i++) {
          await window.__mi.renderFrames(1);
          const now = performance.now(); times.push(now - previous); previous = now;
          samples.push(window.__mi.state().perf);
        }
        return { calls: Math.max(...samples.map(p => p.calls)), triangles: Math.max(...samples.map(p => p.triangles)),
          frameMs: times.reduce((a, b) => a + b, 0) / times.length };
      });
      const file = `${phase}-${name}-${started ? "open" : "shut"}-${width}x${height}.png`;
      await page.screenshot({ path: path.join(directory, file) });
      const prior = report.views.find(v => v.phase === "before" && v.name === name && v.started === started && v.width === width && v.height === height);
      const addedCalls = prior ? perf.calls - prior.perf.calls : null;
      const addedTriangles = prior ? perf.triangles - prior.perf.triangles : null;
      report.views.push({ phase, name, started, width, height, file, perf, addedCalls, addedTriangles, player: s.player, camera: s.camera });
      report.status = "incomplete";
      flush();
    }
    for (const started of [false, true]) {
      await call("set", { mode: "busy", progress: { ...progress, act2: { ...progress.act2, started } } });
      await call("renderFrames", 2);
      await until("gate flag applied", s => s.progress.act2.started === started && s.mode === "busy");
      // The authored story shot samples its height at LEDGE.x0+2,z0+2.
      await place(74.5, -149.2, "sanctuary-garden");
      const y = (await read()).player.ground;
      await place(75.5, -148.2, "sanctuary-garden");
      await capture("lookout-follow", started);
      // Exact settled lookout shot from flow/act2.ts, with its original target.
      await call("look", [71.3, y + 3.2, -143], [76, y - 6, -200]);
      await call("renderFrames", 1);
      await until("existing lookout story shot", s => Math.abs(s.camera.pos.x - 71.3) < .001 && Math.abs(s.camera.pos.z + 143) < .001);
      await capture("lookout-story", started);
      for (const [name, x, z] of [["courtyard", 70, -127.2], ["view-beyond-lair", 80.5, -131]]) {
        await place(x, z, "sanctuary-courtyard");
        await capture(name, started);
      }
      await place(75.5, -148.2, "sanctuary-garden");
      for (const [name, pos, target] of [
        ["peaceful-side", [73, y + 9, -134], [75.5, y + .7, -150.35]],
        ["lowland-side", [80, y + 3, -165], [75.5, y + .7, -150.35]],
      ]) {
        await call("look", pos, target);
        await call("renderFrames", 1);
        await until(`${name} shot applied`, s => Math.hypot(s.camera.pos.x - pos[0], s.camera.pos.y - pos[1], s.camera.pos.z - pos[2]) < .001);
        await capture(name, started);
      }
    }
    captureFailures.push(...errors.map(error => `${width}x${height}: browser error: ${error}`));
    await context.close();
  }
  const before = report.views.filter(v => v.phase === "before").length, after = report.views.filter(v => v.phase === "after").length;
  report.phases = { before, after };
  // Evaluate only after every requested view has been recorded. Baselines are
  // evidence, including existing overruns; only wall deltas can fail them.
  const failures = [...captureFailures];
  const complete = before === 24 && after === 24;
  report.budgetsEvaluated = phase === "after" && complete;
  if (phase === "after" && !complete)
    failures.push(`HARNESS_PRECONDITION_FAILED: need all 24 views in both phases before evaluating budgets (before=${before}, after=${after})`);
  if (phase === "after") for (const view of report.views.filter(v => v.phase === "after")) {
    const label = view.file;
    const prior = report.views.find(v => v.phase === "before" && v.name === view.name && v.started === view.started && v.width === view.width && v.height === view.height);
    if (!prior) { failures.push(`HARNESS_PRECONDITION_FAILED: missing baseline for ${label}`); continue; }
    if (!complete) continue;
    let matched = true;
    for (const key of ["pos", "target"]) for (const axis of ["x", "y", "z"])
      if (Math.abs(view.camera[key][axis] - prior.camera[key][axis]) >= .001) {
        matched = false;
        failures.push(`HARNESS_PRECONDITION_FAILED: ${label}: camera ${key}.${axis} differs`);
      }
    if (!matched) continue;
    view.addedCalls = view.perf.calls - prior.perf.calls;
    view.addedTriangles = view.perf.triangles - prior.perf.triangles;
    if (prior.perf.calls <= 120 && view.perf.calls > 120) failures.push(`${label}: ${view.perf.calls} calls > 120`);
    if (view.addedCalls > 3) failures.push(`${label}: ${view.addedCalls} added calls > 3`);
    if (prior.perf.triangles <= 140000 && view.perf.triangles > 140000) failures.push(`${label}: ${view.perf.triangles} triangles > 140000`);
    const limit = prior.perf.triangles > 140000 ? 1000 : 4000;
    if (view.addedTriangles > limit) failures.push(`${label}: ${view.addedTriangles} added triangles > ${limit}`);
  }
  report.failures = failures;
  report.status = failures.length ? "failed" : before === 24 && after === 24 ? "budgets-passed" : "incomplete";
  report.capture = { phase, mode: dist ? "disk-route" : "http", dist: dist ? path.relative(root, dist) : null, screenshotsProduced: report.phases[phase] };
  report.captures = { ...report.captures, [phase]: report.capture };
  flush();
  if (failures.length) { console.error(failures.join("\n")); process.exitCode = 1; }
} catch (error) {
  report.status = "blocked";
  report.budgetsEvaluated = false;
  report.failure = String(error);
  report.failures = [`HARNESS_PRECONDITION_FAILED: capture could not complete: ${String(error).split("\n")[0]}`];
  report.phases = Object.fromEntries(["before", "after"].map(p => [p, report.views.filter(v => v.phase === p).length]));
  report.capture = { phase, mode: dist ? "disk-route" : "http", dist: dist ? path.relative(root, dist) : null, screenshotsProduced: report.phases[phase], exitStatus: 1 };
  report.captures = { ...report.captures, [phase]: { ...report.capture, failure: report.failures[0] } };
  flush();
  throw error;
} finally {
  await browser?.close();
}
