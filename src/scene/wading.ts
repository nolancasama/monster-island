/** A distance-driven step tracker, independent of frame rate and walk animation. */
export function wadingTrack() {
  return { x: NaN, z: NaN, distance: 0, last: -Infinity, time: -Infinity, side: 1 };
}

export function wadingStep(track: ReturnType<typeof wadingTrack>, x: number, z: number, time: number,
  wet: boolean, stride = .7, interval = .23): boolean {
  const moved = Math.hypot(x - track.x, z - track.z);
  const rewind = time < track.time;
  track.x = x; track.z = z; track.time = time;
  // Loading/travelling to a position must not leave a trail across the world.
  if (!wet || !Number.isFinite(moved) || moved > 2 || rewind) {
    track.distance = 0; track.last = -Infinity;
    return false;
  }
  track.distance += moved;
  if (moved < .001 || track.distance < stride || time - track.last < interval) return false;
  track.distance = 0; track.last = time; track.side *= -1;
  return true;
}
