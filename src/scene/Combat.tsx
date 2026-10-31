import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { rt } from "../game/runtime";
import { getGame, useGame } from "../game/store";
import { cb, combatZoneAt, currentCombatZone, type EnemyRt, type Fx } from "../game/combat";
import { ENEMIES, type CloudEnemyKind, type EnemyKind } from "../game/data/combat";
import { ENEMY_SPAWNS, type EnemyKind as LowlandEnemyKind } from "../game/world/lowland";
import { CLOUD_ENEMY_SPAWNS } from "../game/world/cloudisle";
import { standY } from "../game/world/collision";
import { additiveSprite, flatMat, shadowMaterial } from "./materials";
import { ElementEffects } from "./ElementEffects";
import { airshipGeometry, cageGeometry, coinGeometry, enemyGeometry, propellerGeometry } from "./models/lowland";
import { foodGeometry } from "./models/props";
import { cloudEnemyGeometry } from "./models/cloudEnemies";
import type { FoodId } from "../game/types";

/**
 * Act 2's fight on screen: enemies (each its own small material so a hit
 * can flash it), their "!" and dizzy stars, coins and other drops, the
 * friends' projectiles and the special moves' shapes. Everything is pooled
 * and only what is near the player is drawn.
 */

const VIEW = 48;

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
  const def = ENEMIES[kind];
  const ring = kind === "thunderBeetle";
  const hovering = kind === "windSprite" || kind === "raiderDrone" || kind === "raiderShooter";
  const ranged = kind === "windSprite" || kind === "forestSpitter" || kind === "raiderShooter";
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
    g.visible = e.zone === currentCombatZone() && e.state !== "gone" && near && getGame().progress.act2.started;
    if (!g.visible) return;
    const t = rt.time;
    const y = standY(e.x, e.z, getGame().progress.solved);
    g.position.set(e.x, y, e.z);
    g.rotation.y = e.yaw;
    let squash = 1 + Math.sin(t * 3 + e.i) * 0.04;
    let hop = Math.abs(Math.sin(e.step * Math.PI)) * 0.12;
    let lean = 0;
    let scale = 1;
    let shake = 0;
    if (hovering) hop = Math.sin(t * 4 + e.i) * 0.13;
    if (e.state === "windup") {
      // Ranged foes swell as they charge; melee foes crouch before lunging.
      const k = 1 - e.timer / def.windup;
      squash = ranged ? 1 + 0.12 * k : 1 - 0.22 * Math.min(1, k * 1.6);
      if (ranged) scale = 1 + 0.22 * k;
      shake = Math.sin(t * 40) * 0.05 * k;
      lean = ranged ? -0.06 * k : -0.25 * k;
    } else if (e.state === "lunge") {
      squash = 1.15;
      lean = 0.45;
    } else if (e.state === "stun") {
      lean = Math.sin(t * 9) * 0.15;
    } else if (e.state === "ko") {
      const k = 1 - Math.max(0, e.timer) / 0.9;
      hop = Math.sin(k * Math.PI) * 0.9;
      scale = 1 - k * 0.6;
    } else if (e.state === "alert") hop = Math.sin(((t - e.alertT) / 0.55) * Math.PI) * 0.35;
    const trapped = e.control?.kind === "trapped";
    const carried = e.control?.kind === "carried";
    if (trapped || carried || e.control?.kind === "grabbed") hop = 0;
    m.position.set(shake + (trapped ? Math.sin(t * 8 + e.i) * 0.1 : 0), e.air + hop, 0);
    m.scale.set(scale / Math.sqrt(squash), scale * squash, scale / Math.sqrt(squash));
    m.rotation.set(lean, carried ? t * 7 : 0, trapped ? Math.sin(t * 7 + e.i) * 0.12 : carried ? Math.sin(t * 6) * 0.3 : 0);
    // Emissive body colours keep every charge readable without extra draws.
    const flash = Math.max(0, 1 - (t - e.hitT) / 0.18);
    const warn = e.state === "windup" ? 0.35 + Math.sin(t * 22) * 0.25 : 0;
    const seed = kind === "forestSpitter", wind = kind === "windSprite";
    mat.emissive.setRGB(flash + warn * (seed ? 0.55 : wind ? 0.35 : 1), flash * 0.9 + warn * (seed ? 1 : wind || ring ? 0.8 : 0), flash * 0.9 + warn * (wind ? 1 : ring ? 0.6 : 0));
    if (tell.current) {
      tell.current.visible = e.state === "windup" || (ring && e.state === "lunge");
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
      stars.current.visible = e.state === "stun" || e.state === "ko";
      stars.current.position.y = e.air + top;
      stars.current.rotation.y = t * 5;
    }
  });
  const top = e.kind === "gloomlet" ? 1.05 : e.kind === "snapjaw" ? 1.3 : 1.35;
  return (
    <group ref={root}>
      <mesh ref={body} geometry={geo} material={mat} />
      {(ring || kind === "raiderDrone" || kind === "stormCrab") && (
        <mesh ref={tell} geometry={tellGeo} position={[0, 0.06, 0]} visible={false}>
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
  // cb.enemies is replaced on reset: render by spawn index and look the live record up each frame.
  return (
    <>
      {spawns.map((s, i) => (
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
      <ElementEffects />
      <Airship />
    </>
  );
}

export type { Fx };
