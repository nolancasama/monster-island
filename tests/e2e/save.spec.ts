import { expect, test } from "@playwright/test";
import { boot, hook, startGame, state, tap, use, waitFor } from "./helpers";

test("progress survives a reload: Continue resumes with the friend, the moved palm and the journal", async ({ page }) => {
  await boot(page);
  await startGame(page, "tap");
  await hook(page, "goTo", "leafy", 2);
  await tap(page, "itsGreen");
  await tap(page, "likeApples");
  await waitFor(page, (s) => s.mode === "explore", 15_000, "explore");
  await use(page, "apple1", "apple1");
  await use(page, "leafy", "leafy");
  await tap(page, "yesIDo");
  await waitFor(page, (s) => s.mode === "explore" && s.progress.monsters.leafy.friend, 20_000, "friend");
  await use(page, "palm", "fallenPalm", 1.2);
  await tap(page, "canHelp");
  await waitFor(page, (s) => s.mode === "explore" && s.progress.solved.includes("fallenPalm"), 30_000, "palm");
  // Pick a berry so the bag is part of the save too.
  await use(page, "berry", "berry");
  await waitFor(page, (s) => s.progress.bag.berries === 1, 5_000, "berry");
  await page.waitForTimeout(300);

  await page.reload();
  await expect(page.getByTestId("btn-continue")).toBeVisible();
  await page.getByTestId("btn-continue").click();
  const s = await waitFor(page, (x) => x.screen === "game" && x.mode === "explore", 10_000, "continued");
  expect(s.progress.monsters.leafy).toMatchObject({ discovered: true, friend: true });
  expect(s.progress.active).toBe("leafy");
  expect(s.progress.solved).toEqual(["fallenPalm"]);
  expect(s.progress.bag.berries).toBe(1);
  expect(s.palm).toBeGreaterThan(0.9);
  expect(s.monsters.leafy.mode).toBe("follow");
  expect(s.objective).toMatchObject({ id: "findMonster", monster: "bubbo" });
  // The intro does not replay, and the solved palm asks nothing.
  expect(s.line).toBeNull();
  await hook(page, "goTo", "palm", 1.2);
  await page.waitForTimeout(300);
  expect((await state(page)).focus?.id).not.toBe("fallenPalm");

  // New game asks first, then really starts over.
  await page.getByTestId("btn-settings").click();
  await page.getByTestId("settings-title").click();
  await page.getByTestId("btn-new").click();
  await page.getByTestId("btn-new-confirm").click();
  const fresh = await waitFor(page, (x) => x.screen === "game", 10_000, "new game");
  expect(fresh.progress.monsters.leafy.friend).toBe(false);
});
