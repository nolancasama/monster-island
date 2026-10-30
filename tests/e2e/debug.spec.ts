import { expect, test } from "@playwright/test";
import { boot, state } from "./helpers";
import { SERVICES } from "../../src/game/world/lowland";
import { CLOUD_SPAWNS } from "../../src/game/world/cloudisle";

for (const size of [{ width: 1366, height: 768 }, { width: 1280, height: 800 }]) {
  test(`debug menu travels between worlds at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.addInitScript(() => localStorage.setItem("mi.save.v4", "real-save-sentinel"));
    await boot(page, "debug=1&fast=1");
    await expect(page.getByTestId("debug-badge")).toBeVisible();
    await page.keyboard.press("Control+Shift+KeyD");
    const menu = page.getByTestId("debug-menu");
    await expect(menu).toBeVisible();
    const ship = page.getByTestId("debug-cloud-ship");
    await expect(ship, "HARNESS_PRECONDITION_FAILED: debug ship toggle").toHaveText("Cloud Isle ship: locked");
    expect((await state(page)).cloudIsleOpen).toBe(false);
    await ship.click();
    await expect(ship).toHaveText("Cloud Isle ship: open");
    expect((await state(page)).cloudIsleOpen).toBe(true);
    await ship.click();
    await expect(ship).toHaveText("Cloud Isle ship: locked");
    const shots = `.tmp/shots/debug-menu`;
    await page.screenshot({ path: `${shots}/menu-${size.width}x${size.height}.png` });
    await page.getByTestId("debug-jump-market").click();
    await page.screenshot({ path: `${shots}/market-${size.width}x${size.height}.png` });
    const market = await state(page);
    expect(market.progress.act2.started).toBe(true);
    expect(market.progress.act2.portFound).toBe(true);
    expect(Math.hypot(market.player.x - SERVICES.market.keeper.x, market.player.z - SERVICES.market.keeper.z)).toBeLessThan(3);
    await expect(page.getByTestId("debug-position")).toContainText("home");
    await page.getByTestId("debug-jump-cloud:skyrootCanopy").click();
    const cloud = await state(page);
    expect(Math.hypot(cloud.player.x - CLOUD_SPAWNS.skyrootCanopy.x, cloud.player.z - CLOUD_SPAWNS.skyrootCanopy.z)).toBeLessThan(3);
    await expect(page.getByTestId("debug-position")).toContainText("cloud");
    await page.screenshot({ path: `${shots}/cloud-${size.width}x${size.height}.png` });
    const story = await page.evaluate(() => (window as unknown as { __mi: { state(): { progress: { act3: { world: string; area: string } } } } }).__mi.state().progress.act3);
    expect(story.world).toBe("cloud");
    expect(story.area).toBe("skyrootCanopy");
    expect(await page.evaluate(() => localStorage.getItem("mi.save.v4"))).toBe("real-save-sentinel");
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await page.keyboard.press("Backquote");
    await expect(menu).toBeVisible();
    await ship.click();
    await expect(ship).toHaveText("Cloud Isle ship: open");
    await page.reload();
    await expect(page.getByTestId("title"), "HARNESS_PRECONDITION_FAILED: reload finished").toBeVisible();
    expect((await state(page)).cloudIsleOpen).toBe(false);
  });
}

test("normal built game ignores both debug shortcuts", async ({ page }) => {
  await boot(page);
  await page.keyboard.press("Control+Shift+KeyD");
  await expect(page.getByTestId("debug-menu")).toHaveCount(0);
  await page.keyboard.press("Backquote");
  await expect(page.getByTestId("debug-menu")).toHaveCount(0);
  await expect(page.getByTestId("debug-badge")).toHaveCount(0);
});
