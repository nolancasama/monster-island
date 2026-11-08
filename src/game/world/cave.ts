import type { Vec2 } from "../types";
import type { SolidShape } from "./island";
import { CAVE_MOUTH, CAVE_MOUTHS, MESA_OUTLINE, inMesa, lowlandY, nearestOnTrail, trailLength, trailPoint, type WalkShape } from "./lowland";
import { ELEMENT_OBJECTS, type ElementObject } from "./elementObjects";
import { LAYER_ENTRY, LAYER_PORTALS, registerLayerWorld, type LayerPortal } from "./layers";

/**
 * The optional cave inside the mesa's base (cave layer). The mouth is on the
 * mesa's west face, on the Grove's south bank. A U route runs east,
 * north up the stem's east side, round a bend through the broad head and west
 * into the treasure chamber in the head's west lobe, then south down the west
 * arm to the second entrance. Solid rock separates the parallel arms. The
 * ground layer's mesa solids and walk exclusions are untouched; this layer
 * simply never uses them.
 */

/** Authored centreline from mouth A, through the chamber, to mouth B (distance s). */
export const CAVE_ROUTE: Array<[number, number]> = [
  [68.6, -227], [72.5, -227.3], [76.2, -226.6], [78.6, -223.5], [78.3, -218], [78.9, -212.5],
  [78.6, -207.5], [79.8, -203], [83.6, -199.2], [83.2, -194.5], [80.6, -191.4], [76, -190.9],
  [72.6, -192.8], [70.8, -196.8],
  [70.4, -197.6], [72.8, -200.3], [74.6, -204.8], [74.6, -210.4], [74.6, -215.8],
  [72.5, -216.4], [68.6, -216.4],
];
export const CAVE_ROUTE_LENGTH = trailLength(CAVE_ROUTE);

/** Half-widths vary along the route (2.3–3.2 m tunnels). */
const SEGMENT_HALF = [1.45, 1.35, 1.4, 1.3, 1.3, 1.25, 1.35, 1.5, 1.4, 1.5, 1.35, 1.45, 1.6,
  1.5, 1.3, 1.2, 1.15, 1.15, 1.25, 1.35];
export const CAVE_CHAMBER = { x: 70.4, z: -197.6, r: 3.1 };
export const CAVE_CHAMBER_S = nearestOnTrail(CAVE_ROUTE, CAVE_CHAMBER.x, CAVE_CHAMBER.z).s;
/** The hidden alcove off the chamber (slice E seals it with a root-bound stone). */
export const CAVE_ALCOVE = { x: 67.6, z: -196.6, r: .85 };
export const CAVE_BEND = { x: 82, z: -196.5, r: 2.4 };
const RECESSES = [{ x: 76.6, z: -215.2, r: .95 }, { x: 85, z: -196.8, r: .9 }, { x: 74.6, z: -229.1, r: .9 }];

export const CAVE_WALK: WalkShape[] = [
  ...SEGMENT_HALF.map((w, i): WalkShape => ({ kind: "trail", pts: [CAVE_ROUTE[i], CAVE_ROUTE[i + 1]], w })),
  { kind: "disc", ...CAVE_CHAMBER },
  { kind: "disc", ...CAVE_ALCOVE },
  { kind: "disc", ...CAVE_BEND },
  ...RECESSES.map((r): WalkShape => ({ kind: "disc", ...r })),
];
const ALCOVE_SHAPE = CAVE_WALK[SEGMENT_HALF.length + 1];

/** Stalagmites standing on the floor (solid, matching their rendered bases). */
export const CAVE_STALAGMITES: Array<Vec2 & { r: number; h: number }> = [
  { x: 79.2, z: -215.6, r: .32, h: 1.3 },
  { x: 82.9, z: -195.2, r: .38, h: 1.6 },
  { x: 72.6, z: -195.1, r: .3, h: 1.1 },
  { x: 75.6, z: -227.6, r: .28, h: .9 },
];
const CAVE_SOLIDS: SolidShape[] = [
  ...CAVE_STALAGMITES.map((s): SolidShape => ({ kind: "circle", x: s.x, z: s.z, r: s.r })),
  // The treasure chest at the back of the alcove (only reachable once the seal is open).
  { kind: "box", x: 66.95, z: -196.35, hx: .5, hz: .36, yaw: 1.91 },
];

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
/** Open floor. The alcove behind the root seal opens only once Leafy pulls it
 * away (`open`); geometry and rendering always include it. */
export function caveWalkable(x: number, z: number, m: number, open = true): boolean {
  if (x < BOUNDS.x0 || x > BOUNDS.x1 || z < BOUNDS.z0 || z > BOUNDS.z1) return false;
  return CAVE_WALK.some(sh => (open || sh !== ALCOVE_SHAPE) && inShape(sh, x, z, m));
}

/** Route distance of the nearest centreline point (for light spreading along the tunnel). */
export function caveRouteS(x: number, z: number): number {
  const chamber = Math.hypot(x - CAVE_CHAMBER.x, z - CAVE_CHAMBER.z) - CAVE_CHAMBER.r;
  return chamber < 0 ? CAVE_CHAMBER_S : nearestOnTrail(CAVE_ROUTE, x, z).s;
}

const smooth = (t: number) => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };
/** The cave floor meets the Grove at the mouth, then stays near that height. */
export const CAVE_FLOOR_Y = lowlandY(CAVE_MOUTH.portalX, CAVE_MOUTH.z);
export function caveFloorY(x: number, z: number): number {
  const rough = .07 * Math.sin(x * 1.3 + z * .7) + .05 * Math.sin(x * .45 - z * 1.1);
  // Match each entrance's ground height before blending to the interior floor.
  const mouth = CAVE_MOUTHS.find(m => x >= m.x0 && x <= m.x1 && z >= m.z0 && z <= m.z1);
  const k = mouth ? smooth((x - mouth.portalX + .4) / 2.6) : 1;
  return lowlandY(x, z) * (1 - k) + (CAVE_FLOOR_Y + rough) * k;
}

/** Inside the mouth's overlap strip (walkable on both layers). */
export const inCaveMouthStrip = (x: number, z: number) =>
  CAVE_MOUTHS.some(m => x >= m.x0 && x <= m.x1 && z >= m.z0 && z <= m.z1);

export const CAVE_PORTALS: LayerPortal[] = CAVE_MOUTHS.map((mouth, i) => ({
  id: i === 0 ? "caveMouth" : "caveMouthWest", from: "ground", to: "cave",
  at: { x: mouth.portalX, z: mouth.z }, n: { x: 1, z: 0 }, enter: .45, half: (mouth.z1 - mouth.z0) / 2,
}));
export const CAVE_PORTAL = CAVE_PORTALS[0];
/** Just inside the mouth, past the portal's dead band. */
export const CAVE_ENTRY: Vec2 = { x: 72.4, z: -227.2 };

/** True when the cave lies inside the mesa (outside the mouth strip) with clearance. */
export const caveInsideMesa = (x: number, z: number, clearance: number) =>
  inCaveMouthStrip(x, z) || (inMesa(x, z) && !nearMesaEdge(x, z, clearance));
const EDGE = [...MESA_OUTLINE, MESA_OUTLINE[0]];
const nearMesaEdge = (x: number, z: number, d: number) => nearestOnTrail(EDGE, x, z).d < d;

registerLayerWorld("cave", {
  zoneAt: (x, z) => caveWalkable(x, z, 0) ? "cave" : null,
  walkable: (x, z, m, gates) => caveWalkable(x, z, m, gates.secrets?.includes("caveRootSeal") === true),
  surfaceY: (x, z) => caveWalkable(x, z, -.6) ? caveFloorY(x, z) : -Infinity,
  solids: CAVE_SOLIDS,
});
LAYER_PORTALS.push(...CAVE_PORTALS);
LAYER_ENTRY.cave = CAVE_ENTRY;

// ------------------------------------------------------------ Ember's torches and Leafy's seal

/** Two braziers flank each mouth, feeding the route from their entrance. */
export const CAVE_BRAZIERS: Array<Vec2 & { id: string; s: number }> = [
  { id: "caveBrazierNorth", x: 69.9, z: -224.55, s: 0 },
  { id: "caveBrazierSouth", x: 69.9, z: -229.45, s: 0 },
  { id: "caveBrazierWestNorth", x: 69.9, z: -214, s: CAVE_ROUTE_LENGTH },
  { id: "caveBrazierWestSouth", x: 69.9, z: -218.8, s: CAVE_ROUTE_LENGTH },
];
/** Torches stand at the wall's foot along the route (cave layer), lit in route order. */
const routeTorch = (s: number, i: number): Vec2 & { id: string; s: number } => {
  const p = trailPoint(CAVE_ROUTE, s), q = trailPoint(CAVE_ROUTE, Math.min(CAVE_ROUTE_LENGTH, s + .3));
  const dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz) || 1;
  // The side away from the camera (toward -z), or east for a north-south tunnel.
  let nx = -dz / l, nz = dx / l;
  if (nz > .2 || (Math.abs(nz) <= .2 && nx < 0)) { nx = -nx; nz = -nz; }
  let d = 0;
  while (d < 4 && caveWalkable(p.x + nx * (d + .1), p.z + nz * (d + .1), 0)) d += .05;
  return { id: `caveTorch${i}`, x: p.x + nx * (d - .22), z: p.z + nz * (d - .22), s };
};
export const CAVE_TORCHES = [4.5, 10.5, 16.5, 22.5, 28.5, 34.5, 40.5, 46.5, 52, 57].map(routeTorch);
// Two more on the chamber's far wall light the treasure room itself.
for (const [i, [ux, uz]] of ([[-.6, -.8], [.1, -1]] as const).entries())
  CAVE_TORCHES.push({ id: `caveTorch${10 + i}`, x: CAVE_CHAMBER.x + ux * (CAVE_CHAMBER.r - .22), z: CAVE_CHAMBER.z + uz * (CAVE_CHAMBER.r - .22), s: CAVE_CHAMBER_S });
// Preserve the original torch ids, appending lights for the new west arm.
for (let s = CAVE_CHAMBER_S + 5, i = 12; s < CAVE_ROUTE_LENGTH - 2; s += 5, i++)
  CAVE_TORCHES.push(routeTorch(s, i));
/** The cracked stone panel across the alcove's opening, bound by an old root. */
export const CAVE_SEAL = { x: 68.12, z: -196.77, yaw: Math.atan2(CAVE_ALCOVE.x - CAVE_CHAMBER.x, CAVE_ALCOVE.z - CAVE_CHAMBER.z), width: 1.7, height: 2.1 };
export const CAVE_CHEST = { x: 66.95, z: -196.35, yaw: 1.91 };

ELEMENT_OBJECTS.push(
  ...CAVE_BRAZIERS.map((b): ElementObject => ({ id: b.id, world: "home", x: b.x, z: b.z, r: .6, tags: ["flammable"], on: { burn: { becomes: "lit" } } })),
  ...CAVE_TORCHES.map((t): ElementObject => ({ id: t.id, world: "home", layer: "cave", x: t.x, z: t.z, r: .5, tags: ["flammable"], on: { burn: { becomes: "lit" } } })),
  { id: "caveRootSeal", world: "home", layer: "cave", x: CAVE_SEAL.x, z: CAVE_SEAL.z, r: .8, tags: ["grabbable", "heavy"], on: { grab: { becomes: "pulled", secret: "caveRootSeal" } } },
);
/** True for any of the cave's ancient lighting objects. */
export const isCaveFlame = (id: string) => id.startsWith("caveTorch") || id.startsWith("caveBrazier");
