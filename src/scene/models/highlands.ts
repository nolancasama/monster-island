import * as THREE from "three";
import { PartBuilder } from "../partBuilder";
import { rockGeometry } from "./nature";
import { SEA_Y, TUNNEL, VOLCANO, forestMask, groundY, massifY, tunnelCoverY, volcanoFloor, volcanoMask } from "../../game/world/island";

/**
 * The island north of the cliff and east of the beach terrain, as one merged
 * low-poly mesh (2 m cells): the jungle plateau, the volcano with its crater,
 * the rock ridge over the tunnel, the sanctuary's shelf and the slopes down
 * to the sea. Heights come from groundY (so the walkable floors and the
 * terrain meet), sunk a little under walkable land, which its own finer
 * floor draws. No collision: walking is decided by the island's boxes.
 */

const STEP = 2;
/** The main terrain covers x -75..75 down to z -58; this mesh covers the rest. */
export const MASSIF_REGIONS = [
  { x0: -75, x1: 137, z0: -186, z1: -58 },
  { x0: 75, x1: 137, z0: -58, z1: 16 }
];

const TUNNEL_FLOOR = volcanoFloor(TUNNEL.x, TUNNEL.z1);

/** Over the tunnel the surface is the rock ridge above its roof (the floor below is the tunnel's). */
const inCover = (x: number, z: number) => tunnelCoverY(x, z) !== null;

/** Cells that would slant across the tunnel's two portals; the portal walls close those faces instead. */
function portalCell(x: number, z: number) {
  return x >= TUNNEL.x - 7.01 && x < TUNNEL.x + 7 && (Math.abs(z - (TUNNEL.z1 - 0)) < 0.01 || Math.abs(z - (TUNNEL.z0 - 1)) < 0.01);
}

function surface(x: number, z: number): number {
  if (inCover(x, z)) return massifY(x, z);
  const m = Math.max(volcanoMask(x, z), forestMask(x, z));
  return groundY(x, z) - 0.3 * m;
}

const hash = (x: number, z: number) => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

const ROCK = new THREE.Color("#7f7064");
const DARK = new THREE.Color("#5b524e");
const GRASS = new THREE.Color("#5c9a4b");
const JUNGLE = new THREE.Color("#4a8642");
const SAND = new THREE.Color("#c9b386");
const SEABED = new THREE.Color("#8d8268");

/** The massif in square tiles, so the camera only draws the tiles in view. */
export function massifTiles(size = 64): THREE.BufferGeometry[] {
  const all = massifGeometry();
  const pos = all.attributes.position as THREE.BufferAttribute;
  const colAttr = all.attributes.color as THREE.BufferAttribute;
  const buckets = new Map<string, { p: number[]; c: number[] }>();
  for (let t = 0; t < pos.count; t += 3) {
    const cx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3;
    const cz = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;
    const key = `${Math.floor(cx / size)},${Math.floor(cz / size)}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { p: [], c: [] }));
    for (let k = t; k < t + 3; k++) {
      b.p.push(pos.getX(k), pos.getY(k), pos.getZ(k));
      b.c.push(colAttr.getX(k), colAttr.getY(k), colAttr.getZ(k));
    }
  }
  all.dispose();
  return [...buckets.values()].map(({ p, c }) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  });
}

export function massifGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const col = new THREE.Color();
  for (const r of MASSIF_REGIONS) {
    // Vertices (with a deterministic sideways jitter away from the seams).
    const nx = Math.round((r.x1 - r.x0) / STEP);
    const nz = Math.round((r.z1 - r.z0) / STEP);
    const vx: number[] = [];
    const vy: number[] = [];
    const vz: number[] = [];
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        let x = r.x0 + i * STEP;
        let z = r.z0 + j * STEP;
        const seam = i === 0 || j === 0 || i === nx || j === nz;
        if (!seam && !inCover(x, z) && !inCover(x + 2, z) && !inCover(x - 2, z) && !inCover(x, z + 2) && !inCover(x, z - 2) && volcanoMask(x, z) < 0.5 && forestMask(x, z) < 0.5) {
          x += (hash(x, z) - 0.5) * 0.9;
          z += (hash(z, x) - 0.5) * 0.9;
        }
        vx.push(x);
        vz.push(z);
        vy.push(surface(x, z));
      }
    }
    const at = (i: number, j: number, v: THREE.Vector3) => v.set(vx[j * (nx + 1) + i], vy[j * (nx + 1) + i], vz[j * (nx + 1) + i]);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = r.x0 + i * STEP;
        const z = r.z0 + j * STEP;
        if (portalCell(x, z)) continue;
        const ids = [j * (nx + 1) + i, j * (nx + 1) + i + 1, (j + 1) * (nx + 1) + i, (j + 1) * (nx + 1) + i + 1];
        const ys = ids.map((k) => vy[k]);
        // Under the sea, or hidden under walkable land drawn by its own floor.
        if (Math.max(...ys) < SEA_Y - 0.9) continue;
        const hidden = [[x, z], [x + STEP, z], [x, z + STEP], [x + STEP, z + STEP]].every(([px, pz]) => !inCover(px, pz) && Math.max(volcanoMask(px, pz), forestMask(px, pz)) > 0.999);
        if (hidden) continue;
        for (const tri of [[[0, 0], [0, 1], [1, 0]], [[1, 0], [0, 1], [1, 1]]]) {
          at(i + tri[0][0], j + tri[0][1], a);
          at(i + tri[1][0], j + tri[1][1], b);
          at(i + tri[2][0], j + tri[2][1], c);
          n.subVectors(b, a).cross(c.clone().sub(a)).normalize();
          const y = (a.y + b.y + c.y) / 3;
          const mx = (a.x + b.x + c.x) / 3;
          const mz = (a.z + b.z + c.z) / 3;
          const steep = 1 - THREE.MathUtils.smoothstep(n.y, 0.55, 0.8);
          const nearVolcano = 1 - THREE.MathUtils.smoothstep(Math.hypot(mx - VOLCANO.x, mz - VOLCANO.z), 14, 26);
          col.copy(hash(mx, mz) > 0.5 ? GRASS : JUNGLE);
          col.lerp(DARK, nearVolcano * 0.85);
          col.lerp(ROCK, steep);
          if (y < SEA_Y + 0.9) col.lerp(SAND, (1 - steep) * 0.8);
          if (y < SEA_Y - 0.3) col.lerp(SEABED, 0.7);
          col.multiplyScalar(0.94 + hash(mz, mx) * 0.1);
          for (const v of [a, b, c]) {
            positions.push(v.x, v.y, v.z);
            colors.push(col.r, col.g, col.b);
          }
        }
      }
    }
  }
  // The tunnel's two portals: rock walls with the passage's opening, closing
  // the ridge's front and back faces above and beside the arches.
  for (const [z, face] of [[TUNNEL.z1 + 0.05, 1], [TUNNEL.z0 + 0.45, -1]] as const) {
    const rowZ = face > 0 ? TUNNEL.z1 : TUNNEL.z0 + 1;
    for (let x = TUNNEL.x - 7; x < TUNNEL.x + 7; x += STEP) {
      const top0 = surface(x, rowZ);
      const top1 = surface(x + STEP, rowZ);
      const opening = x >= TUNNEL.x - TUNNEL.half - 0.01 && x + STEP <= TUNNEL.x + TUNNEL.half + 0.01;
      // The opening follows the arch: full height in the middle, lower at the
      // sides where the arch stones curve down, so no square corner shows.
      const centre = Math.abs(x + STEP / 2 - TUNNEL.x) < 1.5;
      const bottom = opening ? TUNNEL_FLOOR + (centre ? TUNNEL.roof + 0.1 : 3.3) : TUNNEL_FLOOR - 0.6;
      const quad = [
        [x, bottom], [x + STEP, bottom], [x, top0],
        [x + STEP, bottom], [x + STEP, top1], [x, top0]
      ];
      col.copy(ROCK).multiplyScalar(0.85 + hash(x, z) * 0.1);
      for (const side of [1, -1]) {
        const tris = side === face ? quad : [quad[0], quad[2], quad[1], quad[3], quad[5], quad[4]];
        for (const [px, py] of tris) {
          positions.push(px, py, z);
          colors.push(col.r, col.g, col.b);
        }
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

/** Sea stacks and boulders along the north and east coasts (one draw). */
export function seaStacksGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  const stacks: Array<[number, number, number, number]> = [
    [126, -96, 4, 9], [121, -132, 5, 7], [104, -160, 4.5, 8], [72, -168, 5, 10], [44, -158, 3.5, 6],
    [24, -132, 4, 7], [-10, -112, 5, 8], [96, -40, 3.5, 6], [92, -66, 3, 5]
  ];
  stacks.forEach(([x, z, r, h], i) => b.add(rockGeometry(r, h, 700 + i, 1), i % 2 ? "#7a6c61" : "#6c6058", [x, SEA_Y - 2.5, z]));
  return b.build();
}
