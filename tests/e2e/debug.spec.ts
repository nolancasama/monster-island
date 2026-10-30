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
  });
}

test("fresh debug coordinates open the earliest story point for lowland ground", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.addInitScript(() => {
    localStorage.removeItem("mi.debug.save");
    localStorage.setItem("mi.save.v4", "real-save-sentinel");
  });
  await boot(page, "debug=1&fast=1");
  expect((await state(page)).progress.act2.started).toBe(false);
  await page.keyboard.press("Control+Shift+KeyD");
  const menu = page.getByTestId("debug-menu");
  await expect(menu).toBeVisible();
  const mapBounds = await menu.getByRole("button", { name: "Travel map: click to teleport; arrow keys move cursor, Enter teleports" }).boundingBox();
  expect(mapBounds!.height).toBeGreaterThan(350);
  const dialogBounds = await menu.boundingBox();
  expect(dialogBounds!.y).toBeGreaterThanOrEqual(0);
  expect(dialogBounds!.y + dialogBounds!.height).toBeLessThanOrEqual(768);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  await menu.getByLabel("x", { exact: true }).fill("76");
  await menu.getByLabel("z", { exact: true }).fill("-184.5");
  await menu.getByRole("button", { name: "Go", exact: true }).click();

  await expect(menu.locator(".debug-message")).toContainText("Story set to Fern Camp to reach this spot");
  const lowland = await state(page);
  expect(lowland.progress.act2.started).toBe(true);
  expect(lowland.progress.act2.cleared).toContain("forest1");
  expect(Math.hypot(lowland.player.x - 76, lowland.player.z + 184.5)).toBeLessThan(1);
  expect(await page.evaluate(() => localStorage.getItem("mi.save.v4"))).toBe("real-save-sentinel");
});

test("normal built game ignores backquote; Ctrl+Shift+D reloads into debug", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("mi.save.v4", "real-save-sentinel"));
  await boot(page);
  await page.keyboard.press("Backquote");
  await expect(page.getByTestId("debug-menu")).toHaveCount(0);
  await expect(page.getByTestId("debug-badge")).toHaveCount(0);
  await page.keyboard.press("Control+Shift+KeyD");
  await page.waitForURL(/[?&]debug=1/);
  await expect(page.getByTestId("debug-badge")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("mi.save.v4"))).toBe("real-save-sentinel");
});
