import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { boot, chooseMode, hook, state, waitFor } from "./helpers";

const friends = Object.fromEntries(
  ["leafy", "bubbo", "puff", "ember", "lumo"].map((id) => [
    id,
    { discovered: true, friend: true, asked: {}, canKnown: {}, described: { name: true, size: true, part: true }, invited: true },
  ]),
);
const prologue = ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame"];
function save(zone = "forest1", cleared: string[] = []) {
  return JSON.stringify({
    v: 4,
    progress: {
      monsters: friends,
      active: "leafy",
      bag: { apples: 8, fish: 8, berries: 8, meat: 8 },
      solved: [...prologue, "canopyVines", "canopyRope"],
      metMaple: true,
      endings: 3,
      said: [],
      act2: {
        started: true,
        lumoTaken: true,
        descended: true,
        hp: 100,
        mp: { leafy: 100, bubbo: 100, puff: 100, ember: 100 },
        coins: 100,
        items: { amber: 1 },
        upgrades: [],
        chests: ["forestChest"],
        tutorial: ["attack", "coins", "special", "eat", "rest", "switch"],
        checkpoint: "cliff",
        portFound: false,
        bought: false,
        harbor: false,
        trained: [],
        zone,
        cleared,
      },
    },
    player: { x: 75.5, z: -154.4, yaw: Math.PI },
    seconds: 2500,
  });
}
async function start(page: Page, cleared: string[] = []) {
  await page.addInitScript(
    (text) => {
      if (!sessionStorage.getItem("expansion-seed")) {
        localStorage.setItem("mi.save.v4", text);
        sessionStorage.setItem("expansion-seed", "1");
      }
    },
    save("forest1", cleared),
  );
  const errors = await boot(page);
  await chooseMode(page, "tap");
  await page.getByTestId("btn-continue").click();
  await waitFor(page, (s) => s.mode === "explore" && s.screen === "game");
  return errors;
}
async function defeat(page: Page, i: number) {
  for (let n = 0; n < 20; n++) {
    const e = (await state(page)).act2.enemies[i];
    if (["ko", "gone"].includes(e.state)) return;
    await hook(page, "nearEnemy", i, 1.5);
    await hook(page, "setHp", 100);
    await page.keyboard.press("KeyJ");
    await page.waitForTimeout(480);
  }
  throw new Error(`required enemy ${i} could not be defeated`);
}
async function clear(page: Page, zone: string) {
  const enemies = (await state(page)).act2.enemies.filter((e) => e.zone === zone);
  for (const e of enemies) await defeat(page, e.i);
  await waitFor(page, (s) => s.progress.act2.cleared.includes(zone), 10000, `${zone} exit unlocked`);
}
async function probe(page: Page, zone: string, open: boolean) {
  const before = await state(page);
  const e = before.passages.find(e => e.from === zone && e.id.endsWith(":a") && !e.id.startsWith("camp-"));
  if (!e) throw new Error(`missing forward passage for ${zone}`);
  expect(e.open, `${zone} first-clear exit`).toBe(open);
  await hook(page, "setHp", 100);
  await hook(page, "teleport", e.approach.x, e.approach.z);
  await hook(page, "follow");
  await hook(page, "setCamera", Math.atan2(-e.nx, -e.nz), .34, 6);
  await waitFor(page, s => s.act2.zone === zone && s.mode === "explore");
  await page.waitForTimeout(1100);
  const serial = (await state(page)).passage.serial;
  await page.keyboard.down("ArrowUp");
  try {
    if (open) {
      await waitFor(page, s => s.passage.serial > serial && !s.passage.active && s.act2.zone === e.to, 15000, `${zone} passage arrival`);
    } else {
      const time = (await state(page)).playTime;
      await waitFor(page, s => s.playTime > time + 1.2, 15000, `${zone} locked approach`);
      const s = await state(page);
      expect(s.act2.zone, `${zone} closed`).toBe(zone);
      expect(s.passage.serial, `${zone} closed`).toBe(serial);
      expect((s.player.x-e.x)*e.nx+(s.player.z-e.z)*e.nz).toBeLessThan(.3);
    }
  } finally { await page.keyboard.up("ArrowUp"); }
  await waitFor(page, s => s.mode === "explore", 40000, `${zone} arrival scene finished`);
}

test("first forest clear, active-only companions, retreat, re-entry and save persistence", async ({ page }) => {
  test.setTimeout(180000);
  const errors = await start(page);
  await probe(page, "forest1", false);
  await expect(page.getByTestId("stage-counter")).toContainText("Enemies remaining: 5");
  for (const [key, id] of [
    [1, "leafy"],
    [2, "bubbo"],
    [3, "puff"],
    [4, "ember"],
  ] as const) {
    await page.keyboard.press(`Digit${key}`);
    await waitFor(page, (s) => s.act2.stance.friend === id && s.act2.stance.k > 0.99);
    await page.waitForTimeout(500);
    const s = await state(page);
    expect(
      Object.entries(s.monsters)
        .filter(([, m]) => m.visible)
        .map(([id]) => id),
    ).toEqual([id]);
  }
  await page.keyboard.press("Digit1");
  await waitFor(page, (s) => s.act2.stance.friend === "leafy" && s.act2.stance.k > 0.99);
  // No automatic damage while standing close to a required enemy.
  await hook(page, "nearEnemy", 0, 2);
  const hp = (await state(page)).act2.enemies[0].hp;
  await page.waitForTimeout(1200);
  expect((await state(page)).act2.enemies[0].hp).toBe(hp);
  await hook(page, "teleport", 75.5, -155);
  await hook(page, "moveTo", 75.5, -154.4);
  expect((await state(page)).player.z).toBeGreaterThan(-155);
  await clear(page, "forest1");
  await probe(page, "forest1", true);
  await hook(page, "goTo", "campRest", 1.4);
  await waitFor(page, (s) => s.act2.zone === "camp");
  await page.waitForTimeout(700);
  expect(Object.values((await state(page)).monsters).filter((m) => m.visible)).toHaveLength(4);
  const t = (await state(page)).playTime;
  await waitFor(page, (s) => s.playTime > t + 12.5, 60000, "respawn absence");
  await hook(page, "teleport", 76, -180);
  await waitFor(page, (s) => s.act2.zone === "forest1");
  expect((await state(page)).act2.enemies.filter((e) => e.zone === "forest1").every((e) => e.hp > 0)).toBe(true);
  await probe(page, "forest1", true);
  await page.waitForTimeout(5500);
  await page.reload();
  await page.getByTestId("btn-continue").click();
  await waitFor(page, (s) => s.mode === "explore");
  expect((await state(page)).progress.act2.cleared).toContain("forest1");
  await probe(page, "forest1", true);
  expect(errors).toEqual([]);
});

for (const branch of ["grove", "canopy"])
  test(`${branch} alone, causeway and coast clear to the town`, async ({ page }) => {
    test.setTimeout(300000);
    const errors = await start(page, ["forest1"]);
    for (const zone of [branch, "causeway", "coast"]) {
      await probe(page, zone, false);
      await clear(page, zone);
      await probe(page, zone, true);
    }
    const s = await state(page);
    expect(s.progress.act2.cleared).not.toContain(branch === "grove" ? "canopy" : "grove");
    await waitFor(page, (s) => s.progress.act2.portFound && s.mode === "explore", 40000, "port reached");
    expect((await state(page)).act2.stance.friend).toBeNull();
    expect(errors).toEqual([]);
  });

test("visual inspection at both Chromebook sizes: areas, panorama, and closed cliff in both directions", async ({ page }) => {
  test.setTimeout(240000);
  const errors = await start(page, ["forest1", "grove", "canopy", "causeway", "coast"]);
  mkdirSync(".tmp/shots/expansion", { recursive: true });
  const report: unknown[] = [];
  for (const [width, height] of [
    [1366, 768],
    [1280, 800],
  ]) {
    await page.setViewportSize({ width, height });
    for (const [name, x, z] of [
      ["primeval", 68, -168],
      ["grove", 49, -231],
      ["canopy", 109, -234],
      ["causeway", 83, -255],
      ["coast", 66, -275],
    ] as const) {
      await hook(page, "teleport", x, z);
      await hook(page, "follow");
      await hook(page, "setCamera", 0.55, 0.44, 11);
      await page.waitForTimeout(2500);
      await pauseForPortrait(page);
      await page.screenshot({ path: `.tmp/shots/expansion/${name}-${width}.png` });
      const perf=(await state(page)).perf;
      expect(perf.calls,`${name} draw calls`).toBeLessThanOrEqual(125);
      expect(perf.triangles,`${name} triangles`).toBeLessThanOrEqual(120000);
      report.push({ name, width, height, perf });
      await hook(page, "timeScale", 1);
      await hook(page, "setCamera", -1.3, .46, 10);
      await page.waitForTimeout(1200);
      await pauseForPortrait(page);
      await page.screenshot({path:`.tmp/shots/expansion/${name}-orbit-${width}.png`});
      report.push({name:`${name}-orbit`,width,height,perf:(await state(page)).perf});
      await hook(page, "timeScale", 1);
    }
    await hook(page, "teleport", 87, -128);
    await hook(page, "look", [90, 24, -120], [85, 6, -220]);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `.tmp/shots/expansion/panorama-${width}.png` });
    for (const [name, pos, at] of [
      ["front", [75.5, 10, -163], [75.5, 10, -151]],
      ["side", [84, 12, -157], [75.5, 12, -150]],
      ["above", [78, 24, -157], [75.5, 13, -150]],
      ["below", [77, 3, -156], [75.5, 12, -151]],
    ] as const) {
      await hook(page, "look", pos, at);
      await page.waitForTimeout(350);
      await page.screenshot({ path: `.tmp/shots/expansion/cliff-${name}-${width}.png` });
    }
  }
  // Real E interactions down and up; the existing Act 2 suite covers the full story transition.
  await page.evaluate(() => history.replaceState(null, "", "?e2e=1"));
  await hook(page, "goTo", "cliffDown", 0.5);
  await hook(page, "follow");
  await waitFor(page, (s) => s.focus?.id === "cliffDown");
  await page.keyboard.press("KeyE");
  await waitFor(page, (s) => s.player.climbing && s.camera.pos.z < -154, 10000, "rendered descent camera");
  for (const height of [14, 10, 5]) {
    await waitFor(page, (s) => s.player.climbing && s.player.y < height, 30000, `descent at ${height}m`);
    const s = await state(page);
    expect(s.camera.pos.z).toBeLessThan(-154);
    await hook(page,"timeScale",0);
    await page.screenshot({ path: `.tmp/shots/expansion/descent-${height}.png` });
    await hook(page,"timeScale",1);
  }
  await waitFor(page, (s) => s.mode === "explore" && !s.player.climbing && s.act2.zone === "forest1", 30000);
  await hook(page, "goTo", "cliffUp", 0.5);
  await waitFor(page, (s) => s.focus?.id === "cliffUp");
  await page.keyboard.press("KeyE");
  await waitFor(page,s=>s.player.climbing && s.player.y>8,30000,"ascent midpoint");
  await hook(page,"timeScale",0);
  await page.screenshot({path:".tmp/shots/expansion/ascent-midpoint.png"});
  await hook(page,"timeScale",1);
  await waitFor(page, (s) => s.mode === "explore" && !s.player.climbing && s.player.z > -152, 30000);
  writeFileSync(".tmp/shots/expansion/render-report.json", JSON.stringify(report, null, 2));
  expect(errors).toEqual([]);
});

/** Let the existing damage blink finish with AI paused before freezing a
 * review image. This does not change HP, enemies, gates or model visibility. */
async function pauseForPortrait(page: Page) {
  await hook(page, "set", {mode:"busy"});
  const t=(await state(page)).playTime;
  await waitFor(page,s=>s.playTime>t+1.3,15000,"damage blink finished");
  await hook(page,"timeScale",0);
  await hook(page,"set",{mode:"explore"});
}
