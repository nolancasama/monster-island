import type { WalkShape } from "./lowland";
import type { SolidShape } from "./island";

/** Shared deep entrance channel: ends continue under the west hills and mesa. */
export const GROVE_STREAM: Extract<WalkShape, { kind: "trail" }> = {
  kind: "trail", w: 2.6,
  pts: [[28, -211], [39, -210.5], [49, -211], [59, -209.4], [74, -211.5]],
};
export const GROVE_STREAM_FERRY = {
  north: { x: 46, z: -207.2 },
  south: { x: 46, z: -214.5 },
};
/** Side of the local centreline, including legacy positions within the channel. */
export function groveStreamSide(x: number, z: number): "north" | "south" {
  const pts = GROVE_STREAM.pts;
  for (let i = 1; i < pts.length; i++) {
    if (x > pts[i][0] && i < pts.length - 1) continue;
    const a = pts[i - 1], b = pts[i];
    const t = Math.max(0, Math.min(1, (x - a[0]) / (b[0] - a[0])));
    return z >= a[1] + (b[1] - a[1]) * t ? "north" : "south";
  }
  return "south";
}
/** New footprints of props relocated with their collision for save repair. */
export const GROVE_STREAM_MOVED_SCENERY: readonly SolidShape[] = [
  { kind: "circle", x: 55, z: -203.5, r: 1.1 },
  { kind: "capsule", ax: 44.4, az: -204.3, bx: 49.3, bz: -202.1, r: .42 },
];
