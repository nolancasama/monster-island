import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { rt } from "../game/runtime";
import {
  BRAMBLE,
  BRIDGE,
  CLIFF_HEIGHT,
  CLIFF_TOP_SPOT,
  CLIFF_Z,
  CLIFF_WALL,
  FOREST_AREAS,
  FOREST_BERRY_BUSHES,
  FOREST_TREE_PLACEMENTS,
  GLADE,
  PUFF_TREE,
  RAVINE,
  RIVER,
  ROPE,
  VOLCANO,
  forestBase,
  forestMask,
  groundY,
  volcanoMask
} from "../game/world/island";
import { makeRng } from "../game/logic/rng";
import { flatMat, occluderMat, smoothMat } from "./materials";
import { berryBushGeometry } from "./models/props";
import { jungleTreeGeometry } from "./models/nature";
import {
  brambleGeometry,
  bridgeFrameGeometry,
  bridgeVinesGeometry,
  fernGeometry,
  forestTreeGeometry,
  puffTreeGeometry,
  rockWallGeometry,
  ropeCoilGeometry,
  ropeHangingGeometry
} from "./models/forest";

/**
 * The Phase 2 forest: big trees in the clearings, the jungle wall around
 * them, Puff's tree, the broken bridge over the ravine, the high cliff with
 * its rope, and the bramble that closes the path until the beach is done.
 */

const at = (x: number, z: number, dy = 0): [number, number, number] => [x, groundY(x, z) + dy, z];

interface Spot {
  x: number;
  z: number;
  s: number;
  r: number;
  tint: number;
}

function InstancedSpots({ geometry, spots, material }: { geometry: THREE.BufferGeometry; spots: Spot[]; material: THREE.Material }) {
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
      m.setColorAt(i, c.setRGB(s.tint, s.tint * (0.96 + (i % 3) * 0.03), s.tint));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [spots]);
  return <instancedMesh ref={ref} args={[geometry, material, spots.length]} />;
}

/** The jungle around the forest clearings, and ferns on the open floor. */
function forestSpots(): { edge: Spot[]; ferns: Spot[] } {
  const rand = makeRng(64);
  const edge: Spot[] = [];
  const ferns: Spot[] = [];
  for (let z = -86; z < -10; z += 2.6) {
    for (let x = 22; x < 56; x += 2.6) {
      const px = x + (rand() - 0.5) * 1.8;
      const pz = z + (rand() - 0.5) * 1.8;
      if (px > RIVER.x0 - 1.4 && px < RIVER.x1 + 1.4) continue;
      // The beach's own jungle wall covers its first rows.
      if (pz > -13 && (px < 30 || px > 38)) continue;
      const f = forestMask(px, pz);
      if (f > 0.02) continue;
      if (volcanoMask(px, pz) > 0.01) continue;
      if (inVista(px, pz)) continue;
      edge.push({ x: px, z: pz, s: 0.95 + rand() * 0.6, r: rand() * 6.28, tint: 0.8 + rand() * 0.25 });
    }
  }
  for (let i = 0; i < 110; i++) {
    const a = FOREST_AREAS[1 + (i % 2)];
    const x = a.x0 + rand() * (a.x1 - a.x0);
    const z = a.z0 + rand() * (a.z1 - a.z0);
    if (forestMask(x, z) < 0.9 || groundY(x, z) < forestBase(x, z) - 0.3) continue;
    // Keep the trail clear.
    if (trailDistance(x, z) < 1.6) continue;
    ferns.push({ x, z, s: 0.7 + rand() * 0.6, r: rand() * 6.28, tint: 0.85 + rand() * 0.25 });
  }
  return { edge, ferns };
}

/** The view from the cliff top to the volcano stays clear of trees (the Phase 2 ending looks along it). */
function inVista(x: number, z: number): boolean {
  const vx = VOLCANO.x - CLIFF_TOP_SPOT.x;
  const vz = VOLCANO.z - CLIFF_TOP_SPOT.z;
  const dx = x - CLIFF_TOP_SPOT.x;
  const dz = z - CLIFF_TOP_SPOT.z;
  const along = (dx * vx + dz * vz) / Math.hypot(vx, vz);
  if (along < 0) return false;
  const across = Math.abs(dx * vz - dz * vx) / Math.hypot(vx, vz);
  return across < 3 + along * 0.32;
}

/** The trodden trail through the forest (beach → bridge → Puff → rope). */
export const TRAIL: Array<[number, number]> = [
  [33.8, -7.5],
  [33.8, -16],
  [36.4, -21.5],
  [BRIDGE.x, BRIDGE.z1 + 0.2],
  [BRIDGE.x, BRIDGE.z0 - 0.2],
  [38.6, -32.5],
  [37.6, -38.5],
  [ROPE.x, ROPE.z + 0.4]
];

export function trailDistance(x: number, z: number): number {
  let best = Infinity;
  for (let i = 1; i < TRAIL.length; i++) {
    const [ax, az] = TRAIL[i - 1];
    const [bx, bz] = TRAIL[i];
    const dx = bx - ax;
    const dz = bz - az;
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(ax + dx * u - x, az + dz * u - z));
  }
  return best;
}

function Trees() {
  const tree = useMemo(forestTreeGeometry, []);
  const jungle = useMemo(jungleTreeGeometry, []);
  const fern = useMemo(fernGeometry, []);
  const { edge, ferns } = useMemo(forestSpots, []);
  const big = useMemo<Spot[]>(() => FOREST_TREE_PLACEMENTS.map((t) => ({ x: t.x, z: t.z, s: t.scale, r: t.yaw, tint: t.tint })), []);
  const puffTree = useMemo(puffTreeGeometry, []);
  const berry = useMemo(berryBushGeometry, []);
  return (
    <group>
      <InstancedSpots geometry={tree} spots={big} material={occluderMat} />
      <InstancedSpots geometry={jungle} spots={edge} material={occluderMat} />
      <InstancedSpots geometry={fern} spots={ferns} material={flatMat} />
      <mesh geometry={puffTree} material={occluderMat} position={at(PUFF_TREE.x, PUFF_TREE.z, -0.1)} />
      {FOREST_BERRY_BUSHES.map((b, i) => (
        <mesh key={i} geometry={berry} material={flatMat} position={at(b.x, b.z)} rotation={[0, i * 2.1, 0]} />
      ))}
    </group>
  );
}

/** The ravine's rocky sides and the broken bridge (Leafy's vines fill the gap). */
function Ravine() {
  const len = BRIDGE.z1 - BRIDGE.z0;
  const gap: [number, number] = [-len * 0.3, -len * 0.72];
  const frame = useMemo(() => bridgeFrameGeometry(len, BRIDGE.half, gap), [len]);
  const vines = useMemo(() => bridgeVinesGeometry(len, BRIDGE.half), [len]);
  const walls = useMemo(() => {
    const colors = ["#8a7a66", "#7a6c5a", "#968670"];
    return [
      rockWallGeometry(GLADE.x1 - GLADE.x0 + 4, 2.6, 0.6, 140, colors),
      rockWallGeometry(GLADE.x1 - GLADE.x0 + 4, 2.6, 0.6, 150, colors)
    ];
  }, []);
  const vineRef = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const v = vineRef.current;
    if (!v) return;
    // The vines weave out from the middle of the gap.
    const k = Math.max(0.001, rt.bridge);
    v.scale.set(Math.min(1, k * 1.4), Math.min(1, 0.3 + k), k);
    v.position.z = (-len / 2) * (1 - k);
    v.visible = rt.bridge > 0.01;
  });
  const deckY = (z: number) => forestBase(BRIDGE.x, z) + 0.12;
  const y0 = deckY(BRIDGE.z1);
  const tilt = Math.atan2(deckY(BRIDGE.z0) - y0, len);
  const wallY = (z: number) => forestBase(GLADE.x0, z) - 2.2;
  return (
    <group>
      <group position={[BRIDGE.x, y0, BRIDGE.z1]} rotation={[tilt, 0, 0]}>
        <mesh geometry={frame} material={smoothMat} />
      </group>
      <group position={[BRIDGE.x, y0, BRIDGE.z1]} rotation={[tilt, 0, 0]}>
        <mesh ref={vineRef} geometry={vines} material={smoothMat} />
      </group>
      <mesh geometry={walls[0]} material={flatMat} position={[GLADE.x0 - 2, wallY(RAVINE.z1), RAVINE.z1 + 0.2]} />
      <mesh geometry={walls[1]} material={flatMat} position={[GLADE.x0 - 2, wallY(RAVINE.z0), RAVINE.z0 - 0.2]} />
    </group>
  );
}

/** The high cliff, the rope and the cliff top's rockfall. */
function Cliff() {
  const wall = useMemo(() => rockWallGeometry(CLIFF_WALL.length, CLIFF_HEIGHT + 4, CLIFF_WALL.depth, 160, ["#8f8578", "#7d7468", "#9a9082"]), []);
  const coil = useMemo(ropeCoilGeometry, []);
  const hang = useMemo(() => ropeHangingGeometry(CLIFF_HEIGHT + 0.4), []);
  const coilRef = useRef<THREE.Mesh>(null);
  const hangRef = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (coilRef.current) coilRef.current.visible = rt.rope < 0.5;
    const h = hangRef.current;
    if (h) {
      h.visible = rt.rope > 0.01;
      // The rope unrolls down the cliff from the top.
      h.scale.set(1, Math.max(0.001, rt.rope), 1);
      h.position.y = groundY(ROPE.x, ROPE.z) + (1 - rt.rope) * (CLIFF_HEIGHT + 0.4);
    }
  });
  const baseY = forestBase(30, CLIFF_Z + 0.4);
  return (
    <group>
      <mesh geometry={wall} material={flatMat} position={[CLIFF_WALL.x, baseY - 1, CLIFF_WALL.z]} />
      <mesh ref={coilRef} geometry={coil} material={smoothMat} position={at(ROPE.x + 0.9, ROPE.z + 0.4)} />
      <mesh ref={hangRef} geometry={hang} material={smoothMat} position={[ROPE.x, groundY(ROPE.x, ROPE.z), ROPE.z - 0.25]} />
    </group>
  );
}

/** Thorny bramble on the forest path: shrinks into the ground when the forest opens. */
function Bramble() {
  const geo = useMemo(brambleGeometry, []);
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    m.visible = rt.bramble > 0.01;
    m.scale.set(1, Math.max(0.001, rt.bramble), 1);
  });
  return <mesh ref={ref} geometry={geo} material={flatMat} position={at(BRAMBLE.x, BRAMBLE.z)} />;
}

export function Forest() {
  return (
    <group>
      <Trees />
      <Ravine />
      <Cliff />
      <Bramble />
    </group>
  );
}
