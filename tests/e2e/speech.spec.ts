import { expect, test } from "@playwright/test";
import { boot, hook, speak, startGame, state, waitFor } from "./helpers";

test("speech: one press = one session, misses lead to the rescue, accented answers pass", async ({ page }) => {
  const errors = await boot(page);
  await startGame(page, "speak");
  await hook(page, "goTo", "leafy", 2);
  let s = await waitFor(page, (x) => x.prompt?.question === "What color is it?", 15_000, "describe prompt");
  expect(s.prompt!.buttons).toBe(false);
  await expect(page.getByTestId("sentence")).toHaveText("It's green.");

  // Miss 1 (wrong word), miss 2 (silence), miss 3 → the sentences become tappable.
  await speak(page, "it's blue");
  s = await state(page);
  expect(s.prompt).toMatchObject({ status: "miss", misses: 1, buttons: false });
  await speak(page, null);
  expect((await state(page)).prompt).toMatchObject({ misses: 2, buttons: false });
  await speak(page, "um");
  expect((await state(page)).prompt).toMatchObject({ misses: 3, buttons: true });
  // Speaking still works after the rescue appears.
  await speak(page, "its glean");
  await waitFor(page, (x) => x.progress.monsters.leafy.discovered, 10_000, "accented green accepted");

  // Two foods in one sentence is unclear (never two actions); an accented question passes.
  // (The words are ordered so the stub's interim result matches nothing either.)
  await waitFor(page, (x) => x.prompt?.kind === "choice", 15_000, "like prompt");
  await expect(page.getByTestId("frame")).toBeVisible();
  await speak(page, "apples fish do you like");
  s = await state(page);
  expect(s.prompt?.status).toBe("unclear");
  expect(Object.keys(s.progress.monsters.leafy.asked)).toEqual([]);
  await speak(page, "do you rike apple");
  await waitFor(page, (x) => x.progress.monsters.leafy.asked.apples === true, 10_000, "rike apple");
  expect((await state(page)).progress.said).toContain("likeApples");
  expect(errors).toEqual([]);
});

test("a blocked microphone switches to tapping at once", async ({ page }) => {
  await boot(page);
  await startGame(page, "speak");
  await hook(page, "goTo", "leafy", 2);
  await waitFor(page, (x) => x.prompt?.question === "What color is it?", 15_000, "describe prompt");
  await speak(page, null, "not-allowed");
  const s = await state(page);
  expect(s.micState).toBe("blocked");
  expect(s.prompt?.buttons).toBe(true);
  await page.locator("[data-testid=choice][data-id=itsGreen]").click();
  await waitFor(page, (x) => x.progress.monsters.leafy.discovered, 10_000, "tapped after block");
  // Later prompts start with buttons and no mic button.
  await waitFor(page, (x) => x.prompt?.kind === "choice", 15_000, "like prompt");
  expect((await state(page)).prompt?.buttons).toBe(true);
  await expect(page.getByTestId("mic")).toHaveCount(0);
});
