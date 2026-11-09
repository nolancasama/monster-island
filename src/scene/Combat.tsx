import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { rt } from "../game/runtime";
import { layerOfZone } from "../game/world/layers";
import { getGame, useGame } from "../game/store";
import { cb, combatZoneAt, currentCombatZone, enemyRevealScale, type EnemyRt, type Fx } from "../game/combat";
import { ENEMIES, type CloudEnemyKind, type EnemyKind } from "../game/data/combat";
import { ENEMY_SPAWNS, type EnemyKind as LowlandEnemyKind } from "../game/world/lowland";
import { CLOUD_ENEMY_SPAWNS } from "../game/world/cloudisle";
import { standY } from "../game/world/collision";
import { additiveSprite, flatMat, shadowMaterial } from "./materials";
import { emptyBodyPose, enemyBodyPose } from "./panicPose";
import { FALL_GRAVITY } from "../game/logic/falls";
import { airshipGeometry, cageGeometry, coinGeometry, enemyGeometry, propellerGeometry } from "./models/lowland";
import { foodGeometry } from "./models/props";
import { cloudEnemyGeometry } from "./models/cloudEnemies";
import type { FoodId } from "../game/types";
import { SHALLOW_WATER_DEPTH, shallowWaterAt } from "../game/world/groveShallows";

/**
 * Act 2's fight on screen: enemies (each its own small material so a hit
 * can flash it), their "!" and dizzy stars, coins and other drops, the
 * friends' projectiles and the special moves' shapes. Everything is pooled
 * and only what is near the player is drawn.
 */

const VIEW = 48;

const plungeY = (p: { t0: number; y0: number }, t: number) => p.y0 - .5 * FALL_GRAVITY * (t - p.t0) * (t - p.t0);

function textSprite(text: string, color: string): THREE.SpriteMaterial {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.font = "bold 52px sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = 8;
  g.strokeStyle = "#ffffff";
  g.strokeText(text, 32, 34);
  g.fillStyle = color;
  g.fillText(text, 32, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true });
}

const ALERT = textSprite("!", "#e8483f");
const STARS = textSprite("★", "#ffd23f");

function Enemy({ e, kind }: { e: EnemyRt; kind: EnemyKind }) {
  const geo = useMemo(() => ["stormCrab", "windSprite", "raiderDrone", "raiderShooter", "thunderBeetle", "forestSpitter"].includes(kind) ? cloudEnemyGeometry(kind as CloudEnemyKind | "forestSpitter") : enemyGeometry(kind as LowlandEnemyKind), [kind]);
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), []);
  const shadow = useMemo(() => shadowMaterial(0.3), []);
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Mesh>(null);
  const alert = useRef<THREE.Sprite>(null);
  const stars = useRef<THREE.Group>(null);
  const tell = useRef<THREE.Mesh>(null);
  const pose = useMemo(emptyBodyPose, []);
  const def = ENEMIES[kind];
  const ring = kind === "thunderBeetle";
  const tellGeo = useMemo(() => {
    const g = ring ? new THREE.RingGeometry(0.9, 1, 32) : new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    if (!ring) g.translate(0, 0, 0.5);
    return g;
  }, [ring]);
  useFrame(() => {
    const g = root.current;
    const m = body.current;
    if (!g || !m) return;
    const p = rt.player;
    const near = Math.hypot(p.x - e.x, p.z - e.z) < VIEW;
    const reveal = enemyRevealScale(e);
    g.visible = e.zone === currentCombatZone() && reveal > 0 && near && getGame().progress.act2.started;
    if (!g.visible) return;
    g.scale.setScalar(reveal);
    const t = rt.time;
    // A plunge keeps its own height: the ground under the void is far below the lip.
    const y = e.plunge ? plungeY(e.plunge, t) : standY(e.x, e.z, getGame().progress.solved, layerOfZone(e.zone));
    g.position.set(e.x, y, e.z);
    g.rotation.y = e.yaw;
    enemyBodyPose(e, t, pose);
    m.position.set(pose.shake, e.air + pose.hop, 0);
    m.scale.set(pose.scale / Math.sqrt(pose.squash), pose.scale * pose.squash, pose.scale / Math.sqrt(pose.squash));
    m.rotation.set(pose.lean, pose.spin, pose.roll);
    // Emissive body colours keep every charge readable without extra draws.
    const flash = Math.max(0, 1 - (t - e.hitT) / 0.18);
    const warn = e.state === "windup" ? 0.35 + Math.sin(t * 22) * 0.25 : 0;
    const seed = kind === "forestSpitter", wind = kind === "windSprite";
    const singe = e.burn ? 0.22 : 0;
    mat.emissive.setRGB(flash + singe + warn * (seed ? 0.55 : wind ? 0.35 : 1), flash * 0.9 + singe * 0.35 + warn * (seed ? 1 : wind || ring ? 0.8 : 0), flash * 0.9 + warn * (wind ? 1 : ring ? 0.6 : 0));
    if (tell.current) {
      tell.current.position.y = .06 + (rt.world === "home" && layerOfZone(e.zone) === "ground"
        && shallowWaterAt(e.x, e.z) ? SHALLOW_WATER_DEPTH : 0);
      tell.current.visible = !e.panic && (e.state === "windup" || (ring && e.state === "lunge"));
      if (ring) {
        tell.current.scale.setScalar(def.reach);
        (tell.current.material as THREE.MeshBasicMaterial).opacity = e.state === "lunge" ? 0.85 : 0.2 + Math.max(0, 1 - e.timer / def.windup) * 0.4;
      } else if (kind === "raiderDrone") {
        tell.current.rotation.y = Math.atan2(e.dx, e.dz) - e.yaw;
        tell.current.scale.set(0.045, 1, def.lunge * 0.48);
      } else if (kind === "stormCrab") {
        tell.current.rotation.y = Math.atan2(e.dx, e.dz) - e.yaw;
        tell.current.scale.set(0.4, 1, def.lunge * 0.32);
      }
    }
    if (alert.current) {
      alert.current.visible = t - e.alertT < 1.1 && e.state !== "ko";
      alert.current.position.y = e.air + 1.5 + (e.kind === "shellback" ? 0.2 : 0);
    }
    if (stars.current) {
      stars.current.visible = (e.state === "stun" || e.state === "ko") && !e.plunge;
      stars.current.position.y = e.air + top;
      stars.current.rotation.y = t * 5;
    }
  });
  const top = e.kind === "gloomlet" ? 1.05 : e.kind === "snapjaw" ? 1.3 : 1.35;
  return (
    <group ref={root} visible={false}>
      <mesh ref={body} geometry={geo} material={mat} />
      {(ring || kind === "raiderDrone" || kind === "stormCrab") && (
        <mesh ref={tell} geometry={tellGeo} position={[0, 0.06, 0]} visible={false} renderOrder={3}>
          <meshBasicMaterial color={ring ? "#aadeff" : kind === "raiderDrone" ? "#ff3e4b" : "#ffbb6b"} transparent opacity={0.6} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} material={shadow}>
        <planeGeometry args={[def.radius * 2.4, def.radius * 2.4]} />
      </mesh>
      <sprite ref={alert} material={ALERT} scale={[0.7, 0.7, 1]} />
      <group ref={stars} position={[0, top, 0]}>
        {[0, 1, 2].map((i) => (
          <sprite key={i} material={STARS} position={[Math.cos((i / 3) * Math.PI * 2) * 0.35, 0, Math.sin((i / 3) * Math.PI * 2) * 0.35]} scale={[0.32, 0.32, 1]} />
        ))}
      </group>
    </group>
  );
}

function Enemies() {
  const world = useGame((g) => g.progress.act3.world);
  const spawns = world === "cloud" ? CLOUD_ENEMY_SPAWNS : ENEMY_SPAWNS;
  // Retired descriptors preserve their saved indices without creating a body.
  // cb.enemies is replaced on reset: render by spawn index and look the live record up each frame.
  return (
    <>
      {spawns.map((s, i) => "retired" in s && s.retired ? null : (
        <EnemySlot key={`${world}-${i}`} i={i} kind={s.kind} />
      ))}
    </>
  );
}

function EnemySlot({ i, kind }: { i: number; kind: EnemyKind }) {
  const proxy = useMemo(() => new Proxy({} as EnemyRt, { get: (_t, k) => (cb.enemies[i] as unknown as Record<string | symbol, unknown>)[k] }), [i]);
  return <Enemy e={proxy} kind={kind} />;
}

const MAX_COINS = 60;

function Drops() {
  const coin = useMemo(coinGeometry, []);
  const amberGeo = useMemo(() => new THREE.IcosahedronGeometry(0.2, 0), []);
  const amberMat = useMemo(() => new THREE.MeshLambertMaterial({ color: "#ffa21f", emissive: "#a04a00", flatShading: true }), []);
  const foods = useMemo(() => {
    const out = {} as Record<FoodId, THREE.BufferGeometry>;
    for (const f of ["apples", "bananas", "fish", "berries", "meat"] as FoodId[]) out[f] = foodGeometry(f);
    return out;
  }, []);
  const coins = useRef<THREE.InstancedMesh>(null);
  const ambers = useRef<THREE.InstancedMesh>(null);
  const foodRefs = useRef<Array<THREE.Mesh | null>>([]);
  const o = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    let n = 0;
    let a = 0;
    let f = 0;
    for (const d of cb.drops) {
      if (combatZoneAt(d.x, d.z) !== currentCombatZone()) continue;
      o.position.set(d.x, d.y + Math.sin(rt.time * 4 + d.id) * 0.05, d.z);
      o.rotation.set(0, rt.time * 4 + d.id, 0);
      o.scale.setScalar(1);
      o.updateMatrix();
      if (d.kind === "coin" && n < MAX_COINS && coins.current) coins.current.setMatrixAt(n++, o.matrix);
      else if (d.kind === "amber" && a < 8 && ambers.current) ambers.current.setMatrixAt(a++, o.matrix);
      else if (d.kind === "food" && f < 6) {
        const m = foodRefs.current[f++];
        if (m) {
          m.visible = true;
          m.geometry = foods[d.food!];
          m.position.copy(o.position);
          m.rotation.y = o.rotation.y;
        }
      }
    }
    if (coins.current) {
      coins.current.count = n;
      coins.current.instanceMatrix.needsUpdate = true;
    }
    if (ambers.current) {
      ambers.current.count = a;
      ambers.current.instanceMatrix.needsUpdate = true;
    }
    for (let k = f; k < 6; k++) if (foodRefs.current[k]) foodRefs.current[k]!.visible = false;
  });
  return (
    <>
      <instancedMesh ref={coins} args={[coin, flatMat, MAX_COINS]} frustumCulled={false} />
      <instancedMesh ref={ambers} args={[amberGeo, amberMat, 8]} frustumCulled={false} />
      {[0, 1, 2, 3, 4, 5].map((k) => (
        <mesh key={k} ref={(el) => (foodRefs.current[k] = el)} visible={false} material={flatMat} scale={1.3} />
      ))}
    </>
  );
}


/** The raiders' airship with its spinning propeller and the glowing cage on its chain. */
function Airship() {
  const ship = useMemo(airshipGeometry, []);
  const prop = useMemo(propellerGeometry, []);
  const cage = useMemo(cageGeometry, []);
  const cageMat = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 }), []);
  const glow = useMemo(() => additiveSprite("#9ff7ff", 0.6), []);
  const chainMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#c9fbff" }), []);
  const root = useRef<THREE.Group>(null);
  const propRef = useRef<THREE.Mesh>(null);
  const cageRef = useRef<THREE.Group>(null);
  const chain = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const s = rt.ship;
    const g = root.current;
    if (g) {
      g.visible = s.visible;
      g.position.set(s.x, s.y, s.z);
      g.rotation.y = s.yaw;
      g.rotation.z = Math.sin(rt.time * 0.9) * 0.04;
      g.scale.setScalar(s.scale);
    }
    if (propRef.current) propRef.current.rotation.z = rt.time * 14;
    const c = cageRef.current;
    if (c) {
      c.visible = s.cage.visible;
      c.position.set(s.cage.x, s.cage.y, s.cage.z);
      c.rotation.y = rt.time * 0.6;
      const k = 0.15 + 0.85 * s.cage.closed;
      c.scale.set(1, k, 1);
      cageMat.opacity = 0.65 + Math.sin(rt.time * 6) * 0.15;
    }
    const ch = chain.current;
    if (ch) {
      ch.visible = s.cage.visible && s.visible;
      const top = s.y - 0.1;
      const bottom = s.cage.y + 2.9;
      ch.position.set(s.cage.x, (top + bottom) / 2, s.cage.z);
      ch.scale.set(1, Math.max(0.01, top - bottom), 1);
    }
  });
  return (
    <>
      <group ref={root} visible={false}>
        <mesh geometry={ship} material={flatMat} />
        <mesh ref={propRef} geometry={prop} material={flatMat} position={[0, 0.6, -3]} />
      </group>
      <group ref={cageRef} visible={false}>
        <mesh geometry={cage} material={cageMat} />
        <sprite material={glow} position={[0, 1.3, 0]} scale={[3.6, 3.6, 1]} />
      </group>
      <mesh ref={chain} material={chainMat} visible={false}>
        <cylinderGeometry args={[0.05, 0.05, 1, 5]} />
      </mesh>
    </>
  );
}

export function CombatScene() {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    const frustum = new THREE.Frustum();
    const matrix = new THREE.Matrix4();
    const point = new THREE.Vector3();
    const onScreen = (x: number, y: number, z: number) => {
      matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(matrix);
      return frustum.containsPoint(point.set(x, y, z));
    };
    cb.onScreen = onScreen;
    return () => { if (cb.onScreen === onScreen) cb.onScreen = null; };
  }, [camera]);
  return (
    <>
      <Enemies />
      <Drops />
      <Airship />
    </>
  );
}

export type { Fx };
