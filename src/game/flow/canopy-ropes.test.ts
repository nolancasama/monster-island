import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DebugScriptCancelled } from "../debugLifecycle";
import { newProgress } from "../logic/progress";
import { resetRuntime, rt } from "../runtime";
import { getGame, setGame } from "../store";
import { standY } from "../world/collision";
import { CANOPY_ROPES, CLIFF_ROPE } from "../world/lowland";
import { climbCliff, climbRope } from "./act2";
import { ask, say, wait } from "./ask";
import { findFocus } from "./focus";
import { useObstacle } from "./obstacles";

const flightFrames: Array<{ payout: number; air: number; x: number; z: number }> = [];
vi.mock("../../audio/audio", () => ({ audio: { play: vi.fn(), voice: vi.fn() } }));
vi.mock("../store", async original => ({
  ...await original<typeof import("../store")>(),
  toast: vi.fn()
}));
vi.mock("./script", async original => ({
  ...await original<typeof import("./script")>(),
  fadeThrough: async (during: () => void | Promise<void>) => { await during(); }
}));
vi.mock("./ask", async original => ({
  ...await original<typeof import("./ask")>(),
  ask: vi.fn(), say: vi.fn(async () => {}),
  wait: vi.fn(async () => {
    rt.time += .03;
    if (rt.canopyAscentRope.carried) flightFrames.push({ payout: rt.canopyAscentRope.payout,
      air: rt.monsters.puff.air, x: rt.monsters.puff.x, z: rt.monsters.puff.z });
  })
}));

beforeEach(() => {
  resetRuntime(); flightFrames.length = 0; vi.clearAllMocks();
  const progress = newProgress();
  progress.act2.started = progress.act2.descended = true;
  progress.active = "puff";
  progress.monsters.puff.friend = progress.monsters.puff.discovered = true;
  Object.assign(rt.player, CANOPY_ROPES.entrance.foot, { yaw: Math.PI });
  Object.assign(rt.monsters.puff, { x: rt.player.x + 1, z: rt.player.z });
  setGame({ screen: "game", mode: "explore", progress });
});
afterEach(() => { resetRuntime(); setGame({ screen: "title", progress: newProgress() }); });

describe("Canopy entrance question", () => {
  it("offers the ask before solving, pays out the rope through Puff's flight, then offers climbing permanently", async () => {
    expect(findFocus()).toMatchObject({ id: "canopyAscentRope", kind: "obstacle" });
    vi.mocked(ask).mockResolvedValueOnce("canFly").mockResolvedValueOnce("thankYou");
    await useObstacle("canopyAscentRope");
    expect(ask).toHaveBeenNthCalledWith(1, expect.objectContaining({ show: ["canFly"], options: ["canFly", "canJump", "canSwim"] }));
    expect(say).toHaveBeenCalledWith("puff", "Yes, I can!", undefined, expect.objectContaining({ tone: "yes" }));
    expect(getGame().progress.solved).toContain("canopyAscentRope");
    expect(flightFrames.length).toBeGreaterThan(40);
    expect(flightFrames.some(f => f.payout > .2 && f.payout < .8)).toBe(true);
    expect(flightFrames.every((f, i) => i === 0 || f.payout >= flightFrames[i - 1].payout)).toBe(true);
    expect(Math.max(...flightFrames.map(f => f.air))).toBeGreaterThan(9);
    expect(rt.canopyAscentRope).toEqual({ carried: false, payout: 1, tied: 1 });
    expect(findFocus()).toMatchObject({ id: "canopyEntranceUp", kind: "cliffRope" });
    const asked = vi.mocked(ask).mock.calls.length;
    await useObstacle("canopyAscentRope");
    expect(ask).toHaveBeenCalledTimes(asked);
  });

  it("keeps the rope unsolved when the right question is asked of a helper who cannot fly", async () => {
    setGame(g => ({ progress: { ...g.progress, active: "leafy", monsters: { ...g.progress.monsters,
      leafy: { ...g.progress.monsters.leafy, friend: true, discovered: true } } } }));
    vi.mocked(ask).mockResolvedValueOnce("canFly");
    await useObstacle("canopyAscentRope");
    expect(getGame().progress.solved).not.toContain("canopyAscentRope");
    expect(flightFrames).toHaveLength(0);
  });

  it("lets a wrong question retry without solving or flying", async () => {
    vi.mocked(ask).mockResolvedValueOnce("canSwim").mockResolvedValueOnce(null);
    await useObstacle("canopyAscentRope");
    expect(getGame().progress.solved).not.toContain("canopyAscentRope");
    expect(flightFrames).toHaveLength(0);
  });
});

describe("shared rope climbs", () => {
  it.each(["entrance", "exit"] as const)("climbs %s both ways, dismounts, and stores the destination as safe ground", async id => {
    const rope = CANOPY_ROPES[id];
    setGame(g => ({ progress: { ...g.progress, solved: ["canopyAscentRope"], act2: { ...g.progress.act2, cleared: ["canopy"] } } }));
    for (const down of [false, true]) {
      rt.player.riding = true; rt.player.seat = 1;
      await climbRope(rope, down);
      const destination = down ? rope.foot : rope.top;
      expect(rt.player).toMatchObject({ ...destination, y: standY(destination.x, destination.z, getGame().progress.solved),
        safeGround: destination, riding: false, seat: 0, frozen: false, climbY: null });
      expect(rt.camera.mode).toBe("follow");
      expect(getGame().mode).toBe("explore");
    }
  });

  it("refuses ascent from the Causeway until the Canopy is cleared", async () => {
    Object.assign(rt.player, CANOPY_ROPES.exit.foot);
    await climbRope(CANOPY_ROPES.exit, false);
    expect(rt.player).toMatchObject({ ...CANOPY_ROPES.exit.foot, frozen: false, climbY: null });
    expect(say).toHaveBeenCalledWith("self", expect.stringContaining("Canopy first"), expect.any(String));
  });

  it("does not climb an unsolved entrance rope", async () => {
    await climbRope(CANOPY_ROPES.entrance, false);
    expect(rt.player).toMatchObject({ ...CANOPY_ROPES.entrance.foot, frozen: false, climbY: null });
  });

  it("cleans up frozen and climbY after a debug cancellation", async () => {
    setGame(g => ({ progress: { ...g.progress, solved: ["canopyAscentRope"] } }));
    vi.mocked(wait).mockRejectedValueOnce(new DebugScriptCancelled());
    await climbRope(CANOPY_ROPES.entrance, false);
    expect(rt.player).toMatchObject({ frozen: false, climbY: null, safeGround: CANOPY_ROPES.entrance.foot });
    expect(rt.camera.mode).toBe("follow");
  });

  it("retains the sanctuary rope's original stands and final heading", async () => {
    for (const down of [false, true]) {
      await climbCliff(down);
      expect(rt.player).toMatchObject({ ...(down ? CLIFF_ROPE.foot : CLIFF_ROPE.top), yaw: Math.PI, frozen: false, climbY: null });
    }
  });
});
