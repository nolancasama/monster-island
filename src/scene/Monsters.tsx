import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { rt, type MonsterRt } from "../game/runtime";
import { getGame } from "../game/store";
import { LIVE_MONSTERS } from "../game/data/monsters";
import { RIVER_Y } from "../game/world/island";
import { standY } from "../game/world/collision";
import { smoothMat, shadowMaterial } from "./materials";
import { bubboParts, leafyParts, puffParts, type MonsterParts } from "./models/monsters";
import type { MonsterId } from "../game/types";

const BUILD: Partial<Record<MonsterId, () => MonsterParts>> = { leafy: leafyParts, bubbo: bubboParts, puff: puffParts };

/** How long each one-shot animation lasts (s). */
const DUR: Record<string, number> = { yes: 0.9, no: 1.0, spin: 1.1, eat: 1.3, hop: 0.5, friend: 2.6, power: 2.4, hide: 2.4, notice: 0.8, tilt: 1.3 };

const sm = (t: number) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

interface Pose {
  bounce: number;
  squash: number;
  spin: number;
  shake: number;
  lean: number;
  armsUp: number;
  cover: number;
  eyes: number;
  tilt: number;
}

/** The shared body language every monster speaks: bounce = yes, shake = no, spin = favourite. */
function basePose(m: MonsterRt, t: number): Pose {
  const p: Pose = { bounce: 0, squash: 1 + Math.sin(t * 2.4 + m.x) * 0.03, spin: 0, shake: 0, lean: 0, armsUp: 0, cover: 0, eyes: 1, tilt: 0 };
  const a = m.anim;
  const at = a ? rt.time - a.t0 : 99;
  if (a && at > (DUR[a.kind] ?? 1)) m.anim = null;
  if (m.anim) {
    const k = at / DUR[m.anim.kind];
    switch (m.anim.kind) {
      case "yes":
        p.bounce = Math.abs(Math.sin(at * Math.PI * 2.2)) * 0.32 * (1 - k);
        p.squash = 1 + Math.sin(at * Math.PI * 4.4) * 0.12 * (1 - k);
        p.armsUp = 1 - k;
        break;
      case "no":
        p.shake = Math.sin(at * 17) * 0.5 * (1 - k);
        p.eyes = 0.6;
        break;
      case "spin":
        p.spin = sm(k) * Math.PI * 2;
        p.bounce = Math.sin(Math.PI * k) * 0.42;
        p.armsUp = Math.sin(Math.PI * k);
        break;
      case "eat":
        p.lean = 0.3 * Math.abs(Math.sin(at * 11));
        p.squash = 1 + Math.abs(Math.sin(at * 11)) * 0.08;
        p.eyes = 0.15;
        break;
      case "hop":
      case "notice":
        p.bounce = Math.sin(Math.PI * k) * 0.24;
        p.squash = 1 + Math.sin(Math.PI * k * 2) * 0.1;
        if (m.anim.kind === "notice") p.eyes = 1.25;
        break;
      case "friend":
        p.spin = sm(Math.min(1, k * 1.4)) * Math.PI * 4;
        p.bounce = Math.abs(Math.sin(at * Math.PI * 2.4)) * 0.4 * (1 - k * 0.5);
        p.armsUp = 1;
        p.eyes = k > 0.2 && k < 0.8 ? 0.15 : 1;
        break;
      case "power":
        p.armsUp = 1;
        p.squash = 1 + Math.sin(at * 22) * 0.05;
        p.lean = -0.12;
        break;
      case "tilt":
        p.tilt = Math.sin(Math.PI * Math.min(1, k * 1.3)) * 0.42;
        break;
      case "hide":
        p.cover = k < 0.7 ? sm(k / 0.15) : 1 - sm((k - 0.7) / 0.3);
        p.squash = 0.86 + (1 - p.cover) * 0.14;
        break;
    }
  }
  if (m.mode === "sleep") {
    p.eyes = 0.08;
    p.squash = 0.9 + Math.sin(t * 1.2) * 0.04;
  }
  // Blink every few seconds.
  const blink = (t + m.z * 1.7) % 3.6;
  if (blink < 0.12) p.eyes = Math.min(p.eyes, 0.1);
  return p;
}

function MonsterBody({ id }: { id: MonsterId }) {
  const parts = useMemo(() => BUILD[id]!(), [id]);
  const shadow = useMemo(() => shadowMaterial(0.32), []);
  const root = useRef<THREE.Group>(null);
  const rig = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const shadowRef = useRef<THREE.Mesh>(null);
  const named = useRef<Record<string, THREE.Group | null>>({});

  useFrame(() => {
    const m = rt.monsters[id];
    const g = root.current;
    const r = rig.current;
    if (!g || !r) return;
    const t = rt.time;
    const solved = getGame().progress.solved;
    const ground = standY(m.x, m.z, solved);
    const water = m.swimming ? RIVER_Y - (id === "bubbo" ? 0.32 : 0.1) + Math.sin(t * 3) * 0.04 : -Infinity;
    // Fliers hover (a gentle bob); a perched flier sits up in its tree.
    const hover = m.air > 0.05 ? m.air + Math.sin(t * 2.6 + m.x) * 0.06 : 0;
    const baseY = Math.max(ground, water) + hover;
    const pose = basePose(m, t);
    const moving = m.speed > 0.2;
    const step = m.step;
    // Walk: Leafy waddles with little hops; Bubbo rocks side to side.
    const walkHop = moving ? Math.abs(Math.sin(step * Math.PI)) * (id === "leafy" ? 0.1 : 0.04) : 0;
    const walkRock = moving && id === "bubbo" ? Math.sin(step * Math.PI) * 0.12 : 0;
    const poof = Math.min(1, (t - m.poofT0) / 0.35);
    g.position.set(m.x, baseY + m.lift, m.z);
    g.rotation.y = m.yaw + pose.spin + pose.shake;
    g.scale.setScalar(0.2 + 0.8 * sm(poof));
    r.position.y = pose.bounce + walkHop + (m.talking ? Math.abs(Math.sin(t * 8)) * 0.03 : 0);
    r.scale.set(1 / Math.sqrt(pose.squash), pose.squash, 1 / Math.sqrt(pose.squash));
    r.rotation.x = pose.lean;
    r.rotation.z = walkRock + pose.tilt;
    if (eyes.current) eyes.current.scale.y = pose.eyes;
    if (shadowRef.current) {
      shadowRef.current.position.y = ground - baseY - m.lift + 0.03;
      shadowRef.current.visible = !m.swimming;
      const s = (1 - Math.min(0.5, pose.bounce)) * (1 - Math.min(0.55, hover * 0.15));
      shadowRef.current.scale.set(s, s, s);
    }
    const n = named.current;
    const swing = moving ? Math.sin(step * Math.PI) : 0;
    if (id === "leafy") {
      if (n.footL) n.footL.rotation.x = swing * 0.7;
      if (n.footR) n.footR.rotation.x = -swing * 0.7;
      const armBase = 0.25 + Math.sin(t * 2.4) * 0.05;
      const up = pose.armsUp;
      const shakeArms = up > 0.5 && m.anim?.kind === "power" ? Math.sin(t * 24) * 0.3 : 0;
      if (n.armL) {
        n.armL.rotation.z = -armBase - up * 2.3 - shakeArms + pose.cover * 0.6;
        n.armL.rotation.x = -swing * 0.5 - pose.cover * 1.9;
        n.armL.rotation.y = pose.cover * 0.6;
      }
      if (n.armR) {
        n.armR.rotation.z = armBase + up * 2.3 + shakeArms - pose.cover * 0.6;
        n.armR.rotation.x = swing * 0.5 - pose.cover * 1.9;
        n.armR.rotation.y = -pose.cover * 0.6;
      }
      if (n.sprout) {
        n.sprout.rotation.z = Math.sin(t * 1.8) * 0.12 + walkHop * 2;
        n.sprout.rotation.x = Math.sin(t * 1.3 + 1) * 0.08;
      }
      if (n.flower) {
        // The flower blooms on its sprout when Leafy becomes a friend, and stays.
        const friend = getGame().progress.monsters.leafy.friend;
        const bloom = m.anim?.kind === "friend" ? sm((rt.time - m.anim.t0) / 1.2) : friend ? 1 : 0;
        n.flower.scale.setScalar(Math.max(0.001, bloom));
        n.flower.rotation.y = t * 0.6;
      }
    } else if (id === "bubbo") {
      const paddle = moving || m.swimming ? Math.sin(step * Math.PI + (m.swimming ? t * 6 : 0)) : 0;
      for (const [name, sign] of [
        ["legFL", 1],
        ["legBR", 1],
        ["legFR", -1],
        ["legBL", -1]
      ] as const) {
        const leg = n[name];
        if (leg) leg.rotation.x = paddle * 0.8 * sign;
      }
      const flap = Math.sin(t * 3.2) * 0.25 + (pose.armsUp > 0 ? Math.sin(t * 16) * 0.3 * pose.armsUp : 0);
      if (n.gillsL) n.gillsL.rotation.z = flap;
      if (n.gillsR) n.gillsR.rotation.z = -flap;
      if (n.tail) n.tail.rotation.y = Math.sin(t * (moving || m.swimming ? 7 : 2.2)) * (m.anim?.kind === "power" ? 0.9 : 0.35);
    } else if (id === "puff") {
      // Wings beat fast in the air, fold and twitch when perched or resting.
      const flying = hover > 0.05;
      const rate = m.anim?.kind === "power" ? 26 : moving ? 20 : 13;
      const beat = flying ? Math.sin(t * rate) * 0.75 + 0.15 : Math.sin(t * 1.5) * 0.08 - 0.5 - pose.cover * 0.6;
      const up = pose.armsUp * 0.4;
      if (n.wingL) {
        n.wingL.rotation.z = beat + up;
        n.wingL.rotation.y = pose.cover * 1.2;
      }
      if (n.wingR) {
        n.wingR.rotation.z = -beat - up;
        n.wingR.rotation.y = -pose.cover * 1.2;
      }
      const dangle = flying ? Math.sin(t * 3 + 1) * 0.25 : 0;
      if (n.footL) n.footL.rotation.x = dangle + swing * 0.5;
      if (n.footR) n.footR.rotation.x = -dangle - swing * 0.5;
      if (n.tuft) n.tuft.rotation.z = Math.sin(t * 2.2) * 0.2 + (flying ? Math.sin(t * rate) * 0.08 : 0);
    }
  });

  return (
    <group ref={root}>
      <group ref={rig}>
        <mesh geometry={parts.body} material={smoothMat} />
        <group ref={eyes} position={[0, parts.eyeY, 0]}>
          <mesh geometry={parts.eyes} material={smoothMat} />
        </group>
        {parts.parts.map((p) => (
          <group
            key={p.name}
            position={p.pivot}
            ref={(el) => {
              named.current[p.name] = el;
            }}
          >
            <mesh geometry={p.geo} material={smoothMat} />
          </group>
        ))}
      </group>
      <mesh ref={shadowRef} rotation={[-Math.PI / 2, 0, 0]} material={shadow}>
        <planeGeometry args={[parts.shadow, parts.shadow]} />
      </mesh>
    </group>
  );
}

export function Monsters() {
  return (
    <>
      {LIVE_MONSTERS.filter((id) => BUILD[id]).map((id) => (
        <MonsterBody key={id} id={id} />
      ))}
    </>
  );
}

/** Height of a monster's head (effects, bubbles). */
export function monsterTop(id: MonsterId): number {
  return (id === "leafy" ? 1.45 : id === "puff" ? 1.05 : 1.2) + rt.monsters[id].air;
}
