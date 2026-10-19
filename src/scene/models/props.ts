import * as THREE from "three";
import { PartBuilder } from "../partBuilder";
import { between, rockGeometry } from "./nature";
import type { FoodId } from "../../game/types";

/** Professor Maple's research camp (built around its own origin). */
export function tentGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0.4);
  // A-frame tent: two sloped canvas sides, a back wall, a door flap.
  const w = 3.2;
  const d = 2.8;
  const h = 2.2;
  const slope = Math.atan2(w / 2, h);
  const side = Math.hypot(w / 2, h);
  b.boxAt(0.06, side, d, [-w / 4, h / 2, 0], [0, 0, -slope], "#f2b84b");
  b.boxAt(0.06, side, d, [w / 4, h / 2, 0], [0, 0, slope], "#e8a83a");
  b.add(new THREE.ConeGeometry(w / 2 / Math.cos(0.0001), h, 3, 1), "#e39b2f", [0, h / 2, -d / 2 + 0.05], [0, Math.PI, 0], [1, 1, 0.05]);
  // Stripe along the ridge and poles.
  b.cylAt(0.05, d + 0.4, [0, h + 0.02, 0], [Math.PI / 2, 0, 0], "#7a5532", 6);
  b.cyl(0.04, 0.04, h, 0, 0, d / 2 + 0.15, "#7a5532", 6);
  b.cyl(0.04, 0.04, h, 0, 0, -d / 2 - 0.15, "#7a5532", 6);
  // Open door: a dark triangle and a tied-back flap.
  b.add(new THREE.ConeGeometry(0.8, 1.5, 3, 1), "#5a3d22", [0, 0.75, d / 2 + 0.02], [0, Math.PI, 0], [1, 1, 0.02]);
  b.boxAt(0.5, 1.4, 0.05, [0.75, 0.7, d / 2 + 0.05], [0, -0.4, -0.15], "#f7c860");
  // Pegs and ropes.
  between(b, [-w / 2 + 0.2, 0.15, d / 2 - 0.2], [-w / 2 - 0.5, 0, d / 2 + 0.4], 0.015, 0.015, "#e8e0c8", 4);
  between(b, [w / 2 - 0.2, 0.15, d / 2 - 0.2], [w / 2 + 0.5, 0, d / 2 + 0.4], 0.015, 0.015, "#e8e0c8", 4);
  return b.build();
}

export function tableGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0.3);
  b.box(1.7, 0.08, 0.95, 0, 0.82, 0, "#b9874f");
  for (const [x, z] of [
    [-0.75, -0.4],
    [0.75, -0.4],
    [-0.75, 0.4],
    [0.75, 0.4]
  ])
    b.box(0.08, 0.82, 0.08, x, 0, z, "#8a6238");
  // Books, the big journal, a magnifying glass and a jar.
  b.box(0.36, 0.08, 0.28, -0.5, 0.9, -0.1, "#3f7fd0", 0.2);
  b.box(0.34, 0.07, 0.26, -0.5, 0.98, -0.1, "#e0544a", -0.1);
  b.box(0.5, 0.06, 0.36, 0.1, 0.9, 0.12, "#8b4a2b", 0.1);
  b.box(0.46, 0.02, 0.32, 0.1, 0.96, 0.12, "#f8efd8", 0.1);
  b.cylAt(0.09, 0.02, [0.55, 0.92, -0.2], [Math.PI / 2, 0, 0], "#bfe6ff", 12);
  b.cylAt(0.02, 0.22, [0.66, 0.92, -0.08], [Math.PI / 2, 0, 0.6], "#5a3d22", 6);
  b.cyl(0.08, 0.08, 0.2, -0.05, 0.86, -0.3, "#9fe0d0", 10);
  // Crates.
  b.box(0.7, 0.6, 0.6, 1.4, 0, -0.1, "#c99a5c", 0.3);
  b.box(0.5, 0.45, 0.5, 1.3, 0.6, -0.05, "#d8aa6a", -0.2);
  return b.build();
}

export function campfireGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0.2);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    b.add(rockGeometry(0.2, 0.15, i + 3, 0), "#8f8a84", [Math.cos(a) * 0.6, 0.06, Math.sin(a) * 0.6]);
  }
  b.cylAt(0.08, 0.9, [0, 0.12, 0], [0, 0.5, Math.PI / 2], "#7a5532", 7);
  b.cylAt(0.08, 0.9, [0, 0.16, 0], [0, -0.7, Math.PI / 2], "#8a6238", 7);
  // A log bench.
  b.cylAt(0.18, 1.5, [-1.4, 0.18, 0.2], [0.3, 0.5, Math.PI / 2], "#8a6238", 8);
  return b.build();
}

export function flagGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  b.cyl(0.05, 0.05, 3.2, 0, 0, 0, "#e8e0c8", 6);
  b.sphere(0.08, 0, 3.22, 0, "#ffd84a", [1, 1, 1], 8);
  return b.build();
}

export function appleTreeGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0.7);
  b.cyl(0.2, 0.3, 2.1, 0, 0, 0, "#8a5d36", 7);
  between(b, [0, 1.6, 0], [0.7, 2.4, 0.2], 0.12, 0.08, "#8a5d36", 6);
  between(b, [0, 1.7, 0], [-0.6, 2.5, -0.3], 0.12, 0.08, "#8a5d36", 6);
  b.add(rockGeometry(1.6, 1.25, 81, 1), "#4fa53f", [0, 3, 0]);
  b.add(rockGeometry(1.1, 0.9, 82, 1), "#62b84a", [0.9, 2.7, 0.4]);
  b.add(rockGeometry(1.1, 0.9, 83, 1), "#46963b", [-0.9, 2.8, -0.2]);
  // Apples peeking out of the canopy.
  const apples: Array<[number, number, number]> = [
    [0.9, 2.3, 1.1],
    [-0.5, 2.4, 1.2],
    [1.5, 2.9, 0.3],
    [-1.4, 2.7, 0.5],
    [0.2, 3.8, 1],
    [0.6, 2.2, -1.2],
    [-1, 3.3, -1]
  ];
  for (const [x, y, z] of apples) b.sphere(0.17, x, y, z, "#e83a35", [1, 0.95, 1], 8);
  return b.build();
}

export function bananaPlantGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0.6);
  b.cyl(0.16, 0.24, 2.2, 0, 0, 0, "#7f9e4a", 7);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const leaf = new THREE.SphereGeometry(1, 8, 4);
    b.add(leaf, i % 2 ? "#5fb24a" : "#4ea03f", [Math.cos(a) * 0.9, 2.3 - (i % 2) * 0.2, Math.sin(a) * 0.9], [0, -a, 0.55], [1.2, 0.07, 0.38]);
  }
  // A big bunch of bananas.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.add(new THREE.CapsuleGeometry(0.06, 0.3, 3, 6), "#ffd23f", [0.32 + Math.cos(a) * 0.12, 1.55, 0.25 + Math.sin(a) * 0.12], [0.5, a, 0.3]);
  }
  b.cylAt(0.04, 0.4, [0.32, 1.85, 0.25], [0, 0, 0], "#6f8a3a", 5);
  return b.build();
}

export function berryBushGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0.5);
  b.add(rockGeometry(0.95, 0.75, 13, 1), "#3f8f40", [0, 0.45, 0]);
  b.add(rockGeometry(0.65, 0.55, 14, 1), "#4f9e48", [0.6, 0.35, 0.3]);
  b.add(rockGeometry(0.6, 0.5, 15, 1), "#36803a", [-0.55, 0.32, -0.2]);
  const rand = (i: number) => Math.sin(i * 91.7) * 0.5 + 0.5;
  for (let i = 0; i < 22; i++) {
    const a = rand(i) * Math.PI * 2;
    const y = 0.25 + rand(i + 9) * 0.75;
    const r = 0.7 + rand(i + 3) * 0.35;
    b.sphere(0.07, Math.cos(a) * r, y, Math.sin(a) * r, i % 3 ? "#d6234f" : "#8a2be2", [1, 1, 1], 6);
  }
  return b.build();
}

/** The pier (planks on posts) running from (0, z0) to (0, z1). */
export function pierGeometry(z0: number, z1: number): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  const n = Math.round((z1 - z0) / 0.45);
  for (let i = 0; i < n; i++) b.box(1.8, 0.08, 0.38, (i % 2) * 0.03, 0.18, z0 + 0.2 + i * 0.45, i % 3 ? "#b98d58" : "#a87d4b");
  for (let z = z0 + 0.5; z < z1; z += 2) {
    b.cyl(0.09, 0.09, 1.6, -0.85, -1.4, z, "#7a5532", 6);
    b.cyl(0.09, 0.09, 1.6, 0.85, -1.4, z, "#7a5532", 6);
  }
  return b.build();
}

export function fishBasketGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0.2);
  b.cyl(0.42, 0.34, 0.5, 0, 0, 0, "#c99a5c", 10);
  b.torus(0.42, 0.04, [0, 0.5, 0], [Math.PI / 2, 0, 0], "#a87d4b");
  // Fish tails sticking up.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.3;
    b.add(new THREE.ConeGeometry(0.1, 0.22, 4), i % 2 ? "#7fb6e0" : "#9ec9e8", [Math.cos(a) * 0.18, 0.62, Math.sin(a) * 0.18], [0, a, 0.3], [1, 1, 0.35]);
  }
  // A little sign stake with a fish painted on (the scene adds the board).
  return b.build();
}

/** The fallen palm, lying along z, centred on its middle. */
export function fallenPalmGeometry(len: number): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  const segs = 8;
  for (let i = 0; i < segs; i++) {
    const z0 = -len / 2 + (i / segs) * len;
    const z1 = -len / 2 + ((i + 1) / segs) * len;
    const r = 0.32 - (i / segs) * 0.1;
    between(b, [0, 0.32, z0], [0, 0.32 - i * 0.004, z1], r, r - 0.012, i % 2 ? "#8a6238" : "#a07648", 8);
  }
  // Roots at the south end, crown at the north end.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    between(b, [0, 0.32, len / 2], [Math.cos(a) * 0.55, 0.32 + Math.sin(a) * 0.5, len / 2 + 0.25], 0.08, 0.03, "#6d4b2c", 4);
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const leaf = new THREE.ConeGeometry(0.35, 2, 4, 1);
    leaf.scale(1, 1, 0.18);
    b.add(leaf, i % 2 ? "#3f9a3b" : "#58b447", [Math.cos(a) * 0.8, 0.4 + Math.sin(a) * 0.5, -len / 2 - 0.7], [Math.PI / 2 + Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.9]);
  }
  b.sphere(0.32, 0, 0.32, -len / 2, "#7c5a2e", [1, 1, 0.8], 8);
  return b.build();
}

/** Vines that wrap the palm (scaled up from the ground as they grow). */
export function vinesGeometry(len: number): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  for (let k = 0; k < 4; k++) {
    const z = -len / 2 + 1 + k * ((len - 2) / 3);
    const pts: Array<[number, number, number]> = [];
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI * 1.6 + k;
      pts.push([Math.cos(a) * (0.42 + i * 0.01) - 0.6 + i * 0.08, 0.32 + Math.sin(a) * 0.42 + (i < 2 ? -0.3 : 0), z + i * 0.05]);
    }
    for (let i = 1; i < pts.length; i++) between(b, pts[i - 1], pts[i], 0.05, 0.045, "#3fae3a", 5);
    for (let i = 2; i < pts.length; i += 2) {
      const [x, y, zz] = pts[i];
      b.add(new THREE.SphereGeometry(0.1, 6, 4), "#6fd24f", [x, y + 0.04, zz], [0, 0, 0], [1.4, 0.4, 0.8]);
    }
  }
  return b.build();
}

export function steppingStoneGeometry(seed: number): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  b.add(rockGeometry(0.62, 0.5, seed, 1), "#9a958c", [0, 0, 0], [0, seed, 0], [1, 0.55, 0.9]);
  b.add(new THREE.CylinderGeometry(0.5, 0.56, 0.06, 9), "#a8a296", [0, 0.2, 0]);
  return b.build();
}

/** The ancient Monster Stone: a carved monolith with four symbol sockets. */
export function monsterStoneGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(1.2);
  b.add(rockGeometry(1.4, 0.5, 5, 1), "#8a8f86", [0, 0.05, 0], [0, 0, 0], [1.3, 1, 1]);
  b.box(1.5, 3.2, 0.7, 0, 0.2, 0, "#9aa093");
  // A low pyramid cap.
  b.add(new THREE.ConeGeometry(0.95, 0.75, 4, 1), "#8d9387", [0, 3.78, 0], [0, Math.PI / 4, 0], [1.1, 1, 0.52]);
  // Carved frame and sockets.
  b.box(1.62, 0.12, 0.78, 0, 0.2, 0, "#7d8378");
  b.box(1.62, 0.12, 0.78, 0, 3.3, 0, "#7d8378");
  for (const [x, y] of SOCKETS) b.cylAt(0.27, 0.06, [x, y, 0.36], [Math.PI / 2, 0, 0], "#5d6359", 14);
  // Moss.
  b.add(rockGeometry(0.4, 0.2, 9, 0), "#6aa04a", [-0.6, 0.35, 0.3]);
  b.add(rockGeometry(0.3, 0.2, 10, 0), "#6aa04a", [0.62, 3.25, 0.2]);
  return b.build();
}

/** Socket centres on the stone's face (leafy, bubbo, puff, ember). */
export const SOCKETS: Array<[number, number]> = [
  [-0.38, 2.55],
  [0.38, 2.55],
  [-0.38, 1.55],
  [0.38, 1.55]
];

export function signPostGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  b.cyl(0.07, 0.08, 1.7, 0, 0, 0, "#7a5532", 6);
  b.box(1.5, 0.55, 0.08, 0.35, 1.15, 0, "#c48a4c");
  return b.build();
}

/** Thick vines closing the forest path (opens in Phase 2). */
export function vineWallGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0.4);
  for (let i = 0; i < 9; i++) {
    const x = -2 + i * 0.5;
    between(b, [x, 0, 0], [x + Math.sin(i) * 0.4, 3.2, Math.cos(i) * 0.3], 0.07, 0.05, i % 2 ? "#3f8f3a" : "#2f7a32", 5);
  }
  for (let i = 0; i < 14; i++) b.add(rockGeometry(0.42, 0.3, 40 + i, 0), i % 2 ? "#4fa047" : "#3a8a3c", [-2 + (i % 7) * 0.65, 0.6 + Math.floor(i / 7) * 1.5, 0.15]);
  return b.build();
}

/** The crossing post at the river bank (where Bubbo can help). */
export function crossingPostGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  b.cyl(0.09, 0.1, 1.2, 0, 0, 0, "#7a5532", 6);
  b.cyl(0.09, 0.1, 1.2, 0, 0, 1.4, "#7a5532", 6);
  between(b, [0, 1.05, 0], [0, 0.95, 1.4], 0.025, 0.025, "#e8dcb8", 4);
  return b.build();
}

// ------------------------------------------------------------ food

/** One food item (pickups on the ground, the bag, the hand). Sits on y = 0. */
export function foodGeometry(food: FoodId): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  switch (food) {
    case "apples":
      b.sphere(0.2, 0, 0.19, 0, "#e83a35", [1, 0.92, 1], 12);
      b.cyl(0.015, 0.015, 0.1, 0, 0.36, 0, "#6d4626", 4);
      b.add(new THREE.SphereGeometry(0.07, 6, 4), "#58b447", [0.06, 0.42, 0], [0, 0, -0.6], [1.6, 0.4, 0.8]);
      break;
    case "bananas":
      for (let i = 0; i < 3; i++) b.add(new THREE.CapsuleGeometry(0.06, 0.34, 3, 8), "#ffd23f", [(i - 1) * 0.1, 0.12, 0], [Math.PI / 2, 0, (i - 1) * 0.25], [1, 1, 1]);
      b.box(0.08, 0.08, 0.08, 0, 0.1, -0.24, "#6f8a3a");
      break;
    case "fish":
      b.add(new THREE.SphereGeometry(0.16, 10, 8), "#7fb6e0", [0, 0.16, 0], [0, 0, 0], [0.6, 0.9, 1.7]);
      b.add(new THREE.ConeGeometry(0.14, 0.22, 4), "#5e9ccc", [0, 0.16, -0.34], [-Math.PI / 2, 0, 0], [0.3, 1, 1]);
      b.sphere(0.03, 0.08, 0.2, 0.18, "#1d1712", [1, 1, 1], 6);
      b.sphere(0.03, -0.08, 0.2, 0.18, "#1d1712", [1, 1, 1], 6);
      break;
    case "berries":
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.sphere(0.08, Math.cos(a) * 0.1, 0.1 + (i % 2) * 0.08, Math.sin(a) * 0.1, i % 2 ? "#d6234f" : "#8a2be2", [1, 1, 1], 8);
      }
      b.add(new THREE.SphereGeometry(0.08, 6, 4), "#58b447", [0, 0.26, 0], [0, 0, 0], [1.4, 0.3, 0.8]);
      break;
    case "meat":
      b.sphere(0.18, 0, 0.16, 0, "#c0503a", [1.3, 0.8, 1], 10);
      b.cylAt(0.04, 0.3, [0.28, 0.16, 0], [0, 0, Math.PI / 2], "#f5ecd8", 6);
      break;
  }
  return b.build();
}
