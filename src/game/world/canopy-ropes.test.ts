import { describe, expect, it } from "vitest";
import { isWalkable, moveCircle, PLAYER_R, standY } from "./collision";
import * as lowland from "./lowland";
import { CANOPY_ROPES, CANOPY_ROPE_CUTS, canopyRaise, lowlandDeckY, STAGES, zoneAt } from "./lowland";
import { groundY } from "./island";
import { CANOPY_VOIDS, HAZARDS } from "./hazards";
import { fallAhead } from "../logic/falls";

const solved = ["groveLilies", "canopyVines", "canopyRope"] as const;
const open = { act2: true, cleared: STAGES, solved };

describe("Canopy ropes and separated walking surfaces", () => {
  it("has walkable floor and deck stands at both body radii, in their proper zones", () => {
    for (const [id, rope] of Object.entries(CANOPY_ROPES)) {
      for (const radius of [PLAYER_R, .55]) {
        expect(isWalkable(rope.foot.x, rope.foot.z, open, radius), `${id} foot ${radius}`).toBe(true);
        expect(isWalkable(rope.top.x, rope.top.z, open, radius), `${id} top ${radius}`).toBe(true);
      }
      expect(zoneAt(rope.foot.x, rope.foot.z)).toBe(id === "entrance" ? "forest1" : "causeway");
      expect(zoneAt(rope.top.x, rope.top.z)).toBe("canopy");
      expect(lowlandDeckY(rope.foot.x, rope.foot.z, solved)).toBe(-Infinity);
      expect(standY(rope.top.x, rope.top.z, solved) - standY(rope.foot.x, rope.foot.z, solved)).toBeGreaterThan(9);
    }
    expect(canopyRaise(107.5, -195)).toBe(0);
    expect(lowland).not.toHaveProperty(["CANOPY", "FLIGHTS"].join("_"));
  });

  it("restores the entrance staircase footprint to ordinary forest floor", () => {
    for (let x = 104.6; x <= 110.4; x += .4) for (let z = -185.1; z >= -199.8; z -= .4) {
      expect(zoneAt(x, z)).toBe("forest1");
      expect(lowlandDeckY(x, z, solved)).toBe(-Infinity);
      expect(standY(x, z, solved)).toBeCloseTo(groundY(x, z), 8);
    }
  });

  it("blocks the entire face strips and long forced moves for players, mounts and enemies", () => {
    for (const radius of [PLAYER_R, .55, .4]) {
      for (const cut of CANOPY_ROPE_CUTS) for (let x = cut.x0; x <= cut.x1; x += .2)
        expect(isWalkable(x, (cut.z0 + cut.z1) / 2, open, radius)).toBe(false);
      for (const rope of Object.values(CANOPY_ROPES)) for (const [a, b] of [[rope.foot, rope.top], [rope.top, rope.foot]]) {
        const moved = moveCircle(a.x, a.z, b.x, b.z, radius, open);
        expect(Math.sign(moved.z - rope.faceZ)).toBe(Math.sign(a.z - rope.faceZ));
        expect(Math.abs(standY(moved.x, moved.z, solved) - standY(a.x, a.z, solved))).toBeLessThan(1);
      }
    }
  });

  it("has no sampled walkable floor-to-deck connection anywhere around the raised route", () => {
    // Every local edge across the complete deck boundary is sampled. Any walking
    // path from floor to deck would contain at least one such edge; thin strips
    // are wider than this grid after expansion by either walker radius.
    for (const radius of [PLAYER_R, .55]) {
      let samples = 0;
      for (let xi = 0; xi <= 130; xi++) for (let zi = 0; zi <= 238; zi++) {
        const x = 81 + xi * .3, z = -254 + zi * .3;
        if (!isWalkable(x, z, open, radius)) continue;
        const y = standY(x, z, solved);
        for (const [dx, dz] of [[.3, 0], [0, .3], [.3, .3], [-.3, .3]]) {
          if (!isWalkable(x + dx, z + dz, open, radius)) continue;
          expect(Math.abs(standY(x + dx, z + dz, solved) - y), `${radius}: ${x},${z} to ${x + dx},${z + dz}`).toBeLessThan(2);
          samples++;
        }
      }
      expect(samples).toBeGreaterThan(20000);
    }
  }, 20000);

  it("retains the flagged voids and their fall-ahead behavior", () => {
    expect(HAZARDS.filter(h => h.playerFall)).toEqual(CANOPY_VOIDS);
    expect(CANOPY_VOIDS.map(h => [h.id, h.shape])).toEqual([
      ["canopyVines", { kind: "rect", x0: 83, x1: 119, z0: -219.5, z1: -216 }],
      ["canopyRope", { kind: "rect", x0: 83, x1: 119, z0: -229, z1: -225.5 }],
      ["brokenSpanWest", { kind: "rect", x0: 83, x1: 98, z0: -223.8, z1: -221.2 }],
      ["brokenSpanEast", { kind: "rect", x0: 111, x1: 119, z0: -223.8, z1: -221.2 }],
      ["treeRing", { kind: "rect", x0: 88, x1: 92, z0: -234, z1: -230 }],
      ["upperRoot", { kind: "rect", x0: 110, x1: 117, z0: -234, z1: -232.5 }],
    ]);
    for (const radius of [PLAYER_R, .55]) {
      expect(fallAhead(100, -216 + radius, 0, -1, radius, [])?.id).toBe("canopyVines");
      expect(fallAhead(106, -216 + radius, 0, -1, radius, solved)).toBeNull();
      for (const rope of Object.values(CANOPY_ROPES)) {
        expect(fallAhead(rope.top.x, rope.top.z, 0, Math.sign(rope.foot.z - rope.top.z), radius, solved)).toBeNull();
      }
    }
  });

  it("keeps the stage gate on the landing and Causeway enemy pockets open", () => {
    const closed = { ...open, cleared: STAGES.filter(id => id !== "canopy") };
    for (const radius of [PLAYER_R, .55]) {
      expect(moveCircle(96, -236.5, 96, -240, radius, closed).z).toBeGreaterThanOrEqual(-237.6 + radius);
      expect(moveCircle(96, -236.5, 96, -240, radius, open).z).toBeCloseTo(-240, 6);
      for (const [x, z] of [[85, -247.4], [103, -247.5], [103.4, -251.8], [107.4, -249.2]])
        expect(isWalkable(x, z, open, radius), `${x},${z}`).toBe(true);
    }
  });
});
