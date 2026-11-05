import { hazardAt } from "./elements";
import { lowlandY, nearestOnTrail, STREAMS, streamY } from "../world/lowland";
import { STREAM_WIDTH, streamBanks, type StreamPoint } from "../world/streams";

export const POND_WADE = 1.1;
export type Water = "none" | "shallow" | "deep";

/** Convex ribbon panels and the same twelve-sided rounded caps as the mesh. */
function insidePolygon(points: readonly StreamPoint[], x: number, z: number): boolean {
  let positive = false, negative = false;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const cross = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]);
    positive ||= cross > 1e-9;
    negative ||= cross < -1e-9;
  }
  return !(positive && negative);
}

const streamFootprints = STREAMS.map(points => {
  const banks = streamBanks(points, STREAM_WIDTH), polygons: StreamPoint[][] = [];
  for (let i = 1; i < banks.length; i++) {
    const a = banks[i - 1], b = banks[i];
    polygons.push([[a[0], a[1]], [b[0], b[1]], [b[2], b[3]], [a[2], a[3]]]);
  }
  for (const index of [0, points.length - 1]) {
    const p = points[index], b = banks[index], outward = index === 0 ? 1 : -1;
    const angle = Math.atan2(b[1] - p[1], b[0] - p[0]);
    const cap: StreamPoint[] = [p];
    for (let i = 0; i <= 12; i++) {
      const a = angle + outward * Math.PI * i / 12;
      cap.push([p[0] + Math.cos(a) * STREAM_WIDTH / 2, p[1] + Math.sin(a) * STREAM_WIDTH / 2]);
    }
    polygons.push(cap);
  }
  return polygons;
});

/** Pure water classification: safe islands/solved decks win over splash water. */
export function waterAt(x: number, z: number, world: "home" | "cloud", solved: readonly string[] = []): Water {
  const hazard = hazardAt(x, z, world, solved);
  if (hazard?.kind === "splash") {
    const s = hazard.shape;
    const depth = s.kind === "disc" ? s.r - Math.hypot(x - s.x, z - s.z)
      : s.kind === "rect" ? Math.min(x - s.x0, s.x1 - x, z - s.z0, s.z1 - z)
      : s.w - nearestOnTrail(s.pts, x, z).d;
    return depth <= POND_WADE + 1e-9 ? "shallow" : "deep";
  }
  // All authored streams lie in the full lowland blend: lowlandY is the
  // terrain there, without consulting the mutable active-world selector.
  if (world === "home" && streamFootprints.some(polygons => polygons.some(p => insidePolygon(p, x, z)))
    && lowlandY(x, z) < streamY(x, z)) return "shallow";
  return "none";
}
