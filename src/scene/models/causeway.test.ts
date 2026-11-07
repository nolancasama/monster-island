import { describe, expect, it } from "vitest";
import { CAUSEWAY, SHRINE, SHRINE_STATUES, STAGES, lowlandWalkable, zoneAt } from "../../game/world/lowland";
import { canopyDeckGeometry, lowlandPropsGeometry, lowlandSceneryY, lowlandSpots } from "./lowland";

const open = { cleared: STAGES, solved: ["groveLilies", "canopyVines", "canopyRope"] as const };
const fight = (x: number, z: number) =>
  (x >= CAUSEWAY.x0 && x <= CAUSEWAY.x1 && z >= CAUSEWAY.z0 && z <= CAUSEWAY.z1)
  || Math.hypot(x - SHRINE.x, z - SHRINE.z) <= SHRINE.r
  || (x >= 92 && x <= 100 && z >= -244 && z <= -241);

describe("open Causeway scenery", () => {
  it("has no tall props on the Causeway, shrine platform or rope foot", () => {
    const geometry = lowlandPropsGeometry(), p = geometry.getAttribute("position");
    const tall: Array<[number, number, number]> = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const aboveGround = y - lowlandSceneryY(x, z);
      // Existing Canopy branches overhang the rope pocket from the raised deck;
      // their bases stand upstairs, rather than obstructing the ground fight.
      const canopyBranch = x >= 91.8 && x <= 100.2 && z >= -242.3 && z <= -241 && aboveGround > 8;
      // Boulders deliberately fill the unreachable north-east corner (solid, off the floor).
      const cornerBoulders = x >= 108.8 && z >= -246 && z <= -241.8;
      if (fight(x, z) && aboveGround > .6 && !canopyBranch && !cornerBoulders) tall.push([x, y, z]);
    }
    expect(tall).toEqual([]);
    // Both former arches and statue sites are inside this checked footprint.
    for (const [x, z] of [[58, -243], [102, -251.5], [109.1, -253.7], [109.1, -249.3]])
      expect(fight(x, z)).toBe(true);
    geometry.dispose();
  });

  it("retains two statues with their entire 0.55 m footprint 0.6 m beyond walkable ground", () => {
    const geometry = lowlandPropsGeometry(), p = geometry.getAttribute("position");
    expect(SHRINE_STATUES).toHaveLength(2);
    for (const { x, z } of SHRINE_STATUES) {
      expect(x).toBeGreaterThan(CAUSEWAY.x1);
      let headVertices = 0;
      for (let i = 0; i < p.count; i++)
        if (Math.hypot(p.getX(i) - x, p.getZ(i) - z) < .6 && p.getY(i) > lowlandSceneryY(x, z) + 1.4) headVertices++;
      expect(headVertices).toBeGreaterThan(0);
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 32) {
        const xx = x + Math.cos(angle) * 1.15, zz = z + Math.sin(angle) * 1.15;
        expect(zoneAt(xx, zz)).toBeNull();
      }
    }
    geometry.dispose();
  });

  it("keeps scattered tall vegetation bases off the audited walking ground", () => {
    for (const group of Object.values(lowlandSpots())) for (const spot of group) {
      if (fight(spot.x, spot.z)) expect(lowlandWalkable(spot.x, spot.z, open, 0)).toBe(false);
    }
  });

  it("splits only the deck north faces for fading and preserves all authored triangles", () => {
    const all = canopyDeckGeometry(), solid = canopyDeckGeometry("solid"), fading = canopyDeckGeometry("occluder");
    const triangles = (g: typeof all) => {
      const p = g.getAttribute("position"), result: string[] = [];
      for (let i = 0; i < p.count; i += 3)
        result.push(Array.from({ length: 3 }, (_, j) => `${p.getX(i + j)},${p.getY(i + j)},${p.getZ(i + j)}`).join(";"));
      return result;
    };
    expect([...triangles(solid), ...triangles(fading)].sort()).toEqual(triangles(all).sort());
    const p = fading.getAttribute("position");
    expect(p.count).toBeGreaterThan(0);
    for (let i = 0; i < p.count; i += 3) {
      expect(p.getZ(i)).toBe(p.getZ(i + 1));
      expect(p.getZ(i)).toBe(p.getZ(i + 2));
    }
    all.dispose(); solid.dispose(); fading.dispose();
  });
});
