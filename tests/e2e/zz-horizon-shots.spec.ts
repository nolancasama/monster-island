// Evidence only. SHOT_TAG=local SHOT_ONLY=horizon npx playwright test zz-horizon-shots
import { expect, test, type Page } from "@playwright/test";
import { BOAT_OUT } from "../../src/game/flow/voyageEncounter";
import { newProgress } from "../../src/game/logic/progress";
import { BOAT_DECK_Y, BOAT_SCALE } from "../../src/game/world/gullBoat";
import { GULL_BERTH, STAGES } from "../../src/game/world/lowland";
import { SHIP, SPOT } from "../../src/game/world/pirateShip";
import { boot, chooseMode, hook, state, tap, waitFor } from "./helpers";

const tag = process.env.SHOT_TAG;
const dir = `.tmp/shots/horizon/${tag}`;
test.skip(!tag || Boolean(process.env.SHOT_ONLY && process.env.SHOT_ONLY !== "horizon"), "horizon evidence only");
test.use({ viewport: { width: 1366, height: 768 } });

type Point = [number, number, number];
type Voyage = {
  active: boolean;
  sea: boolean;
  phase: string | null;
  boat: { active: boolean; x: number; z: number; yaw: number };
  ship: { x: number; z: number; sink: number };
};
const voyage = async (page: Page) => await hook(page, "voyage") as Voyage;
const precondition = (name: string) => `HARNESS_PRECONDITION_FAILED - ${name}`;

function portSave() {
  const p = newProgress();
  for (const id of ["leafy", "bubbo", "puff", "ember", "lumo"] as const)
    p.monsters[id] = { discovered: true, friend: true, asked: {}, canKnown: {}, described: { name: true, size: true, part: true }, invited: true };
  p.active = "leafy";
  p.metMaple = true;
  p.endings = 3;
  p.solved = ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame", "canopyAscentRope", "canopyVines", "canopyRope"];
  p.act2 = { ...p.act2, started: true, lumoTaken: true, descended: true, portFound: true,
    bought: true, harbor: true, checkpoint: "port", cleared: [...STAGES] };
  return { v: 4, progress: p, player: { x: 71.5, z: -315.5, yaw: Math.PI }, seconds: 3000 };
}

async function debugJump(page: Page, button: string) {
  await page.keyboard.press("Backquote");
  await expect(page.getByTestId("debug-menu"), precondition("debug menu is open")).toBeVisible();
  await page.getByTestId(button).click();
  await page.getByRole("button", { name: "Close debug menu" }).click();
}

async function lookAndShoot(page: Page, name: string, pos: Point, target: Point, factor: (k: number) => boolean) {
  // A running scene can still set its own shot for a frame or two: re-issue the look until it holds.
  await expect.poll(async () => {
    await hook(page, "look", pos, target);
    await hook(page, "renderFrames", 2);
    const s = await state(page);
    return Math.hypot(s.camera.pos.x - pos[0], s.camera.pos.y - pos[1], s.camera.pos.z - pos[2]) < 0.1;
  }, { message: precondition(`${name} camera reaches its shot`), timeout: 15_000 }).toBe(true);
  await hook(page, "renderFrames", 2);
  const canvas = page.locator(".scene canvas");
  await expect.poll(async () => {
    const k = await canvas.getAttribute("data-voyage-open-sea");
    return k !== null && factor(Number(k));
  }, { message: `${name} horizon factor` }).toBe(true);
  await page.screenshot({ path: `${dir}/${name}.png` });
}

async function coastShot(page: Page, name: string, factor: (k: number) => boolean) {
  const { boat } = await voyage(page);
  await lookAndShoot(page, name,
    [boat.x + 5, 4.6, boat.z - 12], [boat.x - 2, 2.6, boat.z + 26], factor);
}

test("the home coastline recedes during the pirate voyage", async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(save => localStorage.setItem("mi.debug.save", save), JSON.stringify(portSave()));
  await boot(page, "fast=1&debug=1");
  await chooseMode(page, "tap");
  await page.getByTestId("btn-continue").click();
  await waitFor(page, s => s.mode === "explore", 30_000, precondition("Port Town save loaded"));
  await hook(page, "openCloudShip", true);
  await hook(page, "openPirateVoyage", true);
  await hook(page, "goTo", "harbor", 1.4);
  await waitFor(page, s => s.focus?.id === "harbor", 15_000, precondition("Gull is in range"));
  await page.keyboard.press("KeyE");
  await tap(page, "yesIAm");
  await waitFor(page, s => Boolean(s.prompt?.buttons && s.prompt.choices.includes("letsGo")),
    15_000, precondition("departure prompt shows"));
  await hook(page, "timeScale", 0);
  await tap(page, "letsGo");
  await expect.poll(async () => {
    const v = await voyage(page);
    return v.sea && v.boat.active && Math.abs(v.boat.z - GULL_BERTH.z) < 0.1;
  }, { message: precondition("Gull's boat departs from its berth") }).toBe(true);
  await coastShot(page, "01-departure", k => k === 0);

  // Cancel the paused script, then sample authored outbound and encounter poses.
  await debugJump(page, "debug-jump-voyage");
  await hook(page, "timeScale", 1);
  for (const [name, progress] of [["02-leaving-the-point", 0], ["03-travelling", 0.24], ["04-haze", 0.42], ["05-open-sea", 0.85]] as const) {
    const pose = BOAT_OUT.at(progress * BOAT_OUT.length);
    await hook(page, "encounterPose", "out", progress);
    await expect.poll(async () => {
      const v = await voyage(page);
      return v.sea && v.boat.active && !v.active && Math.hypot(v.boat.x - pose.x, v.boat.z - pose.z) < 0.1;
    }, { message: precondition(`${name} is on the outbound route`) }).toBe(true);
    await coastShot(page, name, k => progress === 0.85 ? k === 1 : k > 0 && k < 1);
  }

  await hook(page, "encounterPose", "watch", 0);
  const watch = await voyage(page);
  expect(watch.active && watch.ship.sink > 4, precondition("the distant ship is at its first sighting")).toBe(true);
  const { x, z, yaw } = watch.boat;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  await lookAndShoot(page, "06-masts-on-the-horizon",
    [x + (-3.2 * fx + 1.45 * fz) * BOAT_SCALE, -0.1 + BOAT_DECK_Y + 2.9, z + (-3.2 * fz - 1.45 * fx) * BOAT_SCALE],
    [watch.ship.x, 4.5 - watch.ship.sink * 0.6, watch.ship.z], k => k === 1);

  await hook(page, "encounterPose", "pull", 0);
  const intercept = await voyage(page);
  expect(intercept.active && intercept.boat.active && intercept.ship.sink === 0,
    precondition("the vessels are at the interception")).toBe(true);
  await lookAndShoot(page, "07-interception", [SHIP.x + 13, 10, SHIP.z - 43],
    [SHIP.x + 2, 5, SHIP.z + 3], k => k === 1);

  await debugJump(page, "debug-voyage-jobs");
  await waitFor(page, s => s.mode === "explore" && s.progress.act3.voyage.stage === "jobs",
    15_000, precondition("ship jobs checkpoint is ready"));
  const finn = { x: SHIP.x + SPOT.finn.x, z: SHIP.z + SPOT.finn.z };
  const stand = { x: finn.x + 1.3, z: SHIP.z + 16.7 };
  await hook(page, "teleport", stand.x, stand.z, Math.atan2(finn.x - stand.x, finn.z - stand.z), true);
  await waitFor(page, s => s.focus?.id === "crew:finn", 15_000, precondition("Fisher Finn is in range"));
  await page.keyboard.press("KeyE");
  await tap(page, "yesICan");
  await tap(page, "yesICan");
  await tap(page, "howManyFish");
  await expect.poll(async () => (await voyage(page)).phase,
    { message: precondition("the fishing job is running") }).toBe("fishing");
  await lookAndShoot(page, "08-fishing-job", [SHIP.x + 14, 8, SHIP.z + 2],
    [SHIP.x + 1, 2.8, SHIP.z + 19], k => k === 1);

  await debugJump(page, "debug-jump-voyage");
  await waitFor(page, s => s.mode === "explore" && s.progress.act3.world === "home",
    15_000, precondition("returned to home exploration"));
  await expect.poll(async () => (await voyage(page)).sea,
    { message: precondition("the voyage has ended") }).toBe(false);
  await lookAndShoot(page, "09-home-exploration", [GULL_BERTH.x + 5, 5, GULL_BERTH.z - 5],
    [GULL_BERTH.x - 3, 3, GULL_BERTH.z + 23], k => k === 0);
});
