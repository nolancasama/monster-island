import { expect, it } from "vitest";
import { isWalkable, PLAYER_R } from "./collision";
import { STAGES, zoneAt } from "./lowland";

/** Baseline measured on d820c80 with this exact 0.5 m collision sampling.
 * Measures traversable floor, excluding solid props, ponds and unresolved
 * puzzle gaps (all permanent puzzle bridges and stage exits are open). */
export const BASELINE_AREA = { forest1: 286, grove: 464.75, canopy: 236.75, causeway: 600.75, coast: 250 };
export function measureAreas() {
  const areas: Record<string, number> = {};
  for (let x = 20; x < 134; x += 0.5)
    for (let z = -338; z < -153.6; z += 0.5) {
      const zone = zoneAt(x, z);
      if (zone && isWalkable(x, z, { solved: ["groveLilies", "canopyVines", "canopyRope", "causewayGate"], act2: true, cleared: STAGES }, PLAYER_R))
        areas[zone] = (areas[zone] ?? 0) + 0.25;
    }
  return areas;
}
it("each hostile section has approximately twice the original playable floor", () => {
  const a = measureAreas();
  for (const zone of STAGES) {
    expect(a[zone] / BASELINE_AREA[zone], zone).toBeGreaterThanOrEqual(1.8);
    expect(a[zone] / BASELINE_AREA[zone], zone).toBeLessThanOrEqual(2.2);
  }
});
