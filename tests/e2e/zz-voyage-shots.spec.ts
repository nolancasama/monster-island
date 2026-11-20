// Controller evidence only (not part of the suite): SHOT_TAG=v1 npx playwright test zz-voyage-shots
// The pirate voyage (docs/PIRATE_VOYAGE.md): the ship, its decks and crew.
import { expect, test, type Page } from "@playwright/test";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { boot, chooseMode, hook, state, tap, teleportShip, waitFor } from "./helpers";
import { newProgress } from "../../src/game/logic/progress";
import { STAGES } from "../../src/game/world/lowland";
import { COUNTER_CUSTOMER, DECK_Y, FISH_LANDING_Z, FISH_Y, HOLD_CEILING_Y, HOLD_ENTRY, HOLD_PORTAL, HOLD_RAMP, HOLD_Y, MASTS, SHIP, SPOT, STERN_RAMP, SUPPLY_CRATES, crateApproach } from "../../src/game/world/pirateShip";
import { PHRASES } from "../../src/game/logic/english";
import { CARGO_ITEMS, ITEM_NAME, RAFT_STEER_STEPS, SHIP_STEER_STEPS, SLOTS, STEER_COMMANDS, placePhrase, steerAttempt, steerCall, type CargoItem, type Furniture, type Lane, type Placement } from "../../src/game/logic/voyage";

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

async function boardForShots(page: Page, viewport = { width: 1366, height: 768 }) {
  await page.setViewportSize(viewport);
  await page.addInitScript(v => { if (!localStorage.getItem("mi.save.v4")) localStorage.setItem("mi.save.v4", v); }, JSON.stringify(save()));
  await boot(page, "fast=1");
  await chooseMode(page, "tap");
  await page.getByTestId("btn-continue").click();
  await shotReady(page, "loaded the save", s => s.mode === "explore");
  await hook(page, "voyageJump", "jobs");
  await shotReady(page, "on the pirate ship", s => s.mode === "explore" && s.camera.profile === "pirate-ship");
}

const voyage = (page: Page): Promise<any> => hook(page, "voyage");

async function voyageReady(page: Page, label: string, ready: (v: any) => boolean) {
  await expect.poll(async () => ready(await voyage(page)), {
    timeout: 30_000, message: `HARNESS_PRECONDITION_FAILED - ${label}`,
  }).toBe(true);
}

async function face(page: Page, local: { x: number; z: number }, target: { x: number; z: number }, hold = false) {
  const at = L(local.x, local.z);
  await teleportShip(page, at.x, at.z, Math.atan2(target.x - at.x, target.z - at.z), hold);
}

async function steeringCommand(page: Page, phrase: "weNeedWood" | "three" | "putItHere" | "canSwim" | "canHelp" | "cmdStop") {
  await shotReady(page, `the ${phrase} prompt is ready`, s => Boolean(s.prompt?.buttons && s.prompt.status === "ready"
    && s.prompt.sentences.includes(PHRASES[phrase].en)));
  await tap(page, phrase);
}

async function steeringFrame(page: Page, name: string, phase: string, lane: Lane, z: number) {
  try {
    await page.waitForFunction(({ phase, lane, z }) => {
      const api = (window as unknown as { __mi: {
        voyage(): { phase: string | null; lane: Lane; obstacles: { z: number }[] };
        timeScale(scale: number): void;
      } }).__mi;
      const v = api.voyage();
      if (v.phase !== phase || v.lane !== lane || !v.obstacles.length || v.obstacles.some(o => o.z < z)) return false;
      api.timeScale(0);
      return true;
    }, { phase, lane, z }, { timeout: 15_000 });
  } catch (error) {
    throw new Error(`HARNESS_PRECONDITION_FAILED - ${name} did not reach ${phase} in lane ${lane}`, { cause: error });
  }
  await hook(page, "renderFrames", 2);
  await snap(page, name);
}

async function captureSteering(page: Page, vessel: "ship" | "raft") {
  const ship = vessel === "ship";
  const steps = ship ? SHIP_STEER_STEPS : RAFT_STEER_STEPS;
  const frames = ship ? [-52, -39, -14, 12] : [-14, -8, 1, 10];
  for (const [i, step] of steps.entries()) {
    const name = `steer-${vessel}-${i + 1}`;
    const call = steerCall(step, ship ? "Rocks" : "A rock");
    const ready = (s: Awaited<ReturnType<typeof state>>) => Boolean(s.prompt?.buttons && s.prompt.status === "ready"
      && s.prompt.question === call.en && STEER_COMMANDS.every(command => s.prompt?.choices.includes(command)));
    const atStart = (v: any) => v.phase === "steer-approach" && v.raft.on === !ship && v.lane === step.start
      && v.obstacles.length === step.obstacles.length && step.obstacles.every((o, index) => v.obstacles[index].lane === o.lane);
    await shotReady(page, `${name} call`, ready);
    await voyageReady(page, `${name} obstacles at the authored start`, atStart);
    await hook(page, "renderFrames", 2);
    await snap(page, `${name}-call`);
    try {
      if (ship && i === 0) {
        const promptId = (await state(page)).prompt?.id;
        const wrong = "turnRight"; // Choose the barrel beside the rocks.
        await hook(page, "timeScale", 0.035);
        await tap(page, wrong);
        await steeringFrame(page, "steer-ship-bump", "steer-bump", steerAttempt(step, wrong).lane, -110);
        await hook(page, "timeScale", 1);
        await shotReady(page, `${name} repeated call`, s => ready(s) && s.prompt?.id !== promptId);
        await voyageReady(page, `${name} retry at the authored start`, atStart);
      }
      const safe = STEER_COMMANDS.find(command => steerAttempt(step, command).hit < 0);
      if (!safe) throw new Error(`HARNESS_PRECONDITION_FAILED - ${name} has no safe steering answer`);
      const { lane } = steerAttempt(step, safe);
      await hook(page, "timeScale", 0.035);
      await tap(page, safe);
      for (const [index, z] of frames.entries()) {
        await steeringFrame(page, `${name}-pass-${index + 1}`, "steer-pass", lane, z);
        await hook(page, "timeScale", 0.035);
      }
    } finally {
      await hook(page, "timeScale", 1);
    }
  }
}

test.describe("ship and raft steering", () => {
  test.skip(ONLY !== "steer");
  test.describe.configure({ timeout: 180_000 });

  test("ship steering calls, safe passes and one retry", async ({ page }) => {
    await startPowerJob(page, "redbeard", { x: SPOT.captain.x + 1, z: 10.3 }, "sails", ["yesICan"]);
    const stands = [{ x: 0, z: 6 }, { x: 0, z: 6 }, { x: 0, z: -11.6 }];
    for (const [i, mast] of [MASTS.mizzen, MASTS.main, MASTS.fore].entries()) {
      await face(page, stands[i], L(mast.x + 0.4, mast.z + 2));
      await shotReady(page, `Puff is at sail ${i + 1}`, s => s.mode === "explore" && s.progress.active === "puff"
        && Math.hypot(s.player.x - L(stands[i].x, stands[i].z).x, s.player.z - L(stands[i].x, stands[i].z).z) < 0.1);
      for (let gust = 0; gust < 3; gust++) {
        const before = (await voyage(page)).sails[i];
        if (before >= 0.99) break;
        await page.keyboard.press("KeyJ");
        await voyageReady(page, `gust ${gust + 1} reaches sail ${i + 1}`, v => v.sails[i] > before);
      }
      await voyageReady(page, `sail ${i + 1} is full`, v => v.sails[i] >= 0.99);
    }
    await captureSteering(page, "ship");
    await steeringCommand(page, "cmdStop");
  });

  test("raft towing calls and safe passes", async ({ page }) => {
    await boardForShots(page);
    await hook(page, "voyageJump", "raft");
    await steeringCommand(page, "weNeedWood");
    await steeringCommand(page, "three");
    for (let i = 0; i < 3; i++) {
      await voyageReady(page, `raft is ready to gather plank ${i + 1}`, v => v.phase === "raft-planks" && v.raft.built === i);
      await shotReady(page, "Leafy can pull a plank", s => s.mode === "explore" && s.progress.active === "leafy");
      await page.keyboard.press("KeyJ");
      if (i === 0) await steeringCommand(page, "putItHere");
      await voyageReady(page, `plank ${i + 1} is placed`, v => v.raft.built === i + 1);
    }
    await steeringCommand(page, "canSwim");
    await steeringCommand(page, "canHelp");
    await captureSteering(page, "raft");
    await shotReady(page, "Bubbo finished towing", s => s.prompt?.sentences.includes(PHRASES.puffHelp.en) === true);
  });
});

async function startPowerJob(page: Page, crew: string, from: { x: number; z: number }, phase: string, prompts: string[], hold = false) {
  await boardForShots(page);
  const v = await voyage(page);
  await face(page, from, v.crew[crew], hold);
  await shotReady(page, `at ${crew}'s job`, s => s.focus?.id === `crew:${crew}` && s.mode === "explore"
    && s.camera.profile === (hold ? "pirate-hold" : "pirate-ship"));
  await page.keyboard.press("KeyE");
  for (const phrase of prompts) {
    await shotReady(page, `${crew}'s ${phrase} prompt`, s => Boolean(s.prompt?.buttons && s.prompt.status === "ready" && s.prompt.choices.includes(phrase)));
    await tap(page, phrase);
  }
  await voyageReady(page, `${phase} is underway`, v => v.phase === phase && Boolean(v.hud));
  await shotReady(page, `free to use the ${phase} tool`, s => s.mode === "explore");
}

const mountedFor = (s: Awaited<ReturnType<typeof state>>, friend: string) =>
  s.act2.stance.friend === friend && s.act2.stance.k >= .99;

async function powerFrame(page: Page, name: string, scale: number) {
  await hook(page, "timeScale", 0);
  try {
    await hook(page, "renderFrames", 2);
    await snap(page, name);
  } finally {
    await hook(page, "timeScale", scale);
  }
}

type PowerEffect = { id: number; kind: string; posed: boolean; age: number; life: number };
const powerEffects = (v: any): PowerEffect[] => v.effects;

async function powerSequence(page: Page, name: string, kind: string, use: () => Promise<void>) {
  const scale = .08;
  const previous = powerEffects(await voyage(page)).at(-1)?.id ?? 0;
  const fresh = (effect: PowerEffect) => effect.id > previous && effect.posed && effect.kind === kind;
  await hook(page, "timeScale", scale);
  try {
    await use();
    await voyageReady(page, `${name} emitted ${kind} from its stance`, v => powerEffects(v).some(fresh));
    const id = powerEffects(await voyage(page)).find(fresh)?.id;
    if (!id) throw new Error(`HARNESS_PRECONDITION_FAILED - ${name} effect is live`);
    for (const [i, age] of [.06, .17, .28].entries()) {
      await voyageReady(page, `${name} effect frame ${i + 1}`, v => powerEffects(v).some(fx => fx.id === id && fx.age >= age && fx.age < fx.life));
      await powerFrame(page, `${name}-effect-0${i + 1}`, scale);
    }
  } finally {
    await hook(page, "timeScale", 1);
  }
}

async function contextualE(page: Page, id: string) {
  await shotReady(page, `can interact with ${id}`, s => s.mode === "explore" && s.focus?.id === id);
  await page.keyboard.press("KeyE");
}

async function powerPrompt(page: Page, phrase: string) {
  await shotReady(page, `ready to answer ${phrase}`, s => Boolean(s.prompt?.buttons && s.prompt.status === "ready" && s.prompt.choices.includes(phrase)));
  await tap(page, phrase);
}

for (const [width, height] of [[1366, 768], [1280, 800]] as const) {
  const size = `${width}x${height}`;
  test(`Cooking auto-mount and fire at ${size}`, async ({ page }) => {
    test.skip(ONLY !== "storm-powers");
    test.setTimeout(120_000);
    await startPowerJob(page, "pepper", COUNTER_CUSTOMER, "cooking", ["yesICan", "yesICan", "canFire"]);
    await page.setViewportSize({ width, height });
    const stove = L(SPOT.stove.x, SPOT.stove.z);
    await face(page, { x: 0, z: -13.7 }, stove);
    await shotReady(page, "Ember is ready to light the stove", s => mountedFor(s, "ember") && s.mode === "explore");
    await page.keyboard.press("KeyJ");
    await voyageReady(page, "the stove is lit and Pepper has sent the player for an order", v => v.cook.lit && v.hud?.hint?.startsWith("Ask a hungry pirate"));

    const tom = (await voyage(page)).crew.tom;
    await face(page, { x: SPOT.crew[0].x - 1.45, z: -9.8 }, tom);
    await contextualE(page, "crew:tom");
    await powerPrompt(page, "whatDoYouWant");
    await voyageReady(page, "Tom's order is known", v => v.cook.order?.who === "tom");
    const food = (await voyage(page)).cook.order.food;
    const crate = SUPPLY_CRATES.find(c => c.food === food);
    if (!crate) throw new Error("HARNESS_PRECONDITION_FAILED - the order has a supply crate");
    await face(page, crateApproach(crate), L(crate.x, crate.z));
    await contextualE(page, `crate:${food}`);
    await voyageReady(page, "the ordered food is in hand", v => v.carry?.kind === "food" && v.carry.food === food);
    await page.keyboard.press("Digit1");
    await shotReady(page, "Leafy is selected before the pot", s => s.progress.active === "leafy" && s.act2.stance.friend === null);
    const approach = { x: -.55, z: -15.35 };
    const start = L(approach.x, approach.z);
    await face(page, approach, stove);
    await contextualE(page, "pot");

    const scale = .08;
    await hook(page, "timeScale", scale);
    try {
      await powerPrompt(page, "yesIDo");
      await voyageReady(page, "the food is in the pot", v => v.cook.pot === food);
      await shotReady(page, "Ember is selected and the player is walking from the pot", s => {
        const moved = Math.hypot(s.player.x - start.x, s.player.z - start.z);
        return s.progress.active === "ember" && s.act2.stance.friend === null && moved > .15 && moved < .85;
      });
      await powerFrame(page, `storm-powers-${size}-cooking-mount-01`, scale);
      await shotReady(page, "the player is hopping onto Ember", s => s.act2.stance.friend === "ember" && s.act2.stance.k >= .25 && s.act2.stance.k < .9);
      await powerFrame(page, `storm-powers-${size}-cooking-mount-02`, scale);
      await shotReady(page, "Ember is mounted and the cooking instruction has ended", s => mountedFor(s, "ember") && s.mode === "explore");
      await voyageReady(page, "the mounted heat prompt is visible", v => v.hud?.hint?.startsWith("Hold J"));
      await powerFrame(page, `storm-powers-${size}-cooking-mount-03`, scale);
    } finally {
      await hook(page, "timeScale", 1);
    }
    const p = (await state(page)).player;
    await hook(page, "look", [p.x + 4.6, DECK_Y + 2.7, p.z + .9], [p.x, DECK_Y + .85, p.z - 1.1]);
    await shotReady(page, "the lens frames Ember and the stove", s => Math.abs(s.camera.pos.x - (p.x + 4.6)) < .12);
    try {
      await powerSequence(page, `storm-powers-${size}-cooking`, "flame", () => page.keyboard.down("KeyJ"));
    } finally {
      await page.keyboard.up("KeyJ");
    }
  });

  test(`Storm task poses and effects at ${size}`, async ({ page }) => {
    test.skip(ONLY !== "storm-powers");
    test.setTimeout(180_000);
    await boardForShots(page);
    await page.setViewportSize({ width, height });
    await hook(page, "voyageJump", "storm");
    const tasks = [
      { phase: "storm-barrels", friend: "leafy", phrase: "leafyHelp", kind: "vine", from: { x: 0, z: 5.5 } },
      { phase: "storm-fires", friend: "bubbo", phrase: "bubboHelp", kind: "bubble", from: { x: 0, z: 4 } },
      { phase: "storm-sail", friend: "puff", phrase: "puffHelp", kind: "gust", from: { x: 0, z: 5.2 } },
      { phase: "storm-spar", friend: "leafy", phrase: "whereIsHe", kind: "vine", from: { x: -1.6, z: -9.6 } },
    ] as const;
    for (const { phase, friend, phrase, kind, from } of tasks) {
      await powerPrompt(page, phrase);
      await voyageReady(page, `${phase} has started`, v => v.phase === phase && Boolean(v.hud));
      const targets = (v: any): Array<{ x: number; z: number }> =>
        phase === "storm-barrels" ? v.barrels.filter((b: any) => !b.tied)
          : phase === "storm-fires" ? v.fires.filter((f: any) => !f.out)
          : phase === "storm-sail" ? [L(MASTS.main.x + .4, MASTS.main.z + 2)] : v.spar ? [v.spar] : [];
      const v = await voyage(page);
      const target = targets(v)[0];
      if (!target) throw new Error(`HARNESS_PRECONDITION_FAILED - ${phase} has a target`);
      await face(page, from, target);
      await powerPosition(page, friend, from);
      await shotReady(page, `${friend} has finished the ${phase} pose`, s => mountedFor(s, friend));

      if (phase !== "storm-sail") {
        const p = L(from.x, from.z);
        const side = target.x < p.x ? 1 : -1, x = p.x + 5.8 * side;
        await hook(page, "look", [x, DECK_Y + 3.1, p.z + 2.4], [(p.x + target.x) / 2, DECK_Y + 1, (p.z + target.z) / 2]);
        // The rig can move the lens around the mast or rail. Wait for the rendered lens to settle.
        let last = { x: NaN, y: NaN, z: NaN };
        await shotReady(page, `the lens has settled on ${phase}`, s => {
          const c = s.camera.pos, still = Math.hypot(c.x - last.x, c.y - last.y, c.z - last.z) < .035;
          last = c;
          return still;
        });
        const current = targets(await voyage(page))[0];
        if (!current) throw new Error(`HARNESS_PRECONDITION_FAILED - ${phase} target is still available`);
        await face(page, from, current);
      }
      const name = `storm-powers-${size}-${phase}`;
      await powerFrame(page, `${name}-pose`, 1);
      if (phase === "storm-sail") {
        try {
          await powerSequence(page, name, kind, () => page.keyboard.down("KeyJ"));
          await voyageReady(page, "the wind has held the torn sail open until it is sewn", next => next.sewn === 1);
        } finally {
          await page.keyboard.up("KeyJ");
        }
      } else {
        await powerSequence(page, name, kind, () => page.keyboard.press("KeyJ"));
        if (phase === "storm-spar") continue;
        for (let remaining = 2; remaining > 0; remaining--) {
          await voyageReady(page, `${phase} has ${remaining} targets left`, next => next.phase === phase && targets(next).length === remaining);
          const next = targets(await voyage(page))[0];
          if (!next) throw new Error(`HARNESS_PRECONDITION_FAILED - a remaining ${phase} target is available`);
          await face(page, from, next);
          await page.keyboard.press("KeyJ");
        }
      }
    }
  });
}

async function powerPosition(page: Page, friend: string, local: { x: number; z: number }, hold = false) {
  const at = L(local.x, local.z);
  await shotReady(page, `${friend} is selected at the job position`, s => s.progress.active === friend && s.mode === "explore"
    && s.camera.profile === (hold ? "pirate-hold" : "pirate-ship") && Math.hypot(s.player.x - at.x, s.player.z - at.z) < .1);
}

test.describe("friends' powers on the pirate ship", () => {
  test.skip(Boolean(ONLY) && ONLY !== "powers");
  test.describe.configure({ timeout: 120_000 });

  test("Ember breathes fire at the stove over consecutive frames", async ({ page }) => {
    await startPowerJob(page, "pepper", COUNTER_CUSTOMER, "cooking", ["yesICan", "yesICan", "canFire"]);
    const from = { x: 0, z: -13.7 };
    await face(page, from, L(SPOT.stove.x, SPOT.stove.z));
    await powerPosition(page, "ember", from);
    await shotReady(page, "Ember is ridden at the stove", s => mountedFor(s, "ember"));
    const p = (await state(page)).player;
    const lens = [p.x + 4.6, DECK_Y + 2.7, p.z + .9];
    await hook(page, "look", lens, [p.x, DECK_Y + .85, p.z - 1.45]);
    await shotReady(page, "the lens frames Ember and the stove", s => Math.abs(s.camera.pos.x - lens[0]) < .08);
    await hook(page, "timeScale", .08);
    try {
      const start = (await state(page)).time;
      await page.keyboard.press("KeyJ");
      await voyageReady(page, "Ember has lit the stove", v => v.cook.lit);
      for (const [i, age] of [.06, .18, .3].entries()) {
        await shotReady(page, `Ember is breathing fire in frame ${i + 1}`, s => s.time >= start + age && s.time < start + .48 && mountedFor(s, "ember"));
        await hook(page, "timeScale", 0);
        await hook(page, "renderFrames", 2);
        await snap(page, `powers-ember-0${i + 1}`);
        await hook(page, "timeScale", .08);
      }
    } finally {
      await hook(page, "timeScale", 1);
    }
  });

  test("Leafy carries cargo with vines inside the hold", async ({ page }) => {
    await startPowerJob(page, "bill", { x: SPOT.bill.x + 1.5, z: SPOT.bill.z }, "cargo", ["yesICan"], true);
    const bag = (await voyage(page)).items.bag;
    const from = { x: -.1, z: -3.8 };
    await face(page, from, bag, true);
    await powerPosition(page, "leafy", from, true);
    await shotReady(page, "Leafy is perched in the interior camera", s => mountedFor(s, "leafy"));
    await page.keyboard.press("KeyJ");
    await voyageReady(page, "Leafy's vines are carrying the bag", v => v.carry?.kind === "cargo" && v.carry.item === "bag");
    await hook(page, "renderFrames", 2);
    await snap(page, "powers-leafy-cargo");
  });

  test("Bubbo's bubble travels to a fish", async ({ page }) => {
    await startPowerJob(page, "finn", { x: SPOT.finn.x + 1.3, z: 16.7 }, "fishing", ["yesICan", "yesICan", "howManyFish"]);
    const from = { x: -1.7, z: 16.75 }, p = L(from.x, from.z);
    const fish = (await voyage(page)).fish.find((f: any) => !f.boot && f.x < SHIP.x - 5);
    if (!fish) throw new Error("HARNESS_PRECONDITION_FAILED - a fish is swimming off the port side");
    await face(page, from, fish);
    await powerPosition(page, "bubbo", from);
    await shotReady(page, "Bubbo is ridden on the fishing platform", s => mountedFor(s, "bubbo"));
    const lens = [p.x + 2.4, FISH_Y + 3.4, p.z + 3.4];
    await hook(page, "look", lens, [(p.x + fish.x) * .5, FISH_Y, (p.z + fish.z) * .5]);
    await shotReady(page, "the lens frames Bubbo and the fishing pool", s => Math.abs(s.camera.pos.x - lens[0]) < .08);
    await hook(page, "timeScale", .08);
    try {
      // Refresh the bearing after composing the shot, since the fish are swimming.
      const target = (await voyage(page)).fish.find((f: any) => !f.boot && f.x < SHIP.x - 5);
      if (!target || Math.hypot(target.x - p.x, target.z - p.z) > 9) throw new Error("HARNESS_PRECONDITION_FAILED - a port-side fish is in range");
      await face(page, from, target);
      const start = (await state(page)).time;
      await page.keyboard.press("KeyJ");
      await voyageReady(page, "Bubbo has targeted a fish", v => v.fish.some((f: any) => !f.boot && f.state === "caught"));
      await shotReady(page, "the bubble is in flight", s => s.time >= start + .18 && s.time < start + .43 && mountedFor(s, "bubbo"));
      await snap(page, "powers-bubbo-fish");
    } finally {
      await hook(page, "timeScale", 1);
    }
  });

  test("Puff's gust reaches the sail before it fills", async ({ page }) => {
    await startPowerJob(page, "redbeard", { x: SPOT.captain.x + 1, z: 10.3 }, "sails", ["yesICan"]);
    const from = { x: 0, z: 7.3 };
    await face(page, from, L(MASTS.mizzen.x + .4, MASTS.mizzen.z + 2));
    await powerPosition(page, "puff", from);
    const sails = (await voyage(page)).sails;
    await page.keyboard.press("KeyJ");
    await shotReady(page, "Puff is perched for the gust", s => mountedFor(s, "puff"));
    // Close lens behind the player's shoulder, looking up at the mizzen sail: Puff, the gust and the sail in one frame.
    const p = (await state(page)).player, sail = L(MASTS.mizzen.x + .4, MASTS.mizzen.z + 2);
    const lens = [p.x + (p.x - sail.x) * .35 + 1.6, DECK_Y + 2.4, p.z + (p.z - sail.z) * .35];
    await hook(page, "look", lens, [(p.x + sail.x) / 2, DECK_Y + 3.2, (p.z + sail.z) / 2]);
    // The ship rig may keep the lens clear of masts and rigging: wait for it to settle wherever it lands.
    let last = { x: NaN, y: NaN, z: NaN };
    await expect.poll(async () => {
      const c = (await state(page)).camera.pos, still = Math.hypot(c.x - last.x, c.y - last.y, c.z - last.z) < .02;
      last = c;
      return still;
    }, { timeout: 30_000, intervals: [400], message: "HARNESS_PRECONDITION_FAILED - the lens settled on Puff and the sail" }).toBe(true);
    await hook(page, "timeScale", .08);
    try {
      const start = (await state(page)).time;
      await shotReady(page, "Puff's gust is travelling toward the sail", s => s.time >= start + .18 && mountedFor(s, "puff"));
      await voyageReady(page, "the sail is awaiting the gust", v => v.sails[0] === sails[0]);
      await hook(page, "renderFrames", 2);
      await snap(page, "powers-puff-sail");
    } finally {
      await hook(page, "timeScale", 1);
    }
    await expect.poll(async () => (await voyage(page)).sails[0]).toBeGreaterThan(sails[0]);
    await page.waitForTimeout(600);
    await hook(page, "renderFrames", 2);
    await snap(page, "powers-puff-sail-filled");
  });
});

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

const CARGO_STANDS: Record<Furniture, { x: number; z: number }> = {
  table: { x: SPOT.table.x - 1.9, z: SPOT.table.z },
  shelf: { x: SPOT.shelf.x + 1.25, z: SPOT.shelf.z },
  box: { x: SPOT.box.x - 1.45, z: SPOT.box.z },
  door: { x: SPOT.door.x, z: SPOT.door.z + 0.95 },
};
const CARGO_PLACEMENTS: Placement[] = Object.entries(SLOTS).flatMap(([furniture, preps]) =>
  preps.map(prep => ({ furniture: furniture as Furniture, prep })));

function holdInstruction(title: string) {
  const match = /^Put (.+) (on|under|in|by) the (table|shelf|box|door)!$/.exec(title);
  const item = CARGO_ITEMS.find(i => ITEM_NAME[i] === match?.[1]);
  if (!match || !item) throw new Error(`HARNESS_PRECONDITION_FAILED - expected a cargo instruction, got ${title}`);
  const placement: Placement = { prep: match[2] as Placement["prep"], furniture: match[3] as Furniture };
  return { item, placement };
}

async function placeHoldCargo(page: Page, item: CargoItem, placement: Placement) {
  const at = (await voyage(page)).items[item];
  const from = { x: at.x - SHIP.x + (at.x < SHIP.x ? 1.6 : -1.6), z: at.z - SHIP.z };
  await face(page, from, at, true);
  await shotReady(page, `Leafy at the ${item}`, s => s.mode === "explore" && mountedFor(s, "leafy") && s.camera.profile === "pirate-hold");
  await page.keyboard.press("KeyJ");
  await voyageReady(page, `Leafy carrying the ${item}`, v => v.carry?.item === item);
  const { furniture, prep } = placement;
  await face(page, CARGO_STANDS[furniture], L(SPOT[furniture].x, SPOT[furniture].z), true);
  await shotReady(page, `facing the ${furniture} with cargo`, s => s.mode === "explore" && s.focus?.id === `furn:${furniture}`);
  await page.keyboard.press("KeyE");
  if (prep === "on" || prep === "under") {
    const phrase = placePhrase(placement);
    await shotReady(page, `ready to choose ${phrase}`, s => Boolean(s.prompt?.buttons && s.prompt.status === "ready" && s.prompt.choices.includes(phrase)));
    await tap(page, phrase);
  }
  await voyageReady(page, `${item} ${prep} the ${furniture}`, v => v.cargo[item]?.furniture === furniture && v.cargo[item]?.prep === prep && !v.carry);
}

for (const viewport of [{ width: 1366, height: 768 }, { width: 1280, height: 800 }]) {
  const size = `${viewport.width}x${viewport.height}`;
  test(`enclosed hold and cargo at ${size}`, async ({ page }) => {
    test.skip(Boolean(ONLY) && ONLY !== "hold");
    test.setTimeout(150_000);
    await boardForShots(page, viewport);
    const detail = (name: string) => snap(page, `hold-${size}-${name}`);
    const eyeY = HOLD_CEILING_Y - 0.26;
    async function look(name: string, lens: [number, number, number], target: [number, number, number]) {
      await hook(page, "look", lens, target);
      await shotReady(page, `${name} camera`, s => s.camera.mode === "shot" &&
        Math.hypot(s.camera.pos.x - lens[0], s.camera.pos.y - lens[1], s.camera.pos.z - lens[2]) < 0.09);
      await hook(page, "renderFrames", 2);
      await detail(name);
    }

    const entry = { x: HOLD_ENTRY.x, z: HOLD_RAMP.z1 + 0.6 };
    await face(page, entry, L(entry.x, HOLD_RAMP.z0), false);
    await shotReady(page, "on deck at the hatch", s => Math.abs(s.player.y - DECK_Y) < 0.03 && s.camera.profile === "pirate-ship"
      && Math.hypot(s.player.x - L(entry.x, entry.z).x, s.player.z - L(entry.x, entry.z).z) < 0.08);
    await look("hatch-from-deck", [SHIP.x + entry.x + 1.2, DECK_Y + 3.8, SHIP.z + entry.z + 1.9], [SHIP.x + entry.x, DECK_Y - 0.8, SHIP.z + 0.45]);
    await hook(page, "follow");
    await shotReady(page, "follow view lined up for descent", s => s.camera.mode === "follow" && Math.abs(s.camera.pos.x - s.player.x) < 0.06);
    const upper = HOLD_RAMP.z1;
    const descent = [upper - 0.39, upper - 0.98, upper - 1.56, upper - 2.18, HOLD_PORTAL.enterZ - 0.16, HOLD_RAMP.z0 + 0.12];
    await hook(page, "timeScale", 0.18);
    await page.keyboard.down("ArrowUp");
    try {
      for (const [i, z] of descent.entries()) {
        const profile = z > HOLD_PORTAL.enterZ ? "pirate-ship" : "pirate-hold";
        const name = `down-0${i + 1}`;
        await shotReady(page, name, s => s.player.z <= SHIP.z + z && s.player.z >= SHIP.z + z - 0.22 && s.camera.profile === profile);
        await hook(page, "timeScale", 0);
        if (i === 4) await page.waitForFunction(() => !document.querySelector(".voyage-flash")?.getAnimations().some(a => a.playState === "running"),
          undefined, { timeout: 3000 }).catch(error => { throw new Error("HARNESS_PRECONDITION_FAILED - hold camera fade cleared", { cause: error }); });
        await detail(name);
        await hook(page, "timeScale", 0.18);
      }
      await shotReady(page, "walked onto the hold floor", s => s.player.z < SHIP.z + HOLD_RAMP.z0 - 0.45 && Math.abs(s.player.y - HOLD_Y) < 0.03 && s.camera.profile === "pirate-hold");
    } finally {
      await page.keyboard.up("ArrowUp");
      await hook(page, "timeScale", 1);
    }
    await look("from-stair-foot", [SHIP.x - 3.9, eyeY, SHIP.z - 1.57], [SHIP.x + 0.1, HOLD_Y + 1.07, SHIP.z - 8.7]);

    const far = { x: 2.6, z: -11.85 };
    await face(page, far, L(0, -5.8), true);
    await shotReady(page, "on the floor at the forward end", s => s.camera.profile === "pirate-hold" && Math.abs(s.player.y - HOLD_Y) < 0.03
      && Math.hypot(s.player.x - L(far.x, far.z).x, s.player.z - L(far.x, far.z).z) < 0.08);
    await look("from-forward-end", [SHIP.x + 2.6, eyeY, SHIP.z - 12.55], [SHIP.x, HOLD_Y + 1.05, SHIP.z - 5.8]);

    const bill = (await voyage(page)).crew.bill;
    await hook(page, "follow");
    await face(page, { x: SPOT.bill.x + 1.5, z: SPOT.bill.z }, bill, true);
    await shotReady(page, "Bill at his post on the hold floor", s => s.camera.profile === "pirate-hold" && s.mode === "explore" && s.focus?.id === "crew:bill");
    await look("bill", [bill.x + 1.45, HOLD_Y + 1.6, bill.z + 2.15], [bill.x, HOLD_Y + 1.12, bill.z]);
    await page.keyboard.press("KeyE");
    await shotReady(page, "Bill's job offer", s => Boolean(s.prompt?.buttons && s.prompt.status === "ready" && s.prompt.choices.includes("yesICan")));
    await tap(page, "yesICan");

    const canPlace = async (previous?: string) => {
      await expect.poll(async () => {
        const [s, v] = await Promise.all([state(page), voyage(page)]);
        return v.phase === "cargo" && v.hud?.title && v.hud.title !== previous && s.mode === "explore";
      }, { message: "HARNESS_PRECONDITION_FAILED - cargo placement ready", timeout: 15_000 }).toBeTruthy();
    };
    const whereReady = (s: Awaited<ReturnType<typeof state>>) => Boolean(s.prompt?.buttons && s.prompt.status === "ready" && s.prompt.question?.startsWith("Where is"));
    const seen = new Set<CargoItem>();
    async function placementShot(item: CargoItem, placement: Placement) {
      const { furniture, prep } = placement, at = (await voyage(page)).items[item];
      const lensY = prep === "under" ? HOLD_Y + 1.3 : eyeY;
      const dx = furniture === "shelf" || furniture === "door" ? 2.0 : -1.65;
      await look(`${item}-${prep}-${furniture}`, [at.x + dx, lensY, at.z + 0.95], [at.x, at.y + 0.43, at.z]);
      seen.add(item);
    }

    await canPlace();
    for (let i = 0; i < CARGO_PLACEMENTS.length; i++) {
      const v = await voyage(page), title = v.hud.title as string;
      const { item, placement } = holdInstruction(title);
      if (i === CARGO_PLACEMENTS.length - 1) {
        const missing = CARGO_ITEMS.find(it => it !== item && !seen.has(it));
        // A shuffled job can alternate between two items. Use a vacant slot
        // for the third item before completing the final instruction.
        if (missing) {
          const occupied = Object.values(v.cargo).filter(Boolean) as Placement[];
          const spare = CARGO_PLACEMENTS.find(p => placePhrase(p) !== placePhrase(placement)
            && !occupied.some(o => placePhrase(o) === placePhrase(p)))!;
          await placeHoldCargo(page, missing, spare);
          await shotReady(page, "finished Bill's placement hint", s => s.mode === "explore");
          await placementShot(missing, spare);
        }
      }
      await placeHoldCargo(page, item, placement);
      const question = i === 2 || i === 5;
      if (question) await shotReady(page, `where the ${item} was left`, whereReady);
      else await canPlace(title);
      await placementShot(item, placement);
      if (question) {
        await tap(page, placePhrase(placement));
        if (i === 2) await canPlace(title);
      }
    }
    await shotReady(page, "completed Bill's cargo job", s => s.mode === "explore" && s.progress.act3.voyage.jobs.includes("cargo"));
  });
}

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

/** Redbeard's close-ups: the line that starts one, and the line after which the view eases back out. */
const CLOSE_IN: Record<string, string> = {
  "Ahoy! I'm Captain Redbeard!": "r1-ahoy", "Monsters! Delicious!": "r2-delicious", "Your friends? Hmm...": "r3-friends",
  "My crew needs help. Talk to them!": "r4-crew-needs-help",
};
const CLOSE_OUT: Record<string, string> = {
  "Monsters! Delicious!": "r2-out", "My crew needs help. Talk to them!": "r4-out",
};

/** Sequential frames of the live camera while it moves (no frame stepping: the rig eases in real time). */
async function sequence(page: Page, name: string, track: Record<string, unknown[]>, ms = 1300) {
  const t0 = Date.now(), cams: unknown[] = [];
  for (let i = 0; Date.now() - t0 < ms; i++) {
    const s = await state(page) as any;
    cams.push({ t: Date.now() - t0, pos: s.camera.pos, target: s.camera.target, settled: s.camera.settled });
    await page.screenshot({ path: `${DIR}/${name}-${String(i).padStart(2, "0")}.jpg`, type: "jpeg", quality: 70 });
  }
  track[name] = cams;
}

type CaptureViz = {
  beat: string | null;
  progress: number;
  fade: number;
  grapples: { id: string; phase: string; progress: number }[];
};

async function captureFrame(page: Page, name: string, ready: (capture: CaptureViz) => boolean) {
  await voyageReady(page, name, (v) => ready(v.capture));
  await hook(page, "renderFrames", 2);
  await snap(page, name);
}

async function pepperCameraFrames(page: Page, name: string, inward: boolean) {
  await voyageReady(page, name, v => v.capture.beat === (inward ? "pepper-in" : "pepper-out"));
  const pepper = (await voyage(page)).crew.pepper;
  const complete = (s: Awaited<ReturnType<typeof state>>) => {
    const lens = Math.hypot(s.camera.pos.x - pepper.x, s.camera.pos.z - pepper.z);
    return inward ? lens < 2.05 : lens > 5.5;
  };
  const deadline = Date.now() + 15_000;
  for (let i = 0; ; i++) {
    const s = await state(page);
    await page.screenshot({ path: `${DIR}/${name}-${String(i).padStart(2, "0")}.jpg`, type: "jpeg", quality: 70 });
    if (complete(s)) break;
    if (Date.now() > deadline) throw new Error(`HARNESS_PRECONDITION_FAILED - ${name} camera endpoint`);
  }
}

for (const [w, h] of [[1366, 768], [1280, 800]] as const) {
  test(`capture hooks, deck wides and Pepper at ${w}x${h}`, async ({ page }) => {
    test.skip(ONLY !== "capture2");
    test.setTimeout(900_000);
    const vp = `${w}x${h}-capture2`, bag: Record<string, number> = { apples: 2, fish: 1 };
    const frame = (name: string, ready: (capture: CaptureViz) => boolean) => captureFrame(page, `${vp}-${name}`, ready);
    const samples = async (beat: string, at: number[]) => {
      for (const k of at) await frame(`${beat}-${Math.round(k * 100)}`, c => c.beat === beat && c.progress >= k);
    };
    const advance = () => page.keyboard.press("Space");
    await page.setViewportSize({ width: w, height: h });
    await page.addInitScript(v => { if (!localStorage.getItem("mi.save.v4")) localStorage.setItem("mi.save.v4", v); }, JSON.stringify(save(bag)));
    await boot(page, "");
    await chooseMode(page, "tap");
    await page.getByTestId("btn-continue").click();
    await shotReady(page, "loaded the departure save", s => s.mode === "explore");
    await hook(page, "openCloudShip", true);
    await hook(page, "openPirateVoyage", true);
    await hook(page, "goTo", "harbor", 1.4);
    await shotReady(page, "at Gull for departure", s => s.focus?.id === "harbor" && s.mode === "explore");
    await page.keyboard.press("KeyE");

    let last = "";
    const deadline = Date.now() + 820_000;
    for (;;) {
      const st = await state(page);
      if (st.mode === "explore" && st.progress.act3.voyage.stage === "captured") break;
      if (Date.now() > deadline) throw new Error("HARNESS_PRECONDITION_FAILED - capture checkpoint reached");
      const v = await voyage(page);
      if (v.spyPrompt && !st.line) {
        await page.keyboard.press("KeyE");
        await voyageReady(page, "spyglass input acknowledged", next => next.spyPrompt !== v.spyPrompt);
        continue;
      }
      if (st.line && st.line.en !== last) {
        last = st.line.en;
        switch (last) {
          case "Oh no! The ship is in the way!":
            await hook(page, "timeScale", 0.14);
            await advance();
            await samples("turn", [0.18, 0.48, 0.81]);
            break;
          case "Stop! Stop that boat!":
            await frame("order", c => c.beat === "order");
            await advance();
            await samples("step", [0.45]);
            for (const [i, id] of ["tom", "sam", "max"].entries()) {
              await frame(`${id}-overhead`, c => c.beat === "throw" && c.grapples.some(g => g.id === id &&
                g.phase === "raise" && c.progress >= [0.12, 0.35, 0.58][i]));
              await frame(`${id}-lunge`, c => c.beat === "throw" && c.grapples.some(g => g.id === id && g.phase === "lunge"));
              await frame(`${id}-flight`, c => c.beat === "throw" && c.grapples[i]?.phase === "flight"
                && c.grapples[i].progress >= 0.25 && (i === 0 || c.grapples[i - 1].phase === "attached"));
            }
            break;
          case "Ropes, crew! Pull them in!":
            await frame("landed", c => c.beat === "landed" && c.grapples.length === 3 && c.grapples.every(g => g.phase === "attached"));
            await advance();
            await samples("haul", [0.18, 0.5, 0.86]);
            break;
          case "Bring them here!":
            await frame("alongside", c => c.beat === "alongside");
            await advance();
            await expect.poll(async () => {
              const { capture } = await voyage(page);
              return capture.beat === "reveal" && capture.fade === 0
                && await page.locator(".fade").evaluate(el => Number(getComputedStyle(el).opacity) < 0.03);
            }, { timeout: 15_000, intervals: [50], message: "HARNESS_PRECONDITION_FAILED - boarding fade cleared in the reveal" }).toBe(true);
            await snap(page, `${vp}-reveal`);
            await samples("encircle", [0.3, 0.78]);
            await hook(page, "timeScale", 1);
            break;
          case "What's that? Monsters!":
            await frame("monsters-wide", c => c.beat === "monsters-wide");
            await advance();
            break;
          case "Monsters! Delicious!":
            await advance();
            await pepperCameraFrames(page, `${vp}-pepper-in`, true);
            break;
          case "Monster soup!":
            await hook(page, "timeScale", 0.25);
            await advance();
            await pepperCameraFrames(page, `${vp}-pepper-out`, false);
            await hook(page, "timeScale", 1);
            break;
          default:
            if (last.endsWith("! Yummy! Thank you!") || last === "No food?! Oh no! We are so hungry!") {
              await hook(page, "timeScale", 0.35);
              await advance();
              await samples("interrogation-wide", [0.8]);
              await hook(page, "timeScale", 1);
            } else await advance();
        }
      } else if (st.prompt?.buttons && st.prompt.status === "ready") {
        const c = st.prompt.choices, q = st.prompt.question ?? "";
        const food = Object.keys(bag).find(f => q.includes(f));
        const said = st.prompt.kind === "command" ? c.find(id => (PHRASES as any)[id]?.en === st.prompt!.sentences[0]) : undefined;
        const pick = said ?? (c.includes("yesIDo") ? (food && bag[food] ? "yesIDo" : "noIDont")
          : c.includes("yesTheyCan") ? "yesTheyCan" : c.includes("iCanSeeAShip") ? "iCanSeeAShip" : c[0]);
        await tap(page, pick);
        last = "";
      } else if (!st.line) last = "";
      await hook(page, "renderFrames", 2);
    }
    expect((await voyage(page)).cutSails).toBe(1);
    await snap(page, `${vp}-free-roam`);
  });
}

for (const [w, h] of [[1366, 768], [1280, 800]] as const) {
  test(`Redbeard close-ups at ${w}x${h} (capture, normal speed)`, async ({ page }) => {
    test.skip(ONLY !== "redbeard");
    test.setTimeout(900_000);
    const vp = `${w}x${h}`, track: Record<string, unknown[]> = {};
    await page.setViewportSize({ width: w, height: h });
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
    let last = "";
    const t0 = Date.now();
    for (;;) {
      const st = await state(page) as any;
      if (st.mode === "explore" && st.progress.act3.voyage.stage === "captured") break;
      if (Date.now() - t0 > 840_000) throw new Error("capture did not finish");
      const sp = await hook(page, "voyage") as any;
      if (sp.spyPrompt && !st.line) { await page.keyboard.press("KeyE"); await page.waitForTimeout(150); continue; }
      if (st.line && st.line.en !== last) {
        last = st.line.en;
        if (CLOSE_IN[last]) await sequence(page, `${vp}-${CLOSE_IN[last]}`, track);
        await page.keyboard.press("Space");
        if (CLOSE_OUT[last]) await sequence(page, `${vp}-${CLOSE_OUT[last]}`, track);
      } else if (st.prompt?.buttons && st.prompt.status === "ready") {
        const c = st.prompt.choices as string[], q = st.prompt.question ?? "";
        if (c.includes("yesIDo") || c.includes("yesTheyCan")) { await hook(page, "renderFrames", 4); await snap(page, `${vp}-r-prompt-${c[0]}`); }
        const food = Object.keys(bag).find(f => q.includes(f));
        const said = st.prompt.kind === "command" ? c.find(id => (PHRASES as any)[id]?.en === st.prompt.sentences[0]) : undefined;
        const pick = said ?? (c.includes("yesIDo") ? (food && bag[food] ? "yesIDo" : "noIDont") : c.includes("yesTheyCan") ? "yesTheyCan" : c.includes("iCanSeeAShip") ? "iCanSeeAShip" : c[0]);
        await tap(page, pick);
        last = "";
      } else if (!st.line) last = "";
      await page.waitForTimeout(120);
    }
    await (await import("node:fs/promises")).writeFile(`${DIR}/${vp}-camera-track.json`, JSON.stringify(track, null, 1));
  });

  test(`Redbeard close-up at ${w}x${h} (sailing job)`, async ({ page }) => {
    test.skip(ONLY !== "redbeard");
    test.setTimeout(300_000);
    const vp = `${w}x${h}`, track: Record<string, unknown[]> = {};
    await boardForShots(page);
    await page.setViewportSize({ width: w, height: h });
    const v = await voyage(page);
    await face(page, { x: SPOT.captain.x + 1, z: 10.3 }, v.crew.redbeard);
    await shotReady(page, "at Redbeard", s => s.focus?.id === "crew:redbeard" && s.mode === "explore");
    await page.keyboard.press("KeyE");
    await shotReady(page, "the wind line", s => s.line?.en === "The wind is gone! Can you make wind?");
    await sequence(page, `${vp}-r5-sailing-in`, track);
    await page.keyboard.press("Space");
    await shotReady(page, "yes I can", s => Boolean(s.prompt?.buttons && s.prompt.status === "ready" && s.prompt.choices.includes("yesICan")));
    await snap(page, `${vp}-r5-sailing-prompt`);
    await tap(page, "yesICan");
    await sequence(page, `${vp}-r5-sailing-out`, track);
    await (await import("node:fs/promises")).writeFile(`${DIR}/${vp}-sailing-track.json`, JSON.stringify(track, null, 1));
  });
}
