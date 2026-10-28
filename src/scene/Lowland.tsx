import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { rt } from "../game/runtime";
import { getGame } from "../game/store";
import { NPCS, NPC_OF } from "../game/data/town";
import { CAMP2, CANOPY_GAPS, CHESTS, POND_Y, SERVICES, SHORTCUT_GATE, type ServiceId } from "../game/world/lowland";
import { TUNNEL, groundY } from "../game/world/island";
import { additiveSprite, flatMat, occluderMat, smoothMat } from "./materials";
import {
  chestBaseGeometry, chestLidGeometry, cliffFaceGeometry, cliffRopeGeometry, gateBarsGeometry, giantFernGeometry, lilyPadGeometry,
  lowlandPropsGeometry, lowlandSpots, lowlandTerrainTiles, lowlandWaterGeometry, npcGeometry, primevalTreeGeometry, reedGeometry,
  ropeBridgeGeometry, thornsGeometry, townGeometry, townSigns, treeFernGeometry, vineBridgeGeometry, type Spot
} from "./models/lowland";

/**
 * Act 2's lowland below the sanctuary. Drawn only when it can be seen (from
 * the sanctuary or down in it), in tiles so the frustum skips what is out of
 * view, and with vegetation tiles beyond the fog switched off.
 */

const TILE = 48;
const FAR = 175;

/** Instanced vegetation split into tiles, each with its own bounds (frustum culled) and a distance cut-off. */
function TiledInstances({ geometry, spots, material, far = FAR }: { geometry: THREE.BufferGeometry; spots: Spot[]; material: THREE.Material; far?: number }) {
  const tiles = useMemo(() => {
    const map = new Map<string, Spot[]>();
    for (const s of spots) {
      const key = `${Math.floor(s.x / TILE)},${Math.floor(s.z / TILE)}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return [...map.values()];
  }, [spots]);
  return (
    <>
      {tiles.map((t, i) => (
        <Tile key={i} geometry={geometry} spots={t} material={material} far={far} />
      ))}
    </>
  );
}

function Tile({ geometry, spots, material, far }: { geometry: THREE.BufferGeometry; spots: Spot[]; material: THREE.Material; far: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const centre = useMemo(() => {
    const c = new THREE.Vector3();
    for (const s of spots) c.add(new THREE.Vector3(s.x, 0, s.z));
    return c.multiplyScalar(1 / spots.length);
  }, [spots]);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    spots.forEach((s, i) => {
      o.position.set(s.x, groundY(s.x, s.z) - 0.05, s.z);
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
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const c = rt.camera.pos;
    m.visible = Math.hypot(c.x - centre.x, c.z - centre.z) < far + TILE * 0.7;
  });
  return <instancedMesh ref={ref} args={[geometry, material, spots.length]} />;
}

/** Small details are drawn only near the camera (they are specks from further away). */
const DETAIL = 85;
const near = (x: number, z: number) => Math.hypot(rt.camera.pos.x - x, rt.camera.pos.z - z) < DETAIL;

function Chest({ id }: { id: string }) {
  const c = CHESTS.find((x) => x.id === id)!;
  const base = useMemo(chestBaseGeometry, []);
  const lid = useMemo(chestLidGeometry, []);
  const lidRef = useRef<THREE.Group>(null);
  const glow = useMemo(() => additiveSprite("#ffe680", 0.55), []);
  const glowRef = useRef<THREE.Sprite>(null);
  const root = useRef<THREE.Group>(null);
  useFrame(() => {
    if (root.current) root.current.visible = near(c.x, c.z);
    const k = rt.chestLid.get(id) ?? 0;
    if (lidRef.current) lidRef.current.rotation.x = -k * 1.9;
    if (glowRef.current) {
      const open = getGame().progress.act2.chests.includes(id);
      glowRef.current.visible = !open;
      glowRef.current.scale.setScalar(1.3 + Math.sin(rt.time * 3) * 0.12);
    }
  });
  const y = id === "isletChest" ? POND_Y + 0.15 : groundY(c.x, c.z);
  return (
    <group ref={root} position={[c.x, y, c.z]} rotation={[0, c.yaw, 0]}>
      <mesh geometry={base} material={flatMat} />
      <group ref={lidRef} position={[0, 0.5, -0.33]}>
        <mesh geometry={lid} material={flatMat} />
      </group>
      <sprite ref={glowRef} position={[0, 1.1, 0]} material={glow} />
    </group>
  );
}

function Keeper({ service }: { service: ServiceId }) {
  const def = NPCS[NPC_OF[service]];
  const geo = useMemo(() => npcGeometry(def), [def]);
  const ref = useRef<THREE.Group>(null);
  const k = SERVICES[service].keeper;
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    g.visible = near(k.x, k.z);
    const p = rt.player;
    const close = Math.hypot(p.x - k.x, p.z - k.z) < 7;
    const want = close ? Math.atan2(p.x - k.x, p.z - k.z) : k.yaw;
    let d = want - g.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    g.rotation.y += d * 0.08;
    g.position.y = groundY(k.x, k.z) + Math.abs(Math.sin(rt.time * 1.8 + k.x)) * 0.02;
  });
  return (
    <group ref={ref} position={[k.x, groundY(k.x, k.z), k.z]} rotation={[0, k.yaw, 0]}>
      <mesh geometry={geo} material={smoothMat} />
    </group>
  );
}

/** Lily pads rise, the bridges grow and unroll, the gate's thorns burn and the bars lift. */
function Unlocks() {
  const lilies = useMemo(lilyPadGeometry, []);
  const g1 = CANOPY_GAPS.canopyVines, g2 = CANOPY_GAPS.canopyRope;
  const vines = useMemo(() => vineBridgeGeometry(g1.z1 - g1.z0 + 1.4), [g1]);
  const rope = useMemo(() => ropeBridgeGeometry(g2.z1 - g2.z0 + 1.4), [g2]);
  const bars = useMemo(gateBarsGeometry, []);
  const thorns = useMemo(thornsGeometry, []);
  const padRef = useRef<THREE.Mesh>(null);
  const bRef = useRef<THREE.Mesh>(null);
  const tRef = useRef<THREE.Mesh>(null);
  const deck = (g: { x: number; z0: number; z1: number }) => groundY(g.x, g.z1 + 1.4) + 0.06;
  useFrame(() => {
    const u = rt.act2Unlock;
    if (padRef.current) padRef.current.position.y = POND_Y - 0.6 + (u.groveLilies ?? 0) * 0.66;
    const gk = u.causewayGate ?? 0;
    if (tRef.current) {
      tRef.current.visible = gk < 0.6;
      tRef.current.scale.setScalar(Math.max(0.01, 1 - gk * 1.6));
    }
    if (bRef.current) bRef.current.position.y = groundY(SHORTCUT_GATE.x, SHORTCUT_GATE.z) + Math.max(0, gk - 0.4) / 0.6 * 2.5;
  });
  return (
    <group>
      <mesh ref={padRef} geometry={lilies} material={flatMat} />
      {/* Each bridge grows from the near (south) end toward the far end. */}
      <BridgeGrow geometry={vines} at={[g1.x, deck(g1), g1.z1 + 0.7]} len={g1.z1 - g1.z0 + 1.4} which="canopyVines" />
      <BridgeGrow geometry={rope} at={[g2.x, deck(g2), g2.z1 + 0.7]} len={g2.z1 - g2.z0 + 1.4} which="canopyRope" />
      <group position={[SHORTCUT_GATE.x, 0, SHORTCUT_GATE.z]}>
        <mesh ref={bRef} geometry={bars} material={flatMat} />
        <mesh ref={tRef} geometry={thorns} material={flatMat} position={[0, groundY(SHORTCUT_GATE.x, SHORTCUT_GATE.z), 0]} />
      </group>
    </group>
  );
}

/** A bridge that grows across its gap from the near end (scale along -z from the anchor). */
function BridgeGrow({ geometry, at, len, which }: { geometry: THREE.BufferGeometry; at: [number, number, number]; len: number; which: "canopyVines" | "canopyRope" }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const k = rt.act2Unlock[which] ?? 0;
    const g = ref.current;
    if (!g) return;
    g.visible = k > 0.01;
    g.scale.set(1, 1, Math.max(0.01, k));
  });
  return (
    <group ref={ref} position={at}>
      <mesh geometry={geometry} material={flatMat} position={[0, 0, -len / 2]} />
    </group>
  );
}

function CampFire() {
  const mat = useMemo(() => additiveSprite("#ff9a3a", 0.85), []);
  const ref = useRef<THREE.Sprite>(null);
  useFrame(() => {
    if (ref.current) ref.current.scale.setScalar(1.1 + Math.sin(rt.time * 11) * 0.12 + Math.sin(rt.time * 7.3) * 0.08);
  });
  const f = CAMP2.fire;
  return <sprite ref={ref} position={[f.x, groundY(f.x, f.z) + 0.55, f.z]} material={mat} />;
}

function CliffRope() {
  const geo = useMemo(cliffRopeGeometry, []);
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (ref.current) ref.current.visible = rt.cliffRope > 0.5;
  });
  return <mesh ref={ref} geometry={geo} material={flatMat} />;
}

/** Fog reaches further over the lowland, so the coast and the town can be seen from the cliff. */
function LowlandFog() {
  const { scene } = useThree();
  useFrame(() => {
    const fog = scene.fog as THREE.Fog | null;
    if (!fog) return;
    const north = rt.player.z < -128 || (rt.camera.shot !== null && rt.camera.shot.target.z < -150);
    const want = north ? 380 : 260;
    fog.far += (want - fog.far) * 0.05;
    fog.near += ((north ? 90 : 70) - fog.near) * 0.05;
  });
  return null;
}

export function Lowland() {
  const region = useRef<THREE.Group>(null);
  const terrain = useMemo(() => lowlandTerrainTiles(), []);
  const spots = useMemo(lowlandSpots, []);
  const tree = useMemo(primevalTreeGeometry, []);
  const fern = useMemo(giantFernGeometry, []);
  const fernTree = useMemo(treeFernGeometry, []);
  const reed = useMemo(reedGeometry, []);
  const props = useMemo(lowlandPropsGeometry, []);
  const cliff = useMemo(cliffFaceGeometry, []);
  const water = useMemo(lowlandWaterGeometry, []);
  const waterMat = useMemo(() => new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.82, depthWrite: false }), []);
  const town = useMemo(townGeometry, []);
  const signs = useMemo(townSigns, []);
  const signMat = useMemo(() => new THREE.MeshBasicMaterial({ map: signs.tex, side: THREE.DoubleSide }), [signs]);
  useFrame(() => {
    // From the sanctuary (looking down from the lookout) and inside the lowland; never from the beach or the forest,
    // nor while the camera is still in the tunnel (the ridge and the garden's rim hide all of it from there).
    const shot = rt.camera.shot !== null && rt.camera.shot.target.z < -110;
    if (region.current) region.current.visible = shot || (rt.player.z < -110 && rt.camera.pos.z < TUNNEL.z0);
  });
  return (
    <group ref={region}>
      <LowlandFog />
      {terrain.map((g, i) => (
        <mesh key={i} geometry={g} material={flatMat} />
      ))}
      <mesh geometry={cliff} material={flatMat} />
      <mesh geometry={props} material={flatMat} />
      <mesh geometry={water} material={waterMat} renderOrder={1} />
      <mesh geometry={town} material={flatMat} />
      <mesh geometry={signs.geo} material={signMat} />
      <TiledInstances geometry={tree} spots={spots.trees} material={occluderMat} />
      <TiledInstances geometry={fernTree} spots={spots.fernTrees} material={occluderMat} far={110} />
      <TiledInstances geometry={fern} spots={spots.ferns} material={flatMat} far={60} />
      <TiledInstances geometry={reed} spots={spots.reeds} material={flatMat} far={50} />
      <CliffRope />
      <CampFire />
      <Unlocks />
      {CHESTS.map((c) => (
        <Chest key={c.id} id={c.id} />
      ))}
      {(Object.keys(SERVICES) as ServiceId[]).map((s) => (
        <Keeper key={s} service={s} />
      ))}
    </group>
  );
}
