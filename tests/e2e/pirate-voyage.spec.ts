// The pirate voyage end to end (docs/PIRATE_VOYAGE.md §9), in Tap mode with the
// Cloud Isle ship opened by the e2e hook: departure → capture → interrogation →
// monsters → the four jobs in a non-default order → storm → raft → Cloud Isle,
// with reload checks at `jobs` and `raft`. SHOT_TAG=<tag> also saves evidence
// screenshots to .tmp/shots/voyage/<tag>/.
import { expect, test, type Page } from "@playwright/test";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { boot, chooseMode, hook, state, tap, waitFor, type MiState } from "./helpers";
import { newProgress } from "../../src/game/logic/progress";
import { STAGES } from "../../src/game/world/lowland";
import { SHIP } from "../../src/game/world/pirateShip";
import { PHRASES } from "../../src/game/logic/english";

const TAG = process.env.SHOT_TAG;
const DIR = `.tmp/shots/voyage/${TAG}`;
const shot = async (page: Page, name: string) => { if (TAG) { await hook(page, "renderFrames", 6); await page.screenshot({ path: `${DIR}/${name}.png` }); } };
const L = (x: number, z: number) => ({ x: SHIP.x + x, z: SHIP.z + z });

function save(bag: Record<string, number>) {
  const p = newProgress();
  for (const id of ["leafy", "bubbo", "puff", "ember", "lumo"] as const)
    p.monsters[id] = { discovered: true, friend: true, asked: {}, canKnown: {}, described: { name: true, size: true, part: true }, invited: true };
  p.active = "leafy"; p.metMaple = true; p.endings = 3;
  p.solved = ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame", "canopyAscentRope", "canopyVines", "canopyRope"];
  p.act2 = { ...p.act2, started: true, lumoTaken: true, descended: true, portFound: true, bought: true, harbor: true, zone: "port" as any, checkpoint: "port",
    cleared: [...STAGES], tutorial: ["attack", "coins", "special", "eat", "rest", "switch"], coins: 100, upgrades: ["leafy", "bubbo", "puff", "ember"] };
  p.bag = bag as any;
  return { v: 4, progress: p, player: { x: 71.5, z: -315.5, yaw: Math.PI }, seconds: 3000 };
}

type V = any;
const voyage = (page: Page): Promise<V> => hook(page, "voyage") as Promise<V>;

/** Stand at a ship spot (local), facing a world point. */
async function standFacing(page: Page, local: { x: number; z: number }, at: { x: number; z: number }) {
  const s = L(local.x, local.z);
  await hook(page, "teleport", s.x, s.z, Math.atan2(at.x - s.x, at.z - s.z), true);
}
/** Stand near a world point (the game snaps to the nearest walkable spot), facing it. */
async function nearFacing(page: Page, at: { x: number; z: number }, from: { x: number; z: number }, dist = 1.2) {
  const dx = from.x - at.x, dz = from.z - at.z, d = Math.hypot(dx, dz) || 1;
  const x = at.x + (dx / d) * dist, z = at.z + (dz / d) * dist;
  await hook(page, "teleport", x, z, Math.atan2(at.x - x, at.z - z), true);
}
async function pressJ(page: Page) { await page.keyboard.press("KeyJ"); await page.waitForTimeout(120); }
/** Talk to whatever E targets once the focus is this one. */
async function pressE(page: Page, focus: string) {
  await waitFor(page, (s) => s.focus?.id === focus && s.mode === "explore", 10_000, `focus ${focus}`);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(150);
}

const FOOD_WORDS = ["apples", "bananas", "fish", "berries", "meat"];
const ITEM = { "red barrel": "barrel", "blue bag": "bag", "green bottle": "bottle" } as Record<string, string>;
const PLACE: Record<string, string> = { "on table": "onTheTable", "under table": "underTheTable", "on shelf": "onTheShelf", "under shelf": "underTheShelf", "in box": "inTheBox", "by door": "byTheDoor" };
const putTask = (title: string) => { const m = /Put the (red barrel|blue bag|green bottle) (on|under|in|by) the (table|shelf|box|door)!/.exec(title ?? ""); return m ? { item: ITEM[m[1]], prep: m[2], furniture: m[3] } : null; };

/** Answer the open prompt truthfully from the real state (bag, hands, hold, lanes). */
async function answer(page: Page, st: MiState) {
  const p = st.prompt!, q = p.question ?? "", c = p.choices;
  const v = await voyage(page);
  // A command shows its sentence among distractor buttons: tap the one that says it.
  let pick = (p.kind === "command" ? c.find((id) => (PHRASES as any)[id]?.en === p.sentences[0]) : undefined) ?? c[0];
  if (p.kind === "command") { /* the sentence decides */ }
  else if (c.includes("yesIDo")) {
    const food = FOOD_WORDS.find((f) => q.includes(f));
    const held = v.carry?.kind === "food" && v.carry.food === food;
    pick = held || ((st.progress.bag as any)[food!] ?? 0) > 0 ? "yesIDo" : "noIDont";
  } else if (c.includes("yesTheyCan")) pick = "yesTheyCan";
  else if (c.includes("yesPlease")) pick = "yesPlease";
  else if (c.includes("turnLeft")) {
    if (q.includes("island is on the left")) pick = "turnLeft";
    else if (q.includes("island is on the right")) pick = "turnRight";
    else {
      const o = v.obstacles[0];
      pick = !o || o.lane !== v.lane ? "goStraight" : v.lane === 1 ? "turnLeft" : "turnRight";
    }
  } else if (c.includes("onTheTable") && c.length === 2 || c.includes("onTheShelf") && c.length === 2) {
    const t = putTask(v.hud?.title);
    pick = c.find((id) => id.toLowerCase().startsWith(t?.prep ?? "on")) ?? c[0];
  } else if (q.startsWith("Where is")) {
    const name = Object.keys(ITEM).find((n) => q.includes(n))!;
    const pl = v.cargo[ITEM[name]];
    pick = PLACE[`${pl.prep} ${pl.furniture}`];
  }
  await tap(page, pick);
}

/**
 * Play until `done`: answer prompts, and in free play do what the running phase
 * needs (`free`). Lines advance by themselves in fast mode.
 */
async function drive(page: Page, label: string, done: (s: MiState, v: V) => boolean, free: (s: MiState, v: V) => Promise<void> = async () => {}, timeout = 300_000) {
  const t0 = Date.now();
  let wrong = 0, wasWrong = false, told = 0;
  for (;;) {
    const s = await state(page), v = await voyage(page);
    if (done(s, v)) return { s, v };
    if (Date.now() - told > 10_000) {
      told = Date.now();
      console.log(`[${label}] ${Math.round((Date.now() - t0) / 1000)}s mode=${s.mode} phase=${v.phase} focus=${s.focus?.id} prompt=${s.prompt ? `${s.prompt.kind}:${s.prompt.status}:${s.prompt.choices.join("/")}` : "-"} line=${s.line?.en ?? "-"} hud=${v.hud?.title ?? "-"} carry=${JSON.stringify(v.carry)} at=${s.player.x.toFixed(1)},${s.player.z.toFixed(1)},${s.player.y.toFixed(2)}`);
    }
    if (Date.now() - t0 > timeout) throw new Error(`timed out: ${label} ${JSON.stringify({ mode: s.mode, line: s.line, prompt: s.prompt, phase: v.phase, hud: v.hud, player: s.player })}`);
    const isWrong = s.prompt?.status === "wrong";
    if (isWrong && !wasWrong && ++wrong > 3) throw new Error(`wrong answers: ${label} ${JSON.stringify({ prompt: s.prompt, phase: v.phase, hud: v.hud })}`);
    wasWrong = isWrong;
    if (s.prompt?.buttons && s.prompt.status === "ready") { await answer(page, s); continue; }
    if (s.mode === "explore") await free(s, v);
    await page.waitForTimeout(80);
  }
}

// ------------------------------------------------------------ free play, per phase

const JOB_SPOT: Record<string, { crew: string; stand: { x: number; z: number } }> = {
  cargo: { crew: "bill", stand: { x: 0.6, z: -3.9 } }, sailing: { crew: "redbeard", stand: { x: -1.4, z: 10.3 } },
  fishing: { crew: "finn", stand: { x: 0.0, z: 16.7 } }, cooking: { crew: "pepper", stand: { x: 0.2, z: -14.4 } },
};
const FURN_STAND: Record<string, { x: number; z: number }> = { table: { x: 0.2, z: -5.7 }, shelf: { x: -1.4, z: -5.7 }, box: { x: 2.4, z: -2.5 }, door: { x: -1.2, z: -6.6 } };
const FURN_AT: Record<string, { x: number; z: number }> = { table: { x: 1.4, z: -5.7 }, shelf: { x: -2.5, z: -5.7 }, box: { x: 1.4, z: -2.6 }, door: { x: -1.2, z: -7.55 } };
const SAIL_AT = [{ x: 0.4, z: 10.5 }, { x: 1.2, z: 5.2 }, { x: -0.1, z: -8.6 }];
const SAIL_STAND = [{ x: 0, z: 6.0 }, { x: 0, z: 6.0 }, { x: 0, z: -11.6 }];
const HUNGRY_STAND: Record<string, { x: number; z: number }> = { tom: { x: 0.0, z: -9.6 }, sam: { x: 0.0, z: -11.7 }, max: { x: 1.4, z: -12.45 } };
const CRATE_Z: Record<string, number> = { fish: -15.9, meat: -15.1, apples: -14.3, bananas: -13.6 };

async function startJob(page: Page, job: string) {
  const j = JOB_SPOT[job];
  const s = L(j.stand.x, j.stand.z);
  const v = await voyage(page);
  await standFacing(page, j.stand, v.crew[j.crew]);
  void s;
  await pressE(page, `crew:${j.crew}`);
}

let heatHeld = false;
async function play(page: Page, _s: MiState, v: V) {
  switch (v.phase) {
    case "fishing": {
      const fish = v.fish.filter((f: any) => f.state === "swim" && !f.boot);
      const p = L(0, 16.7);
      const f = fish.sort((a: any, b: any) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      if (!f) return;
      await standFacing(page, { x: 0, z: 16.7 }, f);
      await pressJ(page);
      await page.waitForTimeout(500);
      return;
    }
    case "cooking": {
      const c = v.cook;
      if (!c.lit) { await standFacing(page, { x: 0, z: -15.2 }, L(0, -16.5)); await pressJ(page); return; }
      if (c.pot) {
        // Keep Ember's fire in the green band: hold J, let go near the top, hold again.
        await standFacing(page, { x: 0, z: -15.2 }, L(0, -16.5));
        if (!heatHeld && c.heat < 0.66) { await page.keyboard.down("KeyJ"); heatHeld = true; }
        else if (heatHeld && c.heat > 0.76) { await page.keyboard.up("KeyJ"); heatHeld = false; }
        return;
      }
      if (heatHeld) { await page.keyboard.up("KeyJ"); heatHeld = false; }
      if (c.dish && !v.carry) { await standFacing(page, { x: -0.5, z: -15.4 }, L(0, -16.5)); await pressE(page, "pot"); return; }
      if (v.carry?.kind === "dish" && c.order) { await standFacing(page, HUNGRY_STAND[c.order.who], v.crew[c.order.who]); await pressE(page, `crew:${c.order.who}`); return; }
      if (v.carry?.kind === "food") { await standFacing(page, { x: -0.5, z: -15.4 }, L(0, -16.5)); await pressE(page, "pot"); return; }
      if (c.order && !v.carry) { const z = CRATE_Z[c.order.food]; await standFacing(page, { x: -1.2, z }, L(-2.1, z)); await pressE(page, `crate:${c.order.food}`); return; }
      const next = ["tom", "sam", "max"].find((id) => !c.orders.some((o: any) => o.who === id));
      if (next) { await standFacing(page, HUNGRY_STAND[next], v.crew[next]); await pressE(page, `crew:${next}`); }
      return;
    }
    case "cargo": {
      const t = putTask(v.hud?.title);
      if (!t) return;
      if (v.carry?.kind === "cargo") {
        await standFacing(page, FURN_STAND[t.furniture], L(FURN_AT[t.furniture].x, FURN_AT[t.furniture].z));
        await pressE(page, `furn:${t.furniture}`);
        return;
      }
      const at = v.items[t.item];
      await nearFacing(page, at, L(0, -4.5), 1.0);
      await pressJ(page);
      return;
    }
    case "sails": {
      const i = v.sails.findIndex((x: number) => x < 0.99);
      if (i < 0) return;
      await standFacing(page, SAIL_STAND[i], L(SAIL_AT[i].x, SAIL_AT[i].z));
      await pressJ(page);
      return;
    }
    case "storm-barrels": {
      const b = v.barrels.find((x: any) => !x.tied);
      if (!b) return;
      await nearFacing(page, b, L(0, 5.5), 0.9);
      await pressJ(page);
      return;
    }
    case "storm-fires": {
      const f = v.fires.find((x: any) => !x.out);
      if (!f) return;
      await nearFacing(page, f, L(0, 4), 1.3);
      await pressJ(page);
      await page.waitForTimeout(500);
      return;
    }
    case "storm-sail": {
      await standFacing(page, { x: 0, z: 5.2 }, L(0.8, 3.2));
      if (!heatHeld) { await page.keyboard.down("KeyJ"); heatHeld = true; }
      return;
    }
    case "storm-spar": {
      if (heatHeld) { await page.keyboard.up("KeyJ"); heatHeld = false; }
      await standFacing(page, { x: -1.0, z: -10.0 }, v.spar ?? L(-1.6, -11.1));
      await pressJ(page);
      await page.waitForTimeout(400);
      return;
    }
    case "raft-planks": { await pressJ(page); await page.waitForTimeout(600); return; }
    default:
      if (heatHeld) { await page.keyboard.up("KeyJ"); heatHeld = false; }
  }
}

async function continueSaved(page: Page) {
  await page.reload();
  await expect(page.getByTestId("title")).toBeVisible();
  await page.getByTestId("btn-continue").click();
  await waitFor(page, (s) => s.mode === "explore" || Boolean(s.prompt) || Boolean(s.line), 90_000, "continued");
  await hook(page, "openCloudShip", true);
  await hook(page, "openPirateVoyage", true);
}

test.use({ actionTimeout: 15_000 });

test("the pirate voyage, from the harbour to Cloud Isle", async ({ page }) => {
  test.setTimeout(Number(process.env.MI_LONG_TIMEOUT ?? 3_600_000));
  const bag = { apples: 2, fish: 1 };
  await page.addInitScript((v) => { if (!localStorage.getItem("mi.save.v4")) localStorage.setItem("mi.save.v4", v); }, JSON.stringify(save(bag)));
  const errors = await boot(page, "fast=1");
  await chooseMode(page, "tap");
  await page.getByTestId("btn-continue").click();
  await waitFor(page, (s) => s.mode === "explore", 90_000, "loaded");
  await hook(page, "openCloudShip", true);
  await hook(page, "openPirateVoyage", true);

  // Departure, capture, interrogation, the monsters.
  await hook(page, "goTo", "harbor", 1.4);
  await waitFor(page, (s) => s.focus?.id === "harbor" && s.mode === "explore", 15_000, "at Gull");
  await page.keyboard.press("KeyE");
  await waitFor(page, (s) => Boolean(s.prompt?.choices.includes("yesIAm")), 30_000, "Are you ready?");
  await shot(page, "01-ready");
  let sawFoodQuestion = false;
  await drive(page, "capture and interrogation", (s) => s.progress.act3.voyage.stage === "captured" && s.mode === "explore", async () => {}, 240_000)
    .then(({ s }) => { sawFoodQuestion = s.progress.act3.voyage.interrogated; });
  expect(sawFoodQuestion).toBe(true);
  let st = await state(page);
  // The pirates took exactly one food that the player really had.
  const before = bag.apples + bag.fish, after = Object.values(st.progress.bag as Record<string, number>).reduce((a, b) => a + b, 0);
  expect(after).toBe(before - 1);
  expect((await voyage(page)).active).toBe(true);
  await shot(page, "02-free-roam");

  // The four jobs, in a non-default order: cargo, sailing, fishing, cooking.
  const order = ["cargo", "sailing", "fishing", "cooking"];
  for (const job of order) {
    await drive(page, `before ${job}`, (s, v) => s.mode === "explore" && !v.phase, async () => {}, 120_000);
    await startJob(page, job);
    let snapped = false;
    await drive(page, job, (s) => s.progress.act3.voyage.jobs.includes(job), async (s, v) => {
      if (!snapped && v.phase) { snapped = true; await shot(page, `job-${job}`); }
      await play(page, s, v);
    }, Number(process.env.VOYAGE_JOB_TIMEOUT ?? 420_000));
    st = await state(page);
    expect(st.progress.act3.voyage.jobs).toContain(job);

    if (job === "cargo") {
      // Reload at `jobs`: the ship comes back with the job kept and no food taken twice.
      await drive(page, "after cargo", (s, v) => s.mode === "explore" && !v.phase, async () => {}, 120_000);
      const bagBefore = JSON.stringify((await state(page)).progress.bag);
      await page.waitForTimeout(5500); // the 5 s autosave holds the deck spot
      await continueSaved(page);
      st = await waitFor(page, (s) => s.mode === "explore", 60_000, "resumed on the ship");
      expect(st.progress.act3.voyage.stage).toBe("jobs");
      expect(st.progress.act3.voyage.jobs).toEqual(["cargo"]);
      expect(JSON.stringify(st.progress.bag)).toBe(bagBefore);
      const v = await voyage(page);
      expect(v.active).toBe(true);
      expect(Math.abs(st.player.x - SHIP.x)).toBeLessThan(7);
      expect(Math.abs(st.player.z - SHIP.z)).toBeLessThan(21);
      expect(st.player.y).toBeGreaterThan(0);
    }
  }

  // The finale: the hat, then the storm's four emergencies and the break-up.
  let stormShots = 0;
  await drive(page, "storm", (s) => s.progress.act3.voyage.stage === "raft", async (s, v) => {
    if (v.phase?.startsWith("storm") && stormShots < 4 && v.phase !== (play as any).last) { (play as any).last = v.phase; stormShots++; await shot(page, `storm-${stormShots}-${v.phase}`); }
    await play(page, s, v);
  }, 900_000);
  if (heatHeld) { await page.keyboard.up("KeyJ"); heatHeld = false; }
  st = await state(page);
  expect(st.progress.act3.voyage.hat).toBe(true);
  expect(st.progress.act2.wardrobe.owned).toContain("captainHat");

  // Reload at `raft`: the raft stage restarts from its start.
  await drive(page, "raft begins", (_s, v) => v.raft.on && v.phase === "raft-planks", async () => {}, 120_000);
  await page.waitForTimeout(5500);
  await continueSaved(page);
  await drive(page, "raft resumed", (_s, v) => v.raft.on && v.phase === "raft-planks", async () => {}, 120_000);
  expect((await state(page)).progress.act3.voyage.stage).toBe("raft");
  await shot(page, "raft-planks");

  // The raft, Bubbo's tow, Puff's sail, and the landing on Cloud Isle.
  let raftShot = false;
  await drive(page, "raft and landing", (s) => s.progress.act3.world === "cloud" && s.progress.act3.voyageDone && s.mode === "explore", async (s, v) => {
    if (!raftShot && v.raft.built === 3) { raftShot = true; await shot(page, "raft-built"); }
    await play(page, s, v);
  }, 600_000);
  st = await state(page);
  expect(st.progress.act3.voyage.stage).toBe("done");
  expect(st.progress.act3.voyageDone).toBe(true);
  await shot(page, "zz-cloud-isle");
  expect(errors.filter((e) => !/favicon|ResizeObserver/.test(e))).toEqual([]);
});
