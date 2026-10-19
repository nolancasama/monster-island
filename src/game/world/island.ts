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
  { id: "fish", food: "fish", x: FISH_BASKET.x, z: FISH_BASKET.z, regrow: 4 }
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
