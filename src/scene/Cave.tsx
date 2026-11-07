import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { rt } from "../game/runtime";
import { getGame, setGame } from "../game/store";
import { cb } from "../game/combat";
import { companions } from "../game/logic/progress";
import { monsterRootY } from "../game/ride";
import { standY } from "../game/world/collision";
import { CAVE_MOUTH } from "../game/world/lowland";
import { audio } from "../audio/audio";
import { flatMat } from "./materials";
import { caveAtmosphere } from "./layerView";
import { caveDecorGeometry, caveFloorGeometry, caveGlowGeometry, caveMaterial, caveMouthGeometry, caveWallGeometry } from "./models/cave";
import type { MonsterId } from "../game/types";

/** Eye height and forward offset per body (metres above the root). */
const EYES: Record<MonsterId | "player", [number, number, number]> = {
  player: [1.28, .17, .065], leafy: [.62, .3, .1], bubbo: [.62, .34, .14], puff: [.7, .3, .1], ember: [.78, .3, .1], lumo: [.75, .3, .11],
};
const MAX_EYES = 24;
/** Exposed for the browser capture hook. */
export const caveView = { inside: false, k: 0, eyes: 0 };

/** The optional cave inside the mesa: drawn only for a walker on the cave layer
 * (plus the carved mouth outside). Its light ignores the sun; inside, the
 * world beyond is not drawn and only eyes, mushrooms and crystals glow. */
export function Cave() {
  const inside = useRef<THREE.Group>(null), mouth = useRef<THREE.Group>(null);
  const mat = useMemo(caveMaterial, []);
  const glowMat = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false }), []);
  const darkMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#040506", fog: false }), []);
  const geos = useMemo(() => ({ floor: caveFloorGeometry(), walls: caveWallGeometry(), decor: caveDecorGeometry(), glow: caveGlowGeometry(), mouth: caveMouthGeometry() }), []);
  const eyes = useMemo(() => {
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(.032, 6, 4), new THREE.MeshBasicMaterial({ color: "#fff8e8", toneMapped: false, fog: false }), MAX_EYES);
    mesh.frustumCulled = false;
    mesh.count = 0;
    return mesh;
  }, []);
  const enemyEyes = useMemo(() => {
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(.04, 6, 4), new THREE.MeshBasicMaterial({ color: "#ffb040", toneMapped: false, fog: false }), MAX_EYES);
    mesh.frustumCulled = false;
    mesh.count = 0;
    return mesh;
  }, []);
  const state = useRef({ layer: rt.player.layer, drip: 2 });
  const m4 = useMemo(() => new THREE.Matrix4(), []);

  useFrame((_, dt) => {
    const g = getGame(), p = rt.player, s = state.current;
    const playing = g.screen === "game";
    const isIn = playing && p.layer === "cave";
    // A short dip through the mouth hides the switch of what is drawn.
    if (playing && s.layer !== p.layer && (s.layer === "cave" || p.layer === "cave")) {
      setGame({ fade: .85 });
      setTimeout(() => { if (getGame().fade === .85) setGame({ fade: 0 }); }, 140);
    }
    s.layer = p.layer;
    caveAtmosphere.k = isIn ? Math.min(1, caveAtmosphere.k + dt / .4) : Math.max(0, caveAtmosphere.k - dt / .4);
    if (!playing) caveAtmosphere.k = 0;
    caveView.inside = isIn;
    caveView.k = caveAtmosphere.k;
    if (inside.current) inside.current.visible = isIn;
    if (mouth.current) mouth.current.visible = playing && p.layer === "ground" && Math.hypot(p.x - 70, p.z - CAVE_MOUTH.z) < 30;
    mat.uniforms.uPlayer.value.set(p.x, p.y, p.z);
    mat.uniforms.uWarm.value = caveAtmosphere.warm;
    if (isIn) {
      s.drip -= dt;
      if (s.drip <= 0) { audio.play("drip"); s.drip = 1.4 + Math.random() * 2.8; }
    }
    // Eyes catch what little light there is: the player's, friends' and enemies'.
    let n = 0, e = 0;
    if (isIn && caveAtmosphere.warm < .5) {
      const put = (x: number, y: number, z: number, yaw: number, [h, ahead, side]: [number, number, number], target: THREE.InstancedMesh, i: number) => {
        const fx = Math.sin(yaw), fz = Math.cos(yaw);
        for (const k of [-1, 1]) {
          m4.makeTranslation(x + fx * ahead + fz * side * k, y + h, z + fz * ahead - fx * side * k);
          target.setMatrixAt(i++, m4);
        }
        return i;
      };
      if (!p.climbY) n = put(p.x, p.y, p.z, p.yaw, EYES.player, eyes, n);
      const solved = g.progress.solved;
      for (const id of companions(g.progress)) {
        const m = rt.monsters[id];
        if (n >= MAX_EYES - 2 || Math.hypot(m.x - p.x, m.z - p.z) > 14) continue;
        n = put(m.x, monsterRootY(m, solved, rt.time), m.z, m.yaw, EYES[id], eyes, n);
      }
      for (const en of cb.enemies) {
        if (e >= MAX_EYES - 2 || en.zone !== "cave" || en.state === "dormant" || en.state === "gone" || en.state === "ko") continue;
        e = put(en.x, standY(en.x, en.z, solved, "cave") + en.air, en.z, en.yaw, [.5, .3, .1], enemyEyes, e);
      }
    }
    eyes.count = n;
    enemyEyes.count = e;
    caveView.eyes = n + e;
    eyes.instanceMatrix.needsUpdate = enemyEyes.instanceMatrix.needsUpdate = true;
  });

  return <>
    <group ref={inside} visible={false}>
      <mesh geometry={geos.floor} material={mat} />
      <mesh geometry={geos.walls} material={mat} />
      <mesh geometry={geos.decor} material={mat} />
      <mesh geometry={geos.glow} material={glowMat} />
      <primitive object={eyes} />
      <primitive object={enemyEyes} />
    </group>
    <group ref={mouth} visible={false}>
      <mesh geometry={geos.mouth.arch} material={flatMat} />
      <mesh geometry={geos.mouth.dark} material={darkMat} />
    </group>
  </>;
}
