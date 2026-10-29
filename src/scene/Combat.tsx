import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { rt } from "../game/runtime";
import { getGame, useGame } from "../game/store";
import { cb, combatZoneAt, currentCombatZone, type EnemyRt, type Fx } from "../game/combat";
import { ENEMIES, type CloudEnemyKind, type EnemyKind } from "../game/data/combat";
import { ENEMY_SPAWNS, type EnemyKind as LowlandEnemyKind } from "../game/world/lowland";
import { CLOUD_ENEMY_SPAWNS } from "../game/world/cloudisle";
import { standY } from "../game/world/collision";
import { additiveSprite, flatMat, glowTexture, shadowMaterial } from "./materials";
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
  const geo = useMemo(() => ["stormCrab", "windSprite", "raiderDrone", "thunderBeetle"].includes(kind) ? cloudEnemyGeometry(kind as CloudEnemyKind) : enemyGeometry(kind as LowlandEnemyKind), [kind]);
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), []);
  const shadow = useMemo(() => shadowMaterial(0.3), []);
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Mesh>(null);
  const alert = useRef<THREE.Sprite>(null);
  const stars = useRef<THREE.Group>(null);
  const tell = useRef<THREE.Mesh>(null);
  const def = ENEMIES[kind];
  const ring = kind === "thunderBeetle";
  const hovering = kind === "windSprite" || kind === "raiderDrone";
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
      // The tell: it crouches, shakes and glows red before it lunges.
      const k = 1 - e.timer / def.windup;
      squash = 1 - 0.22 * Math.min(1, k * 1.6);
      shake = Math.sin(t * 40) * 0.05 * k;
      lean = -0.25 * k;
    } else if (e.state === "lunge") {
      squash = 1.15;
      lean = 0.45;
    } else if (e.state === "stun" || e.state === "pulled") {
      lean = Math.sin(t * 9) * 0.15;
    } else if (e.state === "ko") {
      const k = 1 - Math.max(0, e.timer) / 0.9;
      hop = Math.sin(k * Math.PI) * 0.9;
      scale = 1 - k * 0.6;
    } else if (e.state === "alert") hop = Math.sin(((t - e.alertT) / 0.55) * Math.PI) * 0.35;
    m.position.set(shake, hop, 0);
    m.scale.set(scale / Math.sqrt(squash), scale * squash, scale / Math.sqrt(squash));
    m.rotation.x = lean;
    // A hit flashes it white; the wind-up glows it red.
    const flash = Math.max(0, 1 - (t - e.hitT) / 0.18);
    const warn = e.state === "windup" ? 0.35 + Math.sin(t * 22) * 0.25 : 0;
    mat.emissive.setRGB(flash + warn, flash * 0.9 + (ring ? warn * 0.8 : 0), flash * 0.9 + (ring ? warn * 0.6 : 0));
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
      alert.current.position.y = 1.5 + (e.kind === "shellback" ? 0.2 : 0);
    }
    if (stars.current) {
      stars.current.visible = e.state === "stun" || e.state === "ko";
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

/** Projectiles: bubbles, wind balls and fireballs (one instanced draw each). */
function Shots() {
  const mats = useMemo(
    () => ({
      bubble: new THREE.MeshLambertMaterial({ color: "#9fe6ff", transparent: true, opacity: 0.75, emissive: "#1f6f9f" }),
      wind: new THREE.MeshBasicMaterial({ color: "#f2fbff", transparent: true, opacity: 0.7 }),
      fireball: new THREE.MeshBasicMaterial({ color: "#ffb03a" })
    }),
    []
  );
  const geos = useMemo(() => ({ bubble: new THREE.SphereGeometry(1, 12, 8), wind: new THREE.TorusGeometry(0.8, 0.28, 6, 12), fireball: new THREE.IcosahedronGeometry(1, 1) }), []);
  const refs = { bubble: useRef<THREE.InstancedMesh>(null), wind: useRef<THREE.InstancedMesh>(null), fireball: useRef<THREE.InstancedMesh>(null) };
  const glowMat = useMemo(() => additiveSprite("#ff8a2a", 0.8), []);
  const glows = useRef<Array<THREE.Sprite | null>>([]);
  const o = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    const count = { bubble: 0, wind: 0, fireball: 0 };
    let g = 0;
    for (const s of cb.shots) {
      const kind = s.shape as keyof typeof count;
      if (!(kind in count)) continue;
      o.position.set(s.x, s.y, s.z);
      o.rotation.set(kind === "wind" ? Math.PI / 2 : 0, Math.atan2(s.vx, s.vz), rt.time * 12);
      o.scale.setScalar(s.radius * (kind === "wind" ? 0.8 : 1));
      o.updateMatrix();
      refs[kind].current?.setMatrixAt(count[kind]++, o.matrix);
      if (kind === "fireball" && g < 6) {
        const sp = glows.current[g++];
        if (sp) {
          sp.visible = true;
          sp.position.copy(o.position);
          sp.scale.setScalar(s.radius * 4);
        }
      }
    }
    for (const k of Object.keys(count) as Array<keyof typeof count>) {
      const m = refs[k].current;
      if (!m) continue;
      m.count = count[k];
      m.instanceMatrix.needsUpdate = true;
    }
    for (let k = g; k < 6; k++) if (glows.current[k]) glows.current[k]!.visible = false;
  });
  return (
    <>
      {(Object.keys(geos) as Array<keyof typeof geos>).map((k) => (
        <instancedMesh key={k} ref={refs[k]} args={[geos[k], mats[k], 16]} frustumCulled={false} />
      ))}
      {[0, 1, 2, 3, 4, 5].map((k) => (
        <sprite key={k} ref={(el) => (glows.current[k] = el)} material={glowMat} visible={false} />
      ))}
    </>
  );
}

/** The specials and the vine whip, as short-lived shapes. */
function Effects() {
  const pool = 8;
  const mats = useMemo(
    () => ({
      vine: new THREE.MeshLambertMaterial({ color: "#4fb43f", flatShading: true }),
      jet: new THREE.MeshBasicMaterial({ color: "#8fe0ff", transparent: true, opacity: 0.65, depthWrite: false }),
      gust: new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }),
      burst: new THREE.MeshBasicMaterial({ color: "#ff8a2a", transparent: true, opacity: 0.8, depthWrite: false })
    }),
    []
  );
  const geos = useMemo(() => {
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    cyl.rotateX(Math.PI / 2);
    cyl.translate(0, 0, 0.5);
    const cone = new THREE.ConeGeometry(1, 1, 16, 1, true);
    cone.rotateX(-Math.PI / 2);
    cone.translate(0, 0, 0.5);
    const ring = new THREE.TorusGeometry(1, 0.18, 6, 28);
    ring.rotateX(Math.PI / 2);
    return { cyl, cone, ring };
  }, []);
  const hit = useMemo(() => new THREE.SpriteMaterial({ map: glowTexture(), color: "#fff6c0", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  const meshes = useRef<Array<THREE.Mesh | null>>([]);
  const sprites = useRef<Array<THREE.Sprite | null>>([]);
  useFrame(() => {
    let mi = 0;
    let si = 0;
    for (const f of cb.fx) {
      const k = (rt.time - f.t0) / f.life;
      if (f.kind === "hit" || f.kind === "eat" || f.kind === "ko") {
        const sp = sprites.current[si++];
        if (!sp) continue;
        sp.visible = true;
        sp.position.set(f.x, f.y + k * (f.kind === "eat" ? 0.6 : 0.2), f.z);
        sp.scale.setScalar((f.kind === "eat" ? 1.6 : 1.2) * (1 - k * 0.5));
        (sp.material as THREE.SpriteMaterial).opacity = 1 - k;
        continue;
      }
      const m = meshes.current[mi++];
      if (!m) continue;
      m.visible = true;
      m.position.set(f.x, f.y, f.z);
      m.rotation.set(0, 0, 0);
      if (f.kind === "whip") {
        // A vine sweeps out in an arc in front of the player and snaps back.
        m.geometry = geos.cyl;
        m.material = mats.vine;
        const reach = f.size * Math.sin(Math.min(1, k * 1.6) * Math.PI);
        m.rotation.set(-0.1, f.yaw + (k - 0.5) * 1.6, 0);
        m.scale.set(0.09, 0.09, Math.max(0.05, reach));
      } else if (f.kind === "pull") {
        m.geometry = geos.cyl;
        m.material = mats.vine;
        const dx = f.ax - f.x, dz = f.az - f.z;
        const len = Math.hypot(dx, dz);
        const out = k < 0.45 ? k / 0.45 : 1 - (k - 0.45) / 0.55;
        m.rotation.set(0.05, Math.atan2(dx, dz), 0);
        m.scale.set(0.11, 0.11, Math.max(0.05, len * out));
      } else if (f.kind === "jet") {
        m.geometry = geos.cyl;
        m.material = mats.jet;
        m.rotation.set(0.04, f.yaw, 0);
        m.scale.set(0.45 * (1 - k * 0.5), 0.45 * (1 - k * 0.5), f.size * Math.min(1, k * 4));
        mats.jet.opacity = 0.7 * (1 - k);
      } else if (f.kind === "gust") {
        m.geometry = geos.cone;
        m.material = mats.gust;
        m.rotation.set(0, f.yaw, 0);
        const r = f.size * 0.75 * Math.min(1, k * 3);
        m.scale.set(r, r * 0.4, f.size * Math.min(1, k * 3));
        mats.gust.opacity = 0.4 * (1 - k);
      } else if (f.kind === "burst") {
        m.geometry = geos.ring;
        m.material = mats.burst;
        const r = 0.5 + f.size * k;
        m.scale.set(r, 1 + k * 2, r);
        mats.burst.opacity = 0.85 * (1 - k);
      }
    }
    for (let i = mi; i < pool; i++) if (meshes.current[i]) meshes.current[i]!.visible = false;
    for (let i = si; i < pool; i++) if (sprites.current[i]) sprites.current[i]!.visible = false;
  });
  return (
    <>
      {Array.from({ length: pool }, (_, i) => (
        <mesh key={i} ref={(el) => (meshes.current[i] = el)} visible={false} frustumCulled={false} />
      ))}
      {Array.from({ length: pool }, (_, i) => (
        <sprite key={i} ref={(el) => (sprites.current[i] = el)} material={hit.clone()} visible={false} />
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
  return (
    <>
      <Enemies />
      <Drops />
      <Shots />
      <Effects />
      <Airship />
    </>
  );
}

export type { Fx };
