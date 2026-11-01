import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { cb, currentCombatZone } from "../game/combat";
import { COMBAT, ENEMIES } from "../game/data/combat";
import { rt } from "../game/runtime";
import { monsterRootY } from "../game/ride";
import { getGame } from "../game/store";
import { standY } from "../game/world/collision";
import { ELEMENT_OBJECTS } from "../game/world/elementObjects";
import { splashParticle } from "./splashParticle";
import { anchors, fireStreamBase } from "./anchors";
import { emptyBodyPose, enemyBodyPose, PANIC_LIMBS } from "./panicPose";

// Existing seven batches plus panic limbs and speech; empty batches submit none.
// All instance buffers and scratch objects are allocated at mount time.
const CAP = 768;
const TAU = Math.PI * 2;

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
          c = mix(c, vec3(1., .95, .36), (1. - y) * .75);
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
  ctx.fillText("I'm on fire!", 256, 80);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = fadedMaterial("#ffffff", 1);
  material.map = texture;
  return material;
}

function makePool() {
  const tube = new THREE.CylinderGeometry(1, 1, 1, 7, 1);
  tube.rotateX(Math.PI / 2);
  const shell = new THREE.ConeGeometry(1, 1, 24, 1, true);
  const ring = new THREE.RingGeometry(.88, 1, 40);
  ring.rotateX(-Math.PI / 2);
  return {
    sprites: new Batch(new THREE.PlaneGeometry(1, 1), spriteMaterial()),
    bubbles: new Batch(new THREE.SphereGeometry(1, 20, 12), bubbleMaterial()),
    vines: new Batch(tube, new THREE.MeshLambertMaterial({ color: "#65bb47", flatShading: true })),
    roots: new Batch(new THREE.ConeGeometry(1, 1, 6), new THREE.MeshLambertMaterial({ color: "#9d713b", flatShading: true })),
    shells: new Batch(shell, fadedMaterial("#e4faff", .22)),
    rings: new Batch(ring, fadedMaterial("#ffffff", .8)),
    streaks: new Batch(new THREE.TorusGeometry(1, .035, 4, 18, Math.PI * 1.35), fadedMaterial("#e5faff", .6)),
    limbs: new Batch(new THREE.CapsuleGeometry(1, 1, 1, 3), new THREE.MeshLambertMaterial({ color: "#ffffff", flatShading: true })),
    speech: new Batch(new THREE.PlaneGeometry(1, 1), panicSpeechMaterial())
  };
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
  const roots = useMemo(() => Array.from({ length: CAP }, () => ({ x: 0, z: 0, y: 0, t: -1, end: -1, zone: "" })), []);
  const { camera } = useThree();
  useEffect(() => () => { for (const b of batches) b.dispose(); }, [batches]);

  // Helpers are stable for this mounted pool; none are created in useFrame.
  const draw = useMemo(() => ({
    sprite(x: number, y: number, z: number, w: number, h: number, tint: string, alpha: number, flame = false) {
      o.position.set(x, y, z); o.quaternion.copy(camera.quaternion); o.scale.set(w, h, 1);
      pool.sprites.put(o, color.set(tint), alpha, flame ? 1 : 0);
    },
    ring(x: number, y: number, z: number, radius: number, tint: string, alpha: number, upright = false) {
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
    vine(x: number, y: number, z: number, tx: number, ty: number, tz: number) {
      const dx = tx - x, dy = ty - y, dz = tz - z;
      const len = Math.hypot(dx, dy, dz);
      direction.set(dx, dy, dz).normalize();
      o.quaternion.setFromUnitVectors(forward, direction);
      // Rigid short segments give the vine knuckles without a soft-body solver.
      for (let i = 0; i < 9; i++) {
        const k = (i + .5) / 9;
        o.position.set(x + dx * k, y + dy * k, z + dz * k);
        o.scale.set(i % 2 ? .065 : .085, i % 2 ? .065 : .085, len / 9 * 1.04);
        pool.vines.put(o, color.set(i % 2 ? "#67b849" : "#387d35"));
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
    if (active) {
      // Environmental fire uses the same instanced flame sprites as Ember.
      // Read the backing runtime records to avoid allocating semantic snapshots per frame.
      if (cb.world === "home") for (const object of ELEMENT_OBJECTS) {
        const state = cb.elementObjects[object.id]?.state;
        const complete = game.progress.act2.secrets.includes(object.id);
        if (complete && object.id !== "comboFurnace") continue;
        if (!complete && state !== "burning" && state !== "lit") continue;
        if (Math.hypot(object.x - rt.player.x, object.z - rt.player.z) > 48) continue;
        const y = standY(object.x, object.z, game.progress.solved);
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
        if (e.zone !== zone || e.state === "gone" || Math.hypot(e.x - rt.player.x, e.z - rt.player.z) > 48) continue;
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
          // Cloaks the body: sized from its radius, and nudged toward the camera so
          // the mesh does not swallow them.
          const flames = fullPanic ? 6 : 3, big = fullPanic ? 1 : .75;
          for (let i = 0; i < flames; i++) {
            const a = t * 2 + i * TAU / flames;
            point.set(Math.cos(a) * radius * 1.15, .25 + (i % 3) * .3, Math.sin(a) * radius * 1.15).applyMatrix4(bodyFrame.matrixWorld);
            direction.subVectors(camera.position, point).normalize().multiplyScalar(radius * .35);
            draw.sprite(point.x + direction.x, point.y + direction.y, point.z + direction.z,
              (.42 + radius * .6) * big, (.85 + radius * .9 + Math.sin(t * 22 + i) * .18) * big, i % 2 ? "#f2611a" : "#ffb22e", .62, true);
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
        if (e.control?.kind === "grabbed") {
          const m = rt.monsters.leafy;
          let x = m.x, z = m.z, sy = monsterRootY(m, game.progress.solved, t);
          if (cb.stance.friend === "leafy" && cb.stance.k > 0) {
            const blend = cb.stance.k * cb.stance.k * (3 - 2 * cb.stance.k);
            const p = rt.player;
            x = cb.stance.fromX + (p.x - Math.sin(p.yaw) * .43 - cb.stance.fromX) * blend;
            z = cb.stance.fromZ + (p.z - Math.cos(p.yaw) * .43 - cb.stance.fromZ) * blend;
            const ground = standY(cb.stance.fromX, cb.stance.fromZ, game.progress.solved);
            sy = ground + (p.y + .74 - ground) * blend + Math.sin(blend * Math.PI) * .6;
          }
          draw.vine(x, sy + .45, z, e.x, y + .6, e.z);
        }
        if (e.control?.kind === "snared") {
          const r = roots[enemyIndex];
          if (r) {
            r.x = e.x; r.y = ground; r.z = e.z; r.t = e.control.t0; r.end = e.control.until; r.zone = e.zone;
          }
        } else {
          const r = roots[enemyIndex];
          if (r && r.end > t) r.end = t;
        }
      }
      for (const r of roots) {
        if (r.zone !== zone || r.t < 0 || t > r.end + .22) continue;
        const rise = Math.min(1, (t - r.t) / .18), retract = Math.min(1, Math.max(0, (r.end + .22 - t) / .22));
        const k = Math.max(0, rise * retract);
        draw.ring(r.x, r.y + .035, r.z, .95, "#87b94b", k * .65);
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * TAU, h = (.65 + (i % 3) * .14) * k;
          o.position.set(r.x + Math.cos(a) * .8, r.y + h * .4 - .08, r.z + Math.sin(a) * .8);
          o.rotation.set(Math.sin(a) * .3, a, -Math.cos(a) * .3); o.scale.set(.16, h, .16);
          pool.roots.put(o, color.set(i % 2 ? "#658b39" : "#936437"));
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
            size, size * (stream.inferno ? 1.6 : 1.3) * (1 + flutter * .08), i % 3 ? "#f2611a" : "#ffb22e", streamFade * alpha, true);
        }
      }
      const cyclone = cb.cyclone;
      if (cyclone) {
        const x = cyclone.x, z = cyclone.z, y = standY(x, z, game.progress.solved);
        const fade = Math.min(1, Math.max(0, (4 - cyclone.age) * 3));
        for (let i = 0; i < 3; i++) {
          const a = t * (4 + i) + i * TAU / 3;
          o.position.set(x + Math.cos(a) * .12, y + .3 + i * .65, z + Math.sin(a) * .12);
          o.rotation.set(Math.PI, a, Math.sin(a) * .08);
          o.scale.set(.45 + i * .35, 1.25, .45 + i * .35);
          pool.shells.put(o, color.set("#d3f4ff"), fade);
          o.position.y += .25; o.rotation.set(Math.PI / 2, a, a); o.scale.setScalar(.45 + i * .35);
          pool.streaks.put(o, color.set("#ffffff"), fade);
        }
        draw.ring(x, y + .045, z, 1.25 + Math.sin(t * 15) * .08, "#d6c9a2", fade * .6);
        for (let i = 0; i < 8; i++) {
          const a = t * 5 + i * TAU / 8;
          draw.sprite(x + Math.cos(a) * 1.15, y - .25, z + Math.sin(a) * 1.15, .45, .22, "#d6c9a2", fade * .4);
        }
      }
      for (const f of cb.fx) {
        const age = t - f.t0, k = age / f.life;
        if (k < 0 || k >= 1 || Math.hypot(f.x - rt.player.x, f.z - rt.player.z) > 48) continue;
        const fade = Math.min(1, (1 - k) * 3);
        if (f.kind === "blast" || f.kind === "gust") {
          // The existing gust's open cone, with travelling curved wind streaks.
          o.position.set(f.x, f.y, f.z);
          direction.set(-Math.sin(f.yaw), 0, -Math.cos(f.yaw));
          o.quaternion.setFromUnitVectors(up, direction);
          const len = f.size * Math.min(1, age * 9);
          o.translateY(-len / 2); o.scale.set(len * .5, len, len * .23);
          pool.shells.put(o, color.set("#e4faff"), fade * .6);
          for (let i = 0; i < 7; i++) {
            const d = f.size * ((i / 7 + age * 2) % 1);
            o.position.set(f.x + Math.sin(f.yaw) * d, f.y, f.z + Math.cos(f.yaw) * d);
            o.rotation.set(0, f.yaw, t * 9 + i); o.scale.set(.15 + d * .42, .1 + d * .18, 1);
            pool.streaks.put(o, color.set("#e4faff"), fade);
          }
        } else if (f.kind === "bomb" || f.kind === "trap" || f.kind === "splashKo") {
          if (f.kind === "bomb") draw.ring(f.x, f.y, f.z, .3 + f.size * k, "#9eeaff", 1 - k);
          draw.splash(f.x, f.y, f.z, f.id, age, fade, f.kind === "splashKo");
        } else if (f.kind === "snare") {
          draw.ring(f.x, standY(f.x, f.z, game.progress.solved) + .04, f.z, f.size * Math.min(1, k * 4), "#8ec15a", (1 - k) * .65);
        } else if (f.kind === "shrug") {
          if (age < .22) draw.ring(f.x, f.y, f.z, .4 + age * 3, "#ffffff", 1 - age / .22, true);
        } else if (f.kind === "hit" || f.kind === "ko" || f.kind === "eat") {
          draw.sprite(f.x, f.y + k * .3, f.z, 1.2 * (1 - k * .5), 1.2 * (1 - k * .5), "#fff6c0", 1 - k);
        } else if (f.kind === "vine") {
          // A missed grab still briefly extends in its authored facing.
          let grabbed = false;
          for (const e of cb.enemies) if (e.control?.kind === "grabbed" && e.control.t0 >= f.t0) grabbed = true;
          if (!grabbed) {
            const length = f.size * Math.sin(k * Math.PI);
            draw.vine(f.x, f.y, f.z, f.x + Math.sin(f.yaw) * length, f.y, f.z + Math.cos(f.yaw) * length);
          }
        }
      }
    }
    for (const b of batches) b.flush();
  });

  return <group>{batches.map((b, i) => <primitive key={i} object={b.mesh} />)}</group>;
}
