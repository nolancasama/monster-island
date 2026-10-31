import { BEACON, CLOUD_BOUNDS, CLOUD_ZONES, cloudY } from "./cloudisle";
import { nearestOnTrail, type WalkShape } from "./lowland";

const shapes = Object.values(CLOUD_ZONES).flatMap(zone => zone.walk);
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const smooth = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

// Signed distance to each authored footprint. Negative values are inside.
function shapeDistance(s: WalkShape, x: number, z: number): number {
  if (s.kind === "disc") return Math.hypot(x - s.x, z - s.z) - s.r;
  if (s.kind === "trail") return nearestOnTrail(s.pts, x, z).d - s.w;
  const dx = Math.max(s.x0 - x, 0, x - s.x1);
  const dz = Math.max(s.z0 - z, 0, z - s.z1);
  return dx || dz ? Math.hypot(dx, dz) : -Math.min(x - s.x0, s.x1 - x, z - s.z0, s.z1 - z);
}
function walkDistance(x: number, z: number): number {
  let d = Infinity;
  for (const shape of shapes) d = Math.min(d, shapeDistance(shape, x, z));
  return d;
}

// The field reaches well past the island so the shoreline is never clipped.
const PAD = 40;
const x0 = CLOUD_BOUNDS.x0 - PAD, z0 = CLOUD_BOUNDS.z0 - PAD;
const width = CLOUD_BOUNDS.x1 - x0 + PAD + 1, height = CLOUD_BOUNDS.z1 - z0 + PAD + 1;
let field: Float32Array | undefined;
function distanceField(): Float32Array {
  if (!field) {
    const data = new Float32Array(width * height);
    for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
      data[j * width + i] = walkDistance(x0 + i, z0 + j);
    }
    field = data;
  }
  return field;
}
function distanceToWalk(x: number, z: number): number {
  const fx = x - x0, fz = z - z0;
  if (fx < 0 || fz < 0 || fx >= width - 1 || fz >= height - 1) return PAD;
  const data = distanceField(), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  const a = data[j * width + i] * (1 - u) + data[j * width + i + 1] * u;
  const b = data[(j + 1) * width + i] * (1 - u) + data[(j + 1) * width + i + 1] * u;
  const d = a * (1 - v) + b * v;
  // Interpolation can round narrow or diagonal edges: resolve those exactly.
  return d < 1.5 ? walkDistance(x, z) : d;
}

// The south is a coastal strip that follows the shore route, so the sea, bays
// and inlets sit beside the path; the north is one mountain massif that the
// routes climb into. Positive = metres inland from the shoreline.
function coastStrip(x: number, z: number): number {
  const margin = 14 + 5 * Math.sin(x / 11 + z / 17) + 3 * Math.sin(z / 7 - x / 19);
  return margin - distanceToWalk(x, z);
}
// The massif and its peak follow the beacon, so moving the summit areas north
// carries the mountain with them.
const MASSIF_Z = BEACON.z - 35, PEAK_Z = BEACON.z + 32;
function massif(x: number, z: number): number {
  const cx = 6 * Math.sin(z / 47), rx = 76 + 7 * Math.sin(z / 31), rz = 175;
  const nx = (x - cx) / rx, nz = (z - MASSIF_Z) / rz;
  const r = Math.pow(Math.abs(nx) ** 3 + Math.abs(nz) ** 3, 1 / 3);
  return (1 - r) * 80 + 3 * Math.sin(x / 13 + z / 17) + 1.6 * Math.sin(x / 7 - z / 23);
}
function shoreDistance(x: number, z: number): number {
  return Math.max(coastStrip(x, z), massif(x, z));
}
export function cloudLandMask(x: number, z: number): number {
  return shoreDistance(x, z) >= 0 ? 1 : 0;
}
export function cloudGroundY(x: number, z: number): number {
  const shore = shoreDistance(x, z);
  // Beaches continue underwater without a step at the shoreline.
  const beach = .3 + shore * .22;
  // Rocky coastal knolls and headlands away from the water's edge.
  const knolls = smooth((shore - 4) / 10) * (2.2 + 1.8 * Math.sin(x / 9 + z / 13) * Math.sin(z / 11 - x / 17));
  // The mountain body: rises with its depth inland and northward to the summit.
  const body = smooth(massif(x, z) / 45);
  const north = smooth((z - 130) / (PEAK_Z - 142));
  const summit = 34 * Math.exp(-((x / 40) ** 2 + ((z - PEAK_Z) / 34) ** 2));
  const ridges = (3.2 * Math.sin(x / 15 + z / 37) + 1.8 * Math.sin(x / 8 - z / 26)) * north;
  const noise = .5 * Math.sin(x / 5 + z / 11) * Math.sin(z / 8 - x / 13);
  const mountain = body * (6 + north * 24 + summit + ridges);
  const natural = shore <= 0 ? beach : Math.max(beach, Math.min(beach + 1.5, .3 + knolls) + noise * smooth(shore / 6), mountain);
  // A 3 m level shoulder (beyond a 2 m grid triangle's 2.83 m diagonal) keeps
  // the drawn surface exactly at walking height wherever the player can stand.
  const d = distanceToWalk(x, z);
  if (d <= 3) return cloudY(x, z);
  const blend = smooth((d - 3) / 6);
  return cloudY(x, z) * (1 - blend) + natural * blend;
}
