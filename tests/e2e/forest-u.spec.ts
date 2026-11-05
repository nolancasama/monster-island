import { expect, test, type Page } from "@playwright/test";
import { boot, chooseMode, hook, state, waitFor } from "./helpers";
import { newProgress } from "../../src/game/logic/progress";
import { FOREST_ARMS, STAGES } from "../../src/game/world/lowland";

const SHOTS = ".tmp/shots/map";

async function enterForest(page: Page) {
  const p = newProgress();
  for (const id of ["leafy", "bubbo", "puff", "ember", "lumo"] as const)
    p.monsters[id] = { discovered: true, friend: true, asked: {}, canKnown: {}, described: { name: true, size: true, part: true }, invited: true };
  p.active = "ember"; p.metMaple = true; p.endings = 3;
  p.solved = ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame"];
  p.act2 = { ...p.act2, started: true, lumoTaken: true, descended: true, zone: "forest1", checkpoint: "cliff", cleared: [...STAGES],
    tutorial: ["attack", "coins", "special", "eat", "rest", "switch"] };
  await page.addInitScript(save => localStorage.setItem("mi.save.v4", save),
    JSON.stringify({ v: 4, progress: p, player: { x: 75, z: -160, yaw: Math.PI }, seconds: 3000 }));
  const errors = await boot(page);
  await chooseMode(page, "tap");
  await page.getByTestId("btn-continue").click();
  await waitFor(page, s => s.mode === "explore" && s.act2.zone === "forest1", 30_000, "in the forest");
  return errors;
}

test("the U from the base and along both arms, in budget", async ({ page }) => {
  const errors = await enterForest(page);
  const views: Array<[string, number, number]> = [
    ["u-base", 75, -176],
    ["u-left-start", ...(FOREST_ARMS.left[1] as [number, number])],
    ["u-left-mid", ...(FOREST_ARMS.left[2] as [number, number])],
    ["u-left-end", ...(FOREST_ARMS.left[4] as [number, number])],
    ["u-right-start", ...(FOREST_ARMS.right[1] as [number, number])],
    ["u-right-mid", ...(FOREST_ARMS.right[2] as [number, number])],
    ["u-right-end", ...(FOREST_ARMS.right[3] as [number, number])],
    ["u-former-camp-forest", 88, -160],
  ];
  for (const [name, x, z] of views) {
    await hook(page, "teleport", x, z, Math.PI);
    await page.waitForTimeout(1500);
    const s = await state(page) as unknown as { perf?: { calls: number; triangles: number } };
    console.log(name, JSON.stringify(s.perf ?? null));
    await page.screenshot({ path: `${SHOTS}/${name}.png` });
  }
  expect(errors).toEqual([]);
});
