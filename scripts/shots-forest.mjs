// Phase 2 (Forest) playthrough with screenshots, from a save where the beach is
// finished, driven through the real UI and the speech stub. Saves to .tmp/shots/.
// Usage: node scripts/shots-forest.mjs [baseUrl] [WxH] [--touch] [--tap]
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const pos = args.filter((a) => !a.startsWith("--"));
const base = pos[0] ?? "http://127.0.0.1:5310/";
const [vw, vh] = (pos[1] ?? "1366x768").split("x").map(Number);
const touch = flags.has("--touch");
const tap = flags.has("--tap");
const outDir = path.join(root, ".tmp", "shots", `forest-${vw}x${vh}${touch ? "-touch" : ""}${tap ? "-tap" : ""}`);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const stubsSrc = fs.readFileSync(path.join(root, "tests", "e2e", "stubs.ts"), "utf8");
const stubs = stubsSrc.slice(stubsSrc.indexOf("`") + 1, stubsSrc.lastIndexOf("`"));

/** The beach finished: Leafy and Bubbo are friends, Bubbo follows, the forest path is open. */
const record = (friend, asked) => ({ discovered: true, asked, friend, canKnown: {}, described: {} });
const empty = { discovered: false, asked: {}, friend: false, canKnown: {}, described: {} };
const SAVE = JSON.stringify({
  v: 2,
  progress: {
    monsters: { leafy: record(true, { apples: true }), bubbo: record(true, { fish: true }), puff: empty, ember: empty },
    active: "bubbo",
    bag: {},
    solved: ["fallenPalm", "river"],
    metMaple: true,
    endings: 1,
    said: ["itsGreen", "likeApples", "canHelp", "itsBlue", "likeFish", "canSwim"]
  },
  player: { x: 33.6, z: -6.5, yaw: Math.PI },
  seconds: 900
});

const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"]
});
const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
const page = await context.newPage();
const logs = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") logs.push(`[${m.type()}] ${m.text()}`);
});
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await page.addInitScript(stubs);
await page.addInitScript((save) => {
  if (!sessionStorage.getItem("seeded")) {
    localStorage.setItem("mi.save.v2", save);
    sessionStorage.setItem("seeded", "1");
  }
}, SAVE);

const call = (name, ...a) => page.evaluate(([m, v]) => window.__mi[m](...v), [name, a]);
const state = () => page.evaluate(() => window.__mi.state());
async function until(label, pred, timeout = 30_000) {
  const t0 = Date.now();
  for (;;) {
    const s = await state();
    if (pred(s)) return s;
    if (Date.now() - t0 > timeout) throw new Error(`timeout: ${label}\n${JSON.stringify({ mode: s.mode, line: s.line, prompt: s.prompt, objective: s.objective }, null, 1)}`);
    await page.waitForTimeout(80);
  }
}
let n = 0;
async function shot(name, wait = 700) {
  await page.waitForTimeout(wait);
  const file = path.join(outDir, `${String(++n).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file });
  console.log("saved", path.relative(root, file));
}
/** Press Next until a prompt opens or the game is back to exploring. */
async function advance(label) {
  for (let i = 0; i < 40; i++) {
    const s = await state();
    if (s.prompt && s.prompt.status !== "correct") return s;
    if (s.mode === "explore" && !s.line) return s;
    if (s.screen === "results") return s;
    if (s.line) await page.keyboard.press("KeyE");
    await page.waitForTimeout(250);
  }
  throw new Error(`advance stuck: ${label}`);
}
/** Answer the open prompt: speak (stub) or tap the choice. */
async function answer(phraseId, spoken) {
  const s = await until(`prompt for ${phraseId}`, (x) => x.prompt && x.prompt.status !== "correct" && x.prompt.status !== "listening");
  if (s.prompt.buttons) {
    await page.locator(`[data-testid=choice][data-id=${phraseId}]`).click();
  } else {
    await page.evaluate((say) => {
      window.__speech.say = say;
    }, spoken);
    await page.keyboard.press("Space");
  }
  await until(`prompt ${phraseId} closed`, (x) => !x.prompt || x.prompt.id !== s.prompt.id);
}
const lineIs = (re) => (s) => s.line && re.test(s.line.en);
async function useThing(target, focusId, dist = 1.4) {
  await call("goTo", target, dist);
  await until(`focus ${focusId}`, (x) => x.focus?.id === focusId && x.mode === "explore");
  await page.keyboard.press("KeyE");
}

await page.goto(`${base}?e2e=1`);
await page.waitForSelector("[data-testid=title]");
if (tap) await page.click("[data-testid=mode-tap]");
await page.click("[data-testid=btn-continue]");
await until("explore", (s) => s.mode === "explore" && s.screen === "game");
await call("setCamera", 0.15, 0.42, 10);
await shot("forest-path-open", 1500);

// ---- Overviews of the forest places (fixed cameras).
await call("look", [44, 8, -8], [36, 1, -20]);
await shot("glade-overview", 1200);
await call("look", [44, 5, -19], [37, -1, -26.5]);
await shot("ravine-broken-bridge", 1200);
await call("look", [33, 6, -24], [41.5, 3, -36]);
await shot("hills-puff-tree", 1200);
await call("look", [40, 4, -36], [34, 4, -46]);
await shot("cliff-coiled-rope", 1200);
await call("follow");

// ---- The bridge: Bubbo can't; switch to Leafy and ask.
await call("teleport", 34, -14, Math.PI);
await shot("walking-forest-path", 1000);
await useThing("bridge", "bridge", 1.6);
await shot("bridge-prompt", 900);
await answer("canHelp", "can you help me");
await until("bubbo cant", lineIs(/No, I can't/));
await advance("switch hint");
await page.keyboard.press("Digit1");
await until("leafy active", (x) => x.progress.active === "leafy");
await useThing("bridge", "bridge", 1.6);
await answer("canHelp", "can you help me");
await until("leafy can", lineIs(/Yes, I can/));
await advance("leafy can");
await page.waitForTimeout(1500);
await shot("vines-weaving", 0);
await until("we did it", (x) => lineIs(/We did it/)(x) || Boolean(x.prompt?.sentences.includes("Thank you!")), 20_000);
await shot("bridge-fixed", 300);
await advance("we did it");
await until("thank you prompt", (x) => x.prompt?.choices.includes("thankYou") || x.prompt?.sentences.includes("Thank you!"));
await shot("thank-you-prompt", 500);
await answer("thankYou", "thank you");
await until("welcome", lineIs(/welcome/));
await advance("welcome");
await until("explore after bridge", (x) => x.mode === "explore");
await call("look", [41, 3.5, -22], [37, 0.5, -27]);
await shot("bridge-repaired-view", 1000);
await call("follow");

// ---- Puff: up in its tree; "Come here!", then colour, size, wings.
await call("teleport", 38.5, -29.5, Math.PI);
await shot("cross-bridge-hills", 1200);
await call("goTo", "puff", 2.4);
await until("come here prompt", (x) => x.prompt?.sentences.includes("Come here!") || x.prompt?.choices.includes("comeHere"), 20_000);
await shot("puff-in-tree-come-here", 1200);
await answer("comeHere", "come here");
await until("colour prompt", (x) => x.prompt?.question === "What color is it?", 20_000);
await shot("puff-came-down", 600);
await answer("itsPurple", "it's purple");
await until("puff hello", lineIs(/I'm Puff/));
await shot("puff-hello", 500);
await advance("hello");
await until("size prompt", (x) => x.prompt?.question === "Is it big or small?");
await shot("size-prompt", 600);
await answer("itsSmall", "it's small");
await until("part prompt", (x) => x.prompt?.question === "Look! What does it have?");
await shot("part-prompt", 600);
await answer("hasWings", "it has wings");
await until("like prompt", (x) => x.prompt?.choices.includes("likeBerries"), 20_000);
await shot("journal-card-full", 0);
await answer("likeApples", "do you like apples");
await advance("no");
await answer("likeBerries", "do you like berries");
await until("yes berries", lineIs(/Yes, I do/));
await advance("yes");
await until("explore", (x) => x.mode === "explore");
await useThing("berry2", "berry2", 1.3);
await until("berries", (x) => (x.progress.bag.berries ?? 0) > 0);
await useThing("puff", "puff", 1.8);
await answer("yesIDo", "yes I do");
await until("me too", lineIs(/Me too/));
await page.keyboard.press("KeyE");
await until("friend card", (x) => x.friendCard === "puff", 20_000);
await shot("puff-friend", 900);
await advance("friend");
await until("lets go prompt", (x) => x.prompt?.sentences.includes("Let's go!") || x.prompt?.choices.includes("letsGo"));
await shot("lets-go-prompt", 400);
await answer("letsGo", "let's go");
await advance("ok lets go");
await until("puff follows", (x) => x.mode === "explore" && x.progress.active === "puff");
await page.keyboard.down("KeyS");
await page.waitForTimeout(900);
await page.keyboard.up("KeyS");
await shot("puff-follows", 900);

// ---- The cliff: Puff flies the rope up; thank you; let's go; climb; the ending.
await useThing("cliff", "cliff", 1.6);
await shot("cliff-prompt", 700);
await answer("canFly", "can you fly");
await until("puff can", lineIs(/Yes, I can/));
await advance("puff can");
await page.waitForTimeout(2600);
await shot("puff-flies-rope", 0);
await until("thanks", (x) => x.prompt?.sentences.includes("Thank you!") || x.prompt?.choices.includes("thankYou"), 30_000);
await shot("rope-up", 300);
await answer("thankYou", "sankyu");
await advance("welcome");
await until("climb lets go", (x) => x.prompt?.sentences.includes("Let's go!") || x.prompt?.choices.includes("letsGo"));
await answer("letsGo", "let's go");
await until("puff lets go", lineIs(/Let's go/));
await page.keyboard.press("KeyE");
await page.waitForTimeout(1600);
await shot("climbing", 0);
await until("volcano", lineIs(/volcano/), 30_000);
await shot("cliff-top-volcano", 600);
await advance("ending");
await until("results", (x) => x.screen === "results", 30_000);
await shot("results-forest", 1200);
let s = await state();
console.log("perf", JSON.stringify(s.perf));
console.log("said", s.progress.said.join(", "));
await page.click("[data-testid=btn-explore]");
await until("free", (x) => x.screen === "game" && x.mode === "explore");
await call("teleport", 34, -40, Math.PI);
await call("setCamera", 0.3, 0.45, 9);
await shot("hills-after", 1200);
s = await state();
console.log("perf hills", JSON.stringify(s.perf));
await call("teleport", 34, -6, Math.PI);
await shot("beach-far-bank", 1000);
await call("look", [37, 6, 6], [33.6, 2, -3.2]);
await shot("stone-three-lights", 1200);
s = await state();
console.log("perf beach", JSON.stringify(s.perf));
await call("follow");
await page.keyboard.press("KeyM");
await page.click("[data-testid=journal-tab-puff]");
await shot("journal-puff", 600);
await page.click("[data-testid=journal-tab-bubbo]");
await shot("journal-bubbo-optional-size", 400);
await page.click("[data-testid=j-write-size]");
await shot("write-size-prompt", 900);
if (logs.length) console.log("LOGS\n" + logs.slice(0, 30).join("\n"));
await browser.close();
