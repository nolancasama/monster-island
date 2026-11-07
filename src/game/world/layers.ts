import type { Vec2 } from "../types";
import type { SolidShape } from "./island";
import type { Hazard } from "./hazards";
import type { Layer } from "./region";

/**
 * Non-ground traversal layers (the cave inside the mesa, the Upper Canopy and
 * summit). Each content module registers one LayerWorld; the ground layer is
 * the existing lowland/island code and never goes through this registry.
 * Pure data and functions: no store, scene or runtime imports.
 */
export type LayerZone = "cave" | "upperCanopy" | "summit";
export type OtherLayer = Exclude<Layer, "ground">;

export interface LayerWorld {
  /** The layer's zone at a point, or null off its walkable surface. */
  zoneAt(x: number, z: number): LayerZone | null;
  /** True when a circle of radius m fits the layer's open surface (solids are separate). */
  walkable(x: number, z: number, m: number, gates: { solved: readonly string[]; secrets?: readonly string[] }): boolean;
  /** Height of the layer's walking surface, or -Infinity off it. */
  surfaceY(x: number, z: number, solved: readonly string[]): number;
  /** Solid scenery on this layer only. */
  solids: readonly SolidShape[];
  /** Hazards on this layer (falls, water); their `layer` is set by registration. */
  hazards?: readonly Hazard[];
}

export const LAYER_WORLDS: Partial<Record<OtherLayer, LayerWorld>> = {};

export function registerLayerWorld(layer: OtherLayer, world: LayerWorld): LayerWorld & { hazards: Hazard[] } {
  const stored = { ...world, hazards: (world.hazards ?? []).map(h => ({ ...h, layer })) };
  LAYER_WORLDS[layer] = stored;
  return stored;
}
/** Tests register fixture layers and must remove them afterwards. */
export function unregisterLayerWorld(layer: OtherLayer): void {
  delete LAYER_WORLDS[layer];
}

export const LAYER_OF_ZONE: Record<LayerZone, OtherLayer> = { cave: "cave", upperCanopy: "high", summit: "high" };
/** The layer an enemy or object lives on, from its zone (every other zone is ground). */
export const layerOfZone = (zone: string | null | undefined): Layer =>
  zone && zone in LAYER_OF_ZONE ? LAYER_OF_ZONE[zone as LayerZone] : "ground";

/**
 * An overlap strip walkable on both layers. Signed distance d from the line
 * through `at` along normal `n` (pointing toward layer `to`): a walker on
 * `from` inside the strip switches when d > enter; one on `to` switches back
 * when d < -enter. The 2*enter dead band (>= 0.8 m) stops a standing player
 * from toggling.
 */
export interface LayerPortal {
  id: string;
  from: Layer;
  to: Layer;
  at: Vec2;
  n: Vec2;
  /** Half the dead band, metres (>= 0.4). */
  enter: number;
  /** Lateral half-width of the strip along the line. */
  half: number;
}
export const LAYER_PORTALS: LayerPortal[] = [];

/** Safe landing for a save that is not walkable on its saved layer. */
export const LAYER_ENTRY: Partial<Record<OtherLayer, Vec2>> = {};

/** The layer a walker crossing a portal should be on after this step, or null to stay. */
export function portalSwitch(layer: Layer, x: number, z: number, portals: readonly LayerPortal[] = LAYER_PORTALS): Layer | null {
  for (const p of portals) {
    if (p.from !== layer && p.to !== layer) continue;
    const dx = x - p.at.x, dz = z - p.at.z;
    const d = dx * p.n.x + dz * p.n.z, side = Math.abs(-dx * p.n.z + dz * p.n.x);
    if (side > p.half || Math.abs(d) > p.enter + 3) continue;
    if (layer === p.from && d > p.enter) return p.to;
    if (layer === p.to && d < -p.enter) return p.from;
  }
  return null;
}
