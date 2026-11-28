// Controller evidence only (not part of the suite): SHOT_TAG=e1 npx playwright test zz-encounter-shots
// 2026-11-19 voyage fixes: Gull's bigger boat and its passengers, the pirate ship's
// interception (stepped frame by frame), the rigging, the open galley and both staircases.
import { test, type Page } from "@playwright/test";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { boot, chooseMode, hook, state, tap, waitFor, type MiState } from "../e2e/helpers";
import { newProgress } from "../../src/game/logic/progress";
import { GULL_BERTH, STAGES } from "../../src/game/world/lowland";
import { DECK_Y, HOLD_RAMP, SHIP, STERN_RAMP } from "../../src/game/world/pirateShip";
import { CLOUD_DOCK } from "../../src/game/world/cloudisle";
import { BOAT_OUT } from "../../src/game/flow/voyageEncounter";

const TAG = process.env.SHOT_TAG ?? "e1";
const DIR = `.tmp/shots/encounter/${TAG}`;
const ONLY = process.env.SHOT_ONLY;
test.skip(!process.env.SHOT_TAG && ONLY !== "boatwake", "controller evidence run only");

function save() {
  const p = newProgress();
  for (const id of ["leafy", "bubbo", "puff", "ember", "lumo"] as const)
    p.monsters[id] = { discovered: true, friend: true, asked: {}, canKnown: {}, described: { name: true, size: true, part: true }, invited: true };
  p.active = "leafy"; p.metMaple = true; p.endings = 3;
  p.solved = ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame", "canopyAscentRope", "canopyVines", "canopyRope"];
  p.act2 = { ...p.act2, started: true, lumoTaken: true, descended: true, portFound: true, bought: true, harbor: true, zone: "port" as any, checkpoint: "port",
    cleared: [...STAGES], tutorial: ["attack", "coins", "special", "eat", "rest", "switch"], coins: 100, upgrades: ["leafy", "bubbo", "puff", "ember"] };
  return { v: 4, progress: p, player: { x: 71.5, z: -315.5, yaw: Math.PI }, seconds: 3000 };
}
const snap = (page: Page, name: string) => page.screenshot({ path: `${DIR}/${name}.png` });
const pad = (i: number) => String(i).padStart(2, "0");

async function start(page: Page, query = "fast=1") {
  await page.addInitScript((v) => { if (!localStorage.getItem("mi.save.v4")) localStorage.setItem("mi.save.v4", v); }, JSON.stringify(save()));
  await boot(page, query);
  await chooseMode(page, "tap");
  await page.getByTestId("btn-continue").click();
  await waitFor(page, (st) => st.mode === "explore", 90_000, "loaded");
  await page.setViewportSize({ width: 1366, height: 768 });
}

/** A camera beside the boat, low over the water, square to its side (clipping through the rails shows). */
function boatSide(b: { x: number; z: number; yaw: number }, side = 1, dist = 9, up = 3.2): [[number, number, number], [number, number, number]] {
  const rx = Math.cos(b.yaw) * side, rz = -Math.sin(b.yaw) * side;
  return [[b.x + rx * dist, up, b.z + rz * dist], [b.x, 1.4, b.z]];
}

test("Gull's boat: berth, departure and turns", async ({ page }) => {
  test.skip(Boolean(ONLY) && ONLY !== "boat");
  test.setTimeout(900_000);
  await start(page);
  // At the berth before boarding: the boat alone by the pier, from the pier and from the water.
  await hook(page, "teleport", GULL_BERTH.x - 3.2, GULL_BERTH.z + 7, Math.PI, true);
  await hook(page, "look", [GULL_BERTH.x - 6, 6, GULL_BERTH.z + 10], [GULL_BERTH.x, 0.6, GULL_BERTH.z]);
  await hook(page, "renderFrames", 30);
  await snap(page, "b00-berth");
  await hook(page, "look", [GULL_BERTH.x + 10, 3.5, GULL_BERTH.z - 4], [GULL_BERTH.x - 1, 0.8, GULL_BERTH.z]);
  await hook(page, "renderFrames", 20);
  await snap(page, "b01-berth-water");
  // All aboard, along the way out (with its turns): the ride's own camera, then a low side view and from above.
  for (let i = 0; i <= 10; i++) {
    await hook(page, "encounterPose", "out", i / 10);
    await hook(page, "renderFrames", 6);
    await snap(page, `b1${pad(i)}-out`);
    const b = (await hook(page, "voyage") as any).boat;
    if (i % 2 === 0) {
      const [pos, at] = boatSide(b, i % 4 === 0 ? 1 : -1);
      await hook(page, "look", pos, at);
      await hook(page, "renderFrames", 6);
      await snap(page, `b2${pad(i)}-out-side`);
      await hook(page, "look", [b.x - Math.sin(b.yaw) * 3, 9, b.z - Math.cos(b.yaw) * 3 + 0.01], [b.x, 0.8, b.z]);
      await hook(page, "renderFrames", 6);
      await snap(page, `b3${pad(i)}-out-top`);
    }
  }
});

test("Gull's wake and sail through the departure and escape", async ({ page }) => {
  test.skip(ONLY !== "boatwake");
  test.setTimeout(240_000);
  await start(page, "").catch((error: unknown) => {
    throw new Error("HARNESS_PRECONDITION_FAILED - loaded a normal-speed Port Town save", { cause: error });
  });

  type BoatState = { x: number; z: number; yaw: number; active: boolean; sail: number };
  const boat = (st: MiState) => (st as MiState & { act3: { voyage: BoatState } }).act3.voyage;
  const ready = (label: string, predicate: (st: MiState) => boolean, timeout = 25_000) =>
    waitFor(page, predicate, timeout, `HARNESS_PRECONDITION_FAILED - ${label}`);
  const nextLine = async (en: string) => {
    await ready(en, st => st.line?.en === en);
    await page.keyboard.press("Space");
  };
  const choose = async (phrase: string) => {
    await ready(`answer ${phrase}`, st => Boolean(st.prompt?.buttons && st.prompt.choices.includes(phrase)
      && st.prompt.status !== "correct" && st.prompt.status !== "wrong"));
    await tap(page, phrase);
  };
  const capture = async (name: string, atBerth = false, resume = 1) => {
    await hook(page, "timeScale", 0);
    const b = atBerth ? GULL_BERTH : boat(await state(page));
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    await hook(page, "look", [b.x - fx * 13 + fz * 12, 9.5, b.z - fz * 13 - fx * 12],
      [b.x - fx * 3, 2.7, b.z - fz * 3]);
    await hook(page, "renderFrames", 2);
    await snap(page, `wake-${name}`);
    await hook(page, "timeScale", resume);
  };

  await hook(page, "teleport", GULL_BERTH.x - 3.2, GULL_BERTH.z + 7, Math.PI, true);
  const berth = await ready("Gull's boat idle at its berth", st => st.mode === "explore" && !boat(st).active);
  await ready("berth ripples have had time to form", st => st.time >= berth.time + 1);
  await capture("00-berth", true);

  await hook(page, "openCloudShip", true);
  await hook(page, "openPirateVoyage", true);
  await hook(page, "goTo", "harbor", 1.4);
  await ready("Gull in interaction range", st => st.focus?.id === "harbor" && st.mode === "explore");
  await page.keyboard.press("KeyE");
  await choose("yesIAm");
  await nextLine("Let's go!");
  await choose("letsGo");
  await nextLine("What a nice day! The sea is calm.");

  // The real departure builds wake history over time. A single encounterPose
  // jump places the hull but cannot supply speed or lay a trail.
  const fast = BOAT_OUT.at(43);
  await ready("fast straight leg of the departure", st => {
    const b = boat(st);
    return b.active && Math.hypot(b.x - fast.x, b.z - fast.z) < 4;
  });
  await capture("01-fast");
  let step = await ready("inside the departure's second turn", st => boat(st).active && boat(st).yaw > fast.h + 0.22);
  for (let i = 0; i < 4; i++) {
    await capture(`02-turn-${pad(i)}`);
    if (i < 3) {
      const previous = step;
      step = await ready("next pose in the turning sequence", st => st.time >= previous.time + 0.16
        && boat(st).yaw > boat(previous).yaw + 0.035);
    }
  }

  for (const [i, high, low] of [[0, 0.88, 0.68], [1, 0.59, 0.37], [2, 0.27, 0.13]] as const) {
    await ready("sail lowering as the boat slows", st => boat(st).active && boat(st).sail <= high && boat(st).sail > low);
    await capture(`03-lowering-${pad(i)}${i === 2 ? "-slow" : ""}`);
  }

  await nextLine("Look! A ship!");
  await nextLine("Use the spyglass!");
  await page.getByTestId("spyglass-raise").waitFor({ state: "visible", timeout: 15_000 }).catch(() => {
    throw new Error("HARNESS_PRECONDITION_FAILED - spyglass raise button");
  });
  await page.getByTestId("spyglass-raise").click();
  await choose("iCanSeeAShip");
  await nextLine("Yes! A big ship with red sails...");
  await page.getByTestId("spyglass-lower").waitFor({ state: "visible", timeout: 15_000 }).catch(() => {
    throw new Error("HARNESS_PRECONDITION_FAILED - spyglass lower button");
  });
  await page.getByTestId("spyglass-lower").click();
  await nextLine("Red sails... It's a pirate ship! Oh no! Pirates!");
  await nextLine("Hold on! We turn left!");
  await ready("sail down before the escape", st => boat(st).active && boat(st).sail <= 0.12);
  await capture("04-escape-sail-down", false, 0.4);
  await choose("turnLeft");
  for (const [i, low, high] of [[0, 0.22, 0.45], [1, 0.5, 0.74], [2, 0.8, 0.97]] as const) {
    await ready("sail rising on the escape", st => boat(st).active && boat(st).sail >= low && boat(st).sail < high);
    await capture(`05-raising-${pad(i)}`, false, 0.4);
  }
  await ready("sail fully raised", st => boat(st).active && boat(st).sail >= 0.99);
  await capture("06-full-sail");
});

test("the interception, frame by frame", async ({ page }) => {
  test.skip(Boolean(ONLY) && ONLY !== "chase");
  test.setTimeout(1_200_000);
  await start(page);
  // The sighting: the ship far off, rising over the horizon (Gull's eye line from the stern).
  for (let i = 0; i <= 4; i++) {
    await hook(page, "encounterPose", "watch", i / 4);
    const v = await hook(page, "voyage") as any, b = v.boat, s = v.ship;
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    // flow/voyage `lookout()`: the boat's stern quarter, above the rail.
    const rx = Math.cos(b.yaw), rz = -Math.sin(b.yaw);
    await hook(page, "look", [b.x + (fx * -3.2 + rx * 1.45) * 1.33, 3.8, b.z + (fz * -3.2 + rz * 1.45) * 1.33], [s.x, 4.5 - s.sink * 0.6, s.z]);
    await hook(page, "renderFrames", 8);
    await snap(page, `h${pad(i)}-horizon`);
    console.log(`horizon ${i}: dist=${Math.hypot(s.x - b.x, s.z - b.z).toFixed(0)} sink=${s.sink.toFixed(2)}`);
  }
  // The chase: 28 steps, the chase camera (boat's starboard quarter) and straight down over both.
  for (let i = 0; i <= 28; i++) {
    await hook(page, "encounterPose", "chase", i / 28);
    const v = await hook(page, "voyage") as any, b = v.boat, s = v.ship;
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    await hook(page, "look", [b.x - fx * 15 + fz * 9, 11, b.z - fz * 15 - fx * 9], [b.x + (s.x - b.x) * 0.45, 3.2, b.z + (s.z - b.z) * 0.45]);
    await hook(page, "renderFrames", 6);
    await snap(page, `c${pad(i)}-chase`);
    if (i >= 14) {
      const mx = (b.x + s.x) / 2, mz = (b.z + s.z) / 2;
      await hook(page, "look", [mx + 0.01, 70, mz + 0.02], [mx, 0, mz]);
      await hook(page, "renderFrames", 6);
      await snap(page, `d${pad(i)}-top`);
    }
  }
  // The rope pull alongside, and the final stop from the water.
  for (let i = 0; i <= 6; i++) {
    await hook(page, "encounterPose", "pull", i / 6);
    const b = (await hook(page, "voyage") as any).boat;
    await hook(page, "look", [b.x + 7.5, 6.8, b.z + 9.5], [SHIP.x + 4.75, DECK_Y + 1.5, SHIP.z + 9]);
    await hook(page, "renderFrames", 6);
    await snap(page, `p${pad(i)}-pull`);
  }
  await hook(page, "look", [SHIP.x + 22, 4, SHIP.z + 14], [SHIP.x + 7, 1.5, SHIP.z + 5]);
  await hook(page, "renderFrames", 10);
  await snap(page, "p10-moored-low");
});

test("the ship: rigging, open galley and both staircases", async ({ page }) => {
  test.skip(Boolean(ONLY) && ONLY !== "ship");
  test.setTimeout(1_200_000);
  await start(page);
  await hook(page, "voyageShow", true);
  const L = (x: number, y: number, z: number): [number, number, number] => [SHIP.x + x, y, SHIP.z + z];
  // Rigging from outside: both sides, bow, stern quarter, high.
  for (const [name, pos, at] of [
    ["r1-starboard", L(30, 8, 0), L(0, 7, -2)], ["r2-port", L(-30, 9, -4), L(0, 7, -2)], ["r3-bow", L(6, 7, -48), L(0, 7, -4)],
    ["r4-stern-quarter", L(-16, 12, 36), L(0, 6, -2)], ["r5-high", L(18, 30, 18), L(0, 4, -2)], ["r6-fore-close", L(9, 6, -14), L(-0.75, 7, -10.6)],
  ] as const) {
    await hook(page, "look", pos, at);
    await hook(page, "renderFrames", 12);
    await snap(page, name);
  }
  // On deck, the game's own camera: by each mast, then the open galley from the mess.
  for (const [name, x, z] of [["s1-deck-main", 2.6, 4.2], ["s2-deck-fore", 1.2, -9], ["s3-galley", 0.4, -11.4], ["s4-galley-in", -1.6, -14.2]] as const) {
    await hook(page, "follow");
    await hook(page, "teleport", SHIP.x + x, SHIP.z + z, Math.PI, true);
    await hook(page, "renderFrames", 40);
    await snap(page, name);
  }
  await hook(page, "look", L(5.5, DECK_Y + 2.8, -7.5), L(-0.5, DECK_Y + 0.8, -15));
  await hook(page, "renderFrames", 12);
  await snap(page, "s5-galley-open-wide");
  // Walk the stairs with the keys (camera follows): down, then up, a frame every few hundred ms.
  for (const [name, ramp, top, downKey] of [
    ["hold", HOLD_RAMP, { z: HOLD_RAMP.z1 + 1.2 }, "ArrowUp"], ["stern", STERN_RAMP, { z: STERN_RAMP.z0 - 1.2 }, "ArrowDown"],
  ] as const) {
    const x = (ramp.x0 + ramp.x1) / 2;
    await hook(page, "follow");
    await hook(page, "teleport", SHIP.x + x, SHIP.z + top.z, downKey === "ArrowUp" ? Math.PI : 0, true);
    await hook(page, "renderFrames", 40);
    for (const [dir, key] of [["down", downKey], ["up", downKey === "ArrowUp" ? "ArrowDown" : "ArrowUp"]] as const) {
      // Slow motion (about a quarter metre between frames): the walking pose, frame by frame.
      await hook(page, "timeScale", 0.06);
      await page.keyboard.down(key);
      for (let i = 0; i < 26; i++) {
        await hook(page, "renderFrames", 3);
        const st = await state(page) as any;
        const lz = st.player.z - SHIP.z;
        if (lz > ramp.z0 - 1.4 && lz < ramp.z1 + 1.4) await snap(page, `w-${name}-${dir}-${pad(i)}`);
        console.log(`${name} ${dir} ${i}: x=${(st.player.x - SHIP.x).toFixed(2)} z=${lz.toFixed(2)} y=${st.player.y.toFixed(3)}`);
      }
      await page.keyboard.up(key);
      await hook(page, "timeScale", 1);
      await hook(page, "renderFrames", 20);
    }
  }
});

test("Gull's boat at Cloud Isle's dock", async ({ page }) => {
  test.skip(Boolean(ONLY) && ONLY !== "cloud");
  test.setTimeout(600_000);
  const s = save() as any;
  s.progress.act3 = { ...s.progress.act3, world: "cloud", voyageDone: true };
  s.player = { x: CLOUD_DOCK.spawn.x, z: CLOUD_DOCK.spawn.z, yaw: Math.PI };
  await page.addInitScript((v) => { if (!localStorage.getItem("mi.save.v4")) localStorage.setItem("mi.save.v4", v); }, JSON.stringify(s));
  await boot(page, "fast=1");
  await chooseMode(page, "tap");
  await page.getByTestId("btn-continue").click();
  await waitFor(page, (st) => st.mode === "explore", 90_000, "loaded");
  await page.setViewportSize({ width: 1366, height: 768 });
  const b = CLOUD_DOCK.boat;
  for (const [name, pos] of [["k1-dock-side", [b.x + 14, 4, b.z + 6]], ["k2-from-dock", [CLOUD_DOCK.spawn.x + 1, 4.5, CLOUD_DOCK.spawn.z + 4]], ["k3-high", [b.x - 10, 16, b.z + 18]]] as const) {
    await hook(page, "look", pos, [b.x, 0.8, b.z + 3]);
    await hook(page, "renderFrames", 30);
    await snap(page, name);
  }
});
