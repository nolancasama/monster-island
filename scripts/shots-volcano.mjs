// Phase 3 visual evidence, driven through the real mic-free UI from a v2 save.
// Usage: node scripts/shots-volcano.mjs [baseUrl] [WxH]
// With no size, captures both school Chromebook sizes (1366x768, 1280x800).
// This is a visual capture utility; behavioural acceptance remains executor-owned.
import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [base = "http://127.0.0.1:5310/", size] = process.argv.slice(2);
const sizes = size ? [size] : ["1366x768", "1280x800"];
const stubsSource = fs.readFileSync(path.join(root, "tests/e2e/stubs.ts"), "utf8");
const stubs = stubsSource.slice(stubsSource.indexOf("`") + 1, stubsSource.lastIndexOf("`"));
const friend = (asked, described = {}) => ({ discovered: true, asked, friend: true, canKnown: {}, described });
const empty = { discovered: false, asked: {}, friend: false, canKnown: {}, described: {} };
const save = JSON.stringify({
  v: 2,
  progress: {
    monsters: { leafy: friend({ apples: true }), bubbo: friend({ fish: true }), puff: friend({ berries: true }, { size: true, part: true }), ember: empty },
    active: "puff", bag: {}, solved: ["fallenPalm", "river", "bridge", "cliff"], metMaple: true, endings: 2,
    said: ["itsGreen", "likeApples", "canHelp", "itsBlue", "likeFish", "canSwim", "comeHere", "itsPurple", "itsSmall", "hasWings", "likeBerries", "letsGo", "canFly", "thankYou"]
  },
  player: { x: 34.5, z: -49.2, yaw: Math.PI }, seconds: 1800
});

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
try {
  for (const dimensions of sizes) await capture(dimensions);
} finally {
  await browser.close();
}

async function capture(dimensions) {
  const [width, height] = dimensions.split("x").map(Number);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error(`Invalid viewport: ${dimensions}`);
  const outDir = path.join(root, ".tmp", "shots", `volcano-${width}x${height}`);
  fs.mkdirSync(outDir, { recursive: true });
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const logs = [];
  const captures = [];
  page.on("pageerror", (error) => logs.push(`[pageerror] ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") logs.push(`[console] ${message.text()}`);
  });
  await page.addInitScript(stubs);
  await page.addInitScript((seed) => {
    localStorage.setItem("mi.save.v2", seed);
  }, save);

  const state = () => page.evaluate(() => window.__mi.state());
  const call = (name, ...args) => page.evaluate(([method, values]) => window.__mi[method](...values), [name, args]);
  async function until(label, predicate, timeout = 40_000) {
    await expect.poll(async () => predicate(await state()), { timeout, message: `HARNESS_PRECONDITION_FAILED: ${label}` }).toBe(true);
    return state();
  }
  /** Advance held dialogue, while waiting on the named semantic condition. */
  async function through(label, predicate, timeout = 40_000) {
    await expect.poll(async () => {
      const current = await state();
      if (predicate(current)) return true;
      if (current.line) await page.keyboard.press("KeyE");
      return false;
    }, { timeout, message: `HARNESS_PRECONDITION_FAILED: ${label}` }).toBe(true);
    return state();
  }
  async function answer(id) {
    const before = await through(`tappable ${id}`, (s) => s.prompt?.buttons && s.prompt.choices.includes(id) && !["correct", "wrong"].includes(s.prompt.status));
    await page.locator(`[data-testid=choice][data-id=${id}]`).click();
    await until(`answer ${id} processed`, (s) => !s.prompt || s.prompt.id !== before.prompt.id || s.prompt.status === "wrong");
  }
  async function use(target, dist = 1.6) {
    await call("goTo", target, dist);
    await until(`focus ${target}`, (s) => s.mode === "explore" && s.focus?.id === target);
    await page.keyboard.press("KeyE");
  }
  async function select(key, monster) {
    await through(`exploring before switch to ${monster}`, (s) => s.mode === "explore");
    await page.keyboard.press(`Digit${key}`);
    await until(`${monster} selected`, (s) => s.progress.active === monster);
  }
  async function solve(target, question) {
    await use(target);
    await answer(question);
    await through(`${target} performed`, (s) => s.prompt?.choices.includes("thankYou") || s.mode === "explore");
    expect((await state()).progress.solved, `${target} ability must work before its view is captured`).toContain(target);
    await answer("thankYou");
    await through(`exploring after ${target}`, (s) => s.mode === "explore");
  }
  /** Sample actual rendered frames, with no time-based camera-settling sleep. */
  async function shot(name) {
    const samples = await page.evaluate(async () => {
      const samples = [];
      for (let frame = 0; frame < 10; frame++) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        if (frame >= 2) samples.push(window.__mi.state().perf);
      }
      return samples;
    });
    const file = path.join(outDir, `${String(captures.length + 1).padStart(2, "0")}-${name}.png`);
    await page.screenshot({ path: file });
    const perf = { calls: Math.max(...samples.map((s) => s.calls)), triangles: Math.max(...samples.map((s) => s.triangles)) };
    captures.push({ name, file: path.relative(root, file), ...perf, budget: perf.calls <= 110 && perf.triangles <= 120000 });
    console.log(`${dimensions} ${name}: ${perf.calls} calls, ${perf.triangles} triangles — ${path.relative(root, file)}`);
  }
  async function obstacleView(x, z, distance = 9) {
    const gy = (await state()).player.y;
    const cave = x === 64 && z === -102;
    // Look along the tunnel axis below the arch, so both torch rows remain visible.
    const pos = { x: x + (cave ? 1.8 : distance * 0.6), y: gy + (cave ? 2.8 : 4.2), z: z + distance };
    await call("look", [pos.x, pos.y, pos.z], [x, gy + (cave ? 1.8 : 1), z]);
    await until("obstacle camera reaches its shot", (s) => Math.hypot(s.camera.pos.x - pos.x, s.camera.pos.y - pos.y, s.camera.pos.z - pos.z) < 0.05);
    await until("companion walks to the far side of the player", (s) => {
      const m = s.monsters[s.progress.active];
      if (!m || m.mode !== "follow") return true;
      const dx = m.x - s.player.x;
      const dz = m.z - s.player.z;
      const cx = pos.x - s.player.x;
      const cz = pos.z - s.player.z;
      return Math.hypot(dx, dz) > 1.7 && dx * cx + dz * cz < -0.5;
    });
  }

  try {
    const url = new URL(base);
    url.searchParams.set("e2e", "1");
    await page.goto(url.href);
    await page.getByTestId("title").waitFor({ state: "visible" });
    await page.getByTestId("mode-tap").click();
    await page.getByTestId("btn-continue").click();
    await until("continued Phase 2-complete save", (s) => s.screen === "game" && s.mode === "explore");
    expect((await state()).progress.endings).toBe(2);

    await call("goTo", "lava", 1.6);
    await obstacleView(34.5, -51.3);
    await shot("lava-before");
    await call("follow");
    await select(2, "bubbo");
    await solve("lava", "canHelp");
    await obstacleView(34.5, -51.3);
    await shot("lava-after");
    await call("follow");

    await call("goTo", "ember", 2);
    await through("Ember colour prompt", (s) => s.prompt?.choices.includes("itsOrange"));
    await shot("ember-discovery");
    await answer("itsOrange");
    await answer("itsBig");
    await answer("hasTail");
    await answer("likeMeat");
    await through("Ember wants meat", (s) => s.mode === "explore" && s.progress.monsters.ember.asked.meat === true);
    await use("meat");
    await until("meat picked up", (s) => (s.progress.bag.meat ?? 0) > 0);
    await use("ember");
    await answer("yesIDo");
    await answer("letsGo");
    await through("Ember follows", (s) => s.mode === "explore" && s.progress.active === "ember");

    await call("goTo", "cave", 1.6);
    await obstacleView(64, -102, 8);
    await shot("cave-dark");
    await call("follow");
    await solve("cave", "canFire");
    await obstacleView(64, -102, 8);
    await shot("cave-lit");
    await call("follow");

    await solve("gateFlame", "canFire");
    await select(3, "puff");
    await solve("gateWing", "canFly");
    await select(1, "leafy");
    await solve("gateLeaf", "canHelp");
    await select(2, "bubbo");
    await solve("gateDrop", "canSwim");
    await until("all gate pillars lit", (s) => ["gateLeaf", "gateDrop", "gateWing", "gateFlame"].every((id) => s.progress.solved.includes(id)));
    const gardenY = (await state()).player.y;
    // Stay beyond the tunnel roof, with enough height to frame all four symbols.
    await call("look", [70, gardenY + 17, -126.5], [70, gardenY + 1.7, -132]);
    await shot("gate-four-pillars-lit");
    await call("follow");
    await call("goTo", "lumo", 4);
    await until("Lumo awake", (s) => s.monsters.lumo.mode !== "sleep");
    const lumo = (await state()).monsters.lumo;
    await obstacleView(lumo.x, lumo.z, 9);
    await shot("lumo-awake");
    await call("follow");

    await call("goTo", "lumo", 2);
    await answer("itsYellow");
    await answer("whatsYourName");
    await answer("itsBig");
    await answer("hasWings");
    await answer("noIDont");
    await through("Lumo finale", (s) => (s.finale === "rise" && s.monsters.lumo.air > 3) || (s.line?.by === "maple" && /safe|Monster Friend/i.test(s.line.en)), 60_000);
    await shot("finale");
    await through("Maple in person", (s) => s.line?.by === "maple" && /safe|Monster Friend/i.test(s.line.en), 60_000);
    await shot("finale-maple");
    await through("The End results", (s) => s.screen === "results", 60_000);
    expect((await state()).progress.endings).toBe(3);
    await expect(page.getByTestId("results")).toContainText("The End");
    await shot("results");
    await page.getByTestId("btn-explore").click();
    await until("sanctuary free exploration", (s) => s.screen === "game" && s.mode === "explore");
    await call("goTo", "stone", 3);
    await call("look", [37, 6, 6], [33.6, 2, -3.2]);
    await shot("stone-flame-and-centre-star");
  } finally {
    const report = { viewport: { width, height }, captures, errors: logs };
    fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
    await context.close();
  }
  expect(logs, "browser errors").toEqual([]);
  expect(captures.filter((c) => !c.budget), "Chromebook view budgets (approximately 100 calls, at most 120k triangles)").toEqual([]);
}
