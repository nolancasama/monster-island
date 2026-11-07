import type { ObstacleId, Text, Vec2 } from "../types";
import type { SolidShape } from "./island";
import { bridgeSurfaceY } from "./bridge";
import { GROVE_STREAM_FERRY } from "./groveStream";
import { GROVE_STREAM } from "./groveStream";
import { SECRET_IDS, SECRET_SITES, type CaveSecretId, type SecretId } from "./elementObjects";
import type { RelicId } from "../logic/act2";
import { CANOPY_GAPS, CANOPY_VOIDS, HOME_PONDS, ISLET, POND, canopyGapDeck } from "./hazards";
import { LAYER_WORLDS, type LayerZone } from "./layers";
import type { Layer } from "./region";
export { CANOPY_GAPS, ISLET, POND } from "./hazards";

/**
 * Act 2: the prehistoric lowland below the sanctuary's cliff, north of the
 * volcano, down to a harbour on the island's north coast.
 *
 *            LUMO'S SANCTUARY (ledge, rope)
 *                     |
 *        PRIMEVAL FOREST BASE
 *           /                    \
 *     LEFT ARM      MESA       RIGHT ARM
 *           |    (inaccessible)   |
 *   FLOODED GROVE          ANCIENT CANOPY (raised roots, two gaps)
 *           \                    /
 *              RUINED CAUSEWAY (+ shrine)
 *                     |
 *               COASTAL PATH
 *                     |
 *                 PORT TOWN → sea
 *
 * Pure geometry, no imports from island.ts (island.ts blends lowlandY into
 * the island's ground). Walkable land is a union of shapes (rectangles,
 * trails with a half-width, discs) minus cut-outs (the pond, the canopy
 * gaps, the mesa) plus decks that permanent unlocks add.
 */

export const STAGES = ["forest1", "grove", "canopy", "causeway", "coast"] as const;
export type StageId = (typeof STAGES)[number];

/** Ground zones plus the optional zones on the cave and high layers (not stages). */
export type GroundZoneId = "forest1" | "grove" | "canopy" | "causeway" | "coast" | "port";
export type ZoneId = GroundZoneId | LayerZone;

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
  top: { x: 75.5, z: -149.8 },
};
/** Walkable lowland never reaches further south than this (the foot of the cliff). */
export const CLIFF_FOOT_Z = -153.6;

export interface ClimbRope {
  x: number;
  stakeZ: number;
  lipZ: number;
  faceZ: number;
  hangZ: number;
  bodyZ: number;
  foot: Vec2;
  top: Vec2;
  /** Player yaw toward the face; the sanctuary rope keeps its existing zero. */
  facing?: number;
  /** Traversal layers at each end (default ground): the climb switches layer. */
  footLayer?: Layer;
  topLayer?: Layer;
}

/** Separate floor and deck stands: a rope is the only way across each face. */
export const CANOPY_ROPES = {
  entrance: {
    x: 107.5, stakeZ: -201.5, lipZ: -200.5, faceZ: -200.5, hangZ: -200.18, bodyZ: -199.85,
    foot: { x: 107.5, z: -198.9 }, top: { x: 107.5, z: -202.2 }, facing: Math.PI,
  },
  exit: {
    x: 96, stakeZ: -240.3, lipZ: -241, faceZ: -241, hangZ: -241.32, bodyZ: -241.65,
    foot: { x: 96, z: -242.8 }, top: { x: 96, z: -239.8 }, facing: 0,
  },
} satisfies Record<"entrance" | "exit", ClimbRope>;

// ------------------------------------------------------------------ zones

export const FOREST1_TRAIL: Array<[number, number]> = [
  [75.5, -153.8],
  [73.5, -161],
  [78.5, -169],
  [73.5, -178],
  [76, -181],
];
/** Each route starts at its first-clear neck and joins its next stage directly. */
export const FOREST_ARMS: Record<"left" | "right", Array<[number, number]>> = {
  left: [[58, -172], [47, -175], [42, -185], [42, -197], [42, -204], [45.5, -207]],
  // Approach the entrance rope through the ordinary forest floor.
  right: [[94, -170], [104, -174], [113, -184], [113, -183], [108.6, -183], [107.5, -184.5]],
};
export const GROVE_TRAIL: Array<[number, number]> = [
  [51, -211],
  [45.5, -223],
  [49, -235],
  [58, -244.5],
];
export const CANOPY_TRAIL: Array<[number, number]> = [
  [102, -205],
  [106, -212],
  [106, -232],
  [96, -238],
  [96, -252],
];
export const COAST_TRAIL: Array<[number, number]> = [
  [76, -263.5],
  [76, -266],
  [68, -269],
  [70, -273],
  [80, -276],
  [76, -290.5],
];

export const CAUSEWAY = rect(50, 113, -264.5, -242.5);
export const PORT = rect(54, 100, -322.5, -289.5);
export const PIER2 = { x: 76, half: 1.2, z0: -337, z1: -322, deckY: 0.55 };
export const SHRINE = disc(106.5, -251.5, 4.8);
/** Full statue silhouettes sit at least .6m beyond the east walk boundary. */
export const SHRINE_STATUES = [{ x: 114.2, z: -253.7 }, { x: 114.2, z: -249.3 }];
export const GROVE_DOOR = { x: 56, z: -241.4, half: 1.85, postWidth: .8, depth: .4, height: 3.6, openAngle: Math.PI };
export const GROVE_DOOR_RETURNS = [
  { ax: 53.35, az: -241.4, bx: 52.8, bz: -240, r: .4 },
  { ax: 58.65, az: -241.4, bx: 59.2, bz: -240, r: .4 },
];
/** A restored save starts open; a live clear waits for approach from either side. */
export const groveDoorOpen = (cleared: boolean, distance: number, wasOpen: boolean, loading = false) =>
  cleared && (loading || wasOpen || distance < 7);

/** The cave mouth on the mesa's west face (Grove south bank). The ground pocket
 * reaches the rock's 1.5 m clearance; the cave layer's floor overlaps it from
 * x0, and the portal line at portalX switches layer (world/cave.ts). */
export const CAVE_MOUTH = { z: -227, portalX: 69.6, x0: 67, x1: 73.6, z0: -229, z1: -225, groundX1: 70.8 };

/** Central rock footprint shared by the landmark and collision. Never add walk shapes here. */
export const MESA_OUTLINE: Array<[number, number]> = [
  [69, -187], [83, -188], [89, -197], [82.1, -204],
  [81, -213], [81, -225], [80, -231], [73, -231],
  [72, -222], [72, -211], [71, -204], [65, -198],
];
export const MESA_BOUNDS = {
  x0: Math.min(...MESA_OUTLINE.map(p => p[0])), x1: Math.max(...MESA_OUTLINE.map(p => p[0])),
  z0: Math.min(...MESA_OUTLINE.map(p => p[1])), z1: Math.max(...MESA_OUTLINE.map(p => p[1])),
};
const MESA_EDGE = [...MESA_OUTLINE, MESA_OUTLINE[0]];
/** Includes an optional clearance outside the closed outline. */
export function inMesa(x: number, z: number, clearance = 0): boolean {
  if (x < MESA_BOUNDS.x0 - clearance || x > MESA_BOUNDS.x1 + clearance || z < MESA_BOUNDS.z0 - clearance || z > MESA_BOUNDS.z1 + clearance) return false;
  let within = false;
  for (let i = 0, j = MESA_OUTLINE.length - 1; i < MESA_OUTLINE.length; j = i++) {
    const [ax, az] = MESA_OUTLINE[i], [bx, bz] = MESA_OUTLINE[j];
    if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) within = !within;
  }
  return within || nearestOnTrail(MESA_EDGE, x, z).d <= clearance;
}

/** The pond in the grove with its islet (reached on Bubbo's lily pads). */
export const GROVE_CROSSING = {
  near: { x: 45.6, z: -223.2 },
  landing: { x: 36.8, z: -223.2 },
  friendLanding: { x: 34.6, z: -221.2 },
  swimEnd: { x: 39.6, z: -223.2 },
};
export const LILY_PAD_R = 1.1;
export const LILY_PADS: Vec2[] = [
  { x: 42.6, z: -223.4 },
  { x: 41.4, z: -226.0 },
  { x: 38.7, z: -227.5 },
];
/** Independent, sequential rise; geometry and terrain never depend on this value. */
export function lilyPadRise(unlock: number, index: number): number {
  return Math.max(0, Math.min(1, unlock * LILY_PADS.length - index));
}

/** The raised root route: height profile along CANOPY_TRAIL and its two gaps. */
export const CANOPY_HEIGHT = 10;
/** Gaps in the root walk (x is the trail's straight north-south stretch). */
export const DECK_HALF = 0.95;

/** Rectangular authored polygons are kept separate at each void edge. The mesh
 * and walking footprints are derived from the same vertices, never a heightfield. */
const canopyDeck = (id: string, x0: number, x1: number, z0: number, z1: number) => ({
  id, walk: rect(x0, x1, z0, z1), pts: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]] as Array<[number, number]>,
});
export const CANOPY_DECKS = [
  canopyDeck("armApproach", 92, 111, -204, -200.5),
  canopyDeck("cliffsideClearingSouth", 85, 119, -209, -204),
  canopyDeck("cliffsideClearing", 83, 119, -216, -209),
  canopyDeck("brokenBridgeSouth", 83, 119, -221.2, -219.5),
  canopyDeck("brokenBridge", 98, 111, -223.8, -221.2),
  canopyDeck("brokenBridgeNorth", 83, 119, -225.5, -223.8),
  canopyDeck("treeRingSouth", 83, 119, -230, -229),
  canopyDeck("treeRingWest", 83, 88, -234, -230),
  canopyDeck("treeRingEast", 92, 110, -234, -230),
  canopyDeck("upperRootSouth", 110, 119, -232.5, -230),
  canopyDeck("upperRootEast", 117, 119, -234, -232.5),
  canopyDeck("upperRootNorth", 83, 119, -237.1, -234),
  canopyDeck("exitLanding", 92, 100, -241, -237.1),
];
export const CANOPY_ENCOUNTERS = [
  { name: "Cliffside Clearing", x: 89, z: -213 },
  { name: "Broken Bridge", x: 99.5, z: -222.5 },
  { name: "Tree-Ring Arena", x: 93, z: -232 },
  { name: "Upper Root Walkway", x: 105.2, z: -230.6 },
] as const;

export interface ZoneDef {
  id: ZoneId;
  name: Text;
  /** Enemies live here and the companion takes its combat position. */
  hostile: boolean;
  walk: WalkShape[];
}

export const ZONES: Record<ZoneId, ZoneDef> = {
  // Layer zones: their walking surfaces live in their LayerWorld (world/layers.ts),
  // never in these ground walk lists.
  cave: { id: "cave", name: { en: "Mountain Cave", ja: "やまの どうくつ" }, hostile: true, walk: [] },
  upperCanopy: { id: "upperCanopy", name: { en: "Upper Canopy", ja: "こずえの うえ" }, hostile: true, walk: [] },
  summit: { id: "summit", name: { en: "Mountain Summit", ja: "やまの てっぺん" }, hostile: false, walk: [] },
  port: {
    id: "port",
    name: { en: "Port Town", ja: "みなとまち" },
    hostile: false,
    walk: [PORT, rect(PIER2.x - PIER2.half, PIER2.x + PIER2.half, PIER2.z0, PIER2.z1 + 0.5)],
  },
  canopy: {
    id: "canopy",
    name: { en: "Ancient Canopy", ja: "こだいの きのうえ" },
    hostile: true,
    walk: CANOPY_DECKS.map(deck => deck.walk),
  },
  grove: {
    id: "grove",
    name: { en: "Flooded Grove", ja: "みずびたしの もり" },
    hostile: true,
    walk: [
      trail(GROVE_TRAIL, 3.8),
      disc(50.5, -212.5, 6),
      disc(47.5, -233, 5.5),
      disc(ISLET.x, ISLET.z, ISLET.r),
      disc(51, -211, 11.6),
      disc(48, -232.5, 11.6),
      rect(48.5, 63.4, -207, -186),
      rect(51, 69, -240, -205),
      // The cave mouth's approach, up to the mesa's clearance (it stays solid rock).
      rect(66.5, CAVE_MOUTH.groundX1, CAVE_MOUTH.z0, CAVE_MOUTH.z1),
      rect(32, 51.5, -240, -203),
      rect(51, 67.8, -205, -203),
      rect(51, 65.8, -203, -201),
      rect(33, 37.5, -206, -186),
      trail(
        [
          [49, -207],
          [37, -210],
          [34, -217],
          [43, -218],
        ],
        2.5,
      ),
      trail(
        [
          [45, -228],
          [36, -232],
          [40, -238],
          [50, -238],
        ],
        2.8,
      ),
    ],
  },
  causeway: {
    id: "causeway",
    name: { en: "Ruined Causeway", ja: "いせきの いしみち" },
    hostile: true,
    walk: [CAUSEWAY, rect(92, 100, -244, -241), rect(44, 52, -257, -250), SHRINE, rect(99, 104, -254, -249)],
  },
  coast: {
    id: "coast",
    name: { en: "Coastal Path", ja: "うみべの みち" },
    hostile: true,
    walk: [
      trail(COAST_TRAIL, 5),
      disc(66, -272, 8),
      disc(84, -280, 8),
      trail(
        [
          [71, -267],
          [62, -271],
          [64, -280],
          [74, -285],
        ],
        2.8,
      ),
    ],
  },
  forest1: {
    id: "forest1",
    name: { en: "Primeval Forest", ja: "げんしの もり" },
    hostile: true,
    walk: [
      trail(FOREST1_TRAIL, 4.2),
      // Forest floor and its broad northern opening, short of the east gate cut.
      disc(88, -160, 5.5),
      rect(79, 93.2, -172, -158),
      trail([[79, -161], [88, -160]], 2.6),
      trail([[64, -174], ...FOREST_ARMS.left], 4),
      trail([[88, -170], ...FOREST_ARMS.right], 4.5),
      disc(43, -189, 4.8),
      disc(113, -187, 5),
      // Retain the optional enemy's ground pocket beside the new entrance,
      // without retaining the old diagonal ascent into the Canopy.
      rect(111, 117.5, -196, -184),
      rect(104, 111, -200.5, -184.5),
      disc(76.5, -168, 7.3),
      disc(74.5, -178.5, 6.8),
      disc(68, -166, 8.3),
      disc(83, -175, 8.3),
      trail(
        [
          [70, -160],
          [63, -165],
          [64, -174],
          [73.5, -178],
        ],
        2.8,
      ),
      trail(
        [
          [79, -168],
          [88, -170],
          [88, -179],
          [77, -182],
        ],
        2.6,
      ),
    ],
  },
};
/** Overlaps are decided in this order (the town before the coast). */
export const ZONE_ORDER: GroundZoneId[] = ["port", "canopy", "grove", "causeway", "coast", "forest1"];

type Bounds = { x0: number; x1: number; z0: number; z1: number };
function shapeBounds(sh: WalkShape): Bounds {
  if (sh.kind === "rect") return sh;
  if (sh.kind === "disc") return { x0: sh.x - sh.r, x1: sh.x + sh.r, z0: sh.z - sh.r, z1: sh.z + sh.r };
  return { x0: Math.min(...sh.pts.map(p => p[0])) - sh.w, x1: Math.max(...sh.pts.map(p => p[0])) + sh.w,
    z0: Math.min(...sh.pts.map(p => p[1])) - sh.w, z1: Math.max(...sh.pts.map(p => p[1])) + sh.w };
}
const WALK_BOUNDS = new Map(Object.values(ZONES).flatMap(zone => zone.walk.map(sh => [sh, shapeBounds(sh)] as const)));
const boundsContain = (b: Bounds, x: number, z: number, pad = 0) => x >= b.x0 - pad && x <= b.x1 + pad && z >= b.z0 - pad && z <= b.z1 + pad;
const inWalk = (sh: WalkShape, x: number, z: number, m: number) => boundsContain(WALK_BOUNDS.get(sh)!, x, z) && inside(sh, x, z, m);
const canopyUnion = (x: number, z: number) => ZONES.canopy.walk.some(sh => inWalk(sh, x, z, 0));

/** The zone at a point on a layer (null outside that layer's walkable land).
 * Pure geometry: the layer is explicit and defaults to the ground. */
export function zoneAt(x: number, z: number, layer: Layer = "ground"): ZoneId | null {
  if (layer !== "ground") return LAYER_WORLDS[layer]?.zoneAt(x, z) ?? null;
  if (z > CLIFF_FOOT_Z + 0.5) return null;
  if (inMesa(x, z, 1.5)) return null;
  if (x >= 83 && x <= 119 && z >= -237 && z <= -205) return "canopy";
  for (const id of ZONE_ORDER) if (ZONES[id].walk.some((sh) => inWalk(sh, x, z, 0))) return id;
  return null;
}

// ------------------------------------------------------------------ walking

/** Permanent unlocks in the lowland. */
export interface LowlandGates {
  solved: readonly ObstacleId[];
  cleared?: readonly StageId[];
}

/** The deck runs a metre onto the root walk at each end, so its ends overlap the land by more than a body width. */
export function gapDeck(id: keyof typeof CANOPY_GAPS): Rect {
  return canopyGapDeck(id);
}
/** The town wall's footprint on each side of the gate, always shut. */
const PORT_WALL_CUTS = [rect(19, 72.6, -289.2, -287.6), rect(79.4, 135, -289.2, -287.6)];
/** Closed, visible deck faces: these cuts apply to every kind of walker. */
export const CANOPY_ROPE_CUTS = [rect(91.8, 111.2, -200.62, -200.38), rect(91.8, 100.2, -241.12, -240.88)];

/** True when a circle of radius m fits the lowland's open land (solid scenery is checked separately). */
export function lowlandWalkable(x: number, z: number, g: LowlandGates, m: number): boolean {
  if (z > CLIFF_FOOT_Z - m) return false;
  if (inMesa(x, z, 1.5 + m)) return false;
  const solved = g.solved;
  // The two narrow branch crossings retain their original walking footprints.
  for (const t of STAGE_PASSAGES)
    if (inPassageBand(t, x, z) && (t.x0 !== 19 || z <= -240)) {
      if (!inside(t.walk, x, z, m)) return false;
    }
  for (const gate of STAGE_EXITS) if (!g.cleared?.includes(gate.id) && touches(gate.cut, x, z, m)) return false;
  for (const wall of PORT_WALL_CUTS) if (touches(wall, x, z, m)) return false;
  for (const face of CANOPY_ROPE_CUTS) if (touches(face, x, z, m)) return false;
  // Decks added by unlocks (narrower than the gaps they span).
  if (solved.includes("groveLilies") && (LILY_PADS.some(p => Math.hypot(x - p.x, z - p.z) <= Math.max(.25, LILY_PAD_R - Math.min(m, .35))) || inside(disc(ISLET.x, ISLET.z, ISLET.r), x, z, m))) return true;
  for (const id of ["canopyVines", "canopyRope"] as const) {
    const deck = gapDeck(id);
    // Banks and bridge are one joined surface. Shrink the exposed sides;
    // shrinking its overlapping ends as well leaves a mounted-body crack.
    if (solved.includes(id) && x >= deck.x0 + m && x <= deck.x1 - m && z >= deck.z0 && z <= deck.z1) return true;
  }
  for (const h of LOWLAND_HAZARDS) {
    if (!touches(h.shape, x, z, m)) continue;
    if (h.safe?.some(s => (!h.safeWhen || solved.includes(h.safeWhen as ObstacleId)) && inside(s, x, z, m))) continue;
    return false;
  }
  if (x >= 83 && x <= 119 && z <= -184.5 && z >= -252 && canopyUnion(x, z)) {
    // Adjacent deck polygons share edges; shrink the union rather than each
    // tile, so an authored seam cannot become an invisible collision crack.
    if (m === 0 || CIRCLE_PROBES.every(([dx, dz]) => canopyUnion(x + dx * m, z + dz * m))) return true;
  }
  for (const id of ZONE_ORDER) for (const sh of ZONES[id].walk) if (inWalk(sh, x, z, m)) return true;
  return false;
}
const LOWLAND_HAZARDS = [...CANOPY_VOIDS, ...HOME_PONDS];
const EXTRA_POOL_SHAPES = HOME_PONDS.slice(1).map(h => h.shape);
const CIRCLE_PROBES = Array.from({length: 16}, (_, i) => [Math.cos(i * Math.PI / 8), Math.sin(i * Math.PI / 8)]);

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

/** The raised route is an authored deck; the heightfield stays on the forest floor. */
export const canopyRaise = (_x: number, _z: number): number => 0;

/** Absolute authored top, shared by rendered vertices, bridges and standY. */
export function canopyDeckY(x: number, z: number): number {
  const y = base(x, z) + bumps(x, z);
  // Level exit landing, gently joined to the existing upper-root platform.
  const landing = base(96, -252) + CANOPY_HEIGHT;
  return (y + CANOPY_HEIGHT) * smooth((z + 237.1) / 3.1) + landing * (1 - smooth((z + 237.1) / 3.1));
}
export const canopySurfaceY = canopyDeckY;

/** Shallow streams through the grove (decor water over a slight channel). */
export const STREAMS: Array<Array<[number, number]>> = [
  [
    [36, -212],
    [42, -213],
    [49, -216],
    [56, -215],
  ],
  [
    [36, -235],
    [43, -233],
    [51, -231],
    [56, -233],
  ],
  GROVE_STREAM.pts,
  [
    [33, -239],
    [44, -240.5],
    [55, -237],
    [63, -232],
  ],
  [
    [44, -214],
    [41.5, -219],
  ],
];

/** Terrain height of the lowland (before the island's blending). */
export function lowlandY(x: number, z: number): number {
  let y = base(x, z);
  const flat = Math.max(rectMask(CAUSEWAY, x, z, 2), rectMask(PORT, x, z, 3));
  y += bumps(x, z) * (1 - flat);
  y += forestBankY(x, z);
  // The pond (its islet stands up out of it) and the stream channels.
  const pr = Math.hypot(x - POND.x, z - POND.z);
  if (pr < POND.r + 1.5) {
    const ir = Math.hypot(x - ISLET.x, z - ISLET.z);
    y -= 0.95 * (1 - smooth((pr - POND.r + 1.2) / 1.6)) * smooth((ir - ISLET.r + 0.4) / 0.8);
  }
  for (const p of EXTRA_POOL_SHAPES) {
    if (p.kind !== "disc") continue;
    const distance = Math.hypot(x - p.x, z - p.z);
    if (distance < p.r + 1) y -= .95 * (1 - smooth((distance - p.r + .3) / 1.3));
  }
  if (x < 70 && z < -200 && z > -246) {
    for (const st of STREAMS) {
      const d = nearestOnTrail(st, x, z).d;
      if (st === GROVE_STREAM.pts) {
        if (d < GROVE_STREAM.w + .8) y -= 1.35 * (1 - smooth((d - 1.1) / 2.3));
      } else if (d < 2.4) y -= 0.32 * (1 - smooth((d - 0.7) / 1.5));
    }
  }
  // Hills close the basin east and west, then fall into the sea; the north coast falls past the town.
  const west = Math.max(32 - x, 0);
  const east = Math.max(x - 114, 0);
  y += 5 * smooth(Math.max(west, east) / 6);
  const sea = Math.max(26 - x, x - 124, -323 - z, 0);
  y -= sea * 2.4;
  // Keep the visible forest floor well below every elevated lip, including
  // the east basin hill. The entrance and exit faces have no ramps.
  if (x >= 81 && x <= 121 && z <= -204 && z >= -237.2 && (z <= -205 || x < 92 || x > 108)) y = Math.min(y, base(x, z) + bumps(x, z));
  return Math.max(y, -4.5);
}

function rectMask(r: Rect, x: number, z: number, fade: number): number {
  const out = Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
  return 1 - smooth(out / fade);
}

export const POND_Y = base(POND.x, POND.z) - 0.35;
export const streamY = (x: number, z: number) => base(x, z) - 0.12;

export function lowlandBridgeY(id: keyof typeof CANOPY_GAPS, x: number, z: number): number {
  const deck = gapDeck(id);
  return bridgeSurfaceY(x, z, deck.z0, deck.z1, canopyDeckY);
}

/** Height of a walking surface added by an unlock (bridge decks, lily pads, the pier), or -Infinity. */
export function lowlandDeckY(x: number, z: number, solved: readonly ObstacleId[]): number {
  if (Math.abs(x - PIER2.x) <= PIER2.half && z >= PIER2.z0 && z <= PIER2.z1 + 0.6) return base(PIER2.x, PIER2.z1) + PIER2.deckY;
  for (const id of ["canopyVines", "canopyRope"] as const) {
    const g = CANOPY_GAPS[id];
    const deck = gapDeck(id);
    if (solved.includes(id) && Math.abs(x - g.x) <= DECK_HALF + 0.3 && z >= deck.z0 && z <= deck.z1)
      return lowlandBridgeY(id, x, z);
  }
  if (solved.includes("groveLilies") && LILY_PADS.some(p => Math.hypot(x - p.x, z - p.z) <= LILY_PAD_R)) return POND_Y + 0.1;
  if (x >= 83 && x <= 119 && z <= -184.5 && z >= -252 && canopyUnion(x, z) &&
      !CANOPY_VOIDS.some(h => touches(h.shape, x, z, 0))) return canopyDeckY(x, z);
  return -Infinity;
}

// ------------------------------------------------------------------ places

export const FORK_SIGN = { x: 76.5, z: -175, yaw: 0 };

export interface ChestDef {
  id: string;
  secret?: SecretId | CaveSecretId;
  /** Traversal layer (default ground) for the cave's and summit's chests. */
  layer?: Layer;
  /** Each chest is several draws: optional ones stay out of long views. */
  close?: true;
  x: number;
  z: number;
  yaw: number;
  coins: number;
  amber: number;
  food?: { id: "apples" | "fish" | "berries" | "meat"; n: number };
  /** A unique treasure, granted once (act2.relics). */
  relic?: RelicId;
}
export const CHESTS: ChestDef[] = [
  // The tutorial chest at the end of the first forest: food to learn eating, and the first amber.
  { id: "forestChest", x: 79.3, z: -183.4, yaw: -0.5, coins: 15, amber: 1, food: { id: "apples", n: 2 } },
  { id: "isletChest", x: 34.9, z: -223.4, yaw: 1.5, coins: 30, amber: 1, food: { id: "fish", n: 2 } },
  { id: "canopyChest", x: 107.3, z: -222.4, yaw: -1.4, coins: 25, amber: 0, food: { id: "berries", n: 2 } },
  { id: "ruinCache", x: 46.5, z: -254, yaw: 0.7, coins: 20, amber: 0, food: { id: "meat", n: 1 } },
  { id: "rootHollowChest", x: 63, z: -170, yaw: 0.7, coins: 12, amber: 0, food: { id: "berries", n: 1 } },
  { id: "coastChest", x: 62.8, z: -275.5, yaw: 1, coins: 18, amber: 0, food: { id: "fish", n: 1 } },
  { id: "shrineChest", x: 108.6, z: -252.6, yaw: -1.6, coins: 40, amber: 1, food: { id: "meat", n: 2 } },
  { id: "groveHiddenCache", close: true, x: 61, z: -201, yaw: .5, coins: 25, amber: 1 },
  { id: "canopyTreasureLedge", close: true, x: 85.5, z: -210, yaw: -.5, coins: 25, amber: 1 },
  ...SECRET_IDS.map(secret => ({ id: `${secret}Chest`, secret, ...SECRET_SITES[secret].chest, yaw: 0, coins: 20, amber: 1 })),
  // Behind Leafy's root seal at the back of the cave (cave layer; see world/cave.ts CAVE_CHEST).
  { id: "caveRootSealChest", secret: "caveRootSeal", layer: "cave", close: true, x: 74.15, z: -199.35, yaw: -1.13, coins: 45, amber: 2, relic: "caveCrystal" },
];

/** Where the student stands to ask for each Act 2 unlock, and what it looks at. */
export const ACT2_OBSTACLE_PLACE: Record<"groveStream" | "groveLilies" | "canopyVines" | "canopyRope" | "canopyAscentRope" | "caveTorches", Vec2 & { face: Vec2 }> = {
  // In front of the cave mouth, facing the north brazier (Ember lights it).
  caveTorches: { x: 67.4, z: -226.2, face: { x: 69.9, z: -224.55 } },
  groveStream: { ...GROVE_STREAM_FERRY.north, face: { ...GROVE_STREAM_FERRY.south } },
  canopyAscentRope: { ...CANOPY_ROPES.entrance.foot, face: { x: CANOPY_ROPES.entrance.x, z: CANOPY_ROPES.entrance.faceZ } },
  groveLilies: { ...GROVE_CROSSING.near, face: { ...GROVE_CROSSING.landing } },
  canopyVines: { x: 106, z: -214.6, face: { x: 106, z: -218 } },
  canopyRope: { x: 106, z: -224.2, face: { x: 106, z: -227.5 } },
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
  market: {
    id: "market",
    name: { en: "Food Market", ja: "たべものの おみせ" },
    house: { x: 61, z: -299, w: 6, d: 4, yaw: Math.PI / 2 },
    keeper: { x: 64.6, z: -299, yaw: Math.PI / 2 },
  },
  kitchen: {
    id: "kitchen",
    name: { en: "Treat Kitchen", ja: "おやつの キッチン" },
    house: { x: 93, z: -299, w: 6, d: 4.5, yaw: -Math.PI / 2 },
    keeper: { x: 89.2, z: -299, yaw: -Math.PI / 2 },
  },
  trainer: {
    id: "trainer",
    name: { en: "Monster Trainer", ja: "モンスタートレーナー" },
    house: { x: 60.5, z: -312, w: 5.5, d: 5, yaw: Math.PI / 2 },
    keeper: { x: 64.4, z: -312, yaw: Math.PI / 2 },
  },
  inn: {
    id: "inn",
    name: { en: "Seaside Inn", ja: "うみべの やど" },
    house: { x: 93.5, z: -312, w: 6, d: 6, yaw: -Math.PI / 2 },
    keeper: { x: 89.3, z: -312, yaw: -Math.PI / 2 },
  },
  harbor: {
    id: "harbor",
    name: { en: "Harbor Office", ja: "みなとの じむしょ" },
    house: { x: 66, z: -319.5, w: 7, d: 4, yaw: Math.PI },
    keeper: { x: 69.8, z: -316.6, yaw: Math.PI },
  },
};
export const FOUNTAIN = { x: 77, z: -306, r: 1.6 };
/** Maple waits on the quay once the town is reached. */
export const MAPLE_PORT = { x: 80.5, z: -317.5, yaw: Math.PI * 0.85 };
export const TOWN_GATE = { x: 76, z: -289.5 };
/** The town's landward fortification, running east and west of the gate. */
export const PORT_WALL = { z: -288.4, x0: 46, x1: 108, thick: 1.6, gateHalf: 3.4, height: 4.6, towerHeight: 7.4, towerR: 2 };
/** Opens on approach once the coast is cleared, and never closes again. */
export const townGateOpen = (cleared: boolean, portFound: boolean, distance: number, wasOpen: boolean) =>
  cleared && (portFound || wasOpen || distance < 9);

/** Canopy approach: progressively larger trunks, with their full buttress feet solid. */
export const RIGHT_ARM_TREES: Array<Vec2 & { r: number; h: number; footR: number }> = [
  { x: 103.5, z: -181, r: 1.05, h: 15, footR: 2.1 },
  { x: 118.3, z: -189, r: 1.15, h: 17, footR: 2.3 },
  { x: 101, z: -195, r: 1.25, h: 19, footR: 2.5 },
];
/** Absolute endpoints shared by the visible exposed roots and their collision. */
export const RIGHT_ARM_ROOTS = [
  { ax: 103.5, az: -181, bx: 101, bz: -182.2, r: .42 },
  { ax: 103.5, az: -181, bx: 104, bz: -184, r: .36 },
  { ax: 118.3, az: -189, bx: 120.4, bz: -191, r: .5 },
  { ax: 118.3, az: -189, bx: 119.7, bz: -186.3, r: .4 },
  { ax: 101, az: -195, bx: 98.6, bz: -194.8, r: .55 },
  { ax: 101, az: -195, bx: 100.6, bz: -192.5, r: .45 },
];
export const RIGHT_ARM_BOULDERS: Array<Vec2 & { r: number; h: number }> = [
  { x: 115.5, z: -198, r: .7, h: .9 },
  { x: 115, z: -201, r: 1, h: 1.35 },
];
/** Covers the rendered buttresses and the boulder builder's maximum radial jitter. */
export const RIGHT_ARM_SOLIDS: SolidShape[] = [
  ...RIGHT_ARM_TREES.map(t => ({ kind: "circle" as const, x: t.x, z: t.z, r: t.footR })),
  ...RIGHT_ARM_ROOTS.map(root => ({ kind: "capsule" as const, ...root })),
  ...RIGHT_ARM_BOULDERS.map(b => ({ kind: "circle" as const, x: b.x, z: b.z, r: b.r * 1.16 })),
];

/** Big trees standing inside walkable clearings (solid trunks). */
export const GIANT_TREES: Array<Vec2 & { r: number; h: number }> = [
  { x: 81.3, z: -163.4, r: 1.05, h: 15 },
  { x: 70.4, z: -170.4, r: 1.2, h: 17 },
  { x: 79.9, z: -180.3, r: 1, h: 14 },
  { x: 55, z: -203.5, r: 1.1, h: 16 },
  { x: 47.2, z: -217.6, r: 0.9, h: 13 },
  { x: 43.6, z: -235.5, r: 1.15, h: 16 },
  { x: 69.3, z: -194.6, r: 0.95, h: 14 },
  ...RIGHT_ARM_TREES,
  { x: 58, z: -189, r: 1.1, h: 17 },
  { x: 94.8, z: -232.8, r: 1.2, h: 24 },
  { x: 86.5, z: -207, r: 1.1, h: 23 },
  { x: 116.5, z: -215, r: .9, h: 21 },
];
export const MOSSY_BOULDERS: Array<Vec2 & { r: number; h: number }> = [
  { x: 72.2, z: -163.5, r: 0.9, h: 1.1 },
  { x: 80.9, z: -175.2, r: 1.1, h: 1.4 },
  { x: 55.8, z: -201.2, r: 0.8, h: 0.9 },
  { x: 52.7, z: -238.6, r: 1, h: 1.2 },
  { x: 76.5, z: -269.5, r: 2.2, h: 6 },
  { x: 68.5, z: -278, r: 1.2, h: 1.8 },
  { x: 74.5, z: -270.5, r: 0.8, h: 0.9 },
  { x: 80.2, z: -283.4, r: 0.9, h: 1 },
  ...RIGHT_ARM_BOULDERS,
  { x: 63, z: -225, r: 1.1, h: 1.6 },
  { x: 53, z: -194, r: .9, h: 1.3 },
  // The Causeway's north-east corner backs onto a steep bank that hides a
  // player from the fixed lens; boulders fill it so nobody stands there.
  { x: 111.9, z: -243.3, r: 1.35, h: 1.1 },
  { x: 109.9, z: -242.9, r: .85, h: .8 },
  { x: 112.6, z: -244.9, r: .8, h: .7 },
];
export const LOGS: Array<{ ax: number; az: number; bx: number; bz: number; r: number }> = [
  { ax: 65, az: -163, bx: 67, bz: -161, r: 0.35 },
  { ax: 39, az: -235, bx: 41, bz: -237, r: 0.35 },
  { ax: 69.2, az: -175.4, bx: 71.4, bz: -181.4, r: 0.38 },
  { ax: 44.4, az: -204.3, bx: 49.3, bz: -202.1, r: 0.42 },
  { ax: 50.6, az: -229.1, bx: 52.2, bz: -235.2, r: 0.4 },
  { ax: 55, az: -192, bx: 59, bz: -194.3, r: .5 },
  { ax: 53, az: -220, bx: 57, bz: -222, r: .45 },
  { ax: 94.8, az: -232.8, bx: 98, bz: -235.5, r: .45 },
  { ax: 86.5, az: -207, bx: 89.5, bz: -208.5, r: .45 },
];
/** Narrow separations need continuous visible rock/root, shared with solids. */
export const LOWLAND_RIDGES = [
  { ax: 47.2, az: -185.5, bx: 47.2, bz: -201, r: .45 },
  { ax: 47.2, az: -201, bx: 50, bz: -204, r: .45 },
  { ax: 37.75, az: -185.5, bx: 37.75, bz: -204, r: .2 },
  { ax: 86, az: -199, bx: 92, bz: -201, r: .7 },
  { ax: 33, az: -240, bx: 52.8, bz: -240, r: .45 },
  { ax: 59.2, az: -240, bx: 69, bz: -240, r: .45 },
];
/** Half-sunk stones off the forest and Grove fights. The Causeway stays open. */
export const RUIN_PILLARS: Vec2[] = [{ x: 56, z: -191 }, { x: 59, z: -193 }, { x: 64, z: -227 }];

/** One normal enemy: its type and where it lives in its zone. */
export type EnemyKind = "gloomlet" | "snapjaw" | "shellback" | "forestSpitter" | "raiderShooter";
export interface EnemySpawn {
  zone: ZoneId;
  kind: EnemyKind;
  /** Preserve the replaced spawn's HP and rewards while changing its attacks. */
  replaces?: "gloomlet" | "snapjaw" | "shellback";
  /** Arm encounters respawn normally but never count toward the first clear. */
  optional?: true;
  x: number;
  z: number;
}
export const ENEMY_SPAWNS: EnemySpawn[] = [
  // The tutorial: one, then two, then a mixed pair.
  { zone: "forest1", kind: "gloomlet", x: 74.6, z: -162.8 },
  { zone: "forest1", kind: "gloomlet", x: 75.6, z: -170.2 },
  { zone: "forest1", kind: "forestSpitter", replaces: "gloomlet", x: 66.4, z: -167.8 },
  { zone: "forest1", kind: "snapjaw", x: 72.6, z: -178.6 },
  { zone: "forest1", kind: "gloomlet", x: 85, z: -177.2 },
  // The grove: more enemies, simple ground.
  { zone: "grove", kind: "gloomlet", x: 53, z: -216.5 },
  { zone: "grove", kind: "forestSpitter", replaces: "gloomlet", x: 38.8, z: -215.5 },
  { zone: "grove", kind: "snapjaw", x: 51.5, z: -215.5 },
  { zone: "grove", kind: "gloomlet", x: 48.6, z: -216.4 },
  { zone: "grove", kind: "forestSpitter", replaces: "gloomlet", x: 46.4, z: -226.8 },
  { zone: "grove", kind: "snapjaw", x: 48.5, z: -232.2 },
  { zone: "grove", kind: "gloomlet", x: 37.8, z: -233.8 },
  { zone: "grove", kind: "snapjaw", x: 56, z: -239.5 },
  // The canopy: fewer enemies, harder ground.
  { zone: "canopy", kind: "gloomlet", x: 97, z: -203.3 },
  { zone: "canopy", kind: "snapjaw", x: 106, z: -208.6 },
  { zone: "canopy", kind: "forestSpitter", replaces: "gloomlet", x: 105.2, z: -230.6 },
  { zone: "canopy", kind: "snapjaw", x: 112, z: -235 },
  // The causeway: tougher pairs, and the shrine's guards.
  { zone: "causeway", kind: "raiderShooter", replaces: "snapjaw", x: 62, z: -249.3 },
  { zone: "causeway", kind: "shellback", x: 61.4, z: -258.4 },
  { zone: "causeway", kind: "raiderShooter", replaces: "snapjaw", x: 85, z: -247.4 },
  { zone: "causeway", kind: "shellback", x: 91.6, z: -260.1 },
  { zone: "causeway", kind: "gloomlet", x: 103, z: -247.5 },
  { zone: "causeway", kind: "shellback", x: 103.4, z: -251.8 },
  { zone: "causeway", kind: "snapjaw", x: 107.4, z: -248.8 },
  // The coast: a lighter last stretch.
  { zone: "coast", kind: "gloomlet", x: 65.4, z: -272.4 },
  { zone: "coast", kind: "gloomlet", x: 85.2, z: -280.4 },
  { zone: "coast", kind: "raiderShooter", replaces: "snapjaw", x: 77.4, z: -284.6 },
  { zone: "coast", kind: "gloomlet", x: 64, z: -278 },
  { zone: "canopy", kind: "gloomlet", x: 98, z: -207 },
  { zone: "forest1", kind: "gloomlet", x: 49, z: -175, optional: true },
  { zone: "forest1", kind: "snapjaw", x: 42, z: -186, optional: true },
  { zone: "forest1", kind: "gloomlet", x: 42, z: -196, optional: true },
  { zone: "forest1", kind: "gloomlet", x: 103, z: -174, optional: true },
  { zone: "forest1", kind: "snapjaw", x: 113, z: -184, optional: true },
  { zone: "forest1", kind: "gloomlet", x: 113, z: -194, optional: true },
  { zone: "grove", kind: "gloomlet", x: 62, z: -216.5 },
  { zone: "grove", kind: "snapjaw", x: 60, z: -228 },
  { zone: "canopy", kind: "gloomlet", x: 89, z: -213 },
  { zone: "canopy", kind: "snapjaw", x: 99.5, z: -222.5 },
  { zone: "canopy", kind: "gloomlet", x: 93, z: -232 },
  { zone: "canopy", kind: "shellback", x: 101, z: -232 },
  // Ruined Causeway encounter pockets; appended to preserve saved spawn indices.
  { zone: "causeway", kind: "gloomlet", x: 88, z: -248 },
  { zone: "causeway", kind: "raiderShooter", replaces: "snapjaw", x: 96, z: -257 },
  { zone: "causeway", kind: "snapjaw", x: 73, z: -247.5 },
  { zone: "causeway", kind: "shellback", x: 78, z: -259 },
  { zone: "causeway", kind: "gloomlet", x: 68, z: -261 },
  { zone: "causeway", kind: "snapjaw", x: 54, z: -252 },
  { zone: "causeway", kind: "gloomlet", x: 101, z: -259 },
  // The optional cave (cave layer): two gloomlets in the head's bend, far from the chamber.
  { zone: "cave", kind: "gloomlet", x: 83.2, z: -197.3, optional: true },
  { zone: "cave", kind: "gloomlet", x: 80.8, z: -192.3, optional: true },
  // The Upper Canopy (high layer): four small optional pockets, none more than three.
  // Broadleaf Clearing.
  { zone: "upperCanopy", kind: "gloomlet", x: 103.2, z: -225.2, optional: true },
  { zone: "upperCanopy", kind: "gloomlet", x: 105.7, z: -227.3, optional: true },
  // Windward Branch: exposed edges for Puff's wind.
  { zone: "upperCanopy", kind: "gloomlet", x: 109.4, z: -220.0, optional: true },
  { zone: "upperCanopy", kind: "forestSpitter", replaces: "gloomlet", x: 110.3, z: -220.8, optional: true },
  { zone: "upperCanopy", kind: "gloomlet", x: 112.6, z: -217.2, optional: true },
  // Broken Crown.
  { zone: "upperCanopy", kind: "snapjaw", x: 104.8, z: -213.6, optional: true },
  { zone: "upperCanopy", kind: "gloomlet", x: 99.6, z: -215.4, optional: true },
  { zone: "upperCanopy", kind: "gloomlet", x: 94.8, z: -210.6, optional: true },
  // Summit Approach: tougher guards before the last bridge (it is never gated).
  { zone: "upperCanopy", kind: "shellback", x: 90.3, z: -205.5, optional: true },
  { zone: "upperCanopy", kind: "snapjaw", x: 89.4, z: -206.5, optional: true },
  { zone: "upperCanopy", kind: "snapjaw", x: 91.1, z: -204.8, optional: true },
];

/** Town props (scenery placements shared by the scene and collision). */
export const CRATES: Array<Vec2 & { yaw: number; s: number }> = [
  { x: 67.5, z: -296.2, yaw: 0.3, s: 1 },
  { x: 68.6, z: -295.4, yaw: -0.2, s: 0.8 },
  { x: 86.6, z: -321, yaw: 0.5, s: 1 },
  { x: 72.4, z: -321.4, yaw: 0.1, s: 0.9 },
  { x: 98, z: -306, yaw: 0.7, s: 1 },
  { x: 56.4, z: -306.5, yaw: -0.4, s: 0.9 },
];
export const LAMPS: Vec2[] = [
  { x: 70.5, z: -293 },
  { x: 81.5, z: -293 },
  { x: 70.5, z: -309 },
  { x: 83.5, z: -309 },
  { x: 74.2, z: -321.6 },
  { x: 77.8, z: -321.6 },
];
/** Houses along the edges of the town (background, solid). */
export const HOUSES: Array<{ x: number; z: number; w: number; d: number; yaw: number; color: string; roof: string }> = [
  { x: 57.5, z: -292.6, w: 5, d: 4.5, yaw: Math.PI / 2, color: "#f4e3c4", roof: "#d1563b" },
  { x: 96.5, z: -292.6, w: 5, d: 4.5, yaw: -Math.PI / 2, color: "#e8f0f4", roof: "#3c7fb8" },
  { x: 97.4, z: -320, w: 4.5, d: 4.5, yaw: -Math.PI / 2, color: "#fbe9d2", roof: "#5aa053" },
  { x: 56.5, z: -320.2, w: 4.5, d: 4.4, yaw: Math.PI / 2, color: "#f2dbe8", roof: "#d8873a" },
];

/** Solid scenery in the lowland (its own set: only walkers north of the cliff test it). */
export function lowlandSolids(): SolidShape[] {
  const out: SolidShape[] = [];
  const box = (x: number, z: number, hx: number, hz: number, yaw = 0) => out.push({ kind: "box", x, z, hx, hz, yaw });
  const circle = (x: number, z: number, r: number) => out.push({ kind: "circle", x, z, r });
  // A sealed outline and overlapping interior strips reserve solid rock even if
  // a future walk shape is accidentally extended into this footprint.
  for (let i = 0; i < MESA_OUTLINE.length; i++) {
    const [ax, az] = MESA_OUTLINE[i], [bx, bz] = MESA_OUTLINE[(i + 1) % MESA_OUTLINE.length];
    out.push({ kind: "capsule", ax, az, bx, bz, r: 1.5 });
  }
  for (let z = MESA_BOUNDS.z0 + .5; z < MESA_BOUNDS.z1; z++) {
    const xs: number[] = [];
    for (let i = 0; i < MESA_OUTLINE.length; i++) {
      const [ax, az] = MESA_OUTLINE[i], [bx, bz] = MESA_OUTLINE[(i + 1) % MESA_OUTLINE.length];
      if ((az > z) !== (bz > z)) xs.push(ax + (bx - ax) * (z - az) / (bz - az));
    }
    if (xs.length === 2) box((xs[0] + xs[1]) / 2, z, Math.abs(xs[1] - xs[0]) / 2, 0.55);
  }
  for (const t of GIANT_TREES) if (!RIGHT_ARM_TREES.some(arm => arm === t)) circle(t.x, t.z, t.r);
  for (const b of MOSSY_BOULDERS) if (!RIGHT_ARM_BOULDERS.includes(b)) circle(b.x, b.z, b.r * 0.9);
  out.push(...RIGHT_ARM_SOLIDS);
  for (const l of LOGS) out.push({ kind: "capsule", ...l });
  for (const ridge of LOWLAND_RIDGES) out.push({ kind: "capsule", ...ridge });
  for (const p of RUIN_PILLARS) circle(p.x, p.z, 0.6);
  for (const p of SHRINE_STATUES) box(p.x, p.z, .55, .55);
  for (const side of [-1, 1]) box(GROVE_DOOR.x + side * (GROVE_DOOR.half + GROVE_DOOR.postWidth / 2), GROVE_DOOR.z, GROVE_DOOR.postWidth / 2, GROVE_DOOR.depth / 2);
  for (const wall of GROVE_DOOR_RETURNS) out.push({ kind: "capsule", ...wall });
  circle(FORK_SIGN.x, FORK_SIGN.z, 0.12);
  for (const c of CHESTS) if (!c.secret) box(c.x, c.z, 0.5, 0.36, c.yaw);
  for (const s of Object.values(SERVICES)) {
    box(s.house.x, s.house.z, s.house.w / 2, s.house.d / 2, s.house.yaw);
    circle(s.keeper.x, s.keeper.z, 0.4);
  }
  for (const h of HOUSES) box(h.x, h.z, h.w / 2, h.d / 2, h.yaw);
  for (const c of CRATES) box(c.x, c.z, 0.4 * c.s, 0.4 * c.s, c.yaw);
  for (const l of LAMPS) circle(l.x, l.z, 0.12);
  circle(FOUNTAIN.x, FOUNTAIN.z, FOUNTAIN.r);
  for (const side of [-1, 1]) circle(TOWN_GATE.x + side * (PORT_WALL.gateHalf + PORT_WALL.towerR), PORT_WALL.z, PORT_WALL.towerR);
  return out;
}

/** Waypoints for the ★ marker on the way to the town (either route). */
export const ROUTE_MARKERS: Record<GroundZoneId, Vec2> = {
  forest1: { x: 47, z: -175 },
  grove: { x: 58, z: -244 },
  canopy: CANOPY_ROPES.exit.foot,
  causeway: { x: 76, z: -256 },
  coast: { x: 76, z: -290 },
  port: { x: SERVICES.harbor.keeper.x, z: SERVICES.harbor.keeper.z },
};

/** The forest base points toward the nearest arm rather than the closed mesa. */
export function routeMarker(zone: ZoneId, playerX: number): Vec2 | null {
  if (zone === "forest1") return playerX < 76 ? { x: 47, z: -175 } : CANOPY_ROPES.entrance.foot;
  // Optional layer zones lead nowhere on the way to the town.
  return zone in ROUTE_MARKERS ? ROUTE_MARKERS[zone as GroundZoneId] : null;
}

/** Narrow exits span every walkable crossing, including the mounted body radius.
 * Backward routes to the preceding safe area remain open. */
export const STAGE_EXITS: Array<{ id: StageId; x: number; z: number; half: number; orientation: "x" | "z"; kind: "roots" | "reeds" | "stone" | "wood" | "groveDoor"; cut: Rect }> = [
  { id: "forest1", x: 58, z: -172, half: 9, orientation: "z", kind: "roots", cut: rect(57.6, 58.4, -184, -160) },
  { id: "forest1", x: 94, z: -170, half: 9, orientation: "z", kind: "roots", cut: rect(93.6, 94.4, -182, -158) },
  { id: "grove", x: 56, z: -241.4, half: 5.8, orientation: "x", kind: "groveDoor", cut: rect(19, 70, -241.8, -241) },
  { id: "canopy", x: 96, z: -238, half: 6, orientation: "x", kind: "roots", cut: rect(82, 135, -238.4, -237.6) },
  { id: "causeway", x: 76, z: -264, half: 5, orientation: "x", kind: "stone", cut: rect(19, 135, -264.4, -263.6) },
  { id: "coast", x: 76, z: -288, half: 3.4, orientation: "x", kind: "wood", cut: rect(72.6, 79.4, -288.4, -287.6) },
];

/** Draw the real basin from the sanctuary and below; the prologue tunnel stays isolated. */
export function lowlandRegionVisible(x: number, z: number, cameraInTunnel = false): boolean {
  if (cameraInTunnel) return false;
  if (z <= CLIFF_FOOT_Z) return true;
  return x > 55 && x < 91 && z < -125;
}
function shapeDistance(sh: WalkShape, x: number, z: number): number {
  if (sh.kind === "disc") return Math.max(0, Math.hypot(x - sh.x, z - sh.z) - sh.r);
  if (sh.kind === "trail") return Math.max(0, nearestOnTrail(sh.pts, x, z).d - sh.w);
  return Math.hypot(Math.max(sh.x0 - x, 0, x - sh.x1), Math.max(sh.z0 - z, 0, z - sh.z1));
}
/** Banks follow the actual walk shapes, enclosing both arms and the reserved mesa. */
export function forestBankY(x: number, z: number): number {
  if (z > -159 || z < -288 || x < 30 || x > 123) return 0;
  let d = Infinity;
  for (const id of ZONE_ORDER) for (const sh of ZONES[id].walk) {
    const b = WALK_BOUNDS.get(sh)!;
    if (Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1)) >= d) continue;
    d = Math.min(d, shapeDistance(sh, x, z));
  }
  for (const t of STAGE_PASSAGES) if (inPassageBand(t, x, z)) d = shapeDistance(t.walk, x, z);
  let opening = 0;
  for (const gate of STAGE_EXITS.filter(gate => gate.id !== "forest1")) {
    const distance = Math.hypot(Math.max(0, Math.abs(x - gate.x) - gate.half - 3) / 5, (z - gate.z) / 11);
    opening = Math.max(opening, 1 - smooth((distance - 0.6) / 0.9));
  }
  const edge = smooth((-159 - z) / 6) * smooth((z + 288) / 6) * smooth((x - 30) / 4) * smooth((123 - x) / 4);
  return (4 - 3.6 * opening) * smooth((d - 1.2) / 4.5) * edge;
}

/** Curved transition crossings; collision footprints remain independent of the low shoulders. */
export const STAGE_PASSAGES = [
  {
    x0: 19,
    x1: 70,
    z0: -246,
    z1: -237,
    walk: trail(
      [
        [51, -237],
        [56, -239],
        [56, -242],
        [61, -246],
      ],
      1.85,
    ),
  },
  {
    x0: 82,
    x1: 135,
    z0: -242.5,
    z1: -237.1,
    // Restrict the bank above the Causeway only. Below -242.5 its own
    // floor applies, including the encounter pockets beside the flight.
    walk: rect(92, 100, -253, -236),
  },
];
const inPassageBand = (t: (typeof STAGE_PASSAGES)[number], x: number, z: number) => x > t.x0 && x < t.x1 && z > t.z0 && z < t.z1;
