// Act 2 visual evidence: the kidnapping, the cliff, the lowland's areas, a fight, riding, and the town.
// Usage: node scripts/shots-act2.mjs [baseUrl] [WxH]
// With no size, captures both school Chromebook sizes (1366x768, 1280x800).
// Starts from a finished prologue (v3) save and drives the real UI in tap mode;
// the test hook only places the player and the camera for each view.
import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [base = "http://127.0.0.1:5320/", size] = process.argv.slice(2);
const sizes = size ? [size] : ["1366x768", "1280x800"];
const stubsSource = fs.readFileSync(path.join(root, "tests/e2e/stubs.ts"), "utf8");
const stubs = stubsSource.slice(stubsSource.indexOf("`") + 1, stubsSource.lastIndexOf("`"));
const friend = (asked, described = {}, extra = {}) => ({ discovered: true, asked, friend: true, canKnown: {}, described, ...extra });
export const DONE_V3 = JSON.stringify({
  v: 3,
  progress: {
    monsters: {
      leafy: friend({ apples: true }), bubbo: friend({ fish: true }), puff: friend({ berries: true }, { size: true, part: true }),
      ember: friend({ meat: true }, { size: true, part: true }, { invited: true }), lumo: friend({}, { name: true, size: true, part: true })
    },
    active: "leafy", bag: {}, solved: ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame"],
    metMaple: true, endings: 3, said: ["itsGreen", "likeApples", "canHelp", "thankYou", "letsGo", "itsYellow", "whatsYourName"]
  },
  player: { x: 70, z: -136, yaw: Math.PI }, seconds: 2400
});

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
try {
  for (const dimensions of sizes) await capture(dimensions);
} finally {
  await browser.close();
}

async function capture(dimensions) {
  const [width, height] = dimensions.split("x").map(Number);
  const outDir = path.join(root, ".tmp", "shots", `act2-${width}x${height}`);
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
    if (!sessionStorage.getItem("act2-seeded")) {
      localStorage.clear();
      localStorage.setItem("mi.save.v3", seed);
      localStorage.setItem("mi.settings.v1", JSON.stringify({ mic: false, music: 0.35, sfx: 0.75, japanese: true, slowVoice: false, cameraSensitivity: 1 }));
      sessionStorage.setItem("act2-seeded", "1");
    }
  }, DONE_V3);

  const state = () => page.evaluate(() => window.__mi.state());
  const call = (name, ...args) => page.evaluate(([method, values]) => window.__mi[method](...values), [name, args]);
  async function until(label, predicate, timeout = 60_000) {
    await expect.poll(async () => predicate(await state()), { timeout, message: `HARNESS_PRECONDITION_FAILED: ${label}` }).toBe(true);
    return state();
  }
  async function through(label, predicate, timeout = 90_000) {
    await expect.poll(async () => {
      const current = await state();
      if (predicate(current)) return true;
      if (current.line) await page.keyboard.press("KeyE");
      return false;
    }, { timeout, message: `HARNESS_PRECONDITION_FAILED: ${label}` }).toBe(true);
    return state();
  }
  async function shot(name) {
    const samples = await page.evaluate(async () => {
      const out = [];
      for (let frame = 0; frame < 10; frame++) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        if (frame >= 2) out.push(window.__mi.state().perf);
      }
      return out;
    });
    const file = path.join(outDir, `${String(captures.length + 1).padStart(2, "0")}-${name}.png`);
    await page.screenshot({ path: file });
    const perf = { calls: Math.max(...samples.map((s) => s.calls)), triangles: Math.max(...samples.map((s) => s.triangles)) };
    captures.push({ name, file: path.relative(root, file), ...perf });
    console.log(`${dimensions} ${name}: ${perf.calls} calls, ${perf.triangles} triangles`);
  }
  async function view(x, z, yaw, pitch = 0.42, dist = 9) {
    // Full HP so a nearby enemy cannot interrupt the views with a knock-out.
    await call("setHp", 100);
    await call("teleport", x, z, yaw);
    await call("setCamera", yaw + Math.PI, pitch, dist);
    await page.waitForTimeout(700);
  }

  try {
    const url = new URL(base);
    url.searchParams.set("e2e", "1");
    await page.goto(url.href);
    await page.getByTestId("title").waitFor({ state: "visible" });
    await shot("title-act2-button");
    await page.getByTestId("btn-act2").click();
    await until("celebration", (s) => s.act2.scene === "celebrate");
    await page.waitForTimeout(1600);
    await shot("prologue-clear");
    await through("airship arrives", (s) => s.act2.scene === "arrive" && s.act2.ship.visible);
    await page.waitForTimeout(3000);
    await shot("airship-arrives");
    await through("cage", (s) => s.act2.scene === "capture" && s.act2.ship.cage);
    await page.waitForTimeout(1900);
    await shot("cage-over-lumo");
    await through("escape", (s) => s.act2.scene === "escape" || s.act2.scene === "reveal");
    await page.waitForTimeout(2600);
    await shot("escape-over-cliff");
    await until("reveal", (s) => s.act2.scene === "reveal");
    await page.waitForTimeout(1800);
    await shot("reveal-lowland");
    await through("maple explains", (s) => s.line?.by === "maple");
    await shot("maple-at-ledge");
    await through("quest banner", (s) => s.act2.banner !== null && s.act2.scene === "quest");
    await shot("new-quest");
    await through("control returns", (s) => s.mode === "explore" && s.act2.scene === "done");
    expect((await state()).progress.act2.lumoTaken).toBe(true);
    await shot("ledge-control");

    // The rope down the cliff.
    await call("goTo", "cliffDown", 0.4);
    await until("rope focus", (s) => s.focus?.id === "cliffDown");
    await page.keyboard.press("KeyE");
    await until("climbing", (s) => s.player.climbing);
    await page.waitForTimeout(2500);
    await shot("climb-down");
    await through("landed", (s) => s.mode === "explore" && !s.player.climbing && s.progress.act2.descended);
    await until("Leafy on the backpack", (s) => s.act2.stance.friend === "leafy" && s.act2.stance.k > 0.99);
    await page.waitForTimeout(500);
    await shot("landing-leafy-back");
    await call("setCamera", -2.4, 0.3, 8);
    await page.waitForTimeout(600);
    await shot("cliff-from-below");

    // A fight with the first enemy.
    await call("nearEnemy", 0, 3.4);
    await until("enemy notices", (s) => s.act2.enemies[0].state !== "idle");
    await page.waitForTimeout(500);
    await shot("enemy-alert");
    for (let i = 0; i < 2; i++) {
      await page.keyboard.press("KeyJ");
      await page.waitForTimeout(140);
      if (i === 0) await shot("vine-whip");
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(200);
    await shot("enemy-ko-coins");
    // The special and riding: Bubbo, then Ember.
    await call("nearEnemy", 3, 4);
    await page.keyboard.press("KeyK");
    await page.waitForTimeout(160);
    await shot("vine-pull");
    await page.keyboard.press("Digit2");
    await until("riding Bubbo", (s) => s.act2.stance.friend === "bubbo" && s.act2.stance.k > 0.99);
    await page.waitForTimeout(400);
    await shot("riding-bubbo");
    await call("setCamera", 1.2, 0.25, 5);
    await page.waitForTimeout(500);
    await shot("riding-bubbo-side");
    await page.keyboard.press("Digit4");
    await until("riding Ember", (s) => s.act2.stance.friend === "ember" && s.act2.stance.k > 0.99);
    await page.waitForTimeout(400);
    await shot("riding-ember");
    await call("setCamera", 1.2, 0.25, 5);
    await page.waitForTimeout(500);
    await shot("riding-ember-side");
    await call("setCamera", -1.9, 0.25, 5);
    await page.waitForTimeout(500);
    await shot("riding-ember-back");
    await page.keyboard.press("KeyK");
    await page.waitForTimeout(250);
    await shot("flame-burst");
    await page.keyboard.press("Digit3");
    await until("Puff on the shoulder", (s) => s.act2.stance.friend === "puff" && s.act2.stance.k > 0.99);
    await call("setCamera", 0.9, 0.3, 5);
    await page.waitForTimeout(500);
    await shot("puff-shoulder");
    await page.keyboard.press("Digit1");
    await call("setCamera", -0.6, 0.3, 4.5);
    await page.waitForTimeout(700);
    await shot("leafy-back-close");

    // The areas.
    await view(76, -191, Math.PI);
    await shot("camp");
    await view(74, -199, Math.PI * 0.75);
    await shot("fork");
    await view(46, -219, -Math.PI / 2);
    await shot("grove-pond");
    await view(50, -230, Math.PI * 0.9);
    await shot("grove-trail");
    await view(98, -203, -Math.PI * 0.6);
    await shot("canopy-ramp");
    await view(106, -213.6, Math.PI, 0.5, 9);
    await shot("canopy-gap");
    await view(76, -249, -Math.PI / 2);
    await shot("causeway");
    await view(76, -246, Math.PI);
    await shot("causeway-gate");
    await view(104, -251, -Math.PI / 2);
    await shot("shrine");
    await view(76, -270, Math.PI);
    await shot("coast");
    await view(76, -292, Math.PI);
    await until("in the town", (s) => s.act2.zone === "port");
    await through("town arrival", (s) => s.mode === "explore");
    await shot("town-entrance");
    await view(77, -312, Math.PI * 0.9, 0.5, 12);
    await shot("town-plaza");
    await call("goTo", "market");
    await page.waitForTimeout(400);
    await shot("market");
    await call("look", [76, 25, -150], [76, 3, -290]);
    await page.waitForTimeout(900);
    await shot("overview-from-sanctuary");
  } finally {
    fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify({ dimensions, captures, logs }, null, 2));
    if (logs.length) console.log(logs.join("\n"));
    await context.close();
  }
}
