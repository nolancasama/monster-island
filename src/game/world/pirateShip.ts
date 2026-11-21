import { SEA_Y } from "./island";

/**
 * Captain Redbeard's pirate ship (docs/PIRATE_VOYAGE.md §2): a static, walkable,
 * deck and cargo hold in the open sea south of Port Town. One authored list
 * drives walking, standing heights, the camera and the model. Coordinates are
 * local to SHIP (lx east, lz north); the bow points south (−z), the stern is
 * nearest the fixed camera.
 */

export const SHIP = { x: 76, z: -470 };
export const DECK_Y = SEA_Y + 2.4;
export const HOLD_Y = SEA_Y - 1.1;
export const HOLD_CEILING_Y = DECK_Y - 0.14;
export const FISH_Y = SEA_Y + 0.7;
export const BOW_Z = -21;
export const STERN_Z = 15;
const RAIL = 0.35;
/**
 * The beam: 1.5× the first build (2026-11-16), for room on deck. Lateral spans
 * (hull, galley, fishing deck) and positions widen by it; furniture keeps
 * its size and stays against its wall; lengths along the ship do not change.
 */
export const BEAM = 1.5;
/** Half the beam amidships (outside face of the rails). */
export const HALF_BEAM = 4.5 * BEAM;

export interface Box { x0: number; x1: number; z0: number; z1: number; yaw?: number }
export interface Post { x: number; z: number; r: number }

/** The hull's half-width at deck level (outside face of the rails). */
export function hullHalf(lz: number): number {
  if (lz > STERN_Z || lz < BOW_Z) return 0;
  if (lz > 13) return HALF_BEAM - (lz - 13) * 0.25 * BEAM;
  if (lz >= -13) return HALF_BEAM;
  return (1.5 + ((lz - BOW_Z) / (-13 - BOW_Z)) * 3) * BEAM;
}

export const HOLD: Box = { x0: -5.9, x1: 5.9, z0: -13.2, z1: -1.2 };
/** The original deck opening, at the port side of the aft bulkhead. */
export const HOLD_RAMP: Box = { x0: -4.2, x1: -2.5, z0: HOLD.z1, z1: 2 };
export const HOLD_ENTRY = { x: (HOLD_RAMP.x0 + HOLD_RAMP.x1) / 2, z: HOLD_RAMP.z0 - 1.05 };
export const HOLD_HEADER_Y = HOLD_CEILING_Y - 0.18;
export const HOLD_LANTERN = { x: 0.25, y: HOLD_CEILING_Y - 0.46, z: (HOLD.z0 + HOLD.z1) / 2 };
export const HOLD_TABLE = { width: 2.1, depth: 1.85, top: 1.18, board: 0.16, leg: 0.15 };
export const HOLD_SHELF = { width: 1.26, depth: 2.35, top: 1.24, board: 0.16, leg: 0.13 };
export const HOLD_BOX = { width: 1.44, depth: 1.35, height: 1.07, base: 0.13, wall: 0.12 };
export const HOLD_DOOR = { width: 1.18, depth: 0.14 };
export const CARGO_SIZE = {
  barrel: { radius: 0.44, height: 0.9 },
  bag: { radius: 0.43, height: 0.8 },
  bottle: { radius: 0.28, height: 0.8 },
} as const;
export const STERN_RAMP: Box = { x0: 2.85, x1: 4.05, z0: 12, z1: 15.4 };
export const FISH_DECK: Box = { x0: -4.5, x1: 4.5, z0: 15.4, z1: 18 };
/** Where the fish swim, behind the stern. */
export const FISH_WATER: Box = { x0: -7.5, x1: 7.5, z0: 19.5, z1: 27 };

/** Steering lanes are this far apart, so a rock in the next lane passes clear of the hull. */
export const STEER_LANE = 12;

/** The mess table on the main deck, outside the galley; Tom, Sam and Max eat there. */
export const MESS = { x: 3.75, z: -10.5 };

/** Inside face of the tapered port bulwark, with the crate row running along it. */
export const BULWARK_THICKNESS = 0.3;
export const SUPPLY_SIZE = { width: 0.9, depth: 1.1, height: 0.72, signDepth: 0.21 };
const SUPPLY_PITCH = 1.44;
const SUPPLY_YAW = -Math.atan((hullHalf(-13) - hullHalf(BOW_Z)) / (-13 - BOW_Z));
const supplyZ = -16.35;
const supplyX = -hullHalf(supplyZ) + BULWARK_THICKNESS + (SUPPLY_SIZE.width / 2 + 0.045) / Math.cos(SUPPLY_YAW);

export const COUNTER_SIZE = { width: 2.3, depth: 1 };

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
export const HOLD_PILLAR: Post = { x: MASTS.fore.x, z: MASTS.fore.z, r: 0.36 };
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
  cook: { x: 2.9, z: -15.7 },
  bill: { x: -1.95, z: -4.15 },
  finn: { x: -2.1, z: 16.2 },
  crew: [{ x: MESS.x - 1.5, z: -10.1 }, { x: MESS.x - 1.5, z: -11.3 }, { x: MESS.x, z: -12.35 }],
  stove: { x: 0, z: -16.5 },
  pot: { x: 0, z: -16.5 },
  supplies: { x: supplyX, z: supplyZ },
  counter: { x: 2.9, z: -14.55 },
  mainMast: { x: MASTS.main.x, z: MASTS.main.z },
  foreMast: { x: MASTS.fore.x, z: MASTS.fore.z },
  mizzenMast: { x: MASTS.mizzen.x, z: MASTS.mizzen.z },
  table: { x: 2.6, z: -7.05 },
  shelf: { x: HOLD.x0 + HOLD_SHELF.width / 2, z: -7.9 },
  box: { x: 3.45, z: -3.45 },
  door: { x: -2.85, z: HOLD.z0 + HOLD_DOOR.depth / 2 },
  fishing: { x: 0.45, z: 17.3 },
} as const;

/** The supply crates in the galley, each with its food (the cook's job). */
export const SUPPLY_CRATES = ([
  { food: "fish", color: "#5a7ea0" },
  { food: "meat", color: "#a8433a" },
  { food: "apples", color: "#e83a35" },
  { food: "bananas", color: "#ffd23f" },
] as const).map(({ food, color }, i, crates) => {
  const run = (i - (crates.length - 1) / 2) * SUPPLY_PITCH;
  return { food, color, yaw: SUPPLY_YAW, x: supplyX + Math.sin(SUPPLY_YAW) * run, z: supplyZ + Math.cos(SUPPLY_YAW) * run };
});
export const crateApproach = (crate: typeof SUPPLY_CRATES[number], d = 1.15) => ({
  x: crate.x + Math.cos(crate.yaw) * d, z: crate.z - Math.sin(crate.yaw) * d,
});
export const COUNTER_CUSTOMER = { x: SPOT.counter.x, z: SPOT.counter.z + COUNTER_SIZE.depth / 2 + 0.43 };
/** The fish bucket on the fishing deck (clear of the stairs' landing). */
export const BUCKET = { x: -3.6, z: 15.9 };
/** Cannons along both rails and barrels against the bulwarks: solid, clear of every walking line. */
export const CANNONS = [-1, 1].flatMap((s) => [-5.5, 0.5, 6].map((z) => ({ x: s * (HALF_BEAM - 0.55), z, side: s })));
export const DECK_BARRELS = [{ x: -(HALF_BEAM - 0.6), z: -11.5 }, { x: -(HALF_BEAM - 0.6), z: 9.5 }, { x: HALF_BEAM - 0.6, z: 9.8 }];

const around = (c: { x: number }, hx: number, z0: number, z1: number): Box => ({ x0: c.x - hx, x1: c.x + hx, z0, z1 });
const H = HOLD, HR = HOLD_RAMP, SR = STERN_RAMP;
const lerp = (a: number, b: number, k: number) => a + (b - a) * Math.max(0, Math.min(1, k));

/** Fit horizontal treads about a continuous slope with flat landings at both ends. */
export function stairSteps(ramp: Box, yTop: number, yBottom: number, topEdge: "z0" | "z1") {
  const landing = 0.25;
  const slopeStart = ramp.z0 + landing, slopeEnd = ramp.z1 - landing;
  const y0 = topEdge === "z0" ? yTop : yBottom;
  const y1 = topEdge === "z0" ? yBottom : yTop;
  // At each riser the walking height is halfway between the two tread tops.
  const rises = Math.ceil((yTop - yBottom) / 0.12);
  const going = (slopeEnd - slopeStart) / rises;
  const steps = Array.from({ length: rises + 1 }, (_, i) => ({
    z0: i === 0 ? ramp.z0 : slopeStart + (i - 0.5) * going,
    z1: i === rises ? ramp.z1 : slopeStart + (i + 0.5) * going,
    y: lerp(y0, y1, i / rises),
  }));
  return { steps, slopeStart, slopeEnd, floorY: (z: number) => lerp(y0, y1, (z - slopeStart) / (slopeEnd - slopeStart)) };
}

export const HOLD_STAIRS = stairSteps(HR, DECK_Y, HOLD_Y, "z1");
export const STERN_STAIRS = stairSteps(SR, DECK_Y, FISH_Y, "z0");
/** The fishing platform itself extends forward through the stairs' bottom landing. */
export const FISH_LANDING_Z = STERN_STAIRS.steps[STERN_STAIRS.steps.length - 1].z0;

const HATCH_GUARD = 0.25;
export const HOLD_HATCH_GUARDS: Box[] = [
  { x0: HR.x0 - HATCH_GUARD, x1: HR.x0, z0: HR.z0 - HATCH_GUARD, z1: HR.z1 },
  { x0: HR.x1, x1: HR.x1 + HATCH_GUARD, z0: HR.z0 - HATCH_GUARD, z1: HR.z1 },
  { x0: HR.x0, x1: HR.x1, z0: HR.z0 - HATCH_GUARD, z1: HR.z0 },
];

/** Two overlapping walking surfaces share the stairs. The portal is inside their opening. */
export const HOLD_PORTAL = { enterZ: HR.z0 + 0.72, exitZ: HR.z0 + 1.22 };

const SUPPLY_ROW_HALF = ((SUPPLY_CRATES.length - 1) * SUPPLY_PITCH + SUPPLY_SIZE.depth) / 2;
const signOffset = SUPPLY_SIZE.signDepth / 2;
const supplySolidCenter = { x: supplyX + Math.cos(SUPPLY_YAW) * signOffset, z: supplyZ - Math.sin(SUPPLY_YAW) * signOffset };
export const SUPPLY_SOLID: Box = {
  ...around(supplySolidCenter, SUPPLY_SIZE.width / 2 + signOffset, supplySolidCenter.z - SUPPLY_ROW_HALF, supplySolidCenter.z + SUPPLY_ROW_HALF),
  yaw: SUPPLY_YAW,
};
export const COUNTER_SOLID = around(SPOT.counter, COUNTER_SIZE.width / 2,
  SPOT.counter.z - COUNTER_SIZE.depth / 2, SPOT.counter.z + COUNTER_SIZE.depth / 2);
export const STOVE_SOLID = around(SPOT.stove, 0.7, -17.2, -15.8);

/** Solid bands and furniture (local boxes). */
export const SHIP_SOLIDS: Box[] = [
  ...HOLD_HATCH_GUARDS,
  // The transom either side of the stern stairs.
  { x0: -HALF_BEAM, x1: SR.x0, z0: STERN_Z, z1: SR.z1 },
  { x0: SR.x1, x1: HALF_BEAM, z0: STERN_Z, z1: SR.z1 },
  // Galley fittings: the stove, supplies and counter.
  STOVE_SOLID,
  SUPPLY_SOLID,
  COUNTER_SOLID,
  // The mess table on the main deck, and the fishing deck's bucket (clear of the stairs' landing).
  around(MESS, 0.9, -11.8, -9.2),
  around(BUCKET, 0.3, 15.6, 16.2),
  // The cannons' carriages.
  ...CANNONS.map((c) => around(c, 0.3, c.z - 0.38, c.z + 0.38)),
];

export const HOLD_BARRELS = [{ x: H.x1 - 0.43, z: H.z0 + 0.47 }, { x: H.x1 - 0.43, z: H.z1 - 0.44 }];
const furnitureBox = (c: { x: number; z: number }, { width, depth }: { width: number; depth: number }) =>
  around(c, width / 2, c.z - depth / 2, c.z + depth / 2);
export const HOLD_SOLIDS: Box[] = [
  furnitureBox(SPOT.table, HOLD_TABLE),
  furnitureBox(SPOT.shelf, HOLD_SHELF),
  furnitureBox(SPOT.box, HOLD_BOX),
  furnitureBox(SPOT.door, HOLD_DOOR),
  ...HOLD_BARRELS.map((p) => around(p, 0.33, p.z - 0.33, p.z + 0.33)),
];
const HOLD_STAIR_SIDES = HOLD_HATCH_GUARDS.slice(0, 2).map((b) => ({ ...b, z0: HR.z0 }));
const HOLD_COLLIDERS = [...HOLD_SOLIDS, ...HOLD_STAIR_SIDES];

/** Round solids: masts, the helm and the deck barrels. */
export const SHIP_POSTS: Post[] = [
  { ...SPOT.mainMast, r: 0.45 }, { ...SPOT.foreMast, r: 0.4 }, { ...SPOT.mizzenMast, r: 0.35 }, { ...SPOT.helm, r: 0.55 },
  ...DECK_BARRELS.map((b) => ({ ...b, r: 0.32 })),
];

const inBox = (b: Box, lx: number, lz: number) => lx >= b.x0 && lx <= b.x1 && lz >= b.z0 && lz <= b.z1;
export function touches(b: Box, lx: number, lz: number, m: number): boolean {
  if (b.yaw) {
    const x = (b.x0 + b.x1) / 2, z = (b.z0 + b.z1) / 2;
    const dx = lx - x, dz = lz - z;
    const cos = Math.cos(b.yaw), sin = Math.sin(b.yaw);
    lx = x + dx * cos - dz * sin;
    lz = z + dx * sin + dz * cos;
  }
  return lx > b.x0 - m && lx < b.x1 + m && lz > b.z0 - m && lz < b.z1 + m;
}

export function holdLayerAt(lx: number, lz: number, below: boolean): boolean {
  if (inBox(HR, lx, lz)) return below ? lz < HOLD_PORTAL.exitZ : lz <= HOLD_PORTAL.enterZ;
  return below && inBox(H, lx, lz);
}

// The ship's collision entry points share the live traversal floor. Static
// callers can ask for either floor explicitly, including when both overlap.
let occupiedHold = false;
export function setShipHoldOccupancy(below: boolean) {
  occupiedHold = below;
}

/** The ship's bounding area: inside it, the ship alone decides walking and heights. */
export function inShipArea(x: number, z: number): boolean {
  const lx = x - SHIP.x, lz = z - SHIP.z;
  return Math.abs(lx) < HALF_BEAM + 1.75 && lz > BOW_Z - 2 && lz < 21;
}

/** The floor height under a local point, or null over the sea. */
export function shipFloorY(lx: number, lz: number, below = false): number | null {
  if (inBox(HOLD_RAMP, lx, lz)) return HOLD_STAIRS.floorY(lz);
  if (below) return inBox(HOLD, lx, lz) ? HOLD_Y : null;
  if (inBox(STERN_RAMP, lx, lz)) return STERN_STAIRS.floorY(lz);
  if (inBox(FISH_DECK, lx, lz)) return FISH_Y;
  if (lz >= BOW_Z && lz <= STERN_Z && Math.abs(lx) <= hullHalf(lz) - RAIL) return DECK_Y;
  return null;
}

/** A solid overlaps the circle (world coordinates). */
export function shipSolidAt(x: number, z: number, r: number, below = occupiedHold): boolean {
  const lx = x - SHIP.x, lz = z - SHIP.z;
  if (below) {
    for (let i = 0; i < HOLD_COLLIDERS.length; i++) if (touches(HOLD_COLLIDERS[i], lx, lz, r)) return true;
    return Math.hypot(lx - HOLD_PILLAR.x, lz - HOLD_PILLAR.z) < HOLD_PILLAR.r + r;
  }
  return SHIP_SOLIDS.some((b) => touches(b, lx, lz, r)) || SHIP_POSTS.some((p) => Math.hypot(lx - p.x, lz - p.z) < p.r + r);
}

/** The room floor, including the bottom landing, beneath a world position. */
export const onHoldFloor = (x: number, z: number) => shipFloorY(x - SHIP.x, z - SHIP.z, true) === HOLD_Y;

const RING = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];

/** Floor all round the circle and no solid in it (world coordinates). */
export function shipWalkable(x: number, z: number, m = 0, below = occupiedHold): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  const lx = x - SHIP.x, lz = z - SHIP.z;
  if (shipFloorY(lx, lz, below) === null) return false;
  if (m > 0 && RING.some(([dx, dz]) => shipFloorY(lx + dx * m, lz + dz * m, below) === null)) return false;
  return !shipSolidAt(x, z, m, below);
}

/** Validate a saved hold position independently of the occupied layer. */
export function holdSavePosition(x: number, z: number, radius: number): { x: number; z: number } {
  return onHoldFloor(x, z) && shipWalkable(x, z, radius, true) ? { x, z } : shipWorld(HOLD_ENTRY);
}

/** Standing height on the ship (world coordinates); the sea between decks. */
export function shipStandY(x: number, z: number, below = occupiedHold): number {
  return shipFloorY(x - SHIP.x, z - SHIP.z, below) ?? SEA_Y;
}

/** Local → world. */
export const shipWorld = (p: { x: number; z: number }) => ({ x: SHIP.x + p.x, z: SHIP.z + p.z });
