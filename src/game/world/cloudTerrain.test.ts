import { describe, expect, it } from "vitest";
import { BEACON, CLOUD_BOUNDS, CLOUD_ZONES, cloudY } from "./cloudisle";
import { nearestOnTrail } from "./lowland";
import { cloudGroundY, cloudLandMask } from "./cloudTerrain";

const shapes = Object.values(CLOUD_ZONES).flatMap(zone => zone.walk);
function distance(x: number, z: number): number {
  return Math.min(...shapes.map(s => s.kind === "disc" ? Math.hypot(x - s.x, z - s.z) - s.r
    : s.kind === "trail" ? nearestOnTrail(s.pts, x, z).d - s.w
    : Math.hypot(Math.max(s.x0 - x, 0, x - s.x1), Math.max(s.z0 - z, 0, z - s.z1))));
}
describe("Cloud Isle terrain", () => {
  it("preserves all walk surfaces and surrounds them with land", () => {
    for (let z = CLOUD_BOUNDS.z0 - 12; z <= CLOUD_BOUNDS.z1 + 12; z += .5) {
      for (let x = CLOUD_BOUNDS.x0 - 12; x <= CLOUD_BOUNDS.x1 + 12; x += .5) {
        const d = distance(x, z);
        if (d <= 0) expect(Math.abs(cloudGroundY(x, z) - cloudY(x, z))).toBeLessThan(.05);
        // The shore may come as close as the 6 m blend band: the coast route hugs the sea.
        if (d <= 6) expect(cloudLandMask(x, z)).toBe(1);
      }
    }
  });
  it("puts the highest region north of the beacon", () => {
    let highest = -Infinity, peakX = 0, peakZ = 0;
    for (let z = -40; z <= 420; z += 2) for (let x = -110; x <= 110; x += 2) {
      const y = cloudGroundY(x, z);
      if (y > highest) { highest = y; peakX = x; peakZ = z; }
    }
    expect(highest).toBeGreaterThanOrEqual(35);
    expect(peakZ).toBeGreaterThan(BEACON.z);
    expect(Math.abs(peakX - BEACON.x)).toBeLessThan(50);
  });
  it("descends below the distant sea", () => {
    expect(cloudGroundY(250, 180)).toBeLessThan(-2);
    expect(cloudGroundY(0, -200)).toBeLessThan(-2);
  });
});
