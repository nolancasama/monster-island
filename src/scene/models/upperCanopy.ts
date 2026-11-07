import * as THREE from "three";
import { PartBuilder } from "../partBuilder";
import { makeRng } from "../../game/logic/rng";
import { SUMMIT_DEPARTURE, SUMMIT_OUTLINE, SUMMIT_STONES, UPPER_BRANCHES, UPPER_LEAVES, UPPER_ROPE, UPPER_ROPE_COLLAR, UPPER_TRUNKS, onSummit, summitY, type UpperLeaf } from "../../game/world/upperCanopy";
import { MESA_CENTER } from "../../game/world/mesa";
import { standY } from "../../game/world/collision";

/**
 * The Upper Canopy's meshes. A leaf's top is a flat disc at its walking height
 * with exactly its walking radius (a slight lip curls up at the rim), so the
 * outline you see is the edge you can fall from. Branches are flattened bark
 * cylinders whose tops are their walking surface.
 */

const LEAF_SEG = 28;

/** Cylinder between two points (for limbs and branches). */
function limb(b: PartBuilder, a: THREE.Vector3, c: THREE.Vector3, r0: number, r1: number, color: string, flatten = 1) {
  const d = c.clone().sub(a), len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, 7, 1);
  g.translate(0, len / 2, 0);
  g.scale(1, 1, flatten);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  b.add(g, color, [a.x, a.y, a.z], [e.x, e.y, e.z]);
}

/** One leaf in world space: top, rim, underside, midrib and veins. */
export function leafGeometry(l: UpperLeaf, colors = { centre: "#78b84c", edge: "#3e8a36", under: "#2f5f2c", rib: "#9fce6a" }): THREE.BufferGeometry {
  const positions: number[] = [], cols: number[] = [];
  const c0 = new THREE.Color(colors.centre), c1 = new THREE.Color(colors.edge), cu = new THREE.Color(colors.under), tmp = new THREE.Color();
  const push = (x: number, y: number, z: number, c: THREE.Color) => { positions.push(x, y, z); cols.push(c.r, c.g, c.b); };
  const rim = (i: number, r: number, dy: number): [number, number, number] => {
    const a = (i / LEAF_SEG) * Math.PI * 2;
    // A gentle scallop, never beyond the walking radius.
    const s = r * (.985 + .015 * Math.cos(a * 7));
    return [l.x + Math.cos(a) * s, l.y + dy, l.z + Math.sin(a) * s];
  };
  for (let i = 0; i < LEAF_SEG; i++) {
    const a = rim(i, l.r * .82, .0), b = rim(i + 1, l.r * .82, .0), a2 = rim(i, l.r, .09), b2 = rim(i + 1, l.r, .09);
    tmp.copy(c0).lerp(c1, .55);
    push(l.x, l.y + .0, l.z, c0); push(b[0], b[1], b[2], tmp); push(a[0], a[1], a[2], tmp);
    push(a[0], a[1], a[2], tmp); push(b[0], b[1], b[2], tmp); push(b2[0], b2[1], b2[2], c1);
    push(a[0], a[1], a[2], tmp); push(b2[0], b2[1], b2[2], c1); push(a2[0], a2[1], a2[2], c1);
    // Underside, a little below, so the leaf has visible thickness from beside it.
    const ua = rim(i, l.r, -.12), ub = rim(i + 1, l.r, -.12);
    push(l.x, l.y - .2, l.z, cu); push(ua[0], ua[1], ua[2], cu); push(ub[0], ub[1], ub[2], cu);
    push(a2[0], a2[1], a2[2], c1); push(b2[0], b2[1], b2[2], c1); push(ub[0], ub[1], ub[2], cu);
    push(a2[0], a2[1], a2[2], c1); push(ub[0], ub[1], ub[2], cu); push(ua[0], ua[1], ua[2], cu);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  // Midrib and veins: thin raised strips.
  const b = new PartBuilder(0);
  const yaw = Math.sin(l.x * 3.1 + l.z) * Math.PI;
  b.boxAt(.11, .035, l.r * 1.9, [l.x, l.y + .025, l.z], [0, yaw, 0], colors.rib);
  for (let k = -2; k <= 2; k++) {
    if (k === 0) continue;
    const off = k * l.r * .3, ox = Math.sin(yaw) * off, oz = Math.cos(yaw) * off;
    b.boxAt(.06, .03, l.r * (1 - Math.abs(k) * .22), [l.x + ox, l.y + .02, l.z + oz], [0, yaw + (k > 0 ? .7 : -.7), 0], colors.rib);
  }
  const veins = b.build();
  return mergeColored([g, veins]);
}

function mergeColored(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [], colors: number[] = [];
  for (const p of parts) {
    const g = p.index ? p.toNonIndexed() : p;
    positions.push(...(g.getAttribute("position").array as Float32Array));
    colors.push(...(g.getAttribute("color").array as Float32Array));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  out.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  out.computeBoundingSphere();
  return out;
}

/** Every stable leaf, every branch walkway, the limbs holding them, the trunks' upper reach. */
export function upperCanopyGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = UPPER_LEAVES.filter(l => !l.unstable).map(l => leafGeometry(l));
  const b = new PartBuilder(0);
  const rand = makeRng(42);
  // Branch walkways: a flattened bark cylinder per segment, its top on the walk.
  for (const br of UPPER_BRANCHES) {
    let len = 0;
    const lengths = [0];
    for (let i = 1; i < br.pts.length; i++) lengths.push(len += Math.hypot(br.pts[i][0] - br.pts[i - 1][0], br.pts[i][1] - br.pts[i - 1][1]));
    const r = br.vine ? br.w * .7 : br.w * .85;
    for (let i = 1; i < br.pts.length; i++) {
      const ya = br.y0 + (br.y1 - br.y0) * lengths[i - 1] / len, yb = br.y0 + (br.y1 - br.y0) * lengths[i] / len;
      const a = new THREE.Vector3(br.pts[i - 1][0], ya - r * .55, br.pts[i - 1][1]), c = new THREE.Vector3(br.pts[i][0], yb - r * .55, br.pts[i][1]);
      // Extend into the leaves so the joints are continuous.
      const d = c.clone().sub(a).normalize().multiplyScalar(.6);
      limb(b, a.clone().sub(d), c.clone().add(d), r, r * .95, br.vine ? "#4f7a3a" : "#6b4a30");
      b.boxAt(br.w * 1.5, .05, Math.hypot(c.x - a.x, c.z - a.z) + .6, [(a.x + c.x) / 2, (ya + yb) / 2 + .01, (a.z + c.z) / 2], [0, Math.atan2(c.x - a.x, c.z - a.z), 0], br.vine ? "#5f9a44" : "#5c7d3c");
    }
    if (br.vine) for (let k = 0; k < 6; k++) {
      // Twisting tendrils around the vine.
      const t = k / 6, i = Math.min(br.pts.length - 2, Math.floor(t * (br.pts.length - 1)));
      const x = br.pts[i][0] + (br.pts[i + 1][0] - br.pts[i][0]) * (t * (br.pts.length - 1) - i), z = br.pts[i][1] + (br.pts[i + 1][1] - br.pts[i][1]) * (t * (br.pts.length - 1) - i);
      b.add(new THREE.TorusGeometry(br.w * .72, .05, 4, 10), "#3f6a2f", [x, br.y0 - .25, z], [Math.PI / 2 + .3 * k, k, 0]);
    }
  }
  // Limbs from each leaf's underside down to the nearest trunk.
  for (const l of UPPER_LEAVES) {
    let best = UPPER_TRUNKS[0], bd = Infinity;
    for (const t of UPPER_TRUNKS) { const d = Math.hypot(t.x - l.x, t.z - l.z); if (d < bd) { bd = d; best = t; } }
    if (!best) continue;
    const under = new THREE.Vector3(l.x, l.y - .2, l.z);
    const towards = new THREE.Vector3(best.x, l.y - 2.5 - Math.min(4, bd * .35), best.z);
    const mid = under.clone().lerp(towards, .5).add(new THREE.Vector3(0, -.6, 0));
    limb(b, mid, under, .24, .16, "#6b4a30");
    limb(b, towards, mid, .32, .24, "#6b4a30");
    if (rand() < .6) b.sphere(.45, mid.x, mid.y, mid.z, "#4f8a3a", [1.5, .6, 1.2], 6);
  }
  // The trunks' upper reach above the existing canopy trunks, with a few side leaves.
  for (const t of UPPER_TRUNKS) {
    const y = standY(t.x, t.z, [], "ground");
    b.cyl(t.r * .7, t.r * .9, 4, t.x, y + 19, t.z, "#6b4a30", 8);
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1 + t.x;
      b.sphere(1.2, t.x + Math.cos(a) * 1.6, y + 23.2 + k * .4, t.z + Math.sin(a) * 1.6, k % 2 ? "#4b8f3c" : "#3d7f35", [1.6, .45, 1.6], 7);
    }
  }
  // The rope's branch collar: a limb from the trunk out over the rope's foot.
  const trunk = UPPER_TRUNKS.reduce((a, t) => Math.hypot(t.x - UPPER_ROPE.x, t.z - UPPER_ROPE.faceZ) < Math.hypot(a.x - UPPER_ROPE.x, a.z - UPPER_ROPE.faceZ) ? t : a);
  limb(b, new THREE.Vector3(trunk.x, UPPER_ROPE_COLLAR.y - .3, trunk.z), new THREE.Vector3(UPPER_ROPE_COLLAR.x, UPPER_ROPE_COLLAR.y, UPPER_ROPE_COLLAR.z), .34, .22, "#6b4a30");
  b.add(new THREE.TorusGeometry(.2, .07, 5, 10), "#c4a46a", [UPPER_ROPE_COLLAR.x, UPPER_ROPE_COLLAR.y - .05, UPPER_ROPE_COLLAR.z], [0, 0, Math.PI / 2]);
  parts.push(b.build());
  return mergeColored(parts);
}

/** The climbing rope from the collar down to a root knot on the lower deck. */
export function upperRopeGeometry(): THREE.BufferGeometry {
  const footY = standY(UPPER_ROPE.foot.x, UPPER_ROPE.foot.z, [], "ground");
  const b = new PartBuilder(0);
  const top = UPPER_ROPE_COLLAR.y - .1, len = top - footY + .1;
  b.cyl(.045, .05, len, UPPER_ROPE.x, footY - .1, UPPER_ROPE.hangZ, "#c4a46a", 6);
  b.sphere(.28, UPPER_ROPE.x, footY + .12, UPPER_ROPE.hangZ, "#5a3b22", [1.3, .6, 1.1], 7);
  for (let k = 0; k < 5; k++) b.cyl(.075, .075, .08, UPPER_ROPE.x, footY + 1.2 + k * 1.6, UPPER_ROPE.hangZ, "#a88a52", 6);
  return b.build();
}

/** Unstable leaf look: yellow-brown, cracked, drooping at the rim. */
export function unstableLeafGeometry(l: UpperLeaf): THREE.BufferGeometry {
  const g = leafGeometry(l, { centre: "#c9a645", edge: "#8d6a2a", under: "#5c4520", rib: "#e0c070" });
  const b = new PartBuilder(0);
  for (let k = 0; k < 3; k++) b.boxAt(.05, .03, l.r * 1.2, [l.x + (k - 1) * .3, l.y + .03, l.z], [0, .9 + k * .9, 0], "#4a3418");
  return mergeColored([g, b.build()]);
}

/** Lambert material with a discard cut-through near the lens for lower-Canopy views. */
export function upperCanopyMaterial(): THREE.MeshLambertMaterial & { userData: { lens: { value: THREE.Vector3 }; cull: { value: number } } } {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }) as THREE.MeshLambertMaterial & { userData: { lens: { value: THREE.Vector3 }; cull: { value: number } } };
  m.userData = { lens: { value: new THREE.Vector3() }, cull: { value: 0 } };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uLens = m.userData.lens;
    shader.uniforms.uCull = m.userData.cull;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vUpperW;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvUpperW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vUpperW;\nuniform vec3 uLens;\nuniform float uCull;")
      .replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\nif (uCull > 0.5 && distance(vUpperW.xz, uLens.xz) < 9.0 && vUpperW.y < uLens.y + 2.0) discard;");
  };
  m.customProgramCacheKey = () => "upper-canopy-cull-v1";
  return m;
}

/** The summit: a stone-and-grass rim showing where the floor ends, windswept
 * tufts, standing stones and the departure stone's blue rune. */
export function summitGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  const rand = makeRng(9);
  const n = SUMMIT_OUTLINE.length;
  for (let i = 0; i < n; i++) {
    const [ax, az] = SUMMIT_OUTLINE[i], [bx, bz] = SUMMIT_OUTLINE[(i + 1) % n];
    const steps = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / .9));
    for (let k = 0; k < steps; k++) {
      const t = (k + .5) / steps, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      // 0.75 m inside the rim, toward the centre: just beyond the walking floor.
      const dx = MESA_CENTER[0] - x, dz = MESA_CENTER[1] - z, l = Math.hypot(dx, dz) || 1;
      const px = x + dx / l * .75, pz = z + dz / l * .75, y = summitY(px, pz);
      if (rand() < .55) b.add(new THREE.DodecahedronGeometry(.22 + rand() * .16), rand() < .5 ? "#8c8577" : "#7a7468", [px, y + .08, pz], [rand(), rand(), rand()], [1.2, .65, 1]);
      else b.cone(.12, .35 + rand() * .2, px, y - .02, pz, "#6f9a45", 4);
    }
  }
  for (let k = 0; k < 70; k++) {
    const x = 70 + rand() * 15, z = -222 + rand() * 25;
    if (!onSummit(x, z, .2)) continue;
    const y = summitY(x, z), lean = .35 + rand() * .2;
    b.boxAt(.05, .32 + rand() * .2, .1, [x, y + .14, z], [0, 2.4, lean], rand() < .5 ? "#7fae4e" : "#9cbf5e");
  }
  for (const s of SUMMIT_STONES) {
    const y = summitY(s.x, s.z);
    b.add(new THREE.CylinderGeometry(s.r * .7, s.r, s.h, 6), "#9a9484", [s.x, y + s.h / 2 - .05, s.z], [0, s.x, .06]);
    b.sphere(s.r * .5, s.x + .1, y + s.h * .7, s.z + .15, "#6d8f4a", [1.2, .5, 1], 5);
  }
  // The departure stone: a low slab facing the drop, ringed with a pale rune.
  const d = SUMMIT_DEPARTURE, dy = summitY(d.x, d.z - 1.2);
  b.cyl(.55, .62, .35, d.x, dy - .1, d.z - 1.2, "#a49c8a", 9);
  b.add(new THREE.TorusGeometry(.42, .04, 4, 18), "#8fd8ff", [d.x, dy + .27, d.z - 1.2], [Math.PI / 2, 0, 0]);
  return b.build();
}
