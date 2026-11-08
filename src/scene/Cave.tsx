import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { rt } from "../game/runtime";
import { getGame, setGame } from "../game/store";
import { cb } from "../game/combat";
import { companions } from "../game/logic/progress";
import { monsterRootY } from "../game/ride";
import { standY } from "../game/world/collision";
import { CAVE_BRAZIERS, CAVE_ROUTE_LENGTH, CAVE_SEAL, CAVE_TORCHES, caveFloorY, caveRouteS } from "../game/world/cave";
import { audio } from "../audio/audio";
import { caveAtmosphere } from "./layerView";
import { Chest } from "./Chest";
import {
  brazierFlameY, caveChannelGeometry, caveDecorGeometry, caveFloorGeometry, caveGlowGeometry, caveMaterial,
  caveSealGeometry, caveSealGlowGeometry, caveTorchGeometry, caveTorchLight, caveWallGeometry, flameGeometry, tagged, torchFlameY,
} from "./models/cave";
import type { MonsterId } from "../game/types";

/** Eye height and forward offset per body (metres above the root). */
const EYES: Record<MonsterId | "player", [number, number, number]> = {
  player: [1.28, .17, .065], leafy: [.62, .3, .1], bubbo: [.62, .34, .14], puff: [.7, .3, .1], ember: [.78, .3, .1], lumo: [.75, .3, .11],
};
const MAX_EYES = 24;
/** The torches' spread: route distance reached by the flame. */
const litReach = (spread: number) => spread * (CAVE_ROUTE_LENGTH + 6) - 2;
/** Exposed for the browser capture hook. */
export const caveView = { inside: false, k: 0, eyes: 0, spread: 0, litTorches: 0, sealOpen: 0 };

/** The optional cave inside the mesa: drawn only for a walker on the cave layer
 * (plus the brazier flames and fire jet outside). Its light ignores the sun;
 * unlit, only eyes, mushrooms, crystals and the seal's moss glow. Ember's
 * torches light it along the route from either entrance or a burning torch. */
export function Cave() {
  const inside = useRef<THREE.Group>(null), mouth = useRef<THREE.Group>(null), seal = useRef<THREE.Group>(null);
  const mat = useMemo(caveMaterial, []), channelMat = useMemo(caveMaterial, []);
  const glowMat = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false }), []);
  const flameMat = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false, transparent: true, opacity: .92, depthWrite: false }), []);
  const geos = useMemo(() => {
    const sealMatrix = new THREE.Matrix4().compose(
      new THREE.Vector3(CAVE_SEAL.x, caveFloorY(CAVE_SEAL.x, CAVE_SEAL.z) - .05, CAVE_SEAL.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, CAVE_SEAL.yaw, 0)), new THREE.Vector3(1, 1, 1));
    const sealStone = caveSealGeometry().applyMatrix4(sealMatrix), sealGlow = caveSealGlowGeometry().applyMatrix4(sealMatrix);
    return {
      floor: caveFloorGeometry(), walls: caveWallGeometry(), decor: caveDecorGeometry(), glow: caveGlowGeometry(),
      torches: caveTorchGeometry(), channel: caveChannelGeometry(), flame: flameGeometry(),
      sealStone: tagged(sealStone), sealGlow,
    };
  }, []);
  const instanced = (geometry: THREE.BufferGeometry, material: THREE.Material, count: number) => {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.frustumCulled = false;
    mesh.count = 0;
    return mesh;
  };
  const eyes = useMemo(() => instanced(new THREE.SphereGeometry(.032, 6, 4), new THREE.MeshBasicMaterial({ color: "#fff8e8", toneMapped: false, fog: false }), MAX_EYES), []);
  const enemyEyes = useMemo(() => instanced(new THREE.SphereGeometry(.04, 6, 4), new THREE.MeshBasicMaterial({ color: "#ffb040", toneMapped: false, fog: false }), MAX_EYES), []);
  const torchFlames = useMemo(() => instanced(geos.flame, flameMat, CAVE_TORCHES.length), [geos, flameMat]);
  const brazierFlames = useMemo(() => instanced(geos.flame, flameMat, CAVE_BRAZIERS.length), [geos, flameMat]);
  const jet = useMemo(() => {
    const g = new THREE.ConeGeometry(.22, 1, 7, 1, true);
    g.translate(0, -.5, 0);
    g.rotateX(-Math.PI / 2); // tip at the origin (Ember's mouth), opening toward +z
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: "#ff9a3a", toneMapped: false, fog: false, transparent: true, opacity: .8, depthWrite: false, side: THREE.DoubleSide }));
    m.visible = false;
    return m;
  }, []);
  const state = useRef({ layer: rt.player.layer, drip: 2, sealK: -1 });
  const m4 = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const v = useMemo(() => new THREE.Vector3(), []);
  const one = useMemo(() => new THREE.Vector3(1, 1, 1), []);

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
    if (mouth.current) mouth.current.visible = playing && p.layer === "ground";

    // Ember's torches: the flame runs in from the mouth over about six seconds.
    const lit = g.progress.solved.includes("caveTorches"), t = rt.caveTorches;
    if (!lit) t.spread = 0;
    else if (t.animating) { t.spread = Math.min(1, t.spread + dt / 6); if (t.spread >= 1) t.animating = false; }
    else t.spread = 1;
    const reach = lit ? litReach(t.spread) : -1e4;
    caveView.spread = t.spread;
    mat.uniforms.uLitS.value = reach;
    mat.uniforms.uLightOriginS.value = t.originS;
    mat.uniforms.uAmbient.value = lit ? .01 + .09 * t.spread : .01;
    mat.uniforms.uSil.value = lit ? .045 + .055 * t.spread : .045;
    glowMat.color.setScalar(lit ? .03 + .97 * t.spread : .03);
    mat.uniforms.uPlayer.value.set(p.x, p.y, p.z);
    // The bright channel would trace the route in the dark: it takes no ambient
    // and a faint silhouette until the flame has run along it.
    const cu = channelMat.uniforms;
    cu.uLitS.value = reach;
    cu.uLightOriginS.value = t.originS;
    cu.uAmbient.value = lit ? mat.uniforms.uAmbient.value : 0;
    cu.uSil.value = lit ? mat.uniforms.uSil.value : .012;
    cu.uPlayer.value.set(p.x, p.y, p.z);
    const playerS = isIn ? caveRouteS(p.x, p.z) : 0;
    const warm = isIn && lit && Math.abs(playerS - t.originS) <= reach ? Math.min(1, caveTorchLight(p.x, p.z, playerS)) : 0;
    caveAtmosphere.warm += (warm - caveAtmosphere.warm) * Math.min(1, dt * 4);
    mat.uniforms.uWarm.value = 0;
    const time = rt.time;
    let litCount = 0;
    CAVE_TORCHES.forEach((torch, i) => {
      const on = lit && Math.abs(torch.s - t.originS) <= reach;
      if (on) litCount++;
      const f = on ? 1 + .14 * Math.sin(time * 13 + i * 1.7) + .08 * Math.sin(time * 23 + i) : 0;
      m4.compose(v.set(torch.x, torchFlameY(torch), torch.z), q.identity(), one.set(f, f * (1 + .1 * Math.sin(time * 17 + i)), f));
      torchFlames.setMatrixAt(i, m4);
    });
    torchFlames.count = CAVE_TORCHES.length;
    torchFlames.instanceMatrix.needsUpdate = true;
    caveView.litTorches = litCount;
    CAVE_BRAZIERS.forEach((br, i) => {
      const f = lit ? 1.6 * (1 + .12 * Math.sin(time * 11 + i * 2.3)) : 0;
      m4.compose(v.set(br.x, brazierFlameY(br), br.z), q.identity(), one.set(f, f, f));
      brazierFlames.setMatrixAt(i, m4);
    });
    brazierFlames.count = CAVE_BRAZIERS.length;
    brazierFlames.instanceMatrix.needsUpdate = true;
    one.set(1, 1, 1);
    // The scripted jet of fire from Ember's mouth to the brazier.
    const j = t.jet;
    if (j && time < j.until) {
      const dir = v.set(j.to.x - j.from.x, j.to.y - j.from.y, j.to.z - j.from.z), len = dir.length();
      jet.position.set(j.from.x, j.from.y, j.from.z);
      jet.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
      const pulse = 1 + .15 * Math.sin(time * 30);
      jet.scale.set(pulse, pulse, len);
      jet.visible = true;
    } else {
      jet.visible = false;
      if (j && time >= j.until) t.jet = null;
    }

    // Leafy's seal slides aside along its own plane once pulled (already aside on load).
    const open = g.progress.act2.secrets.includes("caveRootSeal");
    if (s.sealK < 0) s.sealK = open ? 1 : 0;
    s.sealK = open ? Math.min(1, s.sealK + dt / .9) : 0;
    caveView.sealOpen = s.sealK;
    if (seal.current) {
      const k = s.sealK * s.sealK * (3 - 2 * s.sealK);
      seal.current.position.set(Math.cos(CAVE_SEAL.yaw) * 1.75 * k, -.02 * k, -Math.sin(CAVE_SEAL.yaw) * 1.75 * k);
    }

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
      <mesh geometry={geos.torches} material={mat} />
      <mesh geometry={geos.channel} material={channelMat} />
      <mesh geometry={geos.glow} material={glowMat} />
      <group ref={seal}>
        <mesh geometry={geos.sealStone} material={mat} />
        <mesh geometry={geos.sealGlow} material={glowMat} />
      </group>
      <Chest id="caveRootSealChest" visible={() => true} />
      <primitive object={torchFlames} />
      <primitive object={eyes} />
      <primitive object={enemyEyes} />
    </group>
    <group ref={mouth} visible={false}>
      <primitive object={brazierFlames} />
      <primitive object={jet} />
    </group>
  </>;
}
