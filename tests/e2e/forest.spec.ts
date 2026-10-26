import { expect, test, type Page } from "@playwright/test";
import { boot, chooseMode, hook, state, tap, use, waitFor } from "./helpers";

/**
 * Phase 2 (the Forest) in mic-free mode, through the real UI, starting from a
 * class's Phase 1 save (v1: it must migrate, not be discarded): the bramble is
 * gone, the bridge needs Leafy (a switch back from Bubbo), Puff is called down
 * with "Come here!" and described (colour, size, wings), befriended and
 * invited with "Let's go!", flies the rope up the cliff, is thanked, and the
 * cliff top ends the phase.
 */

const record = (friend: boolean, asked: Record<string, boolean>) => ({ discovered: true, asked, friend, canKnown: {} });
const empty = { discovered: false, asked: {}, friend: false, canKnown: {} };
/** A Phase 1 build's save at the end of the beach (v1: `finished`, no journal lines). */
const V1_SAVE = JSON.stringify({
  v: 1,
  progress: {
    monsters: { leafy: record(true, { apples: true }), bubbo: record(true, { fish: true }), puff: empty, ember: empty },
    active: "bubbo",
    bag: {},
    solved: ["fallenPalm", "river"],
    metMaple: true,
    finished: true,
    said: ["itsGreen", "likeApples", "canHelp", "itsBlue", "likeFish", "canSwim"]
  },
  player: { x: 33.6, z: -6.5, yaw: Math.PI },
  seconds: 900
});

async function continueFrom(page: Page, save: string) {
  await page.addInitScript((s) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("mi.save.v1", s);
      sessionStorage.setItem("seeded", "1");
    }
  }, save);
  const errors = await boot(page);
  await chooseMode(page, "tap");
  await page.getByTestId("btn-continue").click();
  await waitFor(page, (s) => s.screen === "game" && s.mode === "explore", 15_000, "continued");
  return errors;
}

test("the forest: bridge, Puff, the cliff and the cliff-top ending (mic-free, from a Phase 1 save)", async ({ page }) => {
  // Full chapter plus return trip; SwiftShader can exceed the default 180s.
  test.setTimeout(360_000);
  const errors = await continueFrom(page, V1_SAVE);
  let s = await state(page);
  // The v1 save migrated: the beach is done and the forest is open.
  expect(s.progress.endings).toBe(1);
  expect(s.bramble).toBeLessThan(0.05);
  expect(s.objective).toMatchObject({ id: "obstacle", obstacle: "bridge", helper: "leafy" });

  // Walk up the forest path with the keyboard (no teleport through the bramble's place).
  await hook(page, "teleport", 33.8, -8.4, Math.PI);
  await hook(page, "setCamera", 0, 0.5, 9);
  await page.keyboard.down("KeyW");
  await waitFor(page, (x) => x.player.z < -15, 15_000, "walked into the forest");
  await page.keyboard.up("KeyW");

  // ---- The bridge: Bubbo can't help; switch to Leafy; then "Thank you!".
  await use(page, "bridge", "bridge", 1.6);
  await tap(page, "canHelp");
  s = await waitFor(page, (x) => x.mode === "explore", 15_000, "bubbo can't");
  expect(s.progress.solved).not.toContain("bridge");
  expect(s.progress.monsters.bubbo.canKnown.grow).toBe(false);
  await page.keyboard.press("Digit1");
  await waitFor(page, (x) => x.progress.active === "leafy", 5_000, "leafy active");
  await use(page, "bridge", "bridge", 1.6);
  await tap(page, "canHelp");
  await waitFor(page, (x) => Boolean(x.prompt?.choices.includes("thankYou")), 30_000, "thank you prompt");
  expect((await state(page)).progress.solved).toContain("bridge");
  // A wrong request is a puzzled tilt, not a failure.
  await tap(page, "letsGo");
  expect((await state(page)).prompt?.choices).toContain("thankYou");
  await tap(page, "thankYou");
  s = await waitFor(page, (x) => x.mode === "explore", 15_000, "after thanks");
  expect(s.objective).toEqual({ id: "findMonster", monster: "puff" });
  await waitFor(page, (x) => x.bridge > 0.95, 5_000, "bridge woven");

  // Walk across the repaired bridge.
  await hook(page, "teleport", 37, -23.6, Math.PI);
  await hook(page, "setCamera", 0, 0.5, 9);
  await page.keyboard.down("KeyW");
  await waitFor(page, (x) => x.player.z < -29.5, 15_000, "crossed the bridge");
  await page.keyboard.up("KeyW");

  // ---- Puff: up in its tree until called down.
  expect((await state(page)).monsters.puff.air).toBeGreaterThan(2);
  await hook(page, "goTo", "puff", 2);
  await waitFor(page, (x) => Boolean(x.prompt?.choices.includes("comeHere")), 15_000, "come here prompt");
  await tap(page, "thankYou");
  expect((await state(page)).progress.monsters.puff.discovered).toBe(false);
  await tap(page, "comeHere");
  await waitFor(page, (x) => x.prompt?.question === "What color is it?", 15_000, "colour prompt");
  expect((await state(page)).monsters.puff.air).toBeLessThan(1);
  await tap(page, "itsPurple");
  await waitFor(page, (x) => x.prompt?.question === "Is it big or small?", 15_000, "size prompt");
  await tap(page, "itsBig");
  expect((await state(page)).progress.monsters.puff.described.size ?? false).toBe(false);
  await tap(page, "itsSmall");
  await waitFor(page, (x) => x.prompt?.question === "Look! What does it have?", 15_000, "part prompt");
  await expect(page.getByTestId("discover-size")).toHaveText("It's small.");
  await tap(page, "hasWings");
  await waitFor(page, (x) => Boolean(x.prompt?.choices.includes("likeBerries")), 15_000, "like prompt");
  expect((await state(page)).progress.monsters.puff.described).toEqual({ size: true, part: true });
  await tap(page, "likeFish");
  await waitFor(page, (x) => x.progress.monsters.puff.asked.fish === false && Boolean(x.prompt?.choices.includes("likeBerries")), 10_000, "asked again");
  await tap(page, "likeBerries");
  s = await waitFor(page, (x) => x.mode === "explore" && x.progress.monsters.puff.asked.berries === true, 15_000, "berries yes");
  expect(s.objective).toMatchObject({ id: "getFood", food: "berries" });

  // Forest berries grow by Puff's tree; give; answer; "Let's go!".
  await use(page, "berry2", "berry2", 1.2);
  await waitFor(page, (x) => (x.progress.bag.berries ?? 0) === 1, 5_000, "berries picked");
  await use(page, "puff", "puff", 1.6);
  await tap(page, "yesIDo");
  await waitFor(page, (x) => Boolean(x.prompt?.choices.includes("letsGo")), 20_000, "let's go prompt");
  expect((await state(page)).progress.monsters.puff.friend).toBe(true);
  await tap(page, "letsGo");
  s = await waitFor(page, (x) => x.mode === "explore" && x.progress.active === "puff", 15_000, "puff follows");
  expect(s.objective).toMatchObject({ id: "obstacle", obstacle: "cliff", helper: "puff" });
  await expect(page.getByTestId("team-puff")).toBeVisible();

  // ---- The cliff: Leafy cannot fly (switch test), Puff can.
  await page.keyboard.press("Digit1");
  await waitFor(page, (x) => x.progress.active === "leafy", 5_000, "leafy active again");
  await use(page, "cliff", "cliff", 1.6);
  await tap(page, "canFly");
  s = await waitFor(page, (x) => x.mode === "explore", 15_000, "leafy can't fly");
  expect(s.progress.solved).not.toContain("cliff");
  await page.keyboard.press("Digit3");
  await waitFor(page, (x) => x.progress.active === "puff", 5_000, "puff active");
  await use(page, "cliff", "cliff", 1.6);
  await tap(page, "canFly");
  await waitFor(page, (x) => Boolean(x.prompt?.choices.includes("thankYou")), 30_000, "thank puff");
  expect((await state(page)).rope).toBeGreaterThan(0.95);
  await tap(page, "thankYou");
  await waitFor(page, (x) => Boolean(x.prompt?.choices.includes("letsGo")), 15_000, "climb let's go");
  await tap(page, "letsGo");

  // ---- The climb and the cliff-top ending.
  // No results card: a short "clear" banner and play goes straight on.
  s = await waitFor(page, (x) => x.progress.endings === 2, 60_000, "cliff-top ending");
  await expect(page.getByTestId("toast").filter({ hasText: "Forest Adventure: Clear!" })).toBeVisible();
  s = await waitFor(page, (x) => x.screen === "game" && x.mode === "explore", 15_000, "free play on the cliff top");
  await expect(page.getByTestId("results")).toHaveCount(0);
  expect(s.stoneGlow.puff).toBe(1);
  for (const sentence of ["comeHere", "letsGo", "thankYou", "itsSmall", "hasWings"]) expect(s.progress.said).toContain(sentence);
  expect(s.player.z).toBeLessThan(-45.5);
  expect(s.objective).toMatchObject({ id: "obstacle", obstacle: "lava" });

  // The rope leads back down.
  await use(page, "cliffTop", "ropeDown", 0.6);
  s = await waitFor(page, (x) => x.mode === "explore" && x.player.z > -45, 20_000, "climbed down");
  expect(s.player.climbing).toBe(false);

  // Leafy and Bubbo's pages now offer an optional size line (never on the objective path).
  await page.keyboard.press("KeyM");
  await page.getByTestId("journal-tab-bubbo").click();
  await page.getByTestId("j-write-size").click();
  await tap(page, "itsBig");
  await waitFor(page, (x) => x.progress.monsters.bubbo.described.size === true, 10_000, "bubbo size written");
  expect(errors).toEqual([]);
});
