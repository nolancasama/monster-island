import type { Vec3 } from "../types";
import { BOAT_DECK_Y, BOAT_INNER, BOAT_RAIL } from "../world/gullBoat";
import { DECK_Y, HALF_BEAM, SHIP } from "../world/pirateShip";

export const GRAPPLE_THROWERS = ["tom", "sam", "max"] as const;
export const GRAPPLE_RAIL = { x: HALF_BEAM - 0.94, z: [-3.6, -1.6, 2.1] } as const;
export const GRAPPLE_RADIUS = 0.045;
const LANDING_Z = [0.64, 0, -0.64] as const;

export interface Grapple {
  phase: "ready" | "raise" | "lunge" | "flight" | "attached";
  progress: number;
  pitch: number;
  handY: number;
  handZ: number;
  release: Vec3;
}

export const readyGrapple = (): Grapple => ({
  phase: "ready", progress: 0, pitch: 0, handY: 0.9, handZ: 0.27, release: { x: 0, y: 0, z: 0 },
});

/** The held prop's grip in the crew mesh's YXZ pose. The ship is level for this scene. */
export function grappleHand(out: Vec3, crew: { x: number; z: number; yaw: number; air: number }, hook: Grapple, bob: number) {
  const cp = Math.cos(hook.pitch), sp = Math.sin(hook.pitch);
  const y = hook.handY * cp - hook.handZ * sp;
  const z = hook.handY * sp + hook.handZ * cp;
  const cy = Math.cos(crew.yaw), sy = Math.sin(crew.yaw);
  out.x = SHIP.x + crew.x + 0.23 * cy + z * sy;
  out.y = DECK_Y + bob + crew.air + y;
  out.z = SHIP.z + crew.z - 0.23 * sy + z * cy;
}

/** Three distinct points on the top outside edge of the rail facing the pirate ship. */
export function grappleGunwale(out: Vec3, boat: Vec3 & { yaw: number }, i: number) {
  const x = BOAT_INNER.halfX + BOAT_RAIL.width;
  const z = LANDING_Z[i] * BOAT_INNER.halfZ;
  const c = Math.cos(boat.yaw), s = Math.sin(boat.yaw);
  out.x = boat.x + x * c + z * s;
  out.y = boat.y + BOAT_DECK_Y + BOAT_RAIL.height + GRAPPLE_RADIUS;
  out.z = boat.z - x * s + z * c;
}

/** Constant horizontal velocity and downward acceleration from release to the rail. */
export function grappleArc(out: Vec3, start: Vec3, end: Vec3, t: number) {
  out.x = start.x + (end.x - start.x) * t;
  out.y = start.y + (end.y - start.y) * t + 9.2 * t * (1 - t);
  out.z = start.z + (end.z - start.z) * t;
}

export function grapplePosition(out: Vec3, hand: Vec3, landing: Vec3, hook: Grapple) {
  if (hook.phase === "flight") grappleArc(out, hook.release, landing, hook.progress);
  else Object.assign(out, hook.phase === "attached" ? landing : hand);
}

/** Upper bound on the extra rope paid out. It goes to zero at both ends of flight. */
export function grappleSlack(distance: number, hook: Grapple) {
  return hook.phase === "flight" ? Math.min(0.55, distance * 0.08) * Math.sin(Math.PI * hook.progress) : 0;
}

export function grappleRopePoint(out: Vec3, hand: Vec3, hook: Vec3, slack: number, u: number) {
  out.x = hand.x + (hook.x - hand.x) * u;
  // The dip's total vertical variation is at most slack, bounding its extra arc length.
  out.y = hand.y + (hook.y - hand.y) * u - 2 * slack * u * (1 - u);
  out.z = hand.z + (hook.z - hand.z) * u;
}
