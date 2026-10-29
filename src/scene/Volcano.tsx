import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { rt } from "../game/runtime";
import { GATE_PILLARS, LAVA, SANCTUARY_GATE, groundY } from "../game/world/island";
import { additiveSprite, flatMat, glowTexture, occluderMat } from "./materials";
import {
  gardenGeometry,
  CAVE_TORCHES,
  caveTorchGeometry,
  caveInteriorGeometry,
  gateDoorGeometry,
  gateWallGeometry,
  lavaBedGeometry,
  meatRackGeometry,
  pillarGeometry,
  pillarPowerGeometry,
  PILLAR_COLOR,
  rackPosition,
  volcanoGroundGeometry,
  volcanoRocksGeometry,
  type PillarId
} from "./models/volcano";

const at = (x: number, z: number, dy = 0): [number, number, number] => [x, groundY(x, z) + dy, z];

function Lava() {
  const hot = useMemo(() => lavaBedGeometry(false), []);
  const cool = useMemo(() => lavaBedGeometry(true), []);
  const glow = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true }), []);
  const ref = useRef<THREE.Mesh>(null);
  const cooled = useRef<THREE.Mesh>(null);
  const steam = useRef<THREE.InstancedMesh>(null);
  const puff = useMemo(() => new THREE.Object3D(), []);
  const steamMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#e9c5a2", transparent: true, opacity: 0.16, depthWrite: false }), []);
  useFrame(() => {
    if (ref.current) {
      ref.current.visible = rt.lava < 0.98;
      ref.current.scale.y = 0.95 + Math.sin(rt.time * 2.2) * 0.05;
      glow.color.setRGB(1, 0.85 + Math.sin(rt.time * 2.8) * 0.1, 0.8);
    }
    if (steam.current) {
      steam.current.visible = rt.lava < 0.98;
      for (let i = 0; i < 6; i++) {
        const k = (rt.time * 0.28 + i / 6) % 1;
        puff.position.set(-4.5 + i * 1.8 + k * 0.4, 0.25 + k * 1.8, Math.sin(i * 2) * 0.5);
        puff.scale.setScalar(0.12 + Math.sin(k * Math.PI) * 0.32);
        puff.updateMatrix();
        steam.current.setMatrixAt(i, puff.matrix);
      }
      steam.current.instanceMatrix.needsUpdate = true;
    }
    if (cooled.current) {
      cooled.current.visible = rt.lava > 0.01;
      // The crust spreads across from the near bank as Bubbo's water lands.
      cooled.current.scale.set(Math.max(0.001, rt.lava), Math.max(0.001, rt.lava), 1);
    }
  });
  return <group position={at(LAVA.x, LAVA.z, 0.08)}>
    <mesh ref={ref} geometry={hot} material={glow} />
    {/* The crust's top is the walking surface: placed on the ground, not on the hot bed's offset. */}
    <mesh ref={cooled} geometry={cool} material={flatMat} position={[0, -0.08, 0]} />
    <instancedMesh ref={steam} args={[undefined, steamMat, 6]} frustumCulled={false}>
      <icosahedronGeometry args={[1, 0]} />
    </instancedMesh>
  </group>;
}

function Cave() {
  const flames = useRef<THREE.Mesh>(null);
  const halos = useRef<THREE.Group>(null);
  const interior = useMemo(caveInteriorGeometry, []);
  const insideMat = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true, color: "#050507" }), []);
  const haloMat = useMemo(() => additiveSprite("#ff8d29", 0.6), []);
  const torches = useMemo(() => caveTorchGeometry(false), []);
  const fire = useMemo(() => caveTorchGeometry(true), []);
  const flameMat = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true }), []);
  useFrame(() => {
    insideMat.color.setRGB(0.006 + rt.cave * 0.85, 0.006 + rt.cave * 0.47, 0.008 + rt.cave * 0.2);
    if (halos.current) halos.current.visible = rt.cave > 0.01;
    if (flames.current) {
      flames.current.visible = rt.cave > 0.01;
      flameMat.color.setRGB(1, 0.94 + Math.sin(rt.time * 9) * 0.05, 0.85);
    }
  });
  return <group>
    <mesh geometry={interior} material={insideMat} />
    <mesh geometry={torches} material={flatMat} />
    <mesh ref={flames} geometry={fire} material={flameMat} />
    <group ref={halos}>
      {CAVE_TORCHES.map((t, i) => <sprite key={i} position={at(t.x, t.z, 2.1)} scale={[2.5, 2.5, 1]} material={haloMat} />)}
    </group>
  </group>;
}

function Pillar({ id }: { id: PillarId }) {
  const stone = useMemo(() => pillarGeometry(id), [id]);
  const power = useMemo(() => pillarPowerGeometry(id), [id]);
  const glowMat = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true }), []);
  const ref = useRef<THREE.Mesh>(null);
  const p = GATE_PILLARS[id];
  useFrame(() => {
    const t = rt.pillars[id] ?? 0;
    if (ref.current) {
      ref.current.visible = t > 0.01;
      ref.current.scale.y = Math.max(0.01, t);
    }
  });
  return <group position={at(p.x, p.z)}>
    <mesh geometry={stone} material={flatMat} />
    <mesh ref={ref} geometry={power} material={glowMat} />
  </group>;
}

/** Solved rings also share one draw; all four are in the tunnel's north-facing
 * frustum even when the lining hides them. Preserve their individual animation. */
function PillarRings() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const pose = useMemo(() => new THREE.Object3D(), []);
  const ids = Object.keys(GATE_PILLARS) as PillarId[];
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.visible = ids.some(id => (rt.pillars[id] ?? 0) > .9);
    if (!mesh.visible) return;
    ids.forEach((id, i) => {
      const p = GATE_PILLARS[id];
      pose.position.set(p.x, groundY(p.x, p.z) + 1.3, p.z + .64);
      pose.rotation.x = -Math.PI / 2;
      pose.scale.setScalar((rt.pillars[id] ?? 0) > .9 ? 1 : 0);
      pose.updateMatrix();
      mesh.setMatrixAt(i, pose.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  });
  return <instancedMesh ref={ref} args={[undefined, undefined, 4]}>
    <ringGeometry args={[.75, .84, 20]} />
    <meshBasicMaterial color="#fff0a9" side={THREE.DoubleSide} />
  </instancedMesh>;
}

/** One draw for the four soft halos, attached to the physical friend plaques. */
function PillarHalos() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const pose = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const ids = Object.keys(GATE_PILLARS) as PillarId[];
  const material = useMemo(() => new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true,
    opacity: .25, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.visible = ids.some(id => (rt.pillars[id] ?? 0) < .01);
    if (!mesh.visible) return;
    ids.forEach((id, i) => {
      const p = GATE_PILLARS[id];
      pose.position.set(p.x, groundY(p.x, p.z) + 2, p.z + .81);
      pose.scale.setScalar((rt.pillars[id] ?? 0) < .01 ? 1.6 : 0);
      pose.updateMatrix();
      mesh.setMatrixAt(i, pose.matrix);
      mesh.setColorAt(i, color.set(PILLAR_COLOR[id]));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    material.opacity = .23 + Math.sin(rt.time * 1.8) * .04;
    mesh.computeBoundingSphere();
  });
  return <instancedMesh ref={ref} args={[undefined, material, 4]}><planeGeometry args={[1, 1]} /></instancedMesh>;
}

function Gate() {
  const wall = useMemo(gateWallGeometry, []);
  const door = useMemo(gateDoorGeometry, []);
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!ref.current) return;
    ref.current.visible = rt.gate < 0.99;
    ref.current.position.y = groundY(SANCTUARY_GATE.x, SANCTUARY_GATE.z) - rt.gate * 4.3;
  });
  return <group>
    <mesh geometry={wall} material={occluderMat} />
    <mesh ref={ref} geometry={door} material={flatMat} position={at(SANCTUARY_GATE.x, SANCTUARY_GATE.z)} />
    {(Object.keys(GATE_PILLARS) as PillarId[]).map((id) => <Pillar key={id} id={id} />)}
    <PillarHalos />
    <PillarRings />
  </group>;
}

/** All pieces are merged per material; no realtime shadows or extra lights. */
export function Volcano() {
  const region = useRef<THREE.Group>(null);
  const ground = useMemo(volcanoGroundGeometry, []);
  const rocks = useMemo(volcanoRocksGeometry, []);
  const rack = useMemo(meatRackGeometry, []);
  const garden = useMemo(gardenGeometry, []);
  useFrame(() => {
    // The distant smoking mountain remains in FarLand. Its playable detail
    // is hidden from the beach to preserve the earlier phases' draw budget.
    if (region.current) region.current.visible = rt.player.z < -43 || (rt.camera.shot?.target.z ?? 0) < -43;
  });
  return <group ref={region}>
    <mesh geometry={ground} material={flatMat} />
    <mesh geometry={rocks} material={flatMat} />
    <mesh geometry={rack} material={flatMat} position={[...rackPosition]} />
    <mesh geometry={garden} material={flatMat} />
    <Lava />
    <Cave />
    <Gate />
  </group>;
}
