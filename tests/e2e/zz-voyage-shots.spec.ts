// Controller evidence only (not part of the suite): SHOT_TAG=v1 npx playwright test zz-voyage-shots
// The pirate voyage (docs/PIRATE_VOYAGE.md): the ship, its decks and crew.
import { test, type Page } from "@playwright/test";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { boot, chooseMode, hook, state, tap, waitFor } from "./helpers";
import { newProgress } from "../../src/game/logic/progress";
import { STAGES } from "../../src/game/world/lowland";
import { COUNTER_CUSTOMER, DECK_Y, FISH_LANDING_Z, FISH_Y, HOLD, HOLD_PORTAL, HOLD_RAMP, SHIP, STERN_RAMP, SUPPLY_CRATES, crateApproach } from "../../src/game/world/pirateShip";
import { PHRASES } from "../../src/game/logic/english";

const TAG = process.env.SHOT_TAG ?? "v1";
const DIR = `.tmp/shots/voyage/${TAG}`;
const ONLY = process.env.SHOT_ONLY;
test.skip(!process.env.SHOT_TAG && !ONLY, "controller evidence run only");

function save(bag: Record<string, number> = {}) {
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
const snap = (page: Page, name: string) => page.screenshot({ path: `${DIR}/${name}.png` });
const L = (x: number, z: number) => ({ x: SHIP.x + x, z: SHIP.z + z });

async function shotReady(page: Page, label: string, ready: Parameters<typeof waitFor>[1]) {
  try {
    await waitFor(page, ready, 15_000, label);
  } catch (error) {
    throw new Error(`HARNESS_PRECONDITION_FAILED - ${label}`, { cause: error });
  }
}

async function boardForShots(page: Page) {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.addInitScript(v => { if (!localStorage.getItem("mi.save.v4")) localStorage.setItem("mi.save.v4", v); }, JSON.stringify(save()));
  await boot(page, "fast=1");
  await chooseMode(page, "tap");
  await page.getByTestId("btn-continue").click();
  await shotReady(page, "loaded the save", s => s.mode === "explore");
  await hook(page, "voyageJump", "jobs");
  await shotReady(page, "on the pirate ship", s => s.mode === "explore" && s.camera.profile === "pirate-ship");
}

test("fishing stairs and galley polish", async ({ page }) => {
  test.skip(Boolean(ONLY) && ONLY !== "hold" && ONLY !== "galley");
  await boardForShots(page);
  const landing = L((STERN_RAMP.x0 + STERN_RAMP.x1) / 2, FISH_LANDING_Z);
  await hook(page, "teleport", landing.x, landing.z + 1, Math.PI, true);
  await shotReady(page, "standing on the fishing platform", s => Math.abs(s.player.y - FISH_Y) < 0.03);
  const angles = [[-3, 2.0, 3.2], [0.2, 2.6, 4.0], [3.3, 2.0, 2.5], [3.0, 1.55, 2.3], [2.7, 1.3, 2.1]];
  for (const [i, [dx, dy, dz]] of angles.entries()) {
    const angle = [landing.x + dx, FISH_Y + dy, landing.z + dz];
    await hook(page, "look", angle, [landing.x, FISH_Y + 0.18, landing.z + 0.18]);
    await shotReady(page, `fishing lens ${i + 1}`, s => Math.abs(s.camera.pos.x - angle[0]) < 0.08 && Math.abs(s.camera.pos.z - angle[2]) < 0.08);
    await snap(page, `fishing-landing-${i + 1}`);
  }
  await hook(page, "follow");
  const front = crateApproach(SUPPLY_CRATES[2], 2.6);
  const galley = L(front.x, SUPPLY_CRATES[3].z + 1.2);
  await hook(page, "teleport", galley.x, galley.z, Math.PI, true);
  await shotReady(page, "galley approach in follow view", s => s.camera.mode === "follow" && Math.abs(s.player.x - galley.x) < 0.1 && Math.abs(s.player.z - galley.z) < 0.1);
  await snap(page, "galley-crate-labels");
  const customer = L(COUNTER_CUSTOMER.x, COUNTER_CUSTOMER.z);
  await hook(page, "teleport", customer.x, customer.z, Math.PI, true);
  await shotReady(page, "Cook Pepper within reach across the counter", s => s.focus?.id === "crew:pepper");
  await snap(page, "galley-pepper-counter");
});

test("covered hold and walking through the companionway", async ({ page }) => {
  test.skip(Boolean(ONLY) && ONLY !== "hold");
  test.setTimeout(90_000);
  await boardForShots(page);
  const aboveHold = L(0.4, (HOLD.z0 + HOLD.z1) / 2);
  await hook(page, "teleport", aboveHold.x, aboveHold.z, Math.PI, true);
  await shotReady(page, "walking over the covered hold", s => Math.abs(s.player.y - DECK_Y) < 0.03 && s.camera.profile === "pirate-ship");
  await snap(page, "hold-covered-deck");
  const x = (HOLD_RAMP.x0 + HOLD_RAMP.x1) / 2;
  const entry = L(x, HOLD_RAMP.z1 + 0.6);
  await hook(page, "teleport", entry.x, entry.z, Math.PI, true);
  await shotReady(page, "at the open end of the companionway", s => Math.abs(s.player.x - entry.x) < 0.08 && Math.abs(s.player.z - entry.z) < 0.08);
  await hook(page, "timeScale", 0.32);
  await snap(page, "hold-down-01-coaming");
  async function step(name: string, z: number, inside: boolean, down: boolean) {
    await shotReady(page, name, s => (down ? s.player.z <= SHIP.z + z : s.player.z >= SHIP.z + z) &&
      (inside ? s.camera.profile === "pirate-hold" : s.camera.profile === "pirate-ship"));
    await snap(page, name);
  }
  await page.keyboard.down("ArrowUp");
  try {
    await step("hold-down-02-treads", HOLD_RAMP.z1 - 0.55, false, true);
    await step("hold-down-03-transition", HOLD_PORTAL.enterZ - 0.04, true, true);
    await step("hold-down-04-landing", HOLD_RAMP.z0 - 0.6, true, true);
    await step("hold-down-05-interior", -3.45, true, true);
  } finally {
    await page.keyboard.up("ArrowUp");
  }
  await page.keyboard.down("ArrowDown");
  try {
    await step("hold-up-01-interior", -2.55, true, false);
    await step("hold-up-02-treads", HOLD_PORTAL.exitZ - 0.28, true, false);
    await step("hold-up-03-transition", HOLD_PORTAL.exitZ + 0.04, false, false);
    await step("hold-up-04-coaming", HOLD_RAMP.z1 + 0.42, false, false);
  } finally {
    await page.keyboard.up("ArrowDown");
    await hook(page, "timeScale", 1);
  }
});

test("the pirate ship", async ({ page }) => {
  test.skip(Boolean(ONLY) && ONLY !== "ship");
  test.setTimeout(600_000);
  await page.addInitScript(v => { if (!localStorage.getItem("mi.save.v4")) localStorage.setItem("mi.save.v4", v); }, JSON.stringify(save()));
  await boot(page, "fast=1");
  await chooseMode(page, "tap");
  await page.getByTestId("btn-continue").click();
  await waitFor(page, st => st.mode === "explore", 90_000, "loaded");
  await page.setViewportSize({ width: 1366, height: 768 });
  await hook(page, "voyageShow", true);
  for (const [name, x, z] of [["deck-stern", 0, 6], ["deck-mid", 0.5, -10.5], ["deck-over-hold", 0, -4.5], ["galley", 0, -14.5], ["fishing", 0.3, 17], ["quarterdeck", 0, 9]] as const) {
    const w = L(x, z);
    await hook(page, "follow");
    await hook(page, "teleport", w.x, w.z, Math.PI, true);
    await hook(page, "renderFrames", 40);
    await snap(page, name);
    const s = await state(page) as any;
    console.log(`${name}: profile=${s.camera?.profile} calls=${s.perf?.calls} tris=${s.perf?.triangles} y=${s.player?.y?.toFixed(2)}`);
  }
  const side = L(0, 0);
  await hook(page, "look", [side.x + 26, 9, side.z + 6], [side.x, 4, side.z - 2]);
  await hook(page, "renderFrames", 30);
  await snap(page, "side");
  await hook(page, "look", [side.x - 10, 14, side.z + 34], [side.x, 3, side.z - 2]);
  await hook(page, "renderFrames", 30);
  await snap(page, "stern-high");
});

/** Story beats worth a frame, by their line (normal speed: lines wait for Space). */
const BEATS: Record<string, string> = {
  "Let's go!": "c1-lets-go", "What a nice day! The sea is calm.": "c2-departure", "Look! A ship!": "c3-ship-ahead",
  "Use the spyglass!": "c3b-use-spyglass", "Yes! A big ship with red sails...": "c3c-spyglass-view",
  "Red sails... It's a pirate ship! Oh no! Pirates!": "c3d-pirates", "Oh no! The ship is in the way!": "c3e-blocked",
  "Stop! Stop that boat!": "c4-stop", "Ropes, crew! Pull them in!": "c5-ropes", "Bring them here!": "c5b-alongside", "Ahoy! I'm Captain Redbeard!": "c6-aboard",
  "Monster soup!": "c8-monster-soup", "Okay! Show me!": "c9-show-me",
};

test("departure, capture, interrogation and the monsters (normal speed)", async ({ page }) => {
  test.skip(Boolean(ONLY) && ONLY !== "capture");
  test.setTimeout(900_000);
  const bag: Record<string, number> = { apples: 2, fish: 1 };
  await page.addInitScript(v => { if (!localStorage.getItem("mi.save.v4")) localStorage.setItem("mi.save.v4", v); }, JSON.stringify(save(bag)));
  await boot(page, "");
  await chooseMode(page, "tap");
  await page.getByTestId("btn-continue").click();
  await waitFor(page, st => st.mode === "explore", 90_000, "loaded");
  await hook(page, "openCloudShip", true);
  await hook(page, "openPirateVoyage", true);
  await hook(page, "goTo", "harbor", 1.4);
  await waitFor(page, st => st.focus?.id === "harbor" && st.mode === "explore", 15_000, "at Gull");
  await page.keyboard.press("KeyE");
  let last = "", shotPrompt = 0;
  const t0 = Date.now();
  for (;;) {
    const st = await state(page) as any;
    if (st.mode === "explore" && st.progress.act3.voyage.stage === "captured") break;
    if (Date.now() - t0 > 840_000) throw new Error("capture did not finish");
    const sp = await hook(page, "voyage") as any;
    if (sp.spyPrompt && !st.line) {
      await hook(page, "renderFrames", 6); await snap(page, `c3-spy-${sp.spyPrompt}`);
      await page.keyboard.press("KeyE");
      await page.waitForTimeout(150);
      continue;
    }
    if (st.line && st.line.en !== last) {
      last = st.line.en;
      if (BEATS[last]) { await hook(page, "renderFrames", 8); await snap(page, BEATS[last]); }
      await page.keyboard.press("Space");
    } else if (st.prompt?.buttons && st.prompt.status === "ready") {
      const c = st.prompt.choices as string[], q = st.prompt.question ?? "";
      if (shotPrompt++ < 3 || c.includes("theyreMyFriends")) { await hook(page, "renderFrames", 4); await snap(page, `c7-prompt-${shotPrompt}-${c[0]}`); }
      const food = Object.keys(bag).find(f => q.includes(f));
      // A command shows its sentence among distractors: tap the one that says it.
      const said = st.prompt.kind === "command" ? c.find(id => (PHRASES as any)[id]?.en === st.prompt.sentences[0]) : undefined;
      const pick = said ?? (c.includes("yesIDo") ? (food && bag[food] ? "yesIDo" : "noIDont") : c.includes("yesTheyCan") ? "yesTheyCan" : c.includes("iCanSeeAShip") ? "iCanSeeAShip" : c[0]);
      await tap(page, pick);
      last = "";
    } else if (!st.line) last = "";
    await page.waitForTimeout(120);
  }
  await hook(page, "renderFrames", 30);
  await snap(page, "c10-free-roam");
});
