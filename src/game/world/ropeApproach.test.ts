import { describe, expect, it } from "vitest";
import { CANOPY_DECKS, CANOPY_ROPES, CANOPY_ROPE_CUTS, ROPE_APPROACH_GRASS, ROPE_BANK, STAGES, forestBankY, lowlandWalkable } from "./lowland";
import { PLAYER_R, blocked, gatesOf, isWalkable, moveCircle } from "./collision";
import { newProgress } from "../logic/progress";

/** The forest floor in front of the Canopy's root wall and its entrance rope (2026-11-16). */
const gates = (() => {
  const p = newProgress();
  p.act2.started = true; p.act2.cleared = [...STAGES];
  return gatesOf(p);
})();
const lowGates = { solved: [], cleared: [...STAGES] };
const MOUNTED_R = 0.55;
const raised = (x: number, z: number) => CANOPY_DECKS.some((d) => x >= d.walk.x0 && x <= d.walk.x1 && z >= d.walk.z0 && z <= d.walk.z1);
const wall = (x: number, z: number) => CANOPY_ROPE_CUTS.some((c) => x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1);

describe("the grass before the Ancient Canopy's entrance rope", () => {
  it("ground that looks flat is walkable: away from the walkable edge, the bank has visibly risen", () => {
    const flat: string[] = [];
    for (let x = ROPE_BANK.x0 + 1; x <= ROPE_BANK.x1 - 1; x += 0.25) for (let z = ROPE_BANK.z0 + 0.5; z <= ROPE_BANK.z1 - 1; z += 0.25) {
      if (raised(x, z) || wall(x, z) || lowlandWalkable(x, z, lowGates, 0)) continue;
      // Within the edge band a walker's own body covers the ground; beyond it the slope must show.
      let nearEdge = false;
      for (let a = 0; a < 16 && !nearEdge; a++) nearEdge = lowlandWalkable(x + Math.cos(a * Math.PI / 8) * 0.9, z + Math.sin(a * Math.PI / 8) * 0.9, lowGates, 0);
      if (!nearEdge && forestBankY(x, z) < 0.25) flat.push(`${x},${z}`);
    }
    expect(flat.slice(0, 10), `${flat.length} flat but blocked points`).toEqual([]);
  });

  it("the grass along the root wall either side of the rope is open, on foot and riding", () => {
    for (const g of ROPE_APPROACH_GRASS) {
      const z = (g.z0 + g.z1) / 2;
      for (let x = g.x0 + 1; x <= g.x1 - 1; x += 0.5) {
        // Open unless a visible obstacle (a root or a boulder) stands there.
        expect(isWalkable(x, z, gates, PLAYER_R) || blocked(x, z, PLAYER_R, gates), `${x},${z}`).toBe(true);
      }
    }
    const foot = CANOPY_ROPES.entrance.foot;
    for (const r of [PLAYER_R, MOUNTED_R]) {
      // West along the wall to the mesa's foot, and back to the rope.
      const west = moveCircle(foot.x, foot.z, 92.5, -199.4, r, gates);
      expect(west.x, `west r=${r}`).toBeLessThan(93.2);
      const back = moveCircle(west.x, west.z, foot.x, foot.z, r, gates);
      expect(Math.hypot(back.x - foot.x, back.z - foot.z), `back r=${r}`).toBeLessThan(0.05);
      // East to the boulders.
      const east = moveCircle(foot.x, foot.z, 113.5, -198.8, r, gates);
      expect(east.x, `east r=${r}`).toBeGreaterThan(112.8);
    }
  });

  it("the root wall still holds: no walking from the forest floor up onto the raised deck", () => {
    const foot = CANOPY_ROPES.entrance.foot;
    for (const x of [94, 100, foot.x, 110]) {
      const end = moveCircle(x, -199.5, x, -203, PLAYER_R, gates);
      expect(end.z, `${x}`).toBeGreaterThan(-200.4);
    }
  });
});
