import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { world } from "./lib/cloud-source.mjs";
const { cloudGroundY, cloudLandMask } = await import("../src/game/world/cloudTerrain.ts");

const { CLOUD_ZONES, CLOUD_SPAWNS, CLOUD_CHESTS, COAST_GATE, HOLLOW, OBSERVATORY, BEACON } = world;
const x0 = -115, z0 = -50, width = 231, height = 481;
const pixels = Buffer.alloc((width * 4 + 1) * height);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
function distance(s, x, z) {
  if (s.kind === "disc") return Math.hypot(x - s.x, z - s.z) - s.r;
  if (s.kind === "rect") {
    const dx = Math.max(s.x0 - x, 0, x - s.x1), dz = Math.max(s.z0 - z, 0, z - s.z1);
    return dx || dz ? Math.hypot(dx, dz) : -Math.min(x - s.x0, s.x1 - x, z - s.z0, s.z1 - z);
  }
  let d = Infinity;
  for (let i = 1; i < s.pts.length; i++) {
    const [ax, az] = s.pts[i - 1], [bx, bz] = s.pts[i];
    const dx = bx - ax, dz = bz - az, t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    d = Math.min(d, Math.hypot(x - ax - t * dx, z - az - t * dz) - s.w);
  }
  return d;
}
const shapes = Object.values(CLOUD_ZONES).flatMap(zone => zone.walk);
function set(x, z, c) {
  const px = Math.round(x - x0), py = height - 1 - Math.round(z - z0);
  if (px < 0 || px >= width || py < 0 || py >= height) return;
  const p = py * (width * 4 + 1) + 1 + px * 4;
  pixels[p] = c[0]; pixels[p + 1] = c[1]; pixels[p + 2] = c[2]; pixels[p + 3] = 255;
}
for (let z = z0; z < z0 + height; z++) for (let x = x0; x < x0 + width; x++) {
  const y = cloudGroundY(x, z);
  let color = !cloudLandMask(x, z) ? [38, 91, 123] : y < 2 ? [207, 190, 137] : y < 16 ? [91, 139, 90] : y < 30 ? [104, 128, 98] : [137, 139, 134];
  const shade = clamp(.88 + (cloudGroundY(x - 1, z + 1) - cloudGroundY(x + 1, z - 1)) * .08, .5, 1.3);
  color = color.map(c => clamp(Math.round(c * shade), 0, 255));
  const d = Math.min(...shapes.map(s => distance(s, x, z)));
  if (Math.abs(d) < .75) color = [255, 235, 175];
  set(x, z, color);
}
function mark(p, c) {
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) + Math.abs(dz) <= 2) set(p.x + dx, p.z + dz, c);
}
Object.values(CLOUD_SPAWNS).forEach(p => mark(p, [55, 235, 246]));
CLOUD_CHESTS.forEach(p => mark(p, [255, 179, 38]));
mark(COAST_GATE, [245, 65, 76]);
[HOLLOW.center, OBSERVATORY, BEACON].forEach(p => mark(p, [231, 93, 235]));
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) { crc ^= byte; for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
mkdirSync(".tmp/shots/expansion/x1", { recursive: true });
writeFileSync(".tmp/shots/expansion/x1/map.png", png);
console.log("Wrote .tmp/shots/expansion/x1/map.png (cyan: spawns, gold: chests, red: gate, purple: landmarks)");
