import * as THREE from "three";
import { PartBuilder } from "../partBuilder";
import { between } from "./nature";

/**
 * Monster rigs: each part is one merged, vertex-coloured geometry hung from a
 * pivot, so the scene can bounce, shake, blink and wag them. Leafy is an
 * upright bean with a leaf sprout; Bubbo is a wide, low axolotl with gills
 * and a tail: two different silhouettes, not one model recoloured.
 */

export interface MonsterParts {
  /** Body without the moving parts (y = 0 at the feet). */
  body: THREE.BufferGeometry;
  /** Eyes (scaled in y to blink and sleep), pivot at eye height. */
  eyes: THREE.BufferGeometry;
  eyeY: number;
  /** Named moving parts with their pivots. */
  parts: Array<{ name: string; geo: THREE.BufferGeometry; pivot: [number, number, number] }>;
  /** Shadow size. */
  shadow: number;
  /** Where the "!" and hearts appear. */
  top: number;
}

function eyePair(b: PartBuilder, x: number, y: number, z: number, r: number, look = 0) {
  for (const s of [-1, 1]) {
    b.sphere(r, s * x, y, z, "#ffffff", [1, 1.15, 0.6], 12);
    b.sphere(r * 0.62, s * x + look, y - r * 0.08, z + r * 0.38, "#1d1712", [1, 1.15, 0.6], 10);
    b.sphere(r * 0.2, s * x + r * 0.22, y + r * 0.3, z + r * 0.62, "#ffffff", [1, 1, 0.6], 6);
  }
}

// ------------------------------------------------------------------ Leafy

export function leafyParts(): MonsterParts {
  const body = new PartBuilder(0);
  // Bean-shaped body with a pale belly.
  body.sphere(0.4, 0, 0.52, 0, "#5cc24a", [1, 1.12, 0.95], 16);
  body.sphere(0.3, 0, 0.45, 0.17, "#c9f08a", [0.95, 1.05, 0.55], 14);
  // Cheeks and a little smile.
  body.sphere(0.06, -0.21, 0.62, 0.33, "#ff9a8a", [1, 0.6, 0.4], 8);
  body.sphere(0.06, 0.21, 0.62, 0.33, "#ff9a8a", [1, 0.6, 0.4], 8);
  body.add(new THREE.TorusGeometry(0.06, 0.016, 4, 10, Math.PI), "#2a5a1e", [0, 0.6, 0.37], [0, 0, Math.PI]);
  // Feet.
  const footL = new PartBuilder(0);
  footL.sphere(0.13, 0, -0.06, 0.05, "#3f9a35", [1, 0.6, 1.3], 10);
  const footR = new PartBuilder(0);
  footR.sphere(0.13, 0, -0.06, 0.05, "#3f9a35", [1, 0.6, 1.3], 10);
  // Leaf arms hang from the shoulders.
  const arm = () => {
    const a = new PartBuilder(0);
    a.add(new THREE.SphereGeometry(0.16, 8, 6), "#4fb43f", [0, -0.16, 0.02], [0, 0, 0], [0.55, 1, 0.22]);
    between(a, [0, 0, 0], [0, -0.24, 0.03], 0.025, 0.015, "#3a8a2e", 4);
    return a.build();
  };
  // The sprout: a stem and two big leaves (and the friendship flower, separately).
  const sprout = new PartBuilder(0);
  between(sprout, [0, 0, 0], [0.02, 0.24, 0], 0.035, 0.028, "#3a8a2e", 6);
  sprout.add(new THREE.SphereGeometry(0.2, 10, 6), "#6fd24f", [-0.17, 0.27, 0], [0, 0, 0.55], [1, 0.26, 0.55]);
  sprout.add(new THREE.SphereGeometry(0.2, 10, 6), "#58c040", [0.19, 0.3, 0], [0, 0, -0.5], [1, 0.26, 0.55]);
  const flower = new PartBuilder(0);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    flower.sphere(0.07, Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08, "#ff7eb0", [1, 0.4, 1], 8);
  }
  flower.sphere(0.05, 0, 0.02, 0, "#ffe066", [1, 0.7, 1], 8);
  const eyes = new PartBuilder(0);
  eyePair(eyes, 0.125, 0, 0.3, 0.09);
  return {
    body: body.build(),
    eyes: eyes.build(),
    eyeY: 0.76,
    parts: [
      { name: "footL", geo: footL.build(), pivot: [-0.15, 0.1, 0] },
      { name: "footR", geo: footR.build(), pivot: [0.15, 0.1, 0] },
      { name: "armL", geo: arm(), pivot: [-0.36, 0.62, 0] },
      { name: "armR", geo: arm(), pivot: [0.36, 0.62, 0] },
      { name: "sprout", geo: sprout.build(), pivot: [0, 0.94, -0.02] },
      { name: "flower", geo: flower.build(), pivot: [0.02, 1.2, 0] }
    ],
    shadow: 0.9,
    top: 1.45
  };
}

// ------------------------------------------------------------------ Puff

/**
 * Puff: a small, round, fluffy flier with two big feathered wings, little
 * feet and a curly tuft (no tail, so "It has wings." is the only body-part
 * answer). It hovers; its feet dangle.
 */
export function puffParts(): MonsterParts {
  const body = new PartBuilder(0);
  // Fluffy ball: a core plus tufts around it.
  body.sphere(0.3, 0, 0.42, 0, "#a070e0", [1, 0.95, 0.95], 16);
  const rand = (i: number) => Math.sin(i * 47.3) * 0.5 + 0.5;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const y = 0.42 + (rand(i) - 0.5) * 0.36;
    body.sphere(0.09, Math.cos(a) * 0.24, y, Math.sin(a) * 0.24 - 0.03, i % 2 ? "#9a66dc" : "#ad80ea", [1, 0.9, 1], 8);
  }
  body.sphere(0.2, 0, 0.36, 0.14, "#e6d4ff", [1, 1, 0.6], 12);
  // Tiny beak and cheeks.
  body.add(new THREE.ConeGeometry(0.045, 0.1, 6), "#ffb347", [0, 0.44, 0.31], [Math.PI / 2, 0, 0]);
  body.sphere(0.04, -0.15, 0.42, 0.25, "#ff9ec0", [1, 0.6, 0.4], 8);
  body.sphere(0.04, 0.15, 0.42, 0.25, "#ff9ec0", [1, 0.6, 0.4], 8);
  // Little stick feet.
  const foot = () => {
    const f = new PartBuilder(0);
    between(f, [0, 0, 0], [0, -0.14, 0.02], 0.018, 0.018, "#ffb347", 4);
    for (const a of [-0.5, 0, 0.5]) between(f, [0, -0.14, 0.02], [Math.sin(a) * 0.06, -0.16, 0.02 + Math.cos(a) * 0.06], 0.014, 0.012, "#ffb347", 4);
    return f.build();
  };
  // A wing: three feathers fanned out from the shoulder (pivot), pointing sideways.
  const wing = (side: number) => {
    const w = new PartBuilder(0);
    const feathers: Array<[number, number, string]> = [
      [0.25, 0.36, "#c9a6ff"],
      [-0.05, 0.42, "#b48cf5"],
      [-0.35, 0.34, "#9f74e8"]
    ];
    for (const [a, len, c] of feathers) {
      w.add(new THREE.SphereGeometry(0.12, 8, 5), c, [side * Math.cos(a) * len * 0.55, Math.sin(a) * len * 0.55, -0.02], [0, 0, side * a], [len * 4.2, 0.85, 0.28]);
    }
    w.sphere(0.07, side * 0.04, 0, 0, "#ad80ea", [1, 1, 0.6], 8);
    return w.build();
  };
  const tuft = new PartBuilder(0);
  between(tuft, [0, 0, 0], [0.04, 0.14, 0], 0.02, 0.016, "#7f4fcc", 4);
  tuft.add(new THREE.TorusGeometry(0.05, 0.016, 4, 10, Math.PI * 1.5), "#7f4fcc", [0.08, 0.17, 0], [0, 0, -0.5]);
  const eyes = new PartBuilder(0);
  eyePair(eyes, 0.1, 0, 0.24, 0.075);
  return {
    body: body.build(),
    eyes: eyes.build(),
    eyeY: 0.52,
    parts: [
      { name: "footL", geo: foot(), pivot: [-0.09, 0.16, 0.02] },
      { name: "footR", geo: foot(), pivot: [0.09, 0.16, 0.02] },
      { name: "wingL", geo: wing(-1), pivot: [-0.3, 0.5, -0.04] },
      { name: "wingR", geo: wing(1), pivot: [0.3, 0.5, -0.04] },
      { name: "tuft", geo: tuft.build(), pivot: [0, 0.72, 0] }
    ],
    shadow: 0.75,
    top: 1.05
  };
}

// ------------------------------------------------------------------ Bubbo

export function bubboParts(): MonsterParts {
  const body = new PartBuilder(0);
  // Wide, low body with a pale belly and a big smile.
  body.sphere(0.46, 0, 0.42, 0, "#3f9fe8", [1.25, 0.82, 1.15], 16);
  body.sphere(0.36, 0, 0.32, 0.12, "#b9e4ff", [1.15, 0.62, 1], 14);
  body.add(new THREE.TorusGeometry(0.14, 0.02, 4, 12, Math.PI), "#1d4f7a", [0, 0.42, 0.5], [0, 0, Math.PI], [1, 0.7, 1]);
  body.sphere(0.05, -0.3, 0.46, 0.43, "#ff9ec0", [1, 0.6, 0.4], 8);
  body.sphere(0.05, 0.3, 0.46, 0.43, "#ff9ec0", [1, 0.6, 0.4], 8);
  // Spots on the back.
  for (const [x, z] of [
    [-0.2, -0.15],
    [0.15, -0.3],
    [0.32, 0.02],
    [-0.36, 0.12]
  ])
    body.sphere(0.06, x, 0.74, z, "#7cc4ff", [1, 0.3, 1], 8);
  // Four stubby legs.
  const leg = () => {
    const l = new PartBuilder(0);
    l.sphere(0.1, 0, -0.08, 0, "#2f86cc", [1, 1.1, 1.2], 8);
    return l.build();
  };
  // Frilly pink gills, three on each side of the head.
  const gills = (side: number) => {
    const g = new PartBuilder(0);
    for (let i = 0; i < 3; i++) {
      const a = 0.5 - i * 0.5;
      const len = 0.24 - i * 0.03;
      between(g, [0, 0, 0], [side * Math.cos(a) * len, Math.sin(a) * len + 0.05, -0.04], 0.035, 0.05, "#ff7eb0", 5);
      g.sphere(0.05, side * Math.cos(a) * len, Math.sin(a) * len + 0.05, -0.04, "#ff9cc4", [1, 1, 1], 6);
    }
    return g.build();
  };
  const tail = new PartBuilder(0);
  tail.add(new THREE.SphereGeometry(0.26, 10, 6), "#3f9fe8", [0, 0, -0.22], [0, 0, 0], [0.18, 0.8, 1.1]);
  tail.add(new THREE.SphereGeometry(0.2, 10, 6), "#9fd6ff", [0, 0.1, -0.32], [0, 0, 0], [0.08, 0.7, 0.9]);
  const eyes = new PartBuilder(0);
  // Bulgy eyes sitting on top of the head.
  for (const s of [-1, 1]) eyes.sphere(0.12, s * 0.2, -0.02, 0.22, "#3f9fe8", [1, 0.9, 1], 10);
  eyePair(eyes, 0.2, 0.02, 0.29, 0.085);
  return {
    body: body.build(),
    eyes: eyes.build(),
    eyeY: 0.74,
    parts: [
      { name: "legFL", geo: leg(), pivot: [-0.36, 0.16, 0.26] },
      { name: "legFR", geo: leg(), pivot: [0.36, 0.16, 0.26] },
      { name: "legBL", geo: leg(), pivot: [-0.34, 0.16, -0.28] },
      { name: "legBR", geo: leg(), pivot: [0.34, 0.16, -0.28] },
      { name: "gillsL", geo: gills(-1), pivot: [-0.48, 0.6, 0.12] },
      { name: "gillsR", geo: gills(1), pivot: [0.48, 0.6, 0.12] },
      { name: "tail", geo: tail.build(), pivot: [0, 0.38, -0.44] }
    ],
    shadow: 1.25,
    top: 1.2
  };
}
