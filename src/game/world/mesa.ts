import { lowlandY, MESA_OUTLINE } from "./lowland";

export type MesaPoint = [number, number];
export const MESA_CENTER: MesaPoint = [77, -209];
export const MESA_PLATEAU_Y = 22.4;

// Subdivide the *exact* reserved edge. Only higher strata retreat from it.
export const MESA_FOOT: MesaPoint[] = MESA_OUTLINE.flatMap(([ax, az], i) => {
  const [bx, bz] = MESA_OUTLINE[(i + 1) % MESA_OUTLINE.length];
  const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 2);
  return Array.from({ length: n }, (_, j): MesaPoint => [ax + (bx - ax) * j / n, az + (bz - az) * j / n]);
});

// Sample more finely than the terrain mesh, including its neighbouring cells.
// A common buried bottom avoids gaps even where a bank falls between vertices.
export const MESA_SKIRT_Y = Math.min(...MESA_FOOT.flatMap(([ax, az], i) => {
  const [bx, bz] = MESA_FOOT[(i + 1) % MESA_FOOT.length];
  return Array.from({ length: 9 }, (_, j) => {
    const x = ax + (bx - ax) * j / 8, z = az + (bz - az) * j / 8;
    return Math.min(...[-2, 0, 2].flatMap(dx => [-2, 0, 2].map(dz => lowlandY(x + dx, z + dz))));
  });
})) - 1.2;

export const MESA_STRATA = [5.4, 8.8, 12.2, 15.7, 19.1, MESA_PLATEAU_Y].map((y, band) => ({
  y,
  outline: MESA_FOOT.map(([x, z], i): MesaPoint => {
    if (band === 0) return [x, z];
    // The jag (0–.06) never exceeds the .06 step, so no band overhangs the one below.
    const scale = 1 - band * .06 - .03 * (1 + Math.sin(i * 1.93 + band * 1.7));
    return [77 + (x - 77) * scale + .12 * Math.sin(band * 2), -209 + (z + 209) * scale + .16 * Math.cos(band * 2)];
  }),
}));

/** Shared mesh/camera seam heights; offsets keep the cap inside the 18–22 m rise. */
export const mesaRimY = (band: number, i: number) => MESA_STRATA[band].y + .28 * Math.sin(i * 1.73 + band * 2.1);

function within(outline: MesaPoint[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [ax, az] = outline[i], [bx, bz] = outline[j];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    if (Math.hypot(x - ax - t * dx, z - az - t * dz) < 1e-7) return true;
    if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
  }
  return inside;
}

/** Conservative rock ceiling, independent of walking height. */
export function mesaFloorY(x: number, z: number): number {
  if (x < 65 || x > 89 || z < -231 || z > -187) return -Infinity;
  for (let i = MESA_STRATA.length - 1; i >= 0; i--) {
    if (within(MESA_STRATA[i].outline, x, z)) return MESA_STRATA[i].y + .28;
  }
  return -Infinity;
}

/** Exact horizontal edge crossings supplement CameraRig's spaced floor probes.
 * Checking every entry/exit clears even a very short clip through a jagged ledge. */
export function mesaCameraLift(target: { x: number; y: number; z: number }, camera: { x: number; y: number; z: number }): number {
  if (Math.max(target.x, camera.x) < 65 || Math.min(target.x, camera.x) > 89 ||
      Math.max(target.z, camera.z) < -231 || Math.min(target.z, camera.z) > -187) return 0;
  const dx = camera.x - target.x, dz = camera.z - target.z;
  let lift = 0;
  for (const band of MESA_STRATA) {
    const crossings = [0, 1];
    band.outline.forEach(([ax, az], i) => {
      const [bx, bz] = band.outline[(i + 1) % band.outline.length];
      const ex = bx - ax, ez = bz - az, cross = dx * ez - dz * ex;
      if (Math.abs(cross) < 1e-9) return;
      const t = ((ax - target.x) * ez - (az - target.z) * ex) / cross;
      const u = ((ax - target.x) * dz - (az - target.z) * dx) / cross;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) crossings.push(t);
    });
    crossings.sort((a, b) => a - b);
    for (let i = 1; i < crossings.length; i++) {
      const a = crossings[i - 1], b = crossings[i], mid = (a + b) / 2;
      if (!within(band.outline, target.x + dx * mid, target.z + dz * mid)) continue;
      for (const t of [Math.max(a, .0001), b]) {
        lift = Math.max(lift, (band.y + .98 - target.y - (camera.y - target.y) * t) / t);
      }
    }
  }
  return lift;
}
