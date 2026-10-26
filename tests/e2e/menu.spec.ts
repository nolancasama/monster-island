import { expect, test } from "@playwright/test";
import { boot, chooseMode, state, waitFor } from "./helpers";

test("the title screen is simple; Speak/Tap lives in Settings and is remembered", async ({ page }) => {
  const errors = await boot(page);
  const title = page.getByTestId("title");
  await expect(title.getByTestId("btn-start")).toBeVisible();
  await expect(title.getByTestId("title-settings")).toBeVisible();
  await expect(page.getByTestId("mode-speak")).toHaveCount(0);
  await expect(page.getByTestId("mode-tap")).toHaveCount(0);

  await chooseMode(page, "tap");
  await page.reload();
  await expect(page.getByTestId("title")).toBeVisible();
  await page.getByTestId("title-settings").click();
  await expect(page.getByTestId("toggle-mic")).toHaveAttribute("aria-checked", "false");
  await page.getByTestId("settings-close").click();

  // Tap mode is honoured in play: prompts are buttons, the microphone is never used.
  await page.getByTestId("btn-start").click();
  const s = await waitFor(page, (x) => x.mode === "explore" && x.progress.metMaple, 30_000, "intro done");
  expect(s.screen).toBe("game");
  expect((await state(page)).micState).toBe("unknown");
  expect(errors).toEqual([]);
});
