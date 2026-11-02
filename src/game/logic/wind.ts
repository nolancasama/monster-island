export const WIND_ATTACH_SECONDS = .14;
export const WIND_TAIL_SPEED = 12;

export interface WindPoint { x: number; y: number; z: number }
export interface WindEffect { id: number; t0: number; yaw: number; size: number }

/** One caller-owned record per active gust. Allocate outside the frame loop. */
export interface WindFrame extends WindPoint {
  id: number;
  t0: number;
  length: number;
  attached: boolean;
  drawn: boolean;
  yaw: number;
  released: boolean;
  releaseX: number;
  releaseY: number;
  releaseZ: number;
  sampleTime: number;
  sampleX: number;
  sampleY: number;
  sampleZ: number;
  sampleValid: boolean;
}

export function createWindFrame(): WindFrame {
  return {
    id: -1, t0: -1, x: 0, y: 0, z: 0, length: 0, attached: false,
    drawn: false, yaw: 0, released: false, releaseX: 0, releaseY: 0,
    releaseZ: 0, sampleTime: 0, sampleX: 0, sampleY: 0, sampleZ: 0,
    sampleValid: false,
  };
}

/** The cone grows from the live beak, then its tail catches its fixed tip.
 * Interpolate the last attached sample at release so low frame rates release at
 * the same point. Once released, neither beak motion nor aim can pull it back.
 * Invalid anchors never produce a visible frame. No allocations occur here. */
export function stepWindFrame(
  out: WindFrame, effect: WindEffect, now: number, beak: WindPoint, valid: boolean,
): WindFrame {
  if (out.id !== effect.id || out.t0 !== effect.t0) {
    out.id = effect.id;
    out.t0 = effect.t0;
    out.yaw = effect.yaw;
    out.released = false;
    out.sampleValid = false;
  }
  const age = now - effect.t0;
  out.attached = age >= 0 && age < WIND_ATTACH_SECONDS;
  out.drawn = false;
  out.length = 0;
  if (!valid || age < 0) return out;

  if (out.attached) {
    out.x = beak.x;
    out.y = beak.y;
    out.z = beak.z;
    out.length = effect.size * Math.min(1, age / WIND_ATTACH_SECONDS);
    out.drawn = out.length > 0;
  } else {
    if (!out.released) {
      const releaseTime = effect.t0 + WIND_ATTACH_SECONDS;
      const fraction = out.sampleValid && now > out.sampleTime
        ? Math.max(0, Math.min(1, (releaseTime - out.sampleTime) / (now - out.sampleTime)))
        : 1;
      out.releaseX = out.sampleValid ? out.sampleX + (beak.x - out.sampleX) * fraction : beak.x;
      out.releaseY = out.sampleValid ? out.sampleY + (beak.y - out.sampleY) * fraction : beak.y;
      out.releaseZ = out.sampleValid ? out.sampleZ + (beak.z - out.sampleZ) * fraction : beak.z;
      out.released = true;
    }
    const tail = Math.min(effect.size, Math.max(0, age - WIND_ATTACH_SECONDS) * WIND_TAIL_SPEED);
    out.x = out.releaseX + Math.sin(out.yaw) * tail;
    out.y = out.releaseY;
    out.z = out.releaseZ + Math.cos(out.yaw) * tail;
    out.length = Math.max(0, effect.size - tail);
    out.drawn = out.length > 1e-8;
  }
  out.sampleTime = now;
  out.sampleX = beak.x;
  out.sampleY = beak.y;
  out.sampleZ = beak.z;
  out.sampleValid = true;
  return out;
}
