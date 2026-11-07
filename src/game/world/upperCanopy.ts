import type { Vec2 } from "../types";
import type { SolidShape } from "./island";
import type { Hazard } from "./hazards";
import { GIANT_TREES, nearestOnTrail, type ClimbRope, type WalkShape } from "./lowland";
import { LAYER_ENTRY, registerLayerWorld } from "./layers";

/**
 * The Upper Canopy (high layer): giant round leaves and thick branches 20–23 m
 * up, hung from the lower Canopy's three giant trunks, running from the upper
 * rope north-west to the mesa's east shoulder (the summit approach, slice H).
 * Each leaf's walking disc is exactly its rendered outline; branches are
 * trails whose height ramps between the leaves they join. Every open edge is a
 * real fall: one hazard covers the area and every walk shape is its safe ground.
 */

export interface UpperLeaf { id: string; x: number; z: number; r: number; y: number; unstable?: true }
export interface UpperBranch { id: string; pts: Array<[number, number]>; w: number; y0: number; y1: number; vine?: true }

export const UPPER_LEAVES: UpperLeaf[] = [
  { id: "ropeLeaf", x: 97.6, z: -233.6, r: 2.6, y: 20.6 },
  { id: "broadleaf", x: 104.4, z: -226.2, r: 3.6, y: 21.0 },
  { id: "windwardA", x: 109.8, z: -220.4, r: 2.2, y: 21.5 },
  { id: "windwardB", x: 112.6, z: -217.2, r: 2.1, y: 21.7 },
  { id: "lookout", x: 113.6, z: -223.4, r: 1.3, y: 21.4, unstable: true },
  { id: "crownEast", x: 104.8, z: -213.6, r: 2.4, y: 21.6 },
  { id: "crownMid", x: 99.6, z: -215.4, r: 2.0, y: 21.9 },
  { id: "crownShortcut", x: 98.4, z: -211.6, r: 1.4, y: 22.0, unstable: true },
  { id: "crownWest", x: 94.8, z: -210.6, r: 2.2, y: 22.2 },
  { id: "approach", x: 90.2, z: -205.6, r: 2.6, y: 22.5 },
];
const leaf = (id: string) => UPPER_LEAVES.find(l => l.id === id)!;

export const UPPER_BRANCHES: UpperBranch[] = [
  { id: "ropeToBroad", pts: [[99.4, -231.8], [102.3, -228.9]], w: 1.0, y0: 20.6, y1: 21.0 },
  { id: "broadToWindward", pts: [[106.9, -223.6], [108.6, -222.0]], w: 1.0, y0: 21.0, y1: 21.5 },
  { id: "windwardLink", pts: [[111.1, -219.0], [111.6, -218.3]], w: .95, y0: 21.5, y1: 21.7 },
  { id: "lookoutTwig", pts: [[111.4, -221.6], [112.8, -222.6]], w: .9, y0: 21.5, y1: 21.4 },
  { id: "windwardVine", pts: [[108.9, -218.5], [107.6, -216.6], [106.3, -215.4]], w: .95, y0: 21.5, y1: 21.6, vine: true },
  { id: "crownLink", pts: [[102.5, -214.2], [101.5, -214.8]], w: 1.0, y0: 21.6, y1: 21.9 },
  { id: "crownSafe", pts: [[98.6, -217.0], [96.2, -215.6], [94.9, -212.8]], w: 1.0, y0: 21.9, y1: 22.2 },
  { id: "shortcutIn", pts: [[99.2, -213.6], [98.8, -212.8]], w: .9, y0: 21.9, y1: 22.0 },
  { id: "shortcutOut", pts: [[97.1, -211.3], [96.8, -211.1]], w: .9, y0: 22.0, y1: 22.2 },
  { id: "crownToApproach", pts: [[93.2, -209.2], [91.8, -207.3]], w: 1.0, y0: 22.2, y1: 22.5 },
  // The last natural bridge toward the mountain: slice H carries it onto the plateau.
  { id: "summitBridge", pts: [[88.0, -204.4], [86.4, -203.4]], w: 1.0, y0: 22.5, y1: 22.65 },
];

// Every branch end reaches 0.6 m into the leaf it joins and takes that leaf's
// height, and branches are at least 1.15 m half-wide: joints stay open for a
// mounted rider (0.55 m body), and ramps never steepen at a short joint.
for (const b of UPPER_BRANCHES) {
  b.w = Math.max(b.w, 1.15);
  for (const end of [0, b.pts.length - 1]) {
    const [x, z] = b.pts[end];
    const l = UPPER_LEAVES.find(l => Math.abs(Math.hypot(x - l.x, z - l.z) - l.r) < .5);
    if (!l) continue;
    const d = Math.hypot(x - l.x, z - l.z) || 1, inward = Math.min(.6, d);
    b.pts[end] = [x + (l.x - x) / d * inward, z + (l.z - z) / d * inward];
    if (end === 0) b.y0 = l.y; else b.y1 = l.y;
  }
}

/** Most recently reached one is where a fall returns you (never the forest). */
export const UPPER_CHECKPOINTS: Array<Vec2 & { id: string; r: number }> = [
  { id: "ropeTop", x: 97.6, z: -233.6, r: 1.6 },
  { id: "broadleafClearing", x: 104.4, z: -226.2, r: 2.2 },
  { id: "brokenCrown", x: 104.8, z: -213.6, r: 1.5 },
  { id: "summitApproach", x: 90.2, z: -205.6, r: 1.6 },
];
/** Encounter areas (slice G places enemies here). */
export const UPPER_AREAS = {
  broadleafClearing: { x: 104.4, z: -226.2 },
  windwardBranch: { x: 110.8, z: -219.2 },
  brokenCrown: { x: 101.6, z: -214.2 },
  summitApproach: { x: 90.2, z: -205.6 },
};

/** The rope up from the lower Canopy's north root walk, beside the giant trunk. */
export const UPPER_ROPE: ClimbRope = {
  x: 96.9, stakeZ: -235, lipZ: -235, faceZ: -235, hangZ: -235, bodyZ: -235.3,
  foot: { x: 96.9, z: -235.9 }, top: { x: 97.0, z: -234.3 }, facing: 0,
  footLayer: "ground", topLayer: "high",
};
/** Where the rope hangs from: a branch collar on the giant trunk, above the rope leaf. */
export const UPPER_ROPE_COLLAR = { x: 96.9, y: 24.2, z: -235 };

// ------------------------------------------------------------ unstable leaves (runtime state)

export type LeafState = { phase: "solid" | "warn" | "gone"; t: number };
/** Shared mutable state: the simulation advances it; walkability reads it. */
export const LEAF_STATE: Record<string, LeafState> = Object.fromEntries(UPPER_LEAVES.filter(l => l.unstable).map(l => [l.id, { phase: "solid", t: 0 }]));
export const LEAF_TIMING = { stand: .8, warn: 1.2, regrow: 6 };
export function resetUpperLeaves() {
  for (const s of Object.values(LEAF_STATE)) { s.phase = "solid"; s.t = 0; }
}
/** Advance one unstable leaf: standing for `stand` s starts a `warn`, then it drops; it regrows. */
export function stepLeaf(s: LeafState, standing: boolean, dt: number): LeafState["phase"] {
  if (s.phase === "solid") { s.t = standing ? s.t + dt : 0; if (s.t >= LEAF_TIMING.stand) { s.phase = "warn"; s.t = 0; } }
  else if (s.phase === "warn") { s.t += dt; if (s.t >= LEAF_TIMING.warn) { s.phase = "gone"; s.t = 0; } }
  else { s.t += dt; if (s.t >= LEAF_TIMING.regrow) { s.phase = "solid"; s.t = 0; } }
  return s.phase;
}

// ------------------------------------------------------------ the layer world

const leafWalk = (l: UpperLeaf): WalkShape => ({ kind: "disc", x: l.x, z: l.z, r: l.r });
const branchWalk = (b: UpperBranch): WalkShape => ({ kind: "trail", pts: b.pts, w: b.w });
const present = (l: UpperLeaf) => !l.unstable || LEAF_STATE[l.id].phase !== "gone";

export const UPPER_BOUNDS = { x0: 83.5, x1: 118, z0: -237.5, z1: -201.5 };
const inBounds = (x: number, z: number, pad = 0) => x >= UPPER_BOUNDS.x0 - pad && x <= UPPER_BOUNDS.x1 + pad && z >= UPPER_BOUNDS.z0 - pad && z <= UPPER_BOUNDS.z1 + pad;

/** The leaf or branch under a point (with margin m), or null. */
export function upperSurfaceAt(x: number, z: number, m = 0): { y: number; leaf?: UpperLeaf; branch?: UpperBranch } | null {
  if (!inBounds(x, z, 1)) return null;
  let best: { y: number; leaf?: UpperLeaf; branch?: UpperBranch } | null = null;
  for (const l of UPPER_LEAVES) {
    if (!present(l) || Math.hypot(x - l.x, z - l.z) > l.r - m) continue;
    if (!best || l.y > best.y) best = { y: l.y, leaf: l };
  }
  // A branch's end inside a leaf that has dropped away goes with it.
  const inGone = UPPER_LEAVES.some(l => l.unstable && !present(l) && Math.hypot(x - l.x, z - l.z) <= l.r + m);
  for (const b of inGone ? [] : UPPER_BRANCHES) {
    const near = nearestOnTrail(b.pts, x, z);
    if (near.d > b.w - m) continue;
    let len = 0;
    for (let i = 1; i < b.pts.length; i++) len += Math.hypot(b.pts[i][0] - b.pts[i - 1][0], b.pts[i][1] - b.pts[i - 1][1]);
    const y = b.y0 + (b.y1 - b.y0) * Math.max(0, Math.min(1, near.s / (len || 1)));
    if (!best || y > best.y) best = { y, branch: b };
  }
  return best;
}
export const upperWalkable = (x: number, z: number, m: number) => upperSurfaceAt(x, z, m) !== null;

/** Areas, for zone and camera purposes: the whole treetop route. */
export const upperZoneAt = (x: number, z: number) => upperSurfaceAt(x, z, 0) ? "upperCanopy" as const : null;

/** The giant trunks pass up through the leaves: their faces are walls. */
export const UPPER_TRUNKS = GIANT_TREES.filter(t => t.h >= 20 && inBounds(t.x, t.z)).map(t => ({ x: t.x, z: t.z, r: t.r * .82 }));
const UPPER_SOLIDS: SolidShape[] = UPPER_TRUNKS.map(t => ({ kind: "circle", x: t.x, z: t.z, r: t.r }));

/** One fall over the whole treetop area; every leaf and branch is its safe ground.
 * Unstable leaves leave the safe list while they are gone (rebuilt each call). */
export function upperFallHazards(): Hazard[] {
  // A leaf that has dropped away is a fall even where a branch end reached into it.
  const gone = UPPER_LEAVES.filter(l => !present(l)).map((l): Hazard => ({
    id: `upperLeafGone:${l.id}`, world: "home", kind: "fall", playerFall: true, layer: "high", shape: { kind: "disc", x: l.x, z: l.z, r: l.r },
  }));
  return [...gone, {
    id: "upperCanopyFall", world: "home", kind: "fall", playerFall: true, layer: "high",
    shape: { kind: "rect", ...UPPER_BOUNDS },
    safe: [...UPPER_LEAVES.filter(present).map(leafWalk), ...UPPER_BRANCHES.map(branchWalk)],
  }];
}
const REGISTERED = registerLayerWorld("high", {
  zoneAt: (x, z) => upperZoneAt(x, z),
  walkable: (x, z, m) => upperWalkable(x, z, m),
  surfaceY: (x, z) => upperSurfaceAt(x, z, -.4)?.y ?? -Infinity,
  solids: UPPER_SOLIDS,
  hazards: upperFallHazards(),
});
/** Keep the registered hazard's safe list in step with the unstable leaves. */
export function refreshUpperHazards() {
  REGISTERED.hazards.splice(0, REGISTERED.hazards.length, ...upperFallHazards());
}
LAYER_ENTRY.high = { ...UPPER_ROPE.top };

export const leafById = leaf;
