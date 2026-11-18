import { BOW_Z, HALF_BEAM, SHIP, STERN_Z, hullHalf } from "../world/pirateShip";
import { BOAT_HALF_BEAM, BOAT_HALF_LENGTH } from "../world/gullBoat";

/**
 * The pirate ship's interception (2026-11-19), authored as paths rather than
 * simulated: each vessel follows straight runs and circular turns (so heading
 * is always the path's tangent and turns are smooth), at a speed that rises and
 * falls with time. The paths keep the hulls apart by design; `minClearance`
 * proves it over every frame (flow/voyageEncounter.test.ts).
 *
 * World x is east, z is north. A heading h is the direction of travel,
 * (sin h, cos h): 0 north, π/2 east, π south. Increasing h turns right.
 * Gull's boat yaw is its heading. The pirate ship's bow is its local −z, so its
 * scene yaw is h + π (0 when it lies at its mooring, bow south).
 */

export interface Pose { x: number; z: number; h: number }
type Op = { line: number } | { arc: number; turn: number };

interface Sample { s: number; x: number; z: number; h: number }

/** A path from a start pose: `line` runs ahead, `arc` turns by `turn` radians (+ right) on radius `arc`. */
export class Path {
  readonly samples: Sample[] = [];
  readonly length: number;
  constructor(start: Pose, ops: Op[], step = 0.25) {
    let { x, z, h } = start, s = 0;
    this.samples.push({ s, x, z, h });
    for (const op of ops) {
      if ("line" in op) {
        const n = Math.max(1, Math.ceil(op.line / step));
        for (let i = 1; i <= n; i++) {
          const d = op.line / n;
          x += Math.sin(h) * d; z += Math.cos(h) * d; s += d;
          this.samples.push({ s, x, z, h });
        }
      } else {
        const len = Math.abs(op.turn) * op.arc, n = Math.max(1, Math.ceil(len / step));
        for (let i = 1; i <= n; i++) {
          // Exact chord of the arc: advance along the mean heading of the step.
          const dh = op.turn / n, chord = 2 * op.arc * Math.sin(Math.abs(dh) / 2);
          x += Math.sin(h + dh / 2) * chord; z += Math.cos(h + dh / 2) * chord; h += dh; s += len / n;
          this.samples.push({ s, x, z, h });
        }
      }
    }
    this.length = s;
  }
  /** The pose a distance `s` along the path (clamped to its ends). */
  at(s: number): Pose {
    const a = this.samples;
    if (s <= 0) return { x: a[0].x, z: a[0].z, h: a[0].h };
    if (s >= this.length) { const e = a[a.length - 1]; return { x: e.x, z: e.z, h: e.h }; }
    let lo = 0, hi = a.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (a[mid].s <= s) lo = mid; else hi = mid; }
    const p = a[lo], q = a[hi], k = (s - p.s) / (q.s - p.s || 1);
    return { x: p.x + (q.x - p.x) * k, z: p.z + (q.z - p.z) * k, h: p.h + (q.h - p.h) * k };
  }
  get end(): Pose { return this.at(this.length); }
}

/** The ops of a path that must END at `end`: built backwards from it, then reversed. */
export function pathEndingAt(end: Pose, ops: Op[]): Path {
  // Walk back from the end facing the other way (a right turn going forward is a left turn going back).
  const back = new Path({ x: end.x, z: end.z, h: end.h + Math.PI }, [...ops].reverse().map((o) => ("line" in o ? o : { arc: o.arc, turn: -o.turn })));
  const start = back.end;
  return new Path({ x: start.x, z: start.z, h: start.h - Math.PI }, ops);
}

/**
 * Distance along a path over time: speed eases between keys (seconds, m/s),
 * integrated, so the vessel accelerates and slows instead of lurching. After
 * the last key it holds the last speed until the path ends.
 */
export class Motion {
  private readonly table: number[] = [];
  readonly dt = 1 / 60;
  /** `cover`: scale the speeds so the motion covers exactly this distance in `duration`. */
  constructor(readonly path: Path, readonly keys: Array<[number, number]>, readonly duration: number, cover?: number) {
    let s = 0;
    for (let t = 0; t <= duration + 1e-9; t += this.dt) { this.table.push(s); s += this.speed(t + this.dt / 2) * this.dt; }
    const k = cover === undefined ? 1 : cover / (this.table[this.table.length - 1] || 1);
    for (let i = 0; i < this.table.length; i++) this.table[i] = Math.min(path.length, this.table[i] * k);
  }
  speed(t: number): number {
    const k = this.keys;
    if (t <= k[0][0]) return k[0][1];
    for (let i = 1; i < k.length; i++) if (t <= k[i][0]) {
      const u = (t - k[i - 1][0]) / (k[i][0] - k[i - 1][0]), e = u * u * (3 - 2 * u);
      return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * e;
    }
    return k[k.length - 1][1];
  }
  distance(t: number): number {
    const i = Math.max(0, Math.min(this.table.length - 1, t / this.dt));
    const a = Math.floor(i), b = Math.min(this.table.length - 1, a + 1);
    return this.table[a] + (this.table[b] - this.table[a]) * (i - a);
  }
  at(t: number): Pose { return this.path.at(this.distance(t)); }
}

// ------------------------------------------------------------ footprints and clearance

type V = [number, number];

/** The pirate ship's deck-level hull outline (local x, z), bow at −z, plus its bowsprit. */
const SHIP_HULL: V[] = (() => {
  const pts: V[] = [];
  for (let lz = STERN_Z; lz >= BOW_Z; lz -= 1) pts.push([hullHalf(lz), lz]);
  pts.push([0, BOW_Z - 1.4]);
  for (let lz = BOW_Z; lz <= STERN_Z; lz += 1) pts.push([-hullHalf(lz), lz]);
  return pts;
})();
/** The bowsprit and its spar end (it reaches out over the water ahead of the stem). */
const SHIP_BOWSPRIT: V[] = [[-0.35, BOW_Z - 0.8], [0.35, BOW_Z - 0.8], [0.35, BOW_Z - 6.3], [-0.35, BOW_Z - 6.3]];
/** Gull's boat, conservatively its full bounding rectangle (local x, z), bow at +z. */
const BOAT_RECT: V[] = [[-BOAT_HALF_BEAM, -BOAT_HALF_LENGTH], [BOAT_HALF_BEAM, -BOAT_HALF_LENGTH], [BOAT_HALF_BEAM, BOAT_HALF_LENGTH], [-BOAT_HALF_BEAM, BOAT_HALF_LENGTH]];

/** Ship local → world for a ship whose travel heading is h (bow along the heading). */
function shipToWorld(p: Pose, [lx, lz]: V): V {
  // Bow (−z local) points along (sin h, cos h): rotate local by yaw = h + π.
  const yaw = p.h + Math.PI, c = Math.cos(yaw), s = Math.sin(yaw);
  return [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
}
/** Boat local → world (bow +z along the heading). */
function boatToWorld(p: Pose, [lx, lz]: V): V {
  const c = Math.cos(p.h), s = Math.sin(p.h);
  return [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
}
export const shipFootprint = (p: Pose) => ({ hull: SHIP_HULL.map((v) => shipToWorld(p, v)), sprit: SHIP_BOWSPRIT.map((v) => shipToWorld(p, v)) });
export const boatFootprint = (p: Pose) => BOAT_RECT.map((v) => boatToWorld(p, v));

function segDist(p: V, a: V, b: V): number {
  const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz;
  const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}
function inside(p: V, poly: V[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
/** Gap between two simple polygons (0 when they touch or overlap). */
export function polygonGap(a: V[], b: V[]): number {
  if (a.some((p) => inside(p, b)) || b.some((p) => inside(p, a))) return 0;
  let d = Infinity;
  for (const [P, Q] of [[a, b], [b, a]] as const)
    for (const p of P) for (let i = 0; i < Q.length; i++) d = Math.min(d, segDist(p, Q[i], Q[(i + 1) % Q.length]));
  return d;
}
/** The gap between the pirate ship (hull or bowsprit) and Gull's boat. */
export function clearance(ship: Pose, boat: Pose): number {
  const f = shipFootprint(ship), b = boatFootprint(boat);
  return Math.min(polygonGap(f.hull, b), polygonGap(f.sprit, b));
}

// ------------------------------------------------------------ the authored encounter

/** Where the ship comes to rest: its mooring, bow south (all of the voyage's deck play happens here). */
export const SHIP_REST: Pose = { x: SHIP.x, z: SHIP.z, h: Math.PI };
/** Gull's boat tied alongside the ship's starboard side, bow south. */
export const MOORED = { x: SHIP.x + HALF_BEAM + BOAT_HALF_BEAM + 1.6, z: SHIP.z + 5.5 };
export const MOORED_POSE: Pose = { x: MOORED.x, z: MOORED.z, h: Math.PI };

/**
 * Gull's way out (after the pier and "The sea is calm"): a swing east round the
 * point, then west for Cloud Isle. It ends where the ship is sighted, dead ahead.
 */
export const BOAT_OUT_START: Pose = { x: 80, z: -379, h: Math.PI };
export const BOAT_OUT = new Path(BOAT_OUT_START, [{ arc: 40, turn: -0.75 }, { line: 50 }, { arc: 14, turn: 2.23 }, { line: 4 }]);

/** The whole chase lasts this long (seconds at normal speed). */
export const CHASE_SECONDS = 16;
/**
 * The chase, from the sighting: Gull bears away to port (south-west) as the
 * ship comes on, then slows and stops short of its starboard side.
 */
export const BOAT_CHASE = new Path(BOAT_OUT.end, [{ line: 3 }, { arc: 14, turn: -0.62 }, { line: 9 }]);
export const BOAT_CHASE_MOTION = new Motion(BOAT_CHASE, [[0, 2.2], [2, 3.4], [9, 2.8], [13, 0.8], [15.2, 0]], CHASE_SECONDS, BOAT_CHASE.length);

/**
 * The ship: far off to the west, sailing north-east; it bears round to the east
 * toward the boat, runs down on it, then hooks south across the boat's course
 * and comes to rest broadside at its mooring.
 */
export const SHIP_PATH = pathEndingAt(SHIP_REST, [
  { line: 40 }, { arc: 60, turn: 0.75 }, { line: 50 }, { arc: 22, turn: Math.PI / 2 }, { line: 4 },
]);
/** How far along SHIP_PATH the ship sails while it is watched (sighting and spyglass); the chase starts there. */
export const SHIP_CHASE_S = 40;
/** The chase: the ship gathers speed, runs, then brakes through its final turn. */
export const SHIP_CHASE_MOTION = new Motion(SHIP_PATH, [[0, 3], [2.6, 9], [11, 9], [14.2, 2.5], [16, 0.5]], CHASE_SECONDS, SHIP_PATH.length - SHIP_CHASE_S);
export const shipChaseAt = (t: number) => SHIP_PATH.at(SHIP_CHASE_S + SHIP_CHASE_MOTION.distance(t));
export const boatChaseAt = (t: number) => BOAT_CHASE_MOTION.at(t);

/**
 * How far below the sea the ship sits at distance d from the viewer: a fake
 * horizon (the world is flat), so the sails rise first and the hull follows.
 */
export function horizonDrop(d: number): number {
  return Math.min(12, Math.max(0, d - 110) ** 2 * 9e-4);
}
