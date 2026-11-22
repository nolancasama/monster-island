import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { ROPE_APPROACH_GRASS, STAGES, lowlandSolids, lowlandWalkable } from "../../game/world/lowland";
import { lowlandSpots } from "./lowland";

const open = { cleared: STAGES, solved: ["groveLilies", "canopyVines", "canopyRope"] as const };
const baseline = {
  trees: { count: 50, removed: 4, pad: 2.6, hash: "749b86c14369f6f5af486d8949ac8044f36064e951704715a72da0d5e4d0ca91" },
  fernTrees: { count: 41, removed: 2, pad: 2.6, hash: "847c58f78adb07621d9171a74da4548485258c83d023a2ad3a735634316b2656" },
  ferns: { count: 82, removed: 7, pad: 0.7, hash: "2cdd5fd5874078fce23164d87c816f1ec927cd3ad9a013749cbaa865af3c6d35" },
  reeds: { count: 104, removed: 0, pad: 0.7, hash: "636fdb36b4caa3e24c1575691b6efd1cfa190ad0ffce5dc9c93b2ff2f8531d6d" },
};

it("preserves the ordered 39b0cbc vegetation layout after removing spots near the rope grass", () => {
  const spots = lowlandSpots();
  for (const group of Object.keys(baseline) as (keyof typeof baseline)[]) {
    const { count, removed, pad, hash } = baseline[group];
    expect(spots[group], group).toHaveLength(count - removed);
    // The historical spots include trigonometric samples. Round to avoid platform-level float noise.
    const placement = spots[group].map(({ x, z, s, r, tint, sy }) =>
      [x, z, s, r, tint, sy].map(value => value?.toFixed(6)));
    expect(createHash("sha256").update(JSON.stringify(placement)).digest("hex"), group).toBe(hash);

    for (const { x, z } of spots[group]) {
      for (const [px, pz] of [[x, z], [x + pad, z], [x - pad, z], [x, z + pad], [x, z - pad]]) {
        const onRopeGrass = ROPE_APPROACH_GRASS.some(sh => px >= sh.x0 && px <= sh.x1 && pz >= sh.z0 && pz <= sh.z1);
        if (onRopeGrass) expect(lowlandWalkable(px, pz, open, 0), `${group} at ${x},${z}`).toBe(false);
      }
    }
  }
});

it("keeps vegetation bases off walking ground except for the historical wetland reeds", () => {
  const { trees, fernTrees, ferns, reeds } = lowlandSpots();
  const solids = lowlandSolids();
  const onWalk = ({ x, z }: { x: number; z: number }) => lowlandWalkable(x, z, open, 0);
  for (const { x, z } of trees.filter(onWalk)) {
    expect(solids.some(solid => solid.kind === "circle" && Math.hypot(solid.x - x, solid.z - z) < solid.r)).toBe(true);
  }
  expect([...fernTrees, ...ferns].filter(onWalk)).toEqual([]);
  // Decorative reeds already on the walkable wetland in 39b0cbc are part of the pinned layout.
  expect(reeds.filter(onWalk)).toHaveLength(90);
});
