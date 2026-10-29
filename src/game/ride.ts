import { RIVER_Y } from "./world/island";
import { standY } from "./world/collision";
import { rt, type MonsterRt } from "./runtime";
import type { ObstacleId } from "./types";

/**
 * Where a monster's body stands, and where a rider sits on Bubbo. The scene
 * draws the monster from the same height the rider is attached to, so the
 * player sits on Bubbo's back through the whole ferry instead of floating
 * above it or sinking into it.
 */

/** Bubbo's breathing squash (the scene scales the body by it). */
export function breathe(m: MonsterRt, t: number): number {
  return 1 + Math.sin(t * 2.4 + m.x) * 0.03;
}

/** Height of a monster's root: the ground, the water it swims in, or its hover. */
export function monsterRootY(m: MonsterRt, solved: readonly ObstacleId[], t: number): number {
  if (rt.voyage.active) return rt.voyage.y + .75;
  const ground = standY(m.x, m.z, solved);
  const water = m.swimming ? RIVER_Y - (m.id === "bubbo" ? 0.32 : 0.1) + Math.sin(t * 3) * 0.04 : -Infinity;
  const hover = m.air > 0.05 ? m.air + Math.sin(t * 2.6 + m.x) * 0.06 : 0;
  return Math.max(ground, water) + hover;
}

/**
 * The saddle on Bubbo's back, in Bubbo's frame: behind the eye bulges, on the
 * top of the body (whose crown is 0.8 above the root). Checked against the
 * body and eye shapes with the seated leg pose in Characters.
 */
export const BUBBO_SEAT = { back: 0.2, up: 0.82 };

/** World position of the saddle (the rider's seat point). */
export function bubboSeat(m: MonsterRt, solved: readonly ObstacleId[], t: number): { x: number; y: number; z: number } {
  return {
    x: m.x - Math.sin(m.yaw) * BUBBO_SEAT.back,
    y: monsterRootY(m, solved, t) + BUBBO_SEAT.up * breathe(m, t),
    z: m.z - Math.cos(m.yaw) * BUBBO_SEAT.back
  };
}
