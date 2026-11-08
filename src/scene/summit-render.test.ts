import { afterAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { MESA_CENTER, MESA_PLATEAU_Y, MESA_STRATA, mesaRimY } from "../game/world/mesa";
import { SUMMIT_OUTLINE, onSummit, summitY } from "../game/world/upperCanopy";
import { mesaTopGeometry } from "./models/mesaTop";

const geometry = mesaTopGeometry(), material = new THREE.MeshBasicMaterial();
const mesh = new THREE.Mesh(geometry, material);
mesh.updateMatrixWorld();
afterAll(() => { geometry.dispose(); material.dispose(); });

describe("natural summit render floor", () => {
  it("matches summitY within 2 cm at densely sampled walkable points", () => {
    let samples = 0, worst = 0;
    const xs = SUMMIT_OUTLINE.map(p => p[0]), zs = SUMMIT_OUTLINE.map(p => p[1]);
    for (let x = Math.min(...xs) + .07; x < Math.max(...xs); x += .21)
      for (let z = Math.min(...zs) + .11; z < Math.max(...zs); z += .21) {
        if (!onSummit(x, z)) continue;
        const ray = new THREE.Raycaster(new THREE.Vector3(x, 30, z), new THREE.Vector3(0, -1, 0));
        const hits = ray.intersectObject(mesh);
        expect(hits, `one floor at ${x},${z}`).toHaveLength(1);
        worst = Math.max(worst, Math.abs(hits[0].point.y - summitY(x, z)));
        samples++;
      }
    expect(samples).toBeGreaterThan(2000);
    expect(worst).toBeLessThan(.02);
  });

  it("bounds the error between samples at every original height-crease intersection", () => {
    const p = geometry.getAttribute("position");
    const cross = (ax: number, az: number, bx: number, bz: number) => ax * bz - az * bx;
    let worst = 0;
    for (let k = 0; k < p.count; k += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(p, k), b = new THREE.Vector3().fromBufferAttribute(p, k + 1), c = new THREE.Vector3().fromBufferAttribute(p, k + 2);
      const plane = new THREE.Plane().setFromCoplanarPoints(a, b, c);
      for (let i = 0; i < SUMMIT_OUTLINE.length; i++) {
        const [x, z] = SUMMIT_OUTLINE[i], dx = x - MESA_CENTER[0], dz = z - MESA_CENTER[1];
        for (const [u, v] of [[a, b], [b, c], [c, a]]) {
          const ex = v.x - u.x, ez = v.z - u.z, determinant = cross(dx, dz, ex, ez);
          if (Math.abs(determinant) < 1e-9) continue;
          const t = cross(u.x - MESA_CENTER[0], u.z - MESA_CENTER[1], ex, ez) / determinant;
          const s = cross(u.x - MESA_CENTER[0], u.z - MESA_CENTER[1], dx, dz) / determinant;
          if (t < 0 || t > 1 || s < 0 || s > 1) continue;
          const px = MESA_CENTER[0] + dx * t, pz = MESA_CENTER[1] + dz * t;
          const rendered = -(plane.constant + plane.normal.x * px + plane.normal.z * pz) / plane.normal.y;
          const walked = MESA_PLATEAU_Y + (mesaRimY(MESA_STRATA.length - 1, i) - MESA_PLATEAU_Y) * t;
          worst = Math.max(worst, Math.abs(rendered - walked));
        }
      }
    }
    expect(worst).toBeLessThan(.02);
  });

  it("has one watertight, non-radial surface with shared grass colours and normals", () => {
    const p = geometry.getAttribute("position"), normals = geometry.getAttribute("normal"), colors = geometry.getAttribute("color");
    const vertices = new Map<string, { normal: number[]; color: number[]; uses: number }>();
    const edges = new Map<string, number>();
    let area = 0;
    for (let i = 0; i < p.count; i += 3) {
      const keys: string[] = [];
      const a = new THREE.Vector3().fromBufferAttribute(p, i), b = new THREE.Vector3().fromBufferAttribute(p, i + 1), c = new THREE.Vector3().fromBufferAttribute(p, i + 2);
      const face = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
      expect(face.y).toBeGreaterThan(0);
      area += face.y / 2;
      for (let j = i; j < i + 3; j++) {
        expect(Math.hypot(p.getX(j) - MESA_CENTER[0], p.getZ(j) - MESA_CENTER[1])).toBeGreaterThan(.01);
        const key = `${p.getX(j)},${p.getZ(j)}`, normal = [normals.getX(j), normals.getY(j), normals.getZ(j)], color = [colors.getX(j), colors.getY(j), colors.getZ(j)];
        const previous = vertices.get(key);
        if (previous) { expect(normal).toEqual(previous.normal); expect(color).toEqual(previous.color); previous.uses++; }
        else vertices.set(key, { normal, color, uses: 1 });
        keys.push(key);
      }
      for (let j = 0; j < 3; j++) {
        const key = [keys[j], keys[(j + 1) % 3]].sort().join("/");
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    expect([...edges.values()].every(n => n === 1 || n === 2)).toBe(true);
    expect([...edges.values()].filter(n => n === 1)).toHaveLength(SUMMIT_OUTLINE.length);
    const outlineArea = Math.abs(SUMMIT_OUTLINE.reduce((sum, [x, z], i) => {
      const next = SUMMIT_OUTLINE[(i + 1) % SUMMIT_OUTLINE.length];
      return sum + x * next[1] - z * next[0];
    }, 0) / 2);
    expect(area).toBeCloseTo(outlineArea, 3);
    expect(Math.max(...[...vertices.values()].map(v => v.uses))).toBeLessThan(SUMMIT_OUTLINE.length / 2);
    expect(geometry.groups).toEqual([]);
    expect(p.count / 3).toBeLessThanOrEqual(SUMMIT_OUTLINE.length * 2);
  });
});
