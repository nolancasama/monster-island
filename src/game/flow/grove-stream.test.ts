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
import { cb, resetCombat } from "../combat";
import { tick } from "../sim";

const trace: Array<{ phase: string; time: number; swimming: boolean; riding: boolean; solved: boolean; root: number; water: number;
  zone: string | null; x: number; z: number; seatError: number; marker: boolean }> = [];
let cancelAtSwim = false;
vi.mock("../../audio/audio", () => ({ audio: { play: vi.fn(), voice: vi.fn(), setScene: vi.fn(), startMusic: vi.fn(), setNearness: vi.fn() } }));
vi.mock("./ask", async original => ({
  ...await original<typeof import("./ask")>(),
  ask: vi.fn(), say: vi.fn(async () => {}),
  wait: vi.fn(async (ms: number) => {
    rt.time += ms / 1000;
    tick(ms / 1000);
    const m = rt.monsters.bubbo, solved = getGame().progress.solved;
    const seat = bubboSeat(m, solved, rt.time), p = rt.player;
    trace.push({ phase: groveStreamView.phase, time: rt.time, swimming: m.swimming,
      riding: rt.player.riding, solved: solved.includes("groveStream"),
      root: monsterRootY(m, solved, rt.time), water: streamY(m.x, m.z), zone: cb.zones.current,
      x: p.x, z: p.z, seatError: p.seat === 1 ? Math.hypot(p.x - seat.x, p.y - seat.y, p.z - seat.z) : 0,
      marker: rt.groveStreamFerry.start !== null });
    if (cancelAtSwim && groveStreamView.phase === "swimming") {
      cancelGroveStream();
      Object.assign(rt.player, { x: 76, z: -180 });
    }
  })
}));

beforeEach(() => {
  vi.stubGlobal("window", { setTimeout: () => 0, clearTimeout: () => undefined });
  resetRuntime(); vi.clearAllMocks(); trace.length = 0; cancelAtSwim = false;
  const p = newProgress();
  p.active = "bubbo"; p.monsters.bubbo.friend = p.monsters.bubbo.discovered = true;
  p.act2.started = p.act2.descended = true;
  p.act2.cleared = ["forest1"];
  p.act2.tutorial = ["attack", "coins", "special", "eat", "rest", "switch"];
  setGame({ screen: "game", mode: "explore", progress: p });
  resetCombat();
  rt.act2Scene = "done";
  Object.assign(rt.player, GROVE_STREAM_FERRY.north);
  Object.assign(rt.monsters.bubbo, GROVE_STREAM_FERRY.north);
  vi.mocked(ask).mockResolvedValueOnce("canSwim").mockResolvedValueOnce("thankYou");
});
afterEach(() => { resetRuntime(); resetCombat(); vi.unstubAllGlobals(); setGame({ screen: "title", progress: newProgress() }); });

it.each(["north", "south"] as const)("asks on the %s bank, swims for five seconds, and changes zone only after dismount", async side => {
  const from = GROVE_STREAM_FERRY[side], to = GROVE_STREAM_FERRY[side === "north" ? "south" : "north"];
  Object.assign(rt.player, from);
  Object.assign(rt.monsters.bubbo, from);
  expect(findFocus()).toMatchObject({ id: "groveStream", verb: "Look at", noun: "the stream", ...from });
  expect(gatesOf(getGame().progress).solved).not.toContain("groveStream");
  await useObstacle("groveStream");
  expect(ask).toHaveBeenNthCalledWith(1, expect.objectContaining({ show: ["canSwim"] }));
  expect(say).toHaveBeenCalledWith("bubbo", "Yes, I can!", undefined, expect.anything());
  const swim = trace.filter(f => f.phase === "swimming");
  expect(swim.every(f => f.swimming && f.riding && !f.solved)).toBe(true);
  expect(swim.at(-1)!.time - swim[0].time).toBeCloseTo(5, 1);
  expect(swim.every(f => f.seatError < .000001)).toBe(true);
  const owned = trace.filter(f => f.marker);
  expect(owned.every(f => f.zone === (side === "north" ? "forest1" : "grove"))).toBe(true);
  const board = owned.filter(f => f.phase === "boarding"), land = owned.filter(f => f.phase === "dismounting");
  expect(board.at(-1)!.time - board[0].time).toBeGreaterThan(1);
  expect(board.at(-1)!.time - board[0].time).toBeLessThan(1.5);
  expect(land.at(-1)!.time - land[0].time).toBeGreaterThan(.9);
  expect(land.at(-1)!.time - land[0].time).toBeLessThan(1.15);
  expect(swim.some(f => f.root < f.water && f.root > f.water - .4)).toBe(true);
  expect(rt.player).toMatchObject({ ...to, riding: false, frozen: false });
  expect(rt.monsters.bubbo.swimming).toBe(false);
  expect(getGame().progress.solved).toEqual(["groveStream"]);
  expect(gatesOf(getGame().progress).solved).toContain("groveStream");
  expect(rt.act2Unlock.groveLilies).toBe(0);
  expect(groveStreamView.phase).toBe("complete");
  expect(rt.groveStreamFerry.start).toBeNull();
  tick(.016);
  expect(cb.zones.current).toBe(side === "north" ? "grove" : "forest1");
});

it("offers both banks and repeats continuously in either direction with any active friend in 3–4 seconds", async () => {
  const p = getGame().progress;
  setGame({ progress: { ...p, solved: ["groveStream"], active: "leafy" } });
  vi.mocked(ask).mockReset();
  for (const side of ["north", "south"] as const) {
    const from = GROVE_STREAM_FERRY[side], to = GROVE_STREAM_FERRY[side === "north" ? "south" : "north"];
    Object.assign(rt.player, from);
    expect(findFocus()).toMatchObject({ id: "groveStream", verb: "Ride", noun: "Bubbo" });
    const start = rt.time;
    trace.length = 0;
    await useObstacle("groveStream");
    expect(rt.time - start).toBeGreaterThanOrEqual(3);
    expect(rt.time - start).toBeLessThanOrEqual(4);
    const swim = trace.filter(f => f.phase === "swimming");
    expect(swim.length).toBeGreaterThan(50);
    expect(swim.every(f => f.riding && f.seatError < .000001)).toBe(true);
    for (let i = 1; i < swim.length; i++) expect(Math.hypot(swim[i].x - swim[i - 1].x, swim[i].z - swim[i - 1].z)).toBeLessThan(.2);
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
