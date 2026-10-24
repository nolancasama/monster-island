import { afterEach, expect, it } from "vitest";
import { hangRope, ropeZAt, setRopeLine, type RopeTerrain } from "./rope";

/** A 6 m cliff whose face is at z = 0, with a rock bulging 0.8 m out between 2 and 3 m up. */
const cliff: RopeTerrain = {
  knot: { z: -1, y: 6.3 },
  bottomY: 0,
  faceZ: (y) => (y >= 2 && y <= 3 ? 0.8 : y <= 6 ? 0 : -Infinity),
  surfaceY: (z) => (z < 0 ? 6 : 0),
  clearance: 0.13
};

afterEach(() => setRopeLine([]));

it("hangs clear of the rock everywhere and never swings back in under a bulge", () => {
  const line = hangRope(cliff);
  expect(line[0]).toEqual(cliff.knot);
  const lip = line.findIndex((p) => p.z >= 0);
  for (const p of line.slice(lip)) {
    if (p.y > 0.06 && p.y < 6) expect(p.z).toBeGreaterThanOrEqual(cliff.faceZ(p.y) + cliff.clearance - 1e-9);
  }
  for (let i = lip + 1; i < line.length; i++) expect(line[i].z).toBeGreaterThanOrEqual(line[i - 1].z);
  // Over the top it stays above the surface; the loose end rests on the ground.
  for (const p of line.slice(0, lip)) expect(p.y).toBeGreaterThanOrEqual(6);
  expect(line.at(-1)!.y).toBeLessThan(0.1);
});

it("tells the climb where the rope is at each height", () => {
  setRopeLine(hangRope(cliff));
  expect(ropeZAt(4.5)).toBeCloseTo(0.13, 5);
  expect(ropeZAt(2.5)).toBeGreaterThanOrEqual(0.93 - 1e-9);
  // Below the bulge it hangs plumb from it.
  expect(ropeZAt(1)).toBeCloseTo(0.93, 5);
});
