import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { newProgress } from "../logic/progress";
import { getGame, setGame } from "../store";
import { resetRuntime, rt } from "../runtime";
import { bubboSeat, monsterRootY } from "../ride";
import { GROVE_STREAM_FERRY } from "../world/groveStream";
import { streamY } from "../world/lowland";
import { ask, say } from "./ask";
import { cancelGroveStream, groveStreamView, useObstacle } from "./obstacles";
import { findFocus } from "./focus";
import { gatesOf } from "../world/collision";

const trace: Array<{ phase: string; time: number; swimming: boolean; riding: boolean; solved: boolean; root: number; water: number }> = [];
let cancelAtSwim = false;
vi.mock("../../audio/audio", () => ({ audio: { play: vi.fn(), voice: vi.fn() } }));
vi.mock("./ask", async original => ({
  ...await original<typeof import("./ask")>(),
  ask: vi.fn(), say: vi.fn(async () => {}),
  wait: vi.fn(async (ms: number) => {
    rt.time += ms / 1000;
    const m = rt.monsters.bubbo, solved = getGame().progress.solved;
    if (rt.player.riding && rt.player.seat === 1) Object.assign(rt.player, bubboSeat(m, solved, rt.time));
    trace.push({ phase: groveStreamView.phase, time: rt.time, swimming: m.swimming,
      riding: rt.player.riding, solved: solved.includes("groveStream"),
      root: monsterRootY(m, solved, rt.time), water: streamY(m.x, m.z) });
    if (cancelAtSwim && groveStreamView.phase === "swimming") {
      cancelGroveStream();
      Object.assign(rt.player, { x: 76, z: -180 });
    }
  })
}));

beforeEach(() => {
  resetRuntime(); vi.clearAllMocks(); trace.length = 0; cancelAtSwim = false;
  const p = newProgress();
  p.active = "bubbo"; p.monsters.bubbo.friend = p.monsters.bubbo.discovered = true;
  p.act2.started = p.act2.descended = true;
  setGame({ screen: "game", mode: "explore", progress: p });
  Object.assign(rt.player, GROVE_STREAM_FERRY.north);
  Object.assign(rt.monsters.bubbo, GROVE_STREAM_FERRY.north);
  vi.mocked(ask).mockResolvedValueOnce("canSwim").mockResolvedValueOnce("thankYou");
});
afterEach(() => { resetRuntime(); setGame({ screen: "title", progress: newProgress() }); });

it("asks, seats the rider for a three-second swim, and solves only after dismount", async () => {
  expect(gatesOf(getGame().progress).solved).not.toContain("groveStream");
  await useObstacle("groveStream");
  expect(ask).toHaveBeenNthCalledWith(1, expect.objectContaining({ show: ["canSwim"] }));
  expect(say).toHaveBeenCalledWith("bubbo", "Yes, I can!", undefined, expect.anything());
  const swim = trace.filter(f => f.phase === "swimming");
  expect(swim.every(f => f.swimming && f.riding && !f.solved)).toBe(true);
  expect(swim.at(-1)!.time - swim[0].time).toBeCloseTo(3, 1);
  expect(swim.some(f => f.root < f.water && f.root > f.water - .4)).toBe(true);
  expect(rt.player).toMatchObject({ ...GROVE_STREAM_FERRY.south, riding: false, frozen: false });
  expect(rt.monsters.bubbo.swimming).toBe(false);
  expect(getGame().progress.solved).toEqual(["groveStream"]);
  expect(gatesOf(getGame().progress).solved).toContain("groveStream");
  expect(rt.act2Unlock.groveLilies).toBe(0);
  expect(groveStreamView.phase).toBe("complete");
  expect(rt.groveStreamFerry.start).toBeNull();
});

it("offers both banks and repeats in either direction with any active friend within 2.5 seconds", async () => {
  const p = getGame().progress;
  setGame({ progress: { ...p, solved: ["groveStream"], active: "leafy" } });
  vi.mocked(ask).mockReset();
  for (const side of ["north", "south"] as const) {
    const from = GROVE_STREAM_FERRY[side], to = GROVE_STREAM_FERRY[side === "north" ? "south" : "north"];
    Object.assign(rt.player, from);
    expect(findFocus()).toMatchObject({ id: "groveStream", verb: "Ride", noun: "Bubbo" });
    const start = rt.time;
    await useObstacle("groveStream");
    expect(rt.time - start).toBeLessThanOrEqual(2.5);
    expect(rt.player).toMatchObject({ ...to, frozen: false, riding: false });
    expect(rt.camera.mode).toBe("follow");
  }
  expect(ask).not.toHaveBeenCalled(); expect(say).not.toHaveBeenCalled();
});

it("cancellation during swimming releases every script flag without overwriting a teleport", async () => {
  cancelAtSwim = true;
  await useObstacle("groveStream");
  expect(rt.player).toMatchObject({ x: 76, z: -180, frozen: false, riding: false, seat: 0 });
  expect(rt.monsters.bubbo).toMatchObject({ swimming: false, air: 0, airTarget: 0 });
  expect(rt.groveStreamFerry.start).toBeNull();
  expect(groveStreamView.phase).toBe("idle");
  expect(getGame().progress.solved).not.toContain("groveStream");
});
