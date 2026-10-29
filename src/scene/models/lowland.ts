import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { PartBuilder } from "../partBuilder";
import { between, rockGeometry } from "./nature";
import { armGeometry, bodyGeometry, KNEE_Y, shinGeometry, thighGeometry, type Outfit } from "./people";
import { makeRng } from "../../game/logic/rng";
import { SEA_Y, groundY, volcanoMask } from "../../game/world/island";
import {
  detailOwner,
  STAGES,
  STAGE_EXITS,
  type ZoneId,
  BASIN,
  CAMP2,
  CANOPY_GAPS,
  CANOPY_TRAIL,
  CAUSEWAY,
  CHESTS,
  CLIFF_ROPE,
  COAST_TRAIL,
  CRATES,
  FOREST1_TRAIL,
  FORK_SIGN,
  FOUNTAIN,
  GIANT_TREES,
  GROVE_TRAIL,
  HOUSES,
  ISLET,
  LAMPS,
  LILY_PADS,
  LOGS,
  MOSSY_BOULDERS,
  OLD_TRAIL,
  PIER2,
  POND,
  POND_Y,
  PORT,
  RUIN_PILLARS,
  SERVICES,
  SHORTCUT_GATE,
  SHRINE,
  STREAMS,
  ZONE_ORDER,
  ZONES,
  canopyRaise,
  lowlandWalkable,
  nearestOnTrail,
  streamY,
  type EnemyKind,
} from "../../game/world/lowland";
import type { NpcDef } from "../../game/data/town";

/**
 * Act 2's pieces, built like the rest of the island: merged vertex-coloured
 * primitives, instanced vegetation, terrain from the same height function
 * collision uses, and tiles so the camera only draws what is in view.
 */

const STEP = 2;
const hash = (x: number, z: number) => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const sstep = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const MOSS = new THREE.Color("#5f9d48");
const DEEP = new THREE.Color("#3f7a3a");
const DIRT = new THREE.Color("#b38f5c");
const STONE = new THREE.Color("#a7a196");
const COBBLE = new THREE.Color("#c9b99c");
const MUD = new THREE.Color("#6f5a3e");
const BARK = new THREE.Color("#7a5534");
const SAND = new THREE.Color("#d9c08c");
const SEABED = new THREE.Color("#8d8268");
const ROCK = new THREE.Color("#7f7064");

const TRAILS = [FOREST1_TRAIL, GROVE_TRAIL, CANOPY_TRAIL, COAST_TRAIL, OLD_TRAIL];

/** Same surface rule as the massif: sunk a little under the sanctuary's own floor where they overlap. */
function surface(x: number, z: number): number {
  return groundY(x, z) - 0.3 * volcanoMask(x, z);
}

function groundColor(x: number, z: number, y: number, steep: number, c: THREE.Color) {
  c.copy(hash(x, z) > 0.5 ? MOSS : DEEP);
  let trail = Infinity;
  for (const t of TRAILS) trail = Math.min(trail, nearestOnTrail(t, x, z).d);
  c.lerp(DIRT, (1 - sstep(1.2, 2.6, trail)) * 0.8);
  const inRect = (r: { x0: number; x1: number; z0: number; z1: number }, pad: number) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad;
  if (inRect({x0:44,x1:52,z0:-257,z1:-250},0) || inRect(CAUSEWAY, 0) || Math.hypot(x - SHRINE.x, z - SHRINE.z) < SHRINE.r) c.lerp(STONE, 0.9);
  if (inRect(PORT, 0)) c.lerp(COBBLE, 0.92);
  if (Math.hypot(x - CAMP2.fire.x, z - CAMP2.fire.z) < 6) c.lerp(DIRT, 0.45);
  if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 0.6 && Math.hypot(x - ISLET.x, z - ISLET.z) > ISLET.r) c.lerp(MUD, 0.85);
  if (x < 70 && z < -200 && z > -246) for (const s of STREAMS) if (nearestOnTrail(s, x, z).d < 1.6) c.lerp(MUD, 0.6);
  // The raised root walk: bark-brown sides, a mossy top.
  const raise = canopyRaise(x, z);
  if (raise > 0.4 && raise < 4.2) c.lerp(BARK, 0.75);
  c.lerp(ROCK, steep);
  if (y < SEA_Y + 0.9) c.lerp(SAND, (1 - steep) * 0.85);
  if (y < SEA_Y - 0.3) c.lerp(SEABED, 0.7);
  c.multiplyScalar(0.93 + hash(z, x) * 0.12);
}

/** The lowland's ground in square tiles (2 m cells), heights from groundY. */
export function lowlandTerrainTiles(size = 48): THREE.BufferGeometry[] {
  const nx = Math.round((BASIN.x1 - BASIN.x0) / STEP);
  const nz = Math.round((BASIN.z1 - BASIN.z0) / STEP);
  const vy: number[] = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) vy.push(surface(BASIN.x0 + i * STEP, BASIN.z0 + j * STEP));
  const buckets = new Map<string, { p: number[]; c: number[] }>();
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    cc = new THREE.Vector3(),
    n = new THREE.Vector3();
  const col = new THREE.Color();
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = BASIN.x0 + i * STEP;
      const z = BASIN.z0 + j * STEP;
      const ids = [j * (nx + 1) + i, j * (nx + 1) + i + 1, (j + 1) * (nx + 1) + i, (j + 1) * (nx + 1) + i + 1];
      if (Math.max(...ids.map((k) => vy[k])) < SEA_Y - 0.9) continue;
      const key = `${Math.floor(x / size)},${Math.floor(z / size)}`;
      let bucket = buckets.get(key);
      if (!bucket) buckets.set(key, (bucket = { p: [], c: [] }));
      const at = (di: number, dj: number, v: THREE.Vector3) => v.set(x + di * STEP, vy[(j + dj) * (nx + 1) + i + di], z + dj * STEP);
      for (const tri of [
        [
          [0, 0],
          [0, 1],
          [1, 0],
        ],
        [
          [1, 0],
          [0, 1],
          [1, 1],
        ],
      ]) {
        at(tri[0][0], tri[0][1], a);
        at(tri[1][0], tri[1][1], b);
        at(tri[2][0], tri[2][1], cc);
        n.subVectors(b, a).cross(cc.clone().sub(a)).normalize();
        const steep = 1 - THREE.MathUtils.smoothstep(n.y, 0.55, 0.85);
        const mx = (a.x + b.x + cc.x) / 3,
          my = (a.y + b.y + cc.y) / 3,
          mz = (a.z + b.z + cc.z) / 3;
        groundColor(mx, mz, my, steep, col);
        for (const v of [a, b, cc]) {
          bucket.p.push(v.x, v.y, v.z);
          bucket.c.push(col.r, col.g, col.b);
        }
      }
    }
  }
  return [...buckets.values()].map(({ p, c }) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  });
}

// ------------------------------------------------------------------ vegetation

/** A primeval giant: buttress roots, a thick mossy trunk, a broad layered crown. */
export function primevalTreeGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(1.2);
  b.cyl(0.55, 0.95, 9.4, 0, -0.3, 0, "#6b4a30", 8);
  for (let i = 0; i < 5; i++) {
    const a = i * 1.26 + 0.3;
    between(b, [0, 1.5, 0], [Math.cos(a) * 1.7, -0.1, Math.sin(a) * 1.7], 0.35, 0.12, "#644328", 5);
  }
  // Moss patches up the trunk.
  b.add(new THREE.CylinderGeometry(0.62, 0.72, 1.2, 8, 1, true), "#5f9a44", [0, 3.4, 0], [0, 0.4, 0.06]);
  between(b, [0, 6.4, 0], [2.2, 8.6, 0.6], 0.3, 0.16, "#6b4a30", 6);
  between(b, [0, 6.9, 0], [-2, 8.9, -0.8], 0.28, 0.15, "#6b4a30", 6);
  const crown = (r: number, x: number, y: number, z: number, c: string, seed: number) => b.add(rockGeometry(r, r * 0.42, seed, 1), c, [x, y, z]);
  crown(3.8, 0, 9.4, 0, "#2f6f43", 901);
  crown(2.7, 2.3, 8.8, 0.7, "#3a7f48", 902);
  crown(2.6, -2.1, 9.1, -0.8, "#2a6640", 903);
  crown(2.4, 0.3, 10.6, -0.3, "#458d4e", 904);
  return b.build();
}

/** A tree fern: a slim scaly trunk and a crown of long arching fronds. */
export function treeFernGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0.6);
  b.cyl(0.16, 0.24, 3.6, 0, -0.1, 0, "#5a4430", 6);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const frond = new THREE.ConeGeometry(0.34, 2.6, 4, 1);
    frond.scale(1, 1, 0.12);
    b.add(frond, i % 2 ? "#4f9a3e" : "#3f8a36", [Math.cos(a) * 1.05, 3.45, Math.sin(a) * 1.05], [Math.sin(a) * 1.85, -a, -Math.cos(a) * 1.85]);
  }
  return b.build();
}

/** A giant ground fern (the forest floor's dense fringe along the paths). */
export function giantFernGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0.5);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    const frond = new THREE.ConeGeometry(0.28, 1.9, 4, 1);
    frond.scale(1, 1, 0.14);
    b.add(frond, i % 2 ? "#5aa846" : "#4a963e", [Math.cos(a) * 0.65, 0.55, Math.sin(a) * 0.65], [Math.sin(a) * 1.15, -a, -Math.cos(a) * 1.15]);
  }
  return b.build();
}

/** Reeds and horsetails for the grove's wet ground. */
export function reedGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0.3);
  for (let i = 0; i < 5; i++) {
    const a = i * 1.9;
    b.cyl(0.03, 0.05, 1.1 + (i % 3) * 0.3, Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2, i % 2 ? "#6fa94a" : "#86b955", 4);
  }
  b.sphere(0.07, 0.05, 1.45, 0.04, "#8a6a3a", [0.6, 2.2, 0.6], 5);
  return b.build();
}

export interface Spot {
  x: number;
  z: number;
  s: number;
  r: number;
  tint: number;
}

/**
 * Vegetation along the walkable land, never on it: sampled round each walk
 * shape at a distance and kept only where nobody can walk.
 */
export function lowlandSpots(): { trees: Spot[]; ferns: Spot[]; fernTrees: Spot[]; reeds: Spot[] } {
  const rand = makeRng(2024);
  const trees: Spot[] = [],
    ferns: Spot[] = [],
    fernTrees: Spot[] = [],
    reeds: Spot[] = [];
  const open = { cleared: STAGES, solved: ["groveLilies", "canopyVines", "canopyRope", "causewayGate"] as const };
  const off = (x: number, z: number, pad: number) => {
    // Nothing grows on the sanctuary's shelf or against the cliff (it would poke up beside the garden).
    if (z > -157.5) return false;
    for (const [dx, dz] of [
      [0, 0],
      [pad, 0],
      [-pad, 0],
      [0, pad],
      [0, -pad],
    ])
      if (lowlandWalkable(x + dx, z + dz, open, 0)) return false;
    return groundY(x, z) > SEA_Y + 0.3 && Math.hypot(x - POND.x, z - POND.z) > POND.r + 0.5;
  };
  const town = (x: number, z: number) => x > PORT.x0 - 6 && x < PORT.x1 + 6 && z < PORT.z1 + 4;
  for (const id of ZONE_ORDER) {
    for (const sh of ZONES[id].walk) {
      const pts: Array<[number, number, number]> = [];
      if (sh.kind === "trail") {
        for (let i = 1; i < sh.pts.length; i++) {
          const [ax, az] = sh.pts[i - 1],
            [bx, bz] = sh.pts[i];
          const len = Math.hypot(bx - ax, bz - az);
          for (let s = 0; s < len; s += 2.2) pts.push([ax + ((bx - ax) * s) / len, az + ((bz - az) * s) / len, sh.w]);
        }
      } else if (sh.kind === "disc") {
        for (let a = 0; a < Math.PI * 2; a += 0.35) pts.push([sh.x + Math.cos(a) * sh.r, sh.z + Math.sin(a) * sh.r, 0.5]);
      } else {
        for (let x = sh.x0; x <= sh.x1; x += 3) pts.push([x, sh.z0, 0.5], [x, sh.z1, 0.5]);
        for (let z = sh.z0; z <= sh.z1; z += 3) pts.push([sh.x0, z, 0.5], [sh.x1, z, 0.5]);
      }
      for (const [px, pz] of pts) {
        for (let k = 0; k < 3; k++) {
          const a = rand() * Math.PI * 2;
          const near = k === 0;
          const d = near ? 1.4 + rand() * 2.2 : 4 + rand() * 8;
          const x = px + Math.cos(a) * d,
            z = pz + Math.sin(a) * d;
          if (!off(x, z, near ? 0.7 : 2.6)) continue;
          if (id === "port" || town(x, z)) {
            if (!near && rand() < 0.15) trees.push({ x, z, s: 0.55 + rand() * 0.2, r: rand() * 6.28, tint: 0.95 + rand() * 0.1 });
            continue;
          }
          if (near) {
            if (id === "grove" && rand() < 0.45) reeds.push({ x, z, s: 0.9 + rand() * 0.5, r: rand() * 6.28, tint: 0.9 + rand() * 0.2 });
            else ferns.push({ x, z, s: 0.8 + rand() * 0.7, r: rand() * 6.28, tint: 0.85 + rand() * 0.3 });
          } else if (rand() < 0.42) trees.push({ x, z, s: 0.75 + rand() * 0.55, r: rand() * 6.28, tint: 0.85 + rand() * 0.25 });
          else if (rand() < 0.5) fernTrees.push({ x, z, s: 0.8 + rand() * 0.6, r: rand() * 6.28, tint: 0.85 + rand() * 0.25 });
        }
      }
    }
  }
  // Thin out overlaps: one big tree per 5 m.
  const kept: Spot[] = [];
  for (const t of trees) if (kept.every((k) => Math.hypot(k.x - t.x, k.z - t.z) > 5 * Math.max(k.s, t.s))) kept.push(t);
  for (const t of GIANT_TREES) kept.push({ x: t.x, z: t.z, s: t.r / 0.95, r: t.x * 0.7, tint: 1 });
  return { trees: kept, ferns, fernTrees, reeds };
}

// ------------------------------------------------------------------ the cliff, ruins, the grove, the canopy, the camp

/** The rock face under the sanctuary's lookout (flat behind the rope) and boulders along the shelf. */
export function cliffFaceGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  const r = CLIFF_ROPE;
  const top = groundY(r.x, r.top.z);
  const foot = groundY(r.foot.x, r.foot.z) - 0.6;
  // The climbing face: a slab as wide as the ledge, its top just under the ledge's grass,
  // in bands of slightly different rock so it reads as strata, not a box.
  // One closed core all the way from the ledge to below the basin. Strata
  // are flush coloured overlays on this core, never separate floating slabs.
  b.box(12.8, top - foot - 0.12, 9, r.x, foot, r.faceZ + 4.5, "#7d6c5f");
  for (let i = 0; i < 6; i++) {
    const y = foot + ((top - foot - 0.2) * i) / 6;
    b.box(12.8, (top - foot - 0.2) / 6 + 0.015, 0.035, r.x, y, r.faceZ + 0.012, i % 2 ? "#806e60" : "#89776a");
  }
  // Closed tapered wings meet the old massif under the garden rim. Their
  // shared columns overlap so side and underside views cannot expose cracks.
  for (let x = 49; x < 92; x += 2) {
    if (Math.abs(x - r.x) < 6) continue;
    const h = Math.max(1, groundY(x, -147.5) - foot - 0.15);
    b.box(2.06, h, 8, x, foot, r.faceZ + 4.05, "#79695e");
  }
  // Bulging rocks either side of the climbing line (never in front of the rope), up to the lip.
  const rand = makeRng(77);
  for (let i = 0; i < 22; i++) {
    const side = i % 2 ? 1 : -1;
    const x = r.x + side * (5 + rand() * 4);
    const y = foot + rand() * (top - foot - 0.6);
    b.add(rockGeometry(1.1 + rand() * 1.2, 1.1 + rand() * 1.5, 1200 + i, 1), i % 3 ? "#6f6157" : "#85766a", [x, y, r.faceZ - 0.1 - rand() * 0.5]);
  }
  // Mossy boulders and broken rock at the foot.
  for (let i = 0; i < 9; i++) {
    const x = r.x - 7 + i * 1.8 + rand() * 0.6;
    if (Math.abs(x - r.x) < 3.3) continue;
    b.add(rockGeometry(0.7 + rand() * 0.8, 0.6 + rand() * 0.6, 1300 + i, 0), "#6f7a5a", [x, groundY(x, r.faceZ - 1.2) - 0.2, r.faceZ - 0.9 - rand()]);
  }
  // The shelf's north face, east and west of the lookout: tall rocks under the garden's rim.
  for (let i = 0; i < 18; i++) {
    const a = Math.PI * (1.12 + (i / 17) * 0.76);
    const x = 70 + Math.cos(a) * 14.2,
      z = -136 + Math.sin(a) * 14.2;
    if (Math.abs(x - r.x) < 7.5 && z < -146) continue;
    const g = groundY(x, z - 2);
    b.add(rockGeometry(2.4 + rand(), Math.max(3, 15.5 - g) * 0.62, 1400 + i, 1), i % 2 ? "#776659" : "#6a5c53", [x, g - 0.5, z]);
  }
  return b.build();
}

/** The rope down the cliff: from the stake on the ledge over the lip and straight down, clear of the face. */
export function cliffRopeGeometry(): THREE.BufferGeometry {
  const r = CLIFF_ROPE;
  const top = groundY(r.x, r.top.z);
  const foot = groundY(r.foot.x, r.foot.z);
  const pts = [
    new THREE.Vector3(r.x, top + 0.45, r.stakeZ),
    new THREE.Vector3(r.x, top + 0.18, r.lipZ - 0.05),
    new THREE.Vector3(r.x, top - 0.4, r.hangZ),
    new THREE.Vector3(r.x, (top + foot) / 2, r.hangZ - 0.02),
    new THREE.Vector3(r.x, foot + 0.1, r.hangZ - 0.05),
    new THREE.Vector3(r.x + 0.4, foot + 0.04, r.hangZ - 0.5),
  ];
  const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.2);
  const b = new PartBuilder(0);
  b.add(new THREE.TubeGeometry(curve, 48, 0.045, 5), "#c79a5c", [0, 0, 0], [0, 0, 0], [1, 1, 1], { flatAo: true });
  b.cyl(0.08, 0.1, 0.9, r.x, top - 0.35, r.stakeZ, "#6e4a2c", 6);
  b.torus(0.1, 0.04, [r.x, top + 0.45, r.stakeZ], [Math.PI / 2, 0, 0], "#b58a52");
  return b.build();
}

/** Causeway paving, ruined pillars and arches, the shrine, the camp, logs, boulders. */
export function lowlandPropsGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0.3);
  const rand = makeRng(31);
  const gy = (x: number, z: number) => groundY(x, z);
  // Causeway slabs.
  for (let x = CAUSEWAY.x0 + 1; x < CAUSEWAY.x1; x += 2.1) {
    for (let z = CAUSEWAY.z0 + 1.6; z < CAUSEWAY.z1 - 0.6; z += 2.1) {
      if (rand() < 0.18) continue;
      b.boxAt(
        1.9,
        0.12,
        1.9,
        [x + (rand() - 0.5) * 0.15, gy(x, z) + 0.02, z + (rand() - 0.5) * 0.15],
        [0, (rand() - 0.5) * 0.08, 0],
        rand() < 0.5 ? "#b9b1a3" : "#a49c8f",
      );
    }
  }
  for (const p of RUIN_PILLARS) {
    const h = 1.6 + rand() * 2.6;
    b.cyl(0.5, 0.58, h, p.x, gy(p.x, p.z) - 0.1, p.z, "#b8ad9a", 8);
    b.box(1.3, 0.3, 1.3, p.x, gy(p.x, p.z) - 0.1, p.z, "#9d9384");
    if (h > 3) b.box(1.2, 0.28, 1.2, p.x, gy(p.x, p.z) - 0.1 + h, p.z, "#c4b9a6");
    b.sphere(0.35, p.x + 0.3, gy(p.x, p.z) + h * 0.4, p.z + 0.4, "#6aa04a", [1, 0.5, 0.8], 6);
  }
  // A broken arch where the grove joins the causeway, another at the shrine.
  for (const [x, z] of [
    [58, -243],
    [102, -251.5],
  ]) {
    const y = gy(x, z);
    b.cyl(0.45, 0.55, 4.2, x - 2.4, y - 0.1, z, "#b3a893", 8);
    b.cyl(0.45, 0.55, 3.1, x + 2.4, y - 0.1, z, "#b3a893", 8);
    b.boxAt(5.6, 0.7, 1, [x - 0.3, y + 4.3, z], [0, 0, -0.08], "#c2b7a3");
  }
  // The shrine: a stepped platform, statues of monsters, a glowing stone.
  const sy = gy(SHRINE.x, SHRINE.z);
  b.cyl(4.2, 4.5, 0.25, SHRINE.x, sy - 0.15, SHRINE.z, "#b2a895", 12);
  for (const [dx, dz] of [
    [2.6, -2.2],
    [2.6, 2.2],
  ]) {
    const x = SHRINE.x + dx,
      z = SHRINE.z + dz;
    b.box(0.9, 0.9, 0.9, x, sy, z, "#9d9384");
    b.sphere(0.55, x, sy + 1.4, z, "#a8b0a0", [1, 1.1, 1], 8);
    b.sphere(0.12, x - 0.18, sy + 1.6, z + 0.45, "#5a6a5a", [1, 1, 0.5], 5);
    b.sphere(0.12, x + 0.18, sy + 1.6, z + 0.45, "#5a6a5a", [1, 1, 0.5], 5);
  }
  // The camp: tent, fire ring, log bench, a lantern post.
  const t = CAMP2.tent;
  const ty = gy(t.x, t.z);
  const tent = new THREE.ConeGeometry(2.1, 2.4, 4, 1);
  tent.rotateY(Math.PI / 4);
  tent.scale(1, 1, 0.8);
  b.add(tent, "#e8a43a", [t.x, ty + 1.2, t.z], [0, t.yaw, 0]);
  b.boxAt(0.9, 1.4, 0.06, [t.x + Math.sin(t.yaw) * 1.25, ty + 0.65, t.z + Math.cos(t.yaw) * 1.25], [0, t.yaw, 0], "#7a4a20");
  const f = CAMP2.fire;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.add(rockGeometry(0.22, 0.18, 1500 + i, 0), "#8a8178", [f.x + Math.cos(a) * 0.6, gy(f.x, f.z) + 0.05, f.z + Math.sin(a) * 0.6]);
  }
  for (let i = 0; i < 3; i++) b.cylAt(0.08, 0.9, [f.x, gy(f.x, f.z) + 0.15, f.z], [Math.PI / 2, i * 1.05, 0.25], "#6e4a2c", 6);
  const bn = CAMP2.bench;
  b.cylAt(0.22, 1.6, [bn.x, gy(bn.x, bn.z) + 0.22, bn.z], [0, bn.yaw, Math.PI / 2], "#7a5534", 8);
  // The fork's signpost with two arrow boards.
  const s = FORK_SIGN;
  const fy = gy(s.x, s.z);
  b.cyl(0.08, 0.1, 2.2, s.x, fy - 0.1, s.z, "#6e4a2c", 6);
  b.boxAt(1.4, 0.32, 0.06, [s.x - 0.55, fy + 1.75, s.z], [0, 0, 0.08], "#c99a5a");
  b.boxAt(1.4, 0.32, 0.06, [s.x + 0.55, fy + 1.35, s.z], [0, 0, -0.08], "#c99a5a");
  // Fallen logs and mossy boulders.
  for (const l of LOGS) {
    const mx = (l.ax + l.bx) / 2,
      mz = (l.az + l.bz) / 2;
    between(b, [l.ax, gy(l.ax, l.az) + l.r * 0.8, l.az], [l.bx, gy(l.bx, l.bz) + l.r * 0.8, l.bz], l.r, l.r * 0.9, "#6e5236", 8);
    b.sphere(l.r * 0.9, mx, gy(mx, mz) + l.r * 1.5, mz, "#5f9a44", [1.6, 0.4, 1], 6);
  }
  for (const r of MOSSY_BOULDERS) {
    b.add(rockGeometry(r.r, r.h, 1600 + Math.round(r.x), 1), "#7d786a", [r.x, gy(r.x, r.z) - 0.2, r.z]);
    b.sphere(r.r * 0.75, r.x, gy(r.x, r.z) + r.h * 0.75, r.z, "#5f9a44", [1, 0.35, 1], 8);
  }
  // The raised root walk: giant roots line both sides; posts mark each gap.
  for (let i = 0; i < CANOPY_TRAIL.length - 1; i++) {
    const [ax, az] = CANOPY_TRAIL[i],
      [bx, bz] = CANOPY_TRAIL[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / len,
      uz = (bz - az) / len;
    for (let s = 1.5; s < len; s += 3.2) {
      for (const side of [-1, 1]) {
        const x = ax + ux * s - uz * side * 2.9,
          z = az + uz * s + ux * side * 2.9;
        const h = canopyRaise(x, z);
        if (h < 1.2) continue;
        const inGap = Object.values(CANOPY_GAPS).some((g) => Math.abs(x - g.x) < 4 && z > g.z0 - 0.3 && z < g.z1 + 0.3);
        if (inGap) continue;
        between(b, [x - ux * 1.9, groundY(x, z) + 0.2, z - uz * 1.9], [x + ux * 1.9, groundY(x, z) + 0.35, z + uz * 1.9], 0.45, 0.4, "#6b4a2e", 7);
      }
    }
  }
  for (const g of Object.values(CANOPY_GAPS)) {
    const y = groundY(g.x, g.z1 + 1.2);
    for (const [dx, z] of [
      [-1.15, g.z1 + 0.5],
      [1.15, g.z1 + 0.5],
      [-1.15, g.z0 - 0.5],
      [1.15, g.z0 - 0.5],
    ])
      b.cyl(0.11, 0.14, 1.3, g.x + dx, y - 0.1, z, "#7a5532", 6);
  }
  // The islet: a small mossy mound; the shortcut gate's stone frame.
  b.cyl(0.5, 0.6, 2.8, SHORTCUT_GATE.x - SHORTCUT_GATE.half - 0.5, gy(SHORTCUT_GATE.x, SHORTCUT_GATE.z) - 0.1, SHORTCUT_GATE.z, "#a89e8c", 8);
  b.cyl(0.5, 0.6, 2.8, SHORTCUT_GATE.x + SHORTCUT_GATE.half + 0.5, gy(SHORTCUT_GATE.x, SHORTCUT_GATE.z) - 0.1, SHORTCUT_GATE.z, "#a89e8c", 8);
  b.box(SHORTCUT_GATE.half * 2 + 2.2, 0.6, 1, SHORTCUT_GATE.x, gy(SHORTCUT_GATE.x, SHORTCUT_GATE.z) + 2.7, SHORTCUT_GATE.z, "#b6ab97");
  for (const side of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const x = SHORTCUT_GATE.x + side * (SHORTCUT_GATE.half + 1.6 + k * 1.3);
      b.add(rockGeometry(0.9, 1.4, 1700 + k + side * 10, 0), "#7d786a", [x, gy(x, SHORTCUT_GATE.z) - 0.2, SHORTCUT_GATE.z]);
    }
  }
  return b.build();
}

/** Water: the pond and the shallow streams (one transparent draw). */
export function lowlandWaterGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  b.add(new THREE.CircleGeometry(POND.r + 0.6, 24).rotateX(-Math.PI / 2), "#3fb5c8", [POND.x, POND_Y, POND.z], [0, 0, 0], [1, 1, 1], { flatAo: true });
  for (const s of STREAMS) {
    for (let i = 1; i < s.length; i++) {
      const [ax, az] = s[i - 1],
        [bx, bz] = s[i];
      const len = Math.hypot(bx - ax, bz - az);
      const mx = (ax + bx) / 2,
        mz = (az + bz) / 2;
      const plane = new THREE.PlaneGeometry(1.6, len + 1.2).rotateX(-Math.PI / 2);
      b.add(plane, "#5cc6d6", [mx, streamY(mx, mz), mz], [0, Math.atan2(bx - ax, bz - az), 0], [1, 1, 1], { flatAo: true });
    }
  }
  return b.build();
}

export function lilyPadGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  for (const p of LILY_PADS) {
    b.add(new THREE.CylinderGeometry(0.75, 0.75, 0.08, 10, 1, false, 0.3, Math.PI * 1.8), "#5fae4f", [p.x, 0, p.z], [0, p.x, 0], [1, 1, 1], { flatAo: true });
    b.sphere(0.12, p.x + 0.25, 0.08, p.z - 0.2, "#ff8fb8", [1, 0.7, 1], 6);
  }
  b.add(new THREE.CylinderGeometry(ISLET.r + 0.4, ISLET.r + 0.9, 0.5, 12), "#5f9a44", [ISLET.x, POND_Y - 0.1, ISLET.z]);
  return b.build();
}

/** The vine bridge Leafy weaves over the first gap (built along +z, centred). */
export function vineBridgeGeometry(len: number): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  for (let i = 0; i < Math.ceil(len / 0.42); i++)
    b.boxAt(1.8, 0.1, 0.36, [0, 0, -len / 2 + 0.2 + i * 0.42], [0, 0, (i % 2 ? 1 : -1) * 0.03], i % 2 ? "#4f9a3e" : "#3f8a36");
  for (const side of [-1, 1]) {
    between(b, [side * 0.95, 0.75, -len / 2], [side * 0.95, 0.6, len / 2], 0.05, 0.05, "#3a7a2e", 5);
    for (let z = -len / 2 + 0.6; z < len / 2; z += 1.1) b.sphere(0.14, side * 0.95, 0.66, z, "#6fd24f", [1, 0.6, 1.3], 6);
  }
  return b.build();
}

/** The rope bridge Puff unrolls over the second gap. */
export function ropeBridgeGeometry(len: number): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  for (let i = 0; i < Math.ceil(len / 0.5); i++) b.boxAt(1.7, 0.08, 0.4, [0, -0.04, -len / 2 + 0.25 + i * 0.5], [0, 0, 0], i % 2 ? "#a77a46" : "#b88a52");
  for (const side of [-1, 1]) between(b, [side * 0.9, 0.85, -len / 2], [side * 0.9, 0.85, len / 2], 0.035, 0.035, "#c79a5c", 4);
  return b.build();
}

/** The shortcut's portcullis (bars) and its tangle of thorns (burned away). */
export function gateBarsGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  const w = SHORTCUT_GATE.half * 2;
  for (let x = -w / 2 + 0.2; x <= w / 2; x += 0.45) b.cyl(0.05, 0.05, 2.6, x, 0, 0, "#5b5550", 5);
  b.box(w + 0.2, 0.12, 0.12, 0, 1.2, 0, "#5b5550");
  b.box(w + 0.2, 0.12, 0.12, 0, 2.4, 0, "#5b5550");
  return b.build();
}
export function thornsGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0.2);
  const rand = makeRng(5);
  for (let i = 0; i < 16; i++) {
    const x = (rand() - 0.5) * SHORTCUT_GATE.half * 2.2;
    const y = rand() * 2.2;
    between(b, [x, y, -0.25], [x + (rand() - 0.5) * 1.5, y + (rand() - 0.5) * 1.2, -0.3], 0.07, 0.04, "#4a3a2a", 4);
    b.add(new THREE.ConeGeometry(0.05, 0.22, 4), "#2f3a24", [x, y + 0.12, -0.32], [rand(), rand(), rand()]);
  }
  return b.build();
}

// ------------------------------------------------------------------ the town

/** Every building, the plaza, the quay and the pier in one merged mesh. */
export function townGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0.4);
  const gy = (x: number, z: number) => groundY(x, z);
  const house = (x: number, z: number, w: number, d: number, yaw: number, wall: string, roof: string, h = 3.2) => {
    const y = gy(x, z) - 0.2;
    b.boxAt(w, h, d, [x, y + h / 2, z], [0, yaw, 0], wall);
    const r = new THREE.ConeGeometry(Math.hypot(w, d) / 2 + 0.25, 1.8, 4, 1);
    r.rotateY(Math.PI / 4);
    r.scale((w / Math.hypot(w, d)) * 1.414, 1, (d / Math.hypot(w, d)) * 1.414);
    b.add(r, roof, [x, y + h + 0.9, z], [0, yaw, 0]);
    // Door and windows on the front (local +z).
    const fx = Math.sin(yaw),
      fz = Math.cos(yaw),
      rx = Math.cos(yaw),
      rz = -Math.sin(yaw);
    const front = d / 2 + 0.02;
    b.boxAt(0.9, 1.7, 0.08, [x + fx * front, y + 0.85, z + fz * front], [0, yaw, 0], "#6e4a2c");
    for (const side of [-1, 1])
      b.boxAt(0.7, 0.7, 0.08, [x + fx * front + rx * side * w * 0.3, y + 2, z + fz * front + rz * side * w * 0.3], [0, yaw, 0], "#7fc6e8");
  };
  for (const s of Object.values(SERVICES)) {
    const colors: Record<string, [string, string]> = {
      market: ["#fbe3b5", "#e8553f"],
      kitchen: ["#fff1f4", "#ff8fb0"],
      trainer: ["#dfe9f7", "#3f7fd0"],
      inn: ["#f2e6ff", "#8f6ad0"],
      harbor: ["#e6eef2", "#26467a"],
    };
    const [wall, roof] = colors[s.id];
    house(s.house.x, s.house.z, s.house.w, s.house.d, s.house.yaw, wall, roof, s.id === "inn" ? 4.4 : 3.2);
    const k = s.keeper;
    // A counter in front of each keeper.
    const fx = Math.sin(s.house.yaw),
      fz = Math.cos(s.house.yaw);
    b.boxAt(Math.min(3, s.house.w * 0.5), 1, 0.7, [k.x - fx * 0.95, gy(k.x, k.z) + 0.5, k.z - fz * 0.95], [0, s.house.yaw, 0], "#b0763e");
  }
  for (const h of HOUSES) house(h.x, h.z, h.w, h.d, h.yaw, h.color, h.roof);
  // Market stall: a striped awning and crates of food.
  const m = SERVICES.market.house;
  for (let i = 0; i < 6; i++)
    b.boxAt(0.62, 0.08, 2, [m.x + 2.6, gy(m.x, m.z) + 2.7 - 0.1 * i, m.z - 1.6 + i * 0.64], [0.2, 0, 0], i % 2 ? "#ffffff" : "#e8553f");
  for (const [dz, c] of [
    [-1.1, "#e83a35"],
    [0, "#ffd23f"],
    [1.1, "#a070e0"],
  ] as const) {
    b.box(0.7, 0.4, 0.7, m.x + 3.4, gy(m.x, m.z) + 0.6, m.z + dz, "#b0763e");
    b.sphere(0.25, m.x + 3.4, gy(m.x, m.z) + 1.1, m.z + dz, c, [1.2, 0.6, 1.2], 7);
  }
  // Kitchen chimney; trainer's practice dummy; inn sign post; harbour flag pole.
  const kh = SERVICES.kitchen.house;
  b.box(0.7, 2, 0.7, kh.x + 1.5, gy(kh.x, kh.z) + 3.4, kh.z - 1, "#c9a08a");
  const tr = SERVICES.trainer.house;
  b.cyl(0.08, 0.08, 1.6, tr.x + 5.2, gy(tr.x, tr.z) - 0.1, tr.z + 2.6, "#6e4a2c", 6);
  b.sphere(0.4, tr.x + 5.2, gy(tr.x, tr.z) + 1.3, tr.z + 2.6, "#d8b77a", [1, 1.3, 1], 8);
  const hb = SERVICES.harbor.house;
  b.cyl(0.07, 0.09, 6, hb.x + 4.6, gy(hb.x, hb.z) - 0.1, hb.z + 0.5, "#e6e6e6", 6);
  b.boxAt(1.4, 0.9, 0.04, [hb.x + 5.35, gy(hb.x, hb.z) + 5.3, hb.z + 0.5], [0, 0, 0], "#3f9fe0");
  // The plaza fountain.
  const f = FOUNTAIN;
  const fy = gy(f.x, f.z);
  b.cyl(f.r, f.r + 0.1, 0.5, f.x, fy - 0.05, f.z, "#bdb3a2", 14);
  b.cyl(f.r - 0.25, f.r - 0.25, 0.05, f.x, fy + 0.4, f.z, "#6fd0e0", 14);
  b.cyl(0.25, 0.3, 1.2, f.x, fy + 0.4, f.z, "#bdb3a2", 8);
  b.sphere(0.35, f.x, fy + 1.7, f.z, "#bdb3a2", [1, 0.5, 1], 8);
  for (const l of LAMPS) {
    b.cyl(0.06, 0.08, 2.6, l.x, gy(l.x, l.z) - 0.1, l.z, "#4a4a52", 6);
    b.sphere(0.2, l.x, gy(l.x, l.z) + 2.6, l.z, "#fff3b0", [1, 1.2, 1], 8);
  }
  for (const c of CRATES) b.boxAt(0.8 * c.s, 0.8 * c.s, 0.8 * c.s, [c.x, gy(c.x, c.z) + 0.4 * c.s, c.z], [0, c.yaw, 0], "#b0763e");
  // The quay wall along the harbour, the pier and its posts, a moored boat, the lighthouse.
  const qz = PORT.z0 - 0.2;
  const qy = gy(76, PORT.z0 + 1);
  b.box(PORT.x1 - PORT.x0 + 6, qy + 4.4, 1, (PORT.x0 + PORT.x1) / 2, -4.4, qz, "#a59a88");
  const deck = qy + PIER2.deckY;
  b.box(PIER2.half * 2, 0.16, PIER2.z1 - PIER2.z0, PIER2.x, deck - 0.16, (PIER2.z0 + PIER2.z1) / 2, "#b88a52");
  for (let z = PIER2.z0 + 0.6; z < PIER2.z1; z += 2.4)
    for (const side of [-1, 1]) b.cyl(0.12, 0.12, deck + 3.6, PIER2.x + side * (PIER2.half - 0.05), -3.6, z, "#7a5532", 6);
  // The boat (a sailing boat at the pier's end).
  const bx = PIER2.x + 3.6,
    bz = PIER2.z0 + 4;
  const hull = new THREE.CylinderGeometry(1.4, 0.9, 6.5, 8, 1, false, Math.PI, Math.PI);
  hull.rotateX(Math.PI / 2);
  b.add(hull, "#c0503a", [bx, SEA_Y + 0.6, bz], [0, 0, Math.PI]);
  b.box(2.4, 0.15, 5.6, bx, SEA_Y + 0.55, bz, "#d8b77a");
  b.cyl(0.09, 0.11, 6, bx, SEA_Y + 0.6, bz, "#7a5532", 6);
  b.boxAt(0.05, 3.6, 2.6, [bx, SEA_Y + 3.6, bz + 1.4], [0, 0, 0], "#fbf6ea");
  const lx = 99,
    lz = -327;
  b.add(rockGeometry(3, 2.5, 1800, 1), "#7a6c61", [lx, SEA_Y - 1, lz]);
  b.cyl(0.9, 1.3, 8, lx, SEA_Y + 1.2, lz, "#ffffff", 10);
  for (const y of [3, 6]) b.cyl(1.0 - y * 0.03, 1.2 - y * 0.03, 0.9, lx, SEA_Y + 1.2 + y, lz, "#e8553f", 10);
  b.cyl(1.0, 1.0, 1.2, lx, SEA_Y + 9.2, lz, "#fff3b0", 10);
  b.cone(1.2, 1.2, lx, SEA_Y + 10.4, lz, "#e8553f", 10);
  return b.build();
}

/** Signboards over the services (English words to read): one atlas, one draw. */
export function townSigns(): { geo: THREE.BufferGeometry; tex: THREE.CanvasTexture } {
  const labels: Array<[keyof typeof SERVICES, string, string]> = [
    ["market", "FOOD MARKET", "#e8553f"],
    ["kitchen", "TREAT KITCHEN", "#ff6f9e"],
    ["trainer", "MONSTER TRAINER", "#3f7fd0"],
    ["inn", "SEASIDE INN", "#8f6ad0"],
    ["harbor", "HARBOR OFFICE", "#26467a"],
  ];
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 64 * labels.length;
  const g = c.getContext("2d")!;
  labels.forEach(([, text, color], i) => {
    g.fillStyle = "#fff8ea";
    g.fillRect(0, i * 64, 512, 64);
    g.fillStyle = color;
    g.fillRect(6, i * 64 + 6, 500, 52);
    g.fillStyle = "#ffffff";
    g.font = "bold 36px sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, 256, i * 64 + 33);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const parts: THREE.BufferGeometry[] = [];
  labels.forEach(([id], i) => {
    const s = SERVICES[id].house;
    const plane = new THREE.PlaneGeometry(3.4, 0.45);
    const uv = plane.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setY(k, 1 - (i + 1 - uv.getY(k)) / labels.length);
    const fx = Math.sin(s.yaw),
      fz = Math.cos(s.yaw);
    plane.rotateY(s.yaw);
    plane.translate(s.x + fx * (s.d / 2 + 0.06), groundY(s.x, s.z) + (id === "inn" ? 3.7 : 2.75), s.z + fz * (s.d / 2 + 0.06));
    parts.push(plane);
  });
  return { geo: mergeGeometries(parts, false), tex };
}

/** A keeper: one merged mesh (limbs posed), with hats and aprons from their look. */
export function npcGeometry(n: NpcDef): THREE.BufferGeometry {
  const o: Outfit = {
    skin: n.skin,
    hair: n.hair,
    shirt: n.shirt,
    shirtTrim: n.apron ?? n.shirt,
    shorts: "#5a5a72",
    shoes: "#5a3a22",
    hat: "band",
    hatColor: n.hat === "band" ? n.hatColor : n.hair,
    height: 1.1,
  };
  const parts: THREE.BufferGeometry[] = [bodyGeometry(o)];
  const place = (g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, rz = 0) => {
    g.applyMatrix4(
      new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz)), new THREE.Vector3(1, 1, 1)),
    );
    parts.push(g);
  };
  for (const s of [-1, 1]) {
    place(thighGeometry(o), s * 0.09, 0.5, 0);
    place(shinGeometry(o), s * 0.09, 0.5 + KNEE_Y, 0);
    place(armGeometry(o), s * 0.27, 0.98, 0, -0.25, s * 0.12);
  }
  const extra = new PartBuilder(0);
  if (n.apron) extra.boxAt(0.36, 0.42, 0.04, [0, 0.7, 0.17], [0.05, 0, 0], n.apron);
  if (n.hat === "chef") {
    extra.cyl(0.19, 0.2, 0.22, 0, 1.44, 0, "#ffffff", 10);
    extra.sphere(0.24, 0, 1.72, 0, "#ffffff", [1, 0.7, 1], 10);
  } else if (n.hat === "captain") {
    extra.cyl(0.25, 0.23, 0.12, 0, 1.45, 0, "#ffffff", 12);
    extra.cyl(0.25, 0.25, 0.04, 0, 1.44, 0.02, "#26467a", 12);
    extra.sphere(0.12, 0, 1.18, 0.16, n.hair, [1.4, 0.6, 0.6], 8);
  } else if (n.hat === "scarf")
    extra.add(new THREE.SphereGeometry(0.225, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), n.hatColor, [0, 1.35, -0.01], [-0.2, 0, 0]);
  if (!extra.empty) parts.push(extra.build());
  const merged = mergeGeometries(
    parts.map((p) => (p.index ? p.toNonIndexed() : p)),
    false,
  );
  merged.computeBoundingSphere();
  return merged;
}

// ------------------------------------------------------------------ the raiders

/** The raiders' emblem: a purple shield-disc with a white crescent and a gold star (faces +z). */
function emblem(b: PartBuilder, x: number, y: number, z: number, r: number, yaw = 0) {
  const disc = new THREE.CylinderGeometry(r, r, 0.06, 16);
  disc.rotateX(Math.PI / 2);
  b.add(disc, "#4a2a7a", [x, y, z], [0, yaw, 0], [1, 1, 1], { flatAo: true });
  const fx = Math.sin(yaw) * 0.04,
    fz = Math.cos(yaw) * 0.04;
  const moon = new THREE.CylinderGeometry(r * 0.62, r * 0.62, 0.05, 16);
  moon.rotateX(Math.PI / 2);
  b.add(moon, "#ffffff", [x + fx, y, z + fz], [0, yaw, 0], [1, 1, 1], { flatAo: true });
  const bite = new THREE.CylinderGeometry(r * 0.5, r * 0.5, 0.05, 16);
  bite.rotateX(Math.PI / 2);
  const rx = Math.cos(yaw) * r * 0.25,
    rz = -Math.sin(yaw) * r * 0.25;
  b.add(bite, "#4a2a7a", [x + fx * 2 + rx, y + r * 0.12, z + fz * 2 + rz], [0, yaw, 0], [1, 1, 1], { flatAo: true });
  b.add(new THREE.OctahedronGeometry(r * 0.16, 0), "#ffd23f", [x + fx * 2 - rx * 1.4, y - r * 0.2, z + fz * 2 - rz * 1.4], [0, yaw, 0], [1, 1, 0.4], {
    flatAo: true,
  });
}

/** A round, patched balloon over a wooden gondola with fins and a propeller (faces +z). */
export function airshipGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  b.sphere(3.4, 0, 4.2, 0, "#5b3a8a", [1, 0.78, 1.55], 18);
  for (let i = -2; i <= 2; i++) b.add(new THREE.TorusGeometry(3.35 * Math.cos(i * 0.32), 0.07, 4, 24), "#ffd23f", [0, 4.2, i * 1.6], [0, 0, 0], [1, 0.78, 1]);
  emblem(b, 3.3, 4.3, 0, 1.15, Math.PI / 2);
  emblem(b, -3.3, 4.3, 0, 1.15, -Math.PI / 2);
  // Fins at the back.
  for (const [rx, rz] of [
    [0, 0],
    [0, Math.PI / 2],
    [0, Math.PI],
    [0, -Math.PI / 2],
  ])
    b.boxAt(0.12, 1.6, 1.8, [Math.sin(rz) * 1.2, 4.2 + Math.cos(rz) * 1.2, -4.8], [rx, 0, rz], "#3a2460");
  // Ropes and the gondola.
  for (const [x, z] of [
    [-1, -1.6],
    [1, -1.6],
    [-1, 1.6],
    [1, 1.6],
  ])
    between(b, [x * 1.6, 2.2, z * 1.2], [x * 1.1, 0.6, z], 0.04, 0.04, "#c79a5c", 4);
  const hull = new THREE.CylinderGeometry(1.3, 0.8, 5, 8, 1, false, Math.PI, Math.PI);
  hull.rotateX(Math.PI / 2);
  b.add(hull, "#7a4a2a", [0, 0.8, 0], [0, 0, Math.PI]);
  b.box(2.5, 0.12, 4.6, 0, 0.75, 0, "#a77a46");
  emblem(b, 0, 0.4, 2.55, 0.45);
  // A propeller hub behind; little raiders peering over the side (masked, goggled).
  b.cyl(0.18, 0.18, 0.5, 0, 0.6, -2.7, "#4a4a52", 8);
  for (const x of [-0.7, 0.6]) {
    b.sphere(0.32, x, 1.25, 0.6, "#3a2a4a", [1, 1.1, 1], 10);
    b.box(0.5, 0.14, 0.1, x, 1.28, 0.9, "#ffd23f");
    b.add(new THREE.ConeGeometry(0.18, 0.4, 6), "#4a2a7a", [x, 1.62, 0.6]);
  }
  return b.build();
}
export function propellerGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  b.boxAt(0.18, 1.8, 0.06, [0, 0, 0], [0, 0, 0], "#c9c9cf");
  b.boxAt(1.8, 0.18, 0.06, [0, 0, 0], [0, 0, 0], "#c9c9cf");
  return b.build();
}

/** The glowing cage (bars, rings and a dome); origin at its floor. */
export function cageGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    b.cyl(0.05, 0.05, 2.6, Math.cos(a) * 1.25, 0, Math.sin(a) * 1.25, "#9ff7ff", 5);
  }
  for (const y of [0.05, 1.3, 2.6]) b.add(new THREE.TorusGeometry(1.25, 0.06, 4, 20), "#d8fdff", [0, y, 0], [Math.PI / 2, 0, 0]);
  b.add(new THREE.SphereGeometry(1.25, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), "#9ff7ff", [0, 2.6, 0], [0, 0, 0], [1, 0.45, 1]);
  return b.build();
}

/** Enemies: small, round, a little silly; each wears the raiders' emblem (origin at the feet, facing +z). */
export function enemyGeometry(kind: EnemyKind): THREE.BufferGeometry {
  const b = new PartBuilder(0.25);
  const eyes = (y: number, z: number, dx: number, r: number) => {
    for (const s of [-1, 1]) {
      b.sphere(r, s * dx, y, z, "#ffffff", [1, 1.1, 0.6], 8);
      b.sphere(r * 0.55, s * dx, y - r * 0.1, z + r * 0.4, "#1d1712", [1, 1.1, 0.6], 6);
    }
  };
  if (kind === "gloomlet") {
    b.sphere(0.42, 0, 0.42, 0, "#7a4fbf", [1, 0.92, 1], 12);
    b.sphere(0.3, 0, 0.36, 0.16, "#b49ae6", [1, 0.9, 0.6], 10);
    eyes(0.52, 0.32, 0.14, 0.11);
    // A little raider's helmet (a dome with horns), the emblem on its front.
    b.add(new THREE.SphereGeometry(0.31, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), "#3a2460", [0, 0.66, -0.04], [-0.18, 0, 0], [1, 0.8, 1]);
    b.add(new THREE.ConeGeometry(0.07, 0.22, 5), "#d8d0c0", [-0.22, 0.86, -0.04], [0, 0, 0.6]);
    b.add(new THREE.ConeGeometry(0.07, 0.22, 5), "#d8d0c0", [0.22, 0.86, -0.04], [0, 0, -0.6]);
    emblem(b, 0, 0.78, 0.22, 0.09);
    b.sphere(0.1, -0.2, 0.06, 0.08, "#5a3a8a", [1, 0.6, 1.3], 6);
    b.sphere(0.1, 0.2, 0.06, 0.08, "#5a3a8a", [1, 0.6, 1.3], 6);
  } else if (kind === "snapjaw") {
    b.sphere(0.45, 0, 0.55, -0.1, "#3faa8a", [0.9, 0.85, 1.25], 12);
    b.sphere(0.32, 0, 0.78, 0.42, "#4fc29c", [1, 0.85, 1.2], 12);
    b.sphere(0.24, 0, 0.62, 0.55, "#ffe6b0", [1, 0.45, 1.1], 10);
    for (let i = 0; i < 5; i++) b.add(new THREE.ConeGeometry(0.035, 0.09, 4), "#ffffff", [-0.14 + i * 0.07, 0.68, 0.78], [Math.PI, 0, 0]);
    eyes(0.98, 0.52, 0.15, 0.09);
    between(b, [0, 0.5, -0.5], [0, 0.32, -1.1], 0.16, 0.05, "#3faa8a", 6);
    for (const s of [-1, 1]) b.cyl(0.08, 0.1, 0.32, s * 0.22, 0, -0.05, "#2f8a70", 6);
    // A bandana with the emblem.
    b.add(new THREE.TorusGeometry(0.28, 0.06, 4, 14), "#4a2a7a", [0, 0.86, 0.3], [Math.PI / 2 + 0.3, 0, 0]);
    emblem(b, 0, 0.92, 0.6, 0.1);
    for (let i = 0; i < 4; i++) b.add(new THREE.ConeGeometry(0.07, 0.16, 4), "#ffb34a", [0, 0.98 - i * 0.12, -0.15 - i * 0.22], [-0.5, 0, 0]);
  } else {
    // Shellback: a stocky beetle with a big orange shell painted with the emblem.
    b.sphere(0.72, 0, 0.62, -0.05, "#e07a2a", [1, 0.62, 1.15], 14);
    b.sphere(0.3, 0, 0.5, 0.68, "#4a3a36", [1.1, 0.85, 0.8], 10);
    eyes(0.6, 0.88, 0.13, 0.09);
    for (const s of [-1, 1]) b.add(new THREE.ConeGeometry(0.06, 0.32, 5), "#2a2220", [s * 0.12, 0.85, 0.88], [0.8, 0, s * 0.3]);
    for (const z of [-0.4, 0.05, 0.45]) for (const s of [-1, 1]) between(b, [s * 0.55, 0.32, z], [s * 0.82, 0, z + 0.08], 0.05, 0.04, "#2a2220", 4);
    const top = new THREE.CylinderGeometry(0.3, 0.3, 0.05, 16);
    b.add(top, "#4a2a7a", [0, 1.06, -0.05], [0, 0, 0], [1, 1, 1], { flatAo: true });
    b.add(new THREE.CylinderGeometry(0.19, 0.19, 0.05, 16), "#ffffff", [0.03, 1.08, -0.03], [0, 0, 0], [1, 1, 1], { flatAo: true });
    b.add(new THREE.CylinderGeometry(0.15, 0.15, 0.05, 16), "#4a2a7a", [0.1, 1.09, 0], [0, 0, 0], [1, 1, 1], { flatAo: true });
  }
  return b.build();
}

/** Spinning gold coin (one instanced draw for every coin on the ground). */
export function coinGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  const c = new THREE.CylinderGeometry(0.22, 0.22, 0.06, 12);
  c.rotateX(Math.PI / 2);
  b.add(c, "#ffcf3a", [0, 0, 0], [0, 0, 0], [1, 1, 1], { flatAo: true });
  const s = new THREE.CylinderGeometry(0.12, 0.12, 0.07, 6);
  s.rotateX(Math.PI / 2);
  b.add(s, "#ffe98a", [0, 0, 0], [0, 0, 0], [1, 1, 1], { flatAo: true });
  return b.build();
}

export { CHESTS };

/** Simplified crowns, hills, coastline and port roofs: no stages or enemies. */
export function lowlandPanoramaGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0),
    rand = makeRng(809);
  b.box(16, 1, 30, 75.5, 0, -167, "#487c55");
  b.add(new THREE.CircleGeometry(1, 14), "#487c55", [77, 1, -244], [-Math.PI / 2, 0, 0], [46, 85, 1]);
  for (let i = 0; i < 140; i++) {
    const x = 34 + rand() * 85,
      z = -166 - rand() * 117,
      y = 2.2;
    b.add(new THREE.IcosahedronGeometry(1, 0), i % 3 ? "#326d50" : "#4d825a", [x, y + 5 + rand() * 3, z], [0, rand() * 6, 0], [3 + rand() * 2, 3, 4]);
  }
  for (const x of [28, 124]) for (let z = -182; z > -290; z -= 29) b.add(new THREE.ConeGeometry(12, 18, 5), "#557b6c", [x, 7, z]);
  b.box(49, 0.3, 24, 77, 0.8, -307, "#c6be97");
  for (const x of [60, 94])
    for (const z of [-298, -313]) {
      b.box(5, 2.5, 4, x, 1, z, "#d4c6a7");
      b.add(new THREE.ConeGeometry(4, 2, 4), "#9b7159", [x, 4.5, z], [0, Math.PI / 4, 0], [1, 1, 0.8]);
    }
  b.box(2, 0.4, 17, 76, 1, -330, "#9c825f");
  // The same harbour lighthouse as the detailed town, simplified to a silhouette.
  b.cyl(.9,1.3,8,99,SEA_Y+1.2,-327,"#f8e8d0",6);
  b.cyl(.95,1.05,1,99,SEA_Y+7.2,-327,"#c76c55",6);
  b.cone(1.2,1.2,99,SEA_Y+10.4,-327,"#c76c55",6);
  return b.build();
}

/** Split merged props by stage, preserving their per-triangle colours. */
export function zoneGeometry(source: THREE.BufferGeometry): Array<{ zone: ZoneId; geometry: THREE.BufferGeometry }> {
  const g = source.index ? source.toNonIndexed() : source;
  const buckets = new Map<ZoneId, Record<string, number[]>>();
  const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i += 3) {
    const owner = detailOwner((p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3);
    let attrs = buckets.get(owner);
    if (!attrs) buckets.set(owner, (attrs = {}));
    for (const [name, a] of Object.entries(g.attributes)) {
      const values = (attrs[name] ??= []);
      for (let j = i; j < i + 3; j++) for (let k = 0; k < a.itemSize; k++) values.push(a.array[j * a.itemSize + k]);
    }
  }
  const result = [...buckets].map(([zone, attrs]) => {
    const geometry = new THREE.BufferGeometry();
    for (const [name, values] of Object.entries(attrs)) geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, g.getAttribute(name).itemSize));
    geometry.computeBoundingSphere();
    return { zone, geometry };
  });
  if (g !== source) g.dispose();
  source.dispose();
  return result;
}

export function stageBarrierGeometry(gate: (typeof STAGE_EXITS)[number]): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  if (gate.kind === "stone") {
    b.box(gate.half * 2, 3.8, 0.8, 0, 0, 0, "#8c9081");
    for (let x = -gate.half; x <= gate.half; x += 1.6) b.box(0.09, 3.6, 0.83, x, 0.05, 0, "#646e5e");
  } else if (gate.kind === "wood") {
    for (let x = -gate.half; x <= gate.half; x += 1) b.box(0.32, 2.5, 0.38, x, 0, 0, "#7c5941");
    b.boxAt(gate.half * 2 + 0.6, 0.35, 0.4, [0, 1.4, 0.2], [0, 0, 0.12], "#9c7650");
  } else {
    for (let x = -gate.half; x <= gate.half; x += 0.8) {
      between(b, [x, 0, 0], [x + 0.7, 2.7, 0.12], 0.26, 0.12, gate.kind === "reeds" ? "#447965" : "#5b6540", 5);
      between(b, [x, 1, -0.1], [x - 0.8, 2.3, -0.1], 0.2, 0.08, "#7e8750", 5);
    }
  }
  return b.build();
}
