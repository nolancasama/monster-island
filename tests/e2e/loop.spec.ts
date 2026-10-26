import { expect, test } from "@playwright/test";
import { boot, hook, startGame, state, tap, use, waitFor } from "./helpers";

/**
 * The whole Phase 1 vertical slice in mic-free mode, through the real UI:
 * discover → communicate → befriend → ability → exploration, twice, then the
 * Monster Stone ending. Movement is the test hook's goTo; every action is a
 * real key press or click.
 */
test("discover, befriend and use both monsters to reach the Monster Stone (mic-free)", async ({ page }) => {
  // Two complete friendships and the ending can exceed 180s on SwiftShader.
  test.setTimeout(360_000);
  const errors = await boot(page);
  await startGame(page, "tap");

  // ---- Leafy: walking up starts the discovery; describe it for the journal.
  await hook(page, "goTo", "leafy", 2);
  await waitFor(page, (s) => s.prompt?.question === "What color is it?", 15_000, "describe prompt");
  await expect(page.getByTestId("discover-card")).toBeVisible();
  // A wrong colour shakes and costs nothing.
  await tap(page, "itsBlue");
  expect((await state(page)).progress.monsters.leafy.discovered).toBe(false);
  await tap(page, "itsGreen");
  await waitFor(page, (s) => s.progress.monsters.leafy.discovered, 10_000, "leafy discovered");

  // "Do you like ___?": a no is recorded and crossed out, then the yes.
  await tap(page, "likeBananas");
  await waitFor(page, (s) => s.progress.monsters.leafy.asked.bananas === false, 10_000, "bananas no");
  await waitFor(page, (s) => Boolean(s.prompt?.choices.includes("likeApples")), 10_000, "asked again");
  await expect(page.locator("[data-testid=choice][data-id=likeBananas]")).toHaveClass(/crossed/);
  await tap(page, "likeApples");
  let s = await waitFor(page, (x) => x.mode === "explore" && x.progress.monsters.leafy.asked.apples === true, 15_000, "apples yes");
  expect(s.objective).toMatchObject({ id: "getFood", food: "apples" });
  expect(s.progress.monsters.leafy.friend).toBe(false);

  // Fetch an apple; give it; answer the monster's own question.
  await use(page, "apple1", "apple1");
  await waitFor(page, (x) => x.progress.bag.apples === 1, 5_000, "apple picked");
  await use(page, "leafy", "leafy");
  await waitFor(page, (x) => x.prompt?.question === "Do you like apples?", 15_000, "turnaround");
  await tap(page, "yesIDo");
  s = await waitFor(page, (x) => x.mode === "explore" && x.progress.monsters.leafy.friend, 20_000, "leafy friend");
  expect(s.progress.active).toBe("leafy");
  expect(s.progress.bag.apples ?? 0).toBe(0);
  await expect(page.getByTestId("team-leafy")).toBeVisible();

  // ---- The palm: other questions get truthful answers but solve nothing.
  expect(s.objective).toMatchObject({ id: "obstacle", obstacle: "fallenPalm" });
  await use(page, "palm", "fallenPalm", 1.2);
  const first = await waitFor(page, (x) => Boolean(x.prompt?.choices.includes("canSwim")), 10_000, "palm prompt");
  await tap(page, "canSwim");
  // Leafy answered "No, I can't." (recorded in the journal) and the question is offered again.
  await waitFor(page, (x) => x.progress.monsters.leafy.canKnown.swim === false && Boolean(x.prompt) && x.prompt!.id !== first.prompt!.id, 10_000, "palm prompt again");
  expect((await state(page)).progress.solved).toEqual([]);
  await tap(page, "canHelp");
  s = await waitFor(page, (x) => x.mode === "explore" && x.progress.solved.includes("fallenPalm"), 30_000, "palm solved");
  expect(s.progress.monsters.leafy.canKnown).toMatchObject({ swim: false, grow: true });
  await waitFor(page, (x) => x.palm > 0.9, 10_000, "palm lifted aside");

  // ---- Bubbo, behind the palm.
  await hook(page, "goTo", "bubbo", 2);
  await waitFor(page, (x) => x.prompt?.question === "What color is it?", 15_000, "bubbo describe");
  await tap(page, "itsBlue");
  await tap(page, "likeFish");
  await waitFor(page, (x) => x.mode === "explore" && x.progress.monsters.bubbo.asked.fish === true, 15_000, "fish yes");
  await use(page, "fish", "fish");
  await waitFor(page, (x) => x.progress.bag.fish === 1, 5_000, "fish picked");
  await use(page, "bubbo", "bubbo");
  await tap(page, "noIDont");
  s = await waitFor(page, (x) => x.mode === "explore" && x.progress.monsters.bubbo.friend, 20_000, "bubbo friend");
  // The first friend stays the companion: the river needs a switch.
  expect(s.progress.active).toBe("leafy");

  // ---- The river: Leafy can't swim; switch to Bubbo (number key) and ask again.
  await use(page, "river", "river");
  await tap(page, "canSwim");
  // "No, I can't." and a hint to switch, then back to exploring with the river still closed.
  s = await waitFor(page, (x) => x.mode === "explore", 15_000, "hint then explore");
  expect(s.progress.solved).not.toContain("river");
  expect(s.player.x).toBeLessThan(21.5);
  await page.keyboard.press("Digit2");
  await waitFor(page, (x) => x.progress.active === "bubbo", 5_000, "bubbo active");
  await use(page, "river", "river");
  await tap(page, "canSwim");
  await waitFor(page, (x) => x.prompt?.question === "Can you swim?", 15_000, "bubbo asks back");
  await tap(page, "noICant");
  s = await waitFor(page, (x) => x.mode === "explore" && x.progress.solved.includes("river"), 40_000, "river crossed");
  expect(s.player.x).toBeGreaterThan(27.5);

  // The stepping stones stay: walk back west across them with the keyboard.
  await hook(page, "teleport", 29, -1, -Math.PI / 2);
  await hook(page, "setCamera", Math.PI / 2, 0.5, 9);
  await page.keyboard.down("KeyW");
  await waitFor(page, (x) => x.player.x < 21, 20_000, "walked back over the stones");
  await page.keyboard.up("KeyW");
  expect((await state(page)).player.y).toBeGreaterThan(-0.35);

  // ---- The Monster Stone ending.
  await hook(page, "teleport", 31, -0.5, 0.5);
  // No results card: a short "clear" banner, then the forest objective.
  s = await waitFor(page, (x) => x.progress.endings === 1, 60_000, "stone ending");
  await expect(page.getByTestId("toast").filter({ hasText: "Beach Adventure: Clear!" })).toBeVisible();
  s = await waitFor(page, (x) => x.screen === "game" && x.mode === "explore", 15_000, "free play");
  await expect(page.getByTestId("results")).toHaveCount(0);
  expect(s.progress.said).toEqual(expect.arrayContaining(["likeApples", "canSwim"]));
  expect(s.objective).toMatchObject({ id: "obstacle", obstacle: "bridge" });
  // The ending opened the forest path.
  await waitFor(page, (x) => x.bramble < 0.2, 10_000, "bramble gone");
  expect(errors).toEqual([]);
});
