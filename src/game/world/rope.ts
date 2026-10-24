import { ROPE } from "./island";

/**
 * The cliff rope's line in the plane x = ROPE.x, ordered from the knot on the
 * stake down to the loose end. The scene measures the cliff's real rocks and
 * stores the line here; the scripted climb keeps the player against it.
 */
export interface RopePoint {
  y: number;
  z: number;
}

export interface RopeTerrain {
  /** Front of the stake's knot (z) and the height it is tied at (y). */
  knot: RopePoint;
  /** Ground height at the rope's foot. */
  bottomY: number;
  /** Front-most solid z at height y (the cliff face), or -Infinity if open. */
  faceZ(y: number): number;
  /** Height of the top surface (ground or rock) at z on the cliff top. */
  surfaceY(z: number): number;
  /** Gap kept between the rope's centre line and any rock. */
  clearance: number;
}

/**
 * Hang the rope as gravity would: taut from the knot over the highest points
 * of the cliff top to the lip, then plumb down the face, pushed outward only
 * where a rock bulges (it never swings back in under an overhang).
 */
export function hangRope(t: RopeTerrain, step = 0.2): RopePoint[] {
  const { knot, clearance: c } = t;
  const topY = knot.y;
  // The cliff top and the rock tops at its edge, sampled outward from the knot
  // (the ground far below is left to the face profile).
  const top: RopePoint[] = [];
  for (let z = knot.z + 0.05; z < knot.z + 4; z += 0.05) {
    const y = t.surfaceY(z);
    if (y > topY - 2.5) top.push({ z, y: y + c });
  }
  // Upper hull from the knot: taut over the highest points (spanning any notch),
  // until the next stretch is steeper than ~68 degrees and the rope hangs plumb.
  const out: RopePoint[] = [knot];
  let cur = knot;
  for (;;) {
    let best: RopePoint | null = null;
    let bestSlope = -Infinity;
    for (const q of top) {
      if (q.z <= cur.z + 1e-6) continue;
      const slope = (q.y - cur.y) / (q.z - cur.z);
      if (slope >= bestSlope) {
        bestSlope = slope;
        best = q;
      }
    }
    if (!best || bestSlope < -2.5) break;
    out.push(best);
    cur = best;
  }
  // Plumb down the face from the lip, stepping out round any bulge.
  let z = Math.max(cur.z, t.faceZ(cur.y) + c);
  for (let y = cur.y - step; y > t.bottomY + 0.06; y -= step) {
    z = Math.max(z, t.faceZ(y) + c);
    out.push({ y, z });
  }
  // The loose end rests on the ground with a little slack.
  out.push({ y: t.bottomY + 0.05, z });
  out.push({ y: t.bottomY + 0.04, z: z + 0.3 });
  return out;
}

/** A climber's grip height above their feet, and how far their body hangs in front of the rope. */
export const CLIMB_HANDS = 1.2;
export const CLIMB_GAP = 0.3;
/** Height climbed per hand-over-hand pull (one full arm cycle is two pulls). */
export const CLIMB_PULL = 0.45;

let line: RopePoint[] = [];

export function setRopeLine(points: RopePoint[]) {
  line = points;
}

/** The rope's z at height y on its hanging part (what a climber holds). */
export function ropeZAt(y: number): number {
  if (line.length < 2) return ROPE.z - 0.25;
  // Walk up from the loose end while the rope rises (skip the slack on the ground).
  let i = line.length - 2;
  if (y <= line[i].y) return line[i].z;
  for (; i > 0; i--) {
    const lo = line[i], hi = line[i - 1];
    if (hi.y <= lo.y) return lo.z;
    if (y <= hi.y) return lo.z + ((y - lo.y) / (hi.y - lo.y)) * (hi.z - lo.z);
  }
  return line[0].z;
}
