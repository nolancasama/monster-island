import * as THREE from "three";
import { PartBuilder } from "../partBuilder";
import { between, rockGeometry } from "./nature";
import { makeRng } from "../../game/logic/rng";
import { CAVE, GATE_PILLARS, LAVA, MEAT_RACK, SANCTUARY, SANCTUARY_GATE, groundY, volcanoMask } from "../../game/world/island";

/** One terrain draw for the new region, with the same height function as collision. */
export function volcanoGroundGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const rock = new THREE.Color("#8d7462");
  const ash = new THREE.Color("#625c5a");
  const grass = new THREE.Color("#8ac665");
  const c = new THREE.Color();
  for (let z = -153; z < -48; z++) {
    for (let x = 27; x < 87; x++) {
      // The garden ends at its rock rim. Drawing its faded mask fringe
      // would reconnect it to the much taller, unwalkable jungle slope.
      if (z < -121 && (x < SANCTUARY.x0 || x >= SANCTUARY.x1 || z < SANCTUARY.z0)) continue;
      if (volcanoMask(x + 0.5, z + 0.5) < 0.03) continue;
      for (const [dx, dz] of [[0, 0], [0, 1], [1, 0], [1, 0], [0, 1], [1, 1]]) {
        const px = x + dx;
        const pz = z + dz;
        positions.push(px, groundY(px, pz) + 0.045, pz);
        c.copy(rock).lerp(ash, Math.max(0, Math.min(1, (-pz - 75) / 24)));
        if (pz < -121) c.lerp(grass, Math.min(1, (-pz - 121) / 5));
        c.multiplyScalar(0.96 + Math.sin(px * 4.1 + pz * 1.7) * 0.035);
        colors.push(c.r, c.g, c.b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export function lavaBedGeometry(cooled: boolean): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  // Flat dark crust under a network of glowing streams.
  b.box(LAVA.x1 - LAVA.x0 + 0.4, 0.12, 2, 0, -0.04, 0, cooled ? "#48484b" : "#ff961b");
  for (let i = 0; i < 18; i++) {
    const x = -5 + i * 0.6;
    const z = Math.sin(i * 1.7) * 0.35;
    b.add(rockGeometry(0.48, 0.12, 400 + i, 0), cooled ? "#66646a" : "#542820", [x, 0.08, z]);
    if (!cooled) {
      b.boxAt(0.13, 0.025, 1.8, [x + 0.25, 0.16, z], [0, Math.sin(i) * 0.5, 0], "#fff3a0");
      b.boxAt(0.55, 0.025, 0.09, [x, 0.17, z + 0.38], [0, -0.5, 0], "#ffe76a");
    }
  }
  return b.build();
}

export function volcanoRocksGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  const rand = makeRng(395);
  const rock = (x: number, z: number, r: number, h: number, seed: number) => b.add(rockGeometry(r, h, seed, 1), seed % 2 ? "#77665e" : "#675b57", [x, groundY(x, z) - 0.3, z]);
  // Trail edges guide the winding route without making another interaction.
  const points = [[31, -56], [39.8, -58], [36, -67], [46.4, -68], [43, -78], [54.4, -77], [49, -88], [67.5, -91]];
  points.forEach(([x, z], i) => rock(x, z, 1.2 + rand() * 0.8, 1 + rand(), 420 + i));
  // Ember's warm resting rocks, leaving the meat and approach clear.
  for (let i = 0; i < 5; i++) rock(59 + Math.cos(i * 0.8) * 3, -94 + Math.sin(i * 0.8) * 2, 0.8 + rand(), 0.6 + rand(), 440 + i);
  // Rough outer flank around the solid tunnel shell below.
  for (let i = 0; i < 10; i++) {
    rock(59.2, -103 - i * 2.2, 1.4, 3.1 + rand(), 460 + i);
    const eastHeight = 3.2 + rand();
    if (i < 8) rock(68.8, -103 - i * 2.2, 1.4, eastHeight, 480 + i);
  }
  // A broad rock cap joins the arch to the volcano flank and hides the garden
  // above the mouth. Unlike decorative rocks this roof never fades for the lens.
  const caveY = groundY(CAVE.x, CAVE.z);
  b.box(32, 5, 24, CAVE.x, caveY + 4.4, -113.5, "#665750");
  b.box(12, 4.4, 24, CAVE.x - 10, caveY, -113.5, "#665750");
  b.box(12, 4.4, 20.5, CAVE.x + 10, caveY, -111.75, "#665750");
  // The mouth is a broad stone arch, so its black centre reads from the slope.
  for (let i = 0; i <= 7; i++) {
    const a = (i / 7) * Math.PI;
    const x = CAVE.x + Math.cos(a) * 3.4;
    const y = groundY(CAVE.x, CAVE.z) + Math.sin(a) * 4.2;
    b.add(rockGeometry(1.1, 1.05, 500 + i, 1), i % 2 ? "#665958" : "#82716a", [x, y, CAVE.z - 0.3]);
  }
  // Raised crater rim around the gentle garden, with a south passage.
  for (let i = 0; i < 25; i++) {
    const a = (i / 25) * Math.PI * 2;
    const x = 70 + Math.cos(a) * 12;
    const z = -136 + Math.sin(a) * 12.5;
    // The gate wall closes the south rim. Keep its approach courtyard and
    // the outer pillar symbols clear of the crater's decorative boulders.
    if (z > SANCTUARY_GATE.z - 0.5) continue;
    rock(x, z, 2.1 + rand(), 2.6 + rand() * 1.2, 540 + i);
  }
  return b.build();
}

/** Continuous opaque lining; turn east at the closed back to reach the garden. */
export function caveInteriorGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0.25);
  const y = groundY(CAVE.x, CAVE.z);
  b.box(1, 4.5, 24, 60.5, y, -113.5, "#716056");
  b.box(1, 4.5, 20.5, 67.5, y, -111.75, "#716056");
  b.box(7, 0.15, 24, 64, y + 0.08, -113.5, "#655345");
  b.box(7, 0.2, 24, 64, y + 4.2, -113.5, "#776052");
  b.box(7, 4.5, 0.8, 64, y, -125, "#6b5749");
  return b.build();
}

export function meatRackGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0.4);
  for (const x of [-0.8, 0.8]) {
    b.cyl(0.08, 0.12, 1.7, x, 0, 0, "#67452e", 6);
    between(b, [x, 1.1, 0], [x, 0, 0.6], 0.06, 0.08, "#67452e", 5);
  }
  between(b, [-1, 1.65, 0], [1, 1.65, 0], 0.09, 0.09, "#986644", 6);
  for (const x of [-0.45, 0.35]) {
    b.cyl(0.015, 0.015, 0.4, x, 1.2, 0, "#d2bc8a", 4);
    b.sphere(0.24, x, 1.03, 0.06, "#c95d42", [0.8, 1.3, 0.55], 8);
    b.sphere(0.09, x, 0.73, 0.06, "#f3dfb8", [1.5, 0.7, 0.7], 6);
  }
  return b.build();
}

export function caveTorchGeometry(lit: boolean): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  for (let i = 0; i < 5; i++) {
    for (const s of [-1, 1]) {
      const x = CAVE.x + s * 2.6;
      const z = CAVE.z - i * 4.8;
      const y = groundY(x, z);
      if (lit) {
        b.cone(0.18, 0.55, x, y + 1.9, z, "#ffba4d", 6);
        b.cone(0.09, 0.35, x, y + 1.9, z + 0.02, "#fff0a4", 5);
      } else b.cyl(0.1, 0.07, 0.7, x, y + 1.2, z, "#64442e", 5);
    }
  }
  return b.build();
}

export type PillarId = keyof typeof GATE_PILLARS;
export function pillarGeometry(id: PillarId): THREE.BufferGeometry {
  const b = new PartBuilder(0.3);
  b.cyl(0.95, 1.1, 0.25, 0, 0, 0, "#a3a18a", 8);
  b.cyl(0.58, 0.72, 2.8, 0, 0.25, 0, "#bbb59a", 7);
  b.cyl(0.88, 0.65, 0.28, 0, 2.95, 0, "#d5cfb4", 8);
  b.box(1.1, 1.05, 0.18, 0, 1.5, 0.59, "#766f61");
  const y = 2.0;
  if (id === "gateLeaf") {
    b.sphere(0.34, 0, y, 0.75, "#80c957", [0.65, 1, 0.22], 8);
    between(b, [-0.15, y - 0.3, 0.82], [0.13, y + 0.25, 0.82], 0.025, 0.025, "#d9f0b1", 4);
    b.cyl(0.5, 0.65, 0.25, 0, 3.2, 0, "#8f9363", 8);
  } else if (id === "gateDrop") {
    b.sphere(0.24, 0, y - 0.09, 0.76, "#7bd4f0", [1, 1, 0.3], 8);
    b.add(new THREE.ConeGeometry(0.23, 0.38, 7), "#7bd4f0", [0, y + 0.17, 0.76], [0, 0, 0], [1, 1, 0.35]);
    b.add(new THREE.TorusGeometry(0.55, 0.14, 5, 12), "#d7d0ad", [0, 3.3, 0], [Math.PI / 2, 0, 0]);
  } else if (id === "gateWing") {
    for (const s of [-1, 1]) b.sphere(0.28, s * 0.2, y, 0.76, "#d4b2f3", [0.8, 0.58, 0.3], 8);
    for (const s of [-1, 1]) b.cyl(0.05, 0.05, 1.1, s * 0.52, 3.2, 0, "#9c8657", 6);
    b.box(1.2, 0.12, 0.25, 0, 4.2, 0, "#9c8657");
    b.cyl(0.18, 0.38, 0.45, 0, 3.63, 0, "#dfbc5e", 10);
    b.sphere(0.08, 0, 3.6, 0, "#6b5636", [1, 1, 1], 6);
  } else {
    b.add(new THREE.ConeGeometry(0.3, 0.65, 7), "#ffb05a", [0, y, 0.77], [0, 0, 0], [1, 1, 0.25]);
    b.cyl(0.65, 0.3, 0.4, 0, 3.2, 0, "#75645a", 8);
  }
  return b.build();
}

export function pillarPowerGeometry(id: PillarId): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  if (id === "gateLeaf") {
    for (let i = 0; i < 16; i++) {
      const a = i * 0.9;
      b.sphere(0.16, Math.cos(a) * 0.7, 0.25 + i * 0.2, Math.sin(a) * 0.7, i % 3 ? "#63b83e" : "#f9a3cd", [1.2, 0.55, 0.8], 6);
    }
  } else if (id === "gateDrop") {
    b.cyl(0.47, 0.47, 0.05, 0, 3.3, 0, "#69d6f5", 12);
  } else if (id === "gateWing") {
    b.torus(0.46, 0.035, [0, 3.89, 0], [Math.PI / 2, 0, 0], "#ffe397");
  } else {
    b.cone(0.35, 1, 0, 3.5, 0, "#ff7934", 7);
    b.cone(0.18, 0.65, 0, 3.5, 0.06, "#ffe885", 6);
  }
  return b.build();
}

export function gateWallGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  const y = groundY(SANCTUARY_GATE.x, SANCTUARY_GATE.z);
  for (const side of [-1, 1]) {
    b.box(10.8, 2.7, 0.9, 70 + side * 8.1, y, SANCTUARY_GATE.z, "#a1aa84");
    b.box(11.2, 0.25, 1.2, 70 + side * 8.1, y + 2.7, SANCTUARY_GATE.z, "#c4c7a2");
    b.cyl(0.72, 0.9, 4.1, 70 + side * 2.6, y, SANCTUARY_GATE.z, "#cac8a9", 8);
  }
  b.box(6.6, 0.6, 1.4, 70, y + 4.0, SANCTUARY_GATE.z, "#d7d6b8");
  return b.build();
}

export function gateDoorGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  for (let x = -1.9; x <= 2; x += 0.55) b.box(0.14, 3.8, 0.18, x, 0, 0, "#b0a36b");
  b.box(4.3, 0.16, 0.22, 0, 1.1, 0, "#c5b780");
  b.box(4.3, 0.16, 0.22, 0, 3.1, 0, "#c5b780");
  return b.build();
}

export function gardenGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  const rand = makeRng(612);
  for (let i = 0; i < 100; i++) {
    const a = rand() * Math.PI * 2;
    const r = 3.8 + rand() * 7;
    const x = 70 + Math.cos(a) * r;
    const z = -140 + Math.sin(a) * r * 0.66;
    const y = groundY(x, z) + 0.08;
    b.cyl(0.02, 0.02, 0.3, x, y, z, "#4b9d45", 4);
    b.sphere(0.11, x, y + 0.35, z, ["#fff0aa", "#f6acdc", "#be9ef1", "#ffffff"][i % 4], [1, 0.5, 1], 6);
  }
  return b.build();
}

export const rackPosition = [MEAT_RACK.x, groundY(MEAT_RACK.x, MEAT_RACK.z), MEAT_RACK.z] as const;
