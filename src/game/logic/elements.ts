import type { EnemyDef } from "../data/combat";
import { CLOUD_CAVES } from "../world/cloudisle";
import { HAZARDS, type Hazard } from "../world/hazards";
import { nearestOnTrail, type WalkShape } from "../world/lowland";

export type WeightClass = EnemyDef["weightClass"];
export interface Burn { until: number; tick: number }
export interface Control {
  kind: "trapped" | "grabbed" | "snared" | "carried" | "flung";
  t0: number; until: number; peak?: number; source?: number;
}
export interface Point { x: number; z: number }

const inside = (s: WalkShape, x: number, z: number) => s.kind === "disc" ? Math.hypot(x - s.x, z - s.z) <= s.r
  : s.kind === "rect" ? x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1 : nearestOnTrail(s.pts, x, z).d <= s.w;

export const resistance = (weight: WeightClass) => weight === "light" ? 1.2 : 2;
export const endResistance = (weight: WeightClass, now: number) => now + resistance(weight);
export function canControl(weight: WeightClass, kind: Control["kind"], now: number, resistUntil: number, current: Control | null): boolean {
  if (now < resistUntil || (kind === "snared" && current?.kind === "snared")) return false;
  return weight !== "heavy" || kind === "snared" || kind === "flung";
}
export const snareDuration = (weight: WeightClass) => weight === "light" ? 3.5 : weight === "medium" ? 2.5 : 2;
export const blastKnock = (weight: WeightClass) => weight === "light" ? 9 : weight === "medium" ? 6 : 2;

/** Refresh expiry, preserving the existing tick clock: re-ignition cannot add ticks. */
export function ignite(burn: Burn | null, now: number): Burn {
  return { until: now + 2.5, tick: burn && burn.until >= now ? burn.tick : now + 1 / 3 };
}
export function tickBurn(burn: Burn | null, now: number, scale = 1): { burn: Burn | null; damage: number } {
  if (!burn) return { burn: null, damage: 0 };
  const count = Math.max(0, Math.floor((Math.min(now, burn.until) - burn.tick + 1e-9) * 3) + 1);
  return { burn: now >= burn.until ? null : { ...burn, tick: burn.tick + count / 3 }, damage: count * 2 * scale };
}

export function bubbleProfile(weight: WeightClass, upgraded: boolean, x: number, z: number, cloud: boolean): { peak: number; duration: number } | null {
  if (weight === "heavy") return null;
  if (weight === "medium" && !upgraded) return { peak: 0.8, duration: 1 };
  return { peak: cloud && CLOUD_CAVES.some(s => inside(s, x, z)) ? 1.4 : 2.4, duration: 1.9 };
}
export const bubbleAir = (control: Control, now: number) => Math.max(0, Math.min(1, (now - control.t0) / Math.min(1.1, control.until - control.t0))) * Math.min(2.4, control.peak ?? 2.4);
export const fallDamage = (air: number) => Math.round(6 + 8 * Math.max(0, Math.min(2.4, air)));
export const fallingAir = (air: number, elapsed: number) => Math.max(0, air - 0.5 * 14 * elapsed * elapsed);
export function oldestTrap<T extends { control: Control | null }>(enemies: readonly T[]): T | null {
  const traps = enemies.filter(e => e.control?.kind === "trapped");
  return traps.length < 3 ? null : traps.reduce((a, b) => a.control!.t0 <= b.control!.t0 ? a : b);
}

export function inCone(origin: Point, yaw: number, target: Point, range: number, degrees: number): boolean {
  const dx = target.x - origin.x, dz = target.z - origin.z, d = Math.hypot(dx, dz);
  return d <= range && (d < 1e-6 || (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / d >= Math.cos(degrees * Math.PI / 360));
}
export function clearLine(a: Point, b: Point, clear: (x: number, z: number) => boolean): boolean {
  const count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.12));
  for (let i = 1; i <= count; i++) if (!clear(a.x + (b.x - a.x) * i / count, a.z + (b.z - a.z) * i / count)) return false;
  return true;
}
export function forwardTargets<T extends Point>(targets: readonly T[], origin: Point, yaw: number, range: number, degrees: number, clear: (x: number, z: number) => boolean): T[] {
  return targets.filter(e => inCone(origin, yaw, e, range, degrees) && clearLine(origin, e, clear))
    .sort((a, b) => Math.hypot(a.x - origin.x, a.z - origin.z) - Math.hypot(b.x - origin.x, b.z - origin.z));
}
/** Return a new victim list only for a first collision during this swing/fling. */
export const weaponVictims = (victims: readonly number[], victim: number): number[] | null => victims.includes(victim) ? null : [...victims, victim];
export function hazardAt(x: number, z: number, world: "home" | "cloud", solved: readonly string[] = [], hazards: readonly Hazard[] = HAZARDS): Hazard | null {
  return hazards.find(h => h.world === world && inside(h.shape, x, z)
    && !((!h.safeWhen || solved.includes(h.safeWhen)) && h.safe?.some(s => inside(s, x, z)))) ?? null;
}
