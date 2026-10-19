import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { rt } from "../game/runtime";
import {
  APPLE_TREES,
  BANANA_PLANT,
  BERRY_BUSH,
  CAMP,
  CROSSING,
  FALLEN_PALM,
  FISH_BASKET,
  FOOD_SOURCES,
  FOREST_SIGN,
  MONSTER_STONE,
  PIER,
  STEPPING_STONES,
  Z_NORTH,
  groundY
} from "../game/world/island";
import { MONSTER_ORDER } from "../game/data/monsters";
import type { FoodId, MonsterId } from "../game/types";
import { additiveSprite, flatMat, occluderMat, smoothMat } from "./materials";
import { PartBuilder } from "./partBuilder";
import {
  SOCKETS,
  appleTreeGeometry,
  bananaPlantGeometry,
  berryBushGeometry,
  campfireGeometry,
  crossingPostGeometry,
  fallenPalmGeometry,
  fishBasketGeometry,
  flagGeometry,
  foodGeometry,
  monsterStoneGeometry,
  pierGeometry,
  signPostGeometry,
  steppingStoneGeometry,
  tableGeometry,
  tentGeometry,
  vineWallGeometry,
  vinesGeometry
} from "./models/props";

const at = (x: number, z: number, dy = 0): [number, number, number] => [x, groundY(x, z) + dy, z];

function Camp() {
  const tent = useMemo(tentGeometry, []);
  const table = useMemo(tableGeometry, []);
  const fire = useMemo(campfireGeometry, []);
  const flag = useMemo(flagGeometry, []);
  const flame = useRef<THREE.Mesh>(null);
  const cloth = useRef<THREE.Mesh>(null);
  const flameMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffb340" }), []);
  const glow = useMemo(() => additiveSprite("#ffa040", 0.55), []);
  useFrame(() => {
    if (flame.current) {
      const s = 1 + Math.sin(rt.time * 13) * 0.12 + Math.sin(rt.time * 7.1) * 0.08;
      flame.current.scale.set(1, s, 1);
    }
    if (cloth.current) cloth.current.rotation.y = Math.sin(rt.time * 2.2) * 0.25;
  });
  const f = CAMP.fire;
  return (
    <group>
      <mesh geometry={tent} material={occluderMat} position={at(CAMP.tent.x, CAMP.tent.z)} rotation={[0, 0.5, 0]} />
      <mesh geometry={table} material={smoothMat} position={at(CAMP.table.x, CAMP.table.z)} rotation={[0, 0.3, 0]} />
      <group position={at(f.x, f.z)}>
        <mesh geometry={fire} material={flatMat} />
        <mesh ref={flame} material={flameMat} position={[0, 0.25, 0]}>
          <coneGeometry args={[0.22, 0.55, 6]} />
        </mesh>
        <sprite material={glow} position={[0, 0.5, 0]} scale={[1.8, 1.8, 1]} />
      </group>
      <group position={at(CAMP.tent.x + 2.4, CAMP.tent.z + 1.6)}>
        <mesh geometry={flag} material={smoothMat} />
        <mesh ref={cloth} position={[0.4, 2.85, 0]}>
          <boxGeometry args={[0.8, 0.5, 0.03]} />
          <meshLambertMaterial color="#ff6b4a" />
        </mesh>
      </group>
    </group>
  );
}

function FoodPlants() {
  const apple = useMemo(appleTreeGeometry, []);
  const banana = useMemo(bananaPlantGeometry, []);
  const berry = useMemo(berryBushGeometry, []);
  return (
    <group>
      {APPLE_TREES.map((t, i) => (
        <mesh key={i} geometry={apple} material={occluderMat} position={at(t.x, t.z)} rotation={[0, i * 1.7, 0]} />
      ))}
      <mesh geometry={banana} material={occluderMat} position={at(BANANA_PLANT.x, BANANA_PLANT.z)} />
      <mesh geometry={berry} material={flatMat} position={at(BERRY_BUSH.x, BERRY_BUSH.z)} />
    </group>
  );
}

function Pier() {
  const pier = useMemo(() => pierGeometry(PIER.z0, PIER.z1), []);
  const basket = useMemo(fishBasketGeometry, []);
  return (
    <group>
      <mesh geometry={pier} material={smoothMat} position={[PIER.x, groundY(PIER.x, PIER.z0), 0]} />
      <mesh geometry={basket} material={smoothMat} position={at(FISH_BASKET.x, FISH_BASKET.z)} />
    </group>
  );
}

/** Food waiting to be picked up: bobbing gently, gone until it grows back. */
function FoodPickups() {
  const geos = useMemo(() => {
    const out = {} as Record<FoodId, THREE.BufferGeometry>;
    for (const f of ["apples", "bananas", "fish", "berries"] as FoodId[]) out[f] = foodGeometry(f);
    return out;
  }, []);
  const refs = useRef<Array<THREE.Group | null>>([]);
  const glow = useMemo(() => additiveSprite("#fff2a8", 0.4), []);
  useFrame(() => {
    FOOD_SOURCES.forEach((s, i) => {
      const g = refs.current[i];
      if (!g) return;
      const taken = rt.taken.get(s.id);
      g.visible = taken === undefined || taken < 0.4;
      const pop = taken === undefined ? 1 : 1 - taken / 0.4;
      const base = s.food === "fish" ? 0.62 : 0.05;
      g.position.y = groundY(s.x, s.z) + base + Math.sin(rt.time * 2.4 + i) * 0.04;
      g.rotation.y = rt.time * 0.8 + i;
      g.scale.setScalar(Math.max(0.01, pop) * 1.25);
    });
  });
  return (
    <group>
      {FOOD_SOURCES.map((s, i) => (
        <group
          key={s.id}
          position={[s.x, 0, s.z]}
          ref={(el) => {
            refs.current[i] = el;
          }}
        >
          <mesh geometry={geos[s.food]} material={smoothMat} />
          <sprite material={glow} position={[0, 0.2, 0]} scale={[0.9, 0.9, 1]} />
        </group>
      ))}
    </group>
  );
}

/** The fallen palm: across the pass until Leafy's vines lift it onto the rocks. */
function FallenPalm() {
  const palm = useMemo(() => fallenPalmGeometry(FALLEN_PALM.len), []);
  const vines = useMemo(() => vinesGeometry(FALLEN_PALM.len), []);
  const group = useRef<THREE.Group>(null);
  const vineRef = useRef<THREE.Mesh>(null);
  const y0 = groundY(FALLEN_PALM.x, FALLEN_PALM.z) - 0.08;
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const k = rt.palm;
    const lift = Math.sin(Math.min(1, k) * Math.PI) * 1.4;
    g.position.set(FALLEN_PALM.x - 0.4 * k, y0 + 2.4 * k + lift, FALLEN_PALM.z - 4.2 * k);
    // Crown toward the sea, where the camera usually is, so it reads as a fallen palm.
    g.rotation.set(0.12 * k, Math.PI + (Math.PI / 2 - 0.25) * k, -0.22 * k);
    if (vineRef.current) {
      const v = Math.max(0.001, rt.vines);
      vineRef.current.scale.set(1, v, 1);
      vineRef.current.visible = rt.vines > 0.01;
    }
  });
  return (
    <group ref={group}>
      <mesh geometry={palm} material={smoothMat} />
      <mesh ref={vineRef} geometry={vines} material={smoothMat} />
    </group>
  );
}

function SteppingStones() {
  const geos = useMemo(() => STEPPING_STONES.map((_, i) => steppingStoneGeometry(11 + i)), []);
  const refs = useRef<Array<THREE.Mesh | null>>([]);
  const post = useMemo(crossingPostGeometry, []);
  useFrame(() => {
    STEPPING_STONES.forEach((s, i) => {
      const m = refs.current[i];
      if (!m) return;
      // Each stone rises a moment after the one before.
      const k = Math.max(0, Math.min(1, rt.stones * 1.6 - i * 0.2));
      m.position.set(s.x, -1.25 + k * 0.85, s.z);
      m.visible = rt.stones > 0.01;
    });
  });
  return (
    <group>
      {STEPPING_STONES.map((s, i) => (
        <mesh
          key={i}
          geometry={geos[i]}
          material={flatMat}
          position={[s.x, -1.2, s.z]}
          ref={(el) => {
            refs.current[i] = el;
          }}
        />
      ))}
      <mesh geometry={post} material={smoothMat} position={at(CROSSING.west.x - 0.5, CROSSING.west.z - 1.6)} />
      <mesh geometry={post} material={smoothMat} position={at(CROSSING.east.x + 0.5, CROSSING.east.z - 1.6)} />
    </group>
  );
}

/** Symbol shapes for the stone's sockets. */
function symbolGeometry(id: MonsterId): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  const c = "#ffffff";
  if (id === "leafy") b.add(new THREE.SphereGeometry(0.17, 10, 6), c, [0, 0, 0], [0, 0, 0.7], [1, 0.5, 0.25]);
  else if (id === "bubbo") {
    b.sphere(0.12, 0, -0.04, 0, c, [1, 1, 0.3], 10);
    b.add(new THREE.ConeGeometry(0.1, 0.16, 10), c, [0, 0.1, 0], [0, 0, 0], [1, 1, 0.3]);
  } else if (id === "puff") {
    b.sphere(0.09, -0.08, 0, 0, c, [1, 1, 0.3], 8);
    b.sphere(0.11, 0.03, 0.04, 0, c, [1, 1, 0.3], 8);
    b.sphere(0.08, 0.12, -0.01, 0, c, [1, 1, 0.3], 8);
  } else {
    b.add(new THREE.ConeGeometry(0.12, 0.3, 8), c, [0, 0, 0], [0, 0, 0], [1, 1, 0.3]);
  }
  return b.build();
}

const SYMBOL_COLOR: Record<MonsterId, string> = { leafy: "#6dff5a", bubbo: "#4fc3ff", puff: "#c48bff", ember: "#ff8a2a" };

function MonsterStone() {
  const stone = useMemo(monsterStoneGeometry, []);
  const symbols = useMemo(() => MONSTER_ORDER.map((id) => symbolGeometry(id)), []);
  const mats = useMemo(() => MONSTER_ORDER.map(() => new THREE.MeshBasicMaterial({ color: "#3d423a" })), []);
  const glows = useMemo(() => MONSTER_ORDER.map((id) => additiveSprite(SYMBOL_COLOR[id], 0)), []);
  const lit = useMemo(() => new THREE.Color(), []);
  const dark = useMemo(() => new THREE.Color("#3d423a"), []);
  useFrame(() => {
    MONSTER_ORDER.forEach((id, i) => {
      const k = rt.stoneGlow[id];
      mats[i].color.copy(dark).lerp(lit.set(SYMBOL_COLOR[id]), k);
      glows[i].opacity = k * (0.55 + Math.sin(rt.time * 2.5 + i) * 0.15);
    });
  });
  const [x, y, z] = at(MONSTER_STONE.x, MONSTER_STONE.z);
  return (
    <group position={[x, y, z]} rotation={[0, 0.25, 0]}>
      <mesh geometry={stone} material={flatMat} />
      {MONSTER_ORDER.map((id, i) => (
        <group key={id} position={[SOCKETS[i][0], SOCKETS[i][1], 0.4]}>
          <mesh geometry={symbols[i]} material={mats[i]} />
          <sprite material={glows[i]} scale={[1, 1, 1]} />
        </group>
      ))}
    </group>
  );
}

function signTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 96;
  const g = c.getContext("2d")!;
  g.fillStyle = "#c48a4c";
  g.fillRect(0, 0, 256, 96);
  g.fillStyle = "#4a2a12";
  g.font = "bold 44px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("FOREST ↑", 128, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function ForestGate() {
  const post = useMemo(signPostGeometry, []);
  const wall = useMemo(vineWallGeometry, []);
  const tex = useMemo(signTexture, []);
  return (
    <group>
      <group position={at(FOREST_SIGN.x, FOREST_SIGN.z)} rotation={[0, 0.2, 0]}>
        <mesh geometry={post} material={smoothMat} />
        <mesh position={[0.35, 1.43, 0.045]}>
          <planeGeometry args={[1.42, 0.5]} />
          <meshBasicMaterial map={tex} />
        </mesh>
      </group>
      <mesh geometry={wall} material={flatMat} position={at(FOREST_SIGN.x + 2.8, Z_NORTH - 1.4)} />
    </group>
  );
}

export function Props() {
  return (
    <group>
      <Camp />
      <FoodPlants />
      <Pier />
      <FoodPickups />
      <FallenPalm />
      <SteppingStones />
      <MonsterStone />
      <ForestGate />
    </group>
  );
}
