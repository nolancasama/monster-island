import * as THREE from "three";
import { PartBuilder } from "../partBuilder";

/** Lid-local origin is the rear bottom edge; +z points toward the latch. */
export const CHEST_HINGE: [number, number, number] = [0, 0.5, -0.35];
export const CHEST_OPEN_ANGLE = -THREE.MathUtils.degToRad(110);
const BRASS = "#e0b33a";
const DARK = "#17100c";
const INSIDE = "#3b2415";
const LID_INSIDE = "#5a3519";
const profile: [number, number][] = Array.from({ length: 8 }, (_, i) => {
  const angle = i * Math.PI / 7;
  return [i === 0 || i === 7 ? 0 : 0.35 * Math.sin(angle), 0.35 - 0.35 * Math.cos(angle)];
});

/** Closed extrusion of a counterclockwise convex y/z profile, including end caps. */
function prism(points: [number, number][], left: number, right: number, underside = true): THREE.BufferGeometry {
  const vertices: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => vertices.push(...a, ...c, ...b);
  const at = (x: number, i: number) => [x, ...points[i]];
  for (let i = 0; i < points.length - (underside ? 0 : 1); i++) {
    const j = (i + 1) % points.length;
    tri(at(left, i), at(right, i), at(right, j));
    tri(at(left, i), at(right, j), at(left, j));
  }
  for (let i = 1; i < points.length - 1; i++) {
    tri(at(left, 0), at(left, i), at(left, i + 1));
    tri(at(right, 0), at(right, i + 1), at(right, i));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Floor and four thick walls, resting exactly on local y=0. */
export function chestBaseGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0.2);
  b.box(0.98, 0.06, 0.7, 0, 0, 0, "#71401f");
  b.box(0.98, 0.44, 0.06, 0, 0.06, 0.32, "#a8672f");
  b.box(0.98, 0.44, 0.06, 0, 0.06, -0.32, "#915126");
  for (const side of [-1, 1]) {
    b.box(0.06, 0.44, 0.58, side * 0.46, 0.06, 0, "#804723");
    // Liners touch the wood, leaving its thick rim visible above them.
    b.box(0.003, 0.425, 0.58, side * 0.4285, 0.06, 0, INSIDE);
    b.box(0.86, 0.425, 0.003, 0, 0.06, side * 0.2885, INSIDE);
    for (const x of [-0.32, 0.32]) {
      b.box(0.065, side > 0 ? 0.44 : 0.34, 0.006, x, 0.06, side * 0.353, BRASS);
    }
    for (const x of [-1, 1]) {
      b.box(0.056, 0.11, 0.006, x * 0.468, 0, side * 0.353, BRASS);
      b.box(0.006, 0.11, 0.05, x * 0.493, 0, side * 0.325, BRASS);
    }
  }
  b.box(0.854, 0.003, 0.574, 0, 0.06, 0, INSIDE);
  b.box(0.12, 0.14, 0.008, 0, 0.36, 0.354, BRASS);
  b.box(0.022, 0.04, 0.002, 0, 0.405, 0.359, DARK);
  for (const x of [-0.32, 0.32]) {
    b.box(0.065, 0.10, 0.006, x, 0.4, -0.353, BRASS);
    // Rear/lower knuckle quadrant: its axis is exactly the lid's pivot.
    // Keeping the barrel behind the rear edge avoids cutting into either wood part.
    const knuckle: [number, number][] = [[0, 0]];
    for (let i = 0; i <= 3; i++) {
      const a = i * Math.PI / 6;
      knuckle.push([-0.018 * Math.cos(a), -0.018 * Math.sin(a)]);
    }
    b.add(prism(knuckle, x - 0.0325, x + 0.0325), BRASS, CHEST_HINGE);
  }
  return b.build();
}

export function chestLidGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  b.add(prism(profile, -0.49, 0.49, false), "#a8672f", [0, 0, 0]);
  b.add(new THREE.PlaneGeometry(0.98, 0.7), LID_INSIDE, [0, 0, 0.35], [Math.PI / 2, 0, 0]);
  for (const x of [-0.32, 0.32]) {
    // Closed thin skins follow every roof facet, including the rear hinge leaf.
    for (let i = 0; i < profile.length - 1; i++) {
      const [y0, z0] = profile[i], [y1, z1] = profile[i + 1];
      b.add(prism([[y0, z0], [y0 + 0.004, z0], [y1 + 0.004, z1], [y1, z1]], x - 0.0325, x + 0.0325), BRASS, [0, 0, 0]);
    }
  }
  // A wedge hugs the front facet and meets the base latch at the closed seam.
  const [frontY, frontZ] = profile[profile.length - 2];
  const latchTopZ = 0.7 - (0.7 - frontZ) * 0.045 / frontY;
  b.add(prism([[0, 0.7], [0.045, latchTopZ], [0.045, latchTopZ + 0.008], [0, 0.708]], -0.06, 0.06), BRASS, [0, 0, 0]);
  return b.build();
}
