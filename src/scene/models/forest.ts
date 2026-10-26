import * as THREE from "three";
import { PartBuilder } from "../partBuilder";
import { between, rockGeometry } from "./nature";
import { makeRng } from "../../game/logic/rng";
import { ROPE_STAKE } from "../../game/world/island";
import type { RopePoint } from "../../game/world/rope";

/**
 * Phase 2 forest pieces. Same rules as the beach: merged vertex-coloured
 * primitives, one geometry per piece, y = 0 at the ground.
 */

/** A tall broadleaf forest tree (instanced): a darker, rounder crown than the jungle wall. */
export function forestTreeGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0.9);
  // The trunk runs up into the main crown and each branch ends inside its own
  // cluster, so no foliage floats (crown bottoms sit ~0.35 h below their centres).
  b.cyl(0.2, 0.4, 4.6, 0, -0.2, 0, "#6e4a2c", 8);
  // Roots.
  for (let i = 0; i < 4; i++) {
    const a = i * 1.57 + 0.4;
    between(b, [0, 0.35, 0], [Math.cos(a) * 0.75, -0.05, Math.sin(a) * 0.75], 0.14, 0.06, "#6a4628", 5);
  }
  between(b, [0, 2.4, 0], [1.05, 3.75, 0.42], 0.13, 0.08, "#6e4a2c", 6);
  between(b, [0, 2.7, 0], [-0.95, 3.95, -0.45], 0.12, 0.07, "#6e4a2c", 6);
  const crown = (r: number, x: number, y: number, z: number, c: string, seed: number) => b.add(rockGeometry(r, r * 0.8, seed, 1), c, [x, y, z]);
  crown(1.9, 0, 4.4, 0, "#2f7a3a", 81);
  crown(1.35, 1.2, 3.9, 0.5, "#3c8c40", 82);
  crown(1.3, -1.1, 4.1, -0.5, "#296c34", 83);
  crown(1.15, 0.2, 5.5, -0.2, "#469a48", 84);
  return b.build();
}

/** Ferns and flowers on the forest floor (instanced). */
export function fernGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0.4);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const cone = new THREE.ConeGeometry(0.12, 0.9, 4, 1);
    cone.scale(1, 1, 0.25);
    b.add(cone, i % 2 ? "#4f9a3e" : "#3f8a36", [Math.cos(a) * 0.3, 0.3, Math.sin(a) * 0.3], [Math.sin(a) * 0.9, -a, -Math.cos(a) * 0.9]);
  }
  return b.build();
}

/** Puff's tree: the biggest tree on the hills, with a wide perching branch facing the glade. */
export function puffTreeGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(1.2);
  // Tall enough to reach into the main crown (its bottom is ~5.1 m up).
  b.cyl(0.36, 0.62, 5.7, 0, -0.2, 0, "#7a5232", 9);
  for (let i = 0; i < 5; i++) {
    const a = i * 1.25 + 0.2;
    between(b, [0, 0.5, 0], [Math.cos(a) * 1.1, -0.05, Math.sin(a) * 1.1], 0.2, 0.08, "#704a2c", 5);
  }
  // The perch: a branch reaching south toward the glade, with a nest of twigs.
  between(b, [0, 2.3, 0.2], [0.4, 2.5, 1.5], 0.16, 0.11, "#7a5232", 7);
  b.add(new THREE.TorusGeometry(0.32, 0.09, 5, 10), "#9a7448", [0.36, 2.58, 1.42], [Math.PI / 2, 0, 0]);
  b.sphere(0.27, 0.36, 2.55, 1.42, "#7f5f3a", [1, 0.35, 1], 8);
  between(b, [0, 3.6, 0], [-1.3, 4.6, -0.2], 0.16, 0.1, "#7a5232", 7);
  between(b, [0, 3.9, 0], [1.2, 4.9, -0.6], 0.15, 0.09, "#7a5232", 7);
  const crown = (r: number, x: number, y: number, z: number, c: string, seed: number) => b.add(rockGeometry(r, r * 0.78, seed, 1), c, [x, y, z]);
  crown(2.4, 0, 5.7, -0.5, "#3a8a3e", 91);
  crown(1.7, -1.6, 5, 0, "#2f7a38", 92);
  crown(1.6, 1.6, 5.2, -0.3, "#459846", 93);
  crown(1.4, 0.2, 7, -0.6, "#52a44c", 94);
  // Purple blossoms (Puff's colour) hint whose tree it is.
  const rand = makeRng(17);
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2;
    const r = 1.6 + rand() * 1.1;
    b.sphere(0.13, Math.cos(a) * r, 4.6 + rand() * 2.4, Math.sin(a) * r - 0.4, i % 3 ? "#c48bff" : "#f0d6ff", [1, 0.7, 1], 6);
  }
  return b.build();
}

/** Bridge posts and the planks that survived at both ends (local z: 0 = south lip, -len = north lip). */
export function bridgeFrameGeometry(len: number, half: number, gap: [number, number]): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  for (const z of [0.2, -len - 0.2]) {
    for (const s of [-1, 1]) {
      b.cyl(0.11, 0.13, 1.5, s * (half + 0.05), -0.5, z, "#6e4a2c", 6);
      b.sphere(0.13, s * (half + 0.05), 1.0, z, "#5e3e24", [1, 0.6, 1], 6);
    }
  }
  // Planks from each lip up to the gap.
  const plank = (z: number, broken: boolean) =>
    b.boxAt(half * 2 - 0.05, 0.08, 0.32, [broken ? 0.12 : 0, 0, z], [broken ? 0.18 : 0, broken ? 0.12 : 0, broken ? -0.1 : 0], "#a07040");
  for (let z = -0.1; z > gap[0]; z -= 0.38) plank(z, z - 0.38 <= gap[0]);
  for (let z = -len + 0.1; z < gap[1]; z += 0.38) plank(z, z + 0.38 >= gap[1]);
  // Snapped rope rails hanging down into the ravine.
  for (const s of [-1, 1]) {
    between(b, [s * (half + 0.05), 0.95, 0.2], [s * (half + 0.05), 0.7, gap[0] + 0.3], 0.025, 0.025, "#d8c9a0", 4);
    between(b, [s * (half + 0.05), 0.7, gap[0] + 0.3], [s * (half + 0.1), -0.6, gap[0] + 0.1], 0.022, 0.022, "#d8c9a0", 4);
    between(b, [s * (half + 0.05), 0.95, -len - 0.2], [s * (half + 0.05), 0.7, gap[1] - 0.3], 0.025, 0.025, "#d8c9a0", 4);
    between(b, [s * (half + 0.05), 0.7, gap[1] - 0.3], [s * (half + 0.1), -0.7, gap[1] - 0.1], 0.022, 0.022, "#d8c9a0", 4);
  }
  return b.build();
}

/** Leafy's repair: woven vine planks and living rails across the whole span (scaled in from the middle). */
export function bridgeVinesGeometry(len: number, half: number): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  for (let z = -0.25; z > -len; z -= 0.34) {
    b.boxAt(half * 2 - 0.1, 0.07, 0.26, [0, 0.02, z], [0, 0, 0], "#4fae3e");
    b.add(new THREE.SphereGeometry(0.09, 6, 4), "#7fd85a", [((z * 7) % 1) * half * 0.8, 0.07, z], [0, 0, 0], [1.6, 0.4, 0.9]);
  }
  for (const s of [-1, 1]) {
    const pts: Array<[number, number, number]> = [];
    for (let i = 0; i <= 10; i++) pts.push([s * (half + 0.05), 0.92 - Math.sin((i / 10) * Math.PI) * 0.18, 0.2 - (i / 10) * (len + 0.4)]);
    for (let i = 1; i < pts.length; i++) between(b, pts[i - 1], pts[i], 0.045, 0.045, "#3a9a36", 5);
    for (let i = 1; i < pts.length; i++) b.add(new THREE.SphereGeometry(0.1, 6, 4), "#6fd24f", [pts[i][0], pts[i][1] + 0.04, pts[i][2]], [0, 0, 0], [0.8, 0.4, 1.4]);
    // Vines twisting down from the rail to the deck.
    for (let i = 1; i < 10; i += 2) between(b, pts[i], [pts[i][0] * 0.95, 0.05, pts[i][2]], 0.025, 0.02, "#3a9a36", 4);
  }
  return b.build();
}

/** Rock faces lining a long east-west wall (the cliff, the ravine sides). Local origin at the west end. */
export function rockWallGeometry(len: number, height: number, depth: number, seed: number, colors: string[]): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  const rand = makeRng(seed);
  for (let x = 0; x < len; x += 1.3 + rand() * 0.9) {
    const r = 1.1 + rand() * 0.8;
    b.add(rockGeometry(r, height * (0.45 + rand() * 0.2), seed + Math.round(x * 10), 1), colors[Math.floor(rand() * colors.length)], [x, height * 0.15, (rand() - 0.5) * depth], [0, rand() * 6, 0], [1, 1, 0.8]);
  }
  return b.build();
}

/** The rope coiled at the foot of the cliff (before Puff flies it up). */
export function ropeCoilGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  for (let i = 0; i < 4; i++) b.torus(0.32 - i * 0.03, 0.045, [0, 0.05 + i * 0.08, 0], [Math.PI / 2, 0, i * 0.4], "#d8c9a0");
  between(b, [0.3, 0.1, 0], [0.7, 0.03, 0.4], 0.04, 0.04, "#d8c9a0", 5);
  return b.build();
}

/** The stake on the cliff top (y = 0 at the surface): its lower part is driven in. */
export function ropeStakeGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  b.cyl(0.07, ROPE_STAKE.r, 0.9, 0, -0.35, 0, "#6e4a2c", 6);
  b.cone(0.07, 0.06, 0, 0.55, 0, "#5c3d24", 6);
  return b.build();
}

/**
 * The tied rope along `line` (x = 0, world y/z, knot first). Vertices run from
 * the stake downward, so a draw range unrolls it from the top: the lashing
 * comes first (`tieVerts`), then `segments` equal tube segments.
 * Knots are a separate geometry, also top-down, with their arc positions.
 */
export function ropeLineGeometry(line: RopePoint[], stakeTop: [number, number, number]) {
  const curve = new THREE.CatmullRomCurve3(line.map((p) => new THREE.Vector3(0, p.y, p.z)), false, "centripetal");
  const len = curve.getLength();
  const segments = Math.ceil(len / 0.12);
  const rope = new PartBuilder(0);
  // Two turns lashed round the stake at the knot height.
  for (const dy of [-0.04, 0.04]) rope.torus(ROPE_STAKE.r + 0.025, 0.035, [stakeTop[0], stakeTop[1] + dy, stakeTop[2]], [Math.PI / 2, 0, 0], "#d8c9a0");
  const tieVerts = rope.vertexCount;
  rope.add(new THREE.TubeGeometry(curve, segments, 0.045, 6, false), "#d8c9a0", [0, 0, 0]);
  const knots = new PartBuilder(0);
  const knotAt: number[] = [];
  // Knots for hands start below the lip and stop short of the loose end.
  const lipS = arcAtLip(curve, line, len);
  for (let s = lipS + 0.45; s < len - 0.5; s += 0.55) {
    const p = curve.getPointAt(s / len);
    knots.add(new THREE.SphereGeometry(0.075, 6, 6), "#c9b78a", [p.x, p.y, p.z], [0, 0, 0], [1, 0.7, 1]);
    knotAt.push(s / len);
  }
  // The drawn curve, densely sampled for the climb (which must follow the rope
  // the player sees, not the straight lines between the hung points).
  const drawn = curve.getSpacedPoints(Math.max(60, segments * 2)).map((p) => ({ y: p.y, z: p.z }));
  return { rope: rope.build(), tieVerts, segments, knots: knots.build(), knotAt, drawn };
}

/** Arc fraction where the rope leaves the cliff top (the highest point of the taut part). */
function arcAtLip(curve: THREE.CatmullRomCurve3, line: RopePoint[], len: number): number {
  let lip = 0;
  for (let i = 1; i < line.length && line[i].y >= line[i - 1].y - 0.05; i++) lip = i;
  const target = new THREE.Vector3(0, line[lip].y, line[lip].z);
  let best = 0;
  let bestD = Infinity;
  for (let k = 0; k <= 200; k++) {
    const d = curve.getPointAt(k / 200).distanceToSquared(target);
    if (d < bestD) {
      bestD = d;
      best = k / 200;
    }
  }
  return best * len;
}

/** Thorny bramble closing the forest path until the beach is done. */
export function brambleGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0.4);
  const rand = makeRng(23);
  for (let i = 0; i < 16; i++) {
    const x = -2 + (i % 8) * 0.55 + rand() * 0.2;
    const y = 0.4 + Math.floor(i / 8) * 1.1 + rand() * 0.3;
    b.add(rockGeometry(0.55, 0.42, 120 + i, 0), i % 3 ? "#3d7f35" : "#2f6c30", [x, y, rand() * 0.3]);
  }
  for (let i = 0; i < 9; i++) {
    const x = -2 + i * 0.5;
    between(b, [x, 0, 0], [x + Math.sin(i * 2.1) * 0.5, 2.4 + rand() * 0.8, Math.cos(i) * 0.3], 0.06, 0.04, "#6a3f2a", 5);
  }
  // Thorns.
  for (let i = 0; i < 30; i++) {
    b.add(new THREE.ConeGeometry(0.035, 0.16, 4), "#e8d6b0", [-2.1 + rand() * 4.4, 0.3 + rand() * 2.3, 0.3 + rand() * 0.15], [Math.PI / 2, 0, rand() * 6]);
  }
  return b.build();
}

/** The rockfall that closes the way on from the cliff top (Phase 3). */
export function rockfallGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0.6);
  const rand = makeRng(31);
  for (let i = 0; i < 9; i++) {
    const r = 0.9 + rand() * 1.1;
    b.add(rockGeometry(r, r * 0.9, 200 + i, 1), i % 2 ? "#8a7f72" : "#7a7066", [(i - 4) * 1.3 + rand() * 0.4, r * 0.4 + (i % 3) * 0.5, rand() * 1.2]);
  }
  return b.build();
}
