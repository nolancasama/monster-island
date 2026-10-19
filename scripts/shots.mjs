// Full Phase 1 playthrough with screenshots, driven through the real UI and the
// speech stub (spoken answers). Saves to .tmp/shots/.
// Usage: node scripts/shots.mjs [baseUrl] [WxH] [--touch] [--tap]
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
const outDir = path.join(root, ".tmp", "shots", `${vw}x${vh}${touch ? "-touch" : ""}${tap ? "-tap" : ""}`);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const stubsSrc = fs.readFileSync(path.join(root, "tests", "e2e", "stubs.ts"), "utf8");
const stubs = stubsSrc.slice(stubsSrc.indexOf("`") + 1, stubsSrc.lastIndexOf("`"));

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

await page.goto(`${base}?e2e=1`);
await page.waitForSelector("[data-testid=title]");
if (tap) await page.click("[data-testid=mode-tap]");
await shot("title", 1500);
await page.click("[data-testid=btn-start]");
await until("intro line", lineIs(/Welcome/));
await shot("intro-maple", 1600);
await advance("intro");
await shot("explore-camp", 900);
await call("setCamera", -0.9, 0.5, 11);
await call("teleport", -18, 1.5, -2.6);
await shot("grove-leafy", 1200);

// ---- Leafy: discover
await call("goTo", "leafy", 2.2);
await until("describe prompt", (s) => s.prompt?.question === "What color is it?");
await shot("discover-silhouette", 900);
await answer("itsGreen", "it's green");
await until("leafy hello", lineIs(/I'm Leafy/));
await shot("discover-colored", 600);
await advance("leafy hello");
let s = await until("like prompt", (x) => x.prompt?.kind === "choice" && x.prompt.choices.includes("likeApples"));
await shot("like-frame", 500);
await answer("likeFish", "do you like fish");
await until("no answer", lineIs(/No, I don't/));
await shot("leafy-no", 400);
await advance("after no");
await answer("likeApples", "do you like apples");
await until("yes answer", lineIs(/Yes, I do/));
await shot("leafy-yes", 400);
await advance("after yes");
s = await until("explore after yes", (x) => x.mode === "explore");
await shot("find-apples-star", 900);

// ---- fetch apples, befriend
await call("goTo", "apple1", 1.3);
await until("apple focus", (x) => x.focus?.kind === "food");
await page.keyboard.press("KeyE");
await until("apple in bag", (x) => (x.progress.bag.apples ?? 0) > 0);
await shot("bag-apple", 500);
await call("goTo", "leafy", 1.8);
await until("leafy focus", (x) => x.focus?.id === "leafy");
await page.keyboard.press("KeyE");
await until("turnaround", (x) => x.prompt?.question === "Do you like apples?");
await shot("leafy-asks-back", 600);
await answer("yesIDo", "yes I do");
await until("me too", lineIs(/Me too/));
await page.keyboard.press("KeyE");
await until("friend card", (x) => x.friendCard === "leafy");
await shot("leafy-friend", 900);
await advance("friend lines");
await until("explore leafy friend", (x) => x.mode === "explore" && x.progress.active === "leafy");
await call("follow");
await page.keyboard.down("KeyD");
await page.waitForTimeout(1200);
await page.keyboard.up("KeyD");
await shot("leafy-follows", 900);

// ---- the palm
await call("goTo", "palm", 1.2);
await until("palm focus", (x) => x.focus?.id === "fallenPalm");
await shot("palm", 900);
await page.keyboard.press("KeyE");
await until("palm prompt", (x) => x.prompt && x.prompt.choices.includes("canHelp"));
await shot("palm-prompt", 600);
await answer("canHelp", "can you help me");
await until("yes I can", lineIs(/Yes, I can/));
await page.keyboard.press("KeyE");
await page.waitForTimeout(1300);
await shot("vines", 0);
await until("we did it", lineIs(/We did it/), 20_000);
await shot("palm-moved", 300);
await advance("palm done");

// ---- Bubbo
await call("teleport", 12, 1.5, 1.6);
await call("setCamera", -0.5, 0.46, 9);
await shot("east-beach", 1400);
await call("goTo", "bubbo", 2.2);
await until("bubbo describe", (x) => x.prompt?.question === "What color is it?");
await shot("bubbo-discover", 700);
await answer("itsBlue", "it's blue");
await advance("bubbo hello");
await answer("likeApples", "do you like apples");
await advance("bubbo no");
await answer("likeFish", "do you like fish");
await until("bubbo yes", lineIs(/I like fish/));
await shot("bubbo-yes", 400);
await advance("bubbo yes");
await call("goTo", "fish", 1.3);
await until("fish focus", (x) => x.focus?.kind === "food");
await page.keyboard.press("KeyE");
await until("fish in bag", (x) => (x.progress.bag.fish ?? 0) > 0);
await call("goTo", "bubbo", 1.8);
await until("bubbo focus", (x) => x.focus?.id === "bubbo");
await page.keyboard.press("KeyE");
await answer("noIDont", "no I don't");
await advance("bubbo friend");
s = await until("explore bubbo friend", (x) => x.mode === "explore" && x.progress.monsters.bubbo.friend);

// ---- river with the wrong companion, then switch
await call("goTo", "river");
await until("river focus", (x) => x.focus?.id === "river");
await shot("river-bank", 900);
await page.keyboard.press("KeyE");
await answer("canSwim", "can you swim");
await until("leafy can't", lineIs(/No, I can't/));
await shot("leafy-cant-swim", 500);
await advance("cant");
await page.keyboard.press("KeyM");
await until("journal", (x) => x.journalOpen);
await page.click("[data-testid=journal-tab-bubbo]");
await shot("journal-bubbo", 600);
await page.click("[data-testid=journal-choose]");
await until("bubbo active", (x) => x.progress.active === "bubbo" && !x.journalOpen);
await call("goTo", "river");
await until("river focus 2", (x) => x.focus?.id === "river");
await page.keyboard.press("KeyE");
await answer("canSwim", "can you swim");
await until("bubbo can", lineIs(/Yes, I can/));
await advance("bubbo can");
await answer("yesICan", "yes I can");
await until("lets go", lineIs(/Let's go/));
await page.keyboard.press("KeyE");
await page.waitForTimeout(1200);
await shot("ride", 0);
await until("stones line", lineIs(/Stepping stones/), 20_000);
await shot("stones", 300);
await advance("stones");

// ---- the ending
await call("teleport", 31, -1, 0.6);
await until("ending", (x) => x.mode === "busy", 10_000);
await page.waitForTimeout(3500);
await shot("stone-glow", 0);
await until("maple ending", lineIs(/You did it/), 30_000);
await shot("maple-ending", 600);
await advance("ending");
await until("results", (x) => x.screen === "results", 30_000);
await shot("results", 1200);
s = await state();
console.log("perf", JSON.stringify(s.perf));
console.log("said", s.progress.said.join(", "));
if (logs.length) console.log("LOGS\n" + logs.slice(0, 30).join("\n"));
await browser.close();
