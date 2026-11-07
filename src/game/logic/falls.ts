import { CANOPY_VOIDS, type Hazard } from "../world/hazards";
import { hazardAt, inShape } from "./elements";
import { region, type Layer } from "../world/region";
import { LAYER_ENTRY } from "../world/layers";

export const TEETER_SECONDS = .22;
export const FALL_SECONDS = .9;
export const FALL_GRAVITY = 22;
export const FALL_DAMAGE = 12;
/** Nothing dangerous within this many metres: a fair place to land. */
export const FALL_CLEARANCE = 2.5;
/** Where a player with no recorded ground lands: always on the side they were on. */
export const CANOPY_LANDINGS = { south: { x: 100, z: -212 }, north: { x: 101, z: -232.5 } };

export interface Point { x: number; z: number }

// The lower Canopy's flagged voids; other layers register their own fall hazards.
const inCanopyBox = (x: number, z: number) => region.layer !== "ground" || (x > 82 && x < 120 && z > -238 && z < -200);
const playerFallAt = (x: number, z: number, solved: readonly string[]): Hazard | null => {
  const hazard = hazardAt(x, z, "home", solved);
  return hazard?.playerFall ? hazard : null;
};

/** The hazard a walker's push would enter. Built puzzle bridges have rails, so
 * nobody walks off their sides; every other flagged edge is open. */
export function fallAhead(x: number, z: number, ux: number, uz: number, radius: number, solved: readonly string[]): Hazard | null {
  if (!inCanopyBox(x, z)) return null;
  if (region.layer === "ground") for (const h of CANOPY_VOIDS) if (h.safeWhen && solved.includes(h.safeWhen) && h.safe?.some(s => inShape(s, x, z))) return null;
  return playerFallAt(x + ux * (radius + .15), z + uz * (radius + .15), solved);
}

/** A landing never sits on an edge: every direction stays clear of a fall. */
export function safeFromFalls(x: number, z: number, solved: readonly string[]): boolean {
  if (playerFallAt(x, z, solved)) return false;
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    if (playerFallAt(x + Math.sin(a) * FALL_CLEARANCE, z + Math.cos(a) * FALL_CLEARANCE, solved)) return false;
  }
  return true;
}

export const fallLanding = (safe: Point | null, z: number, layer: Layer = region.layer): Point =>
  safe ?? (layer !== "ground" && LAYER_ENTRY[layer] ? LAYER_ENTRY[layer]! : z < -230 ? CANOPY_LANDINGS.north : CANOPY_LANDINGS.south);

/** Falling costs HP but never knocks a child out on top of the fall. */
export const hpAfterFall = (hp: number) => Math.max(Math.min(hp, 1), hp - FALL_DAMAGE);

export const fallHeight = (y0: number, floor: number, age: number) =>
  Math.max(floor - .3, y0 - .5 * FALL_GRAVITY * age * age);
