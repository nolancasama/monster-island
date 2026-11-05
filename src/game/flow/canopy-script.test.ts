import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newProgress } from "../logic/progress";
import { MONSTERS } from "../data/monsters";
import { monsterRootY } from "../ride";
import { resetRuntime, rt } from "../runtime";
import { getGame, setGame } from "../store";
import type { Vec2 } from "../types";
import { standY } from "../world/collision";
import { groundY } from "../world/island";
import { ACT2_OBSTACLE_PLACE, CANOPY_GAPS, CHESTS, canopyDeckY } from "../world/lowland";
import { region } from "../world/region";
import { ask } from "./ask";
import { useObstacle } from "./obstacles";
import { frameTwo, shot, walkY } from "./script";

const helperFrames: Array<{ x: number; z: number; y: number; air: number; targetY: number }> = [];
vi.mock("../../audio/audio", () => ({ audio: { play: vi.fn(), voice: vi.fn() } }));
vi.mock("./ask", async original => ({
  ...await original<typeof import("./ask")>(),
  ask: vi.fn(), say: vi.fn(async () => {}),
  wait: vi.fn(async () => {
    rt.time += .03;
    const progress = getGame().progress;
    if (!progress.active) return;
    const m = rt.monsters[progress.active];
    if (m.mode === "script") helperFrames.push({ x: m.x, z: m.z, air: m.air,
      y: monsterRootY(m, progress.solved, rt.time), targetY: rt.camera.shot!.target.y });
  })
}));

beforeEach(() => {
  resetRuntime(); region.world = "home"; helperFrames.length = 0; vi.clearAllMocks();
  const progress = newProgress();
  progress.act2.started = progress.act2.descended = true;
  setGame({ screen: "game", mode: "explore", progress });
});
afterEach(() => { resetRuntime(); setGame({ screen: "title", progress: newProgress() }); });

// The pre-deck framing calculation: ordinary ground must retain these exact coordinates.
function originalFrame(a: Vec2, b: Vec2, zoom: number) {
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
  const ux = dx / len, uz = dz / len;
  let px = -uz, pz = ux;
  if (px * (rt.camera.pos.x - a.x) + pz * (rt.camera.pos.z - a.z + 2) < 0) { px = -px; pz = -pz; }
  const back = (2.2 + len * .5) * zoom, side = (3 + len * .35) * zoom;
  const gy = groundY(a.x, a.z);
  return {
    pos: { x: a.x - ux * back + px * side, y: gy + 2.2 * zoom, z: a.z - uz * back + pz * side },
    target: { x: a.x + ux * len * .62, y: gy + .55, z: a.z + uz * len * .62 }
  };
}

describe("scripted walking heights", () => {
  it("reads the current solved bridges rather than retaining an earlier floor height", () => {
    const gap = CANOPY_GAPS.canopyVines;
    const point = { x: gap.x, z: (gap.z0 + gap.z1) / 2 };
    expect(walkY(point)).toBe(groundY(point.x, point.z));
    setGame(g => ({ progress: { ...g.progress, solved: ["canopyVines"] } }));
    expect(walkY(point)).toBe(standY(point.x, point.z, ["canopyVines"]));
    expect(walkY(point)).toBeGreaterThan(groundY(point.x, point.z) + 9);
  });

  it.each([0, Math.PI / 2, Math.PI, -Math.PI / 2])("frames the Canopy chest from orientation %s above the deck", angle => {
    const chest = CHESTS.find(c => c.id === "canopyChest")!;
    const player = { x: chest.x + Math.cos(angle), z: chest.z + Math.sin(angle) };
    rt.camera.pos.x = player.x + Math.sin(angle) * 8;
    rt.camera.pos.z = player.z - Math.cos(angle) * 8;
    frameTwo(player, chest);
    const frame = rt.camera.shot!;
    expect(walkY(player)).toBeGreaterThan(groundY(player.x, player.z) + 9);
    expect(frame.pos.y).toBeGreaterThanOrEqual(walkY(frame.pos) + 1.2);
    expect(frame.pos.y).toBeGreaterThanOrEqual(walkY(player) + 1);
    expect(frame.target.y).toBeCloseTo(walkY(player) + .55);
  });

  it.each([0, Math.PI / 2, Math.PI, -Math.PI / 2])("retains exact forest-floor framing from orientation %s", angle => {
    const chest = CHESTS.find(c => c.id === "forestChest")!;
    const player = { x: chest.x + Math.cos(angle) * 1.5, z: chest.z + Math.sin(angle) * 1.5 };
    rt.camera.pos.x = player.x + Math.sin(angle) * 8;
    rt.camera.pos.z = player.z - Math.cos(angle) * 8;
    const previous = originalFrame(player, chest, 1.1);
    frameTwo(player, chest, 1.1);
    expect(rt.camera.shot).toEqual(previous);
  });

  it("raises a low shot above the camera's deck and the subject's walking surface", () => {
    const subject = { x: 106, z: -213 };
    const pos = { x: 104, y: groundY(104, -212), z: -212 };
    const target = { ...subject, y: walkY(subject) + .6 };
    shot(pos, target);
    expect(rt.camera.shot!.pos.y).toBeGreaterThanOrEqual(walkY(pos) + 1.2);
    expect(rt.camera.shot!.pos.y).toBeGreaterThanOrEqual(walkY(subject) + 1);
    expect(rt.camera.shot!.target).toEqual(target);
  });

  it("retains the sanctuary celebration and low prologue sky framing exactly", () => {
    const h = MONSTERS.lumo.home, gy = groundY(h.x, h.z);
    for (const frame of [
      { pos: { x: h.x + 7, y: gy + 4.4, z: h.z + 9 }, target: { x: h.x, y: gy + 1.8, z: h.z } },
      { pos: { x: h.x + 2.5, y: gy + 1.6, z: h.z + 7.5 }, target: { x: h.x, y: gy + 11, z: h.z - 1.5 } }
    ]) {
      shot(frame.pos, frame.target);
      expect(rt.camera.shot).toEqual(frame);
    }
  });
});

describe("Canopy puzzle helpers", () => {
  it.each(["canopyVines", "canopyRope"] as const)("places %s's helper relative to the rendered walking surface", async id => {
    const monster = id === "canopyVines" ? "leafy" : "puff";
    const place = ACT2_OBSTACLE_PLACE[id];
    const progress = newProgress();
    progress.act2.started = progress.act2.descended = true;
    progress.active = monster;
    progress.monsters[monster].friend = progress.monsters[monster].discovered = true;
    if (id === "canopyRope") progress.solved = ["canopyVines"];
    setGame({ progress });
    Object.assign(rt.player, { x: place.x, z: place.z });
    Object.assign(rt.monsters[monster], { x: place.x + 1.4, z: place.z + .3, air: 0, airTarget: 0 });
    vi.mocked(ask).mockResolvedValueOnce(id === "canopyVines" ? "canHelp" : "canFly").mockResolvedValueOnce("thankYou");
    await useObstacle(id);
    expect(getGame().progress.solved).toContain(id);
    expect(helperFrames.length).toBeGreaterThan(50);
    for (const frame of helperFrames) expect(frame.targetY).toBeCloseTo(walkY(place) + .6);
    const powerEffects = rt.effects.filter(f => f.x === place.face.x && f.z === place.face.z);
    expect(powerEffects.length).toBeGreaterThan(0);
    for (const effect of powerEffects) expect(effect.y).toBeCloseTo(walkY(place) + .6);
    if (id === "canopyVines") {
      for (const frame of helperFrames) {
        expect(frame.air).toBe(0);
        expect(frame.y).toBe(walkY(frame));
      }
    } else {
      const far = { x: CANOPY_GAPS.canopyRope.x + .6, z: CANOPY_GAPS.canopyRope.z0 - .6 };
      const startY = canopyDeckY(place.x + 1.4, place.z + .3), endY = canopyDeckY(far.x, far.z);
      expect(Math.min(...helperFrames.map(f => f.y))).toBeGreaterThanOrEqual(Math.min(startY, endY) - .1);
      expect(Math.max(...helperFrames.map(f => f.y))).toBeLessThanOrEqual(Math.max(startY, endY) + 3.5);
      const arrival = helperFrames.find(f => Math.abs(f.x - far.x) < .001 && Math.abs(f.z - far.z) < .001)!;
      expect(arrival).toBeDefined();
      expect(arrival.y).toBeCloseTo(endY + 3.4, 0);
      expect(rt.monsters.puff.air).toBeCloseTo(.35);
    }
    expect(rt.camera.mode).toBe("follow");
    expect(rt.camera.shot).toBeNull();
  });
});
