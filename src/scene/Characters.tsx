import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { rt } from "../game/runtime";
import { getGame } from "../game/store";
import { MONSTERS } from "../game/data/monsters";
import { groundY } from "../game/world/island";
import { smoothMat, shadowMaterial } from "./materials";
import { PLAYER_OUTFIT, armGeometry, bodyGeometry, legGeometry } from "./models/people";
import { mapleArmGeometry, mapleBodyGeometry, mapleLegGeometry } from "./models/maple";
import { foodGeometry } from "./models/props";
import type { FoodId } from "../game/types";

function Shadow({ size = 1.1 }: { size?: number }) {
  const mat = useMemo(() => shadowMaterial(0.34), []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} material={mat}>
      <planeGeometry args={[size, size]} />
    </mesh>
  );
}

/** The player: a kid explorer with a cap and backpack. */
export function Player() {
  const body = useMemo(() => bodyGeometry(PLAYER_OUTFIT), []);
  const leg = useMemo(() => legGeometry(PLAYER_OUTFIT), []);
  const arm = useMemo(() => armGeometry(PLAYER_OUTFIT), []);
  const foods = useMemo(() => {
    const out = {} as Record<FoodId, THREE.BufferGeometry>;
    for (const f of ["apples", "bananas", "fish", "berries", "meat"] as FoodId[]) out[f] = foodGeometry(f);
    return out;
  }, []);
  const root = useRef<THREE.Group>(null);
  const pose = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const held = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const p = rt.player;
    const g = root.current;
    if (!g) return;
    g.position.set(p.x, p.y, p.z);
    g.rotation.y = p.yaw;
    g.visible = getGame().screen !== "title";
    const walk = Math.min(1, p.speed / 4);
    const s = Math.sin(p.step * Math.PI);
    const action = p.action && rt.time - p.action.t0 < 1.2 ? p.action : null;
    const at = action ? rt.time - action.t0 : 0;
    let legSwing = s * 0.7 * walk;
    let armSwing = -s * 0.6 * walk;
    let reach = 0;
    let crouch = 0;
    if (action?.kind === "give") reach = Math.sin(Math.min(1, at / 0.5) * Math.PI * 0.5) * (at < 1 ? 1 : 1 - (at - 1) / 0.2);
    if (action?.kind === "pick") crouch = Math.sin(Math.min(1, at / 0.5) * Math.PI);
    if (action?.kind === "cheer") armSwing = 0;
    if (p.riding) {
      legSwing = 0;
      armSwing = 0;
    }
    if (pose.current) {
      pose.current.position.y = (p.riding ? 0.32 : 0) + Math.abs(s) * 0.05 * walk - crouch * 0.18 + (walk < 0.1 ? Math.sin(rt.time * 2.2) * 0.008 : 0);
      pose.current.rotation.x = crouch * 0.35;
    }
    if (legL.current && legR.current) {
      legL.current.rotation.x = p.riding ? -1.2 : legSwing;
      legR.current.rotation.x = p.riding ? -1.2 : -legSwing;
      legL.current.rotation.z = p.riding ? -0.5 : 0;
      legR.current.rotation.z = p.riding ? 0.5 : 0;
    }
    if (armL.current && armR.current) {
      armL.current.rotation.x = armSwing;
      armR.current.rotation.x = -armSwing - reach * 1.4 - crouch * 0.8;
      if (action?.kind === "cheer") {
        armL.current.rotation.z = -2.6;
        armR.current.rotation.z = 2.6;
      } else {
        armL.current.rotation.z = -0.12;
        armR.current.rotation.z = 0.12;
      }
    }
    const h = held.current;
    if (h) {
      const food: FoodId | null = action?.kind === "give" ? holdingFood() : null;
      h.visible = Boolean(food) && at < 0.9;
      if (food) h.geometry = foods[food];
    }
  });

  return (
    <group ref={root}>
      <group ref={pose}>
        <mesh geometry={body} material={smoothMat} />
        <group ref={legL} position={[-0.09, 0.5, 0]}>
          <mesh geometry={leg} material={smoothMat} />
        </group>
        <group ref={legR} position={[0.09, 0.5, 0]}>
          <mesh geometry={leg} material={smoothMat} />
        </group>
        <group ref={armL} position={[-0.27, 0.98, 0]}>
          <mesh geometry={arm} material={smoothMat} />
        </group>
        <group ref={armR} position={[0.27, 0.98, 0]}>
          <mesh geometry={arm} material={smoothMat} />
          <mesh ref={held} position={[0, -0.45, 0.06]} geometry={foods.apples} material={smoothMat} visible={false} scale={1.2} />
        </group>
      </group>
      <Shadow />
    </group>
  );
}

/** The food being given: the favourite of the monster being talked to. */
function holdingFood(): FoodId | null {
  for (const id of Object.keys(rt.monsters) as Array<keyof typeof rt.monsters>) {
    const m = rt.monsters[id];
    if (m.mode === "talk") return MONSTERS[id].favorite;
  }
  return null;
}

/** Professor Maple at her camp. */
export function Maple() {
  const body = useMemo(mapleBodyGeometry, []);
  const leg = useMemo(mapleLegGeometry, []);
  const arm = useMemo(mapleArmGeometry, []);
  const root = useRef<THREE.Group>(null);
  const pose = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  useFrame(() => {
    const m = rt.maple;
    const g = root.current;
    if (!g) return;
    g.position.set(m.x, groundY(m.x, m.z), m.z);
    // Face the player when near, else her own heading.
    const p = rt.player;
    const near = Math.hypot(p.x - m.x, p.z - m.z) < 6;
    const want = near ? Math.atan2(p.x - m.x, p.z - m.z) : m.yaw;
    let d = want - g.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    g.rotation.y += d * 0.08;
    const wave = rt.time - m.wave;
    if (pose.current) pose.current.position.y = Math.sin(rt.time * 2) * 0.01 + (m.talking ? Math.abs(Math.sin(rt.time * 6)) * 0.015 : 0);
    if (armR.current) {
      if (wave < 2.4) {
        armR.current.rotation.z = 2.5;
        armR.current.rotation.x = Math.sin(wave * 9) * 0.35;
      } else {
        armR.current.rotation.z = 0.1 + (m.talking ? Math.sin(rt.time * 3) * 0.15 + 0.2 : 0);
        armR.current.rotation.x = m.talking ? -0.4 : 0;
      }
    }
    if (armL.current) armL.current.rotation.z = -0.1;
  });
  return (
    <group ref={root}>
      <group ref={pose}>
        <mesh geometry={body} material={smoothMat} />
        <group position={[-0.1, 0.62, 0]}>
          <mesh geometry={leg} material={smoothMat} />
        </group>
        <group position={[0.1, 0.62, 0]}>
          <mesh geometry={leg} material={smoothMat} />
        </group>
        <group ref={armL} position={[-0.3, 1.22, 0]}>
          <mesh geometry={arm} material={smoothMat} />
        </group>
        <group ref={armR} position={[0.3, 1.22, 0]}>
          <mesh geometry={arm} material={smoothMat} />
        </group>
      </group>
      <Shadow size={1.2} />
    </group>
  );
}
