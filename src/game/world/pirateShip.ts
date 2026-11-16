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
/**
 * The beam: 1.5× the first build (2026-11-16), for room on deck. Lateral spans
 * (hull, hold, galley, fishing deck) and positions widen by it; furniture keeps
 * its size and stays against its wall; lengths along the ship do not change.
 */
export const BEAM = 1.5;
/** Half the beam amidships (outside face of the rails). */
export const HALF_BEAM = 4.5 * BEAM;

export interface Box { x0: number; x1: number; z0: number; z1: number }
export interface Post { x: number; z: number; r: number }

/** The hull's half-width at deck level (outside face of the rails). */
export function hullHalf(lz: number): number {
  if (lz > STERN_Z || lz < BOW_Z) return 0;
  if (lz > 13) return HALF_BEAM - (lz - 13) * 0.25 * BEAM;
  if (lz >= -13) return HALF_BEAM;
  return (1.5 + ((lz - BOW_Z) / (-13 - BOW_Z)) * 3) * BEAM;
}

export const HOLD: Box = { x0: -4.2, x1: 4.2, z0: -7.8, z1: -1.2 };
/** The stairs down into the hold, against its west wall. */
export const HOLD_RAMP: Box = { x0: -4.15, x1: -3.15, z0: -1.2, z1: 2 };
export const STERN_RAMP: Box = { x0: 2.85, x1: 4.05, z0: 12, z1: 15.4 };
export const FISH_DECK: Box = { x0: -4.5, x1: 4.5, z0: 15.4, z1: 18 };
/** The bow compartment behind the bulkhead (the hull bounds its sides). */
export const GALLEY: Box = { x0: -HALF_BEAM, x1: HALF_BEAM, z0: -18.5, z1: -13 };
/** Where the fish swim, behind the stern. */
export const FISH_WATER: Box = { x0: -7.5, x1: 7.5, z0: 19.5, z1: 27 };

/** Steering lanes are this far apart, so a rock in the next lane passes clear of the hull. */
export const STEER_LANE = 12;

/** The mess table on the main deck, outside the galley; Tom, Sam and Max eat there. */
export const MESS = { x: 3.75, z: -10.5 };

/**
 * The three masts: height above the deck, and where the gaff's jaws ride (the
 * sail's head). The mainmast's lookout sits just above its gaff, with the
 * topmast and the flag above that.
 */
export const MASTS = {
  mizzen: { x: 0, z: 8.5, h: 9, gaff: 7.8 },
  main: { x: 1.2, z: 3.2, h: 13, gaff: 10 },
  fore: { x: -0.75, z: -10.6, h: 11, gaff: 9.8 },
} as const;
/** The mainmast's lookout platform (its underside), just above the gaff. */
export const CROWS_NEST_Y = MASTS.main.gaff + 0.3;
/** A gaff sail's foot sits on its boom, this far above the deck. */
export const SAIL_FOOT = 2.32;
/** A sail's luff fills its mast from the boom up to the gaff's jaws. */
export const sailHeight = (m: { gaff: number }) => m.gaff - SAIL_FOOT;

/** Places the flows and the model share (local). */
export const SPOT = {
  boardDeck: { x: 0, z: 5 },
  helm: { x: 0, z: 11.5 },
  captain: { x: -2.4, z: 11.6 },
  gull: { x: 1.95, z: 10.8 },
  cook: { x: 1.35, z: -15.4 },
  bill: { x: -0.9, z: -3.6 },
  finn: { x: -2.1, z: 16.2 },
  crew: [{ x: MESS.x - 1.5, z: -10.1 }, { x: MESS.x - 1.5, z: -11.3 }, { x: MESS.x, z: -12.35 }],
  stove: { x: 0, z: -16.5 },
  pot: { x: 0, z: -16.5 },
  supplies: { x: -3.15, z: -15 },
  counter: { x: 2.9, z: -14.7 },
  mainMast: { x: MASTS.main.x, z: MASTS.main.z },
  foreMast: { x: MASTS.fore.x, z: MASTS.fore.z },
  mizzenMast: { x: MASTS.mizzen.x, z: MASTS.mizzen.z },
  table: { x: 2.1, z: -5.7 },
  shelf: { x: HOLD.x0 + 0.3, z: -5.7 },
  box: { x: 2.1, z: -2.6 },
  door: { x: -1.8, z: -7.55 },
  fishing: { x: 0.45, z: 17.3 },
} as const;

/** The supply crates in the galley, each with its food (the cook's job). */
export const SUPPLY_CRATES = [
  { food: "fish" as const, x: SPOT.supplies.x, z: -15.9, color: "#5a7ea0" },
  { food: "meat" as const, x: SPOT.supplies.x, z: -15.1, color: "#a8433a" },
  { food: "apples" as const, x: SPOT.supplies.x, z: -14.3, color: "#e83a35" },
  { food: "bananas" as const, x: SPOT.supplies.x, z: -13.6, color: "#ffd23f" },
];
/** The fish bucket on the fishing deck (clear of the stairs' landing). */
export const BUCKET = { x: -3.6, z: 15.9 };
/** Cannons along both rails and barrels against the bulwarks: solid, clear of every walking line. */
export const CANNONS = [-1, 1].flatMap((s) => [-5.5, 0.5, 6].map((z) => ({ x: s * (HALF_BEAM - 0.55), z, side: s })));
export const DECK_BARRELS = [{ x: -(HALF_BEAM - 0.6), z: -11.5 }, { x: -(HALF_BEAM - 0.6), z: 9.5 }, { x: HALF_BEAM - 0.6, z: 9.8 }];

const around = (c: { x: number; z: number }, hx: number, z0: number, z1: number): Box => ({ x0: c.x - hx, x1: c.x + hx, z0, z1 });
const H = HOLD, HR = HOLD_RAMP, SR = STERN_RAMP;

/** Solid bands and furniture (local boxes). */
export const SHIP_SOLIDS: Box[] = [
  // The hold opening's rails on the main deck (the ramp is the only way down).
  { x0: H.x1, x1: H.x1 + 0.5, z0: -8.3, z1: -0.7 },
  { x0: H.x0 - 0.5, x1: H.x0, z0: -8.3, z1: 2 },
  { x0: H.x0 - 0.5, x1: H.x1 + 0.5, z0: -8.3, z1: -7.8 },
  { x0: HR.x1, x1: H.x1 + 0.5, z0: -1.2, z1: -0.7 },
  { x0: HR.x1, x1: HR.x1 + 0.3, z0: -0.7, z1: 2 },
  // The stern ramp's rails and the transom either side of it.
  { x0: SR.x0 - 0.3, x1: SR.x0, z0: 12, z1: 15.4 },
  { x0: SR.x1, x1: SR.x1 + 0.3, z0: 12, z1: 15.4 },
  { x0: -HALF_BEAM, x1: SR.x0, z0: 15, z1: 15.4 },
  { x0: SR.x1, x1: HALF_BEAM, z0: 15, z1: 15.4 },
  // The galley's bulkhead and its door gap (lx ±1), the stove, the supplies, the counter.
  { x0: -HALF_BEAM, x1: -1, z0: -13.2, z1: -12.8 },
  { x0: 1, x1: HALF_BEAM, z0: -13.2, z1: -12.8 },
  around(SPOT.stove, 0.7, -17.2, -15.8),
  around(SPOT.supplies, 0.5, -16.4, -13.6),
  around(SPOT.counter, 0.45, -15.8, -13.6),
  // The hold's table, shelf and open box.
  around(SPOT.table, 0.8, -6.5, -4.9),
  { x0: H.x0, x1: H.x0 + 0.65, z0: -6.8, z1: -4.6 },
  around(SPOT.box, 0.6, -3.2, -2),
  // The mess table on the main deck, and the fishing deck's bucket (clear of the stairs' landing).
  around(MESS, 0.9, -11.8, -9.2),
  around(BUCKET, 0.3, 15.6, 16.2),
  // The cannons' carriages.
  ...CANNONS.map((c) => around(c, 0.3, c.z - 0.38, c.z + 0.38)),
];

/** Round solids: masts, the helm and the deck barrels. */
export const SHIP_POSTS: Post[] = [
  { ...SPOT.mainMast, r: 0.45 }, { ...SPOT.foreMast, r: 0.4 }, { ...SPOT.mizzenMast, r: 0.35 }, { ...SPOT.helm, r: 0.55 },
  ...DECK_BARRELS.map((b) => ({ ...b, r: 0.32 })),
];

const inBox = (b: Box, lx: number, lz: number) => lx >= b.x0 && lx <= b.x1 && lz >= b.z0 && lz <= b.z1;
const touches = (b: Box, lx: number, lz: number, m: number) => lx > b.x0 - m && lx < b.x1 + m && lz > b.z0 - m && lz < b.z1 + m;
const lerp = (a: number, b: number, k: number) => a + (b - a) * Math.max(0, Math.min(1, k));

/** The ship's bounding area: inside it, the ship alone decides walking and heights. */
export function inShipArea(x: number, z: number): boolean {
  const lx = x - SHIP.x, lz = z - SHIP.z;
  return Math.abs(lx) < HALF_BEAM + 1.75 && lz > BOW_Z - 2 && lz < 21;
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
