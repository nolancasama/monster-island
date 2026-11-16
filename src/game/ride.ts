import { RIVER_Y } from "./world/island";
import { POND, POND_Y, streamY } from "./world/lowland";
import { standY } from "./world/collision";
import { rt, type MonsterRt } from "./runtime";
import type { ObstacleId } from "./types";
import { getGame } from "./store";
import { hopPosition } from "./logic/lilyHop";
import { vy } from "./voyageRt";

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
  // The pirate voyage holds friends at authored heights (boarding arcs, the raft, the tow).
  const voyageY = vy.monY[m.id];
  if (voyageY !== undefined) return voyageY + (m.air > 0.05 ? m.air + Math.sin(t * 2.6 + m.x) * 0.06 : 0);
  if (rt.voyage.active) return rt.voyage.y + .75;
  const hop = rt.player.hop;
  if (hop && getGame().progress.active === m.id)
    return hopPosition(hop, t, standY(hop.fromX, hop.fromZ, solved), standY(hop.toX, hop.toZ, solved)).y;
  const ground = standY(m.x, m.z, solved);
  const level = rt.groveStreamFerry.start && m.id === "bubbo" ? streamY(m.x, m.z)
    : Math.hypot(m.x - POND.x, m.z - POND.z) < POND.r + 3 ? POND_Y : RIVER_Y;
  const water = m.swimming ? level - (m.id === "bubbo" ? 0.32 : 0.1) + Math.sin(t * 3) * 0.04 : -Infinity;
  const hover = m.air > 0.05 ? m.air + Math.sin(t * 2.6 + m.x) * 0.06 : 0;
  return Math.max(ground, water) + hover;
}

/**
 * The saddle on Bubbo's back, in Bubbo's frame: behind the eye bulges, on the
 * top of the body (whose crown is 0.8 above the root). Checked against the
 * body and eye shapes with the seated leg pose in Characters.
 */
export const BUBBO_SEAT = { back: 0.2, up: 0.82 };

/** A ridden friend's body motion on top of its root: lift, then pitch (about local x) and roll (about local z). */
export interface MountMotion { bob: number; roll: number; pitch: number; squash: number }

/**
 * Where the rider's seat point moves (world offset) when the friend's body moves
 * by `m`: the seat is `up` above the body's root and `back` behind its centre.
 * Matches the scene's rig (position.y = bob, rotation x = pitch then z = roll,
 * scale y = squash, under the body's yaw), so the rider stays on the back.
 */
export function seatOffset(m: MountMotion, seat: { up: number; back: number }, yaw: number): { x: number; y: number; z: number } {
  // The squash keeps volume: taller by `squash`, narrower and shorter by its square root.
  const up = seat.up * m.squash, back = seat.back / Math.sqrt(m.squash);
  const sr = Math.sin(m.roll), cr = Math.cos(m.roll), sp = Math.sin(m.pitch), cp = Math.cos(m.pitch);
  // Roll first (about the body's forward axis), then pitch (about its right axis).
  const lx = -up * sr, ly = up * cr * cp + back * sp, lz = up * cr * sp - back * cp;
  const dx = lx, dy = m.bob + ly - seat.up, dz = lz + seat.back;
  return { x: dx * Math.cos(yaw) + dz * Math.sin(yaw), y: dy, z: -dx * Math.sin(yaw) + dz * Math.cos(yaw) };
}

/** World position of the saddle (the rider's seat point). */
export function bubboSeat(m: MonsterRt, solved: readonly ObstacleId[], t: number): { x: number; y: number; z: number } {
  return {
    x: m.x - Math.sin(m.yaw) * BUBBO_SEAT.back,
    y: monsterRootY(m, solved, t) + BUBBO_SEAT.up * breathe(m, t),
    z: m.z - Math.cos(m.yaw) * BUBBO_SEAT.back
  };
}
