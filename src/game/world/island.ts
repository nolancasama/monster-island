import type { FoodId, Vec2 } from "../types";
import { makeRng } from "../logic/rng";
import { basinFraction, lowlandY } from "./lowland";
import { region } from "./region";
import { cloudY } from "./cloudisle";

/** Scene placements and their small, ground-plane collision proxies share one transform. */
export interface Placement { x: number; z: number; yaw?: number; scale?: number }
export type SolidShape =
  | { kind: "circle"; x: number; z: number; r: number }
  | { kind: "box"; x: number; z: number; hx: number; hz: number; yaw: number }
  | { kind: "capsule"; ax: number; az: number; bx: number; bz: number; r: number };

export function solidAt(p: Placement, shape: SolidShape): SolidShape {
  const s = p.scale ?? 1;
  const yaw = p.yaw ?? 0;
  const c = Math.cos(yaw), n = Math.sin(yaw);
  const x = (lx: number, lz: number) => p.x + (lx * c + lz * n) * s;
  const z = (lx: number, lz: number) => p.z + (-lx * n + lz * c) * s;
  if (shape.kind === "capsule") return { kind: "capsule", ax: x(shape.ax, shape.az), az: z(shape.ax, shape.az), bx: x(shape.bx, shape.bz), bz: z(shape.bx, shape.bz), r: shape.r * s };
  if (shape.kind === "circle") return { kind: "circle", x: x(shape.x, shape.z), z: z(shape.x, shape.z), r: shape.r * s };
  return { kind: "box", x: x(shape.x, shape.z), z: z(shape.x, shape.z), hx: shape.hx * s, hz: shape.hz * s, yaw: shape.yaw + yaw };
}

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
  if (region.world === "cloud") return cloudY(x, z);
  const d = z - shoreZ(x);
  const inland = 0.35;
  let y: number;
  if (d < 0) y = inland + (SEA_Y - 0.1 - inland) * smooth((d + 7) / 7);
  else y = Math.max(-3, SEA_Y - 0.1 - d * 0.25);
  // Gentle dunes inland, rising toward the jungle.
  const dunes = 0.14 * Math.sin(x * 0.23 + z * 0.11) + 0.08 * Math.sin(x * 0.07 - z * 0.31 + 1.3);
  y += dunes * (1 - smooth((d + 9) / 6));
  if (z < Z_NORTH + 2) y += (Z_NORTH + 2 - z) * 0.22;
  // North of the cliff the jungle slope becomes the island's north: the
  // plateau, the volcano, the ridge over the tunnel and the coasts.
  if (z < -50) y += (massifY(x, z) - y) * smooth((-50 - z) / 6);
  else if (x > 60) y += (massifY(x, z) - y) * smooth((x - 60) / 10) * smooth((-z - 8) / 8);
  // The forest floor replaces the jungle slope where the forest is open land.
  const f = forestMask(x, z);
  if (f > 0) y = y * (1 - f) + forestFloor(x, z) * f;
  const v = volcanoMask(x, z);
  if (v > 0) y = y * (1 - v) + volcanoFloor(x, z) * v;
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
export const CAMP = { tent: { x: -29.5, z: -3.6, yaw: 0.5 }, table: { x: -25.6, z: -2.2, yaw: 0.3 }, fire: { x: -24.6, z: 4.6 }, flag: { x: -27.1, z: -2 } };
export const TENT_SIZE = { width: 3.2, depth: 2.8, height: 2.2 };
export const TABLE_SIZE = { width: 1.7, depth: 0.95 };
export const CAMP_CRATE = { x: 1.4, z: -0.1, yaw: 0.3, width: 0.7, depth: 0.6 };
export const CAMP_BENCH = { x: -1.4, z: 0.2, yaw: 0.5, length: 1.5, radius: 0.18 };
export const DRIFTWOOD = [
  { x: 6, z: 8.4, yaw: 0.4, length: 1.8, radius: 0.13, y: 0.12, color: "#b29676" },
  { x: -15, z: 8.2, yaw: -0.7, length: 1.4, radius: 0.11, y: 0.1, color: "#a68a6a" }
];
export const APPLE_TREES: Vec2[] = [
  { x: -18.2, z: -6.6 },
  { x: -12.6, z: -6.9 }
];
export const BANANA_PLANT = { x: -32.2, z: 1.6 };
export const BERRY_BUSH = { x: -7.6, z: -5.6 };
export const PIER = { x: 13, z0: 7.2, z1: 13.5, half: 0.9, deckY: 0.26, postRadius: 0.09, postOffset: 0.85, postSpacing: 2, postStart: 0.5 };
export const PIER_POSTS: Vec2[] = [];
for (let z = PIER.z0 + PIER.postStart; z < PIER.z1; z += PIER.postSpacing) {
  for (const side of [-1, 1]) PIER_POSTS.push({ x: PIER.x + side * PIER.postOffset, z });
}
export const FISH_BASKET = { x: 13.6, z: 6.4 };
export const MONSTER_STONE = { x: 33.6, z: -3.2, yaw: 0.25 };
export const FOREST_SIGN = { x: 31, z: -7.6, yaw: 0.2 };
/** Sign layout in the sign's own frame: the board faces +z, the post stands behind it. */
export const SIGN_SIZE = { boardX: 0.35, boardW: 1.5, boardD: 0.08, postZ: -0.12, postR: 0.08 };
export const CROSSING_POSTS = [
  { x: CROSSING.west.x - 0.5, z: CROSSING.west.z - 1.6 },
  { x: CROSSING.east.x + 0.5, z: CROSSING.east.z - 1.6 }
];
export const CROSSING_POST_SIZE = { radius: 0.1, spacing: 1.4 };

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
export const FOREST_TREE_PLACEMENTS = FOREST_TREES.map((t, i) => ({ ...t, scale: t.s, yaw: i * 1.3, tint: 0.92 + (i % 3) * 0.05 }));
/** The high cliff at the north edge of the hills; the rope hangs at ROPE. */
export const CLIFF_Z = -45.4;
export const ROPE = { x: 34, z: CLIFF_Z + 0.9 };
export const CLIFF_HEIGHT = 6.5;
export const CLIFF_WALL = { x: 24, z: CLIFF_Z - 0.5, length: 26, depth: 1.2 };
/** The cliff top (reached only by the rope). */
export const CLIFF_TOP = { x0: 29.5, x1: 40, z0: -52, z1: CLIFF_Z - 0.6 };
export const CLIFF_TOP_SPOT = { x: 34, z: CLIFF_Z - 2.2 };
/** The wooden stake the rope is tied to, driven into the cliff top behind the lip. */
export const ROPE_STAKE = { x: ROPE.x, z: CLIFF_Z - 1.3, r: 0.1 };
/** The volcano's crater, east of Ember's slope; the cave runs under its west flank. */
export const VOLCANO = { x: 78, z: -104 };

/** The lava spans the only exit from the cliff top. */
export const LAVA = { x: 34.5, z: -51.3, x0: 29.5, x1: 40, z0: -52.5, z1: -50.6 };
export const CAVE = { x: 64, z: -102 };
/** The lit tunnel under the volcano: its walls' inner faces, its mouth (z1) and its far end (z0), and the roof height above the floor. */
export const TUNNEL = { x: CAVE.x, half: 3, z1: CAVE.z, z0: -125, roof: 4.2 };
export const MEAT_RACK = { x: 55, z: -90 };
export const VOLCANO_PATH = [
  { x0: 31.5, x1: 40, z0: -63, z1: -50 },
  { x0: 36, x1: 47, z0: -74, z1: -59 },
  { x0: 43, x1: 55, z0: -86, z1: -70 }
];
export const EMBER_SLOPE = { x0: 49, x1: 68, z0: -102, z1: -82 };
/** The tunnel runs straight from the mouth into the courtyard in front of the gate. */
export const CAVE_PASSAGE = { x0: 61, x1: 67, z0: -127, z1: -99 };
export const SANCTUARY = { x0: 57, x1: 83, z0: -149, z1: -125.4 };
/** The garden south of the gate: a bowl inside its ring of rim rocks (the box's corners lie outside the ring). */
export const GARDEN = { x: 70, z: -136, r: 10.8 };
/** The courtyard between the tunnel and the gate. */
export const COURTYARD = { x0: 57, x1: 83, z0: -133.5, z1: -125.4 };
export const SANCTUARY_GATE = { x: 70, z: -133, half: 2.2 };
export const GATE_PILLARS = {
  gateLeaf: { x: 60, z: -130 },
  gateDrop: { x: 65, z: -130 },
  gateWing: { x: 75, z: -130 },
  gateFlame: { x: 80, z: -130 }
};
export const PHASE3_AREAS = [...VOLCANO_PATH, EMBER_SLOPE, CAVE_PASSAGE, SANCTUARY];

/** Flat cave and garden, reached by a gentle rising rock trail. */
export function volcanoFloor(x: number, z: number): number {
  const climb = smooth((-z - 51) / 48);
  const base = forestBase(34.5, -51);
  return base + climb * 8 + Math.sin(x * 0.3 + z * 0.17) * 0.08;
}

/** Walkable-looking ground: the trail, Ember's slope, the tunnel, the courtyard and the round garden. */
const VOLCANO_FLOORS: Area[] = [...VOLCANO_PATH, EMBER_SLOPE, CAVE_PASSAGE, COURTYARD];

/**
 * Act 2: the lookout ledge through a gap in the garden's north-east rim, at
 * the garden's height. Its north edge is the cliff's lip: the floor stops
 * there sharply (no fade), and the lowland lies 14 m below.
 */
export const LEDGE = { x0: 72.5, x1: 79, z0: -151.2, z1: -143 };

export const EARLY_OVERLOOK = { x0: 79, x1: 90, z0: -131.6, z1: -126 };

export function volcanoMask(x: number, z: number): number {
  if (z > -48 || z < -154 || x < 27 || x > 93) return 0;
  let d = Math.max(0, Math.hypot(x - GARDEN.x, z - GARDEN.z) - GARDEN.r);
  for (const a of VOLCANO_FLOORS) d = Math.min(d, outside(x, z, a));
  d = Math.min(d, outside(x,z,EARLY_OVERLOOK));
  if (z >= LEDGE.z0) d = Math.min(d, outside(x, z, LEDGE));
  return 1 - smooth(d / 3);
}

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

// ------------------------------------------------------------------ the island's north (Phase 3 backdrop)
//
// Beyond the cliff top the island is one landmass: a jungle plateau that
// rises from the forest, the volcano cone to the east of Ember's slope, a
// rock ridge over the tunnel, the sanctuary on a high shelf, and rocky slopes
// down to the sea on every side. It is scenery only: walking is decided by
// the boxes above, and walkable land is drawn by its own floor (the masks in
// groundY give the floor there).

/** The volcano cone: rim radius and height, crater floor, and where its foot meets the sea. */
export const VOLCANO_CONE = { rim: 6.5, top: 45, crater: 39, foot: 40.5 };

/** Height of the volcano's cone at distance r from its centre. */
export function coneY(r: number): number {
  const c = VOLCANO_CONE;
  if (r < c.rim) return c.crater + (c.top - c.crater) * (r / c.rim) ** 2;
  const t = Math.max(0, 1 - (r - c.rim) / (c.foot - c.rim));
  return -4 + (c.top + 4) * t ** 1.6;
}

/** Soft land fraction: 1 inside the island's outline, 0 a little way out to sea. */
function landFraction(x: number, z: number): number {
  const wobble = 2.5 * Math.sin(x * 0.13 + 1.1) * Math.sin(z * 0.11 - 0.4) + 1.5 * Math.sin(x * 0.31 - z * 0.23);
  // West jungle (behind the beach and the forest), to a north coast.
  const west = Math.max(x - 36, -z - (98 + 5 * Math.sin(x * 0.11)));
  // East jungle beside the forest.
  const east = Math.max(x - 88, -z - 70);
  // The north lobe around the volcano and the sanctuary.
  const lobe = (Math.hypot((x - 74) / 46, (z + 112) / 50) - 1) * 47;
  const d = Math.min(west, east, lobe) + wobble;
  return 1 - smooth(d / 14);
}

/** Over the tunnel, the top of the rock ridge (the walkable floor below is the tunnel's); null elsewhere. */
export function tunnelCoverY(x: number, z: number): number | null {
  if (Math.abs(x - TUNNEL.x) > 5.01 || z > TUNNEL.z1 + 0.01 || z < TUNNEL.z0 + 0.99) return null;
  return massifY(x, z);
}

/** Inside the tunnel's lined passage (under its roof). */
export function inTunnel(x: number, z: number, margin = 0): boolean {
  return Math.abs(x - TUNNEL.x) < TUNNEL.half - margin && z < TUNNEL.z1 + margin && z > TUNNEL.z0 - margin;
}

/** Background height north of the cliff (z < -50), before walkable floors are blended in. */
export function massifY(x: number, z: number): number {
  // The jungle plateau: the old rising slope, levelling at 17 m, then
  // stepping down north of the cave so the sanctuary stands on a shelf.
  const plateau = Math.min(0.35 + 0.22 * (-7 - z), 17.1) - 0.25 * Math.max(0, -97 - z);
  const bumps = 0.7 * Math.sin(x * 0.21 + z * 0.17) + 0.45 * Math.sin(x * 0.47 - z * 0.33 + 2);
  const land = landFraction(x, z);
  let y = (plateau + bumps) * land - 4 * (1 - land);
  // A rock ridge carries the tunnel from Ember's slope to the sanctuary.
  const along = Math.max(TUNNEL.z0 - 2 - z, 0, z - TUNNEL.z1);
  const across = Math.abs(x - TUNNEL.x);
  const ridge = volcanoFloor(TUNNEL.x, TUNNEL.z1) + TUNNEL.roof + 2.6 - 0.75 * Math.max(0, across - 3.5) - 1.2 * along;
  y = Math.max(y, ridge);
  y = Math.max(y, coneY(Math.hypot(x - VOLCANO.x, z - VOLCANO.z)));
  // North of the sanctuary's shelf the island continues as the Act 2 lowland.
  const basin = basinFraction(x, z);
  return basin > 0 ? y + (lowlandY(x, z) - y) * basin : y;
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
  { id: "berry3", food: "berries", x: 44.6, z: -32, regrow: 6 },
  { id: "meat", food: "meat", x: MEAT_RACK.x, z: MEAT_RACK.z + 0.8, regrow: 6 }
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

/** The deterministic rock records are consumed by both the merged mesh and collision. */
export interface VolcanoRock extends Vec2 { r: number; h: number; seed: number }
export const VOLCANO_ROCKS: VolcanoRock[] = (() => {
  const rand = makeRng(395);
  const rocks: VolcanoRock[] = [];
  const add = (x: number, z: number, r: number, h: number, seed: number) => rocks.push({ x, z, r, h, seed });
  const points = [[31, -56], [39.8, -58], [36, -67], [46.4, -68], [43, -78], [54.4, -77], [49, -88], [67.5, -91]];
  points.forEach(([x, z], i) => add(x, z, 1.2 + rand() * 0.8, 1 + rand(), 420 + i));
  for (let i = 0; i < 5; i++) add(59 + Math.cos(i * 0.8) * 3, -94 + Math.sin(i * 0.8) * 2, 0.8 + rand(), 0.6 + rand(), 440 + i);
  for (let i = 0; i < 10; i++) {
    add(59.2, -103 - i * 2.2, 1.4, 3.1 + rand(), 460 + i);
    const h = 3.2 + rand();
    if (i < 8) add(68.8, -103 - i * 2.2, 1.4, h, 480 + i);
  }
  for (let i = 0; i < 25; i++) {
    const a = (i / 25) * Math.PI * 2;
    const x = 70 + Math.cos(a) * 12, z = -136 + Math.sin(a) * 12.5;
    if (z > SANCTUARY_GATE.z - 0.5) continue;
    const r = 2.1 + rand(), h = 2.6 + rand() * 1.2;
    // Two north-east rocks leave the gap out to the lookout ledge (the random
    // sequence is still drawn, so every other rock keeps its shape).
    if (i === 20 || i === 21) continue;
    add(x, z, r, h, 540 + i);
  }
  return rocks;
})();

/** The stone arch stands just in front of the tunnel lining (z offset from CAVE.z). */
export const ARCH_Z = 0.35;
/** The tunnel's side walls at walking height (the ridge above is scenery). */
export const CAVE_WALLS = [-1, 1].map((side) => ({ x: CAVE.x + side * 3.5, z: -113.25, width: 1, depth: 23.5, height: 4.5 }));
export const GATE_WALLS = [-1, 1].map((side) => ({ x: SANCTUARY_GATE.x + side * 8.1, z: SANCTUARY_GATE.z, width: 10.8, depth: 0.9 }));
export const GATE_POSTS = [-1, 1].map((side) => ({ x: SANCTUARY_GATE.x + side * 2.6, z: SANCTUARY_GATE.z, r: 0.9 }));

const circleAt = (p: Placement, r: number) => solidAt(p, { kind: "circle", x: 0, z: 0, r });
const boxAt = (p: Placement, hx: number, hz: number) => solidAt(p, { kind: "box", x: 0, z: 0, hx, hz, yaw: 0 });

/** Important solid scenery only. Leaves, bushes, flowers, thin ropes and distant
 * scenery outside the walkable region remain non-blocking. Raised decks are surfaces. */
export const STATIC_SOLIDS: SolidShape[] = [
  ...PALMS.map((p) => circleAt(p, 0.3)),
  ...BOULDERS.map((p) => circleAt(p, p.r * 0.9)),
  ...APPLE_TREES.map((p) => circleAt(p, 0.3)),
  circleAt(BANANA_PLANT, 0.24),
  boxAt(CAMP.tent, TENT_SIZE.width / 2, TENT_SIZE.depth / 2 + 0.15),
  boxAt(CAMP.table, TABLE_SIZE.width / 2, TABLE_SIZE.depth / 2),
  solidAt(CAMP.table, { kind: "box", x: CAMP_CRATE.x, z: CAMP_CRATE.z, hx: CAMP_CRATE.width / 2, hz: CAMP_CRATE.depth / 2, yaw: CAMP_CRATE.yaw }),
  circleAt(CAMP.fire, 0.75),
  solidAt(CAMP.fire, { kind: "capsule", ax: CAMP_BENCH.x - Math.cos(CAMP_BENCH.yaw) * CAMP_BENCH.length / 2, az: CAMP_BENCH.z + Math.sin(CAMP_BENCH.yaw) * CAMP_BENCH.length / 2, bx: CAMP_BENCH.x + Math.cos(CAMP_BENCH.yaw) * CAMP_BENCH.length / 2, bz: CAMP_BENCH.z - Math.sin(CAMP_BENCH.yaw) * CAMP_BENCH.length / 2, r: CAMP_BENCH.radius }),
  circleAt(CAMP.flag, 0.05),
  ...DRIFTWOOD.map((p) => solidAt(p, { kind: "capsule", ax: -p.length / 2, az: 0, bx: p.length / 2, bz: 0, r: p.radius })),
  circleAt(FISH_BASKET, 0.42),
  ...PIER_POSTS.map((p) => circleAt(p, PIER.postRadius)),
  boxAt(MONSTER_STONE, 1.45, 0.85),
  solidAt(FOREST_SIGN, { kind: "circle", x: 0, z: SIGN_SIZE.postZ, r: SIGN_SIZE.postR }),
  solidAt(FOREST_SIGN, { kind: "box", x: SIGN_SIZE.boardX, z: 0, hx: SIGN_SIZE.boardW / 2, hz: SIGN_SIZE.boardD / 2, yaw: 0 }),
  ...CROSSING_POSTS.flatMap((p) => [circleAt(p, CROSSING_POST_SIZE.radius), circleAt({ x: p.x, z: p.z + CROSSING_POST_SIZE.spacing }, CROSSING_POST_SIZE.radius)]),
  ...FOREST_TREE_PLACEMENTS.map((p) => circleAt(p, 0.48)),
  circleAt(PUFF_TREE, 0.72),
  ...[-1, 1].flatMap((side) => [circleAt({ x: BRIDGE.x + side * (BRIDGE.half + 0.05), z: BRIDGE.z1 + 0.2 }, 0.13), circleAt({ x: BRIDGE.x + side * (BRIDGE.half + 0.05), z: BRIDGE.z0 - 0.2 }, 0.13)]),
  ...[-1, 1].flatMap((side): SolidShape[] => [
    { kind: "capsule", ax: BRIDGE.x + side * (BRIDGE.half + 0.05), az: BRIDGE.z1 + 0.2, bx: BRIDGE.x + side * (BRIDGE.half + 0.05), bz: BRIDGE.z1 - (BRIDGE.z1 - BRIDGE.z0) * 0.3 + 0.3, r: 0.025 },
    { kind: "capsule", ax: BRIDGE.x + side * (BRIDGE.half + 0.05), az: BRIDGE.z0 - 0.2, bx: BRIDGE.x + side * (BRIDGE.half + 0.05), bz: BRIDGE.z1 - (BRIDGE.z1 - BRIDGE.z0) * 0.72 - 0.3, r: 0.025 }
  ]),
  // The cliff face remains solid after tying the rope; climbing is scripted.
  boxAt({ x: CLIFF_WALL.x + CLIFF_WALL.length / 2, z: CLIFF_WALL.z }, CLIFF_WALL.length / 2, CLIFF_WALL.depth / 2),
  circleAt(ROPE_STAKE, ROPE_STAKE.r),
  ...VOLCANO_ROCKS.map((p) => circleAt(p, p.r * 0.9)),
  ...CAVE_WALLS.map((p) => boxAt(p, p.width / 2, p.depth / 2)),
  // Arch feet touch the slope; the overhead arch and roof do not block the passage.
  circleAt({ x: CAVE.x - 3.4, z: CAVE.z + ARCH_Z }, 0.9),
  circleAt({ x: CAVE.x + 3.4, z: CAVE.z + ARCH_Z }, 0.9),
  circleAt({ x: CAVE.x - 3.4, z: TUNNEL.z0 - ARCH_Z + 0.1 }, 0.9),
  circleAt({ x: CAVE.x + 3.4, z: TUNNEL.z0 - ARCH_Z + 0.1 }, 0.9),
  boxAt(MEAT_RACK, 0.9, 0.35),
  ...Object.values(GATE_PILLARS).map((p) => circleAt(p, 1.1)),
  ...GATE_WALLS.map((p) => boxAt(p, p.width / 2, p.depth / 2)),
  ...GATE_POSTS.map((p) => circleAt(p, p.r))
];

/** Repaired living railings; broken rails only exist beside the surviving ends. */
export const BRIDGE_RAILS: SolidShape[] = [-1, 1].map((side) => ({ kind: "capsule", ax: BRIDGE.x + side * (BRIDGE.half + 0.05), az: BRIDGE.z0 - 0.2, bx: BRIDGE.x + side * (BRIDGE.half + 0.05), bz: BRIDGE.z1 + 0.2, r: 0.045 }));

/** The support height/line are the highest vertex of BOULDERS[0]'s procedural
 * mesh (seed 1). The horizontal trunk rests on that peak; its crown clears the east side. */
export const PALM_POSES = {
  fallen: { x: FALLEN_PALM.x, z: FALLEN_PALM.z, y: groundY(FALLEN_PALM.x, FALLEN_PALM.z) - 0.08, pitch: 0, yaw: Math.PI, roll: 0 },
  resting: { x: -1, z: -3.17925, y: groundY(-1, -3.6) + 3.24, pitch: 0, yaw: Math.PI * 1.5, roll: 0 }
};
const palmTrunk: SolidShape = { kind: "capsule", ax: 0, az: -FALLEN_PALM.len / 2, bx: 0, bz: FALLEN_PALM.len / 2 + 0.25, r: 0.38 };
export const PALM_SOLIDS = { fallen: solidAt(PALM_POSES.fallen, palmTrunk), resting: solidAt(PALM_POSES.resting, palmTrunk) };
