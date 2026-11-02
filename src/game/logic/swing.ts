export const SWING_PULL = .14;
export const SWING_DURATION = .95;
const TAU = Math.PI * 2;

export interface Swing {
  age: number;
  phase: "pull" | "orbit" | "released";
  startBearing: number;
  direction: number;
  startRadius: number;
  radius: number;
  /** Unwrapped angle travelled, always increasing in the chosen direction. */
  sweep: number;
  wallHit: boolean;
}

const positiveAngle = (angle: number) => {
  const wrapped = ((angle % TAU) + TAU) % TAU;
  return wrapped < 1e-8 || TAU - wrapped < 1e-8 ? 0 : wrapped;
};

export function swingDirection(bearing: number, aim: number): number {
  return Math.atan2(Math.sin(aim - bearing), Math.cos(aim - bearing)) < 0 ? -1 : 1;
}

/** Absolute time, rather than Euler integration, keeps the orbit independent of fps.
 * If the aim moves behind an already swept angle, continue forward to its next
 * occurrence; a turning player can never reverse the tether. */
export function swingSweep(age: number, bearing: number, direction: number, aim: number, previous = 0): number {
  const t = Math.max(0, Math.min(1, (age - SWING_PULL) / (SWING_DURATION - SWING_PULL)));
  let end = TAU + positiveAngle(direction * (aim - bearing));
  while (end < previous - 1e-8) end += TAU;
  return Math.max(previous, end * (.25 * t + .75 * t * t));
}

export function swingRadius(age: number, startRadius: number, minimum: number): number {
  if (age < SWING_PULL) {
    const t = Math.max(0, age / SWING_PULL), ease = t * t * (3 - 2 * t);
    return Math.max(minimum, startRadius + (2.2 - startRadius) * ease);
  }
  const t = Math.max(0, Math.min(1, (age - SWING_PULL) / (SWING_DURATION - SWING_PULL)));
  const spiral = Math.max(0, (t - .8) / .2);
  return Math.max(minimum, 2.2 + .8 * spiral * spiral * (3 - 2 * spiral));
}
