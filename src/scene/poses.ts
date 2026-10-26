import { KNEE_Y } from "./models/people";

/**
 * Joint angles for the player's bigger poses, kept apart from the frame loop
 * so they can be checked. Angles are rotation.x values (negative = forward).
 */

/** Hip height above the soles when standing, and the two leg links. */
export const HIP_Y = 0.5;
const THIGH = -KNEE_Y;
const SHIN = HIP_Y - 0.02 - THIGH;

export interface SquatPose {
  /** How far the hips drop (the body group moves down by this). */
  drop: number;
  /** Torso lean, rotated about the hip so the hips do not swing forward. */
  lean: number;
  /** Thigh and knee angles in the leaned body's frame. */
  thigh: number;
  knee: number;
}

/**
 * A squat that keeps both feet planted under the hips: the hips lower, the
 * knees bend forward (two-link leg, soles fixed) and the torso leans a little.
 * `c` is 0 (standing) to 1 (deepest squat).
 */
export function squatPose(c: number): SquatPose {
  const drop = 0.2 * c;
  const lean = 0.42 * c;
  const d = HIP_Y - 0.02 - drop;
  // Law of cosines: the thigh's forward angle from vertical, then the shin's
  // backward angle that brings the sole back under the hip.
  const cosA = Math.min(1, (THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d));
  const a = Math.acos(cosA);
  const g = Math.asin(Math.min(1, (Math.sin(a) * THIGH) / SHIN));
  return { drop, lean, thigh: -a - lean, knee: a + g };
}

/**
 * The squat over time: down, a short reach at the bottom, back up. Eased at
 * both ends; t is seconds since the pick began, total PICK_TIME.
 */
export function squatAmount(t: number, total: number): number {
  const u = t / total;
  if (u <= 0 || u >= 1) return 0;
  const ease = (v: number) => v * v * (3 - 2 * v);
  if (u < 0.38) return ease(u / 0.38);
  if (u < 0.55) return 1;
  return 1 - ease((u - 0.55) / 0.45);
}

/**
 * Seated astride Bubbo's round back: thighs out to the sides over his flanks,
 * knees bent so the shins hang outside his body. Checked against Bubbo's body
 * and eye shapes (see ride.test.ts); left leg values, mirror for the right.
 */
export const SEATED = {
  /** Body group offset: the bottom of the shorts rests on the saddle point. */
  drop: 0.47,
  lean: 0.08,
  thigh: { x: -1.4, y: 0.4, z: -1.35 },
  knee: 1.3,
  arm: { x: -0.75, z: -0.12 }
};
