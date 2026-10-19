import * as THREE from "three";
import { PartBuilder } from "../partBuilder";

/** Professor Maple: a tall researcher with a safari hat, round glasses, a vest and a satchel. */
export function mapleBodyGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  const skin = "#e8b48a";
  // Shirt, vest and shorts.
  b.add(new THREE.CapsuleGeometry(0.24, 0.42, 4, 10), "#f4f0e2", [0, 1.02, 0], [0, 0, 0], [1, 1, 0.78]);
  b.add(new THREE.CapsuleGeometry(0.255, 0.3, 4, 10), "#7f9a5a", [0, 1.0, -0.01], [0, 0, 0], [1.02, 0.95, 0.8]);
  b.box(0.12, 0.3, 0.04, 0, 0.88, 0.2, "#f4f0e2");
  b.add(new THREE.CylinderGeometry(0.23, 0.25, 0.26, 10), "#b48a55", [0, 0.68, 0], [0, 0, 0], [1, 1, 0.82]);
  // Satchel strap and bag.
  b.boxAt(0.05, 0.7, 0.03, [0.02, 1.08, 0.19], [0, 0, 0.6], "#7a4a2a");
  b.box(0.22, 0.2, 0.1, 0.24, 0.66, 0.12, "#8b5a32");
  // Neck, head, hair bun.
  b.cyl(0.075, 0.085, 0.09, 0, 1.36, 0, skin, 8);
  b.sphere(0.22, 0, 1.62, 0, skin, [1, 1.02, 0.97], 14);
  b.add(new THREE.SphereGeometry(0.23, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), "#a0522d", [0, 1.65, -0.02], [-0.3, 0, 0]);
  b.sphere(0.11, 0, 1.6, -0.24, "#a0522d", [1, 1, 1], 10);
  // Safari hat with a band.
  b.cyl(0.36, 0.36, 0.03, 0, 1.77, 0, "#e3cf98", 18);
  b.add(new THREE.SphereGeometry(0.21, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), "#e3cf98", [0, 1.78, 0]);
  b.cyl(0.212, 0.212, 0.05, 0, 1.79, 0, "#7f9a5a", 18);
  // Round glasses, eyes, smile, cheeks.
  for (const s of [-1, 1]) {
    b.torus(0.055, 0.012, [s * 0.08, 1.63, 0.2], [0, 0, 0], "#4a3220");
    b.sphere(0.025, s * 0.08, 1.63, 0.2, "#1d1712", [1, 1.2, 0.6], 8);
    b.sphere(0.035, s * 0.14, 1.54, 0.17, "#ff9a8a", [1, 0.6, 0.4], 8);
  }
  b.box(0.06, 0.012, 0.02, 0, 1.63, 0.215, "#4a3220");
  b.add(new THREE.TorusGeometry(0.05, 0.012, 4, 10, Math.PI), "#8a3a2a", [0, 1.53, 0.205], [0, 0, Math.PI]);
  return b.build();
}

export function mapleLegGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  b.add(new THREE.CapsuleGeometry(0.08, 0.36, 4, 8), "#e8b48a", [0, -0.28, 0]);
  b.add(new THREE.CylinderGeometry(0.095, 0.095, 0.2, 8), "#5a3d22", [0, -0.52, 0]);
  b.add(new THREE.CapsuleGeometry(0.09, 0.12, 4, 8), "#5a3d22", [0, -0.6, 0.05], [Math.PI / 2, 0, 0], [1, 1.2, 1]);
  return b.build();
}

export function mapleArmGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  b.add(new THREE.CapsuleGeometry(0.075, 0.14, 4, 8), "#f4f0e2", [0, -0.08, 0]);
  b.add(new THREE.CapsuleGeometry(0.06, 0.26, 4, 8), "#e8b48a", [0, -0.3, 0]);
  b.sphere(0.068, 0, -0.5, 0, "#e8b48a", [1, 1, 1], 8);
  return b.build();
}
