import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { boot, chooseMode, hook, state, waitFor, type MiState } from "./helpers";
import { newProgress } from "../../src/game/logic/progress";

const friends = ["leafy", "bubbo", "puff", "ember"] as const;
const folder = ".tmp/shots/polish2/companions";
type Point = readonly [number, number];
type CompanionState = MiState & { act3: { zone: string } };
const destinations = [
  { name: "fern-crossing", zone: "camp", hostile: "forest1", cloud: false, start: [76, -183] as Point, entrance: [76, -188] as Point, onward: [76, -195] as Point },
  { name: "port-town", zone: "port", hostile: "coast", cloud: false, start: [76, -287] as Point, entrance: [76, -293] as Point, onward: [76, -300] as Point },
  { name: "hidden-hollow", zone: "hiddenHollow", hostile: "stormbreakCoast", cloud: true, start: [-5, 47] as Point, entrance: [-10, 50] as Point, onward: [-12, 56] as Point }
] as const;

function progressedSave(friend: typeof friends[number], destination: typeof destinations[number]) {
  const p = newProgress();
  for (const id of [...friends, "lumo"] as const) p.monsters[id] = { discovered: true, friend: true, asked: {}, canKnown: {}, described: { name: true, size: true, part: true }, invited: true };
  p.active = friend; p.metMaple = true; p.endings = 3;
  p.solved = ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame"];
  p.act2 = { ...p.act2, started: true, lumoTaken: true, descended: true, portFound: true, harbor: true, bought: true,
    checkpoint: "port", zone: destination.cloud ? "port" : destination.hostile,
    cleared: ["forest1", "grove", "canopy", "causeway", "coast"], tutorial: ["attack", "coins", "special", "eat", "rest", "switch"] };
  if (destination.cloud) p.act3 = { ...p.act3, voyageDone: true, world: "cloud", area: "stormbreakCoast", hollowFound: true,
    cleared: ["stormbreakCoast"], family: { met: true, trusted: true, drawingSeen: true, tunnelOpen: true, aftermathSeen: false } };
  return JSON.stringify({ v: 4, progress: p, player: { x: destination.start[0], z: destination.start[1], yaw: destination.cloud ? 0 : Math.PI }, seconds: 3000 });
}

for (const destination of destinations) for (const friend of friends) {
  test(`${friend} leaves combat and the party follows into ${destination.name}`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.addInitScript(save => localStorage.setItem("mi.save.v4", save), progressedSave(friend, destination));
    const errors = await boot(page);
    await chooseMode(page, "tap");
    await page.getByTestId("btn-continue").click();
    const zone = (s: MiState) => destination.cloud ? (s as CompanionState).act3.zone : s.act2.zone;
    await waitFor(page, s => s.mode === "explore" && zone(s) === destination.hostile && s.act2.stance.friend === friend && s.act2.stance.k > .99, 30_000, `${friend} mounted at hostile border`);
    await hook(page, "combatFixture", { enemies: [] });
    const walk = async ([x, z]: Point) => {
      const at = await hook(page, "moveTo", x, z) as { x: number; z: number };
      expect(Math.hypot(at.x - x, at.z - z), `collision-respecting walk to ${x},${z}`).toBeLessThan(.1);
      await hook(page, "renderFrames", 3);
    };
    const shot = async (beat: string) => {
      await mkdir(folder, { recursive: true });
      await hook(page, "snapCamera"); await hook(page, "renderFrames", 3);
      await page.screenshot({ path: `${folder}/${destination.name}-${friend}-${beat}.png` });
    };
    await shot("combat");
    await walk(destination.entrance);
    await waitFor(page, s => zone(s) === destination.zone && s.act2.stance.friend === null, 30_000, "safe zone releases combat stance");
    await shot("dismounted");
    let s = await state(page);
    expect(s.player.y - s.player.ground, "rider lands on the ground").toBeLessThan(.15);
    expect(s.monsters[friend].mode, "active friend resumes following after its combat script").toBe("follow");
    for (const id of friends) {
      expect(s.monsters[id].visible, `${id} visible in safety`).toBe(true);
      expect(s.monsters[id].mode, `${id} resumes party travel`).toBe(id === friend ? "follow" : "party");
    }
    const border = { ...s.monsters[friend] };
    await walk(destination.onward);
    s = await waitFor(page, current => friends.every(id => Math.hypot(current.monsters[id].x - current.player.x, current.monsters[id].z - current.player.z) < 5.5), 30_000, "whole party catches up inside safe zone");
    expect(Math.hypot(s.monsters[friend].x - border.x, s.monsters[friend].z - border.z), "last active friend leaves the border").toBeGreaterThan(2);
    expect(s.micState).not.toBe("listening");
    await shot("following");
    expect(errors).toEqual([]);
  });
}
