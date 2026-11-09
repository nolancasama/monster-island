import { lowlandWalkable, nearestOnTrail, type WalkShape } from "./lowland";
import { HOME_PONDS } from "./hazards";
import { GROVE_STREAM, GROVE_STREAM_FERRY } from "./groveStream";

/** Ankle water sits over the existing floor; it never adds a splash hazard,
 * changes a walking height, or invalidates a saved stand. */
export const SHALLOW_WATER_DEPTH = .15;
export const SHALLOW_WALK_SPEED = .93;

export const SHALLOW_DRY_ISLANDS = [
  { kind: "disc", x: 50.6, z: -220, r: 1.55 },
  { kind: "disc", x: 57.2, z: -233.2, r: 1.8 },
] as const;

/** The old decorative tributaries here are replaced by this authored swamp. */
export const inGroveSwamp = (x: number, z: number) => x >= 30 && x <= 71 && z >= -240 && z <= -213;

/** Interconnected, round-edged pools on the Grove side of the entrance stream.
 * Rendering, ordinary walking speed and water queries consume this same union. */
export const SHALLOW_WATER: readonly WalkShape[] = [
  { kind: "disc", x: 46, z: -220, r: 11.8 },
  { kind: "disc", x: 57, z: -228, r: 11.5 },
  { kind: "disc", x: 37, z: -232, r: 7.5 },
  { kind: "disc", x: 63, z: -218, r: 8 },
  { kind: "trail", pts: [[34, -215], [34, -231], [48, -237], [62, -235]], w: 3.4 },
  // South-west flats up to the foot of the southern cliff.
  { kind: "rect", x0: 29, x1: 47.5, z0: -236.2, z1: -232 },
];

/** Dry banks, root mounds, and complete interaction/approach pockets. Keeping
 * these cuts in the water data protects them in both queries and the mesh. */
export const SHALLOW_KEEP_OUTS: readonly WalkShape[] = [
  // The deep crossing retains a distinct dry rim; neither ferry stand is wet.
  { ...GROVE_STREAM, w: GROVE_STREAM.w + .6 },
  { kind: "disc", ...GROVE_STREAM_FERRY.south, r: .9 },
  ...HOME_PONDS.filter(p => p.id !== "groveStream").map(p => p.shape.kind === "disc"
    ? { ...p.shape, r: p.shape.r + .8 } : p.shape),
  // Lily ask/landing, pads, pond and islet are one unchanged optional puzzle.
  { kind: "disc", x: 37.6, z: -222.5, r: 7.2 },
  { kind: "disc", x: 45.6, z: -223.2, r: 1.6 },
  // Both mouths and their ground approaches, including the western pocket.
  { kind: "trail", pts: [[63.6, -227], [71, -227]], w: 2.3 },
  { kind: "trail", pts: [[67.7, -216.4], [71, -216.4]], w: 2.1 },
  // Bubbo's key target, reward, and approach remain dry.
  { kind: "trail", pts: [[54.5, -218], [56.8, -218], [60, -214]], w: 2.1 },
  // Dry reeds must remain dry, including the chest and fire approach.
  { kind: "trail", pts: [[60, -221], [66.2, -221]], w: 2.5 },
  // Complete crate-lift pocket: approach, grab/lift ray and reward.
  { kind: "rect", x0: 39.5, x1: 45.2, z0: -236.6, z1: -227.3 },
  // Dry door funnel and the last bank before the Causeway passage.
  { kind: "rect", x0: 48, x1: 65, z0: -248, z1: -237.2 },
  // The steep southern bank: west of the door funnel the floor stays gentle
  // to z≈-236.2 (the rendered cliff lip starts near -237), so ankle water runs up to it;
  // east of the funnel the rendered two-metre shoulders stay dry.
  { kind: "rect", x0: 29, x1: 47.5, z0: -249, z1: -236.2 },
  { kind: "rect", x0: 47.5, x1: 72, z0: -249, z1: -236 },
  // Small grassy islands/root mounds, deliberately away from interaction sites.
  ...SHALLOW_DRY_ISLANDS,
];

export function inShallowShape(shape: WalkShape, x: number, z: number): boolean {
  if (shape.kind === "disc") return Math.hypot(x - shape.x, z - shape.z) <= shape.r;
  if (shape.kind === "rect") return x >= shape.x0 && x <= shape.x1 && z >= shape.z0 && z <= shape.z1;
  return nearestOnTrail(shape.pts, x, z).d <= shape.w;
}

const openFloor = { solved: [], cleared: ["forest1", "grove", "canopy", "causeway", "coast"] } as const;

/** Ground footprint only (world/layer checks belong to the calling query).
 * Clipping to existing floor also excludes the mesa, banks and deep hazards.
 * Solved lily decks never gain ankle water. This has no mutable world state. */
export function shallowWaterAt(x: number, z: number): boolean {
  if (!inGroveSwamp(x, z)) return false;
  return SHALLOW_WATER.some(s => inShallowShape(s, x, z))
    && !SHALLOW_KEEP_OUTS.some(s => inShallowShape(s, x, z))
    && lowlandWalkable(x, z, openFloor, 0);
}
