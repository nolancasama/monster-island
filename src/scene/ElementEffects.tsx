import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { cb, currentCombatZone, type Fx } from "../game/combat";
import { COMBAT, ENEMIES } from "../game/data/combat";
import { rt } from "../game/runtime";
import { getGame } from "../game/store";
import { standY } from "../game/world/collision";
import { ELEMENT_OBJECTS } from "../game/world/elementObjects";
import { splashParticle } from "./splashParticle";
import { anchors, fireStreamBase } from "./anchors";
import { emptyBodyPose, enemyBodyPose, PANIC_LIMBS } from "./panicPose";
import { whipPoints } from "../game/logic/whip";
import { createWindFrame, stepWindFrame } from "../game/logic/wind";
import { inCone } from "../game/logic/elements";
import { groundY } from "../game/world/island";
import { SHALLOW_WATER_DEPTH, shallowWaterAt } from "../game/world/groveShallows";

// Shared batches, including a separate translucent steam batch; empty batches submit none.
// All instance buffers and scratch objects are allocated at mount time.
const CAP = 768;
const TAU = Math.PI * 2;
const WHIP_POINTS = 19;
const STEAM_CAP = 6;
// Model body heights, before enemyBodyPose's squash, scale and lift.
const BODY_HEIGHT = { gloomlet: .82, snapjaw: 1.06, shellback: 1.07, forestSpitter: .92,
  stormCrab: 1.01, thunderBeetle: .93, windSprite: 1.37, raiderDrone: 1.24, raiderShooter: 1.35 };

/** Written together after rig sampling; e2e reads one completed rendered frame. */
export const whipFrame = {
  frame: 0, time: 0, drawn: false,
  base: { x: 0, y: 0, z: 0 }, handR: { x: 0, y: 0, z: 0 }
};

const gustFrameState = {
  frame: 0, time: 0, id: -1, drawn: false, attached: false, beakValid: false,
  yaw: 0, length: 0,
  root: { x: 0, y: 0, z: 0 }, beak: { x: 0, y: 0, z: 0 }
};
/** Same rendered frame as the sampled rig; consumers receive a read-only view. */
export const gustFrame: Readonly<Omit<typeof gustFrameState, "root" | "beak">> & {
  readonly root: Readonly<typeof gustFrameState.root>;
  readonly beak: Readonly<typeof gustFrameState.beak>;
} = gustFrameState;

class Batch {
  mesh: THREE.InstancedMesh;
  alpha: THREE.InstancedBufferAttribute;
  style: THREE.InstancedBufferAttribute;
  n = 0;
  constructor(geometry: THREE.BufferGeometry, material: THREE.Material) {
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(CAP), 1);
    this.style = new THREE.InstancedBufferAttribute(new Float32Array(CAP), 1);
    geometry.setAttribute("fade", this.alpha);
    geometry.setAttribute("style", this.style);
    this.mesh = new THREE.InstancedMesh(geometry, material, CAP);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3).fill(1), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
  }
  put(o: THREE.Object3D, color: THREE.Color, alpha = 1, style = 0) {
    o.updateMatrix();
    this.putMatrix(o.matrix, color, alpha, style);
  }
  putMatrix(matrix: THREE.Matrix4, color: THREE.Color, alpha = 1, style = 0) {
    if (this.n === CAP) return;
    this.mesh.setMatrixAt(this.n, matrix);
    this.mesh.setColorAt(this.n, color);
    this.alpha.setX(this.n, alpha);
    this.style.setX(this.n++, style);
  }
  flush() {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.alpha.needsUpdate = this.style.needsUpdate = true;
    this.n = 0;
  }
  dispose() {
    this.mesh.geometry.dispose();
    const material = this.mesh.material;
    if (material instanceof THREE.MeshBasicMaterial) material.map?.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

function fadedMaterial(color: string, opacity: number) {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true });
  m.onBeforeCompile = shader => {
    shader.vertexShader = "attribute float fade; varying float vFade;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvFade = fade;");
    shader.fragmentShader = "varying float vFade;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.a *= vFade;");
  };
  return m;
}

function spriteMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: `
      attribute float fade;
      attribute float style;
      varying vec2 vUv;
      varying vec3 vColor;
      varying float vFade;
      varying float vStyle;
      void main() {
        vUv = uv; vColor = instanceColor; vFade = fade; vStyle = style;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.);
      }`,
    fragmentShader: `
      varying vec2 vUv;
      varying vec3 vColor;
      varying float vFade;
      varying float vStyle;
      void main() {
        vec2 p = vUv * 2. - 1.;
        float a;
        vec3 c = vColor;
        if (vStyle > .5) {
          // Broad hot base, narrow curling tip: a flame rather than a glow dot.
          float y = vUv.y;
          float width = max(.02, sin(pow(y, .6) * 3.14159) * .72);
          float x = p.x + sin(y * 7.) * .16 * y;
          a = (1. - smoothstep(width * .25, width, abs(x))) * smoothstep(0., .12, y) * (1. - smoothstep(.8, 1., y));
          if (vStyle > 1.5) {
            // A separate palette: tinting the yellow core turns blue green.
            float core = (1. - smoothstep(0., width * .72, abs(x))) * (1. - y);
            c = mix(vec3(.015, .045, .8), vec3(.015, .48, 1.), core);
            c = mix(c, vec3(.42, .82, 1.), pow(core, 3.) * .65);
          } else {
            c = mix(c, vec3(1., .95, .36), (1. - y) * .75);
          }
        } else {
          a = pow(max(0., 1. - dot(p, p)), 2.);
        }
        gl_FragColor = vec4(c, a * vFade);
        if (gl_FragColor.a < .01) discard;
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
}

function bubbleMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: `
      attribute float fade;
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vEye;
      varying float vFade;
      void main() {
        vec4 p = modelViewMatrix * instanceMatrix * vec4(position, 1.);
        vNormal = normalize(mat3(modelViewMatrix) * mat3(instanceMatrix) * normal);
        vEye = -p.xyz; vColor = instanceColor; vFade = fade;
        gl_Position = projectionMatrix * p;
      }`,
    fragmentShader: `
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vEye;
      varying float vFade;
      void main() {
        vec3 n = normalize(vNormal);
        float rim = pow(1. - abs(dot(n, normalize(vEye))), 2.);
        float shine = pow(max(0., dot(n, normalize(vec3(-.5,.8,1.)))), 28.);
        gl_FragColor = vec4(vColor + shine * .65, (.08 + rim * .55 + shine * .55) * vFade);
      }`,
    transparent: true, depthWrite: false
  });
}

function steamMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: `
      attribute float fade;
      varying vec2 vUv;
      varying float vFade;
      void main() {
        vUv = uv; vFade = fade;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.);
      }`,
    fragmentShader: `
      varying vec2 vUv;
      varying float vFade;
      void main() {
        vec2 p = vUv * 2. - 1.;
        // A soft, full cloud silhouette instead of an additive glow or spawn smoke mesh.
        float a = 1. - smoothstep(.38, 1., length(p));
        gl_FragColor = vec4(.96, .975, .98, a * vFade);
        if (gl_FragColor.a < .01) discard;
      }`,
    transparent: true, depthWrite: false
  });
}

function panicSpeechMaterial() {
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 192;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fffbea"; ctx.strokeStyle = "#45344d"; ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.roundRect(8, 8, 496, 142, 40);
  ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(110, 146); ctx.lineTo(88, 184); ctx.lineTo(160, 149); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.font = "bold 72px 'Comic Sans MS', 'Chalkboard SE', sans-serif"; ctx.fillStyle = "#c2360f";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("I am hot!", 256, 80);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = fadedMaterial("#ffffff", 1);
  material.map = texture;
  return material;
}

function makePool() {
  const tube = new THREE.CylinderGeometry(.9, 1, 1, 7, 1);
  tube.rotateX(Math.PI / 2);
  const shell = new THREE.ConeGeometry(1, 1, 24, 1, true);
  const ring = new THREE.RingGeometry(.88, 1, 40);
  ring.rotateX(-Math.PI / 2);
  const pool = {
    sprites: new Batch(new THREE.PlaneGeometry(1, 1), spriteMaterial()),
    steam: new Batch(new THREE.PlaneGeometry(1, 1), steamMaterial()),
    bubbles: new Batch(new THREE.SphereGeometry(1, 20, 12), bubbleMaterial()),
    vines: new Batch(tube, new THREE.MeshLambertMaterial({ color: "#ffffff", flatShading: true })),
    roots: new Batch(tube.clone(), new THREE.MeshLambertMaterial({ color: "#ffffff", flatShading: true })),
    shells: new Batch(shell, fadedMaterial("#e4faff", .22)),
    rings: new Batch(ring, fadedMaterial("#ffffff", .8)),
    streaks: new Batch(new THREE.TorusGeometry(1, .035, 4, 18, Math.PI * 1.35), fadedMaterial("#e5faff", .6)),
    limbs: new Batch(new THREE.CapsuleGeometry(1, 1, 1, 3), new THREE.MeshLambertMaterial({ color: "#ffffff", flatShading: true })),
    speech: new Batch(new THREE.PlaneGeometry(1, 1), panicSpeechMaterial())
  };
  pool.rings.mesh.renderOrder = 3;
  return pool;
}

export function ElementEffects() {
  const pool = useMemo(makePool, []);
  const batches = useMemo(() => Object.values(pool), [pool]);
  const o = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const direction = useMemo(() => new THREE.Vector3(), []);
  const droplet = useMemo(() => new THREE.Vector3(), []);
  const forward = useMemo(() => new THREE.Vector3(0, 0, 1), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const bodyPose = useMemo(emptyBodyPose, []);
  const bodyRoot = useMemo(() => new THREE.Object3D(), []);
  const bodyFrame = useMemo(() => {
    const frame = new THREE.Object3D(); bodyRoot.add(frame); return frame;
  }, [bodyRoot]);
  const point = useMemo(() => new THREE.Vector3(), []);
  const streamBase = useMemo(() => new THREE.Vector3(), []);
  const stream = useMemo(() => ({ active: false, age: 0, stoppedAt: -Infinity, inferno: false }), []);
  // At most 24 Fx can be alive; slots are selected by id and reused at mount time.
  const winds = useMemo(() => Array.from({ length: 24 }, createWindFrame), []);
  // Reuse six event slots; a newer quench replaces the oldest visible event.
  const steams = useMemo<(Fx | null)[]>(() => Array(STEAM_CAP).fill(null), []);
  const roots = useMemo(() => Array.from({ length: CAP }, () => ({ x: 0, z: 0, y: 0, t: -1, end: -1, zone: "", height: 1, radius: .5 })), []);
  const curve = useMemo(() => new Float32Array(WHIP_POINTS * 3), []);
  const rootCurve = useMemo(() => new Float32Array(8 * 3), []);
  const whipTip = useMemo(() => new THREE.Vector3(), []);
  const whipFacing = useMemo(() => ({ x: 0, z: 1 }), []);
  const whipVisual = useMemo(() => Array.from({ length: 2 }, () => ({
    t0: -1, retract: -1, cancel: -1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0
  })), []);
  const { camera } = useThree();
  useEffect(() => () => { for (const b of batches) b.dispose(); }, [batches]);

  // Helpers are stable for this mounted pool; none are created in useFrame.
  const draw = useMemo(() => ({
    sprite(x: number, y: number, z: number, w: number, h: number, tint: string, alpha: number, flame: boolean | 2 = false) {
      o.position.set(x, y, z); o.quaternion.copy(camera.quaternion); o.scale.set(w, h, 1);
      pool.sprites.put(o, color.set(tint), alpha, flame === 2 ? 2 : flame ? 1 : 0);
    },
    ring(x: number, y: number, z: number, radius: number, tint: string, alpha: number, upright = false) {
      if (!upright && rt.world === "home" && rt.player.layer === "ground" && shallowWaterAt(x, z))
        y = Math.max(y, groundY(x, z) + SHALLOW_WATER_DEPTH + .035);
      o.position.set(x, y, z); o.rotation.set(upright ? Math.PI / 2 : 0, 0, 0); o.scale.setScalar(radius);
      pool.rings.put(o, color.set(tint), alpha);
    },
    bubble(x: number, y: number, z: number, radius: number) {
      o.position.set(x, y, z); o.rotation.set(0, 0, 0); o.scale.setScalar(radius);
      pool.bubbles.put(o, color.set("#9eeaff"));
    },
    limb(x: number, y: number, z: number, rx: number, rz: number, length: number, width: number, tint: string) {
      o.position.set(x, y, z); o.rotation.set(rx, 0, rz); o.scale.set(width, length / 3, width);
      o.updateMatrix(); o.matrix.premultiply(bodyFrame.matrixWorld);
      pool.limbs.putMatrix(o.matrix, color.set(tint));
    },
    speech(x: number, y: number, z: number, alpha: number) {
      o.position.set(x, y, z); o.quaternion.copy(camera.quaternion); o.scale.set(2.6, .975, 1);
      pool.speech.put(o, color.set("#ffffff"), alpha);
    },
    curve(points: Float32Array, n: number, batch: Batch, baseRadius: number, tipRadius: number, root?: THREE.Vector3) {
      for (let i = 0; i < n - 1 && batch.n < CAP; i++) {
        const j = i * 3, k = i / (n - 2);
        // The live hand stays in double precision even though the reusable curve is float32.
        const x = i === 0 && root ? root.x : points[j];
        const y = i === 0 && root ? root.y : points[j + 1];
        const z = i === 0 && root ? root.z : points[j + 2];
        const dx = points[j + 3] - x, dy = points[j + 4] - y, dz = points[j + 5] - z;
        const length = Math.hypot(dx, dy, dz);
        if (length < .00001) continue;
        direction.set(dx / length, dy / length, dz / length);
        o.quaternion.setFromUnitVectors(forward, direction);
        o.position.set(x + dx * .5, y + dy * .5, z + dz * .5);
        const radius = baseRadius + (tipRadius - baseRadius) * k;
        o.scale.set(radius, radius, length * 1.035);
        if (batch === pool.vines) color.setRGB(.07 + k * .16, .24 + k * .3, .035 + k * .07);
        else color.setRGB(.22 + k * .12, .11 + k * .14, .035 + k * .025);
        batch.put(o, color);
      }
    },
    leaves(points: Float32Array, n: number) {
      for (let i = 0; i < 3; i++) {
        const j = (4 + i * 5) * 3, side = i % 2 ? 1 : -1;
        direction.set(side * .7, .35, .5).normalize();
        o.quaternion.setFromUnitVectors(forward, direction);
        o.position.set(points[j] + side * .06, points[j + 1] + .025, points[j + 2]);
        o.scale.set(.095, .025, .24 * (1 - i / n));
        pool.vines.put(o, color.set("#91d45c"));
      }
    },
    splash(x: number, y: number, z: number, id: number, age: number, alpha: number, fall = false) {
      for (let i = 0; i < 14; i++) {
        splashParticle(x, y, z, id, i, age, droplet);
        if (fall) droplet.y = y + age * .6 - age * age;
        draw.sprite(droplet.x, droplet.y, droplet.z, fall ? .5 : .24, fall ? .5 : .34, "#e8fbff", alpha);
      }
    }
  }), [bodyFrame, camera, color, direction, droplet, forward, o, pool]);

  useFrame(() => {
    const t = rt.time, game = getGame(), zone = currentCombatZone();
    const active = game.progress.act2.started;
    whipFrame.frame++; whipFrame.time = t; whipFrame.drawn = false;
    whipFrame.handR.x = anchors.leafyHandR.x;
    whipFrame.handR.y = anchors.leafyHandR.y;
    whipFrame.handR.z = anchors.leafyHandR.z;
    gustFrameState.frame++; gustFrameState.time = t; gustFrameState.drawn = false;
    gustFrameState.attached = false; gustFrameState.length = 0;
    gustFrameState.beakValid = anchors.puffBeakValid;
    gustFrameState.beak.x = anchors.puffBeak.x;
    gustFrameState.beak.y = anchors.puffBeak.y;
    gustFrameState.beak.z = anchors.puffBeak.z;
    if (active) {
      // Environmental fire uses the same instanced flame sprites as Ember.
      // Read the backing runtime records to avoid allocating semantic snapshots per frame.
      if (cb.world === "home") for (const object of ELEMENT_OBJECTS) {
        const state = cb.elementObjects[object.id]?.state;
        const complete = game.progress.act2.secrets.includes(object.id);
        if (complete && object.id !== "comboFurnace") continue;
        if (!complete && state !== "burning" && state !== "lit") continue;
        if (Math.hypot(object.x - rt.player.x, object.z - rt.player.z) > 48) continue;
        const y = standY(object.x, object.z, game.progress.solved, object.layer ?? "ground");
        if (object.id === "comboFurnace") {
          draw.sprite(object.x, y + .45, object.z + .75, 1.4, .8, "#ff7923", .65);
          if (complete) {
            for (let i = 0; i < 3; i++) draw.sprite(object.x - .3 + i * .3, y + .4, object.z + .4,
              .13, .13, "#ffb82e", .65 + Math.sin(t * 3 + i) * .15);
            continue;
          }
        }
        for (let i = 0; i < 5; i++) {
          const a = i * 2.4 + t * .7, r = state === "burning" ? .5 : .26;
          draw.sprite(object.x + Math.cos(a) * r, y + .55 + (i % 2) * .28,
            object.z + Math.sin(a) * r + (state === "lit" ? .3 : 0),
            .48, .95 + Math.sin(t * 19 + i) * .18, i % 2 ? "#ffb82e" : "#ff7923", .95, true);
        }
      }
      for (const s of cb.shots) {
        if (Math.hypot(s.x - rt.player.x, s.z - rt.player.z) > 48) continue;
        if (s.hostile || s.shape === "hostile") {
          const kind = s.source === undefined ? null : cb.enemies[s.source]?.kind;
          draw.sprite(s.x, s.y, s.z, s.radius * 2.4, s.radius * 2.4,
            kind === "forestSpitter" ? "#b2dc60" : kind === "raiderShooter" ? "#ff4055" : "#e5faff", .9);
        } else if (s.shape === "trap" || s.shape === "bomb") {
          draw.bubble(s.x, s.y, s.z, s.shape === "bomb" ? Math.max(.65, s.radius) : Math.max(.24, s.radius));
        }
      }
      let panicCount = 0, speechCount = 0;
      for (let enemyIndex = 0; enemyIndex < cb.enemies.length; enemyIndex++) {
        const e = cb.enemies[enemyIndex];
        if (e.zone !== zone || e.state === "gone" || e.state === "dormant" || e.state === "materialising" || Math.hypot(e.x - rt.player.x, e.z - rt.player.z) > 48) continue;
        if (e.plunge) continue;
        const ground = standY(e.x, e.z, game.progress.solved);
        const y = ground + e.air, radius = ENEMIES[e.kind].radius;
        enemyBodyPose(e, t, bodyPose);
        bodyRoot.position.set(e.x, ground, e.z); bodyRoot.rotation.set(0, e.yaw, 0);
        bodyFrame.position.set(bodyPose.shake, e.air + bodyPose.hop, 0);
        bodyFrame.rotation.set(bodyPose.lean, bodyPose.spin, bodyPose.roll);
        bodyFrame.scale.set(bodyPose.scale / Math.sqrt(bodyPose.squash), bodyPose.scale * bodyPose.squash, bodyPose.scale / Math.sqrt(bodyPose.squash));
        bodyRoot.updateMatrixWorld(true);
        const panicking = e.panic !== null && e.panic.until > t && e.state !== "ko";
        const fullPanic = panicking && panicCount++ < 8;
        if (e.control?.kind === "trapped") {
          draw.bubble(e.x + Math.sin(t * 8 + e.i) * .05, y + .65, e.z, Math.max(.85, radius * 1.5));
        }
        if (e.burn && e.burn.until > t) {
          const blue = e.infernoBlueUntil > t;
          const burnFade = Math.min(1, (e.burn.until - t) / .25);
          // Cloaks the body: sized from its radius, and nudged toward the camera so
          // the mesh does not swallow them.
          // Panic can recover before the burn expires; only burn.until fades its flames.
          const flames = 6;
          for (let i = 0; i < flames; i++) {
            const a = t * 2 + i * TAU / flames;
            point.set(Math.cos(a) * radius * 1.15, .25 + (i % 3) * .3, Math.sin(a) * radius * 1.15).applyMatrix4(bodyFrame.matrixWorld);
            direction.subVectors(camera.position, point).normalize().multiplyScalar(radius * .35);
            draw.sprite(point.x + direction.x, point.y + direction.y, point.z + direction.z,
              .42 + radius * .6, .85 + radius * .9 + Math.sin(t * 22 + i) * .18, blue ? "#1687ff" : i % 2 ? "#f2611a" : "#ffb22e", .62 * burnFade, blue ? 2 : true);
          }
        }
        if (panicking) {
          const age = t - e.panic!.t0, limb = PANIC_LIMBS[e.kind];
          if (age < 1.6 && speechCount < 3) {
            speechCount++;
            point.set(0, 1.85, 0).applyMatrix4(bodyFrame.matrixWorld);
            draw.speech(point.x, point.y, point.z, Math.min(1, (1.6 - age) / .15));
          }
          if (fullPanic) for (let i = 0; i < limb.count; i++) {
            const side = i % 2 ? 1 : -1, wave = Math.sin(age * 24 + i * 2 + e.i);
            const x = side * radius * .85, z = limb.count === 4 ? (i < 2 ? .3 : -.3) : .1;
            const rx = limb.style === "paddle" ? wave * .9 : limb.style === "legs" ? wave * .7 : .1;
            const rz = limb.style === "wings" ? side * (1.1 + wave * .65) : limb.style === "legs" ? side * (1 + wave * .4) : side * (.25 + wave * .45);
            draw.limb(x, limb.height + (limb.style === "arms" || limb.style === "pincers" ? limb.length * .3 : 0), z, rx, rz, limb.length, limb.width, limb.color);
            if (limb.style === "pincers") {
              const snap = .2 + (wave + 1) * .2;
              draw.limb(x + side * .06, limb.height + .4, z, 0, side * snap, .17, .06, limb.color);
              draw.limb(x - side * .06, limb.height + .4, z, 0, -side * snap, .17, .06, limb.color);
            }
          }
        }
        if (e.control?.kind === "snared") {
          const r = roots[enemyIndex];
          if (r) {
            if (r.t !== e.control.t0 || r.zone !== e.zone) {
              r.x = e.x; r.y = ground; r.z = e.z; r.t = e.control.t0; r.zone = e.zone;
              r.height = BODY_HEIGHT[e.kind] * .8; r.radius = radius;
            }
            r.end = e.control.until;
          }
        } else {
          const r = roots[enemyIndex];
          if (r && r.end > t) r.end = t;
        }
      }
      let rootCount = 0;
      for (const r of roots) if (r.zone === zone && r.t >= 0 && t <= r.end + .22) rootCount++;
      // Whole roots get a fair share of the existing instance budget, even in a crowd.
      const rootSegments = rootCount * 42 <= CAP ? 7 : 6;
      const rootLimit = Math.min(6, Math.floor(CAP / Math.max(1, rootCount) / rootSegments));
      for (const r of roots) {
        if (r.zone !== zone || r.t < 0 || t > r.end + .22) continue;
        const rise = Math.min(1, (t - r.t) / .18), retract = Math.min(1, Math.max(0, (r.end + .22 - t) / .22));
        const k = Math.max(0, rise * retract);
        draw.ring(r.x, r.y + .035, r.z, .95, "#87b94b", k * .65);
        for (let i = 0; i < rootLimit; i++) {
          const a = i / rootLimit * TAU;
          for (let j = 0; j <= rootSegments; j++) {
            // Reveal along a helix: the foot never leaves its ground ring.
            const u = j / rootSegments * k, angle = a + u * Math.PI * 1.35;
            const radius = r.radius + .42 * (1 - u) * (1 - u);
            rootCurve[j * 3] = r.x + Math.cos(angle) * radius;
            rootCurve[j * 3 + 1] = r.y + r.height * u;
            rootCurve[j * 3 + 2] = r.z + Math.sin(angle) * radius;
          }
          draw.curve(rootCurve, rootSegments + 1, pool.roots, .12 * Math.min(1, k * 4), .018);
        }
      }
      const whip = cb.whip;
      if (whip) {
        const age = Math.max(0, t - whip.t0), p = rt.player;
        const yaw = whip.struck ? whip.yaw : p.yaw;
        whipFacing.x = Math.sin(yaw); whipFacing.z = Math.cos(yaw);
        for (let i = 0; i < whip.strands.length; i++) {
          const strand = whip.strands[i], visual = whipVisual[i];
          const root = strand.hand === "R" ? anchors.leafyHandR : anchors.leafyHandL;
          if (strand.hand === "R" ? !anchors.leafyHandRValid : !anchors.leafyHandLValid) continue;
          if (visual.t0 !== whip.t0) {
            visual.t0 = whip.t0; visual.retract = visual.cancel = -1;
            visual.x = visual.z = 0; visual.y = .15;
          }
          const cancelled = whip.cancelAt !== null;
          const retracting = whip.retractAt !== null && t >= whip.retractAt;
          let tension = 0;
          if (cancelled || retracting) {
            const start = cancelled ? whip.cancelAt! : whip.retractAt!;
            if ((cancelled ? visual.cancel : visual.retract) !== start) {
              visual.rx = visual.x; visual.ry = visual.y; visual.rz = visual.z;
              if (cancelled) visual.cancel = start; else visual.retract = start;
            }
            const k = Math.max(0, 1 - (t - start) / (cancelled ? .1 : .26));
            whipTip.set(root.x + visual.rx * k, root.y + visual.ry * k + Math.sin(k * Math.PI) * .28, root.z + visual.rz * k);
          } else {
            let enemy = null;
            if (strand.enemy !== null) for (const candidate of cb.enemies) if (candidate.i === strand.enemy) { enemy = candidate; break; }
            let object = null;
            if (strand.object !== null) for (const candidate of ELEMENT_OBJECTS) if (candidate.id === strand.object) { object = candidate; break; }
            if (enemy && enemy.zone === zone) {
              const ground = standY(enemy.x, enemy.z, game.progress.solved);
              enemyBodyPose(enemy, t, bodyPose);
              bodyRoot.position.set(enemy.x, ground, enemy.z); bodyRoot.rotation.set(0, enemy.yaw, 0);
              bodyFrame.position.set(bodyPose.shake, enemy.air + bodyPose.hop, 0);
              bodyFrame.rotation.set(bodyPose.lean, bodyPose.spin, bodyPose.roll);
              bodyFrame.scale.set(bodyPose.scale / Math.sqrt(bodyPose.squash), bodyPose.scale * bodyPose.squash, bodyPose.scale / Math.sqrt(bodyPose.squash));
              bodyRoot.updateMatrixWorld(true);
              whipTip.set(0, BODY_HEIGHT[enemy.kind] * .55, 0).applyMatrix4(bodyFrame.matrixWorld);
              const c = enemy.control;
              if (whip.struck && c?.kind === "grabbed") tension = .92;
            } else if (object) {
              whipTip.set(object.x, standY(object.x, object.z, game.progress.solved, object.layer ?? "ground") + .6, object.z);
            } else {
              whipTip.set(p.x + whipFacing.x * COMBAT.leafy.basic.range, p.y + .9, p.z + whipFacing.z * COMBAT.leafy.basic.range);
            }
            if (age < .15) {
              const extension = Math.max(0, Math.min(1, (age - .07) / .08));
              const k = extension * extension * (3 - 2 * extension);
              const back = .25 + Math.sin(Math.min(1, age / .07) * Math.PI) * .45;
              const x = root.x - whipFacing.x * back, y = root.y + .5, z = root.z - whipFacing.z * back;
              whipTip.set(x + (whipTip.x - x) * k, y + (whipTip.y - y) * k, z + (whipTip.z - z) * k);
            } else if (tension === 0) {
              const follow = Math.sin(Math.min(1, (age - .15) / .09) * Math.PI) * .23;
              whipTip.x += whipFacing.x * follow; whipTip.z += whipFacing.z * follow;
            }
          }
          whipPoints(curve, WHIP_POINTS, root, whipTip, whipFacing, age, tension);
          draw.curve(curve, WHIP_POINTS, pool.vines, .058, .016, root);
          draw.leaves(curve, WHIP_POINTS);
          visual.x = whipTip.x - root.x; visual.y = whipTip.y - root.y; visual.z = whipTip.z - root.z;
          if (strand.hand === "R") {
            whipFrame.drawn = true;
            whipFrame.base.x = root.x; whipFrame.base.y = root.y; whipFrame.base.z = root.z;
          }
        }
      }
      const fire = cb.inferno ?? cb.breath;
      if (fire) {
        stream.active = true; stream.age = fire.age; stream.inferno = cb.inferno !== null;
      } else if (stream.active) { stream.active = false; stream.stoppedAt = t; }
      const streamFade = fire ? 1 : Math.max(0, 1 - (t - stream.stoppedAt) / .12);
      if (streamFade > 0 && anchors.emberMouthValid) {
        fireStreamBase(streamBase);
        const age = stream.age, yaw = rt.player.yaw, ux = Math.sin(yaw), uz = Math.cos(yaw);
        const range = (stream.inferno ? COMBAT.ember.special.range : COMBAT.ember.basic.range) * (game.progress.act2.upgrades.includes("ember") ? COMBAT.ember.upgrade.size : 1);
        for (let i = 0; i < 24; i++) {
          const p = i === 0 ? 0 : ((i - 1 + age * 24) % 23) / 23;
          const d = p * range, flutter = Math.sin(i * 2.4 + t * 19);
          // Fills the real cone (tan of the half-angle) so what looks hit is hit.
          const side = (i * .618) % 1 * 2 - 1;
          const spread = (side + flutter * .18) * d * (stream.inferno ? .72 : .36);
          const size = (stream.inferno ? .5 : .36) + p * (stream.inferno ? 1.5 : 1);
          // Additive overlap near the mouth blows out to white: start faint, hold the colour.
          const alpha = .34 + Math.min(1, p * 2.5) * .3 - p * p * .2;
          draw.sprite(streamBase.x + ux * d + uz * spread, streamBase.y + p * (stream.inferno ? .4 : .12) - p * .35, streamBase.z + uz * d - ux * spread,
            size, size * (stream.inferno ? 1.6 : 1.3) * (1 + flutter * .08), stream.inferno ? "#1687ff" : i % 3 ? "#f2611a" : "#ffb22e", streamFade * alpha, stream.inferno ? 2 : true);
        }
        if (stream.inferno) {
          draw.sprite(streamBase.x, streamBase.y, streamBase.z, .68, .68, "#126dff", .35 * streamFade);
          // Only recent real hits sparkle, so scenery cannot imply damage through a wall.
          for (const e of cb.enemies) {
            if (e.zone !== zone || e.state === "gone" || e.state === "dormant" || e.state === "materialising" || t - e.lastFireT > .16) continue;
            for (let i = 0; i < 3; i++) {
              const a = t * 23 + i * TAU / 3;
              draw.sprite(e.x + Math.sin(a) * .45, standY(e.x, e.z, game.progress.solved) + e.air + .65 + Math.cos(a) * .3,
                e.z + Math.cos(a) * .45, .16, .27, "#167eff", streamFade * .8);
            }
          }
          if (fire && cb.world === "home") for (const object of ELEMENT_OBJECTS) {
            const state = cb.elementObjects[object.id]?.state;
            if (!object.on?.burn || object.world !== cb.world || (state !== "burning" && state !== "lit")
              || !inCone(rt.player, yaw, object, range + object.r, 80)) continue;
            const y = standY(object.x, object.z, game.progress.solved, object.layer ?? "ground");
            for (let i = 0; i < 3; i++) {
              const a = t * 23 + i * TAU / 3;
              draw.sprite(object.x + Math.sin(a) * object.r, y + .6 + Math.cos(a) * .3, object.z + Math.cos(a) * object.r,
                .16, .27, "#167eff", streamFade * .8);
            }
          }
        }
      }
      const cyclone = cb.cyclone;
      if (cyclone && anchors.puffBeakValid) {
        const growth = Math.min(1, cyclone.age / .3);
        const x = anchors.puffBeak.x + (cyclone.x - anchors.puffBeak.x) * growth;
        const z = anchors.puffBeak.z + (cyclone.z - anchors.puffBeak.z) * growth;
        const y = anchors.puffBeak.y + (standY(cyclone.x, cyclone.z, game.progress.solved) - anchors.puffBeak.y) * growth;
        const fade = Math.min(1, Math.max(0, (4 - cyclone.age) * 3));
        for (let i = 0; i < 3; i++) {
          const a = t * (4 + i) + i * TAU / 3;
          o.position.set(x + Math.cos(a) * .12 * growth, y + (.3 + i * .65) * growth, z + Math.sin(a) * .12 * growth);
          o.rotation.set(Math.PI, a, Math.sin(a) * .08);
          o.scale.set((.45 + i * .35) * growth, 1.25 * growth, (.45 + i * .35) * growth);
          pool.shells.put(o, color.set("#d3f4ff"), fade);
          o.position.y += .25 * growth; o.rotation.set(Math.PI / 2, a, a); o.scale.setScalar((.45 + i * .35) * growth);
          pool.streaks.put(o, color.set("#ffffff"), fade);
        }
        draw.ring(x, y + .045, z, (1.25 + Math.sin(t * 15) * .08) * growth, "#d6c9a2", fade * .6 * growth);
        for (let i = 0; i < 8; i++) {
          const a = t * 5 + i * TAU / 8;
          draw.sprite(x + Math.cos(a) * 1.15 * growth, y - .25, z + Math.sin(a) * 1.15 * growth, .45 * growth, .22 * growth, "#d6c9a2", fade * .4 * growth);
        }
      }
      steams.fill(null);
      for (const f of cb.fx) {
        const age = t - f.t0, k = age / f.life;
        if (k < 0 || k >= 1 || Math.hypot(f.x - rt.player.x, f.z - rt.player.z) > 48) continue;
        const fade = Math.min(1, (1 - k) * 3);
        if (f.kind === "blast" || f.kind === "gust") {
          let x = f.x, y = f.y, z = f.z, yaw = f.yaw;
          let len = f.size * Math.min(1, age * 9);
          if (f.kind === "blast") {
            let wind = winds[0];
            for (const candidate of winds) {
              if (candidate.id === f.id && candidate.t0 === f.t0) { wind = candidate; break; }
              let occupied = false;
              for (const live of cb.fx) if (live.id === candidate.id && live.t0 === candidate.t0) { occupied = true; break; }
              if (!occupied) wind = candidate;
            }
            stepWindFrame(wind, f, t, anchors.puffBeak, anchors.puffBeakValid);
            if (!wind.drawn) continue;
            x = wind.x; y = wind.y; z = wind.z; yaw = wind.yaw; len = wind.length;
            gustFrameState.id = f.id; gustFrameState.drawn = true;
            gustFrameState.attached = wind.attached; gustFrameState.yaw = yaw; gustFrameState.length = len;
            gustFrameState.root.x = x; gustFrameState.root.y = y; gustFrameState.root.z = z;
          }
          o.position.set(x, y, z);
          direction.set(-Math.sin(yaw), 0, -Math.cos(yaw));
          o.quaternion.setFromUnitVectors(up, direction);
          o.translateY(-len / 2); o.scale.set(len * .5, len, len * .23);
          pool.shells.put(o, color.set("#e4faff"), fade * .6);
          for (let i = 0; i < 7; i++) {
            const d = f.kind === "blast" ? i === 0 ? 0 : len * (((i - 1) / 6 + age * 2) % 1) : f.size * ((i / 7 + age * 2) % 1);
            o.position.set(x + Math.sin(yaw) * d, y, z + Math.cos(yaw) * d);
            o.rotation.set(0, yaw, t * 9 + i); o.scale.set(.15 + d * .42, .1 + d * .18, 1);
            pool.streaks.put(o, color.set("#e4faff"), fade);
          }
        } else if (f.kind === "bomb" || f.kind === "trap" || f.kind === "splashKo") {
          if (f.kind === "bomb") draw.ring(f.x, f.y, f.z, .3 + f.size * k, "#9eeaff", 1 - k);
          draw.splash(f.x, f.y, f.z, f.id, age, fade, f.kind === "splashKo");
        } else if (f.kind === "steam") {
          let oldest = 0;
          for (let i = 0; i < STEAM_CAP; i++) {
            if (!steams[i]) { oldest = i; break; }
            if (steams[i]!.t0 < steams[oldest]!.t0 || (steams[i]!.t0 === steams[oldest]!.t0 && steams[i]!.id < steams[oldest]!.id)) oldest = i;
          }
          const previous = steams[oldest];
          if (!previous || f.t0 > previous.t0 || (f.t0 === previous.t0 && f.id > previous.id)) steams[oldest] = f;
        } else if (f.kind === "snare") {
          draw.ring(f.x, standY(f.x, f.z, game.progress.solved) + .04, f.z, f.size * Math.min(1, k * 4), "#8ec15a", (1 - k) * .65);
        } else if (f.kind === "shrug") {
          if (age < .22) draw.ring(f.x, f.y, f.z, .4 + age * 3, "#ffffff", 1 - age / .22, true);
        } else if (f.kind === "hit" || f.kind === "ko" || f.kind === "eat") {
          draw.sprite(f.x, f.y + k * .3, f.z, 1.2 * (1 - k * .5), 1.2 * (1 - k * .5), "#fff6c0", 1 - k);
        }
      }
      for (const f of steams) {
        if (!f) continue;
        const age = t - f.t0, k = age / f.life;
        const alpha = Math.min(1, age / .045) * Math.pow(1 - k, .8) * .72;
        for (let i = 0; i < 5; i++) {
          const angle = i * TAU / 5 + f.id;
          const spread = (.12 + k * .38) * f.size;
          const size = (.55 + k * .5) * f.size;
          o.position.set(f.x + Math.cos(angle) * spread, f.y + .08 + age * (1.1 + (i % 3) * .18) + (i % 2) * .18,
            f.z + Math.sin(angle) * spread);
          o.quaternion.copy(camera.quaternion); o.scale.set(size, size * .9, 1);
          pool.steam.put(o, color.set("#ffffff"), alpha);
        }
        if (age < .3) draw.ring(f.x, standY(f.x, f.z, game.progress.solved) + .045, f.z,
          (.3 + age * 2.6) * f.size, "#f4fafb", (1 - age / .3) * .7);
      }
    }
    for (const b of batches) b.flush();
  });

  return <group>{batches.map((b, i) => <primitive key={i} object={b.mesh} />)}</group>;
}
