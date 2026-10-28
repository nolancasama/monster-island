import { expect, test, type Page } from "@playwright/test";
import { boot, chooseMode, hook, state, waitFor } from "./helpers";

/**
 * Directional controls follow the view on screen everywhere, including the
 * tunnel (whose camera looks along the passage) and the sanctuary after it,
 * before and after the camera has been turned by hand.
 */

const friend = (asked: Record<string, boolean>, described = {}, extra = {}) => ({ discovered: true, asked, friend: true, canKnown: {}, described, ...extra });
const DONE_SAVE = JSON.stringify({
  v: 3,
  progress: {
    monsters: {
      leafy: friend({ apples: true }),
      bubbo: friend({ fish: true }),
      puff: friend({ berries: true }, { size: true, part: true }),
      ember: friend({ meat: true }, { size: true, part: true }, { invited: true }),
      lumo: friend({}, { name: true, size: true, part: true })
    },
    active: "ember",
    bag: {},
    solved: ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame"],
    metMaple: true,
    endings: 3,
    said: []
  },
  player: { x: 64, z: -97, yaw: Math.PI },
  seconds: 2000
});

const KEYS = { right: "KeyD", left: "KeyA", forward: "KeyW", back: "KeyS" } as const;

type Spot = { x: number; y: number; z: number };
const screenOf = async (page: Page, p: Spot) => (await hook(page, "project", p.x, p.y + 0.9, p.z)) as { x: number; y: number };

/**
 * Hold a direction briefly; return how the player moved on screen. Both ends
 * are projected through the camera as it is afterwards: the follow camera
 * catches up after a move, so comparing two live screen positions measures
 * its lag (frame-rate dependent) as much as the move.
 */
async function push(page: Page, key: string) {
  // Hold until the player has really moved (SwiftShader can run at ~3 fps).
  const start = await state(page);
  await page.keyboard.down(key);
  const t0 = Date.now();
  for (;;) {
    await page.waitForTimeout(100);
    const s = await state(page);
    if (Math.hypot(s.player.x - start.player.x, s.player.z - start.player.z) > 0.9 || Date.now() - t0 > 4000) break;
  }
  await page.keyboard.up(key);
  await page.waitForTimeout(250);
  const end = await state(page);
  const before = await screenOf(page, start.player);
  const after = await screenOf(page, end.player);
  return { dx: after.x - before.x, dy: after.y - before.y };
}

const PLACES: Array<[string, number, number]> = [
  ["cave entrance", 64, -98.5],
  ["inside the cave", 64, -112],
  ["cave exit", 64, -123.5],
  ["sanctuary entrance", 64.5, -127.2],
  ["sanctuary pillars", 70, -129.5],
  ["sanctuary gate", 70, -133],
  // In the garden, kept over 5 m from Lumo: closer, a finished save starts Act 2.
  ["garden", 64, -137]
];

test("Right, Left, Forward and Back follow the screen in the cave and the sanctuary", async ({ page }) => {
  test.setTimeout(300_000);
  await page.addInitScript((save) => {
    if (!sessionStorage.getItem("camera-seeded")) {
      localStorage.setItem("mi.save.v3", save);
      sessionStorage.setItem("camera-seeded", "1");
    }
  }, DONE_SAVE);
  const errors = await boot(page);
  await chooseMode(page, "tap");
  await page.getByTestId("btn-continue").click();
  await waitFor(page, (s) => s.screen === "game" && s.mode === "explore", 20_000, "continued");

  // The old fault: the orbit was turned to one side before walking in.
  for (const yaw of [Math.PI / 2, -2.2]) {
    for (const [name, x, z] of PLACES) {
      for (const [dir, key] of Object.entries(KEYS)) {
        await hook(page, "teleport", x, z, Math.PI);
        await hook(page, "setCamera", yaw, 0.46, 9);
        // Let the camera settle where it actually goes (the tunnel framing turns it).
        await page.waitForTimeout(1600);
        const m = await push(page, key);
        const label = `${name}, camera yaw ${yaw.toFixed(2)}: ${dir} moved ${m.dx.toFixed(0)},${m.dy.toFixed(0)} px`;
        if (dir === "right") expect(m.dx > 12 && Math.abs(m.dy) < m.dx * 0.7, label).toBe(true);
        if (dir === "left") expect(-m.dx > 12 && Math.abs(m.dy) < -m.dx * 0.7, label).toBe(true);
        if (dir === "forward") expect(-m.dy > 4 && Math.abs(m.dx) < -m.dy * 1.2, label).toBe(true);
        if (dir === "back") expect(m.dy > 4 && Math.abs(m.dx) < m.dy * 1.2, label).toBe(true);
      }
    }
  }
  expect((await state(page)).progress.act2.started).toBe(false);
  expect(errors).toEqual([]);
});
