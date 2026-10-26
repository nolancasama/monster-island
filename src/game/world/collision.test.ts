import { describe, expect, it } from "vitest";
import { LAVA_CRUST, LAVA_RAMP, PLAYER_R, blocked, isWalkable, lavaCrustY, moveCircle, standY, type Gates, type Obstacles } from "./collision";
import { APPLE_TREES, CAMP, DRIFTWOOD, FALLEN_PALM, LAVA, PALM_SOLIDS, PIER, groundY, solidAt } from "./island";

const beach: Gates = { solved: ["fallenPalm"] };

describe("solid collision movement", () => {
  it("blocks walking into the camp tent and a tree trunk", () => {
    const tent = moveCircle(CAMP.tent.x, CAMP.tent.z + 3.5, CAMP.tent.x, CAMP.tent.z, PLAYER_R);
    expect(tent.z).toBeGreaterThan(CAMP.tent.z + 1);
    expect(isWalkable(tent.x, tent.z, undefined, PLAYER_R)).toBe(true);
    expect(isWalkable(CAMP.tent.x, CAMP.tent.z, undefined, PLAYER_R)).toBe(false);

    const tree = APPLE_TREES[0];
    const p = moveCircle(tree.x, tree.z + 2, tree.x, tree.z, PLAYER_R);
    expect(p.z).toBeGreaterThan(tree.z + PLAYER_R);
    expect(blocked(p.x, p.z, PLAYER_R)).toBe(false);
    expect(isWalkable(tree.x, tree.z, undefined, PLAYER_R)).toBe(false);
  });

  const wall: Obstacles = { circles: [], boxes: [{ x0: -22.1, x1: -21.9, z0: -2, z1: 3 }] };

  it("preserves tangential motion while sliding along a wall", () => {
    const p = moveCircle(-23, 0, -21, 1, PLAYER_R, undefined, false, [wall]);
    expect(p.x).toBeLessThanOrEqual(-22.1 - PLAYER_R + 1e-5);
    expect(p.z).toBeCloseTo(1, 4);
  });

  it("cannot tunnel through a thin wall with a long movement request", () => {
    const p = moveCircle(-23, 0, -20, 0, PLAYER_R, undefined, false, [wall]);
    expect(p.x).toBeLessThanOrEqual(-22.1 - PLAYER_R + 1e-5);
    expect(p.x).toBeGreaterThan(-23);
  });

  it("slides along a rotated, scaled placement in its own tangent direction", () => {
    const yaw = Math.PI / 4;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const shape = solidAt({ x: -20, z: 0, yaw, scale: 2 }, { kind: "box", x: 0, z: 0, hx: 0.05, hz: 1.5, yaw: 0 });
    const p = moveCircle(-20 - c, s, -20 + c + s, -s + c, PLAYER_R, undefined, false, [{ circles: [], boxes: [], shapes: [shape] }]);
    const localX = c * (p.x + 20) - s * p.z;
    const localZ = s * (p.x + 20) + c * p.z;
    expect(localX).toBeCloseTo(-0.1 - PLAYER_R, 4);
    expect(localZ).toBeCloseTo(1, 4);
  });

  it("blocks crossing a driftwood capsule without making its surroundings solid", () => {
    const log = DRIFTWOOD[0];
    const p = moveCircle(log.x, log.z - 1.5, log.x, log.z + 1, PLAYER_R, beach);
    expect(p.z).toBeLessThan(log.z);
    expect(isWalkable(p.x, p.z, beach, PLAYER_R)).toBe(true);
    expect(blocked(log.x, log.z, PLAYER_R, beach)).toBe(true);
  });

  it("moves the fallen palm barrier to its resting location and clears the pass", () => {
    const start = { x: FALLEN_PALM.x - 3, z: FALLEN_PALM.z };
    const target = { x: FALLEN_PALM.x + 3, z: FALLEN_PALM.z };
    const closed = moveCircle(start.x, start.z, target.x, target.z, PLAYER_R);
    expect(closed.x).toBeLessThan(FALLEN_PALM.x);
    const opened = moveCircle(start.x, start.z, target.x, target.z, PLAYER_R, beach);
    expect(opened.x).toBeCloseTo(target.x, 4);
    expect(opened.z).toBeCloseTo(target.z, 4);
    const resting = PALM_SOLIDS.resting;
    if (resting.kind !== "capsule") throw new Error("The palm trunk must remain a capsule");
    // The eastern end overhangs the support rock: only the moved trunk blocks it.
    const end = resting.ax > resting.bx ? { x: resting.ax, z: resting.az } : { x: resting.bx, z: resting.bz };
    expect(blocked(end.x, end.z, PLAYER_R)).toBe(false);
    expect(blocked(end.x, end.z, PLAYER_R, beach)).toBe(true);
  });
});

describe("pier surface and supports", () => {
  it("can walk from shore along the raised pier deck beyond the waterline", () => {
    const start = { x: PIER.x, z: PIER.z0 - 0.25 };
    const target = { x: PIER.x, z: PIER.z1 - 0.5 };
    expect(isWalkable(start.x, start.z, beach, PLAYER_R)).toBe(true);
    const p = moveCircle(start.x, start.z, target.x, target.z, PLAYER_R, beach);
    expect(p.x).toBeCloseTo(target.x, 4);
    expect(p.z).toBeCloseTo(target.z, 4);
    expect(isWalkable(p.x, p.z, beach, PLAYER_R)).toBe(true);
    expect(standY(p.x, p.z, beach.solved)).toBeCloseTo(groundY(PIER.x, PIER.z0) + PIER.deckY, 5);
  });

  it("blocks the support posts while keeping the middle of the deck open", () => {
    const post = { x: PIER.x + PIER.postOffset, z: PIER.z0 + PIER.postStart };
    expect(blocked(post.x, post.z, PLAYER_R, beach)).toBe(true);
    expect(isWalkable(post.x, post.z, beach, PLAYER_R)).toBe(false);
    const p = moveCircle(PIER.x, post.z, post.x + 0.2, post.z, PLAYER_R, beach);
    expect(p.x).toBeLessThan(post.x - PLAYER_R);
    expect(p.z).toBeCloseTo(post.z, 4);
    expect(blocked(p.x, p.z, PLAYER_R, beach)).toBe(false);
  });
});

describe("cooled lava surface", () => {
  const top = groundY(LAVA.x, LAVA.z) + LAVA_CRUST;
  it("walkers stand on the crust's flat top once the lava is cooled", () => {
    for (const x of [LAVA.x0 + 0.5, LAVA.x, LAVA.x1 - 0.5]) {
      for (const z of [LAVA.z0 + 0.2, LAVA.z, LAVA.z1 - 0.2]) {
        expect(standY(x, z, ["lava"])).toBeCloseTo(top, 5);
        expect(standY(x, z, [])).toBeCloseTo(groundY(x, z), 5);
      }
    }
  });

  it("joins the trail smoothly on both banks", () => {
    let prev = standY(LAVA.x, LAVA.z1 + 1.5, ["lava"]);
    expect(prev).toBeCloseTo(groundY(LAVA.x, LAVA.z1 + 1.5), 5);
    for (let z = LAVA.z1 + 1.5; z >= LAVA.z; z -= 0.05) {
      const y = standY(LAVA.x, z, ["lava"]);
      expect(Math.abs(y - prev)).toBeLessThan(0.03);
      prev = y;
    }
    expect(lavaCrustY(LAVA.x, LAVA.z0 - LAVA_RAMP - 0.01)).toBe(-Infinity);
  });

  it("does not block the opened route", () => {
    const solved = ["fallenPalm", "river", "bridge", "cliff", "lava"] as const;
    const gates: Gates = { solved: [...solved], forest: true, volcano: true };
    const p = moveCircle(LAVA.x, LAVA.z1 + 1.2, LAVA.x, LAVA.z0 - 1.5, PLAYER_R, gates);
    expect(p.z).toBeCloseTo(LAVA.z0 - 1.5, 4);
    const hot = moveCircle(LAVA.x, LAVA.z1 + 1.2, LAVA.x, LAVA.z0 - 1.5, PLAYER_R, { ...gates, solved: solved.slice(0, 4) });
    expect(hot.z).toBeGreaterThan(LAVA.z1);
  });
});
