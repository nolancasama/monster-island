export interface WhipPoint { x: number; y: number; z: number }
export interface WhipFacing { x: number; z: number }

/** Live-rooted whip curve. Phase is seconds since press; the caller animates tip.
 * Endpoints are copied exactly (within Float32 precision), including at the snap.
 * All intermediate work is scalar and the caller owns the reusable output. */
export function whipPoints(
  out: Float32Array, n: number, root: WhipPoint, tip: WhipPoint,
  facing: WhipFacing, phase: number, tension: number
): Float32Array {
  if (n <= 0) return out;
  out[0] = root.x; out[1] = root.y; out[2] = root.z;
  if (n === 1) return out;
  const dx = tip.x - root.x, dy = tip.y - root.y, dz = tip.z - root.z;
  const distance = Math.hypot(dx, dz);
  const facingLength = Math.hypot(facing.x, facing.z) || 1;
  const fx = facing.x / facingLength, fz = facing.z / facingLength;
  const taut = Math.max(0, Math.min(1, tension));
  const size = Math.min(1, distance / 1.2);
  const slack = 1 - taut * .78;
  // A local rise over the backpack/head remains even when the long span is taut.
  const clearanceEnd = Math.min(.85, 1.2 / Math.max(1.2, distance));
  const forwardSpan = dx * fx + dz * fz;
  const clearance = forwardSpan > .4 || taut > .8 ? .75 * size * (1 - taut * .2) : 0;
  for (let i = 1; i < n - 1; i++) {
    const t = i / (n - 1);
    const bow = Math.sin(Math.PI * t);
    const rise = t < clearanceEnd ? Math.sin(Math.PI * t / clearanceEnd) * clearance : 0;
    // The fixed camera looks along the whip, so only sideways curve reads as bend:
    // it must reach down the whole vine, or the base looks like a stiff pole.
    const envelope = Math.pow(bow, .6);
    const wave = (Math.sin(t * Math.PI * 3 - phase * 30) * (.5 + .5 * t) * .62 + Math.cos(phase * 11) * .42) * envelope * size * slack;
    const forward = bow * .28 * size * slack;
    const j = i * 3;
    out[j] = root.x + dx * t + fx * forward + fz * wave;
    out[j + 1] = root.y + dy * t + rise + bow * .55 * size * slack + wave * .3;
    out[j + 2] = root.z + dz * t + fz * forward - fx * wave;
  }
  const end = (n - 1) * 3;
  out[end] = tip.x; out[end + 1] = tip.y; out[end + 2] = tip.z;
  return out;
}
