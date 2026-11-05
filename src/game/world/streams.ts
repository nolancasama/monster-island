/** Shared water ribbon dimensions and joined banks, including bend normals. */
export const STREAM_WIDTH = 1.6;
export type StreamPoint = readonly [number, number];
export function streamBanks(points: readonly StreamPoint[], width: number): Array<[number, number, number, number]> {
  return points.map((p, i) => {
    const previous = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)];
    const dx = next[0] - previous[0], dz = next[1] - previous[1], length = Math.hypot(dx, dz);
    return [p[0] - dz / length * width / 2, p[1] + dx / length * width / 2,
      p[0] + dz / length * width / 2, p[1] - dx / length * width / 2];
  });
}
