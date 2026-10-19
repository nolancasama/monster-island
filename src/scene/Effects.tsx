import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { rt, type Effect } from "../game/runtime";
import { getGame } from "../game/store";
import { LIVE_MONSTERS, MONSTERS } from "../game/data/monsters";
import { favoriteKnown } from "../game/logic/progress";
import { groundY } from "../game/world/island";
import { standY } from "../game/world/collision";
import { objectiveTarget } from "../game/flow/focus";
import { additiveSprite, glowTexture, smoothMat } from "./materials";
import { foodGeometry } from "./models/props";
import { monsterTop } from "./Monsters";
import type { FoodId } from "../game/types";

function canvasTexture(draw: (g: CanvasRenderingContext2D) => void, size = 64): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const heartPath = (g: CanvasRenderingContext2D, s: number) => {
  g.beginPath();
  g.moveTo(s * 0.5, s * 0.85);
  g.bezierCurveTo(s * 0.05, s * 0.55, s * 0.1, s * 0.12, s * 0.5, s * 0.32);
  g.bezierCurveTo(s * 0.9, s * 0.12, s * 0.95, s * 0.55, s * 0.5, s * 0.85);
  g.fill();
};

let heartTex: THREE.CanvasTexture | null = null;
function heartTexture() {
  heartTex ??= canvasTexture((g) => {
    g.fillStyle = "#ff5c8a";
    heartPath(g, 64);
  });
  return heartTex;
}

// ------------------------------------------------------------ particles

const PER = 14;
const MAX = 12 * PER;

interface Burst {
  life: number;
  color: THREE.Color;
  size: number;
  /** Position of particle i at age t. */
  pos(e: Effect, i: number, t: number, out: THREE.Vector3): void;
}

const rnd = (n: number) => {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
};

const BURSTS: Record<Effect["kind"], Burst> = {
  hearts: {
    life: 1.6,
    // The texture carries the pink.
    color: new THREE.Color("#ffffff"),
    size: 0.32,
    pos: (e, i, t, o) => o.set(e.x + (rnd(e.id * 31 + i) - 0.5) * 1.2 + Math.sin(t * 4 + i) * 0.1, e.y + t * (0.8 + rnd(i) * 0.6), e.z + (rnd(e.id + i * 7) - 0.5) * 1.2)
  },
  sparkle: {
    life: 1,
    color: new THREE.Color("#fff07a"),
    size: 0.22,
    pos: (e, i, t, o) => {
      const a = rnd(e.id * 13 + i) * Math.PI * 2;
      const r = t * (2 + rnd(i) * 1.5);
      o.set(e.x + Math.cos(a) * r, e.y + Math.sin(rnd(i * 3) * 3) * r * 0.6 + 0.3, e.z + Math.sin(a) * r);
    }
  },
  leaves: {
    life: 1.4,
    color: new THREE.Color("#6fd24f"),
    size: 0.24,
    pos: (e, i, t, o) => {
      const a = rnd(e.id * 17 + i) * Math.PI * 2;
      o.set(e.x + Math.cos(a) * t * 1.6, e.y + t * 2.2 - t * t * 1.6, e.z + Math.sin(a) * t * 1.6);
    }
  },
  splash: {
    life: 0.8,
    color: new THREE.Color("#e8fbff"),
    size: 0.2,
    pos: (e, i, t, o) => {
      const a = rnd(e.id * 19 + i) * Math.PI * 2;
      const v = 1 + rnd(i * 5) * 1.2;
      o.set(e.x + Math.cos(a) * t * v, e.y + t * 3.4 - t * t * 6, e.z + Math.sin(a) * t * v);
    }
  },
  poof: {
    life: 0.6,
    color: new THREE.Color("#ffffff"),
    size: 0.5,
    pos: (e, i, t, o) => {
      const a = (i / PER) * Math.PI * 2;
      o.set(e.x + Math.cos(a) * t * 1.6, e.y + t * 0.6, e.z + Math.sin(a) * t * 1.6);
    }
  },
  notes: {
    life: 1.4,
    color: new THREE.Color("#ffffff"),
    size: 0.25,
    pos: (e, i, t, o) => o.set(e.x + Math.sin(t * 3 + i) * 0.3, e.y + t, e.z)
  }
};

/** Points with a per-particle colour and alpha (PointsMaterial can only fade by darkening). */
function burstMaterial(map: THREE.Texture, size: number, additive: boolean) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, size: { value: size }, scale: { value: 500 } },
    vertexShader: `
      attribute vec3 color;
      attribute float alpha;
      uniform float size;
      uniform float scale;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = color;
        vAlpha = alpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * scale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D map;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec4 t = texture2D(map, gl_PointCoord);
        gl_FragColor = vec4(t.rgb * vColor, t.a * vAlpha);
        if (gl_FragColor.a < 0.01) discard;
      }`,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
  });
}

function useBurstPoints(textured: "heart" | "glow") {
  return useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
    g.setAttribute("alpha", new THREE.BufferAttribute(new Float32Array(MAX), 1));
    const m = textured === "heart" ? burstMaterial(heartTexture(), 0.42, false) : burstMaterial(glowTexture(), 0.2, true);
    return { g, m };
  }, [textured]);
}

function Particles() {
  const hearts = useBurstPoints("heart");
  const glows = useBurstPoints("glow");
  const v = useMemo(() => new THREE.Vector3(), []);
  const { size, gl } = useThree();
  useFrame(() => {
    const fill = (pts: { g: THREE.BufferGeometry; m: THREE.ShaderMaterial }, kinds: Array<Effect["kind"]>) => {
      const pos = pts.g.attributes.position as THREE.BufferAttribute;
      const col = pts.g.attributes.color as THREE.BufferAttribute;
      const alpha = pts.g.attributes.alpha as THREE.BufferAttribute;
      // Point size in pixels per world metre at distance 1.
      pts.m.uniforms.scale.value = (size.height * gl.getPixelRatio()) / (2 * Math.tan((55 * Math.PI) / 360));
      let n = 0;
      for (const e of rt.effects) {
        if (!kinds.includes(e.kind)) continue;
        const b = BURSTS[e.kind];
        const t = rt.time - e.t0;
        if (t > b.life) continue;
        const fade = Math.min(1, (1 - t / b.life) * 2.5);
        for (let i = 0; i < PER && n < MAX; i++, n++) {
          b.pos(e, i, t, v);
          pos.setXYZ(n, v.x, v.y, v.z);
          col.setXYZ(n, b.color.r, b.color.g, b.color.b);
          alpha.setX(n, fade);
        }
      }
      pts.g.setDrawRange(0, n);
      pos.needsUpdate = true;
      col.needsUpdate = true;
      alpha.needsUpdate = true;
    };
    fill(hearts, ["hearts"]);
    fill(glows, ["sparkle", "leaves", "splash", "poof", "notes"]);
  });
  return (
    <group>
      <points geometry={hearts.g} material={hearts.m} frustumCulled={false} />
      <points geometry={glows.g} material={glows.m} frustumCulled={false} />
    </group>
  );
}

// ------------------------------------------------------------ markers

function starGeometry(): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 ? 0.14 : 0.32;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 });
  g.center();
  return g;
}

/** ★ over the current objective, so nobody gets lost. */
function StarMarker() {
  const geo = useMemo(starGeometry, []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffd23f" }), []);
  const glow = useMemo(() => additiveSprite("#ffe680", 0.6), []);
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const st = getGame();
    const t = st.screen === "game" && st.mode === "explore" ? objectiveTarget() : null;
    g.visible = Boolean(t);
    if (!t) return;
    g.position.set(t.x, groundY(t.x, t.z) + t.y + Math.sin(rt.time * 2.6) * 0.12, t.z);
    g.rotation.y = rt.time * 1.6;
  });
  return (
    <group ref={ref}>
      <mesh geometry={geo} material={mat} />
      <sprite material={glow} scale={[1.4, 1.4, 1]} />
    </group>
  );
}

/** A soft ring under whatever E would use. */
function FocusRing() {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#fff6b0", transparent: true, opacity: 0.7, depthWrite: false }), []);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const f = getGame().focus;
    m.visible = Boolean(f) && getGame().mode === "explore";
    if (!f) return;
    m.position.set(f.x, standY(f.x, f.z, getGame().progress.solved) + 0.06, f.z);
    const s = 1 + Math.sin(rt.time * 4) * 0.06;
    m.scale.set(s, s, s);
    mat.opacity = 0.5 + Math.sin(rt.time * 4) * 0.2;
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} material={mat}>
      <ringGeometry args={[0.75, 0.9, 32]} />
    </mesh>
  );
}

// ------------------------------------------------------------ monster bubbles

let bangTex: THREE.CanvasTexture | null = null;
let zTex: THREE.CanvasTexture | null = null;
let bubbleTex: THREE.CanvasTexture | null = null;

function MonsterBubbles() {
  const bang = useMemo(() => {
    bangTex ??= canvasTexture((g) => {
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.arc(32, 32, 28, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#ff5a3a";
      g.font = "bold 46px system-ui, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("!", 32, 35);
    });
    return new THREE.SpriteMaterial({ map: bangTex, depthTest: false, transparent: true });
  }, []);
  const z = useMemo(() => {
    zTex ??= canvasTexture((g) => {
      g.fillStyle = "#ffffff";
      g.font = "bold 44px system-ui, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.strokeStyle = "#3a5a8a";
      g.lineWidth = 6;
      g.strokeText("z", 32, 34);
      g.fillText("z", 32, 34);
    });
    return new THREE.SpriteMaterial({ map: zTex, transparent: true, depthWrite: false });
  }, []);
  const bubble = useMemo(() => {
    bubbleTex ??= canvasTexture((g) => {
      g.fillStyle = "rgba(255,255,255,0.95)";
      g.beginPath();
      g.arc(64, 56, 50, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(30, 112, 9, 0, Math.PI * 2);
      g.arc(44, 100, 6, 0, Math.PI * 2);
      g.fill();
    }, 128);
    return new THREE.SpriteMaterial({ map: bubbleTex, transparent: true, depthWrite: false });
  }, []);
  const foods = useMemo(() => {
    const out = {} as Record<FoodId, THREE.BufferGeometry>;
    for (const f of ["apples", "bananas", "fish", "berries", "meat"] as FoodId[]) out[f] = foodGeometry(f);
    return out;
  }, []);
  const refs = useRef<Record<string, THREE.Object3D | null>>({});
  useFrame(() => {
    const g = getGame();
    for (const id of LIVE_MONSTERS) {
      const m = rt.monsters[id];
      const top = monsterTop(id);
      const y = standY(m.x, m.z, g.progress.solved) + top;
      const b = refs.current[`bang-${id}`];
      if (b) {
        const a = m.anim;
        const on = a && (a.kind === "notice" || a.kind === "hide") && rt.time - a.t0 < 1.4;
        b.visible = Boolean(on);
        if (on) {
          const k = Math.min(1, (rt.time - a!.t0) / 0.15);
          b.position.set(m.x, y + 0.25, m.z);
          b.scale.setScalar(0.55 * k);
        }
      }
      for (let i = 0; i < 3; i++) {
        const zz = refs.current[`z-${id}-${i}`];
        if (!zz) continue;
        zz.visible = m.mode === "sleep";
        if (!zz.visible) continue;
        const k = (rt.time * 0.5 + i / 3) % 1;
        zz.position.set(m.x + 0.3 + k * 0.4, y - 0.2 + k * 0.9, m.z);
        zz.scale.setScalar(0.18 + k * 0.22);
        (zz as THREE.Sprite).material.opacity = 1 - k;
      }
      // Hungry: it said what it likes, so it dreams of it until it gets some.
      const th = refs.current[`think-${id}`];
      if (th) {
        const want = favoriteKnown(g.progress, id) && !g.progress.monsters[id].friend && m.mode !== "talk";
        th.visible = want && g.screen === "game";
        if (want) {
          th.position.set(m.x + 0.35, y + 0.55 + Math.sin(rt.time * 2) * 0.05, m.z);
          const food = th.children[1] as THREE.Mesh;
          food.geometry = foods[MONSTERS[id].favorite];
          food.rotation.y = rt.time;
        }
      }
    }
  });
  return (
    <group>
      {LIVE_MONSTERS.map((id) => (
        <group key={id}>
          <sprite
            material={bang}
            ref={(el) => {
              refs.current[`bang-${id}`] = el;
            }}
            renderOrder={5}
          />
          {[0, 1, 2].map((i) => (
            <sprite
              key={i}
              material={z.clone()}
              ref={(el) => {
                refs.current[`z-${id}-${i}`] = el;
              }}
            />
          ))}
          <group
            ref={(el) => {
              refs.current[`think-${id}`] = el;
            }}
          >
            <sprite material={bubble} scale={[0.75, 0.75, 1]} />
            <mesh geometry={foods.apples} material={smoothMat} position={[0, -0.12, 0.05]} scale={1} />
          </group>
        </group>
      ))}
    </group>
  );
}

export function Effects() {
  return (
    <group>
      <Particles />
      <StarMarker />
      <FocusRing />
      <MonsterBubbles />
    </group>
  );
}
