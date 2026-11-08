import type { WalkShape } from "./lowland";
import type { SolidShape } from "./island";

/** Deep channel before the Causeway door; both ends bury into hills / mesa. */
export const GROVE_STREAM: Extract<WalkShape, { kind: "trail" }> = {
  kind: "trail", w: 2.6,
  pts: [[26, -234.6], [38, -235.4], [48, -233.4], [56, -233.4], [65, -235.2], [77, -231.5]],
};
export const GROVE_STREAM_FERRY = {
  north: { x: 56, z: -230 },
  south: { x: 56, z: -237.6 },
};
/** Signed bank relative to the new local centreline, including submerged saves.
 * Continue each end's bank line into the non-walkable hills / mesa. */
export function groveStreamSide(x: number, z: number): "north" | "south" {
  const pts = GROVE_STREAM.pts;
  for (let i = 1; i < pts.length; i++) {
    if (x > pts[i][0] && i < pts.length - 1) continue;
    const a = pts[i - 1], b = pts[i];
    const t = (x - a[0]) / (b[0] - a[0]);
    return z >= a[1] + (b[1] - a[1]) * t ? "north" : "south";
  }
  return "south";
}
/** New footprints of props relocated with their collision for save repair. */
export const GROVE_STREAM_MOVED_SCENERY: readonly SolidShape[] = [
  { kind: "circle", x: 55, z: -203.5, r: 1.1 },
  { kind: "capsule", ax: 44.4, az: -204.3, bx: 49.3, bz: -202.1, r: .42 },
  { kind: "circle", x: 43.6, z: -229.5, r: 1.15 },
  { kind: "capsule", ax: 33, az: -209, bx: 35, bz: -211, r: .35 },
  { kind: "capsule", ax: 50.6, az: -221.1, bx: 52.2, bz: -227.2, r: .4 },
  { kind: "box", x: 52, z: -207, hx: 1.6, hz: 1.8, yaw: 0 },
];
