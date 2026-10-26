import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PICK_TIME, rt } from "../game/runtime";
import { getGame } from "../game/store";
import { MONSTERS } from "../game/data/monsters";
import { groundY } from "../game/world/island";
import { smoothMat, shadowMaterial } from "./materials";
import { KNEE_Y, PLAYER_OUTFIT, armGeometry, bodyGeometry, shinGeometry, thighGeometry } from "./models/people";
import { CLIMB_PULL } from "../game/world/rope";
import { HIP_Y, SEATED, squatAmount, squatPose } from "./poses";
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
  const thigh = useMemo(() => thighGeometry(PLAYER_OUTFIT), []);
  const shin = useMemo(() => shinGeometry(PLAYER_OUTFIT), []);
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
  const shinL = useRef<THREE.Group>(null);
  const shinR = useRef<THREE.Group>(null);
  const shadow = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const held = useRef<THREE.Mesh>(null);

  /**
   * Hand over hand on the rope (the player faces it). The cycle is driven by
   * the height climbed, so hands and body move together up or down: one hand
   * reaches overhead to grip while the other pulls down to the chest, and the
   * opposite leg draws up with a bent knee to push.
   */
  function climbPose(y: number) {
    const c = Math.sin((y / CLIMB_PULL) * Math.PI);
    const lift = Math.abs(Math.cos((y / CLIMB_PULL) * Math.PI));
    if (pose.current) {
      pose.current.position.y = lift * 0.03;
      pose.current.rotation.x = 0.14;
    }
    if (armL.current && armR.current) {
      armL.current.rotation.x = -2.45 - 0.45 * c;
      armR.current.rotation.x = -2.45 + 0.45 * c;
      // Hands come in to the rope in front of the chest.
      armL.current.rotation.z = 0.36;
      armR.current.rotation.z = -0.36;
    }
    const uR = (1 + c) / 2;
    const uL = (1 - c) / 2;
    if (legL.current && legR.current && shinL.current && shinR.current) {
      legL.current.rotation.x = -0.25 - 0.75 * uL;
      legR.current.rotation.x = -0.25 - 0.75 * uR;
      legL.current.rotation.z = -0.08;
      legR.current.rotation.z = 0.08;
      shinL.current.rotation.x = 0.35 + 1.0 * uL;
      shinR.current.rotation.x = 0.35 + 1.0 * uR;
    }
  }

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
    let reach = 0;
    if (action?.kind === "give") reach = Math.sin(Math.min(1, at / 0.5) * Math.PI * 0.5) * (at < 1 ? 1 : 1 - (at - 1) / 0.2);
    // Squat and reach: hips down, knees bent over planted feet, a slight lean.
    const c = action?.kind === "pick" ? squatAmount(at, PICK_TIME) * (action.depth ?? 1) : 0;
    const sq = squatPose(c);
    // Hop on, sit astride and hop off Bubbo (0..1).
    const k = p.riding ? p.seat : 0;
    const walkK = (1 - k) * (1 - c);
    const legSwing = s * 0.7 * walk * walkK;
    const armSwing = action?.kind === "cheer" ? 0 : -s * 0.6 * walk * walkK;
    if (pose.current) {
      // Lean about the hip (not the feet), so the hips stay over the feet.
      const lean = sq.lean + SEATED.lean * k;
      const hipY = HIP_Y - sq.drop - SEATED.drop * k + (Math.abs(s) * 0.05 * walk + (walk < 0.1 ? Math.sin(rt.time * 2.2) * 0.008 : 0)) * walkK;
      pose.current.rotation.x = lean;
      pose.current.position.set(0, hipY - HIP_Y * Math.cos(lean), -HIP_Y * Math.sin(lean));
    }
    if (legL.current && legR.current) {
      legL.current.rotation.set(legSwing + sq.thigh * (1 - k) + SEATED.thigh.x * k, SEATED.thigh.y * k, SEATED.thigh.z * k);
      legR.current.rotation.set(-legSwing + sq.thigh * (1 - k) + SEATED.thigh.x * k, -SEATED.thigh.y * k, -SEATED.thigh.z * k);
    }
    if (shinL.current && shinR.current) {
      shinL.current.rotation.x = walk * Math.max(0, -s) * 0.5 * walkK + sq.knee * (1 - k) + SEATED.knee * k;
      shinR.current.rotation.x = walk * Math.max(0, s) * 0.5 * walkK + sq.knee * (1 - k) + SEATED.knee * k;
    }
    if (armL.current && armR.current) {
      // Squatting: the left hand rests toward the knee, the right reaches down
      // to the food in front of the feet. Riding: both hands forward, holding on.
      armL.current.rotation.x = armSwing - sq.lean - 0.35 * c + SEATED.arm.x * k;
      armR.current.rotation.x = -armSwing - reach * 1.4 - sq.lean - 0.75 * c + SEATED.arm.x * k;
      if (action?.kind === "cheer") {
        armL.current.rotation.z = -2.6;
        armR.current.rotation.z = 2.6;
      } else {
        armL.current.rotation.z = -0.12 + (SEATED.arm.z + 0.12) * k;
        armR.current.rotation.z = 0.12 - 0.1 * c - (SEATED.arm.z + 0.12) * k;
      }
    }
    if (shadow.current) shadow.current.visible = p.climbY === null && k < 0.5;
    if (p.climbY !== null) climbPose(p.climbY);
    const h = held.current;
    if (h) {
      // Food in the hand: the gift being offered, or the food just picked (from
      // the moment the hand reaches it until the player is up again).
      const picked = action?.kind === "pick" && at > PICK_TIME * 0.42 && at < PICK_TIME * 0.95 ? action.food ?? null : null;
      const food: FoodId | null = action?.kind === "give" ? holdingFood() : picked;
      h.visible = Boolean(food) && at < 0.9;
      if (food) h.geometry = foods[food];
    }
  });

  return (
    <group ref={root}>
      <group ref={pose}>
        <mesh geometry={body} material={smoothMat} />
        <group ref={legL} position={[-0.09, 0.5, 0]}>
          <mesh geometry={thigh} material={smoothMat} />
          <group ref={shinL} position={[0, KNEE_Y, 0]}>
            <mesh geometry={shin} material={smoothMat} />
          </group>
        </group>
        <group ref={legR} position={[0.09, 0.5, 0]}>
          <mesh geometry={thigh} material={smoothMat} />
          <group ref={shinR} position={[0, KNEE_Y, 0]}>
            <mesh geometry={shin} material={smoothMat} />
          </group>
        </group>
        <group ref={armL} position={[-0.27, 0.98, 0]}>
          <mesh geometry={arm} material={smoothMat} />
        </group>
        <group ref={armR} position={[0.27, 0.98, 0]}>
          <mesh geometry={arm} material={smoothMat} />
          <mesh ref={held} position={[0, -0.45, 0.06]} geometry={foods.apples} material={smoothMat} visible={false} scale={1.2} />
        </group>
      </group>
      <group ref={shadow}>
        <Shadow />
      </group>
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
