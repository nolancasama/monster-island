import { ROPE, ROPE_STAKE, groundY } from "./island";

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
/** The climber's body, feet to the top of the head, and the room its front (knees, chest, cap) needs from the rock. */
export const CLIMB_BODY = { height: 1.55, clear: 0.27 };

/**
 * The rope as drawn: the scene samples its smooth (Catmull-Rom) curve through
 * the hung points, knot first. Without it, the hung points themselves.
 */
let drawn: RopePoint[] = [];
let lipIndex = 0;

export function setRopeLine(points: RopePoint[], curve: RopePoint[] = points) {
  drawn = curve;
  // The lip: where the rope leaves the cliff top, i.e. the end of the run from
  // the knot that is flatter than 45 degrees; from there it hangs down the face.
  lipIndex = 0;
  for (let i = 1; i < drawn.length; i++) {
    const down = drawn[i - 1].y - drawn[i].y;
    if (down > Math.abs(drawn[i].z - drawn[i - 1].z) && down > 1e-4) break;
    lipIndex = i;
  }
}

/** Where the rope goes over the cliff edge (top of the hanging part). */
export function ropeLip(): RopePoint {
  return drawn[lipIndex] ?? { y: 0, z: ROPE.z - 0.25 };
}

/** The rope's z at height y on its hanging part (what a climber holds), as drawn. */
export function ropeZAt(y: number): number {
  if (drawn.length < 2) return ROPE.z - 0.25;
  // Walk down the drawn curve from the lip; skip the slack lying on the ground.
  if (y >= drawn[lipIndex].y) return drawn[lipIndex].z;
  for (let i = lipIndex; i < drawn.length - 1; i++) {
    const hi = drawn[i], lo = drawn[i + 1];
    if (lo.y >= hi.y) return hi.z;
    if (y >= lo.y) return lo.z + ((y - lo.y) / (hi.y - lo.y)) * (hi.z - lo.z);
  }
  return drawn[drawn.length - 1].z;
}

/**
 * Where a climber's body hangs (z) with their feet at `feetY`: in front of the
 * rope wherever any part of the body is, so a bulge lower down never pushes
 * through the knees or a ledge higher up through the cap. The rope hugs the
 * rock at a fixed clearance and never swings back in under a bulge, so this
 * keeps the whole body clear of the cliff.
 */
export function climbBodyZ(feetY: number): number {
  let z = -Infinity;
  for (let dy = 0; dy <= CLIMB_BODY.height + 1e-9; dy += 0.1) z = Math.max(z, ropeZAt(feetY + dy));
  return Math.max(z + CLIMB_BODY.clear, ropeZAt(feetY + CLIMB_HANDS) + CLIMB_GAP);
}

/** Height of the rock/ground surface under the taut top part of the rope at z (between the knot and the lip). */
export function ropeTopSurfaceY(z: number, clearance = 0.13): number {
  let y = -Infinity;
  for (let i = 0; i < lipIndex; i++) {
    const a = drawn[i], b = drawn[i + 1];
    const lo = Math.min(a.z, b.z), hi = Math.max(a.z, b.z);
    if (z >= lo - 1e-6 && z <= hi + 1e-6) {
      const t = hi > lo ? (z - a.z) / (b.z - a.z) : 0;
      y = Math.max(y, a.y + (b.y - a.y) * t - clearance);
    }
  }
  return y;
}

/** Where the climb begins at the foot of the rope, and where it ends on top (beside the stake). */
export const ROPE_FOOT = { x: ROPE.x, z: ROPE.z + 1.4 };
export const ROPE_TOP = { x: ROPE.x + 0.55, z: ROPE_STAKE.z + 0.2 };

/**
 * The climb's path, k = 0 at the foot of the rope to 1 standing on the top.
 * Up the face (most of it) the player keeps their whole body in front of the
 * rope as drawn (climbBodyZ); over the lip they rise until their feet clear
 * the edge, then step in over the rock onto the top. Down is the same path
 * backwards. Returns the feet position and the mantle phase (0 on the face).
 */
export function climbPath(k: number, ground: (x: number, z: number) => number = groundY): { x: number; y: number; z: number; mantle: number } {
  const bottomY = ground(ROPE.x, ROPE.z);
  const lip = ropeLip();
  const hangTop = lip.y - 0.95;
  const FACE = 0.76;
  if (k <= FACE) {
    const y = bottomY + (hangTop - bottomY) * (k / FACE);
    return { x: ROPE.x, y, z: climbBodyZ(y), mantle: 0 };
  }
  const u = (k - FACE) / (1 - FACE);
  const ease = (v: number) => v * v * (3 - 2 * v);
  if (u < 0.5) {
    // Hands on the top: the body rises until the feet are level with the lip.
    const y = hangTop + (lip.y + 0.04 - hangTop) * ease(u / 0.5);
    return { x: ROPE.x, y, z: climbBodyZ(y), mantle: u };
  }
  // Step in over the edge, then off the rope to stand beside the stake.
  const v = ease((u - 0.5) / 0.5);
  const z0 = climbBodyZ(lip.y + 0.04);
  const x = ROPE.x + (ROPE_TOP.x - ROPE.x) * v;
  const z = z0 + (ROPE_TOP.z - z0) * v;
  const rock = Math.max(ropeTopSurfaceY(z), ground(x, z));
  const stand = ground(ROPE_TOP.x, ROPE_TOP.z);
  const blend = Math.max(0, (v - 0.6) / 0.4);
  return { x, y: Math.max(rock, lip.y + 0.04 - 0.13 * v) * (1 - blend) + stand * blend, z, mantle: u };
}

/**
 * Puff's flight with the rope from the coil to the stake, as absolute points:
 * out from the face, straight up well clear of the outermost rock (the rope
 * hangs 0.13 m off the rock and never swings back in, so the drawn rope's
 * furthest point bounds every bulge), over the edge above the highest rock
 * the rope crosses, and down to the stake. `body` is the flier's radius.
 */
export function ropeFlightPath(coil: { x: number; y: number; z: number }, bottomY: number, body: number): Array<{ x: number; y: number; z: number }> {
  const lip = ropeLip();
  let outZ = lip.z;
  for (let i = lipIndex; i < drawn.length; i++) if (drawn[i].y > bottomY + 0.3) outZ = Math.max(outZ, drawn[i].z);
  let topY = lip.y;
  for (let i = 0; i <= lipIndex; i++) topY = Math.max(topY, drawn[i]?.y ?? topY);
  const clearZ = outZ + body + 0.55;
  const highY = topY + body + 0.8;
  const knot = drawn[0] ?? lip;
  return [
    coil,
    { x: ROPE.x + 0.45, y: bottomY + 1.4, z: clearZ },
    { x: ROPE.x + 0.45, y: highY, z: clearZ },
    { x: ROPE.x + 0.25, y: highY, z: lip.z - 0.5 },
    { x: ROPE.x + 0.15, y: knot.y + body + 0.35, z: ROPE_STAKE.z + 0.25 }
  ];
}
