import { expect, it } from "vitest";
import { isWalkable, moveCircle, PLAYER_R } from "./collision";
import { CLIFF_ROPE, STAGES, STAGE_EXITS, zoneAt } from "./lowland";
import { SECRET_IDS } from "./elementObjects";

/** Baseline measured on d820c80 with this exact 0.5 m collision sampling.
 * Measures traversable floor, excluding solid props, ponds and unresolved
 * puzzle gaps (all permanent puzzle bridges and stage exits are open). */
export const BASELINE_AREA = { forest1: 286, grove: 464.75, canopy: 236.75, causeway: 600.75, coast: 250 };
export function measureAreas() {
  const areas: Record<string, number> = {};
  const necks = STAGE_EXITS.filter(gate => gate.id === "forest1").map(gate => gate.x).sort((a, b) => a - b);
  const gates = { solved: ["groveLilies", "canopyVines", "canopyRope"] as const, secrets: SECRET_IDS, act2: true, cleared: STAGES };
  const start = [Math.round(CLIFF_ROPE.foot.x * 2), Math.round(CLIFF_ROPE.foot.z * 2)];
  const reachable = new Set<string>([start.join(",")]), queue = [start];
  while (queue.length) {
    const [i, j] = queue.pop()!;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj, key = `${ni},${nj}`, x = ni / 2, z = nj / 2;
      if (reachable.has(key) || x < 20 || x >= 134 || z < -338 || z >= -153.6 || !isWalkable(x, z, gates, PLAYER_R)) continue;
      const p = moveCircle(i / 2, j / 2, x, z, PLAYER_R, gates);
      if (Math.hypot(p.x - x, p.z - z) > .05) continue;
      reachable.add(key); queue.push([ni, nj]);
    }
  }
  for (let x = 20; x < 134; x += 0.5)
    for (let z = -338; z < -153.6; z += 0.5) {
      const zone = zoneAt(x, z);
      if (zone && reachable.has(`${x * 2},${z * 2}`) && isWalkable(x, z, gates, PLAYER_R)) {
        areas[zone] = (areas[zone] ?? 0) + 0.25;
        if (zone === "forest1") {
          const part = x < necks[0] ? "forestLeftArm" : x > necks[1] ? "forestRightArm" : "forestBase";
          areas[part] = (areas[part] ?? 0) + 0.25;
        }
      }
    }
  return areas;
}
it("preserves the base and downstream floor budgets, accounting for the removed branch approaches and new arms", () => {
  const a = measureAreas();
  // Slice 2 widens the western bank; measured with scripts/measure-areas.mjs.
  // Only reachable floor with every puzzle open counts.
  expect(a.grove).toBe(1428);
  // Slice 3: broad entrance/exit flights replace the old narrow ramps.
  expect(a.canopy).toBe(976);
  expect(a.grove).toBeGreaterThanOrEqual(757 * 1.7);
  expect(a.canopy).toBeGreaterThanOrEqual(407.75 * 1.7);
  for (const zone of ["forest1", "causeway", "coast"] as const) {
    const area = zone === "forest1" ? a.forestBase : a[zone];
    expect(area / BASELINE_AREA[zone], zone).toBeGreaterThanOrEqual(1.8);
    // Open secret pockets add floor in the forest base; the frozen baseline
    // was measured before those pockets were opened for this flood fill. The
    // camp's open north side (docs/SEVEN_IMPROVEMENTS.md section 2) adds more.
    expect(area / BASELINE_AREA[zone], zone).toBeLessThanOrEqual(zone === "forest1" ? 2.5 : 2.2);
  }
  expect(a.forestLeftArm).toBeGreaterThan(200);
  expect(a.forestRightArm).toBeGreaterThan(200);
  expect(a.forest1).toBe(a.forestBase + a.forestLeftArm + a.forestRightArm);
});
