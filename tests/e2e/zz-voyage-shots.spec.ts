// Controller evidence only (not part of the suite): SHOT_TAG=v1 npx playwright test zz-voyage-shots
// The pirate voyage (docs/PIRATE_VOYAGE.md): the ship, its decks and crew.
import { test, type Page } from "@playwright/test";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { boot, chooseMode, hook, state, tap, waitFor } from "./helpers";
import { newProgress } from "../../src/game/logic/progress";
import { STAGES } from "../../src/game/world/lowland";
import { SHIP } from "../../src/game/world/pirateShip";
import { PHRASES } from "../../src/game/logic/english";

const TAG = process.env.SHOT_TAG ?? "v1";
const DIR = `.tmp/shots/voyage/${TAG}`;
test.skip(!process.env.SHOT_TAG, "controller evidence run only");
const ONLY = process.env.SHOT_ONLY;

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
  for (const [name, x, z] of [["deck-stern", 0, 6], ["deck-mid", 0.5, -10.5], ["hold", 0, -4.5], ["galley", 0, -14.5], ["fishing", 0.3, 17], ["quarterdeck", 0, 9]] as const) {
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
  "Let's go!": "c1-lets-go", "What a nice day! The sea is calm.": "c2-departure", "Look! A big ship!": "c3-ship-ahead",
  "Stop! Stop that boat!": "c4-stop", "Ropes, crew! Bring them here!": "c5-ropes", "Ahoy! I'm Captain Redbeard!": "c6-aboard",
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
      const pick = said ?? (c.includes("yesIDo") ? (food && bag[food] ? "yesIDo" : "noIDont") : c.includes("yesTheyCan") ? "yesTheyCan" : c[0]);
      await tap(page, pick);
      last = "";
    } else if (!st.line) last = "";
    await page.waitForTimeout(120);
  }
  await hook(page, "renderFrames", 30);
  await snap(page, "c10-free-roam");
});
