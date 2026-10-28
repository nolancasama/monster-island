import type { ObstacleId, Text, Vec2 } from "../types";
import type { SolidShape } from "./island";

/**
 * Act 2: the prehistoric lowland below the sanctuary's cliff, north of the
 * volcano, down to a harbour on the island's north coast.
 *
 *            LUMO'S SANCTUARY (ledge, rope)
 *                     |
 *             PRIMEVAL FOREST 1 (tutorial)
 *                     |
 *                FERN CAMP (fork)
 *           /         |          \
 *   FLOODED GROVE  OLD TRAIL   ANCIENT CANOPY (raised roots, two gaps)
 *           \     (shortcut)     /
 *              RUINED CAUSEWAY (+ shrine)
 *                     |
 *               COASTAL PATH
 *                     |
 *                 PORT TOWN → sea
 *
 * Pure geometry, no imports from island.ts (island.ts blends lowlandY into
 * the island's ground). Walkable land is a union of shapes (rectangles,
 * trails with a half-width, discs) minus cut-outs (the pond, the canopy
 * gaps, the closed shortcut gate) plus decks that permanent unlocks add.
 */

export type ZoneId = "forest1" | "camp" | "grove" | "canopy" | "oldTrail" | "causeway" | "coast" | "port";

type Rect = { kind: "rect"; x0: number; x1: number; z0: number; z1: number };
type Trail = { kind: "trail"; pts: Array<[number, number]>; w: number };
type Disc = { kind: "disc"; x: number; z: number; r: number };
export type WalkShape = Rect | Trail | Disc;

const rect = (x0: number, x1: number, z0: number, z1: number): Rect => ({ kind: "rect", x0, x1, z0, z1 });
const trail = (pts: Array<[number, number]>, w: number): Trail => ({ kind: "trail", pts, w });
const disc = (x: number, z: number, r: number): Disc => ({ kind: "disc", x, z, r });

const smooth = (t: number) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

/** Distance to a polyline and the arc length of the nearest point. */
export function nearestOnTrail(pts: Array<[number, number]>, x: number, z: number): { d: number; s: number } {
  let best = Infinity;
  let bestS = 0;
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (len * len)));
    const d = Math.hypot(ax + dx * u - x, az + dz * u - z);
    if (d < best) {
      best = d;
      bestS = acc + u * len;
    }
    acc += len;
  }
  return { d: best, s: bestS };
}

export function trailLength(pts: Array<[number, number]>): number {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return acc;
}

/** Point at arc length s along a polyline. */
export function trailPoint(pts: Array<[number, number]>, s: number): Vec2 {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const len = Math.hypot(bx - ax, bz - az);
    if (acc + len >= s) {
      const u = (s - acc) / len;
      return { x: ax + (bx - ax) * u, z: az + (bz - az) * u };
    }
    acc += len;
  }
  const [x, z] = pts[pts.length - 1];
  return { x, z };
}

function inside(sh: WalkShape, x: number, z: number, m: number): boolean {
  if (sh.kind === "rect") return x >= sh.x0 + m && x <= sh.x1 - m && z >= sh.z0 + m && z <= sh.z1 - m;
  if (sh.kind === "disc") return Math.hypot(x - sh.x, z - sh.z) <= sh.r - m;
  return nearestOnTrail(sh.pts, x, z).d <= sh.w - m;
}

/** Overlapping a cut-out (grown by the walker's radius). */
function touches(sh: WalkShape, x: number, z: number, m: number): boolean {
  if (sh.kind === "rect") return x > sh.x0 - m && x < sh.x1 + m && z > sh.z0 - m && z < sh.z1 + m;
  if (sh.kind === "disc") return Math.hypot(x - sh.x, z - sh.z) < sh.r + m;
  return nearestOnTrail(sh.pts, x, z).d < sh.w + m;
}

// ------------------------------------------------------------------ the cliff and the rope

/** The rope from the sanctuary's lookout ledge down the cliff (x is the rope's line). */
export const CLIFF_ROPE = {
  x: 75.5,
  /** The stake on the ledge, behind the lip. */
  stakeZ: -150.5,
  /** The ledge's north lip and the rock face below it. */
  lipZ: -151.2,
  faceZ: -151.5,
  /** The rope hangs here, in front of the face; the climber hangs in front of the rope. */
  hangZ: -151.8,
  bodyZ: -152.15,
  /** Where the climber stands at the foot (lowland) and at the top (on the ledge). */
  foot: { x: 75.5, z: -154.4 },
  top: { x: 75.5, z: -149.8 }
};
/** Walkable lowland never reaches further south than this (the foot of the cliff). */
export const CLIFF_FOOT_Z = -153.6;

// ------------------------------------------------------------------ zones

export const FOREST1_TRAIL: Array<[number, number]> = [[75.5, -153.8], [73.5, -161], [78.5, -169], [73.5, -178], [76, -186]];
export const GROVE_TRAIL: Array<[number, number]> = [[72, -199.5], [61, -203.5], [51, -211], [45.5, -223], [49, -235], [58, -244.5]];
export const CANOPY_TRAIL: Array<[number, number]> = [[81, -199], [92, -201], [102, -205], [106, -212], [106, -232], [100, -238], [94, -245]];
export const OLD_TRAIL: Array<[number, number]> = [[76, -200], [76, -242.6]];
export const COAST_TRAIL: Array<[number, number]> = [[76, -255], [72.5, -266], [79.5, -278], [76, -290.5]];

export const CAUSEWAY = rect(54, 100, -256.5, -242.5);
export const PORT = rect(54, 100, -322.5, -289.5);
export const PIER2 = { x: 76, half: 1.2, z0: -337, z1: -322, deckY: 0.55 };
export const SHRINE = disc(106.5, -251.5, 4.8);
export const CAMP_SITE = { x: 76, z: -191.5, r: 6.5 };

/** The pond in the grove with its islet (reached on Bubbo's lily pads). */
export const POND = { x: 37.6, z: -222.5, r: 5 };
export const ISLET = { x: 35.4, z: -223.2, r: 2 };
export const LILY_PADS: Vec2[] = [{ x: 41.6, z: -222.5 }, { x: 40.1, z: -222.8 }, { x: 38.6, z: -223.1 }];
const LILY_WALK = trail([[43.8, -222.4], [37, -223.1]], 1.05);

/** The raised root route: height profile along CANOPY_TRAIL and its two gaps. */
export const CANOPY_HEIGHT = 4.5;
const CANOPY_LEN = trailLength(CANOPY_TRAIL);
const CANOPY_RAMPS = { up: [6, 16], down: [CANOPY_LEN - 12, CANOPY_LEN - 3] };
/** Gaps in the root walk (x is the trail's straight north-south stretch). */
export const CANOPY_GAPS = {
  canopyVines: { x: 106, z0: -219.5, z1: -216 },
  canopyRope: { x: 106, z0: -229, z1: -225.5 }
};
const GAP_HALF = 2.5;
const DECK_HALF = 0.95;

/** The old trail's gate into the causeway (closed until the shortcut is opened). */
export const SHORTCUT_GATE = { x: 76, z: -241.4, half: 2.2 };

export interface ZoneDef {
  id: ZoneId;
  name: Text;
  /** Enemies live here and the companion takes its combat position. */
  hostile: boolean;
  walk: WalkShape[];
}

export const ZONES: Record<ZoneId, ZoneDef> = {
  camp: { id: "camp", name: { en: "Fern Camp", ja: "シダの キャンプ" }, hostile: false, walk: [disc(CAMP_SITE.x, CAMP_SITE.z, CAMP_SITE.r), rect(70.5, 81.5, -201.5, -195)] },
  port: { id: "port", name: { en: "Port Town", ja: "みなとまち" }, hostile: false, walk: [PORT, rect(PIER2.x - PIER2.half, PIER2.x + PIER2.half, PIER2.z0, PIER2.z1 + 0.5)] },
  oldTrail: { id: "oldTrail", name: { en: "Old Trail", ja: "ふるい こみち" }, hostile: false, walk: [trail(OLD_TRAIL, 1.9)] },
  canopy: { id: "canopy", name: { en: "Ancient Canopy", ja: "こだいの きのうえ" }, hostile: true, walk: [trail(CANOPY_TRAIL, 2.2)] },
  grove: { id: "grove", name: { en: "Flooded Grove", ja: "みずびたしの もり" }, hostile: true, walk: [trail(GROVE_TRAIL, 3.8), disc(50.5, -212.5, 6), disc(47.5, -233, 5.5), disc(ISLET.x, ISLET.z, ISLET.r)] },
  causeway: { id: "causeway", name: { en: "Ruined Causeway", ja: "いせきの いしみち" }, hostile: true, walk: [CAUSEWAY, SHRINE, rect(99, 104, -254, -249)] },
  coast: { id: "coast", name: { en: "Coastal Path", ja: "うみべの みち" }, hostile: true, walk: [trail(COAST_TRAIL, 4)] },
  forest1: { id: "forest1", name: { en: "Primeval Forest", ja: "げんしの もり" }, hostile: true, walk: [trail(FOREST1_TRAIL, 4.2), disc(76.5, -168, 6.5), disc(74.5, -178.5, 6)] }
};
/** Overlaps are decided in this order (the camp before the forest round it, the town before the coast). */
export const ZONE_ORDER: ZoneId[] = ["camp", "port", "oldTrail", "canopy", "grove", "causeway", "coast", "forest1"];

/** The zone at a point (null outside the lowland's walkable land). */
export function zoneAt(x: number, z: number): ZoneId | null {
  if (z > CLIFF_FOOT_Z + 0.5) return null;
  for (const id of ZONE_ORDER) if (ZONES[id].walk.some((sh) => inside(sh, x, z, 0))) return id;
  return null;
}

// ------------------------------------------------------------------ walking

/** Permanent unlocks in the lowland. */
export interface LowlandGates {
  solved: readonly ObstacleId[];
}

const POND_CUT = disc(POND.x, POND.z, POND.r);

function gapCut(id: keyof typeof CANOPY_GAPS): Rect {
  const g = CANOPY_GAPS[id];
  return rect(g.x - GAP_HALF, g.x + GAP_HALF, g.z0, g.z1);
}
/** The deck runs a metre onto the root walk at each end, so its ends overlap the land by more than a body width. */
function gapDeck(id: keyof typeof CANOPY_GAPS): Rect {
  const g = CANOPY_GAPS[id];
  return rect(g.x - DECK_HALF, g.x + DECK_HALF, g.z0 - 1, g.z1 + 1);
}
const GATE_CUT = rect(SHORTCUT_GATE.x - SHORTCUT_GATE.half - 0.5, SHORTCUT_GATE.x + SHORTCUT_GATE.half + 0.5, SHORTCUT_GATE.z - 0.45, SHORTCUT_GATE.z + 0.45);

/** True when a circle of radius m fits the lowland's open land (solid scenery is checked separately). */
export function lowlandWalkable(x: number, z: number, g: LowlandGates, m: number): boolean {
  if (z > CLIFF_FOOT_Z - m) return false;
  const solved = g.solved;
  // Decks added by unlocks (narrower than the gaps they span).
  if (solved.includes("groveLilies") && (inside(LILY_WALK, x, z, m) || inside(disc(ISLET.x, ISLET.z, ISLET.r), x, z, m))) return true;
  for (const id of ["canopyVines", "canopyRope"] as const) {
    if (touches(gapCut(id), x, z, m)) return solved.includes(id) && inside(gapDeck(id), x, z, m);
  }
  if (touches(POND_CUT, x, z, m) && !inside(disc(ISLET.x, ISLET.z, ISLET.r), x, z, m)) return false;
  if (!solved.includes("causewayGate") && touches(GATE_CUT, x, z, m)) return false;
  for (const id of ZONE_ORDER) for (const sh of ZONES[id].walk) if (inside(sh, x, z, m)) return true;
  return false;
}

/** Within the lowland (for camera, ambience and scenery visibility). */
export function inLowland(_x: number, z: number): boolean {
  return z < CLIFF_FOOT_Z + 1;
}

// ------------------------------------------------------------------ heights

/** The basin covered by the lowland's own terrain mesh (the massif skips it). */
export const BASIN = { x0: 19, x1: 135, z0: -344, z1: -150 };

/** 1 where the lowland's height replaces the massif (north of the sanctuary shelf). */
export function basinFraction(x: number, z: number): number {
  const south = smooth((-150 - z) / 3);
  const out = Math.max(BASIN.x0 - x, x - BASIN.x1, BASIN.z0 - z, 0);
  return south * (1 - smooth(out / 4));
}

const base = (_x: number, z: number) => 2.4 + 0.0066 * (z + 152);
const bumps = (x: number, z: number) => 0.18 * Math.sin(x * 0.21 + z * 0.13) + 0.12 * Math.sin(x * 0.37 - z * 0.29);

/** Raised root walk above the forest floor along CANOPY_TRAIL (0 off it). */
export function canopyRaise(x: number, z: number): number {
  if (x < 76 || z > -193 || z < -252) return 0;
  const { d, s } = nearestOnTrail(CANOPY_TRAIL, x, z);
  if (d > 6) return 0;
  const up = smooth((s - CANOPY_RAMPS.up[0]) / (CANOPY_RAMPS.up[1] - CANOPY_RAMPS.up[0]));
  const down = 1 - smooth((s - CANOPY_RAMPS.down[0]) / (CANOPY_RAMPS.down[1] - CANOPY_RAMPS.down[0]));
  let h = CANOPY_HEIGHT * Math.min(up, down) * (1 - smooth((d - 2.7) / 2.6));
  for (const g of Object.values(CANOPY_GAPS)) {
    if (Math.abs(x - g.x) > GAP_HALF + 3) continue;
    const into = Math.min(z - g.z0, g.z1 - z);
    h *= 1 - smooth((into + 0.2) / 0.4);
  }
  return h;
}

/** Shallow streams through the grove (decor water over a slight channel). */
export const STREAMS: Array<Array<[number, number]>> = [
  [[29, -205], [42, -208], [52, -214.5], [62, -212], [66, -207]],
  [[33, -239], [44, -240.5], [55, -237], [63, -232]],
  [[44, -214], [41.5, -219]]
];

/** Terrain height of the lowland (before the island's blending). */
export function lowlandY(x: number, z: number): number {
  let y = base(x, z);
  const flat = Math.max(rectMask(CAUSEWAY, x, z, 2), rectMask(PORT, x, z, 3));
  y += bumps(x, z) * (1 - flat);
  y += canopyRaise(x, z);
  // The pond (its islet stands up out of it) and the stream channels.
  const pr = Math.hypot(x - POND.x, z - POND.z);
  if (pr < POND.r + 1.5) {
    const ir = Math.hypot(x - ISLET.x, z - ISLET.z);
    y -= 0.95 * (1 - smooth((pr - POND.r + 1.2) / 1.6)) * smooth((ir - ISLET.r + 0.4) / 0.8);
  }
  if (x < 70 && z < -200 && z > -246) {
    for (const st of STREAMS) {
      const d = nearestOnTrail(st, x, z).d;
      if (d < 2.4) y -= 0.32 * (1 - smooth((d - 0.7) / 1.5));
    }
  }
  // Hills close the basin east and west, then fall into the sea; the north coast falls past the town.
  const west = Math.max(32 - x, 0);
  const east = Math.max(x - 114, 0);
  y += 9 * smooth(Math.max(west, east) / 6);
  const sea = Math.max(26 - x, x - 124, -323 - z, 0);
  y -= sea * 2.4;
  return Math.max(y, -4.5);
}

function rectMask(r: Rect, x: number, z: number, fade: number): number {
  const out = Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
  return 1 - smooth(out / fade);
}

export const POND_Y = base(POND.x, POND.z) - 0.35;
export const streamY = (x: number, z: number) => base(x, z) - 0.12;

/** Height of a walking surface added by an unlock (bridge decks, lily pads, the pier), or -Infinity. */
export function lowlandDeckY(x: number, z: number, solved: readonly ObstacleId[]): number {
  if (Math.abs(x - PIER2.x) <= PIER2.half && z >= PIER2.z0 && z <= PIER2.z1 + 0.6) return base(PIER2.x, PIER2.z1) + PIER2.deckY;
  for (const id of ["canopyVines", "canopyRope"] as const) {
    const g = CANOPY_GAPS[id];
    if (solved.includes(id) && Math.abs(x - g.x) <= DECK_HALF + 0.3 && z >= g.z0 - 0.8 && z <= g.z1 + 0.8) return base(g.x, (g.z0 + g.z1) / 2) + CANOPY_HEIGHT + 0.08;
  }
  if (solved.includes("groveLilies") && inside(LILY_WALK, x, z, -0.3)) return POND_Y + 0.08;
  return -Infinity;
}

// ------------------------------------------------------------------ places

export const CAMP2 = {
  tent: { x: 71.5, z: -193.5, yaw: 0.9 },
  fire: { x: 76.5, z: -190.5 },
  bench: { x: 79, z: -188.6, yaw: -0.5 },
  /** Resting spot (E: Rest). */
  rest: { x: 75.6, z: -189.2 }
};
export const FORK_SIGN = { x: 78.6, z: -198.2, yaw: 0 };

export interface ChestDef {
  id: string;
  x: number;
  z: number;
  yaw: number;
  coins: number;
  amber: number;
  food?: { id: "apples" | "fish" | "berries" | "meat"; n: number };
}
export const CHESTS: ChestDef[] = [
  // The tutorial chest at the end of the first forest: food to learn eating, and the first amber.
  { id: "forestChest", x: 79.3, z: -183.4, yaw: -0.5, coins: 15, amber: 1, food: { id: "apples", n: 2 } },
  { id: "isletChest", x: 34.9, z: -223.4, yaw: 1.5, coins: 30, amber: 1, food: { id: "fish", n: 2 } },
  { id: "canopyChest", x: 107.3, z: -222.4, yaw: -1.4, coins: 25, amber: 0, food: { id: "berries", n: 2 } },
  { id: "shrineChest", x: 108.6, z: -252.6, yaw: -1.6, coins: 40, amber: 1, food: { id: "meat", n: 2 } }
];

/** Where the student stands to ask for each Act 2 unlock, and what it looks at. */
export const ACT2_OBSTACLE_PLACE: Record<"groveLilies" | "canopyVines" | "canopyRope" | "causewayGate", Vec2 & { face: Vec2 }> = {
  groveLilies: { x: 44.3, z: -221.6, face: { x: 39, z: -223 } },
  canopyVines: { x: 106, z: -214.6, face: { x: 106, z: -218 } },
  canopyRope: { x: 106, z: -224.2, face: { x: 106, z: -227.5 } },
  causewayGate: { x: 76, z: -244, face: { x: 76, z: -241.4 } }
};

/** The town: each service has a building, a keeper and the spot E works from. */
export type ServiceId = "market" | "kitchen" | "trainer" | "inn" | "harbor";
export interface ServiceDef {
  id: ServiceId;
  name: Text;
  /** Building centre, size (x, z) and the direction its front faces. */
  house: { x: number; z: number; w: number; d: number; yaw: number };
  keeper: { x: number; z: number; yaw: number };
}
export const SERVICES: Record<ServiceId, ServiceDef> = {
  market: { id: "market", name: { en: "Food Market", ja: "たべものの おみせ" }, house: { x: 61, z: -299, w: 6, d: 4, yaw: Math.PI / 2 }, keeper: { x: 64.6, z: -299, yaw: Math.PI / 2 } },
  kitchen: { id: "kitchen", name: { en: "Treat Kitchen", ja: "おやつの キッチン" }, house: { x: 93, z: -299, w: 6, d: 4.5, yaw: -Math.PI / 2 }, keeper: { x: 89.2, z: -299, yaw: -Math.PI / 2 } },
  trainer: { id: "trainer", name: { en: "Monster Trainer", ja: "モンスタートレーナー" }, house: { x: 60.5, z: -312, w: 5.5, d: 5, yaw: Math.PI / 2 }, keeper: { x: 64.4, z: -312, yaw: Math.PI / 2 } },
  inn: { id: "inn", name: { en: "Seaside Inn", ja: "うみべの やど" }, house: { x: 93.5, z: -312, w: 6, d: 6, yaw: -Math.PI / 2 }, keeper: { x: 89.3, z: -312, yaw: -Math.PI / 2 } },
  harbor: { id: "harbor", name: { en: "Harbor Office", ja: "みなとの じむしょ" }, house: { x: 66, z: -319.5, w: 7, d: 4, yaw: Math.PI }, keeper: { x: 69.8, z: -316.6, yaw: Math.PI } }
};
export const FOUNTAIN = { x: 77, z: -306, r: 1.6 };
/** Maple waits on the quay once the town is reached. */
export const MAPLE_PORT = { x: 80.5, z: -317.5, yaw: Math.PI * 0.85 };
export const TOWN_GATE = { x: 76, z: -289.5 };

/** Big trees standing inside walkable clearings (solid trunks). */
export const GIANT_TREES: Array<Vec2 & { r: number; h: number }> = [
  { x: 81.3, z: -163.4, r: 1.05, h: 15 },
  { x: 70.4, z: -170.4, r: 1.2, h: 17 },
  { x: 79.9, z: -180.3, r: 1, h: 14 },
  { x: 54.6, z: -208.4, r: 1.1, h: 16 },
  { x: 47.2, z: -217.6, r: 0.9, h: 13 },
  { x: 43.6, z: -235.5, r: 1.15, h: 16 },
  { x: 69.3, z: -194.6, r: 0.95, h: 14 }
];
export const MOSSY_BOULDERS: Array<Vec2 & { r: number; h: number }> = [
  { x: 72.2, z: -163.5, r: 0.9, h: 1.1 },
  { x: 80.9, z: -175.2, r: 1.1, h: 1.4 },
  { x: 55.8, z: -201.2, r: 0.8, h: 0.9 },
  { x: 52.7, z: -238.6, r: 1, h: 1.2 },
  { x: 74.5, z: -270.5, r: 0.8, h: 0.9 },
  { x: 80.2, z: -283.4, r: 0.9, h: 1 }
];
export const LOGS: Array<{ ax: number; az: number; bx: number; bz: number; r: number }> = [
  { ax: 69.2, az: -175.4, bx: 71.4, bz: -181.4, r: 0.38 },
  { ax: 44.4, az: -209.3, bx: 49.3, bz: -207.1, r: 0.42 },
  { ax: 50.6, az: -229.1, bx: 52.2, bz: -235.2, r: 0.4 }
];
/** Ruined pillars lining the causeway. */
export const RUIN_PILLARS: Vec2[] = (() => {
  const out: Vec2[] = [];
  for (let x = 58; x <= 96; x += 6.4) {
    if (Math.abs(x - SHORTCUT_GATE.x) < 4) continue;
    out.push({ x, z: -243.6 }, { x: x + 3.2, z: -255.4 });
  }
  return out;
})();

/** One normal enemy: its type and where it lives in its zone. */
export type EnemyKind = "gloomlet" | "snapjaw" | "shellback";
export interface EnemySpawn {
  zone: ZoneId;
  kind: EnemyKind;
  x: number;
  z: number;
}
export const ENEMY_SPAWNS: EnemySpawn[] = [
  // The tutorial: one, then two, then a mixed pair.
  { zone: "forest1", kind: "gloomlet", x: 74.6, z: -162.8 },
  { zone: "forest1", kind: "gloomlet", x: 75.6, z: -170.2 },
  { zone: "forest1", kind: "gloomlet", x: 79.4, z: -168.8 },
  { zone: "forest1", kind: "snapjaw", x: 72.6, z: -178.6 },
  { zone: "forest1", kind: "gloomlet", x: 77.2, z: -181.2 },
  // The grove: more enemies, simple ground.
  { zone: "grove", kind: "gloomlet", x: 62, z: -203.2 },
  { zone: "grove", kind: "gloomlet", x: 58.8, z: -205.6 },
  { zone: "grove", kind: "snapjaw", x: 51.5, z: -211.8 },
  { zone: "grove", kind: "gloomlet", x: 48.6, z: -216.4 },
  { zone: "grove", kind: "gloomlet", x: 46.4, z: -226.8 },
  { zone: "grove", kind: "snapjaw", x: 48.5, z: -232.2 },
  { zone: "grove", kind: "gloomlet", x: 45.6, z: -234 },
  { zone: "grove", kind: "snapjaw", x: 54.2, z: -240.6 },
  // The canopy: fewer enemies, harder ground.
  { zone: "canopy", kind: "gloomlet", x: 97, z: -203.3 },
  { zone: "canopy", kind: "snapjaw", x: 106, z: -208.6 },
  { zone: "canopy", kind: "gloomlet", x: 105.2, z: -230.6 },
  { zone: "canopy", kind: "snapjaw", x: 101.4, z: -237 },
  // The causeway: tougher pairs, and the shrine's guards.
  { zone: "causeway", kind: "snapjaw", x: 62, z: -248.2 },
  { zone: "causeway", kind: "shellback", x: 66.4, z: -251.4 },
  { zone: "causeway", kind: "snapjaw", x: 85, z: -247.4 },
  { zone: "causeway", kind: "shellback", x: 88.6, z: -251.6 },
  { zone: "causeway", kind: "gloomlet", x: 95, z: -249.6 },
  { zone: "causeway", kind: "shellback", x: 103.4, z: -251.8 },
  { zone: "causeway", kind: "snapjaw", x: 107.4, z: -249.2 },
  // The coast: a lighter last stretch.
  { zone: "coast", kind: "gloomlet", x: 73.4, z: -265.4 },
  { zone: "coast", kind: "gloomlet", x: 79.2, z: -276.4 },
  { zone: "coast", kind: "snapjaw", x: 77.4, z: -284.6 }
];

/** Town props (scenery placements shared by the scene and collision). */
export const CRATES: Array<Vec2 & { yaw: number; s: number }> = [
  { x: 67.5, z: -296.2, yaw: 0.3, s: 1 }, { x: 68.6, z: -295.4, yaw: -0.2, s: 0.8 }, { x: 86.6, z: -321, yaw: 0.5, s: 1 },
  { x: 72.4, z: -321.4, yaw: 0.1, s: 0.9 }, { x: 98, z: -306, yaw: 0.7, s: 1 }, { x: 56.4, z: -306.5, yaw: -0.4, s: 0.9 }
];
export const LAMPS: Vec2[] = [{ x: 70.5, z: -293 }, { x: 81.5, z: -293 }, { x: 70.5, z: -309 }, { x: 83.5, z: -309 }, { x: 74.2, z: -321.6 }, { x: 77.8, z: -321.6 }];
/** Houses along the edges of the town (background, solid). */
export const HOUSES: Array<{ x: number; z: number; w: number; d: number; yaw: number; color: string; roof: string }> = [
  { x: 57.5, z: -292.6, w: 5, d: 4.5, yaw: Math.PI / 2, color: "#f4e3c4", roof: "#d1563b" },
  { x: 96.5, z: -292.6, w: 5, d: 4.5, yaw: -Math.PI / 2, color: "#e8f0f4", roof: "#3c7fb8" },
  { x: 97.4, z: -320, w: 4.5, d: 4.5, yaw: -Math.PI / 2, color: "#fbe9d2", roof: "#5aa053" },
  { x: 56.5, z: -320.2, w: 4.5, d: 4.4, yaw: Math.PI / 2, color: "#f2dbe8", roof: "#d8873a" }
];

/** Solid scenery in the lowland (its own set: only walkers north of the cliff test it). */
export function lowlandSolids(): SolidShape[] {
  const out: SolidShape[] = [];
  const box = (x: number, z: number, hx: number, hz: number, yaw = 0) => out.push({ kind: "box", x, z, hx, hz, yaw });
  const circle = (x: number, z: number, r: number) => out.push({ kind: "circle", x, z, r });
  for (const t of GIANT_TREES) circle(t.x, t.z, t.r);
  for (const b of MOSSY_BOULDERS) circle(b.x, b.z, b.r * 0.9);
  for (const l of LOGS) out.push({ kind: "capsule", ...l });
  for (const p of RUIN_PILLARS) circle(p.x, p.z, 0.6);
  circle(CAMP2.fire.x, CAMP2.fire.z, 0.7);
  box(CAMP2.tent.x, CAMP2.tent.z, 1.6, 1.55, CAMP2.tent.yaw);
  const bx = Math.cos(CAMP2.bench.yaw) * 0.75, bz = -Math.sin(CAMP2.bench.yaw) * 0.75;
  out.push({ kind: "capsule", ax: CAMP2.bench.x - bx, az: CAMP2.bench.z - bz, bx: CAMP2.bench.x + bx, bz: CAMP2.bench.z + bz, r: 0.2 });
  circle(FORK_SIGN.x, FORK_SIGN.z, 0.12);
  for (const c of CHESTS) box(c.x, c.z, 0.5, 0.36, c.yaw);
  for (const s of Object.values(SERVICES)) {
    box(s.house.x, s.house.z, s.house.w / 2, s.house.d / 2, s.house.yaw);
    circle(s.keeper.x, s.keeper.z, 0.4);
  }
  for (const h of HOUSES) box(h.x, h.z, h.w / 2, h.d / 2, h.yaw);
  for (const c of CRATES) box(c.x, c.z, 0.4 * c.s, 0.4 * c.s, c.yaw);
  for (const l of LAMPS) circle(l.x, l.z, 0.12);
  circle(FOUNTAIN.x, FOUNTAIN.z, FOUNTAIN.r);
  return out;
}

/** Waypoints for the ★ marker on the way to the town (either route). */
export const ROUTE_MARKERS: Record<ZoneId, Vec2> = {
  forest1: { x: 76, z: -186 },
  camp: { x: 76, z: -199 },
  grove: { x: 58, z: -244 },
  canopy: { x: 95, z: -244.5 },
  oldTrail: { x: 76, z: -240 },
  causeway: { x: 76, z: -256 },
  coast: { x: 76, z: -290 },
  port: { x: SERVICES.harbor.keeper.x, z: SERVICES.harbor.keeper.z }
};
