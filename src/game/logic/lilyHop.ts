import { GROVE_CROSSING, LILY_PADS, LILY_PAD_R } from "../world/lowland";
import type { Vec2 } from "../types";

/** Shore launch points are inland enough for both bodies, facing the crescent. */
export const LILY_ROUTE: readonly Vec2[] = [GROVE_CROSSING.near, ...LILY_PADS, { x: 37.04, z: -225.34 }];
export interface LilyHop { fromX: number; fromZ: number; toX: number; toZ: number; t0: number; seconds: 0.38 }

export function hopTarget(x: number, z: number, ux: number, uz: number, solved: boolean, unlock: number): Vec2 | null {
  const input = Math.hypot(ux, uz);
  if (!solved || unlock !== 1 || input < .001) return null;
  for (let i = 0; i < LILY_ROUTE.length; i++) {
    const node = LILY_ROUTE[i], radius = i === 0 || i === LILY_ROUTE.length - 1 ? 1.4 : LILY_PAD_R;
    if (Math.hypot(x - node.x, z - node.z) > radius) continue;
    for (const next of [i - 1, i + 1]) {
      const target = LILY_ROUTE[next];
      if (!target) continue;
      const dx = target.x - node.x, dz = target.z - node.z, length = Math.hypot(dx, dz);
      if ((ux * dx + uz * dz) / (input * length) < Math.cos(50 * Math.PI / 180)) continue;
      if (radius - ((x - node.x) * dx + (z - node.z) * dz) / length > .9) continue;
      return target;
    }
  }
  return null;
}

/** Interpolate the two standing surfaces rather than following the pond bed. */
export function hopPosition(hop: LilyHop, time: number, fromY: number, toY: number) {
  const k = Math.max(0, Math.min(1, (time - hop.t0) / hop.seconds));
  return { x: hop.fromX + (hop.toX - hop.fromX) * k, z: hop.fromZ + (hop.toZ - hop.fromZ) * k,
    y: fromY + (toY - fromY) * k + Math.sin(Math.PI * k) * .55, done: k === 1 };
}
