import * as THREE from "three";
import { MESA_CENTER, MESA_PLATEAU_Y, MESA_STRATA, mesaRimY } from "../../game/world/mesa";
import { SUMMIT_OUTLINE, summitY } from "../../game/world/upperCanopy";

type Point = [number, number];
type Face = [number, number, number];
const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const noise = (x: number, z: number) => .5 + .25 * Math.sin(x * .39 + z * .17) + .25 * Math.sin(z * .31 - x * .23);

/** An irregular, height-bounded triangulation of the existing summit floor.
 * The rim is immutable. Interior vertices spread outward and edges flip only
 * when the resulting planes stay within 18 mm of the original height field.
 * Checking intersections with EVERY original height crease bounds the error
 * over whole triangles, including between samples, rather than just vertices.
 * n rim vertices + floor(n/2) interior vertices cost at most 2n - 2 triangles. */
export function mesaTopGeometry(): THREE.BufferGeometry {
  const n = SUMMIT_OUTLINE.length, count = Math.floor(n / 2);
  const points: Point[] = SUMMIT_OUTLINE.map(p => [...p]);
  const heights = points.map((_, i) => mesaRimY(MESA_STRATA.length - 1, i));
  const faces: Face[] = [];
  const rimIndex = (i: number) => Math.floor(i * n / count);
  for (let i = 0; i < count; i++) {
    const [x, z] = points[rimIndex(i)], t = .016 + .008 * noise(x, z);
    const p: Point = [MESA_CENTER[0] + (x - MESA_CENTER[0]) * t, MESA_CENTER[1] + (z - MESA_CENTER[1]) * t];
    points.push(p); heights.push(summitY(...p));
  }
  for (let i = 0; i < count; i++) {
    const start = rimIndex(i), end = i + 1 === count ? n : rimIndex(i + 1);
    for (let j = start; j < end; j++) faces.push([n + i, j, (j + 1) % n]);
    faces.push([n + i, end % n, n + (i + 1) % count]);
  }
  // Ear clipping fills the small inner polygon without a central hub.
  faces.push(...THREE.ShapeUtils.triangulateShape(points.slice(n).map(p => new THREE.Vector2(...p)), [])
    .map(f => f.map(i => i + n) as Face));
  const orient = (f: Face): Face => cross(points[f[0]], points[f[1]], points[f[2]]) < 0 ? f : [f[0], f[2], f[1]];
  for (let i = 0; i < faces.length; i++) faces[i] = orient(faces[i]);

  const fitsHeight = (f: Face) => {
    const [a, b, c] = f.map(i => points[i]), area = cross(a, b, c);
    if (area >= -1e-9) return false;
    const error = (p: Point, y: number) => {
      const u = cross(b, c, p) / area, v = cross(c, a, p) / area;
      return Math.abs(u * heights[f[0]] + v * heights[f[1]] + (1 - u - v) * heights[f[2]] - y);
    };
    const inside = (p: Point) => cross(a, b, p) <= 1e-9 && cross(b, c, p) <= 1e-9 && cross(c, a, p) <= 1e-9;
    if (inside(MESA_CENTER) && error(MESA_CENTER, MESA_PLATEAU_Y) > .018) return false;
    for (let i = 0; i < n; i++) {
      const r = points[i], dx = r[0] - MESA_CENTER[0], dz = r[1] - MESA_CENTER[1];
      for (const [p, q] of [[a, b], [b, c], [c, a]]) {
        const ex = q[0] - p[0], ez = q[1] - p[1], det = dx * ez - dz * ex;
        if (Math.abs(det) < 1e-10) continue;
        const px = p[0] - MESA_CENTER[0], pz = p[1] - MESA_CENTER[1];
        const t = (px * ez - pz * ex) / det, u = (px * dz - pz * dx) / det;
        if (t < 0 || t > 1 || u < 0 || u > 1) continue;
        if (error([MESA_CENTER[0] + dx * t, MESA_CENTER[1] + dz * t], MESA_PLATEAU_Y + (heights[i] - MESA_PLATEAU_Y) * t) > .018) return false;
      }
    }
    return true;
  };
  // Different expansion rates make an irregular set of interior samples.
  // Reject inversions as well as height errors, so coverage stays watertight.
  for (let pass = 0; pass < 18; pass++) for (let i = n; i < points.length; i++) {
    const old = points[i], oldY = heights[i], rim = points[rimIndex(i - n)];
    const amount = .025 + .025 * noise(old[1], old[0]);
    points[i] = [old[0] + (rim[0] - old[0]) * amount, old[1] + (rim[1] - old[1]) * amount];
    heights[i] = summitY(...points[i]);
    if (faces.some(f => f.includes(i) && !fitsHeight(f))) { points[i] = old; heights[i] = oldY; }
  }
  // Shorten diagonals wherever the immutable height creases allow it. This
  // removes the radial topology without reintroducing a visible height seam.
  for (let pass = 0; pass < 24; pass++) {
    const edges = new Map<string, { face: number; a: number; b: number; c: number }>();
    let changed = false;
    for (let i = 0; i < faces.length; i++) {
      for (let k = 0; k < 3; k++) {
        const a = faces[i][k], b = faces[i][(k + 1) % 3], d = faces[i][(k + 2) % 3];
        const key = a < b ? `${a},${b}` : `${b},${a}`, other = edges.get(key);
        if (!other) { edges.set(key, { face: i, a, b, c: d }); continue; }
        const c = other.c;
        // A previous flip may have consumed this cached edge.
        if (!faces[other.face].includes(a) || !faces[other.face].includes(b) || !faces[other.face].includes(c)) continue;
        if (cross(points[c], points[d], points[a]) * cross(points[c], points[d], points[b]) >= -1e-12) continue;
        const length = (u: number, v: number) => (points[u][0] - points[v][0]) ** 2 + (points[u][1] - points[v][1]) ** 2;
        if (length(c, d) >= length(a, b) * .999) continue;
        const first = orient([c, d, a]), second = orient([d, c, b]);
        if (!fitsHeight(first) || !fitsHeight(second)) continue;
        faces[other.face] = first; faces[i] = second; changed = true;
        break;
      }
    }
    if (!changed) break;
  }

  const positions: number[] = [], colors: number[] = [];
  const green = new THREE.Color("#729b4c"), dark = new THREE.Color("#567e40"), earth = new THREE.Color("#9b9270");
  points.forEach(([x, z], i) => {
    positions.push(x, heights[i], z);
    const variation = noise(x, z), patch = noise(x + 19, z - 7);
    const color = green.clone().lerp(dark, variation * .7).lerp(earth, THREE.MathUtils.smoothstep(patch, .64, .96) * .45);
    colors.push(color.r, color.g, color.b);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(points.length * 2), 2));
  g.setIndex(faces.flat());
  g.computeVertexNormals(); // shared normals survive conversion into the existing non-indexed batch
  const result = g.toNonIndexed();
  g.dispose();
  return result;
}
