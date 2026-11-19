import { expect, test, type Page } from "@playwright/test";
import { MOORED_POSE } from "../../src/game/flow/voyageEncounter";
import { newProgress } from "../../src/game/logic/progress";
import { STEER_ANSWER_Z } from "../../src/game/logic/steerPath";
import type { Lane, SteerCommand } from "../../src/game/logic/voyage";
import { STAGES } from "../../src/game/world/lowland";
import { DECK_Y, MASTS, SHIP, SPOT } from "../../src/game/world/pirateShip";
import { boot, chooseMode, hook, tap, waitFor, type MiState } from "./helpers";

const DIR = ".tmp/shots/steer";
const TIMEOUT = 30_000;
const SHOT_SPEED = 0.04;

interface VoyageState {
  active: boolean;
  phase: string | null;
  lane: Lane;
  sails: number[];
  boat: { x: number; z: number; yaw: number };
  ship: { yaw: number };
  obstacles: Array<{ lane: Lane; z: number }>;
}

type SteeringHook = { __mi: { state(): MiState; voyage(): VoyageState; timeScale(k: number): void } };
const voyage = (page: Page) => hook(page, "voyage") as Promise<VoyageState>;

function portSave() {
  const progress = newProgress();
  for (const id of ["leafy", "bubbo", "puff", "ember", "lumo"] as const) {
    progress.monsters[id] = { discovered: true, friend: true, asked: {}, canKnown: {}, described: { name: true, size: true, part: true }, invited: true };
  }
  progress.active = "puff";
  progress.metMaple = true;
  progress.endings = 3;
  progress.solved = ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame", "canopyAscentRope", "canopyVines", "canopyRope"];
  progress.act2 = { ...progress.act2, started: true, lumoTaken: true, descended: true, portFound: true, bought: true, harbor: true,
    checkpoint: "port", cleared: [...STAGES], tutorial: ["attack", "coins", "special", "eat", "rest", "switch"], coins: 100 };
  return { v: 4, progress, player: { x: 71.5, z: -315.5, yaw: Math.PI }, seconds: 3000 };
}

async function precondition<T>(label: string, wait: () => Promise<T>): Promise<T> {
  try {
    return await wait();
  } catch (cause) {
    throw new Error(`HARNESS_PRECONDITION_FAILED - ${label}`, { cause });
  }
}

async function standFacing(page: Page, x: number, z: number, tx: number, tz: number) {
  await hook(page, "teleport", SHIP.x + x, SHIP.z + z, Math.atan2(tx - x, tz - z), true);
}

async function openSteering(page: Page) {
  await page.addInitScript((save) => {
    if (!localStorage.getItem("mi.save.v4")) localStorage.setItem("mi.save.v4", save);
  }, JSON.stringify(portSave()));
  await boot(page, "fast=1");
  await chooseMode(page, "tap");
  await page.getByTestId("btn-continue").click();
  await waitFor(page, (s) => s.mode === "explore", TIMEOUT, "save loaded");
  await hook(page, "openCloudShip", true);
  await hook(page, "openPirateVoyage", true);
  await hook(page, "voyageJump", "jobs");
  await expect.poll(async () => (await voyage(page)).active, { timeout: TIMEOUT }).toBe(true);
  await standFacing(page, SPOT.captain.x + 1, 10.3, SPOT.captain.x, SPOT.captain.z);
  await waitFor(page, (s) => s.mode === "explore" && s.focus?.id === "crew:redbeard", TIMEOUT, "Redbeard in reach");
  await page.keyboard.press("KeyE");
  await tap(page, "yesICan");
  await expect.poll(async () => (await voyage(page)).phase, { timeout: TIMEOUT }).toBe("sails");

  const masts = [MASTS.mizzen, MASTS.main, MASTS.fore];
  for (const [i, mast] of masts.entries()) {
    await standFacing(page, 0, i === 2 ? -11.6 : 6, mast.x + 0.4, mast.z + 2);
    for (let j = 0; j < 3; j++) {
      await page.keyboard.press("KeyJ");
      await expect.poll(async () => (await voyage(page)).sails[i], { timeout: TIMEOUT })
        .toBeGreaterThanOrEqual([0.45, 0.79, 0.99][j]);
    }
  }
}

async function awaitPrompt(page: Page, command: SteerCommand, lane: Lane, obstacle: Lane) {
  await precondition(`${command} prompt, lane ${lane}, obstacle ${obstacle}, stern view with Gull alongside`, async () => {
    await page.waitForFunction(({ command, lane, obstacle, ship, moored, deckY, answerZ }) => {
      const api = (window as unknown as SteeringHook).__mi;
      const { prompt, camera } = api.state(), v = api.voyage();
      return prompt?.status === "ready" && prompt.buttons && prompt.choices.includes(command)
        && v.phase === "steer-approach" && v.lane === lane && v.obstacles[0]?.lane === obstacle && v.obstacles[0]?.z === answerZ
        && Math.hypot(v.boat.x - moored.x, v.boat.z - moored.z) < 0.01 && Math.cos(v.boat.yaw - moored.h) > 0.999
        && !v.ship.yaw && camera.mode === "shot"
        && Math.hypot(camera.pos.x - ship.x + 11, camera.pos.y - deckY - 30, camera.pos.z - ship.z - 36) < 1
        && Math.hypot(camera.target.x - ship.x - 1, camera.target.z - ship.z + 30) < 1;
    }, { command, lane, obstacle, ship: SHIP, moored: MOORED_POSE, deckY: DECK_Y, answerZ: STEER_ANSWER_Z }, { timeout: TIMEOUT });
  });
}

type Frame = { phase: string; atLeastZ?: number; atMostZ?: number; after?: number };

/** Observe the animation clock and freeze on the browser side so screenshots cannot skip the bump. */
async function capture(page: Page, name: string, frame: Frame): Promise<number> {
  const handle = await precondition(`frame ${name} reached ${JSON.stringify(frame)}`, async () => {
    await hook(page, "timeScale", SHOT_SPEED);
    return page.waitForFunction(({ phase, atLeastZ, atMostZ, after }) => {
      const api = (window as unknown as SteeringHook).__mi;
      const v = api.voyage(), s = api.state(), obstacle = v.obstacles[0];
      if (!obstacle || v.phase !== phase || s.camera.mode !== "shot"
        || (atLeastZ !== undefined && obstacle.z < atLeastZ) || (atMostZ !== undefined && obstacle.z > atMostZ)
        || (after !== undefined && s.time < after)) return false;
      api.timeScale(0);
      return { time: s.time };
    }, frame, { timeout: TIMEOUT });
  });
  const { time } = await handle.jsonValue() as { time: number };
  await handle.dispose();
  await hook(page, "renderFrames", 2);
  await page.screenshot({ path: `${DIR}/${name}.png` });
  return time;
}

async function attempt(page: Page, command: SteerCommand, lane: Lane, obstacle: Lane, safe: boolean, evidence = true) {
  await awaitPrompt(page, command, lane, obstacle);
  const name = `${command}-${safe ? "clear" : "bump"}`;
  if (evidence) await capture(page, `${name}-00-prompt`, { phase: "steer-approach", atLeastZ: STEER_ANSWER_Z });
  await precondition(`${name} answer submitted`, () => tap(page, command));
  if (evidence) {
    await capture(page, `${name}-01-approach`, { phase: "steer-pass", atLeastZ: -54 });
    await capture(page, `${name}-02-manoeuvre`, { phase: "steer-pass", atLeastZ: -45 });
    await capture(page, `${name}-03-lane`, { phase: "steer-pass", atLeastZ: -33 });
    if (safe) {
      await capture(page, `${name}-04-bow`, { phase: "steer-pass", atLeastZ: -19 });
      await capture(page, `${name}-05-amidships`, { phase: "steer-pass", atLeastZ: MOORED_POSE.z - SHIP.z });
      await capture(page, `${name}-06-stern`, { phase: "steer-pass", atLeastZ: 14 });
    } else {
      const contact = await capture(page, `${name}-04-contact`, { phase: "steer-bump" });
      await capture(page, `${name}-05-wobble`, { phase: "steer-bump", after: contact + 0.017 });
      await capture(page, `${name}-06-retreat`, { phase: "steer-retreat", atMostZ: -30 });
    }
  }
  await hook(page, "timeScale", 1);
}

test.use({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });

test("sailing job steering from the helm, one pass and one bump per command", async ({ page }) => {
  test.setTimeout(300_000);
  await precondition("sailing job started from the jobs checkpoint and all sails filled", () => openSteering(page));
  await attempt(page, "goStraight", 0, 0, false);
  await attempt(page, "turnLeft", 0, 0, true);
  await attempt(page, "turnRight", -1, 0, false);
  await attempt(page, "turnLeft", 0, -1, false);
  // Move back to the middle on the same barrel before taking the safe right turn.
  await attempt(page, "turnRight", -1, 0, false, false);
  await attempt(page, "turnRight", 0, -1, true);
  await attempt(page, "goStraight", 1, 0, true);
  await awaitPrompt(page, "turnRight", 1, 0);
});
