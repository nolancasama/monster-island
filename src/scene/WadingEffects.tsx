import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { audio } from "../audio/audio";
import { cb, currentCombatZone } from "../game/combat";
import { rt } from "../game/runtime";
import { getGame } from "../game/store";
import { ENEMY_SPAWNS } from "../game/world/lowland";
import { groundY } from "../game/world/island";
import { SHALLOW_WATER_DEPTH, shallowWaterAt } from "../game/world/groveShallows";
import { wadingStep, wadingTrack } from "./wading";

const STEPS = 12, PER_STEP = 6, LIFE = .85, ENEMIES = 3;

/** One draw for at most 24 expanding rings and 48 tiny drops. All slots and
 * instance buffers are reused; distant/off-screen enemies cannot fill the pool. */
export function WadingEffects() {
  const { camera } = useThree();
  const pool = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(1, 1);
    const fades = new THREE.InstancedBufferAttribute(new Float32Array(STEPS * PER_STEP), 1);
    const styles = new THREE.InstancedBufferAttribute(new Float32Array(STEPS * PER_STEP), 1);
    fades.setUsage(THREE.DynamicDrawUsage); styles.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("fade", fades); geometry.setAttribute("style", styles);
    const material = new THREE.ShaderMaterial({
      vertexShader: `
        attribute float fade;
        attribute float style;
        varying vec2 vUv;
        varying float vFade;
        varying float vStyle;
        void main() {
          vUv = uv; vFade = fade; vStyle = style;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.);
        }`,
      fragmentShader: `
        varying vec2 vUv;
        varying float vFade;
        varying float vStyle;
        void main() {
          float r = length(vUv * 2. - 1.);
          float a = vStyle < .5
            ? smoothstep(.66, .78, r) * (1. - smoothstep(.9, 1., r))
            : 1. - smoothstep(.35, 1., r);
          gl_FragColor = vec4(.96, .99, 1., a * vFade);
          if (gl_FragColor.a < .01) discard;
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true
    });
    const mesh = new THREE.InstancedMesh(geometry, material, STEPS * PER_STEP);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; mesh.visible = false; mesh.count = 0; mesh.renderOrder = 2;
    return {
      mesh, fades, styles, pose: new THREE.Object3D(), next: 0,
      steps: Array.from({ length: STEPS }, () => ({ x: 0, y: 0, z: 0, t: -Infinity, seed: 0 })),
      player: wadingTrack(), enemies: Array.from({ length: ENEMY_SPAWNS.length }, wadingTrack),
      frustum: new THREE.Frustum(), matrix: new THREE.Matrix4(), point: new THREE.Vector3()
    };
  }, []);
  useEffect(() => () => {
    pool.mesh.geometry.dispose(); (pool.mesh.material as THREE.Material).dispose(); pool.mesh.dispose();
  }, [pool]);
  useFrame(() => {
    const game = getGame(), p = rt.player, t = rt.time;
    const active = game.screen === "game" && rt.world === "home" && p.layer === "ground";
    const spawn = (x: number, z: number, yaw: number, side: number) => {
      const slot = pool.steps[pool.next];
      slot.x = x + Math.cos(yaw) * side * .18;
      slot.z = z - Math.sin(yaw) * side * .18;
      if (!shallowWaterAt(slot.x, slot.z)) { slot.x = x; slot.z = z; }
      slot.y = groundY(slot.x, slot.z) + SHALLOW_WATER_DEPTH + .025;
      slot.t = t; slot.seed = pool.next;
      pool.next = (pool.next + 1) % STEPS;
    };
    // Riding a monster through the shallows ripples too (the mount wades).
    const playerWet = active && game.mode === "explore" && !p.hop && !p.fall
      && p.floatY === null && p.climbY === null && shallowWaterAt(p.x, p.z);
    if (wadingStep(pool.player, p.x, p.z, t, playerWet)) {
      spawn(p.x, p.z, p.yaw, pool.player.side);
      audio.play("wade");
    }
    pool.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    pool.frustum.setFromProjectionMatrix(pool.matrix);
    let viewed = 0;
    for (let i = 0; i < pool.enemies.length; i++) {
      const e = cb.enemies[i];
      if (!e) continue;
      const visible = active && viewed < ENEMIES && e.zone === currentCombatZone()
        && !e.retired && !e.plunge && !e.flight && e.air < .12
        && e.state !== "gone" && e.state !== "ko" && e.state !== "dormant" && e.state !== "materialising"
        && Math.hypot(e.x - p.x, e.z - p.z) < 24 && shallowWaterAt(e.x, e.z)
        && pool.frustum.containsPoint(pool.point.set(e.x, groundY(e.x, e.z) + .4, e.z));
      if (visible) viewed++;
      if (wadingStep(pool.enemies[i], e.x, e.z, t, visible, .9, .38))
        spawn(e.x, e.z, e.yaw, pool.enemies[i].side);
    }
    let n = 0;
    for (const step of pool.steps) {
      const age = t - step.t;
      if (!active || age < 0 || age >= LIFE) { step.t = -Infinity; continue; }
      for (let i = 0; i < PER_STEP; i++) {
        let fade: number;
        if (i < 2) {
          const a = age - i * .12;
          if (a < 0) continue;
          const size = .2 + a * 1.05;
          pool.pose.position.set(step.x, step.y + i * .004, step.z);
          pool.pose.rotation.set(-Math.PI / 2, 0, 0); pool.pose.scale.set(size * 2, size * 2, 1);
          fade = (1 - age / LIFE) * (i === 0 ? .9 : .6);
        } else {
          if (age > .28) continue;
          const a = (i - 2) * Math.PI / 2 + step.seed;
          pool.pose.position.set(step.x + Math.cos(a) * age * .65,
            step.y + age * 1.35 - age * age * 4.5, step.z + Math.sin(a) * age * .65);
          pool.pose.quaternion.copy(camera.quaternion); pool.pose.scale.set(.09, .14, 1);
          fade = (1 - age / .28) * .95;
        }
        pool.pose.updateMatrix(); pool.mesh.setMatrixAt(n, pool.pose.matrix);
        pool.fades.setX(n, fade); pool.styles.setX(n++, i < 2 ? 0 : 1);
      }
    }
    pool.mesh.count = n; pool.mesh.visible = n > 0;
    if (n) {
      pool.mesh.instanceMatrix.needsUpdate = true;
      pool.fades.needsUpdate = pool.styles.needsUpdate = true;
    }
  });
  return <primitive object={pool.mesh} />;
}
