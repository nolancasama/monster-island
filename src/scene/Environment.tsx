import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { rt } from "../game/runtime";
import {
  BOULDERS,
  FOREST_SIGN,
  PALMS,
  RIVER,
  RIVER_Y,
  SEA_Y,
  X_EAST,
  X_WEST,
  Z_NORTH,
  CLIFF_Z,
  VOLCANO,
  forestMask,
  groundY,
  ravineDepth,
  shoreZ
} from "../game/world/island";
import { trailDistance } from "./Forest";
import { makeRng } from "../game/logic/rng";
import { flatMat, occluderMat, smoothMat } from "./materials";
import { bouldersGeometry, bushGeometry, jungleTreeGeometry, palmsGeometry, rockGeometry } from "./models/nature";
import { PartBuilder } from "./partBuilder";

const sstep = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ------------------------------------------------------------------ sky

/** Sky dome, fog and the fixed light set (hemisphere + sun + ambient): bright tropical midday. */
export function SkyAndLights() {
  const { scene, gl } = useThree();
  const dome = useMemo(() => {
    const g = new THREE.SphereGeometry(420, 24, 14);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const top = new THREE.Color("#3f97ea");
    const horizon = new THREE.Color("#cdeeff");
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const h = Math.max(0, pos.getY(i) / 420);
      c.copy(horizon).lerp(top, Math.pow(Math.min(1, h * 1.7), 0.7));
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g;
  }, []);
  const domeMat = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }), []);
  useEffect(() => {
    const bg = new THREE.Color("#cdeeff");
    scene.background = bg;
    scene.fog = new THREE.Fog("#cdeeff", 70, 260);
    gl.setClearColor(bg);
  }, [scene, gl]);
  return (
    <group>
      <mesh geometry={dome} material={domeMat} renderOrder={-10} />
      <mesh position={[-140, 260, 200]} renderOrder={-9}>
        <circleGeometry args={[16, 24]} />
        <meshBasicMaterial color="#fff6dc" fog={false} />
      </mesh>
      <Clouds />
      <hemisphereLight args={["#d8ecff", "#c8a878", 1.15]} />
      <directionalLight color="#fff4e0" intensity={2.3} position={[-40, 55, 30]} />
      <ambientLight color="#ffffff" intensity={0.16} />
    </group>
  );
}

function Clouds() {
  const geo = useMemo(() => {
    const b = new PartBuilder(0);
    const rand = makeRng(77);
    for (let i = 0; i < 9; i++) {
      const a = -0.6 + (i / 9) * 4.2 + rand() * 0.3;
      const r = 230 + rand() * 60;
      const x = Math.sin(a) * r;
      const z = -Math.cos(a) * r;
      const y = 60 + rand() * 40;
      for (let k = 0; k < 4; k++) b.sphere(10 + rand() * 8, x + (k - 1.5) * 12, y + rand() * 5, z + rand() * 6, "#ffffff", [1.4, 0.6, 1], 8);
    }
    return b.build();
  }, []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity: 0.92 }), []);
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (ref.current) ref.current.rotation.y = rt.time * 0.004;
  });
  return <mesh ref={ref} geometry={geo} material={mat} renderOrder={-8} />;
}

// ---------------------------------------------------------------- terrain

const SAND = new THREE.Color("#f4dfae");
const WET = new THREE.Color("#cfac78");
const UNDER = new THREE.Color("#b9a678");
const GRASS = new THREE.Color("#93c464");
const JUNGLE = new THREE.Color("#4f8f45");
const MUD = new THREE.Color("#a58a5c");
const PATH = new THREE.Color("#e2c78f");
const MOSS = new THREE.Color("#6da64e");
const TRAIL_DIRT = new THREE.Color("#b89a66");
const ROCK = new THREE.Color("#8a7c6a");

/** The walking path that ties the beach together (camp → grove → pass → pier → river → stone). */
export const PATH_POINTS: Array<[number, number]> = [
  [-25, 2.6],
  [-18, 0.4],
  [-11, -1.2],
  [-5.5, 1.2],
  [3.5, 1.4],
  [11, 2.6],
  [16, 0.4],
  [20.4, -1],
  [28.6, -1],
  [32, -2]
];

function pathDistance(x: number, z: number): number {
  let best = Infinity;
  for (let i = 1; i < PATH_POINTS.length; i++) {
    const [ax, az] = PATH_POINTS[i - 1];
    const [bx, bz] = PATH_POINTS[i];
    const dx = bx - ax;
    const dz = bz - az;
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(ax + dx * u - x, az + dz * u - z));
  }
  return best;
}

function terrainGeometry(): THREE.BufferGeometry {
  // From the sea (z 19) to well beyond the cliff top (z -91), 1 m cells.
  const g = new THREE.PlaneGeometry(150, 110, 150, 110);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, -36);
  const p = g.attributes.position;
  const colors = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  const rand = makeRng(3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    p.setY(i, groundY(x, z));
    const d = z - shoreZ(x);
    c.copy(SAND);
    c.lerp(WET, sstep(-2.6, -0.5, d));
    c.lerp(UNDER, sstep(0, 3, d));
    c.lerp(GRASS, sstep(-4.5, -7.5, z));
    c.lerp(JUNGLE, sstep(Z_NORTH + 1, Z_NORTH - 3, z));
    const r = Math.min(x - RIVER.x0, RIVER.x1 - x);
    c.lerp(MUD, sstep(-1.6, 0.2, r));
    if (r < -1.2 && z > Z_NORTH) c.lerp(PATH, (1 - sstep(0.9, 1.7, pathDistance(x, z))) * 0.9);
    // The forest: mossy floor, a trodden trail, bare rock in the ravine and on the cliff.
    const f = forestMask(x, z);
    if (f > 0) {
      c.lerp(MOSS, f);
      c.lerp(TRAIL_DIRT, f * (1 - sstep(0.7, 1.5, trailDistance(x, z))) * 0.85);
      c.lerp(ROCK, f * Math.max(sstep(0.3, 1.2, ravineDepth(z)), z < CLIFF_Z + 0.2 && z > CLIFF_Z - 1.2 ? 1 : 0));
    }
    const k = 0.95 + rand() * 0.07;
    colors[i * 3] = c.r * k;
    colors[i * 3 + 1] = c.g * k;
    colors[i * 3 + 2] = c.b * k;
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

export function Terrain() {
  const geo = useMemo(terrainGeometry, []);
  return <mesh geometry={geo} material={flatMat} />;
}

// ------------------------------------------------------------------ sea

export function Sea() {
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.9 }), []);
  const near = useMemo(() => {
    const g = new THREE.PlaneGeometry(200, 90, 60, 30);
    g.rotateX(-Math.PI / 2);
    g.translate(0, SEA_Y, 50);
    const p = g.attributes.position;
    const colors = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    const shallow = new THREE.Color("#6fe0d6");
    const mid = new THREE.Color("#2fb0d2");
    const deep = new THREE.Color("#1e74b4");
    for (let i = 0; i < p.count; i++) {
      const d = p.getZ(i) - shoreZ(p.getX(i));
      c.copy(shallow).lerp(mid, sstep(1, 12, d)).lerp(deep, sstep(12, 60, d));
      colors.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g;
  }, []);
  const base = useMemo(() => Float32Array.from(near.attributes.position.array as Float32Array), [near]);
  const far = useMemo(() => {
    const g = new THREE.PlaneGeometry(1600, 900, 1, 1);
    g.rotateX(-Math.PI / 2);
    g.translate(0, SEA_Y - 0.05, 0);
    const colors = new Float32Array(12);
    const c = new THREE.Color("#1e74b4");
    for (let i = 0; i < 4; i++) colors.set([c.r, c.g, c.b], i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g;
  }, []);
  const foam = useFoam();
  useFrame(() => {
    const t = rt.time;
    const p = near.attributes.position as THREE.BufferAttribute;
    const arr = p.array as Float32Array;
    for (let i = 0; i < p.count; i++) {
      const x = base[i * 3];
      const z = base[i * 3 + 2];
      const k = sstep(-1, 8, z - shoreZ(x));
      arr[i * 3 + 1] = SEA_Y + k * (0.1 * Math.sin(x * 0.31 + t * 1.1) + 0.07 * Math.sin(z * 0.45 - t * 1.4));
    }
    p.needsUpdate = true;
    foam.update(t);
  });
  return (
    <group>
      <mesh geometry={near} material={mat} />
      <mesh geometry={far} material={mat} />
      <mesh geometry={foam.geo} material={foam.mat} />
    </group>
  );
}

/** A foam ribbon washing up and down the sand along the waterline. */
function useFoam() {
  return useMemo(() => {
    const N = 120;
    const x0 = -60;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array((N + 1) * 2 * 3), 3));
    const idx: number[] = [];
    for (let i = 0; i < N; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    g.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ color: "#fbfdff", transparent: true, opacity: 0.6, depthWrite: false });
    const update = (t: number) => {
      const phase = t * 0.55;
      const wash = Math.sin(phase);
      const off = 0.1 - (wash * 0.5 + 0.5) * 1.2;
      mat.opacity = 0.5 + 0.35 * (0.5 + 0.5 * Math.cos(phase));
      const arr = g.attributes.position.array as Float32Array;
      for (let i = 0; i <= N; i++) {
        const x = x0 + i;
        const inRiver = x > RIVER.x0 - 0.5 && x < RIVER.x1 + 0.5;
        const zc = shoreZ(x) + off + 0.3 * Math.sin(x * 0.7 + t * 0.8);
        const ww = inRiver ? 0 : 0.1 * Math.max(0.2, 0.7 + 0.6 * Math.sin(x * 1.3 + t * 0.9));
        for (let s = 0; s < 2; s++) {
          const z = zc + (s ? ww : -ww);
          arr.set([x, Math.max(SEA_Y + 0.05, groundY(x, z) + 0.03), z], (i * 2 + s) * 3);
        }
      }
      g.attributes.position.needsUpdate = true;
    };
    return { geo: g, mat, update };
  }, []);
}

// ---------------------------------------------------------------- river

function flowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#3fb5c8";
  g.fillRect(0, 0, 64, 256);
  const rand = makeRng(5);
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = `rgba(255,255,255,${0.18 + rand() * 0.3})`;
    g.lineWidth = 1.5 + rand() * 2;
    const x = rand() * 64;
    const y = rand() * 256;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + 4, y + 12, x - 2, y + 22 + rand() * 18);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The river: a flowing surface from the jungle to the sea. */
export function River() {
  const tex = useMemo(() => {
    const t = flowTexture();
    t.repeat.set(2, 9);
    return t;
  }, []);
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ map: tex, transparent: true, opacity: 0.88, depthWrite: false }), [tex]);
  useFrame(() => {
    tex.offset.y = -rt.time * 0.18;
  });
  const z0 = -45;
  const z1 = 16;
  const w = RIVER.x1 - RIVER.x0 + 0.8;
  return (
    <mesh material={mat} position={[(RIVER.x0 + RIVER.x1) / 2, RIVER_Y, (z0 + z1) / 2]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
      <planeGeometry args={[w, z1 - z0]} />
    </mesh>
  );
}

// -------------------------------------------------------------- vegetation

interface Spot {
  x: number;
  z: number;
  s: number;
  r: number;
  tint: number;
}

function jungleSpots(): { trees: Spot[]; bushes: Spot[] } {
  const rand = makeRng(42);
  const trees: Spot[] = [];
  const bushes: Spot[] = [];
  const riverGap = (x: number) => x > RIVER.x0 - 1.2 && x < RIVER.x1 + 1.2;
  // The jungle wall: dense rows beyond the north edge of the beach.
  for (let row = 0; row < 4; row++) {
    for (let x = X_WEST - 14; x < X_EAST + 14; x += 2.6 + rand() * 1.6) {
      const px = x + (rand() - 0.5) * 1.4;
      const pz = Z_NORTH - 2.6 - row * 3.4 - rand() * 1.4;
      if (riverGap(px)) continue;
      // The forest path cuts through the wall.
      if (forestMask(px, pz) > 0.02) continue;
      trees.push({ x: px, z: pz, s: 0.95 + rand() * 0.55 + row * 0.08, r: rand() * 6.28, tint: 0.85 + rand() * 0.25 });
    }
  }
  // West and east ends of the beach.
  for (let i = 0; i < 26; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side < 0 ? X_WEST - 3 - rand() * 12 : X_EAST + 3 + rand() * 12;
    const z = Z_NORTH + rand() * 16;
    if (z > shoreZ(x) - 2) continue;
    trees.push({ x, z, s: 0.9 + rand() * 0.5, r: rand() * 6.28, tint: 0.85 + rand() * 0.25 });
  }
  // Undergrowth along the jungle edge.
  for (let x = X_WEST - 6; x < X_EAST + 6; x += 1.8 + rand() * 2.2) {
    if (riverGap(x)) continue;
    if (Math.abs(x - FOREST_SIGN.x) < 1.2 || forestMask(x, Z_NORTH - 1.2) > 0.02) continue;
    bushes.push({ x, z: Z_NORTH - 0.9 - rand() * 0.8, s: 0.7 + rand() * 0.6, r: rand() * 6, tint: 0.85 + rand() * 0.3 });
  }
  return { trees, bushes };
}

function Instanced({ geometry, spots, material = occluderMat }: { geometry: THREE.BufferGeometry; spots: Spot[]; material?: THREE.Material }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    spots.forEach((s, i) => {
      o.position.set(s.x, groundY(s.x, s.z), s.z);
      o.rotation.set(0, s.r, 0);
      o.scale.setScalar(s.s);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, c.setRGB(s.tint, s.tint * (0.95 + (i % 3) * 0.04), s.tint));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [spots]);
  return <instancedMesh ref={ref} args={[geometry, material, spots.length]} frustumCulled={false} />;
}

export function Vegetation() {
  const tree = useMemo(jungleTreeGeometry, []);
  const bush = useMemo(bushGeometry, []);
  const { trees, bushes } = useMemo(jungleSpots, []);
  const palms = useMemo(() => PALMS.map((p, i) => palmsGeometry([p], 7 + i)), []);
  const details = useMemo(beachDetails, []);
  return (
    <group>
      {palms.map((g, i) => (
        <mesh key={i} geometry={g} material={occluderMat} />
      ))}
      <Instanced geometry={tree} spots={trees} />
      <Instanced geometry={bush} spots={bushes} material={flatMat} />
      <mesh geometry={details} material={flatMat} />
    </group>
  );
}

/** Shells, starfish, flowers and grass tufts, merged into one draw call. */
function beachDetails(): THREE.BufferGeometry {
  const b = new PartBuilder(0.1);
  const rand = makeRng(99);
  const onLand = (x: number, z: number) => z < shoreZ(x) - 0.6 && !(x > RIVER.x0 - 1.5 && x < RIVER.x1 + 1.5);
  // Shells and starfish near the water.
  for (let i = 0; i < 46; i++) {
    const x = X_WEST + rand() * (X_EAST - X_WEST);
    const z = shoreZ(x) - 1 - rand() * 4.5;
    if (!onLand(x, z) || (x > -3.6 && x < 1.6)) continue;
    const y = groundY(x, z);
    if (i % 4 === 0) {
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        b.add(new THREE.ConeGeometry(0.05, 0.16, 4), "#ff8a6a", [x + Math.cos(a) * 0.07, y + 0.02, z + Math.sin(a) * 0.07], [Math.PI / 2, 0, -a + Math.PI / 2], [1, 1, 0.4]);
      }
    } else {
      b.sphere(0.07 + rand() * 0.04, x, y + 0.02, z, i % 3 ? "#fff1e2" : "#f7c6c0", [1, 0.45, 0.8], 6);
    }
  }
  // Flowers and grass tufts in the grassy band.
  const petals = ["#ff6b8b", "#ffd84a", "#ffffff", "#c58bff", "#ff9e3d"];
  for (let i = 0; i < 90; i++) {
    const x = X_WEST + rand() * (X_EAST - X_WEST);
    const z = Z_NORTH + 0.4 + rand() * 5.5;
    if (!onLand(x, z) || (x > -3.6 && x < 1.6)) continue;
    const y = groundY(x, z);
    if (i % 3 === 0) {
      const c = petals[i % petals.length];
      b.cyl(0.015, 0.015, 0.28, x, y, z, "#4f9a3a", 4);
      b.sphere(0.07, x, y + 0.3, z, c, [1, 0.5, 1], 6);
      b.sphere(0.03, x, y + 0.33, z, "#ffe066", [1, 1, 1], 5);
    } else {
      for (let k = 0; k < 3; k++) {
        b.add(new THREE.ConeGeometry(0.05, 0.38, 3), "#6faa45", [x + (k - 1) * 0.07, y + 0.17, z], [0, 0, (k - 1) * 0.35]);
      }
    }
  }
  // Driftwood.
  b.cylAt(0.13, 1.8, [6, groundY(6, 8.4) + 0.12, 8.4], [0, 0.4, Math.PI / 2], "#b29676", 7);
  b.cylAt(0.11, 1.4, [-15, groundY(-15, 8.2) + 0.1, 8.2], [0, -0.7, Math.PI / 2], "#a68a6a", 7);
  return b.build();
}

// ------------------------------------------------------------ rocks & far land

export function Rocks() {
  const geo = useMemo(() => bouldersGeometry(BOULDERS), []);
  return <mesh geometry={geo} material={occluderMat} />;
}

/** Hills, a smoking volcano and the far headlands: the rest of the island, for later phases. */
export function FarLand() {
  const geo = useMemo(() => {
    const b = new PartBuilder(6);
    const hills: Array<[number, number, number, number, string]> = [
      [-60, -48, 26, 16, "#4f8f4a"],
      [-22, -58, 30, 20, "#457f42"],
      [4, -72, 28, 22, "#4a8a45"],
      [52, -64, 16, 14, "#518f49"],
      [-78, -20, 22, 10, "#5a9a52"],
      [80, -24, 22, 10, "#5a9a52"]
    ];
    hills.forEach(([x, z, r, h, c], i) => b.add(rockGeometry(r, h, 20 + i, 1), c, [x, -1, z]));
    // Ridges beyond the forest, sitting on the rising jungle: they close the view north from the cliff top.
    const ridges: Array<[number, number, number, number, string]> = [
      [8, -84, 26, 16, "#4a8a45"],
      [-26, -80, 30, 14, "#457f42"],
      [-56, -70, 26, 12, "#4f8f4a"]
    ];
    ridges.forEach(([x, z, r, h, c], i) => b.add(rockGeometry(r, h, 40 + i, 1), c, [x, groundY(x, z) - 3, z]));
    // The volcano (Phase 3), north-east.
    const v = VOLCANO;
    // A truncated cone, so the crater rim sits on its top seen from the cliff too.
    b.add(new THREE.CylinderGeometry(8.2, 30, 46, 9, 1, true), "#7a5a4a", [v.x, 20, v.z]);
    b.add(new THREE.CylinderGeometry(7.5, 9, 3, 9), "#5a4038", [v.x, 42.5, v.z]);
    b.add(new THREE.CylinderGeometry(6.8, 6.8, 0.6, 9), "#ff7a2a", [v.x, 44, v.z]);
    b.add(rockGeometry(18, 10, 31, 1), "#6f9a4a", [40, 2, -78]);
    // Headlands at both ends.
    b.add(rockGeometry(9, 6, 50, 1), "#8f8a7f", [X_WEST - 8, -1, 9]);
    b.add(rockGeometry(9, 6, 52, 1), "#8f8a7f", [X_EAST + 9, -1, 10]);
    return b.build();
  }, []);
  return (
    <group>
      <mesh geometry={geo} material={flatMat} />
      <Smoke />
    </group>
  );
}

/** Slow puffs over the volcano crater. */
function Smoke() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ color: "#d9d4cf", transparent: true, opacity: 0.75, depthWrite: false }), []);
  const o = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    for (let i = 0; i < 6; i++) {
      const k = (rt.time * 0.05 + i / 6) % 1;
      o.position.set(VOLCANO.x + k * 18, 46 + k * 30, VOLCANO.z + k * 6);
      o.scale.setScalar(3 + k * 9);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, mat, 6]} frustumCulled={false}>
      <icosahedronGeometry args={[1, 1]} />
    </instancedMesh>
  );
}

export { smoothMat };
