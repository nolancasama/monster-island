import { BOW_Z, STERN_Z, STEER_LANE, hullHalf } from "../world/pirateShip";
import { safeCommand, steer, type Lane, type SteerCommand } from "./voyage";

export type SteerObstacleKind = "rock" | "barrel";
export const SHIP_OBSTACLE_SCALE = 1.3;
export const STEER_APPROACH_SECONDS = 2.6;
export const STEER_ANSWER_Z = -58;
export const STEER_PASS_Z = 30;
export const STEER_CONTACT_GAP = 0.02;

const START_Z = -110;
const PASS_SPEED = 40;
const TURN_SECONDS = 0.66;
const BRAKE_SECONDS = 0.6;
const BUMP_SECONDS = 0.6;
const RETREAT_SECONDS = 0.6;
const BRAKE_Z = STEER_ANSWER_Z + BRAKE_SECONDS * PASS_SPEED;
const STEM_Z = BOW_Z - 1.4; // The pointed stem on the lower hull mesh.
const CLEARANCE_MARGIN = 0.25;
// Rounded-up mesh radii at unit scale. The barrel can roll, so use its full 3D radius.
export const STEER_MESH_RADIUS = { rock: 2.1, barrel: 0.83 } as const;

const hull: ReadonlyArray<readonly [number, number]> = (() => {
  const points: Array<[number, number]> = [];
  for (let z = STERN_Z; z >= BOW_Z; z--) points.push([hullHalf(z), z]);
  points.push([0, STEM_Z]);
  for (let z = BOW_Z; z <= STERN_Z; z++) points.push([-hullHalf(z), z]);
  return points;
})();

/** Signed horizontal distance from the rotated hull to the obstacle's padded edge. */
export function steerClearance(x: number, z: number, yaw: number, kind: SteerObstacleKind): number {
  // Undo the ship's render yaw around its origin to measure against the local outline.
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  const lx = x * cos - z * sin, lz = x * sin + z * cos;
  let nearest = Infinity;
  for (let i = 0, j = hull.length - 1; i < hull.length; j = i++) {
    const a = hull[j], b = hull[i];
    const ax = a[0], az = a[1], dx = b[0] - ax, dz = b[1] - az;
    const t = clamp01(((lx - ax) * dx + (lz - az) * dz) / (dx * dx + dz * dz));
    nearest = Math.min(nearest, (lx - ax - t * dx) ** 2 + (lz - az - t * dz) ** 2);
  }
  const half = lz < BOW_Z ? hullHalf(BOW_Z) * (lz - STEM_Z) / (BOW_Z - STEM_Z) : hullHalf(lz);
  const inside = lz >= STEM_Z && lz <= STERN_Z && Math.abs(lx) <= half;
  return (inside ? -1 : 1) * Math.sqrt(nearest) - paddedRadius(kind);
}

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const paddedRadius = (kind: SteerObstacleKind) => STEER_MESH_RADIUS[kind] * SHIP_OBSTACLE_SCALE + CLEARANCE_MARGIN;

export interface SteerPath {
  readonly kind: SteerObstacleKind;
  readonly safe: boolean;
  readonly startX: number;
  readonly driftX: number;
  readonly contactZ: number;
  readonly contactTime: number;
  readonly duration: number;
}

export interface SteerFrame {
  t: number;
  phase: "steer-approach" | "steer-pass" | "steer-bump" | "steer-retreat";
  x: number;
  z: number;
  driftX: number;
  yaw: number;
  roll: number;
  clearance: number;
}

export function makeSteerPath(start: Lane, obstacle: Lane, command: SteerCommand, kind: SteerObstacleKind): SteerPath {
  const safe = safeCommand(start, obstacle, command);
  // An unsafe choice ends in the obstacle's lane, after yaw and lateral drift have settled.
  const contactZ = STEM_Z - paddedRadius(kind) - STEER_CONTACT_GAP;
  const contactTime = STEER_APPROACH_SECONDS + BRAKE_SECONDS + 2 * (contactZ - BRAKE_Z) / PASS_SPEED;
  return {
    kind, safe, contactZ, contactTime,
    startX: (obstacle - start) * STEER_LANE,
    driftX: (start - steer(start, command)) * STEER_LANE,
    duration: safe ? STEER_APPROACH_SECONDS + (STEER_PASS_Z - STEER_ANSWER_Z) / PASS_SPEED
      : contactTime + BUMP_SECONDS + RETREAT_SECONDS,
  };
}

/** Sample the fixed ship frame, with +x pointing right in the helm shot. Reuse `out` on animation frames. */
export function sampleSteerPath(path: SteerPath, time: number, out?: SteerFrame): SteerFrame {
  const t = Math.max(0, Math.min(path.duration, time));
  const passed = t - STEER_APPROACH_SECONDS;
  const turn = clamp01(passed / TURN_SECONDS);
  const shift = turn ** 3 * (10 + turn * (-15 + 6 * turn));
  const driftX = path.driftX * shift;
  const lean = Math.sign(path.driftX) * 16 * turn ** 2 * (1 - turn) ** 2;
  const yaw = lean * 0.12;
  let roll = lean * 0.032;
  let phase: SteerFrame["phase"] = "steer-pass";
  let z = STEER_ANSWER_Z + passed * PASS_SPEED;
  if (passed <= 0) {
    phase = "steer-approach";
    z = START_Z + (STEER_ANSWER_Z - START_Z) * (t / STEER_APPROACH_SECONDS);
  } else if (!path.safe && passed >= BRAKE_SECONDS) {
    const untilContact = path.contactTime - STEER_APPROACH_SECONDS - BRAKE_SECONDS;
    const brake = clamp01((passed - BRAKE_SECONDS) / untilContact);
    z = path.contactZ - (path.contactZ - BRAKE_Z) * (1 - brake) ** 2;
    if (t >= path.contactTime) {
      const bump = (t - path.contactTime) / BUMP_SECONDS;
      phase = "steer-bump";
      roll = Math.sin(bump * Math.PI * 3) * 0.05 * (1 - Math.min(1, bump));
      if (bump >= 1) {
        phase = "steer-retreat";
        const retreat = clamp01((t - path.contactTime - BUMP_SECONDS) / RETREAT_SECONDS);
        z = path.contactZ - 12 * retreat ** 2 * (3 - 2 * retreat);
      }
    }
  }
  const x = path.startX + driftX;
  const clearance = steerClearance(x, z, yaw, path.kind);
  if (!out) return { t, phase, x, z, driftX, yaw, roll, clearance };
  out.t = t;
  out.phase = phase;
  out.x = x;
  out.z = z;
  out.driftX = driftX;
  out.yaw = yaw;
  out.roll = roll;
  out.clearance = clearance;
  return out;
}
