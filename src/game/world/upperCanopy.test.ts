import { afterEach, describe, expect, it } from "vitest";
import { LEAF_STATE, LEAF_TIMING, UPPER_BRANCHES, UPPER_CHECKPOINTS, UPPER_LEAVES, UPPER_ROPE, UPPER_TRUNKS, refreshUpperHazards, resetUpperLeaves, stepLeaf, upperSurfaceAt } from "./upperCanopy";
import { isWalkable, standY } from "./collision";
import { zoneAt } from "./lowland";
import { region } from "./region";
import { hazardAt } from "../logic/elements";
import { fallAhead } from "../logic/falls";
import { leafGeometry } from "../../scene/models/upperCanopy";

const gates = { solved: [] as const, act2: true };
afterEach(() => { region.layer = "ground"; resetUpperLeaves(); refreshUpperHazards(); });

function flood(r: number) {
  const step = .25, key = (i: number, j: number) => `${i},${j}`;
  const start: [number, number] = [Math.round(UPPER_ROPE.top.x / step), Math.round(UPPER_ROPE.top.z / step)];
  const dist = new Map([[key(...start), 0]]);
  const queue: Array<[number, number]> = [start];
  while (queue.length) {
    const [i, j] = queue.shift()!, d = dist.get(key(i, j))!;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj, k = key(ni, nj);
      if (dist.has(k) || !isWalkable(ni * step, nj * step, gates, r, false, "high")) continue;
      dist.set(k, d + step);
      queue.push([ni, nj]);
    }
  }
  return { dist, step };
}

describe("the Upper Canopy", () => {
  it("is reached by rope from the lower Canopy and stands 8+ m above it", () => {
    expect(UPPER_ROPE).toMatchObject({ footLayer: "ground", topLayer: "high" });
    expect(zoneAt(UPPER_ROPE.foot.x, UPPER_ROPE.foot.z)).toBe("canopy");
    expect(isWalkable(UPPER_ROPE.foot.x, UPPER_ROPE.foot.z, gates, .55, false, "ground")).toBe(true);
    expect(isWalkable(UPPER_ROPE.top.x, UPPER_ROPE.top.z, gates, .55, false, "high")).toBe(true);
    expect(standY(UPPER_ROPE.top.x, UPPER_ROPE.top.z, [], "high") - standY(UPPER_ROPE.foot.x, UPPER_ROPE.foot.z, [], "ground")).toBeGreaterThan(8);
    expect(zoneAt(UPPER_ROPE.top.x, UPPER_ROPE.top.z, "high")).toBe("upperCanopy");
  });

  it("is one connected route from the rope top to the summit bridge, at both body radii", () => {
    for (const r of [.35, .55]) {
      const { dist, step } = flood(r);
      const end = UPPER_BRANCHES.find(b => b.id === "summitBridge")!.pts[1];
      let best = Infinity;
      for (const [k, d] of dist) {
        const [i, j] = k.split(",").map(Number);
        if (Math.hypot(i * step - end[0], j * step - end[1]) < .8) best = Math.min(best, d);
      }
      expect(best, `radius ${r}`).toBeLessThan(Infinity);
      expect(best).toBeGreaterThan(50);
      for (const c of UPPER_CHECKPOINTS) expect(isWalkable(c.x, c.z, gates, r, false, "high"), c.id).toBe(true);
    }
  });

  it("joins leaves and branches with ramps no steeper than 25 degrees", () => {
    for (const b of UPPER_BRANCHES) {
      let len = 0;
      for (let i = 1; i < b.pts.length; i++) len += Math.hypot(b.pts[i][0] - b.pts[i - 1][0], b.pts[i][1] - b.pts[i - 1][1]);
      expect(Math.atan2(Math.abs(b.y1 - b.y0), len) * 180 / Math.PI, b.id).toBeLessThanOrEqual(25);
      expect(b.w * 2).toBeGreaterThanOrEqual(1.8);
    }
  });

  it("makes every open edge a fall and every leaf safe ground; trunks are walls", () => {
    region.layer = "high";
    for (const l of UPPER_LEAVES) {
      expect(hazardAt(l.x, l.z, "home", [])).toBeNull();
      expect(hazardAt(l.x + l.r + .3, l.z, "home", [])?.playerFall ?? false).toBe(upperSurfaceAt(l.x + l.r + .3, l.z) === null);
    }
    const leaf = UPPER_LEAVES.find(l => l.id === "broadleaf")!;
    expect(fallAhead(leaf.x + leaf.r - .4, leaf.z, 1, 0, .35, [])).not.toBeNull();
    expect(fallAhead(leaf.x, leaf.z, 1, 0, .35, [])).toBeNull();
    for (const t of UPPER_TRUNKS) expect(isWalkable(t.x, t.z, gates, 0, false, "high")).toBe(false);
    // The ground's lower-Canopy voids are not hazards up here.
    expect(hazardAt(106, -217.5, "home", [])?.id).not.toBe("canopyVines");
  });

  it("gives way under a standing player after a warning, and grows back", () => {
    const id = UPPER_LEAVES.find(l => l.unstable)!.id, s = LEAF_STATE[id];
    expect(UPPER_LEAVES.filter(l => l.unstable).length).toBeLessThanOrEqual(3);
    stepLeaf(s, true, LEAF_TIMING.stand - .05);
    expect(s.phase).toBe("solid");
    stepLeaf(s, false, .1); // stepping off resets the clock
    stepLeaf(s, true, LEAF_TIMING.stand - .05);
    expect(s.phase).toBe("solid");
    stepLeaf(s, true, .1);
    expect(s.phase).toBe("warn");
    stepLeaf(s, false, LEAF_TIMING.warn + .01);
    expect(s.phase).toBe("gone");
    refreshUpperHazards();
    const l = UPPER_LEAVES.find(x => x.id === id)!;
    expect(isWalkable(l.x, l.z, gates, .35, false, "high")).toBe(false);
    region.layer = "high";
    expect(hazardAt(l.x, l.z, "home", [])?.playerFall).toBe(true);
    stepLeaf(s, false, LEAF_TIMING.regrow + .01);
    expect(s.phase).toBe("solid");
    refreshUpperHazards();
    expect(isWalkable(l.x, l.z, gates, .35, false, "high")).toBe(true);
  });

  it("draws each leaf no wider than its walking disc", () => {
    for (const l of UPPER_LEAVES) {
      const p = leafGeometry(l).getAttribute("position");
      let far = 0;
      for (let i = 0; i < p.count; i++) far = Math.max(far, Math.hypot(p.getX(i) - l.x, p.getZ(i) - l.z));
      // The midrib may cross the rim by its own width; the leaf itself stays within it.
      expect(far, l.id).toBeLessThanOrEqual(l.r + .12);
    }
  });
});
