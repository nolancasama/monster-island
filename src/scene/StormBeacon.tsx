import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { cb } from "../game/combat";
import { BEACON_ARENA, BEACON_PYLONS } from "../game/logic/beacon";
import { rt } from "../game/runtime";
import { getGame } from "../game/store";
import { PartBuilder } from "./partBuilder";
import { flatMat } from "./materials";
import { cloudEnemyGeometry } from "./models/cloudEnemies";

export function arenaGeometry() {
  const p = new PartBuilder();
  p.cyl(12, 11.5, 1.1, 0, -1.1, 0, "#596875", 40);
  p.cyl(11.7, 11.7, .12, 0, 0, 0, "#929ca0", 40);
  p.torus(10.8, .12, [0, .14, 0], [Math.PI / 2, 0, 0], "#d2b579");
  p.torus(4, .14, [0, .14, 0], [Math.PI / 2, 0, 0], "#b9a06d");
  // Rim posts leave the southern lift mouth clear and never obstruct play.
  for (let i = 0; i < 22; i++) {
    const a = i / 22 * Math.PI * 2;
    if (Math.cos(a) < -.9) continue;
    const x = Math.sin(a) * 11.5, z = Math.cos(a) * 11.5;
    p.cyl(.19, .25, 1.1, x, .12, z, "#687780", 6);
    p.sphere(.28, x, 1.25, z, "#c0ab79", [1, .65, 1], 8);
  }
  // Weather machine and the officer's control desk are one cheap static mesh.
  p.cyl(2.1, 2.6, .6, 0, .12, 0, "#48525b", 16);
  p.cyl(1.2, 1.7, 2.8, 0, .72, 0, "#667d83", 12);
  p.torus(1.35, .19, [0, 2.4, 0], [Math.PI / 2, 0, 0], "#d0a55f");
  p.cyl(.3, .48, 10.9, 0, 3.4, 0, "#9c8458", 8);
  p.cone(.8, 1.2, 0, 14.3, 0, "#d4bb7d", 8);
  p.box(3.5, 1.25, 1.25, 0, .12, 3.7, "#3d505b");
  p.boxAt(3.5, .15, 1.5, [0, 1.45, 3.6], [-.28, 0, 0], "#baa472");
  for (let i = 0; i < 5; i++) p.sphere(.12, -.95 + i * .48, 1.56, 3.4, i % 2 ? "#f4cf78" : "#7ce5e7", [1, .5, 1], 6);
  for (const q of BEACON_PYLONS) {
    const z = q.z - BEACON_ARENA.z;
    p.cyl(1.1, 1.3, .3, q.x, .12, z, "#47566a", 10);
    // Brass conduits make all three targets visibly part of the machine.
    const length = Math.hypot(q.x, z), yaw = Math.atan2(q.x, z);
    p.box(.2, .08, length, q.x / 2, .13, z / 2, "#c8ac72", yaw);
  }
  return p.build();
}

function officerGeometry() {
  const p = new PartBuilder();
  p.cyl(.45, .6, .9, 0, .5, 0, "#4a486d", 8);
  p.sphere(.4, 0, 1.77, 0, "#d9b28e", [1, 1.12, 1], 10);
  p.cyl(.6, .65, .15, 0, 2.1, 0, "#34415c", 10);
  p.box(.7, .25, .55, 0, 2.2, 0, "#34415c");
  p.sphere(.09, -.17, 1.81, -.35, "#253047", [1, 1, .5], 6);
  p.sphere(.09, .17, 1.81, -.35, "#253047", [1, 1, .5], 6);
  p.box(.24, .48, .3, -.27, .1, 0, "#333d52");
  p.box(.24, .48, .3, .27, .1, 0, "#333d52");
  p.boxAt(.22, .75, .22, [-.53, 1, -.17], [-.5, 0, -.2], "#68617e");
  p.boxAt(.22, .75, .22, [.53, 1, -.17], [-.5, 0, .2], "#68617e");
  // Gold crescent badge.
  p.torus(.16, .055, [0, 1.05, -.52], [0, 0, 0], "#ffdb87");
  return p.build();
}

function StormPylon({ index }: { index: number }) {
  const root = useRef<THREE.Group>(null), shield = useRef<THREE.Mesh>(null), light = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => {
    const p = new PartBuilder();
    p.cyl(.55, .7, 2.8, 0, .3, 0, "#566779", 8);
    for (let i = 0; i < 4; i++) p.torus(.64, .09, [0, .7 + i * .55, 0], [Math.PI / 2, 0, 0], "#ccb47c");
    p.cone(.8, .5, 0, 3.1, 0, "#c4a86e", 8);
    return p.build();
  }, []);
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), []);
  const q = BEACON_PYLONS[index];
  useFrame(() => {
    const phase = getGame().progress.act3.beaconDefeated ? "down" : cb.beacon.pylons[index].phase;
    if (root.current) root.current.scale.y = phase === "down" ? .32 : 1;
    mat.emissive.set(phase === "charging" ? "#6b4200" : phase === "exposed" ? "#126f66" : "#000000");
    if (shield.current) {
      shield.current.visible = phase === "shielded" || phase === "charging";
      shield.current.rotation.y = rt.time * .5;
      const m = shield.current.material as THREE.MeshBasicMaterial;
      m.color.set(phase === "charging" ? "#ffbe46" : "#82baf0");
      m.opacity = phase === "charging" ? .24 + Math.sin(rt.time * 9) * .12 : .19;
    }
    if (light.current) {
      light.current.visible = phase !== "down";
      (light.current.material as THREE.MeshBasicMaterial).color.set(phase === "charging" ? "#ffcc54" : phase === "exposed" ? "#96fff1" : "#6a8da5");
      light.current.scale.setScalar(phase === "charging" ? 1 + Math.sin(rt.time * 10) * .18 : 1);
    }
  });
  return <group position={[q.x, BEACON_ARENA.y, q.z]}>
    <group ref={root}>
      <mesh geometry={geo} material={mat} />
      <mesh ref={light} position={[0, 2.6, 0]}><sphereGeometry args={[.45, 10, 6]} /><meshBasicMaterial color="#96fff1" /></mesh>
    </group>
    <mesh ref={shield} position={[0, 1.9, 0]} scale={[1.2, 2, 1.2]}>
      <icosahedronGeometry args={[1, 1]} /><meshBasicMaterial color="#82baf0" transparent opacity={.19} wireframe depthWrite={false} />
    </mesh>
  </group>;
}

/** Arena effects use a handful of meshes; no lights, shadows or screen effects. */
export function StormBeacon() {
  const geo = useMemo(arenaGeometry, []), officer = useMemo(officerGeometry, []);
  const rotorGeo = useMemo(() => {
    const p = new PartBuilder();
    p.boxAt(5.5, .15, .55, [0, 0, 0], [0, 0, .08], "#ceb67f");
    p.boxAt(5.5, .15, .55, [0, 0, 0], [0, Math.PI / 2, .08], "#ceb67f");
    return p.build();
  }, []);
  const spriteGeo = useMemo(() => cloudEnemyGeometry("windSprite"), []);
  const spriteMats = useMemo(() => [0, 1].map(() => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })), []);
  const root = useRef<THREE.Group>(null), squall = useRef<THREE.Mesh>(null), rope = useRef<THREE.Mesh>(null);
  const rotor = useRef<THREE.Group>(null), core = useRef<THREE.Mesh>(null);
  const rotorSpeed = useRef(1.7);
  const ringRefs = useRef<Array<THREE.Mesh | null>>([]), spriteRefs = useRef<Array<THREE.Mesh | null>>([]);
  const gust = useRef<THREE.InstancedMesh>(null);
  const near = useRef<THREE.Group>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame((_,dt) => {
    const defeated = getGame().progress.act3.beaconDefeated, b = cb.beacon;
    const dist = Math.hypot(rt.camera.pos.x, rt.camera.pos.z - 169);
    if (root.current) root.current.visible = dist < 250 && getGame().progress.act3.area !== "thunderGrotto";
    // Small parts (the officer, pylon lights and shields) are specks from the coast: draw them near only.
    if (near.current) near.current.visible = dist < 90;
    rotorSpeed.current = THREE.MathUtils.damp(rotorSpeed.current,defeated ? 0 : 1.7,2,dt);
    if (rotor.current) rotor.current.rotation.y += dt * rotorSpeed.current;
    if (core.current) (core.current.material as THREE.MeshBasicMaterial).color.set(defeated ? "#566976" : "#b3f1ff");
    if (squall.current) {
      squall.current.visible = !defeated || ["powerDown", "stormBreak", "squallRope", "lumoGlow"].includes(rt.act3Scene);
      squall.current.position.y = 37.15 + rt.squallLift;
      squall.current.rotation.y = defeated ? Math.sin(rt.time * 5) * .5 : 0;
      squall.current.rotation.z = defeated ? Math.sin(rt.time * 7) * .12 : 0;
    }
    if (rope.current) {
      rope.current.visible = defeated && ["squallRope", "lumoGlow"].includes(rt.act3Scene);
      const bottom = 39.5 + rt.squallLift, top = 49;
      rope.current.position.y = (top + bottom) / 2;
      rope.current.scale.y = Math.max(.1, top - bottom);
    }
    ringRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const q = b.rings[i];
      mesh.visible = b.active && !!q && (b.attack === "lightningTell" || b.attack === "lightning");
      if (!q) return;
      mesh.position.set(q.x, 37.2, q.z);
      const m = mesh.material as THREE.MeshBasicMaterial;
      m.color.set(b.attack === "lightning" ? "#efffff" : "#ffcb55");
      m.opacity = b.attack === "lightning" ? 1 : .5 + Math.sin(rt.time * 9) * .2;
    });
    if (gust.current) {
      gust.current.visible = b.active && !b.gustCancelled && (b.attack === "gustTell" || b.attack === "gust");
      for (let i = 0; i < 12; i++) {
        const phase = (rt.time * (b.attack === "gust" ? 12 : 2) + i * 1.9) % 20;
        dummy.position.set((phase - 10) * b.gust.x, 37.35 + (i % 3) * .35, 161 + (i % 6) * 2.6);
        dummy.scale.set(b.attack === "gust" ? 3.5 : 1.8, .05, .07);
        dummy.rotation.set(0, 0, -.08);
        dummy.updateMatrix(); gust.current.setMatrixAt(i, dummy.matrix);
      }
      gust.current.instanceMatrix.needsUpdate = true;
    }
    spriteRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const e = cb.enemies.find(enemy => enemy.i === 10000 + i);
      mesh.visible = !!e && b.active && e.state !== "gone";
      if (!e) return;
      mesh.position.set(e.x, 37.5 + Math.sin(rt.time * 4 + i) * .15, e.z);
      mesh.rotation.y = e.yaw;
      mesh.scale.setScalar(e.state === "ko" ? Math.max(.1, e.timer) : 1);
      spriteMats[i].emissive.set(e.state === "windup" ? "#805745" : rt.time - e.hitT < .18 ? "#b3d3ce" : "#000000");
    });
  });
  return <group ref={root}>
    <mesh geometry={geo} material={flatMat} position={[0, 37, 169]} />
    <group ref={rotor} position={[0, 42.7, 169]}>
      <mesh geometry={rotorGeo} material={flatMat} />
    </group>
    <mesh ref={core} position={[0, 40.3, 169]}><sphereGeometry args={[.85, 12, 8]} /><meshBasicMaterial color="#b3f1ff" /></mesh>
    <group ref={near}>
      <mesh ref={squall} geometry={officer} material={flatMat} position={[0, 37.15, 173.8]} />
      {BEACON_PYLONS.map((_, i) => <StormPylon key={i} index={i} />)}
    </group>
    <mesh ref={rope} position={[0, 44.8, 173.8]} visible={false}><cylinderGeometry args={[.045, .045, 1, 5]} /><meshBasicMaterial color="#d8c392" /></mesh>
    {[0, 1].map(i => <mesh key={`ring${i}`} ref={m => { ringRefs.current[i] = m; }} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[1.8, 2.15, 40]} /><meshBasicMaterial color="#ffcb55" transparent opacity={.7} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>)}
    <instancedMesh ref={gust} args={[undefined, undefined, 12]} visible={false} frustumCulled={false}><boxGeometry args={[1, 1, 1]} /><meshBasicMaterial color="#dfedff" transparent opacity={.7} /></instancedMesh>
    {[0, 1].map(i => <mesh key={`sprite${i}`} ref={m => { spriteRefs.current[i] = m; }} geometry={spriteGeo} material={spriteMats[i]} visible={false} />)}
  </group>;
}
