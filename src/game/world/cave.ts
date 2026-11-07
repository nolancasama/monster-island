import type { Vec2 } from "../types";
import type { SolidShape } from "./island";
import { CAVE_MOUTH, MESA_OUTLINE, inMesa, lowlandY, nearestOnTrail, trailLength, type WalkShape } from "./lowland";
import { LAYER_ENTRY, LAYER_PORTALS, registerLayerWorld, type LayerPortal } from "./layers";

/**
 * The optional cave inside the mesa's base (cave layer). The mouth is on the
 * mesa's west face, on the Grove's south bank. A long J/U route runs east,
 * north up the stem's east side, round a bend through the broad head and west
 * into the treasure chamber in the head's west lobe. The stem is too narrow
 * for a chamber beside a second arm, so the far tip lives in the head. Solid
 * rock everywhere else: there is no second exit. The ground layer's mesa
 * solids and walk exclusions are untouched; this layer simply never uses them.
 */

/** Authored centreline from the mouth strip to the chamber (route distance s). */
export const CAVE_ROUTE: Array<[number, number]> = [
  [68.6, -227], [72.5, -227.3], [76.2, -226.6], [78.6, -223.5], [78.3, -218], [78.9, -212.5],
  [78.6, -207.5], [79.8, -203], [83.6, -199.2], [83.2, -194.5], [80.6, -191.4], [76, -190.9],
  [72.6, -192.8], [70.8, -196.8],
];
export const CAVE_ROUTE_LENGTH = trailLength(CAVE_ROUTE);

/** Half-widths vary along the route (2.6–3.6 m tunnels). */
const SEGMENT_HALF = [1.45, 1.35, 1.4, 1.3, 1.3, 1.25, 1.35, 1.5, 1.4, 1.5, 1.35, 1.45, 1.6];
export const CAVE_CHAMBER = { x: 70.4, z: -197.6, r: 3.1 };
/** The hidden alcove off the chamber (slice E seals it with a root-bound stone). */
export const CAVE_ALCOVE = { x: 73.8, z: -199.2, r: 1.0 };
export const CAVE_BEND = { x: 82, z: -196.5, r: 2.4 };
const RECESSES = [{ x: 76.6, z: -215.2, r: .95 }, { x: 85, z: -196.8, r: .9 }, { x: 74.6, z: -229.1, r: .9 }];

export const CAVE_WALK: WalkShape[] = [
  ...SEGMENT_HALF.map((w, i): WalkShape => ({ kind: "trail", pts: [CAVE_ROUTE[i], CAVE_ROUTE[i + 1]], w })),
  { kind: "disc", ...CAVE_CHAMBER },
  { kind: "disc", ...CAVE_ALCOVE },
  { kind: "disc", ...CAVE_BEND },
  ...RECESSES.map((r): WalkShape => ({ kind: "disc", ...r })),
];

/** Stalagmites standing on the floor (solid, matching their rendered bases). */
export const CAVE_STALAGMITES: Array<Vec2 & { r: number; h: number }> = [
  { x: 79.2, z: -215.6, r: .32, h: 1.3 },
  { x: 82.9, z: -195.2, r: .38, h: 1.6 },
  { x: 72.6, z: -195.1, r: .3, h: 1.1 },
  { x: 75.6, z: -227.6, r: .28, h: .9 },
];
const CAVE_SOLIDS: SolidShape[] = CAVE_STALAGMITES.map(s => ({ kind: "circle", x: s.x, z: s.z, r: s.r }));

const BOUNDS = (() => {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const sh of CAVE_WALK) {
    const pts = sh.kind === "trail" ? sh.pts : sh.kind === "disc" ? [[sh.x, sh.z] as [number, number]] : [[sh.x0, sh.z0], [sh.x1, sh.z1]] as Array<[number, number]>;
    const pad = sh.kind === "trail" ? sh.w : sh.kind === "disc" ? sh.r : 0;
    for (const [x, z] of pts) { x0 = Math.min(x0, x - pad); x1 = Math.max(x1, x + pad); z0 = Math.min(z0, z - pad); z1 = Math.max(z1, z + pad); }
  }
  return { x0, x1, z0, z1 };
})();

function inShape(sh: WalkShape, x: number, z: number, m: number): boolean {
  if (sh.kind === "disc") return Math.hypot(x - sh.x, z - sh.z) <= sh.r - m;
  if (sh.kind === "trail") return nearestOnTrail(sh.pts, x, z).d <= sh.w - m;
  return x >= sh.x0 + m && x <= sh.x1 - m && z >= sh.z0 + m && z <= sh.z1 - m;
}
/** Signed clearance: positive inside the cave's open floor, in metres. */
export function caveClearance(x: number, z: number): number {
  let best = -Infinity;
  for (const sh of CAVE_WALK) {
    const d = sh.kind === "disc" ? sh.r - Math.hypot(x - sh.x, z - sh.z)
      : sh.kind === "trail" ? sh.w - nearestOnTrail(sh.pts, x, z).d
      : Math.min(x - sh.x0, sh.x1 - x, z - sh.z0, sh.z1 - z);
    if (d > best) best = d;
  }
  return best;
}
export function caveWalkable(x: number, z: number, m: number): boolean {
  if (x < BOUNDS.x0 || x > BOUNDS.x1 || z < BOUNDS.z0 || z > BOUNDS.z1) return false;
  return CAVE_WALK.some(sh => inShape(sh, x, z, m));
}

/** Route distance of the nearest centreline point (for light spreading along the tunnel). */
export function caveRouteS(x: number, z: number): number {
  const chamber = Math.hypot(x - CAVE_CHAMBER.x, z - CAVE_CHAMBER.z) - CAVE_CHAMBER.r;
  return chamber < 0 ? CAVE_ROUTE_LENGTH : nearestOnTrail(CAVE_ROUTE, x, z).s;
}

const smooth = (t: number) => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };
/** The cave floor meets the Grove at the mouth, then stays near that height. */
export const CAVE_FLOOR_Y = lowlandY(CAVE_MOUTH.portalX, CAVE_MOUTH.z);
export function caveFloorY(x: number, z: number): number {
  const rough = .07 * Math.sin(x * 1.3 + z * .7) + .05 * Math.sin(x * .45 - z * 1.1);
  // Blend by route distance, not x: the chamber lies almost due north of the mouth.
  const k = inCaveMouthStrip(x, z) ? smooth((x - CAVE_MOUTH.portalX + .4) / 2.6) : 1;
  return lowlandY(x, z) * (1 - k) + (CAVE_FLOOR_Y + rough) * k;
}

/** Inside the mouth's overlap strip (walkable on both layers). */
export const inCaveMouthStrip = (x: number, z: number) =>
  x >= CAVE_MOUTH.x0 && x <= CAVE_MOUTH.x1 && z >= CAVE_MOUTH.z0 && z <= CAVE_MOUTH.z1;

export const CAVE_PORTAL: LayerPortal = {
  id: "caveMouth", from: "ground", to: "cave",
  at: { x: CAVE_MOUTH.portalX, z: CAVE_MOUTH.z }, n: { x: 1, z: 0 }, enter: .45, half: (CAVE_MOUTH.z1 - CAVE_MOUTH.z0) / 2,
};
/** Just inside the mouth, past the portal's dead band. */
export const CAVE_ENTRY: Vec2 = { x: 72.4, z: -227.2 };

/** True when the cave lies inside the mesa (outside the mouth strip) with clearance. */
export const caveInsideMesa = (x: number, z: number, clearance: number) =>
  inCaveMouthStrip(x, z) || (inMesa(x, z) && !nearMesaEdge(x, z, clearance));
const EDGE = [...MESA_OUTLINE, MESA_OUTLINE[0]];
const nearMesaEdge = (x: number, z: number, d: number) => nearestOnTrail(EDGE, x, z).d < d;

registerLayerWorld("cave", {
  zoneAt: (x, z) => caveWalkable(x, z, 0) ? "cave" : null,
  walkable: (x, z, m) => caveWalkable(x, z, m),
  surfaceY: (x, z) => caveWalkable(x, z, -.6) ? caveFloorY(x, z) : -Infinity,
  solids: CAVE_SOLIDS,
});
LAYER_PORTALS.push(CAVE_PORTAL);
LAYER_ENTRY.cave = CAVE_ENTRY;
