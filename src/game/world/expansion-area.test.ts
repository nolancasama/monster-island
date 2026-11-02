import { expect, it } from "vitest";
import { isWalkable, PLAYER_R } from "./collision";
import { STAGES, STAGE_EXITS, zoneAt } from "./lowland";

/** Baseline measured on d820c80 with this exact 0.5 m collision sampling.
 * Measures traversable floor, excluding solid props, ponds and unresolved
 * puzzle gaps (all permanent puzzle bridges and stage exits are open). */
export const BASELINE_AREA = { forest1: 286, grove: 464.75, canopy: 236.75, causeway: 600.75, coast: 250 };
export function measureAreas() {
  const areas: Record<string, number> = {};
  const necks = STAGE_EXITS.filter(gate => gate.id === "forest1").map(gate => gate.x).sort((a, b) => a - b);
  for (let x = 20; x < 134; x += 0.5)
    for (let z = -338; z < -153.6; z += 0.5) {
      const zone = zoneAt(x, z);
      if (zone && isWalkable(x, z, { solved: ["groveLilies", "canopyVines", "canopyRope"], act2: true, cleared: STAGES }, PLAYER_R)) {
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
  // M2 removes the two central approach segments from each branch. Their
  // retained floor is measured with the same sampler (measure-areas.mjs), so
  // the old whole-branch 2x budget no longer describes these trimmed stages.
  expect(a.grove).toBe(757);
  expect(a.canopy).toBe(407.75);
  for (const zone of ["forest1", "causeway", "coast"] as const) {
    const area = zone === "forest1" ? a.forestBase : a[zone];
    expect(area / BASELINE_AREA[zone], zone).toBeGreaterThanOrEqual(1.8);
    expect(area / BASELINE_AREA[zone], zone).toBeLessThanOrEqual(2.2);
  }
  expect(a.forestLeftArm).toBeGreaterThan(200);
  expect(a.forestRightArm).toBeGreaterThan(200);
  expect(a.forest1).toBe(a.forestBase + a.forestLeftArm + a.forestRightArm);
});
