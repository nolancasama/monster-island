import type { ObstacleId } from "../types";
import { region } from "./region";
import { cloudMove, cloudNearestWalkable, cloudSolids, cloudWalkable, cloudY, type CloudGates } from "./cloudisle";
import {
  EARLY_OVERLOOK,
  CROSSING,
  PASS,
  RIDGE,
  RIVER,
  SEA_Y,
  WADE,
  X_EAST,
  X_WEST,
  Z_NORTH,
  BRAMBLE,
  BRIDGE,
  CLIFF_TOP,
  FOREST_PATH,
  GLADE,
  HILLS,
  LAVA,
  CAVE,
  CAVE_PASSAGE,
  EMBER_SLOPE,
  GATE_PILLARS,
  SANCTUARY,
  SANCTUARY_GATE,
  VOLCANO_PATH,
  PIER,
  SPAWN,
  STATIC_SOLIDS,
  PALM_SOLIDS,
  BRIDGE_RAILS,
  LEDGE,
  GARDEN,
  type SolidShape,
  forestBase,
  inRavine,
  inRiver,
  groundY,
  shoreZ
} from "./island";
import { STAGES, type StageId, CLIFF_FOOT_Z, lowlandDeckY, lowlandSolids, lowlandWalkable } from "./lowland";

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
  shapes?: readonly SolidShape[];
}

export const PLAYER_R = 0.35;

/** Fixed solid scenery. */
export const STATIC_OBSTACLES: Obstacles = { circles: [], boxes: [], shapes: STATIC_SOLIDS };

export interface Gates {
  cloud?: CloudGates;
  solved: readonly ObstacleId[];
  /** The Phase 1 ending has played: the bramble is gone and the forest path is open. */
  forest?: boolean;
  /** The Phase 2 ending has played: the volcano route is available. */
  volcano?: boolean;
  /** Act 2 has begun (Lumo was taken): the lowland below the sanctuary is open. */
  act2?: boolean;
  cleared?: readonly StageId[];
}

export const CLOSED: Gates = { solved: [] };

/** The gates a saved game has opened. */
export function gatesOf(p: { solved: readonly ObstacleId[]; endings: number; act2?: { started: boolean; cleared?: readonly StageId[] }; act3?: { world: string; cleared: readonly string[]; puzzles: readonly string[]; family: {tunnelOpen:boolean}; observatoryLamps?: readonly string[] } }): Gates {
  if (p.act3?.world === "cloud") return { solved: p.solved, act2: true, cloud: { cleared: p.act3.cleared, solved: p.act3.puzzles, tunnelOpen: p.act3.family.tunnelOpen, observatoryLamps: p.act3.observatoryLamps } };
  const act2 = p.act2?.started === true;
  const key = stateKey(p.solved, p.endings >= 1, p.endings >= 2, act2, p.act2?.cleared);
  return gateCache[key] ??= { solved: p.solved, forest: p.endings >= 1, volcano: p.endings >= 2, act2, cleared: p.act2?.cleared };
}

const GATE_IDS: readonly ObstacleId[] = [
  "fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame",
  "groveLilies", "canopyVines", "canopyRope", "causewayGate"
];
const gateCache: Gates[] = [];
function stateKey(solved: readonly ObstacleId[], forest = false, volcano = false, act2 = false, cleared: readonly StageId[] = []): number {
  let key = (forest ? 1 << 14 : 0) | (volcano ? 1 << 15 : 0) | (act2 ? 1 << 16 : 0);
  for (let i = 0; i < GATE_IDS.length; i++) if (solved.includes(GATE_IDS[i])) key |= 1 << i;
  STAGES.forEach((id, i) => { if (cleared.includes(id)) key |= 1 << (17 + i); });
  return key;
}
const keyOf = (g: Gates) => stateKey(g.solved, g.forest, g.volcano, g.act2, g.cleared);

/** The bramble across the forest path while it is closed. */
export const BRAMBLE_BLOCK: Box = { x0: FOREST_PATH.x0 - 1, x1: FOREST_PATH.x1 + 1, z0: BRAMBLE.z - 0.5, z1: BRAMBLE.z + 0.5 };

const solidCache: SolidShape[][] = [];
const obstacleCache: Obstacles[][] = [];
export function solidsFor(gates: Gates): readonly SolidShape[] {
  if (gates.cloud) return cloudSolids();
  const key = keyOf(gates);
  if (solidCache[key]) return solidCache[key];
  const solids = [...STATIC_SOLIDS, PALM_SOLIDS[gates.solved.includes("fallenPalm") ? "resting" : "fallen"]];
  if (gates.solved.includes("bridge")) solids.push(...BRIDGE_RAILS);
  if (!gates.forest) solids.push({ kind: "box", x: BRAMBLE.x, z: BRAMBLE.z, hx: (BRAMBLE_BLOCK.x1 - BRAMBLE_BLOCK.x0) / 2, hz: 0.5, yaw: 0 });
  if (!gates.solved.includes("lava")) solids.push({ kind: "box", x: (LAVA.x0 + LAVA.x1) / 2, z: (LAVA.z0 + LAVA.z1) / 2, hx: (LAVA.x1 - LAVA.x0) / 2, hz: (LAVA.z1 - LAVA.z0) / 2, yaw: 0 });
  if (!gates.solved.includes("cave")) solids.push({ kind: "box", x: CAVE.x, z: CAVE.z, hx: (CAVE_PASSAGE.x1 - CAVE_PASSAGE.x0) / 2, hz: 0.4, yaw: 0 });
  if (!GATE_IDS.slice(6, 10).every((id) => gates.solved.includes(id))) solids.push({ kind: "box", x: SANCTUARY_GATE.x, z: SANCTUARY_GATE.z, hx: SANCTUARY_GATE.half, hz: 0.45, yaw: 0 });
  return solidCache[key] = solids;
}

/** The lowland has its own solids: walkers there never test the rest of the island's, and the other way round. */
const LOWLAND_OBSTACLES: Obstacles[] = [{ circles: [], boxes: [], shapes: lowlandSolids() }];
const inLowlandSet = (z: number) => z < CLIFF_FOOT_Z + 0.5;

export function obstaclesFor(gates: Gates, z = 0): Obstacles[] {
  if (gates.cloud) return [{ circles: [], boxes: [], shapes: cloudSolids() }];
  if (inLowlandSet(z)) return LOWLAND_OBSTACLES;
  const key = keyOf(gates);
  return obstacleCache[key] ??= [{ circles: [], boxes: [], shapes: solidsFor(gates) }];
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

/** On the bridge deck (no margin along it, so it joins the land at both ends). */
export function onBridge(x: number, z: number, m = 0): boolean {
  return Math.abs(x - BRIDGE.x) <= BRIDGE.half - m && z >= BRIDGE.z0 && z <= BRIDGE.z1;
}

/** In the forest (north of the beach): the camera and ambience treat it as its own place. */
export function inForest(x: number, z: number): boolean {
  return x > FOREST_PATH.x0 - 6 && z < FOREST_PATH.z1 - 1.5;
}

export function inVolcano(_x: number, z: number): boolean {
  return z < LAVA.z1;
}

export function inSanctuary(_x: number, z: number): boolean {
  return z < CAVE_PASSAGE.z0 + 2;
}

/**
 * True when a circle of radius `m` fits the currently reachable land.
 * Swimmers (Bubbo) may also use the river.
 */
export function isWalkable(x: number, z: number, gates: Gates = CLOSED, m = 0, swimmer = false): boolean {
  if (gates.cloud) return cloudWalkable(x, z, gates.cloud, m);
  return onLand(x, z, gates, m, swimmer) && !blocked(x, z, m, gates);
}

/** The deck joins the beach at its north end, including beyond the waterline. */
export function onPier(x: number, z: number, m = 0): boolean {
  return Math.abs(x - PIER.x) <= PIER.half - m && z >= PIER.z0 && z <= PIER.z1 - m;
}

function onLand(x: number, z: number, gates: Gates, m: number, swimmer: boolean): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  // North of the sanctuary's cliff: the Act 2 lowland (reached only by its rope).
  if (z < CLIFF_FOOT_Z + 1) return gates.act2 === true && lowlandWalkable(x, z, gates, m);
  if (onPier(x, z, m)) return true;
  const ridgeBand = x > RIDGE.x0 && x < RIDGE.x1;
  // Ridge rocks are solid except for the pass itself.
  if (ridgeBand && !inBox(x, z, PASS_BOX, m)) return false;
  if (z > shoreZ(x) + WADE - m) return false;
  if (inBox(x, z, WEST, m) || inBox(x, z, EAST, m) || inBox(x, z, FAR, m) || inBox(x, z, PASS_BOX, m)) {
    return !inRiver(x, z, -m) || (swimmer && inRiver(x, z, 0));
  }
  if (swimmer && inRiver(x, z, 0.2) && z > Z_NORTH + m) return true;
  if (gates.solved.includes("river") && inBox(x, z, STONES, m)) return true;
  return gates.forest === true && forestWalkable(x, z, gates, m);
}

/** The forest: path, glade, (bridge), hills. The cliff top joins nothing: only the rope leads there. */
function forestWalkable(x: number, z: number, gates: Gates, m: number): boolean {
  if (gates.solved.includes("bridge") && onBridge(x, z, m)) return true;
  if (inRavine(z, m)) return false;
  if (inBox(x, z, FOREST_PATH, m) || inBox(x, z, GLADE, m) || inBox(x, z, HILLS, m)) return true;
  if (!gates.solved.includes("cliff")) return false;
  // The stream cuts all the way across the cliff top; there is no route around it.
  if (z < LAVA.z1 + m && !gates.solved.includes("lava")) return false;
  if (inBox(x, z, CLIFF_TOP, m)) return true;
  return gates.volcano === true && volcanoWalkable(x, z, gates, m);
}

function volcanoWalkable(x: number, z: number, gates: Gates, m: number): boolean {
  if (!gates.solved.includes("lava")) return false;
  if (VOLCANO_PATH.some((a) => inBox(x, z, a, m)) || inBox(x, z, EMBER_SLOPE, m)) {
    if (z < CAVE.z + 0.4 + m && !gates.solved.includes("cave")) return false;
    return true;
  }
  if (!gates.solved.includes("cave")) return false;
  if (inBox(x, z, CAVE_PASSAGE, m)) return true;
  const opened0 = Object.keys(GATE_PILLARS).every((id) => gates.solved.includes(id as ObstacleId));
  // The lookout ledge through the garden's north-east rim (its north edge is the cliff's lip).
  if (opened0 && inBox(x, z, LEDGE, m) && z < SANCTUARY.z0 + 1) return true;
  // A side overlook before the sanctuary gate: no route around its wall.
  if (inBox(x,z,EARLY_OVERLOOK,m)) return true;
  if (!inBox(x, z, SANCTUARY, m)) return false;
  const opened = Object.keys(GATE_PILLARS).every((id) => gates.solved.includes(id as ObstacleId));
  // The wall closes the entire garden; when open its central doorway is the only crossing.
  if (Math.abs(z - SANCTUARY_GATE.z) < 0.45 + m) {
    return opened && Math.abs(x - SANCTUARY_GATE.x) < SANCTUARY_GATE.half - m;
  }
  if (z > SANCTUARY_GATE.z) return true;
  // Behind the gate: the round garden inside its rim (and the lookout ledge through
  // the gap in the rim); the box's corners outside the ring are not garden floor.
  return opened && (Math.hypot(x - GARDEN.x, z - GARDEN.z) <= GARDEN.r + 0.6 - m || inBox(x, z, LEDGE, m));
}

// Scratch projection coordinates: these synchronous queries never allocate in a
// movement substep. Callers may supply an output object for the whole move too.
let pushX = 0;
let pushZ = 0;
const EMPTY: Obstacles[] = [];
const EPS = 1e-7;

function projectRound(cx: number, cz: number, radius: number) {
  const dx = pushX - cx, dz = pushZ - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= (radius - EPS) * (radius - EPS)) return;
  if (d2 < EPS * EPS) { pushX = cx + radius; return; }
  const scale = radius / Math.sqrt(d2);
  pushX = cx + dx * scale;
  pushZ = cz + dz * scale;
}

function projectBox(x: number, z: number, hx: number, hz: number, yaw: number, r: number) {
  const dx = pushX - x, dz = pushZ - z;
  if (Math.abs(dx) > hx + hz + r || Math.abs(dz) > hx + hz + r) return;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  let lx = c * dx - s * dz, lz = s * dx + c * dz;
  const qx = Math.max(-hx, Math.min(hx, lx)), qz = Math.max(-hz, Math.min(hz, lz));
  const ox = lx - qx, oz = lz - qz;
  const d2 = ox * ox + oz * oz;
  if (d2 > 0) {
    if (d2 >= (r - EPS) * (r - EPS) || r === 0) return;
    const scale = r / Math.sqrt(d2);
    lx = qx + ox * scale; lz = qz + oz * scale;
  } else {
    if (hx - Math.abs(lx) < hz - Math.abs(lz)) lx = (lx < 0 ? -1 : 1) * (hx + r);
    else lz = (lz < 0 ? -1 : 1) * (hz + r);
  }
  pushX = x + c * lx + s * lz;
  pushZ = z - s * lx + c * lz;
}

function projectShape(shape: SolidShape, r: number) {
  if (shape.kind === "circle") projectRound(shape.x, shape.z, shape.r + r);
  else if (shape.kind === "box") projectBox(shape.x, shape.z, shape.hx, shape.hz, shape.yaw, r);
  else {
    const dx = shape.bx - shape.ax, dz = shape.bz - shape.az;
    const len2 = dx * dx + dz * dz;
    const t = len2 ? Math.max(0, Math.min(1, ((pushX - shape.ax) * dx + (pushZ - shape.az) * dz) / len2)) : 0;
    projectRound(shape.ax + t * dx, shape.az + t * dz, shape.r + r);
  }
}

function pushOut(x: number, z: number, r: number, sets: readonly Obstacles[]) {
  pushX = x; pushZ = z;
  for (const set of sets) {
    for (const c of set.circles) projectRound(c.x, c.z, c.r + r);
    for (const b of set.boxes) projectBox((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, (b.x1 - b.x0) / 2, (b.z1 - b.z0) / 2, 0, r);
    if (set.shapes) for (const shape of set.shapes) projectShape(shape, r);
  }
}

function overlaps(x: number, z: number, r: number, sets: readonly Obstacles[]): boolean {
  pushOut(x, z, r, sets);
  return Math.abs(pushX - x) > EPS || Math.abs(pushZ - z) > EPS;
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
  extra: Obstacles[] = EMPTY,
  out = { x: 0, z: 0 }
): { x: number; z: number } {
  if (gates.cloud) return cloudMove(x0, z0, x1, z1, r, gates.cloud, out);
  const sets = obstaclesFor(gates, z0);
  const count = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.15));
  const dx = (x1 - x0) / count, dz = (z1 - z0) / count;
  let x = x0, z = z0;
  for (let step = 0; step < count; step++) {
    // Preserve the existing projected move + axis sliding. Substeps stop thin
    // posts/rails and land restrictions being skipped by a long movement step.
    for (let attempt = 0; attempt < 3; attempt++) {
      let nx = attempt === 2 ? x : x + dx;
      let nz = attempt === 1 ? z : z + dz;
      for (let pass = 0; pass < 3; pass++) {
        pushOut(nx, nz, r, sets); nx = pushX; nz = pushZ;
        pushOut(nx, nz, r, extra); nx = pushX; nz = pushZ;
      }
      if (isWalkable(nx, nz, gates, r, swimmer) && !overlaps(nx, nz, r, extra)) {
        x = nx; z = nz; break;
      }
    }
  }
  if (!isWalkable(x, z, gates, r, swimmer)) {
    const safe = nearestWalkable(x, z, r, gates, swimmer);
    x = safe.x; z = safe.z;
  }
  out.x = x; out.z = z;
  return out;
}

/**
 * Search outward in rings for an open spot (teleports, loading a save).
 * With nothing open nearby the walker stays put: monsters live behind gates
 * that are still closed (Ember before the lava, Lumo behind the gate), and
 * must never be sent to the beach. Loading a save passes `toSpawn`.
 */
export function nearestWalkable(x: number, z: number, r: number, gates: Gates = CLOSED, swimmer = false, toSpawn = false): { x: number; z: number } {
  if (gates.cloud) return cloudNearestWalkable(x, z, r, gates.cloud);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return { x: SPAWN.x, z: SPAWN.z };
  if (isWalkable(x, z, gates, r, swimmer)) return { x, z };
  for (let ring = 1; ring <= 40; ring++) {
    const d = ring * 0.35;
    const n = 8 + ring * 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const px = x + Math.cos(a) * d;
      const pz = z + Math.sin(a) * d;
      if (isWalkable(px, pz, gates, r, swimmer)) return { x: px, z: pz };
    }
  }
  return toSpawn ? { x: SPAWN.x, z: SPAWN.z } : { x, z };
}

/** True if a circle overlaps solid scenery. */
export function blocked(x: number, z: number, r: number, gates: Gates = CLOSED): boolean {
  return overlaps(x, z, r, obstaclesFor(gates, z));
}

/** Height a walker stands at: the ground, or the stepping stones' tops once they are up. */
export function standY(x: number, z: number, solved: readonly ObstacleId[]): number {
  if (region.world === "cloud") return cloudY(x, z);
  const y = groundY(x, z);
  if (z < CLIFF_FOOT_Z + 1) return Math.max(y, lowlandDeckY(x, z, solved));
  if (onPier(x, z)) return Math.max(y, groundY(PIER.x, PIER.z0) + PIER.deckY);
  if (solved.includes("river") && inBox(x, z, STONES, -0.3)) return Math.max(y, STONE_TOP);
  if (solved.includes("bridge") && onBridge(x, z, -0.3)) return Math.max(y, bridgeDeckY(z));
  if (solved.includes("lava")) return Math.max(y, lavaCrustY(x, z));
  return y;
}

/** Height of the cooled crust's flat top above the ground at the lava's centre. */
export const LAVA_CRUST = 0.2;
/** Width of the gentle edge where the crust meets the trail on each side. */
export const LAVA_RAMP = 0.9;

/**
 * The cooled lava's walking surface: flat over the lava bed, easing down to
 * the trail over LAVA_RAMP (the scene builds the same shape). -Infinity off it.
 * Every walker (player, monsters) stands on it through standY.
 */
export function lavaCrustY(x: number, z: number): number {
  const out = Math.hypot(Math.max(LAVA.x0 - x, 0, x - LAVA.x1), Math.max(LAVA.z0 - z, 0, z - LAVA.z1));
  if (out >= LAVA_RAMP) return -Infinity;
  const top = groundY(LAVA.x, LAVA.z) + LAVA_CRUST;
  const t = out / LAVA_RAMP;
  return top - LAVA_CRUST * 1.2 * t * t * (3 - 2 * t);
}

/** The bridge deck: a straight span between the two lips of the ravine. */
export function bridgeDeckY(z: number): number {
  const a = forestBase(BRIDGE.x, BRIDGE.z0);
  const b = forestBase(BRIDGE.x, BRIDGE.z1);
  const t = Math.max(0, Math.min(1, (z - BRIDGE.z0) / (BRIDGE.z1 - BRIDGE.z0)));
  return a + (b - a) * t + 0.12;
}

/** Top of a risen stepping stone (the river surface is at -0.3). */
export const STONE_TOP = -0.2;

/** Water level under a point (sea or river), or null on land. */
export function waterLevel(x: number, z: number): number | null {
  if (region.world === "cloud") return null;
  if (inRiver(x, z, 0)) return -0.3;
  if (z > shoreZ(x)) return SEA_Y;
  return null;
}
