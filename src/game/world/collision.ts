import type { ObstacleId } from "../types";
import {
  BOULDERS,
  CAMP,
  CROSSING,
  FALLEN_PALM,
  FISH_BASKET,
  MONSTER_STONE,
  PALMS,
  PASS,
  RIDGE,
  RIVER,
  SEA_Y,
  WADE,
  X_EAST,
  X_WEST,
  Z_NORTH,
  APPLE_TREES,
  BANANA_PLANT,
  BERRY_BUSH,
  MAPLE,
  FOREST_SIGN,
  inRiver,
  groundY,
  shoreZ
} from "./island";

export interface Circle {
  x: number;
  z: number;
  r: number;
}

/** Axis-aligned rectangle. */
export interface Box {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export interface Obstacles {
  circles: Circle[];
  boxes: Box[];
}

export const PLAYER_R = 0.35;

/** Fixed solid scenery. */
export const STATIC_OBSTACLES: Obstacles = {
  circles: [
    ...PALMS.map((p) => ({ x: p.x, z: p.z, r: 0.42 })),
    ...BOULDERS.map((b) => ({ x: b.x, z: b.z, r: b.r * 0.9 })),
    ...APPLE_TREES.map((t) => ({ x: t.x, z: t.z, r: 0.5 })),
    { x: BANANA_PLANT.x, z: BANANA_PLANT.z, r: 0.5 },
    { x: BERRY_BUSH.x, z: BERRY_BUSH.z, r: 0.75 },
    { x: CAMP.fire.x, z: CAMP.fire.z, r: 0.75 },
    { x: FISH_BASKET.x, z: FISH_BASKET.z, r: 0.42 },
    { x: MONSTER_STONE.x, z: MONSTER_STONE.z, r: 1 },
    { x: MAPLE.x, z: MAPLE.z, r: 0.4 },
    { x: FOREST_SIGN.x, z: FOREST_SIGN.z, r: 0.25 }
  ],
  boxes: [
    { x0: CAMP.tent.x - 1.9, x1: CAMP.tent.x + 1.9, z0: CAMP.tent.z - 1.6, z1: CAMP.tent.z + 1.6 },
    { x0: CAMP.table.x - 0.85, x1: CAMP.table.x + 0.85, z0: CAMP.table.z - 0.5, z1: CAMP.table.z + 0.5 }
  ]
};

/** The fallen palm while it still blocks the pass. */
export const PALM_BLOCK: Box = { x0: FALLEN_PALM.x - 0.55, x1: FALLEN_PALM.x + 0.55, z0: PASS.z0 - 1, z1: PASS.z1 + 1 };

export interface Gates {
  solved: readonly ObstacleId[];
}

export const CLOSED: Gates = { solved: [] };

export function obstaclesFor(gates: Gates): Obstacles[] {
  return gates.solved.includes("fallenPalm") ? [STATIC_OBSTACLES] : [STATIC_OBSTACLES, { circles: [], boxes: [PALM_BLOCK] }];
}

const inBox = (x: number, z: number, b: Box, m: number) => x >= b.x0 + m && x <= b.x1 - m && z >= b.z0 + m && z <= b.z1 - m;

// Neighbouring regions overlap by more than a body width: each box shrinks by
// the radius, so boxes that only touched would leave a seam nobody can cross.
// The ridge band and the river are cut out separately.
const WEST: Box = { x0: X_WEST, x1: RIDGE.x0 + 1, z0: Z_NORTH, z1: 99 };
const PASS_BOX: Box = { x0: RIDGE.x0 - 1.5, x1: RIDGE.x1 + 1.5, z0: PASS.z0, z1: PASS.z1 };
const EAST: Box = { x0: RIDGE.x1 - 1, x1: RIVER.x0, z0: Z_NORTH, z1: 99 };
const FAR: Box = { x0: RIVER.x1, x1: X_EAST, z0: Z_NORTH, z1: 99 };
const STONES: Box = { x0: RIVER.x0 - 1.5, x1: RIVER.x1 + 1.5, z0: CROSSING.z - CROSSING.half, z1: CROSSING.z + CROSSING.half };

/** Which part of the beach a point is in (for checkpoints and the camera). */
export type Region = "west" | "east" | "far";
export function regionAt(x: number): Region {
  return x < (RIDGE.x0 + RIDGE.x1) / 2 ? "west" : x < (RIVER.x0 + RIVER.x1) / 2 ? "east" : "far";
}

/**
 * True when a circle of radius `m` fits the currently reachable land.
 * Swimmers (Bubbo) may also use the river.
 */
export function isWalkable(x: number, z: number, gates: Gates = CLOSED, m = 0, swimmer = false): boolean {
  const ridgeBand = x > RIDGE.x0 && x < RIDGE.x1;
  // Ridge rocks are solid except for the pass itself.
  if (ridgeBand && !inBox(x, z, PASS_BOX, m)) return false;
  if (z > shoreZ(x) + WADE - m) return false;
  if (inBox(x, z, WEST, m) || inBox(x, z, EAST, m) || inBox(x, z, FAR, m) || inBox(x, z, PASS_BOX, m)) {
    return !inRiver(x, z, -m) || (swimmer && inRiver(x, z, 0));
  }
  if (swimmer && inRiver(x, z, 0.2) && z > Z_NORTH + m) return true;
  if (gates.solved.includes("river") && inBox(x, z, STONES, m)) return true;
  return false;
}

/** Push a circle out of obstacles. */
function pushOut(px: number, pz: number, r: number, sets: Obstacles[]): { x: number; z: number } {
  for (const set of sets) {
    for (const c of set.circles) {
      const dx = px - c.x;
      const dz = pz - c.z;
      const min = c.r + r;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min) {
        const d = Math.sqrt(d2) || 1e-4;
        px = c.x + (dx / d) * min;
        pz = c.z + (dz / d) * min;
      }
    }
    for (const b of set.boxes) {
      const cx = Math.max(b.x0, Math.min(b.x1, px));
      const cz = Math.max(b.z0, Math.min(b.z1, pz));
      const dx = px - cx;
      const dz = pz - cz;
      const d = Math.hypot(dx, dz);
      if (d < r) {
        if (d > 1e-4) {
          px = cx + (dx / d) * r;
          pz = cz + (dz / d) * r;
        } else {
          // Inside: leave by the nearest side.
          const exits = [px - b.x0, b.x1 - px, pz - b.z0, b.z1 - pz];
          const k = exits.indexOf(Math.min(...exits));
          if (k === 0) px = b.x0 - r;
          else if (k === 1) px = b.x1 + r;
          else if (k === 2) pz = b.z0 - r;
          else pz = b.z1 + r;
        }
      }
    }
  }
  return { x: px, z: pz };
}

/**
 * Move a circle from (x0, z0) toward (x1, z1): slide along edges, never end
 * inside scenery or outside the open land. Returns the new position.
 */
export function moveCircle(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  r: number,
  gates: Gates = CLOSED,
  swimmer = false,
  extra: Obstacles[] = []
): { x: number; z: number } {
  const sets = [...obstaclesFor(gates), ...extra];
  const ok = (x: number, z: number) => isWalkable(x, z, gates, r, swimmer);
  let p = pushOut(x1, z1, r, sets);
  if (ok(p.x, p.z)) return p;
  // Slide on one axis at a time.
  p = pushOut(x1, z0, r, sets);
  if (ok(p.x, p.z)) return p;
  p = pushOut(x0, z1, r, sets);
  if (ok(p.x, p.z)) return p;
  return ok(x0, z0) ? { x: x0, z: z0 } : nearestWalkable(x0, z0, r, gates, swimmer);
}

/** Search outward in rings for an open spot (teleports, loading a save). */
export function nearestWalkable(x: number, z: number, r: number, gates: Gates = CLOSED, swimmer = false): { x: number; z: number } {
  const sets = obstaclesFor(gates);
  const free = (px: number, pz: number) => {
    if (!isWalkable(px, pz, gates, r, swimmer)) return false;
    const q = pushOut(px, pz, r, sets);
    return Math.abs(q.x - px) < 1e-6 && Math.abs(q.z - pz) < 1e-6;
  };
  if (free(x, z)) return { x, z };
  for (let ring = 1; ring <= 40; ring++) {
    const d = ring * 0.35;
    const n = 8 + ring * 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const px = x + Math.cos(a) * d;
      const pz = z + Math.sin(a) * d;
      if (free(px, pz)) return { x: px, z: pz };
    }
  }
  return { x, z };
}

/** True if a circle overlaps solid scenery. */
export function blocked(x: number, z: number, r: number, gates: Gates = CLOSED): boolean {
  const q = pushOut(x, z, r, obstaclesFor(gates));
  return Math.abs(q.x - x) > 1e-6 || Math.abs(q.z - z) > 1e-6;
}

/** Height a walker stands at: the ground, or the stepping stones' tops once they are up. */
export function standY(x: number, z: number, solved: readonly ObstacleId[]): number {
  const y = groundY(x, z);
  if (solved.includes("river") && inBox(x, z, STONES, -0.3)) return Math.max(y, STONE_TOP);
  return y;
}

/** Top of a risen stepping stone (the river surface is at -0.3). */
export const STONE_TOP = -0.2;

/** Water level under a point (sea or river), or null on land. */
export function waterLevel(x: number, z: number): number | null {
  if (inRiver(x, z, 0)) return -0.3;
  if (z > shoreZ(x)) return SEA_Y;
  return null;
}
