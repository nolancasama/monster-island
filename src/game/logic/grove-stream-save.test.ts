import { afterEach, describe, expect, it } from "vitest";
import { decodeSave, encodeSave } from "./save";
import { newProgress } from "./progress";
import { markDescended, startAct2 } from "./act2";
import type { MonsterId } from "../types";
import { gatesOf, isWalkable, PLAYER_R } from "../world/collision";
import { GROVE_STREAM, GROVE_STREAM_FERRY, groveStreamSide } from "../world/groveStream";
import { nearestOnTrail } from "../world/lowland";
import { rt } from "../runtime";

function chapter() {
  const p = newProgress();
  for (const id of ["leafy", "bubbo", "puff", "ember", "lumo"] as MonsterId[]) {
    p.monsters[id] = { discovered: true, friend: true, asked: {}, canKnown: {}, described: {}, ...(id === "ember" ? { invited: true } : {}) };
  }
  p.endings = 3;
  p.solved = ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame"];
  const result = markDescended(startAct2(p));
  result.act2.cleared = ["forest1"];
  result.act2.zone = "grove";
  return result;
}

function load(p: ReturnType<typeof chapter>, position = GROVE_STREAM_FERRY.north) {
  return decodeSave(JSON.stringify({ v: 4, progress: p, player: { ...position, yaw: .7 }, seconds: 87 }))!;
}

describe("Grove stream additive v4 save migration", () => {
  it.each(["grove", "canopy", "causeway", "coast"] as const)("keeps the north-bank question after a prior %s clear", stage => {
    const p = chapter();
    p.act2.cleared.push(stage);
    const back = load(p);
    expect(back.v).toBe(4);
    expect(back.progress.solved).not.toContain("groveStream");
    expect(back.progress.solved).not.toContain("groveLilies");
    expect(back.progress.act2.cleared).toEqual(p.act2.cleared);
    expect(decodeSave(encodeSave(back.progress, back.player, back.seconds))).toEqual(back);
  });

  it("keeps the north-bank question with an independently solved lily pond", () => {
    const p = chapter();
    p.solved.push("groveLilies");
    const back = load(p);
    expect(back.progress.solved).toEqual(p.solved);
    expect(back.progress.act2.cleared).toEqual(p.act2.cleared);
  });

  it("grants the stream to a saved Grove player south of it without granting the lily puzzle", () => {
    const p = chapter();
    const back = load(p, GROVE_STREAM_FERRY.south);
    expect(back.progress.solved).toEqual([...p.solved, "groveStream"]);
    expect(back.player).toEqual({ ...GROVE_STREAM_FERRY.south, yaw: .7 });
  });

  it("keeps the question for an unsolved north-bank save", () => {
    const p = chapter();
    const back = load(p);
    expect(back.progress.solved).toEqual(p.solved);
    expect(back.player).toEqual({ ...GROVE_STREAM_FERRY.north, yaw: .7 });
  });

  it("retains an explicit ferry unlock and its existing independent lily state", () => {
    const p = chapter();
    p.solved.push("groveStream");
    expect(load(p).progress.solved).toEqual(p.solved);
    p.solved.splice(p.solved.length - 1, 0, "groveLilies");
    expect(load(p).progress.solved).toEqual(p.solved);
  });

  it.each([{ x: 46, z: -207.2 }, { x: 46, z: -214.5 }, { x: 54.6, z: -208.4 }])(
    "keeps former entrance banks / water dry and does not grant the new door crossing at $x,$z", position => {
      const p = chapter(), back = load(p, position);
      expect(isWalkable(position.x, position.z, gatesOf(p), PLAYER_R)).toBe(true);
      expect(back.player).toEqual({ ...position, yaw: .7 });
      expect(back.progress.solved).toEqual(p.solved);
    });

  it.each([
    { x: 56, z: -232.8 },
    { x: 56, z: -234.8 },
    { x: 42, z: -233.8 },
    { x: 42, z: -235.8 },
    { x: 66, z: -233.8 },
    { x: 66, z: -235.5 },
    { x: 55, z: -203.5 },
    { x: 46.85, z: -203.2 },
    { x: 43.6, z: -229.5 },
    { x: 34, z: -210 },
    { x: 51.4, z: -224.15 },
    { x: 52, z: -207 },
  ])("recovers changed water/scenery at $x,$z to nearby walkable ground on its original bank", position => {
    const p = chapter();
    p.act2.hp = 43;
    p.act2.coins = 73;
    const back = load(p, position);
    expect(isWalkable(position.x, position.z, gatesOf(p), PLAYER_R)).toBe(false);
    expect(isWalkable(back.player.x, back.player.z, gatesOf(back.progress), PLAYER_R)).toBe(true);
    expect(groveStreamSide(back.player.x, back.player.z)).toBe(groveStreamSide(position.x, position.z));
    expect(Math.hypot(back.player.x - position.x, back.player.z - position.z)).toBeLessThan(4);
    expect(back.progress.act2).toMatchObject({ zone: "grove", hp: 43, coins: 73, cleared: p.act2.cleared });
    expect(back.progress.solved.includes("groveStream")).toBe(groveStreamSide(position.x, position.z) === "south");
    expect(back.player.yaw).toBe(.7);
    expect(back.seconds).toBe(87);
    expect(decodeSave(encodeSave(back.progress, back.player, back.seconds))).toEqual(back);
  });

  it.each(["north", "south"] as const)("recovers the new water to the nearest floor on its %s side", side => {
    const p = chapter();
    const position = { x: 56, z: -233.4 + (side === "north" ? .1 : -.1) };
    const back = load(p, position), gates = gatesOf(back.progress);
    const distance = Math.hypot(back.player.x - position.x, back.player.z - position.z);
    expect(nearestOnTrail(GROVE_STREAM.pts, back.player.x, back.player.z).d).toBeGreaterThanOrEqual(GROVE_STREAM.w + PLAYER_R);
    expect(groveStreamSide(back.player.x, back.player.z)).toBe(side);
    // Independently sample closer candidates. Recovery's 0.1m rings bound
    // the distance error; a ferry-bank teleport would fail this check.
    for (let dx = -distance; dx <= distance; dx += .05) for (let dz = -distance; dz <= distance; dz += .05) {
      if (Math.hypot(dx, dz) >= distance - .15) continue;
      const x = position.x + dx, z = position.z + dz;
      if (groveStreamSide(x, z) !== side) continue;
      expect(isWalkable(x, z, gates, PLAYER_R)).toBe(false);
    }
  });

  describe("mid-ferry autosave", () => {
    const previous = { x: rt.player.x, z: rt.player.z, hop: rt.player.hop };
    afterEach(() => {
      Object.assign(rt.player, previous);
      rt.groveStreamFerry.start = null;
    });

    it.each(["north", "south"] as const)("resolves a ferry leaving %s to its departure bank", side => {
      const p = chapter();
      p.solved.push("groveStream");
      rt.player.x = 56;
      rt.player.z = -233.8;
      rt.groveStreamFerry.start = GROVE_STREAM_FERRY[side];
      const back = decodeSave(encodeSave(p, { x: rt.player.x, z: rt.player.z, yaw: 1.2 }, 99))!;
      expect(back.player).toEqual({ ...GROVE_STREAM_FERRY[side], yaw: 1.2 });
      expect(back.progress.solved).not.toContain("groveLilies");
    });

    it("resumes an unfinished first crossing at the north bank with its question intact", () => {
      const p = chapter();
      rt.player.x = 56;
      rt.player.z = -235;
      rt.groveStreamFerry.start = GROVE_STREAM_FERRY.north;
      const back = decodeSave(encodeSave(p, { x: rt.player.x, z: rt.player.z, yaw: 0 }, 99))!;
      expect(back.player).toEqual({ ...GROVE_STREAM_FERRY.north, yaw: 0 });
      expect(back.progress.solved).not.toContain("groveStream");
      expect(back.progress.solved).not.toContain("groveLilies");
    });
  });
});
