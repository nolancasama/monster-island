import { CANOPY_GAPS, ISLET, POND, gapDeck, type WalkShape } from "./lowland";
import { CLOUD_CHASMS, COAST_SEA_BRIDGE } from "./cloudisle";

export interface Hazard {
  id: string;
  world: "home" | "cloud";
  kind: "splash" | "fall";
  shape: WalkShape;
  safe?: readonly WalkShape[];
  safeWhen?: string;
}

/** Explicit water/gap footprints; ordinary unwalkable banks are walls. */
export const HAZARDS: readonly Hazard[] = [
  { id: "pond", world: "home", kind: "splash", shape: { kind: "disc", ...POND }, safe: [{ kind: "disc", ...ISLET }] },
  ...Object.entries(CANOPY_GAPS).map(([id, g]): Hazard => ({ id, world: "home", kind: "fall",
    shape: { kind: "rect", x0: g.x - 14, x1: g.x + 14, z0: g.z0, z1: g.z1 }, safe: [gapDeck(id as keyof typeof CANOPY_GAPS)], safeWhen: id })),
  ...CLOUD_CHASMS.map((g, i): Hazard => ({ id: `cloudChasm${i}`, world: "cloud", kind: "fall", shape: { kind: "rect", ...g } })),
  // Authored sea cut on Stormbreak Coast, crossed by the windmill bridge.
  { id: "coastSea", world: "cloud", kind: "splash", shape: { kind: "rect", x0: -43, x1: -40, z0: 60, z1: 79 }, safe: [COAST_SEA_BRIDGE], safeWhen: "coastWindmill" }
];
