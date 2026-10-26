import { afterEach, expect, it } from "vitest";
import * as THREE from "three";
import { CLIMB_BODY, ROPE_TOP, climbBodyZ, climbPath, hangRope, ropeLip, ropeTopSurfaceY, ropeZAt, setRopeLine, type RopeTerrain } from "./rope";
import { CLIFF_Z, ROPE, ROPE_STAKE } from "./island";

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

// ---- The rope as drawn (Catmull-Rom through the hung points) and the climb on it.


/** A cliff at the real rope: face at CLIFF_Z, 6.5 m high, a rounded lip rock and a bulge low down. */
const H = 6.5;
const real: RopeTerrain = {
  knot: { z: ROPE_STAKE.z + 0.13, y: H + 0.3 },
  bottomY: 0,
  faceZ: (y) => (y > H + 0.5 ? -Infinity : y > H - 0.6 ? CLIFF_Z + 0.35 * Math.sqrt(Math.max(0, 1 - ((y - (H - 0.6)) / 1.1) ** 2)) + 0.1 : y > 1 && y < 2.2 ? CLIFF_Z + 0.9 : CLIFF_Z),
  surfaceY: (z) => (z < CLIFF_Z + 0.3 ? H + (z > CLIFF_Z - 0.4 ? 0.35 : 0) : 0),
  clearance: 0.13
};
const ground = (_x: number, z: number) => (z < CLIFF_Z ? H : 0);

function drawnCurve(line: ReturnType<typeof hangRope>) {
  const curve = new THREE.CatmullRomCurve3(line.map((p) => new THREE.Vector3(0, p.y, p.z)), false, "centripetal");
  return curve.getSpacedPoints(400).map((p) => ({ y: p.y, z: p.z }));
}

it("follows the drawn, curved rope over the lip rather than straight segments", () => {
  const line = hangRope(real);
  const drawn = drawnCurve(line);
  setRopeLine(line, drawn);
  // Every drawn point of the hanging part is where ropeZAt says the rope is.
  const lip = ropeLip();
  for (const p of drawn) {
    if (p.y < lip.y - 0.02 && p.y > 0.2 && p.z >= lip.z - 1e-6) expect(Math.abs(ropeZAt(p.y) - p.z)).toBeLessThan(0.03);
  }
  // The lip is the top of the hanging part: up near the cliff top, out at the face.
  expect(lip.y).toBeGreaterThan(H);
  expect(lip.z).toBeGreaterThan(CLIFF_Z);
});

it("keeps the climber's whole body clear of the rock at every height, including the curved top", () => {
  const line = hangRope(real);
  setRopeLine(line, drawnCurve(line));
  for (let feet = 0; feet < ropeLip().y - 0.9; feet += 0.05) {
    const z = climbBodyZ(feet);
    for (let dy = 0; dy <= CLIMB_BODY.height; dy += 0.05) {
      const face = real.faceZ(feet + dy);
      if (Number.isFinite(face)) expect(z - face, `feet ${feet.toFixed(2)} +${dy.toFixed(2)}`).toBeGreaterThanOrEqual(CLIMB_BODY.clear - 0.02);
    }
  }
});

it("climbs over the lip without jumps, with the feet never inside the rock, and ends standing on the top", () => {
  const line = hangRope(real);
  setRopeLine(line, drawnCurve(line));
  let prev = climbPath(0, ground);
  expect(prev.y).toBeCloseTo(0, 5);
  for (let k = 0.002; k <= 1 + 1e-9; k += 0.002) {
    const q = climbPath(k, ground);
    expect(Math.hypot(q.x - prev.x, q.y - prev.y, q.z - prev.z), `k=${k.toFixed(3)}`).toBeLessThan(0.08);
    // On the top: at or above the rock the rope passes over.
    if (q.z < CLIFF_Z + 0.3) expect(q.y).toBeGreaterThanOrEqual(Math.min(ropeTopSurfaceY(q.z), H) - 0.14);
    // On the face: in front of the rock at the feet.
    else if (q.y < H - 0.1) expect(q.z).toBeGreaterThan(real.faceZ(q.y));
    prev = q;
  }
  const end = climbPath(1, ground);
  expect(end.x).toBeCloseTo(ROPE_TOP.x, 5);
  expect(end.z).toBeCloseTo(ROPE_TOP.z, 5);
  expect(end.y).toBeCloseTo(H, 5);
  expect(Math.hypot(end.x - ROPE_STAKE.x, end.z - ROPE_STAKE.z)).toBeGreaterThan(ROPE_STAKE.r + 0.35);
  expect(climbPath(0, ground).x).toBe(ROPE.x);
});
