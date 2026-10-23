import type { FoodId, Vec2 } from "../types";

/**
 * The handcrafted beach (Phase 1). +x is east, +z is south toward the sea.
 * The beach runs west → east in three parts, each opened by a monster:
 *
 *   West beach (camp, apple grove)  |rocks + fallen palm|  East beach (pier, Bubbo)  |river|  Far bank (Monster Stone)
 *
 * Heights and the shoreline are functions so the ground mesh, the player,
 * the monsters and every object agree.
 */

export const SEA_Y = -0.42;
export const RIVER_Y = -0.3;

/** Where dry sand meets the sea (z of the waterline) at a given x. */
export function shoreZ(x: number): number {
  return 10.5 + 1.3 * Math.sin(x * 0.12 + 0.5) + 0.6 * Math.sin(x * 0.29 + 1.7);
}

/** North edge of the walkable beach (the jungle wall begins beyond it). */
export const Z_NORTH = -9;
export const X_WEST = -35;
export const X_EAST = 39;
/** How far the player may wade into the sea. */
export const WADE = 0.7;

/** The rock ridge with its narrow pass. The fallen palm lies across the pass. */
export const RIDGE = { x0: -3.4, x1: 1.4 };
export const PASS = { z0: -1.2, z1: 3.6 };
export const FALLEN_PALM = { x: -1, z: 1.2, len: 6.2 };

/** The river from the jungle to the sea. */
export const RIVER = { x0: 21.5, x1: 27.5 };
/** Where Bubbo ferries the player and the stepping stones rise. */
export const CROSSING = { z: -1, west: { x: 20.6, z: -1 }, east: { x: 28.4, z: -1 }, half: 1.05 };
export const STEPPING_STONES: Vec2[] = [
  { x: 22.4, z: -1.1 },
  { x: 23.9, z: -0.8 },
  { x: 25.3, z: -1.15 },
  { x: 26.7, z: -0.9 }
];

const smooth = (t: number) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

/** Distance into the river channel (positive inside, metres from the nearest bank). */
export function riverDepth(x: number): number {
  return Math.min(x - RIVER.x0, RIVER.x1 - x);
}

export function inRiver(x: number, z: number, margin = 0): boolean {
  return riverDepth(x) > margin && z < shoreZ(x) + 6;
}

export function groundY(x: number, z: number): number {
  const d = z - shoreZ(x);
  const inland = 0.35;
  let y: number;
  if (d < 0) y = inland + (SEA_Y - 0.1 - inland) * smooth((d + 7) / 7);
  else y = Math.max(-3, SEA_Y - 0.1 - d * 0.25);
  // Gentle dunes inland, rising toward the jungle.
  const dunes = 0.14 * Math.sin(x * 0.23 + z * 0.11) + 0.08 * Math.sin(x * 0.07 - z * 0.31 + 1.3);
  y += dunes * (1 - smooth((d + 9) / 6));
  if (z < Z_NORTH + 2) y += (Z_NORTH + 2 - z) * 0.22;
  // The forest floor replaces the jungle slope where the forest is open land.
  const f = forestMask(x, z);
  if (f > 0) y = y * (1 - f) + forestFloor(x, z) * f;
  // The river channel.
  const r = riverDepth(x);
  if (r > -0.2) {
    const t = smooth((r + 0.2) / 1.3);
    y = y * (1 - t) - 1.05 * t;
  }
  return y;
}

// ------------------------------------------------------------------ places

export const SPAWN = { x: -23.5, z: 2.2, yaw: Math.PI / 2 };
export const MAPLE = { x: -26.2, z: 0.4, yaw: 1.2 };
export const CAMP = { tent: { x: -29.5, z: -3.6 }, table: { x: -25.6, z: -2.2 }, fire: { x: -24.6, z: 4.6 } };
export const APPLE_TREES: Vec2[] = [
  { x: -18.2, z: -6.6 },
  { x: -12.6, z: -6.9 }
];
export const BANANA_PLANT = { x: -32.2, z: 1.6 };
export const BERRY_BUSH = { x: -7.6, z: -5.6 };
export const PIER = { x: 13, z0: 7.2, z1: 13.5 };
export const FISH_BASKET = { x: 13.6, z: 6.4 };
export const MONSTER_STONE = { x: 33.6, z: -3.2 };
export const FOREST_SIGN = { x: 31, z: -7.6 };

// ------------------------------------------------------------------ forest (Phase 2)
//
//   far bank → path (bramble until the Phase 1 ending) → glade → |ravine + bridge| → hills (Puff) → |cliff + rope| → cliff top
//
// The forest lies north of the far bank, east of the river.

/** The bramble that closes the forest path until the Phase 1 ending. */
export const BRAMBLE = { x: 33.8, z: -10.4 };
export const FOREST_PATH = { x0: 32.1, x1: 35.5, z0: -17.5, z1: -8 };
export const GLADE = { x0: 29, x1: 46, z0: -25, z1: -16.5 };
/** The ravine across the whole forest; the bridge spans it. */
export const RAVINE = { z0: -28.4, z1: -24.6 };
export const BRIDGE = { x: 37, half: 0.85, z0: RAVINE.z0 - 0.4, z1: RAVINE.z1 + 0.4 };
export const HILLS = { x0: 29, x1: 47, z0: -45, z1: -27.6 };
export const PUFF_TREE = { x: 41.5, z: -36.5 };
/** Puff's nest on the tree's south branch (height above the ground). */
export const PUFF_PERCH = { x: PUFF_TREE.x + 0.36, z: PUFF_TREE.z + 1.42, y: 2.45 };
export const FOREST_BERRY_BUSHES: Vec2[] = [
  { x: 38.2, z: -37.4 },
  { x: 44.6, z: -33.2 }
];
/** Big forest trees standing in the open land (solid). */
export const FOREST_TREES: Array<Vec2 & { s: number }> = [
  { x: 34.2, z: -19.6, s: 1.15 },
  { x: 42.6, z: -20.8, s: 1.3 },
  { x: 30.6, z: -22.8, s: 1 },
  { x: 45, z: -17.8, s: 1.1 },
  { x: 32, z: -31.2, s: 1.2 },
  { x: 46, z: -29.6, s: 1 },
  { x: 39.2, z: -42.4, s: 1.25 },
  { x: 45.4, z: -41.8, s: 1.1 },
  { x: 30.4, z: -37.8, s: 1 }
];
/** The high cliff at the north edge of the hills; the rope hangs at ROPE. */
export const CLIFF_Z = -45.4;
export const ROPE = { x: 34, z: CLIFF_Z + 0.9 };
export const CLIFF_HEIGHT = 6.5;
/** The cliff top (reached only by the rope). */
export const CLIFF_TOP = { x0: 29.5, x1: 40, z0: -52, z1: CLIFF_Z - 0.6 };
export const CLIFF_TOP_SPOT = { x: 34, z: CLIFF_Z - 2.2 };
/** Far away to the north-east: where Phase 3 goes. */
export const VOLCANO = { x: 70, z: -112 };

type Area = { x0: number; x1: number; z0: number; z1: number };
/** Open forest land (the bridge deck is not ground). */
export const FOREST_AREAS: Area[] = [FOREST_PATH, GLADE, HILLS, CLIFF_TOP];

const outside = (x: number, z: number, b: Area) => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1));

/** 1 on open forest land, fading to 0 three metres into the jungle around it. */
export function forestMask(x: number, z: number): number {
  if (z > -4 || x < 24 || x > 52) return 0;
  let d = Infinity;
  for (const a of FOREST_AREAS) d = Math.min(d, outside(x, z, a));
  // The ravine walls run the whole width of the forest.
  if (z < RAVINE.z1 + 1 && z > RAVINE.z0 - 1 && x > GLADE.x0 && x < GLADE.x1) d = 0;
  return 1 - smooth(d / 3);
}

/** Depth carved by the ravine (0 outside it). */
export function ravineDepth(z: number): number {
  const r = Math.min(z - RAVINE.z0, RAVINE.z1 - z);
  return r > -0.4 ? 3.4 * smooth((r + 0.4) / 1.3) : 0;
}

export function inRavine(z: number, margin = 0): boolean {
  return z > RAVINE.z0 - margin && z < RAVINE.z1 + margin;
}

/** The forest floor without the ravine (the bridge deck sits at this height). */
export function forestBase(x: number, z: number): number {
  const climb = 0.8 + Math.max(0, -9 - z) * 0.05;
  const hills = smooth((RAVINE.z0 - z) / 4) * (0.45 * Math.sin(x * 0.35 + 1.1) * Math.sin(z * 0.3) + 0.35 * Math.sin(x * 0.13 - z * 0.21));
  const bumps = 0.12 * Math.sin(x * 0.5 + z * 0.37) + 0.08 * Math.sin(x * 0.21 - z * 0.6);
  const top = CLIFF_HEIGHT * smooth((CLIFF_Z - z) / 0.9);
  return climb + hills + bumps + top;
}

export function forestFloor(x: number, z: number): number {
  return forestBase(x, z) - ravineDepth(z);
}

export interface FoodSource {
  id: string;
  food: FoodId;
  x: number;
  z: number;
  /** Seconds before it can be picked again. */
  regrow: number;
}

/** Where food is picked up (instant: English is spent on monsters, not chores). */
export const FOOD_SOURCES: FoodSource[] = [
  { id: "apple1", food: "apples", x: -17.4, z: -5.3, regrow: 6 },
  { id: "apple2", food: "apples", x: -12.1, z: -5.6, regrow: 6 },
  { id: "banana", food: "bananas", x: -31.4, z: 2.6, regrow: 6 },
  { id: "berry", food: "berries", x: -7.4, z: -4.3, regrow: 6 },
  { id: "fish", food: "fish", x: FISH_BASKET.x, z: FISH_BASKET.z, regrow: 4 },
  { id: "berry2", food: "berries", x: 38.2, z: -36.2, regrow: 6 },
  { id: "berry3", food: "berries", x: 44.6, z: -32, regrow: 6 }
];

export const INTERACT_RANGE = 2.2;

// ------------------------------------------------------------------ scenery

export interface Palm {
  x: number;
  z: number;
  height: number;
  lean: number;
  dir: number;
  coconuts: boolean;
}

export interface Boulder {
  x: number;
  z: number;
  r: number;
  h: number;
  rot: number;
}

export const PALMS: Palm[] = [
  { x: -33, z: -5, height: 6.2, lean: 0.18, dir: 0.6, coconuts: true },
  { x: -27.5, z: -7.4, height: 7, lean: 0.12, dir: 2.6, coconuts: false },
  { x: -21.5, z: 6.4, height: 5.6, lean: 0.3, dir: 2.9, coconuts: true },
  { x: -9.6, z: 6.8, height: 6, lean: 0.28, dir: 2.6, coconuts: true },
  { x: -6, z: -7.6, height: 6.6, lean: 0.16, dir: 0.4, coconuts: false },
  { x: 4.6, z: -7.2, height: 6.8, lean: 0.14, dir: 0.9, coconuts: true },
  { x: 8.5, z: 7.4, height: 5.4, lean: 0.32, dir: 3.1, coconuts: false },
  { x: 18.6, z: -7.4, height: 6.4, lean: 0.2, dir: -0.6, coconuts: true },
  { x: 30.4, z: 5.6, height: 5.8, lean: 0.26, dir: 2.7, coconuts: true },
  { x: 37.2, z: -6, height: 6.6, lean: 0.15, dir: 0.4, coconuts: false }
];

/** The ridge: two rock masses with the pass between them, plus beach boulders. */
export const BOULDERS: Boulder[] = [
  // North of the pass, up to the jungle.
  { x: -1, z: -3.6, r: 2.4, h: 3.6, rot: 0.3 },
  { x: -1.4, z: -7.2, r: 2.8, h: 4.4, rot: 1.1 },
  { x: 0.4, z: -10.6, r: 3, h: 4.8, rot: 2.2 },
  // South of the pass, out into the sea.
  { x: -0.8, z: 6, r: 2.4, h: 3.4, rot: 0.8 },
  { x: -1.2, z: 9.4, r: 2.6, h: 3, rot: 2 },
  { x: -0.2, z: 12.8, r: 2.6, h: 2.4, rot: 0.5 },
  // Scattered.
  { x: -19.5, z: 8.6, r: 0.9, h: 0.8, rot: 0.2 },
  { x: 6.4, z: -4.6, r: 1, h: 1, rot: 1.4 },
  { x: 35.6, z: 4.2, r: 1.1, h: 1.1, rot: 0.6 },
  { x: 19.2, z: 8.8, r: 0.8, h: 0.7, rot: 2.4 }
];
