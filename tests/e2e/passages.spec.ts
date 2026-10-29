import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { boot, chooseMode, hook, state, waitFor, type MiState } from "./helpers";

type Point = { x: number; z: number };
type Mouth = Point & {
  id: string; from: string; to: string; nx: number; nz: number; open: boolean;
  approach: Point; arrival: Point; trigger: Point;
};
type Snapshot = MiState & {
  passages: Mouth[];
  passage: { active: boolean; from: string | null; to: string | null; last: string | null; serial: number; cooldownUntil: number };
};
const snapshot = async (page: Page) => (await state(page)) as Snapshot;
const STAGES = ["forest1", "grove", "canopy", "causeway", "coast"];
const friends = Object.fromEntries(["leafy", "bubbo", "puff", "ember", "lumo"].map(id => [id, {
  discovered: true, friend: true, asked: {}, canKnown: {}, described: { name: true, size: true, part: true }, invited: true
}]));
function save(cleared = STAGES, shortcut = true, legacy = false) {
  return JSON.stringify({
    v: 4,
    progress: {
      monsters: friends, active: "leafy", bag: { apples: 3, fish: 2 },
      solved: ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame", "canopyVines", "canopyRope", "groveLilies", ...(shortcut ? ["causewayGate"] : [])],
      metMaple: true, endings: 3, said: [],
      act2: {
        started: true, lumoTaken: true, descended: true, hp: 100,
        mp: { leafy: 68, bubbo: 72, puff: 81, ember: 89 }, coins: 83, items: { amber: 2 }, upgrades: ["leafy"],
        chests: ["forestChest"], tutorial: ["attack", "coins", "special", "eat", "rest", "switch"],
        checkpoint: "port", portFound: true, bought: true, harbor: true, trained: ["leafy"], zone: "port", cleared: legacy ? undefined : cleared
      }
    },
    player: { x: 77, z: -300, yaw: Math.PI }, seconds: 3300
  });
}
async function start(page: Page, cleared = STAGES, shortcut = true, legacy = false) {
  await page.addInitScript(text => {
    if (!sessionStorage.getItem("passages-seeded")) {
      localStorage.setItem("mi.save.v4", text); sessionStorage.setItem("passages-seeded", "1");
    }
  }, save(cleared, shortcut, legacy));
  const errors = await boot(page);
  await chooseMode(page, "tap"); await page.getByTestId("btn-continue").click();
  await waitFor(page, s => s.screen === "game" && s.mode === "explore");
  return errors;
}
async function mouth(page: Page, from: string, to: string) {
  const e = (await snapshot(page)).passages.find(e => e.from === from && e.to === to);
  if (!e) throw new Error(`missing entrance ${from} → ${to}`);
  return e;
}
async function approach(page: Page, e: Mouth) {
  // Passage checks isolate movement from combat damage; combat remains tested by expansion.spec.
  await hook(page, "setHp", 100);
  await hook(page, "teleport", e.approach.x, e.approach.z);
  await hook(page, "follow");
  await hook(page, "setCamera", Math.atan2(-e.nx, -e.nz), .34, 6);
  await waitFor(page, s => s.act2.zone === e.from && s.mode === "explore", 10000, `approach ${e.id}`);
  // Let the camera and any preceding mouth cooldown settle before real input.
  await page.waitForTimeout(1100);
}
async function travel(page: Page, e: Mouth, holdAfterArrival = false, hp = 100) {
  await approach(page, e);
  await hook(page,"setHp",hp);
  const before = (await snapshot(page)).passage.serial;
  await page.keyboard.down("ArrowUp");
  try {
    await waitFor(page, s => {
      const p = (s as Snapshot).passage;
      return p.serial > before && !p.active && s.mode === "explore" && s.act2.zone === e.to;
    }, 15000, `walk through ${e.id}`);
    if (holdAfterArrival) {
      const t = (await snapshot(page)).playTime;
      await waitFor(page, s => s.playTime > t + 1.1, 10000, "held key after arrival");
      const s = await snapshot(page);
      expect(s.act2.zone).toBe(e.to); expect(s.passage.serial).toBe(before + 1);
      const destination=s.passages.find(p=>p.from===e.to && p.to===e.from)!;
      const depth=(s.player.x-destination.x)*destination.nx+(s.player.z-destination.z)*destination.nz;
      expect(depth,'held forward walks away from the arrival mouth').toBeLessThan(-2.2);
    }
  } finally { await page.keyboard.up("ArrowUp"); }
  return snapshot(page);
}

test("all physical links traverse in both directions by walking, including legacy town backtracking", async ({ page }) => {
  test.setTimeout(240000);
  const errors = await start(page, STAGES, true, true);
  const ends = (await snapshot(page)).passages;
  expect(ends).toHaveLength(18);
  const visited: string[] = [];
  for (const e of ends) {
    expect(e.open, e.id).toBe(true);
    const s = await travel(page, e, visited.length === 0);
    expect(s.progress.act2.cleared).toEqual(STAGES);
    expect(s.progress.act2.coins).toBe(83);
    expect(s.progress.bag).toEqual({ apples: 3, fish: 2 });
    expect(s.progress.act2.items.amber).toBe(2);
    expect(s.progress.act2.upgrades).toEqual(["leafy"]);
    expect(s.player.y).toBeGreaterThanOrEqual(s.player.ground - .05);
    visited.push(e.id);
  }
  expect(new Set(visited).size).toBe(18);
  expect(errors).toEqual([]);
});

test("first-clear locks, retreat, shortcut locking and reload preserve travel rights", async ({ page }) => {
  test.setTimeout(180000);
  const errors = await start(page, [], false);
  for (const [from,to] of [["forest1","camp"],["grove","causeway"],["canopy","causeway"],["causeway","coast"],["coast","port"],["oldTrail","causeway"],["causeway","oldTrail"]]) {
    const e = await mouth(page, from, to);
    expect(e.open, e.id).toBe(false);
    await approach(page, e);
    const serial = (await snapshot(page)).passage.serial;
    await page.keyboard.down("ArrowUp"); await page.waitForTimeout(1300); await page.keyboard.up("ArrowUp");
    const s = await snapshot(page);
    expect(s.act2.zone, e.id).toBe(from); expect(s.passage.serial, e.id).toBe(serial);
  }
  // Enter either optional branch from its far side without claiming a first clear.
  // Its arrival mouth stays usable for this visit, including after a reload.
  for (const branch of ["grove", "canopy"]) {
    const reverse = await mouth(page, "causeway", branch);
    expect(reverse.open).toBe(true);
    await travel(page, reverse);
    expect((await snapshot(page)).progress.act2.cleared).toEqual([]);
    expect((await mouth(page, branch, "causeway")).open).toBe(true);
    await page.reload(); await page.getByTestId("btn-continue").click();
    await waitFor(page, s => s.mode === "explore" && s.screen === "game" && s.act2.zone === branch);
    expect((await mouth(page, branch, "causeway")).open).toBe(true);
    // Resume outside the opaque pocket, then walk straight back through normally.
    const s = await snapshot(page);
    expect(Math.hypot(s.player.x-reverse.arrival.x,s.player.z-reverse.arrival.z)).toBeLessThan(.6);
    await travel(page, await mouth(page, branch, "causeway"));
    expect((await snapshot(page)).progress.act2.cleared).toEqual([]);
    expect((await mouth(page, branch, "causeway")).open).toBe(false);
  }
  // The ordinary entrance back to camp is always available too.
  const retreat = await mouth(page, "grove", "camp");
  expect(retreat.open).toBe(true); await travel(page, retreat);
  await page.reload(); await page.getByTestId("btn-continue").click();
  await waitFor(page, s => s.mode === "explore" && s.screen === "game");
  expect((await snapshot(page)).progress.act2.cleared).toEqual([]);
  expect((await mouth(page, "forest1", "camp")).open).toBe(false);
  expect((await mouth(page, "grove", "camp")).open).toBe(true);
  expect(errors).toEqual([]);
});

test("mounts, safe-area followers, touch walking and opaque entrance captures", async ({ page }) => {
  test.setTimeout(180000);
  const errors = await start(page);
  mkdirSync(".tmp/shots/passages", { recursive: true });
  const report: unknown[] = [];
  const forward = await mouth(page, "grove", "causeway");
  for (const [key,id] of [[2,"bubbo"],[4,"ember"]] as const) {
    await approach(page, forward); await page.keyboard.press(`Digit${key}`);
    await waitFor(page, s => s.act2.stance.friend === id && s.act2.stance.k > .99);
    const s = await travel(page, forward);
    expect(s.act2.stance.friend).toBe(id); expect(s.act2.stance.k).toBeGreaterThan(.99);
    expect(s.player.y - s.player.ground).toBeGreaterThan(.6);
    expect(Object.entries(s.monsters).filter(([,m]) => m.visible).map(([id]) => id)).toEqual([id]);
  }
  const camp = await mouth(page, "forest1", "camp");
  let s = await travel(page, camp);
  await waitFor(page, s => s.act2.stance.friend === null);
  s = await snapshot(page);
  expect(Object.entries(s.monsters).filter(([,m]) => m.visible).map(([id]) => id).sort()).toEqual(["bubbo","ember","leafy","puff"]);
  const campMouth=await mouth(page,'camp','forest1');
  await page.waitForTimeout(900);
  for(const m of Object.values((await snapshot(page)).monsters).filter(m=>m.visible))
    expect((m.x-campMouth.x)*campMouth.nx+(m.z-campMouth.z)*campMouth.nz,'followers stay outside the arrival chamber').toBeLessThan(-.8);

  // Use actual joystick pointer events; no E/confirmation is needed.
  await hook(page, "set", { touch: true });
  const touchEnd = await mouth(page, "camp", "grove"); await approach(page, touchEnd);
  const serial = (await snapshot(page)).passage.serial;
  const stick = await page.getByTestId("joystick").boundingBox();
  if (!stick) throw new Error("joystick unavailable");
  const cx = stick.x + stick.width / 2, cy = stick.y + stick.height / 2;
  await page.mouse.move(cx,cy); await page.mouse.down(); await page.mouse.move(cx,cy-55);
  try {
    await waitFor(page, s => (s as Snapshot).passage.serial > serial && s.mode === "explore" && s.act2.zone === "grove",15000,"joystick passage");
  } finally { await page.mouse.up(); }
  await hook(page, "set", { touch: false });

  // Travel carries partially depleted vitals instead of restoring them.
  await hook(page,"setMp","leafy",28);
  const carried=await travel(page,await mouth(page,"camp","canopy"),false,43);
  expect(carried.act2.hp).toBe(43);
  expect(carried.act2.mp.leafy).toBeGreaterThanOrEqual(28);
  expect(carried.act2.mp.leafy).toBeLessThan(40);
  await page.keyboard.press('Digit1');
  await waitFor(page,s=>s.act2.stance.friend==='leafy' && s.act2.stance.k>.99);

  for (const [width,height] of [[1366,768],[1280,800]]) {
    await page.setViewportSize({width,height});
    // Capture the same substantial shell with the root gate locked and open.
    for (const locked of [true,false]) {
      const p = (await snapshot(page)).progress;
      await hook(page,"set",{progress:{...p,act2:{...p.act2,cleared:locked?[]:STAGES}}});
      const e = await mouth(page,"forest1","camp"); await approach(page,e);
      await hook(page,"set",{mode:"busy"}); await page.waitForTimeout(1600);
      await page.screenshot({path:`.tmp/shots/passages/${locked?"locked":"unlocked"}-${width}.png`});
      await hook(page,"set",{mode:"explore"});
    }
    await travel(page,await mouth(page,"forest1","camp"));
    await page.waitForTimeout(800);
    await page.screenshot({path:`.tmp/shots/passages/arrival-${width}.png`});
    report.push({width,height,state:{zone:(await snapshot(page)).act2.zone,perf:(await snapshot(page)).perf}});
  }
  writeFileSync(".tmp/shots/passages/report.json",JSON.stringify(report,null,2));
  expect(errors).toEqual([]);
});
