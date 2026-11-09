import * as THREE from "three";
import { SHALLOW_WATER, SHALLOW_WATER_DEPTH, shallowWaterAt } from "../../game/world/groveShallows";
import { lowlandY } from "../../game/world/lowland";

/** The ankle water is its own draw, culled by distance: from the sanctuary and
 * town it otherwise rides the island-wide water tiles into every southward view. */
export const GROVE_SHALLOWS_FAR = 55;

/** One union surface, rather than overlapping transparent pool primitives.
 * Marching triangles follow the authored winding edges and cut out dry islands.
 * A small inset keeps boundary chords out of protected banks and puzzle pockets. */
export function groveShallowsGeometry(): THREE.BufferGeometry {
  const bounds = SHALLOW_WATER.map(shape => {
    if (shape.kind === "rect") return shape;
    const xs = shape.kind === "disc" ? [shape.x] : shape.pts.map(p => p[0]);
    const zs = shape.kind === "disc" ? [shape.z] : shape.pts.map(p => p[1]);
    const r = shape.kind === "disc" ? shape.r : shape.w;
    return { x0: Math.min(...xs) - r, x1: Math.max(...xs) + r, z0: Math.min(...zs) - r, z1: Math.max(...zs) + r };
  });
  const x0 = Math.floor(Math.min(...bounds.map(b => b.x0)));
  const x1 = Math.ceil(Math.max(...bounds.map(b => b.x1)));
  const z0 = Math.floor(Math.min(...bounds.map(b => b.z0)));
  const z1 = Math.ceil(Math.max(...bounds.map(b => b.z1)));
  const step = 1.25, inset = .12;
  type Point = [number, number];
  const wet = ([x, z]: Point) => shallowWaterAt(x, z)
    && shallowWaterAt(x - inset, z) && shallowWaterAt(x + inset, z)
    && shallowWaterAt(x, z - inset) && shallowWaterAt(x, z + inset);
  const positions: number[] = [], colors: number[] = [];
  // Clear green-teal swamp water. Green exceeds blue in every shallow colour:
  // the shared water shader keys ankle water on that (every other water is
  // blue ≥ green), so keep that property when changing these.
  const deep = new THREE.Color("#3fa58f"), light = new THREE.Color("#5cbca3"), foam = new THREE.Color("#d2f5df");
  // Pale shoreline band: vertices with dry floor within ~.7 m.
  const shoreCache = new Map<string, number>();
  const shore = (x: number, z: number) => {
    const key = `${x.toFixed(3)},${z.toFixed(3)}`;
    let v = shoreCache.get(key);
    if (v === undefined) {
      v = 0;
      for (let i = 0; i < 6 && v < 1; i++) {
        const a = i * Math.PI / 3;
        if (!shallowWaterAt(x + Math.cos(a) * .35, z + Math.sin(a) * .35)) v = 1;
        else if (!shallowWaterAt(x + Math.cos(a) * .75, z + Math.sin(a) * .75)) v = Math.max(v, .2);
      }
      shoreCache.set(key, v);
    }
    return v;
  };
  const edge = (a: Point, b: Point, inside: boolean): Point => {
    let lo = a, hi = b;
    for (let i = 0; i < 8; i++) {
      const mid: Point = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
      if (wet(mid) === inside) lo = mid; else hi = mid;
    }
    return inside ? lo : hi;
  };
  const triangle = (points: Point[], refinement = 0) => {
    const inside = points.map(wet);
    if (refinement === 0) {
      const mids = points.map((p, i): Point => [(p[0] + points[(i + 1) % 3][0]) / 2, (p[1] + points[(i + 1) % 3][1]) / 2]);
      const midInside = mids.map(wet);
      const heights = points.map(([x, z]) => lowlandY(x, z));
      const mx = (points[0][0] + points[1][0] + points[2][0]) / 3;
      const mz = (points[0][1] + points[1][1] + points[2][1]) / 3;
      const curved = Math.abs(lowlandY(mx, mz) - (heights[0] + heights[1] + heights[2]) / 3) > .06
        || mids.some(([x, z], i) => Math.abs(lowlandY(x, z) - (heights[i] + heights[(i + 1) % 3]) / 2) > .06);
      // Refine shorelines only. Shorter chords keep curved dry-island edges
      // conservative without spending extra triangles over the open pools.
      if ([...inside, ...midInside].some(Boolean) && (curved || ![...inside, ...midInside].every(Boolean))) {
        triangle([points[0], mids[0], mids[2]], 1);
        triangle([mids[0], points[1], mids[1]], 1);
        triangle([mids[2], mids[1], points[2]], 1);
        triangle([mids[0], mids[1], mids[2]], 1);
        return;
      }
    }
    const clipped: Point[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      const ia = inside[i], ib = inside[(i + 1) % points.length];
      if (ia) clipped.push(a);
      if (ia !== ib) clipped.push(edge(a, b, ia));
    }
    for (let i = 1; i + 1 < clipped.length; i++) {
      const verts = [clipped[0], clipped[i], clipped[i + 1]];
      for (const [xx, zz] of verts) {
        const color = deep.clone().lerp(light, .5 + .5 * Math.sin(xx * .23 + Math.sin(zz * .19))).lerp(foam, .7 * shore(xx, zz));
        positions.push(xx, lowlandY(xx, zz) + SHALLOW_WATER_DEPTH, zz);
        colors.push(color.r, color.g, color.b);
      }
    }
  };
  for (let z = z0; z < z1; z += step) for (let x = x0; x < x1; x += step) {
    const xx = Math.min(x + step, x1), zz = Math.min(z + step, z1);
    triangle([[x, z], [x, zz], [xx, z]]);
    triangle([[xx, z], [x, zz], [xx, zz]]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(positions.length / 3 * 2), 2));
  geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}
