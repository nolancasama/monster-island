import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { newProgress } from "../logic/progress";
import { resetRuntime, rt } from "../runtime";
import { getGame, setGame } from "../store";
import { bubboSeat, monsterRootY } from "../ride";
import { GROVE_CROSSING, POND_Y } from "../world/lowland";
import { groveCrossingView, useObstacle } from "./obstacles";
import { ask } from "./ask";
import { audio } from "../../audio/audio";

const frames: Array<{ phase: string; x: number; root: number; swimming: boolean; solved: boolean; pads: number; frozen: boolean }> = [];
vi.mock("../../audio/audio", () => ({ audio: { play: vi.fn(), voice: vi.fn() } }));
vi.mock("./ask", async original => ({
  ...await original<typeof import("./ask")>(),
  ask: vi.fn(), say: vi.fn(async () => {}),
  wait: vi.fn(async () => {
    rt.time += .03;
    const solved = getGame().progress.solved, m = rt.monsters.bubbo;
    if (rt.player.riding && rt.player.seat === 1) {
      const seat = bubboSeat(m, solved, rt.time);
      rt.player.x = seat.x; rt.player.z = seat.z;
    }
    frames.push({ phase: groveCrossingView.phase, x: m.x, root: monsterRootY(m, solved, rt.time), swimming: m.swimming,
      solved: solved.includes("groveLilies"), pads: rt.act2Unlock.groveLilies ?? 0, frozen: rt.player.frozen });
  })
}));

beforeEach(() => {
  resetRuntime(); frames.length = 0; vi.clearAllMocks();
  const p = newProgress();
  p.active = "bubbo"; p.monsters.bubbo.friend = true; p.monsters.bubbo.discovered = true;
  p.act2.started = p.act2.descended = true;
  setGame({ screen: "game", mode: "explore", progress: p });
  Object.assign(rt.player, GROVE_CROSSING.near);
  Object.assign(rt.monsters.bubbo, { x: GROVE_CROSSING.near.x, z: GROVE_CROSSING.near.z + 1 });
  vi.mocked(ask).mockResolvedValueOnce("canSwim").mockResolvedValueOnce("thankYou");
});
afterEach(() => { resetRuntime(); setGame({ screen: "title", progress: newProgress() }); });

it("rides before solving, dismounts before sequential pads, then returns control without replay", async () => {
  await useObstacle("groveLilies");
  expect(ask).toHaveBeenNthCalledWith(1, expect.objectContaining({ show: ["canSwim"] }));
  const phases = [...new Set(frames.map(f => f.phase).filter(phase => phase !== "idle"))];
  expect(phases).toEqual(["boarding", "swimming", "dismounting", "raising"]);
  const swim = frames.filter(f => f.phase === "swimming");
  expect(swim.length).toBeGreaterThan(100);
  expect(swim.every(f => f.swimming && !f.solved && f.pads === 0 && f.frozen)).toBe(true);
  expect(swim.some(f => f.root < POND_Y && f.root > POND_Y - .4)).toBe(true);
  expect(Math.min(...swim.map(f => f.x))).toBeCloseTo(GROVE_CROSSING.swimEnd.x, 1);
  expect(frames.filter(f => f.phase === "raising").every(f => f.solved && f.frozen && !f.swimming)).toBe(true);
  expect(rt.player).toMatchObject({ ...GROVE_CROSSING.landing, riding: false, frozen: false });
  expect(rt.act2Unlock.groveLilies).toBe(1);
  expect(groveCrossingView.phase).toBe("complete");
  expect(getGame().mode).toBe("explore");
  const calls = vi.mocked(audio.play).mock.calls.length;
  await useObstacle("groveLilies");
  expect(audio.play).toHaveBeenCalledTimes(calls);
});
