import { expect, test, type Page } from "@playwright/test";
import { boot, chooseMode, hook, state, waitFor } from "./helpers";
import { newProgress } from "../../src/game/logic/progress";

const SHOTS = ".tmp/shots/map";

async function atCoast(page: Page, cleared: string[], portFound = false) {
  const p = newProgress();
  for (const id of ["leafy", "bubbo", "puff", "ember", "lumo"] as const)
    p.monsters[id] = { discovered: true, friend: true, asked: {}, canKnown: {}, described: { name: true, size: true, part: true }, invited: true };
  p.active = "ember"; p.metMaple = true; p.endings = 3;
  p.solved = ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame"];
  p.act2 = { ...p.act2, started: true, lumoTaken: true, descended: true, portFound, harbor: portFound, zone: "coast", checkpoint: "cliff",
    cleared: cleared as typeof p.act2.cleared, tutorial: ["attack", "coins", "special", "eat", "rest", "switch"] };
  await page.addInitScript(save => localStorage.setItem("mi.save.v4", save),
    JSON.stringify({ v: 4, progress: p, player: { x: 76, z: -279, yaw: Math.PI }, seconds: 3000 }));
  const errors = await boot(page);
  await chooseMode(page, "tap");
  await page.getByTestId("btn-continue").click();
  await waitFor(page, s => s.mode === "explore" && s.act2.zone === "coast", 30_000, "on the coast");
  await hook(page, "combatFixture", { enemies: [] });
  return errors;
}

test("closed before the coast is cleared: the player is stopped at the doors", async ({ page }) => {
  const errors = await atCoast(page, ["forest1", "grove", "canopy", "causeway"]);
  await hook(page, "teleport", 76, -283, Math.PI);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/gate-closed.png` });
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(3500);
  await page.keyboard.up("KeyW");
  const s = await state(page);
  expect(s.player.z).toBeGreaterThan(-288.4);
  expect(s.act2.zone).toBe("coast");
  expect(errors).toEqual([]);
});

test("cleared: the doors open on approach, the player walks into town and can leave again", async ({ page }) => {
  const errors = await atCoast(page, ["forest1", "grove", "canopy", "causeway", "coast"]);
  await hook(page, "teleport", 76, -283, Math.PI);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/gate-open.png` });
  await hook(page, "teleport", 76, -286, Math.PI);
  await page.keyboard.down("KeyW");
  const inside = await waitFor(page, s => s.act2.zone === "port" || s.mode !== "explore", 40_000, "through the gate");
  await page.keyboard.up("KeyW");
  expect(inside.player.z).toBeLessThan(-288.4);
  await waitFor(page, s => s.mode === "explore", 90_000, "arrival finished");
  const arrived = await state(page);
  expect(arrived.progress.act2.portFound).toBe(true);
  await hook(page, "teleport", 76, -292, 0);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/gate-inside.png` });
  await hook(page, "teleport", 62, -291, 0);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/gate-inside-west.png` });
  await hook(page, "teleport", 76, -290.5, 0);
  await page.keyboard.down("KeyS");
  await waitFor(page, s => s.act2.zone === "coast", 30_000, "back out to the coast");
  await page.keyboard.up("KeyS");
  expect(errors).toEqual([]);
});

test("a save that has found the port has the gate open already", async ({ page }) => {
  await atCoast(page, ["forest1", "grove", "canopy", "causeway", "coast"], true);
  await hook(page, "teleport", 90, -283, Math.PI);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/gate-wall-east.png` });
  await hook(page, "teleport", 62, -281, Math.PI);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/gate-wall-west.png` });
  await hook(page, "teleport", 76, -287, Math.PI);
  await page.keyboard.down("KeyW");
  await waitFor(page, s => s.act2.zone === "port", 30_000, "walks straight in");
  await page.keyboard.up("KeyW");
});
