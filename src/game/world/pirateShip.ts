import { SEA_Y } from "./island";

/**
 * Captain Redbeard's pirate ship (docs/PIRATE_VOYAGE.md §2): a static, walkable,
 * cutaway deck region in the open sea south of Port Town. One authored list
 * drives walking, standing heights, the camera and the model. Coordinates are
 * local to SHIP (lx east, lz north); the bow points south (−z), the stern is
 * nearest the fixed camera.
 */

export const SHIP = { x: 76, z: -470 };
export const DECK_Y = SEA_Y + 2.4;
export const HOLD_Y = SEA_Y + 0.6;
export const FISH_Y = SEA_Y + 0.7;
export const BOW_Z = -21;
export const STERN_Z = 15;
const RAIL = 0.35;

export interface Box { x0: number; x1: number; z0: number; z1: number }
export interface Post { x: number; z: number; r: number }

/** The hull's half-width at deck level (outside face of the rails). */
export function hullHalf(lz: number): number {
  if (lz > STERN_Z || lz < BOW_Z) return 0;
  if (lz > 13) return 4.5 - (lz - 13) * 0.25;
  if (lz >= -13) return 4.5;
  return 1.5 + ((lz - BOW_Z) / (-13 - BOW_Z)) * 3;
}

export const HOLD: Box = { x0: -2.8, x1: 2.8, z0: -7.8, z1: -1.2 };
export const HOLD_RAMP: Box = { x0: -2.75, x1: -1.75, z0: -1.2, z1: 2 };
export const STERN_RAMP: Box = { x0: 1.9, x1: 3.1, z0: 12, z1: 15.4 };
export const FISH_DECK: Box = { x0: -3, x1: 3, z0: 15.4, z1: 18 };
/** The bow compartment behind the bulkhead (the hull bounds its sides). */
export const GALLEY: Box = { x0: -4.5, x1: 4.5, z0: -18.5, z1: -13 };
/** Where the fish swim, behind the stern. */
export const FISH_WATER: Box = { x0: -5, x1: 5, z0: 19.5, z1: 27 };

/** Places the flows and the model share (local). */
export const SPOT = {
  boardDeck: { x: 0, z: 5 },
  helm: { x: 0, z: 11.5 },
  captain: { x: -1.6, z: 11.6 },
  gull: { x: 1.7, z: 11.9 },
  cook: { x: 0.9, z: -15.4 },
  bill: { x: -0.6, z: -3.6 },
  finn: { x: -1.6, z: 16.9 },
  crew: [{ x: 1.0, z: -10.1 }, { x: 1.0, z: -11.3 }, { x: 4.0, z: -10.5 }],
  stove: { x: 0, z: -16.5 },
  pot: { x: 0, z: -16.5 },
  supplies: { x: -2.1, z: -15 },
  counter: { x: 1.95, z: -14.7 },
  mainMast: { x: 0.8, z: 3.2 },
  foreMast: { x: -0.5, z: -10.6 },
  mizzenMast: { x: 0, z: 8.5 },
  table: { x: 1.4, z: -5.7 },
  shelf: { x: -2.5, z: -5.7 },
  box: { x: 1.4, z: -2.6 },
  door: { x: -1.2, z: -7.55 },
  fishing: { x: 0, z: 17.2 },
} as const;

/** Solid bands and furniture (local boxes). */
export const SHIP_SOLIDS: Box[] = [
  // The hold opening's rails on the main deck (the ramp is the only way down).
  { x0: 2.8, x1: 3.3, z0: -8.3, z1: -0.7 },
  { x0: -3.3, x1: -2.8, z0: -8.3, z1: 2 },
  { x0: -3.3, x1: 3.3, z0: -8.3, z1: -7.8 },
  { x0: -1.75, x1: 3.3, z0: -1.2, z1: -0.7 },
  { x0: -1.75, x1: -1.45, z0: -0.7, z1: 2 },
  // The stern ramp's rails and the transom either side of it.
  { x0: 1.6, x1: 1.9, z0: 12, z1: 15.4 },
  { x0: 3.1, x1: 3.4, z0: 12, z1: 15.4 },
  { x0: -4.5, x1: 1.9, z0: 15, z1: 15.4 },
  { x0: 3.1, x1: 4.5, z0: 15, z1: 15.4 },
  // The galley's bulkhead and its door gap (lx ±1), the stove, the supplies, the counter.
  { x0: -4.5, x1: -1, z0: -13.2, z1: -12.8 },
  { x0: 1, x1: 4.5, z0: -13.2, z1: -12.8 },
  { x0: -0.7, x1: 0.7, z0: -17.2, z1: -15.8 },
  { x0: -2.6, x1: -1.6, z0: -16.4, z1: -13.6 },
  { x0: 1.5, x1: 2.4, z0: -15.8, z1: -13.6 },
  // The hold's table, shelf and open box.
  { x0: 0.6, x1: 2.2, z0: -6.5, z1: -4.9 },
  { x0: -2.8, x1: -2.15, z0: -6.8, z1: -4.6 },
  { x0: 0.8, x1: 2, z0: -3.2, z1: -2 },
  // The mess table on the main deck, and the fishing deck's bucket.
  { x0: 1.6, x1: 3.4, z0: -11.8, z1: -9.2 },
  { x0: 1.9, x1: 2.6, z0: 16.6, z1: 17.3 },
];

/** Round solids: masts and the helm. */
export const SHIP_POSTS: Post[] = [
  { ...SPOT.mainMast, r: 0.45 }, { ...SPOT.foreMast, r: 0.4 }, { ...SPOT.mizzenMast, r: 0.35 }, { ...SPOT.helm, r: 0.55 },
];

const inBox = (b: Box, lx: number, lz: number) => lx >= b.x0 && lx <= b.x1 && lz >= b.z0 && lz <= b.z1;
const touches = (b: Box, lx: number, lz: number, m: number) => lx > b.x0 - m && lx < b.x1 + m && lz > b.z0 - m && lz < b.z1 + m;
const lerp = (a: number, b: number, k: number) => a + (b - a) * Math.max(0, Math.min(1, k));

/** The ship's bounding area: inside it, the ship alone decides walking and heights. */
export function inShipArea(x: number, z: number): boolean {
  const lx = x - SHIP.x, lz = z - SHIP.z;
  return Math.abs(lx) < 7 && lz > BOW_Z - 2 && lz < 21;
}

/** The floor height under a local point, or null over the sea. */
export function shipFloorY(lx: number, lz: number): number | null {
  if (inBox(HOLD, lx, lz)) return HOLD_Y;
  if (inBox(HOLD_RAMP, lx, lz)) return lerp(HOLD_Y, DECK_Y, (lz - HOLD_RAMP.z0) / (HOLD_RAMP.z1 - HOLD_RAMP.z0));
  if (inBox(STERN_RAMP, lx, lz)) return lerp(DECK_Y, FISH_Y, (lz - STERN_RAMP.z0) / (STERN_RAMP.z1 - STERN_RAMP.z0));
  if (inBox(FISH_DECK, lx, lz)) return FISH_Y;
  if (lz >= BOW_Z && lz <= STERN_Z && Math.abs(lx) <= hullHalf(lz) - RAIL) return DECK_Y;
  return null;
}

/** A solid overlaps the circle (world coordinates). */
export function shipSolidAt(x: number, z: number, r: number): boolean {
  const lx = x - SHIP.x, lz = z - SHIP.z;
  return SHIP_SOLIDS.some((b) => touches(b, lx, lz, r)) || SHIP_POSTS.some((p) => Math.hypot(lx - p.x, lz - p.z) < p.r + r);
}

const RING = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];

/** Floor all round the circle and no solid in it (world coordinates). */
export function shipWalkable(x: number, z: number, m = 0): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  const lx = x - SHIP.x, lz = z - SHIP.z;
  if (shipFloorY(lx, lz) === null) return false;
  if (m > 0 && RING.some(([dx, dz]) => shipFloorY(lx + dx * m, lz + dz * m) === null)) return false;
  return !shipSolidAt(x, z, m);
}

/** Standing height on the ship (world coordinates); the sea between decks. */
export function shipStandY(x: number, z: number): number {
  return shipFloorY(x - SHIP.x, z - SHIP.z) ?? SEA_Y;
}

/** Local → world. */
export const shipWorld = (p: { x: number; z: number }) => ({ x: SHIP.x + p.x, z: SHIP.z + p.z });
