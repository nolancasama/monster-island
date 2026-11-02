import { expect, test, type Page } from "@playwright/test";
import { boot, chooseMode, hook, state, waitFor } from "./helpers";
import { newProgress } from "../../src/game/logic/progress";

const SHOTS = ".tmp/shots/map";

async function onBeach(page: Page) {
  const p = newProgress();
  p.metMaple = true;
  await page.addInitScript(save => localStorage.setItem("mi.save.v4", save),
    JSON.stringify({ v: 4, progress: p, player: { x: 8, z: 0, yaw: Math.PI / 2 }, seconds: 60 }));
  await boot(page);
  await chooseMode(page, "tap");
  await page.getByTestId("btn-continue").click();
  await waitFor(page, s => s.mode === "explore", 60_000, "exploring the beach");
}

test("the beach, palm, pier, bridge and stone are framed side-on", async ({ page }) => {
  await onBeach(page);
  for (const [name, x, z] of [["west", -16, 0], ["palm", -1, 1.2], ["east", 10, 0], ["pier", 12, 8], ["bridge", 24.5, -1], ["stone", 33, 0]] as const) {
    await hook(page, "teleport", x, z, Math.PI / 2);
    await page.waitForTimeout(1200);
    const s = await state(page) as unknown as { camera: { yaw: number; profile: string } };
    expect(s.camera.yaw, name).toBeCloseTo(0, 5);
    await page.screenshot({ path: `${SHOTS}/beach-${name}.png` });
  }
});

test("D walks east, A walks west, and the view never turns", async ({ page }) => {
  await onBeach(page);
  await hook(page, "teleport", 8, 0, Math.PI / 2);
  await page.waitForTimeout(600);
  const start = (await state(page)).player.x;
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(800);
  await page.keyboard.up("KeyD");
  const east = await state(page) as unknown as { player: { x: number }; camera: { yaw: number } };
  expect(east.player.x).toBeGreaterThan(start);
  expect(east.camera.yaw).toBeCloseTo(0, 5);
  await page.keyboard.down("KeyA");
  await page.waitForTimeout(800);
  await page.keyboard.up("KeyA");
  const west = await state(page) as unknown as { player: { x: number }; camera: { yaw: number } };
  expect(west.player.x).toBeLessThan(east.player.x);
  expect(west.camera.yaw).toBeCloseTo(0, 5);
});
