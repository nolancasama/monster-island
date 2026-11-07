import * as THREE from "three";
import { PartBuilder } from "../partBuilder";
import { makeRng } from "../../game/logic/rng";
import { CAVE_ALCOVE, CAVE_CHAMBER, CAVE_ROUTE, CAVE_STALAGMITES, caveClearance, caveFloorY, caveRouteS, caveWalkable } from "../../game/world/cave";
import { CAVE_MOUTH } from "../../game/world/lowland";
import { groundY } from "../../game/world/island";

/**
 * The cave's meshes. Floor and walls follow the walkable clearance field
 * (marching squares), so what you see is what you can walk on. The camera is
 * fixed at yaw 0 (looking toward -z): walls whose inside faces -z stand on the
 * camera's side and are built as low lips, so they never hide the player; the
 * far and side walls are tall, with rough overhangs and stalactites.
 *
 * Every cave mesh carries `routeS` (route distance) and `torch` (baked torch
 * light, 0 until slice E fills it) for the cave material.
 */

const STEP = .3;
const LIP = .55;
export const CAVE_WALL_H = 3.6;
const ROCK = ["#4a4540", "#56504a", "#3f3b37", "#5d554c"];

function field() {
  const x0 = Math.floor(63 / STEP) * STEP, x1 = 90, z0 = -233, z1 = -185;
  const nx = Math.ceil((x1 - x0) / STEP), nz = Math.ceil((z1 - z0) / STEP);
  const f = new Float32Array((nx + 1) * (nz + 1));
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) f[j * (nx + 1) + i] = caveClearance(x0 + i * STEP, z0 + j * STEP);
  return { x0, z0, nx, nz, f, at: (i: number, j: number) => f[j * (nx + 1) + i] };
}

/** Inward unit normal (up the clearance gradient). */
function inward(x: number, z: number): [number, number] {
  const e = .08, gx = caveClearance(x + e, z) - caveClearance(x - e, z), gz = caveClearance(x, z + e) - caveClearance(x, z - e);
  const l = Math.hypot(gx, gz) || 1;
  return [gx / l, gz / l];
}

/** Contour segments of clearance = 0 (marching squares, linear interpolation). */
export function caveContour(): Array<[[number, number], [number, number]]> {
  const { x0, z0, nx, nz, at } = field();
  const out: Array<[[number, number], [number, number]]> = [];
  const lerp = (a: number, b: number) => a / (a - b);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
    const pts: Array<[number, number]> = [];
    const X = (k: number) => x0 + k * STEP, Z = (k: number) => z0 + k * STEP;
    if ((a > 0) !== (b > 0)) pts.push([X(i + lerp(a, b)), Z(j)]);
    if ((b > 0) !== (c > 0)) pts.push([X(i + 1), Z(j + lerp(b, c))]);
    if ((c > 0) !== (d > 0)) pts.push([X(i + 1 - lerp(c, d)), Z(j + 1)]);
    if ((d > 0) !== (a > 0)) pts.push([X(i), Z(j + 1 - lerp(d, a))]);
    if (pts.length === 2) out.push([pts[0], pts[1]]);
    else if (pts.length === 4) { out.push([pts[0], pts[1]], [pts[2], pts[3]]); }
  }
  return out;
}

/** Sight-line slope of the fixed cave lens (yaw 0, pitch 1.0, dist 8): metres
 * of height per metre toward +z, from a head 1.3 m up to the lens. */
const LENS_SLOPE = (1.1 + 8 * Math.sin(1)) / (8 * Math.cos(1) - 1);
/**
 * Wall height at a contour point. The lens looks toward -z, so a wall can hide
 * anyone standing up to a few metres on its -z side: its height is capped so
 * the sight line from the lens to a head there always clears it. Walls with
 * no floor on that side (far and side walls) stay tall and rough.
 */
export function caveWallHeight(_nz: number, x: number, z: number): number {
  const tall = CAVE_WALL_H + .45 * Math.sin(x * 1.7 + z * .9) + .3 * Math.sin(x * .6 - z * 1.3);
  for (let d = .15; d <= 4.2; d += .15) {
    if ([-.45, 0, .45].some(dx => caveWalkable(x + dx, z - d, .3)))
      return Math.max(LIP, Math.min(tall, 1.3 + LENS_SLOPE * d - .45));
  }
  return tall;
}

/** Tag vertices with route distance and a zero torch term (slice E bakes it). */
function tagged(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = g.getAttribute("position"), s = new Float32Array(p.count), torch = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) s[i] = caveRouteS(p.getX(i), p.getZ(i));
  g.setAttribute("routeS", new THREE.BufferAttribute(s, 1));
  g.setAttribute("torch", new THREE.BufferAttribute(torch, 1));
  return g;
}

export function caveFloorGeometry(): THREE.BufferGeometry {
  const positions: number[] = [], colors: number[] = [];
  const c = new THREE.Color(), damp = new THREE.Color("#2f3a40"), stone = new THREE.Color("#4e4842");
  const cell = .5;
  const push = (x: number, z: number) => {
    positions.push(x, caveFloorY(x, z), z);
    const near = THREE.MathUtils.smoothstep(caveClearance(x, z), .1, .9);
    c.copy(damp).lerp(stone, near).multiplyScalar(.85 + .25 * (Math.sin(x * 3.1) * Math.sin(z * 2.7) * .5 + .5));
    colors.push(c.r, c.g, c.b);
  };
  for (let x = 63; x < 90; x += cell) for (let z = -233; z < -185; z += cell) {
    if (caveClearance(x + cell / 2, z + cell / 2) < -.32) continue;
    const j = 0;
    push(x, z); push(x + cell, z + cell + j); push(x + cell, z);
    push(x, z); push(x, z + cell); push(x + cell, z + cell + j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return tagged(g);
}

/** Smooth 3D value for rock tone and relief, continuous across wall segments. */
const rockNoise = (x: number, y: number, z: number) =>
  .5 + .25 * Math.sin(x * 1.9 + y * .7 + z * 1.3) + .15 * Math.sin(x * .6 - y * 2.3 + z * 2.9) + .1 * Math.sin(x * 4.1 + z * 3.7 + y * 1.1);
const ROCK_DARK = new THREE.Color("#3a3633"), ROCK_LIGHT = new THREE.Color("#6a6158"), ROCK_MOSS = new THREE.Color("#3f4a3a");
function rockColor(x: number, y: number, z: number, scale = 1): THREE.Color {
  const n = rockNoise(x, y, z);
  return ROCK_DARK.clone().lerp(ROCK_LIGHT, n).lerp(ROCK_MOSS, Math.max(0, .35 - y * .1) * (1 - n)).multiplyScalar(scale);
}

export function caveWallGeometry(): THREE.BufferGeometry {
  const positions: number[] = [], colors: number[] = [];
  const tri = (vs: number[][], scale = 1) => {
    for (const v of vs) {
      positions.push(v[0], v[1], v[2]);
      const c = rockColor(v[0], v[1], v[2], scale);
      colors.push(c.r, c.g, c.b);
    }
  };
  const quad = (a: number[], b: number[], c: number[], d: number[], scale = 1) => tri([a, b, c, a, c, d], scale);
  // Relief: rows of the inside face bulge in and out by a continuous noise, so
  // neighbouring segments share their corners and the wall reads as one rock.
  for (const [[ax, az], [bx, bz]] of caveContour()) {
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const [nx, nz] = inward(mx, mz);
    const [anx, anz] = inward(ax, az), [bnx, bnz] = inward(bx, bz);
    const ha = caveWallHeight(anz, ax, az), hb = caveWallHeight(bnz, bx, bz), lip = Math.max(ha, hb) < 1;
    const thick = lip ? .55 : .35;
    const ya = caveFloorY(ax, az), yb = caveFloorY(bx, bz);
    const ox = -nx * thick, oz = -nz * thick;
    const at = (x: number, z: number, y0: number, h: number, inx: number, inz: number, t: number) => {
      const y = y0 - .4 + (h + .4) * t;
      const bulge = (rockNoise(x * 1.3, y * 1.7, z * 1.3) - .5) * (lip ? .12 : .32) * (t > 0 && t < 1 ? 1 : .3);
      return [x + inx * bulge, y, z + inz * bulge];
    };
    const rows = lip ? [0, 1] : [0, .25, .5, .75, 1];
    for (let r = 1; r < rows.length; r++) {
      const a0 = at(ax, az, ya, ha, anx, anz, rows[r - 1]), b0 = at(bx, bz, yb, hb, bnx, bnz, rows[r - 1]);
      const a1 = at(ax, az, ya, ha, anx, anz, rows[r]), b1 = at(bx, bz, yb, hb, bnx, bnz, rows[r]);
      quad(a0, b0, b1, a1);
    }
    // Top cap and the outer face (seen over the camera-side lips).
    quad([ax, ya + ha, az], [bx, yb + hb, bz], [bx + ox, yb + hb, bz + oz], [ax + ox, ya + ha, az + oz], lip ? 1 : .55);
    quad([bx + ox, yb - .4, bz + oz], [ax + ox, ya - .4, az + oz], [ax + ox, ya + ha, az + oz], [bx + ox, yb + hb, bz + oz], .7);
    if (!lip) {
      // A rough overhang jutting into the tunnel, drooping a little at its edge.
      const jutA = .3 + .2 * rockNoise(ax * 2, 0, az * 2), jutB = .3 + .2 * rockNoise(bx * 2, 0, bz * 2), droop = .28;
      const a = [ax + anx * jutA, ya + ha - droop, az + anz * jutA], b = [bx + bnx * jutB, yb + hb - droop, bz + bnz * jutB];
      quad([ax, ya + ha, az], a, b, [bx, yb + hb, bz], .55);
      quad(a, [ax, ya + ha - .55, az], [bx, yb + hb - .55, bz], b, .45);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return tagged(g);
}

/** Stalagmites, stalactites, wall-foot rocks, carvings. */
export function caveDecorGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  const rand = makeRng(17);
  for (const s of CAVE_STALAGMITES) {
    const y = caveFloorY(s.x, s.z);
    b.cone(s.r * 1.15, s.h, s.x, y - .05, s.z, "#6a6157", 7);
    b.cone(s.r * .55, s.h * .55, s.x + s.r * .5, y - .05, s.z + s.r * .3, "#5b534b", 6);
  }
  const contour = caveContour();
  for (let i = 0; i < contour.length; i += 3) {
    const [[ax, az], [bx, bz]] = contour[i];
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, [nx, nz] = inward(mx, mz), y = caveFloorY(mx, mz);
    const h = caveWallHeight(nz, mx, mz);
    const r = rand();
    if (h > 1 && r < .22) {
      // Stalactites under the overhang.
      const len = .35 + rand() * .7, px = mx + nx * .3, pz = mz + nz * .3;
      b.add(new THREE.ConeGeometry(.09 + rand() * .07, len, 5), "#5e564e", [px, y + h - .3 - len / 2, pz], [Math.PI, 0, 0]);
    } else if (r < .38) {
      // Wall-foot rubble (inside the wall's reach: no body can stand there).
      b.sphere(.12 + rand() * .16, mx + nx * .12, y + .05, mz + nz * .12, "#57504a", [1.3, .7, 1], 5);
    } else if (h > 1 && r < .43) {
      // Small stalagmites against the wall.
      b.cone(.1 + rand() * .06, .3 + rand() * .45, mx + nx * .14, y - .03, mz + nz * .14, "#665d54", 5);
    }
  }
  // Ancient carvings: concentric stone rings and a row of monster marks on the chamber's far wall.
  const carve = (x: number, z: number, yaw: number, y0: number) => {
    for (let k = 0; k < 3; k++) b.boxAt(.9 - k * .25, .9 - k * .25, .04, [x, y0 + 1.6, z], [0, yaw, 0], k % 2 ? "#3a3632" : "#6f665c");
    for (let k = 0; k < 4; k++) b.boxAt(.16, .16, .05, [x + Math.cos(yaw) * (k - 1.5) * .35, y0 + 2.5, z - Math.sin(yaw) * (k - 1.5) * .35], [0, yaw, Math.PI / 4], "#7a7064");
  };
  carve(CAVE_CHAMBER.x - 1.2, CAVE_CHAMBER.z - 3.05, 0, caveFloorY(CAVE_CHAMBER.x, CAVE_CHAMBER.z));
  const [rx, rz] = CAVE_ROUTE[5];
  carve(rx + 1.2, rz, -Math.PI / 2, caveFloorY(rx, rz));
  // Rock formations ringing the chamber, and the alcove's stone lip.
  for (let k = 0; k < 7; k++) {
    const a = -1.2 + k * .55, x = CAVE_CHAMBER.x + Math.cos(a) * (CAVE_CHAMBER.r - .1), z = CAVE_CHAMBER.z + Math.sin(a) * (CAVE_CHAMBER.r - .1);
    if (Math.hypot(x - CAVE_ALCOVE.x, z - CAVE_ALCOVE.z) < CAVE_ALCOVE.r + .6) continue;
    b.cone(.22 + rand() * .1, .6 + rand() * .7, x, caveFloorY(x, z) - .05, z, "#6b6258", 6);
  }
  return tagged(b.build());
}

/** Glowing mushrooms and mineral crystals (an unlit, always-visible material). */
export function caveGlowGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  const rand = makeRng(5);
  const mushrooms: Array<[number, number]> = [[78.2, -219.8], [80.1, -205.9], [84.1, -193.4], [74.8, -191.1], [69.1, -196.2], [73.6, -228.6], [79.6, -210.8]];
  for (const [x, z] of mushrooms) {
    const y = caveFloorY(x, z);
    for (let k = 0; k < 3; k++) {
      const dx = (rand() - .5) * .45, dz = (rand() - .5) * .45, h = .12 + rand() * .16;
      b.cyl(.025, .03, h, x + dx, y, z + dz, "#7fd8c2", 5);
      b.sphere(.08 + rand() * .05, x + dx, y + h, z + dz, k % 2 ? "#5ff0d0" : "#8dffb0", [1, .45, 1], 7);
    }
  }
  const crystals: Array<[number, number]> = [[77.6, -224.6], [80.3, -214.3], [85.4, -197.6], [79.4, -191.2], [71.6, -200.1], [67.6, -197]];
  for (const [x, z] of crystals) {
    const y = caveFloorY(x, z);
    for (let k = 0; k < 4; k++)
      b.add(new THREE.OctahedronGeometry(.07 + rand() * .06), k % 2 ? "#9f8cff" : "#7ac8ff", [x + (rand() - .5) * .4, y + .1 + rand() * 1.6, z + (rand() - .5) * .4], [rand(), rand(), rand()], [1, 1.8, 1]);
  }
  return tagged(b.build());
}

/** Outside: the rock arch at the mesa face, with darkness inside (ground layer, flat material). */
export function caveMouthGeometry(): { arch: THREE.BufferGeometry; dark: THREE.BufferGeometry } {
  const b = new PartBuilder(0);
  const fx = 72.5, z = CAVE_MOUTH.z, y = groundY(70.4, z);
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) b.add(new THREE.DodecahedronGeometry(.75 - k * .12), ROCK[k], [fx - .5 - k * .1, y + .5 + k * 1.05, z + side * (1.85 + k * .05)], [k, side, k * .7], [1.2, 1, .9]);
  }
  for (let k = 0; k < 4; k++) b.add(new THREE.DodecahedronGeometry(.6), ROCK[(k + 1) % 4], [fx - .45, y + 3.35 + (k % 2) * .15, z - 1.5 + k], [k, k * .5, 0], [1.1, .7, 1.1]);
  b.add(new THREE.DodecahedronGeometry(.5), "#587d43", [fx - .7, y + 3.85, z + .3], [0, 0, 0], [1.6, .3, 1.2]);
  const dark = new THREE.PlaneGeometry(3.3, 3.3);
  dark.rotateY(-Math.PI / 2);
  dark.translate(fx - .2, y + 1.55, z);
  return { arch: b.build(), dark };
}

/** The cave's own material: ignores scene lights (no sun leaks through rock). */
export function caveMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexColors: true,
    uniforms: {
      uAmbient: { value: .05 },
      uPlayer: { value: new THREE.Vector3() },
      uSil: { value: .2 },
      uLitS: { value: -1e4 },
      uWarm: { value: 0 },
    },
    vertexShader: `
attribute float routeS;
attribute float torch;
varying vec3 vColor;
varying vec3 vWorld;
varying float vS;
varying float vTorch;
void main() {
  vColor = color;
  vS = routeS;
  vTorch = torch;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`,
    fragmentShader: `
uniform float uAmbient;
uniform vec3 uPlayer;
uniform float uSil;
uniform float uLitS;
uniform float uWarm;
varying vec3 vColor;
varying vec3 vWorld;
varying float vS;
varying float vTorch;
void main() {
  float d = distance(vWorld.xz, uPlayer.xz);
  float sil = uSil * (1.0 - smoothstep(0.6, 3.2, d));
  float lit = vTorch * (1.0 - smoothstep(uLitS - 1.5, uLitS + 1.5, vS));
  vec3 light = vec3(uAmbient + sil) + vec3(1.0, 0.72, 0.45) * (lit + uWarm);
  gl_FragColor = vec4(vColor * light, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  });
}
