import * as THREE from "three";
import { PartBuilder } from "../partBuilder";
import type { Boulder, Palm } from "../../game/world/island";
import { groundY } from "../../game/world/island";
import { makeRng } from "../../game/logic/rng";

type V3 = [number, number, number];

const UP = new THREE.Vector3(0, 1, 0);

/** Cylinder from point a to point b. */
export function between(b: PartBuilder, a: V3, c: V3, r0: number, r1: number, color: THREE.ColorRepresentation, seg = 7) {
  const va = new THREE.Vector3(...a);
  const vc = new THREE.Vector3(...c);
  const dir = vc.clone().sub(va);
  const len = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  const mid = va.clone().add(vc).multiplyScalar(0.5);
  b.add(new THREE.CylinderGeometry(r1, r0, len, seg), color, [mid.x, mid.y, mid.z], [e.x, e.y, e.z]);
}

/** Deterministic lumpy rock (shared vertices get the same jitter, so faces stay closed). */
export function rockGeometry(r: number, h: number, seed: number, detail = 1): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const rand = (x: number, y: number, z: number) => {
    const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 4.1) * 43758.5453;
    return s - Math.floor(s);
  };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 0.78 + rand(Math.round(x * 100), Math.round(y * 100), Math.round(z * 100)) * 0.38;
    p.setXYZ(i, x * r * k, Math.max(-0.35, y) * h * k, z * r * k);
  }
  return g;
}

/** Point along a palm's curved trunk (t = 0 base, 1 crown). */
export function palmAt(palm: Palm, t: number): V3 {
  const base = groundY(palm.x, palm.z) - 0.1;
  const off = palm.lean * palm.height * Math.pow(t, 1.7);
  return [palm.x + Math.sin(palm.dir) * off, base + palm.height * t, palm.z + Math.cos(palm.dir) * off];
}

export function palmsGeometry(palms: Palm[], seed = 7): THREE.BufferGeometry {
  const b = new PartBuilder(0.4);
  const rand = makeRng(seed);
  for (const palm of palms) {
    const segs = 8;
    const at = (t: number): V3 => palmAt(palm, t);
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs;
      const t1 = (i + 1) / segs;
      const r0 = 0.27 - t0 * 0.1;
      const r1 = 0.27 - t1 * 0.1 + 0.025;
      between(b, at(t0), at(t1), r0, r1, i % 2 ? "#8a6238" : "#a07648", 7);
    }
    const top = at(1);
    // Crown: fronds, each a flat inner cone rising out and an outer cone drooping.
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand() * 0.4;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const len1 = 1.5 + rand() * 0.3;
      const len2 = 1.6 + rand() * 0.4;
      const mid: V3 = [top[0] + ca * len1 * 0.95, top[1] + 0.35, top[2] + sa * len1 * 0.95];
      const tip: V3 = [mid[0] + ca * len2 * 0.85, mid[1] - 0.9 - rand() * 0.4, mid[2] + sa * len2 * 0.85];
      const green = i % 2 ? "#3f9a3b" : "#58b447";
      frond(b, [top[0], top[1] + 0.05, top[2]], mid, 0.38, green);
      frond(b, mid, tip, 0.3, green);
    }
    b.sphere(0.3, top[0], top[1] + 0.05, top[2], "#7c5a2e", [1, 0.7, 1], 8);
    if (palm.coconuts) {
      for (let k = 0; k < 3; k++) {
        const a = k * 2.1 + palm.dir;
        b.sphere(0.17, top[0] + Math.cos(a) * 0.26, top[1] - 0.22, top[2] + Math.sin(a) * 0.26, "#6d4626", [1, 1, 1], 8);
      }
    }
  }
  return b.build();
}

/** A flattened cone from a to c (a palm frond segment). */
function frond(b: PartBuilder, a: V3, c: V3, width: number, color: string) {
  const va = new THREE.Vector3(...a);
  const vc = new THREE.Vector3(...c);
  const len = vc.distanceTo(va);
  // Basis: local y along the frond (cone tip = +y), local z (the thin axis) as close to world up as possible.
  const y = vc.clone().sub(va).normalize();
  let z = UP.clone().sub(y.clone().multiplyScalar(UP.dot(y)));
  if (z.lengthSq() < 1e-6) z = new THREE.Vector3(1, 0, 0);
  z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  const e = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  const mid = va.clone().add(vc).multiplyScalar(0.5);
  const cone = new THREE.ConeGeometry(width, len, 4, 1);
  cone.rotateY(Math.PI / 4);
  cone.scale(1, 1, 0.16);
  b.add(cone, color, [mid.x, mid.y, mid.z], [e.x, e.y, e.z]);
}

/** One broadleaf jungle tree (instanced along the tree line). */
export function jungleTreeGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0.8);
  b.cyl(0.22, 0.32, 2.6, 0, -0.2, 0, "#7a5532", 7);
  const canopy = (r: number, x: number, y: number, z: number, c: string) => b.add(rockGeometry(r, r * 0.85, x * 3 + z, 0), c, [x, y, z]);
  canopy(1.7, 0, 3.3, 0, "#3f8f3f");
  canopy(1.25, 0.9, 2.8, 0.5, "#4fa046");
  canopy(1.2, -0.8, 3.0, -0.4, "#367f39");
  canopy(1.0, 0.1, 4.3, 0.2, "#58ad4a");
  return b.build();
}

export function bushGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0.5);
  b.add(rockGeometry(0.85, 0.65, 3, 0), "#4e9a46", [0, 0.35, 0]);
  b.add(rockGeometry(0.6, 0.55, 5, 0), "#5fae4f", [0.55, 0.3, 0.25]);
  b.add(rockGeometry(0.55, 0.5, 9, 0), "#438a3f", [-0.5, 0.28, -0.2]);
  return b.build();
}

/** Bright, broad leaves make gatherable bushes readable among the darker decor. */
export function leafBushGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0.55);
  const leaves: Array<[number, number, number, number, string]> = [
    [0, 0.55, 0, 0.9, "#80cf55"],
    [0.62, 0.48, 0.18, 0.68, "#9add60"],
    [-0.58, 0.42, 0.18, 0.64, "#72bf4b"],
    [0.12, 0.43, -0.58, 0.7, "#66b747"],
    [-0.12, 0.95, -0.08, 0.58, "#a8df65"]
  ];
  for (const [x, y, z, r, color] of leaves) {
    b.add(rockGeometry(r, r * 0.68, 60 + Math.round((x + z) * 20), 0), color, [x, y, z], [0, x * 0.7, 0]);
  }
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7 + 0.4;
    between(b, [0, 0.05, 0], [Math.cos(a) * 0.7, 0.62, Math.sin(a) * 0.7], 0.035, 0.018, "#4f7d31", 4);
  }
  return b.build();
}

/** Smaller straight-trunk tree used for the axe resource nodes. */
export function choppableTreeGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0.65);
  b.cyl(0.17, 0.28, 3.15, 0, 0, 0, "#8b6137", 7);
  b.cyl(0.15, 0.18, 0.65, 0, 2.25, 0, "#a27342", 7);
  b.add(rockGeometry(1.12, 0.85, 71, 0), "#4e9f43", [0, 3.2, 0]);
  b.add(rockGeometry(0.82, 0.68, 72, 0), "#65b34d", [0.65, 3.05, 0.2]);
  b.add(rockGeometry(0.78, 0.64, 73, 0), "#408d3d", [-0.58, 3.1, -0.25]);
  b.add(rockGeometry(0.72, 0.62, 74, 0), "#74bd50", [0.05, 3.8, -0.1]);
  return b.build();
}

export function stumpGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0.15);
  b.cyl(0.22, 0.3, 0.42, 0, 0, 0, "#8b6137", 7);
  b.cyl(0.225, 0.225, 0.035, 0, 0.42, 0, "#d3ae72", 7);
  between(b, [0.08, 0.05, 0], [0.58, 0.03, 0.28], 0.08, 0.03, "#76502f", 5);
  between(b, [-0.08, 0.05, 0], [-0.48, 0.03, -0.35], 0.08, 0.03, "#76502f", 5);
  return b.build();
}

export function bouldersGeometry(list: Boulder[]): THREE.BufferGeometry {
  const b = new PartBuilder(0.9);
  list.forEach((r, i) => {
    const y = groundY(r.x, r.z);
    b.add(rockGeometry(r.r, r.h * 0.75, i + 1), i % 3 ? "#9b958b" : "#8d8a84", [r.x, y + r.h * 0.18, r.z], [0, r.rot, 0]);
  });
  return b.build();
}

export function driftwoodGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0.25);
  b.cylAt(0.15, 1.7, [0, 0.14, 0], [0, 0, Math.PI / 2 + 0.05], "#b29676", 8);
  b.cylAt(0.152, 0.02, [0.86, 0.15, 0], [0, 0, Math.PI / 2], "#e2cfae", 8);
  b.cylAt(0.152, 0.02, [-0.86, 0.13, 0], [0, 0, Math.PI / 2], "#e2cfae", 8);
  b.cylAt(0.1, 1.1, [0.1, 0.27, 0.12], [0.2, 0.9, Math.PI / 2], "#a3896b", 7);
  b.cylAt(0.05, 0.45, [-0.35, 0.3, -0.12], [0.6, 0, 0.5], "#a3896b", 5);
  return b.build();
}

export function stonePileGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0.3);
  b.add(rockGeometry(0.3, 0.26, 11, 0), "#a7adb6", [0, 0.16, 0]);
  b.add(rockGeometry(0.24, 0.2, 12, 0), "#959ba5", [0.36, 0.12, 0.12]);
  b.add(rockGeometry(0.2, 0.18, 13, 0), "#b5bbc4", [-0.3, 0.1, 0.18]);
  b.add(rockGeometry(0.17, 0.15, 14, 0), "#9aa0aa", [0.08, 0.3, 0.05]);
  return b.build();
}

export function coconutGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0.15);
  b.sphere(0.2, 0, 0.19, 0, "#7a4f2c", [1, 0.95, 1], 10);
  b.sphere(0.17, 0.3, 0.16, 0.12, "#6d4626", [1, 0.95, 1], 10);
  b.add(new THREE.ConeGeometry(0.12, 0.6, 4), "#58b447", [-0.25, 0.05, -0.15], [Math.PI / 2, 0.6, 0], [1, 1, 0.2]);
  return b.build();
}

/** Hills and cliffs behind the forest (the rest of the island, for later phases). */
export function farIslandGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(4);
  // Footprints stay north of the walkable forest and pond clearing (z > -42):
  // the terrain's own northern climb encloses the forest, and a hill poking up
  // through the forest floor would read as a wall (and be cut by the line-of-sight fade).
  const hills: Array<[number, number, number, number, string]> = [
    [-66, -60, 24, 14, "#4f8f4a"],
    [-30, -74, 28, 18, "#457f42"],
    [6, -82, 27, 20, "#4a8a45"],
    [44, -72, 26, 16, "#4f8f4a"],
    [70, -45, 24, 10, "#559650"],
    [-82, -30, 22, 8, "#5a9a52"],
    [86, -24, 18, 7, "#5a9a52"]
  ];
  hills.forEach(([x, z, r, h, c], i) => b.add(rockGeometry(r, h, 20 + i, 1), c, [x, -1, z]));
  // The walkable northern terrain now carries the signal tower plateau.
  // Headlands at both ends of the beach.
  b.add(rockGeometry(9, 6, 50, 1), "#8f8a7f", [-46, -1, 10]);
  b.add(rockGeometry(7, 9, 51, 1), "#4f8f4a", [-48, 1.5, -2]);
  b.add(rockGeometry(9, 6, 52, 1), "#8f8a7f", [46, -1, 12]);
  b.add(rockGeometry(8, 9, 53, 1), "#4f8f4a", [48, 1.5, 0]);
  return b.build();
}

/** The abandoned signal tower on the clifftop (the story's last goal). */
export function towerGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  const h = 11;
  const legs: Array<[number, number]> = [
    [-1.6, -1.6],
    [1.6, -1.6],
    [1.6, 1.6],
    [-1.6, 1.6]
  ];
  for (const [x, z] of legs) between(b, [x, 0, z], [x * 0.35, h, z * 0.35], 0.18, 0.12, "#6d5b4a", 5);
  for (let k = 1; k <= 3; k++) {
    const y = (h / 4) * k;
    const s = 1 - (0.65 * y) / h;
    for (let i = 0; i < 4; i++) {
      const [ax, az] = legs[i];
      const [bx, bz] = legs[(i + 1) % 4];
      between(b, [ax * s, y, az * s], [bx * s, y, bz * s], 0.07, 0.07, "#7d6a58", 4);
    }
  }
  b.box(2.2, 0.25, 2.2, 0, h, 0, "#7d6a58");
  b.box(1.2, 1.1, 1.2, 0, h + 0.25, 0, "#a35a3c");
  b.cyl(0.05, 0.05, 2.2, 0, h + 1.35, 0, "#3b3b3b", 5);
  return b.build();
}
