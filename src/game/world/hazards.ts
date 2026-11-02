import type { WalkShape } from "./lowland";
/** Kept here with home voids so collision may import hazard data without a
 * lowland → hazard → cloud → lowland initialisation cycle. */
export const CLOUD_CHASMS = [
  { x0: -48, x1: -20, z0: 311, z1: 313 },
  { x0: -50, x1: -26, z0: 355, z1: 357 },
];
export const COAST_SEA_BRIDGE: WalkShape = { kind: "trail", pts: [[-38, 65], [-45, 69]], w: 1.6 };

export interface Hazard {
  id: string;
  world: "home" | "cloud";
  kind: "splash" | "fall";
  shape: WalkShape;
  safe?: readonly WalkShape[];
  safeWhen?: string;
  /** Slice D consumes this flag; player collision still blocks every edge. */
  playerFall?: boolean;
}

export const POND = { x: 37.6, z: -222.5, r: 6.4 };
export const ISLET = { x: 35.4, z: -223.2, r: 4 };
export const CANOPY_GAPS = {
  canopyVines: { x: 106, z0: -219.5, z1: -216 },
  canopyRope: { x: 106, z0: -229, z1: -225.5 },
};
export const canopyGapDeck = (id: keyof typeof CANOPY_GAPS): Extract<WalkShape, {kind: "rect"}> => {
  const g = CANOPY_GAPS[id];
  return { kind: "rect", x0: g.x - .95, x1: g.x + .95, z0: g.z0 - 1, z1: g.z1 + 1 };
};
/** Shared authored footprints: walking, rendering and displacement use this one list. */
export const HOME_PONDS: readonly Hazard[] = [
  { id: "pond", world: "home", kind: "splash", shape: { kind: "disc", ...POND }, safe: [{ kind: "disc", ...ISLET }] },
  { id: "groveEastPool", world: "home", kind: "splash", shape: { kind: "disc", x: 65, z: -214, r: 2.6 } },
  { id: "groveRootPool", world: "home", kind: "splash", shape: { kind: "disc", x: 60, z: -232, r: 2.7 } },
];
export const CANOPY_VOIDS: readonly Hazard[] = [
  ...Object.entries(CANOPY_GAPS).map(([id, g]): Hazard => ({ id, world: "home", kind: "fall", playerFall: true,
    shape: { kind: "rect", x0: 83, x1: 119, z0: g.z0, z1: g.z1 }, safe: [canopyGapDeck(id as keyof typeof CANOPY_GAPS)], safeWhen: id })),
  { id: "brokenSpanWest", world: "home", kind: "fall", playerFall: true, shape: { kind: "rect", x0: 83, x1: 98, z0: -223.8, z1: -221.2 } },
  { id: "brokenSpanEast", world: "home", kind: "fall", playerFall: true, shape: { kind: "rect", x0: 111, x1: 119, z0: -223.8, z1: -221.2 } },
  { id: "treeRing", world: "home", kind: "fall", playerFall: true, shape: { kind: "rect", x0: 88, x1: 92, z0: -234, z1: -230 } },
  { id: "upperRoot", world: "home", kind: "fall", playerFall: true, shape: { kind: "rect", x0: 110, x1: 117, z0: -234, z1: -232.5 } },
];

/** Explicit water/gap footprints; ordinary unwalkable banks are walls. */
export const HAZARDS: readonly Hazard[] = [
  ...HOME_PONDS,
  ...CANOPY_VOIDS,
  ...CLOUD_CHASMS.map((g, i): Hazard => ({ id: `cloudChasm${i}`, world: "cloud", kind: "fall", shape: { kind: "rect", ...g } })),
  // Authored sea cut on Stormbreak Coast, crossed by the windmill bridge.
  { id: "coastSea", world: "cloud", kind: "splash", shape: { kind: "rect", x0: -43, x1: -40, z0: 60, z1: 79 }, safe: [COAST_SEA_BRIDGE], safeWhen: "coastWindmill" }
];
