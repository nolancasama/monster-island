import { zoneAt } from "./world/lowland";
import { region, type Layer } from "./world/region";
import { waterAt } from "./logic/water";

/**
 * Ember's fire scorches the ground it sweeps (2026-11-16): grass, leaves, the
 * canopy's wooden decks and branches. A mark blackens in, holds for a while and
 * fades back to the ground's own colour; nothing spreads and nothing is
 * destroyed. Stone (the Causeway, Port Town, the cave, the summit) and water
 * never char. A small fixed pool keeps it cheap (scene/Scorch draws it in one call).
 */
export interface Scorch { x: number; z: number; r: number; layer: Layer; t0: number; seed: number }

export const SCORCH = {
  /** At most this many marks at once; the oldest goes first. */
  max: 32,
  /** Normal → scorched (seconds), how long it stays black, then how long it takes to recover. */
  burn: 0.6, hold: 7, recover: 6,
  /** A new mark this close to an old one (in radii) refreshes and widens it instead. */
  merge: 0.8, minR: 0.55, maxR: 1.35,
};

export const scorches: Scorch[] = [];
let seed = 1;

/** Ground that can char: home-world grass, leaf and wood, never stone or water. */
export function scorchable(x: number, z: number, layer: Layer = region.layer): boolean {
  if (region.world !== "home" || layer === "cave") return false;
  const zone = zoneAt(x, z, layer);
  if (!zone || zone === "port" || zone === "causeway" || zone === "summit" || zone === "cave") return false;
  return layer !== "ground" || waterAt(x, z, "home") === "none";
}

const age = (s: Scorch, now: number) => now - s.t0;
const life = () => SCORCH.burn + SCORCH.hold + SCORCH.recover;

/** Mark (or refresh) a scorch at a point, if the ground there can char. */
export function scorchAt(x: number, z: number, r: number, now: number, layer: Layer = region.layer): Scorch | null {
  if (!scorchable(x, z, layer)) return null;
  for (const s of scorches) {
    if (s.layer !== layer || Math.hypot(s.x - x, s.z - z) > SCORCH.merge * Math.max(s.r, r)) continue;
    // Still burning: keep it black from now; already recovering: blacken again without a new mark.
    s.t0 = age(s, now) > SCORCH.burn ? now - SCORCH.burn : s.t0;
    s.r = Math.min(SCORCH.maxR, Math.max(s.r, r) + 0.05);
    return s;
  }
  const s: Scorch = { x, z, r: Math.max(SCORCH.minR, Math.min(SCORCH.maxR, r)), layer, t0: now, seed: seed++ };
  scorches.push(s);
  if (scorches.length > SCORCH.max) scorches.shift();
  return s;
}

/**
 * Where a mark is in its life: `char` 0 (untouched) → 1 (black) → 0 (recovered),
 * and `glow` (embers, the first moments only).
 */
export function scorchStage(s: Scorch, now: number): { char: number; glow: number } {
  const a = age(s, now);
  if (a < 0) return { char: 0, glow: 0 };
  const glow = Math.max(0, 1 - a / (SCORCH.burn * 2));
  if (a < SCORCH.burn) return { char: a / SCORCH.burn, glow };
  if (a < SCORCH.burn + SCORCH.hold) return { char: 1, glow };
  return { char: Math.max(0, 1 - (a - SCORCH.burn - SCORCH.hold) / SCORCH.recover), glow: 0 };
}

/** Drop fully recovered marks. */
export function pruneScorches(now: number) {
  for (let i = scorches.length - 1; i >= 0; i--) if (age(scorches[i], now) >= life() - 1e-6) scorches.splice(i, 1);
}

export function resetScorches() { scorches.length = 0; }

/**
 * A fire cone's footprint (Fire Breath or Inferno): marks along its middle, and on
 * both flanks for the wide Inferno.
 */
export function scorchCone(x: number, z: number, yaw: number, range: number, degrees: number, now: number) {
  const half = (degrees * Math.PI) / 360;
  const rays = degrees > 60 ? [-half * 0.6, 0, half * 0.6] : [0];
  for (const off of rays) for (const f of [0.5, 0.88]) {
    const a = yaw + off, d = range * f;
    scorchAt(x + Math.sin(a) * d, z + Math.cos(a) * d, 0.45 + range * 0.12 * f, now);
  }
}
