import { useMemo, useRef } from "react";
import { BOAT_DECK_Y, BOAT_INNER, BOAT_SCALE } from "../game/world/gullBoat";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { flatMat, smoothMat } from "./materials";
import { foodGeometry } from "./models/props";
import { npcGeometry } from "./models/lowland";
import { bootGeometry, cargoGeometry, dishGeometry, fireGeometry, floatBarrelGeometry, islandGeometry, lifeboatGeometry, plankGeometry, raftGeometry, raftSailGeometry, sparGeometry } from "./models/pirateShip";
import { PIRATES } from "../game/data/pirates";
import { NPCS } from "../game/data/town";
import { BUCKET, DECK_Y, FISH_Y, HALF_BEAM, SHIP, SPOT, hullHalf } from "../game/world/pirateShip";
import { SEA_Y } from "../game/world/island";
import { vy, type CrewId } from "../game/voyageRt";
import { cargoSpot, cookMarker, usesVoyageBreath } from "../game/voyageSim";
import { rt } from "../game/runtime";
import type { FoodId } from "../game/types";
import type { CargoItem } from "../game/logic/voyage";
import { VoyageObstacles } from "./VoyageObstacles";

/**
 * Everything the voyage's jobs, storm and raft show (docs/PIRATE_VOYAGE.md §3–§5,
 * §8): fish, cargo, cooking, obstacles, deck fires, barrels, the spar,
 * lifeboats, the raft, rain and the pooled tool effects. Each group is hidden
 * (no draw calls) unless its stage needs it.
 */

const FOODS_ALL: FoodId[] = ["apples", "bananas", "fish", "berries", "meat"];
let foodGeos: Record<FoodId, THREE.BufferGeometry> | null = null;
export function foodGeo(f: FoodId): THREE.BufferGeometry {
  foodGeos ??= Object.fromEntries(FOODS_ALL.map((id) => [id, foodGeometry(id)])) as Record<FoodId, THREE.BufferGeometry>;
  return foodGeos[f];
}
const DISH_COLOR: Record<FoodId, string> = { fish: "#7fb6e0", meat: "#c0503a", apples: "#e83a35", bananas: "#ffd23f", berries: "#8a2be2" };
let dishGeos: Partial<Record<FoodId, THREE.BufferGeometry>> = {};
const dishGeo = (f: FoodId) => (dishGeos[f] ??= dishGeometry(DISH_COLOR[f]));

const shipX = (lx: number) => SHIP.x + vy.shipOffset.x + lx;
const shipZ = (lz: number) => SHIP.z + vy.shipOffset.z + lz;
// Props are placed in the ship's mooring frame (no yaw): hidden while it is still turning in.
// Ship-attached props are placed without yaw: hidden while the ship is turned, except for the
// small heading change while steering (flow/voyageJobs steerOne).
const onDeck = () => vy.active && rt.world === "home" && (vy.shipYaw === 0 || Boolean(vy.phase?.name.startsWith("steer-")));

const bubbleMat = new THREE.MeshLambertMaterial({ color: "#a8e4ff", transparent: true, opacity: 0.5, depthWrite: false });

// ------------------------------------------------------------ fish and the bucket

function FishSchool() {
  const fish = useMemo(() => foodGeometry("fish"), []), boot = useMemo(bootGeometry, []);
  const ball = useMemo(() => new THREE.SphereGeometry(0.55, 12, 9), []);
  const bodies = useRef<Array<THREE.Mesh | null>>([]), bubbles = useRef<Array<THREE.Mesh | null>>([]), stack = useRef<Array<THREE.Mesh | null>>([]);
  useFrame(() => {
    for (let i = 0; i < 6; i++) {
      const m = bodies.current[i], b = bubbles.current[i], f = vy.fish[i];
      if (!m || !b) continue;
      m.visible = Boolean(f) && onDeck() && f.state !== "bucket";
      b.visible = m.visible && f.state === "caught" && rt.time >= f.t0;
      if (!m.visible) continue;
      m.position.set(shipX(f.x), f.y, shipZ(f.z));
      m.rotation.set(f.state === "caught" ? Math.sin(rt.time * 9) * 0.4 : 0, f.yaw, 0);
      if (b.visible) b.position.set(m.position.x, m.position.y + 0.25, m.position.z);
    }
    for (let i = 0; i < 4; i++) {
      const s = stack.current[i];
      if (!s) continue;
      s.visible = onDeck() && i < vy.bucket;
      s.position.set(shipX(BUCKET.x + (i % 2 ? 0.08 : -0.08)), FISH_Y + 0.3 + i * 0.05, shipZ(BUCKET.z + (i - 1.5) * 0.06));
      s.rotation.set(-1.2, i * 1.3, 0);
    }
  });
  return <>
    {[0, 1, 2, 3, 4, 5].map((i) => <mesh key={i} ref={(el) => { bodies.current[i] = el; }} geometry={i === 5 ? boot : fish} material={flatMat} scale={i === 5 ? 1 : 2.1} visible={false} />)}
    {[0, 1, 2, 3, 4, 5].map((i) => <mesh key={`b${i}`} ref={(el) => { bubbles.current[i] = el; }} geometry={ball} material={bubbleMat} visible={false} />)}
    {[0, 1, 2, 3].map((i) => <mesh key={`s${i}`} ref={(el) => { stack.current[i] = el; }} geometry={fish} material={flatMat} scale={1.3} visible={false} />)}
  </>;
}

// ------------------------------------------------------------ cargo, carried things, the galley

const ITEMS: CargoItem[] = ["barrel", "bag", "bottle"];

function Cargo() {
  const geos = useMemo(() => ITEMS.map((i) => cargoGeometry(i)), []);
  const refs = useRef<Array<THREE.Mesh | null>>([]);
  useFrame(() => {
    ITEMS.forEach((item, i) => {
      const m = refs.current[i];
      if (!m) return;
      const carried = vy.carry?.kind === "cargo" && vy.carry.item === item;
      m.visible = onDeck() && (carried || vy.inHold);
      if (!m.visible) return;
      if (carried) {
        // Held up by Leafy's vine above the player's head.
        m.position.set(rt.player.x, rt.player.y + (vy.inHold ? 1.8 : 2.15) + Math.sin(rt.time * 3) * 0.05, rt.player.z);
        m.rotation.set(0, rt.time * 0.8, 0);
        return;
      }
      const s = cargoSpot(item, vy.cargo[item]);
      m.position.set(shipX(s.x), s.y, shipZ(s.z));
      m.rotation.set(0, i * 0.7, 0);
    });
  });
  return <>{ITEMS.map((item, i) => <mesh key={item} ref={(el) => { refs.current[i] = el; }} geometry={geos[i]} material={flatMat} visible={false} />)}</>;
}

/**
 * Where a carried food or dish sits, in the player's frame: on both hands held out
 * in front of the torso (scene/Characters' carry pose), below the chin and clear
 * of the body. Shared by the render and its test.
 */
export const CARRY_HOLD = { forward: 0.47, up: 0.84 };

/** Food or a dish in the player's hands, the stove's fire, the pot's contents. */
function Galley() {
  const fire = useMemo(fireGeometry, []);
  const held = useRef<THREE.Mesh>(null), flame = useRef<THREE.Mesh>(null), pot = useRef<THREE.Mesh>(null), plate = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const h = held.current;
    if (h) {
      const c = vy.carry, p = rt.player;
      h.visible = onDeck() && Boolean(c) && c!.kind !== "cargo";
      if (h.visible && c && c.kind !== "cargo") {
        const g = c.kind === "dish" ? dishGeo(c.food) : foodGeo(c.food);
        if (h.geometry !== g) h.geometry = g;
        const bob = Math.abs(Math.sin(p.step * Math.PI)) * 0.025 * Math.min(1, p.speed / 4);
        h.position.set(p.x + Math.sin(p.yaw) * CARRY_HOLD.forward, p.y + CARRY_HOLD.up + bob, p.z + Math.cos(p.yaw) * CARRY_HOLD.forward);
        h.rotation.set(0, p.yaw, 0);
        h.scale.setScalar(c.kind === "dish" ? 1.15 : 1.3);
      }
    }
    const st = SPOT.stove, cook = vy.cook;
    if (flame.current) {
      flame.current.visible = onDeck() && cook.lit;
      const k = 0.35 + cook.heat * 0.9 + Math.sin(rt.time * 13) * 0.06;
      flame.current.position.set(shipX(st.x), DECK_Y + 0.15, shipZ(st.z + 0.55));
      flame.current.scale.set(0.6 + cook.heat * 0.4, k, 0.6 + cook.heat * 0.4);
    }
    if (pot.current) {
      pot.current.visible = onDeck() && Boolean(cook.pot);
      if (cook.pot) {
        if (pot.current.geometry !== foodGeo(cook.pot)) pot.current.geometry = foodGeo(cook.pot);
        pot.current.position.set(shipX(st.x), DECK_Y + 1.25 + Math.sin(rt.time * 6) * 0.04 * cook.heat, shipZ(st.z));
      }
    }
    if (plate.current) {
      plate.current.visible = onDeck() && Boolean(cook.dish);
      if (cook.dish) {
        if (plate.current.geometry !== dishGeo(cook.dish)) plate.current.geometry = dishGeo(cook.dish);
        plate.current.position.set(shipX(st.x), DECK_Y + 1.4, shipZ(st.z));
      }
    }
  });
  return <>
    <mesh ref={held} geometry={foodGeo("fish")} material={flatMat} visible={false} />
    <mesh ref={flame} geometry={fire} material={flatMat} visible={false} />
    <mesh ref={pot} geometry={foodGeo("fish")} material={flatMat} scale={1.3} visible={false} />
    <mesh ref={plate} geometry={dishGeo("fish")} material={flatMat} scale={1.3} visible={false} />
    <CookMarkers />
  </>;
}

/** A gold arrow, bobbing and pulsing, the same for the dish and for the hungry pirate. */
function CookMarkers() {
  const geo = useMemo(() => {
    const b = new THREE.ConeGeometry(0.22, 0.42, 4);
    b.rotateX(Math.PI);
    const ring = new THREE.TorusGeometry(0.2, 0.05, 4, 14);
    ring.rotateX(Math.PI / 2);
    ring.translate(0, 0.38, 0);
    return mergeGeometries([b.toNonIndexed(), ring.toNonIndexed()], false);
  }, []);
  // Drawn over nearby rigging and furniture so it is never lost, but small.
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffcf33", depthTest: false, transparent: true, opacity: 0.95 }), []);
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const at = onDeck() ? cookMarker() : null;
    m.visible = Boolean(at);
    if (!at) return;
    const pulse = 1 + Math.sin(rt.time * 5) * 0.08;
    m.position.set(shipX(at.x), at.y + Math.sin(rt.time * 3.2) * 0.14, shipZ(at.z));
    m.rotation.set(0, rt.time * 1.4, 0);
    m.scale.setScalar(pulse);
  });
  return <mesh ref={ref} geometry={geo} material={mat} renderOrder={20} visible={false} />;
}

// ------------------------------------------------------------ storm props

const UP = new THREE.Vector3(0, 1, 0);
/** Stretch a unit y-cylinder (0..1) from a to b. */
function span(m: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, r: number) {
  const d = b.clone().sub(a), len = d.length() || 0.001;
  m.position.copy(a);
  m.quaternion.setFromUnitVectors(UP, d.divideScalar(len));
  m.scale.set(r, len, r);
}

function StormProps() {
  const keg = useMemo(() => { const g = floatBarrelGeometry(); g.rotateZ(-0.3); g.rotateX(Math.PI / 2); g.translate(0, 0.55, 0); return g; }, []);
  const fire = useMemo(fireGeometry, []), spar = useMemo(sparGeometry, []);
  const rope = useMemo(() => { const g = new THREE.CylinderGeometry(1, 1, 1, 5); g.translate(0, 0.5, 0); return g; }, []);
  const ropeMat = useMemo(() => new THREE.MeshLambertMaterial({ color: "#3f9b3a" }), []);
  const kegs = useRef<Array<THREE.Mesh | null>>([]), ropes = useRef<Array<THREE.Mesh | null>>([]), fires = useRef<Array<THREE.Mesh | null>>([]), sparRef = useRef<THREE.Mesh>(null);
  const a = useMemo(() => new THREE.Vector3(), []), b = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    for (let i = 0; i < 3; i++) {
      const k = kegs.current[i], r = ropes.current[i], f = fires.current[i], bar = vy.barrels[i], fi = vy.fires[i];
      if (k) {
        k.visible = onDeck() && Boolean(bar);
        if (bar && k.visible) { k.position.set(shipX(bar.x), DECK_Y, shipZ(bar.z)); k.rotation.set(0, 0, bar.tied ? 0 : Math.sin(rt.time * 5 + i) * 0.12); }
      }
      if (r) {
        r.visible = onDeck() && Boolean(bar?.tied);
        if (bar?.tied) {
          const side = (bar.x >= 0 ? 1 : -1) * (HALF_BEAM - 0.5);
          a.set(shipX(bar.x), DECK_Y + 0.55, shipZ(bar.z)); b.set(shipX(side), DECK_Y + 0.8, shipZ(bar.z + 0.3));
          span(r, a, b, 0.045);
        }
      }
      if (f) {
        f.visible = onDeck() && Boolean(fi) && !fi.out;
        if (fi && f.visible) {
          const s = 1 + Math.sin(rt.time * 14 + i * 2) * 0.12;
          f.position.set(shipX(fi.x), DECK_Y, shipZ(fi.z)); f.scale.set(1.1, 1.2 * s, 1.1); f.rotation.y = rt.time * 2 + i;
        }
      }
    }
    const s = sparRef.current;
    if (s) {
      s.visible = onDeck() && Boolean(vy.spar);
      if (vy.spar) { s.position.set(shipX(vy.spar.x), DECK_Y + 0.45 + vy.spar.lift * 1.8, shipZ(vy.spar.z)); s.rotation.set(0, 0.5, vy.spar.lift * 0.5); }
    }
  });
  return <>
    {[0, 1, 2].map((i) => <mesh key={`k${i}`} ref={(el) => { kegs.current[i] = el; }} geometry={keg} material={flatMat} visible={false} />)}
    {[0, 1, 2].map((i) => <mesh key={`r${i}`} ref={(el) => { ropes.current[i] = el; }} geometry={rope} material={ropeMat} visible={false} />)}
    {[0, 1, 2].map((i) => <mesh key={`f${i}`} ref={(el) => { fires.current[i] = el; }} geometry={fire} material={flatMat} visible={false} />)}
    <mesh ref={sparRef} geometry={spar} material={flatMat} visible={false} />
  </>;
}

/** The capture's three ropes, then the mooring lines holding Gull's boat alongside (they reach out as `vy.ropes` grows). */
const MOORING = [[5.0, -1.1], [6.8, 0.5], [8.6, 1.9]];
function MooringRopes() {
  const rope = useMemo(() => { const g = new THREE.CylinderGeometry(1, 1, 1, 5); g.translate(0, 0.5, 0); return g; }, []);
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ color: "#8a6a43" }), []);
  const refs = useRef<Array<THREE.Mesh | null>>([]);
  const a = useMemo(() => new THREE.Vector3(), []), b = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    // Thrown while the boat is still ridden (the capture), then kept while it is moored.
    const show = onDeck() && (vy.boatMoored || rt.voyage.active) && vy.ropes > 0;
    MOORING.forEach(([lz, dz], i) => {
      const m = refs.current[i];
      if (!m) return;
      m.visible = show;
      if (!show) return;
      const v = rt.voyage, k = Math.min(1, vy.ropes);
      a.set(shipX(hullHalf(lz) - 0.25), DECK_Y + 0.95, shipZ(lz));
      // Tied to the boat's gunwale on the ship's side (local +x at its mooring), wherever the boat points.
      const bx = BOAT_INNER.halfX, bz = -dz * BOAT_SCALE, cy = Math.cos(v.yaw), sy = Math.sin(v.yaw);
      b.set(v.x + bx * cy + bz * sy, v.y + BOAT_DECK_Y + 0.3 * BOAT_SCALE + Math.sin(rt.time * 1.5) * 0.03, v.z - bx * sy + bz * cy);
      b.lerpVectors(a, b, k);
      span(m, a, b, 0.045);
    });
  });
  return <>{MOORING.map((_, i) => <mesh key={i} ref={(el) => { refs.current[i] = el; }} geometry={rope} material={mat} visible={false} />)}</>;
}

/** Two lifeboats rowing away from the wreck with the pirates and Gull. */
const BOATS: Array<{ crew: CrewId[]; side: number }> = [{ crew: ["redbeard", "pepper", "gull", "finn"], side: 1 }, { crew: ["bill", "tom", "sam", "max"], side: -1 }];
function Lifeboats() {
  const hull = useMemo(lifeboatGeometry, []);
  const people = useMemo(() => BOATS.map((b) => b.crew.map((id) => npcGeometry(id === "gull" ? NPCS.harbor : PIRATES[id as Exclude<CrewId, "gull">]))), []);
  const groups = useRef<Array<THREE.Group | null>>([]);
  useFrame(() => {
    BOATS.forEach((b, i) => {
      const g = groups.current[i];
      if (!g) return;
      g.visible = vy.lifeboats > 0 && vy.sea && rt.world === "home";
      if (!g.visible) return;
      const k = vy.lifeboats;
      g.position.set(SHIP.x + b.side * (HALF_BEAM + 2.5 + k * 26), SEA_Y + 0.1 + Math.sin(rt.time * 1.8 + i) * 0.12, SHIP.z + 4 + k * (10 + i * 6));
      g.rotation.set(Math.sin(rt.time * 1.3 + i) * 0.06, b.side * 0.9 + Math.PI * (i ? 1 : 0), Math.sin(rt.time * 1.7) * 0.05);
    });
  });
  return <>{BOATS.map((_, i) => (
    <group key={i} ref={(el) => { groups.current[i] = el; }} visible={false}>
      <mesh geometry={hull} material={flatMat} />
      {people[i].map((geo, j) => <mesh key={j} geometry={geo} material={smoothMat} position={[(j % 2 ? 0.45 : -0.45), -0.35, (j - 1.5) * 0.8]} scale={0.9} />)}
    </group>
  ))}</>;
}

// ------------------------------------------------------------ the raft and the island

function Raft() {
  const hatch = useMemo(raftGeometry, []), plank = useMemo(plankGeometry, []), mast = useMemo(raftSailGeometry, []), island = useMemo(islandGeometry, []);
  const rope = useMemo(() => { const g = new THREE.CylinderGeometry(1, 1, 1, 5); g.translate(0, 0.5, 0); return g; }, []);
  const ropeMat = useMemo(() => new THREE.MeshLambertMaterial({ color: "#8a6a43" }), []);
  const root = useRef<THREE.Mesh>(null), planks = useRef<Array<THREE.Mesh | null>>([]), sail = useRef<THREE.Mesh>(null), isle = useRef<THREE.Mesh>(null), tow = useRef<THREE.Mesh>(null);
  const a = useMemo(() => new THREE.Vector3(), []), b = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const r = vy.raft, on = r.on, bob = Math.sin(rt.time * 1.4) * 0.04;
    const y = rt.world === "cloud" ? 0.05 : SEA_Y + 0.25 + bob;
    if (root.current) { root.current.visible = on; root.current.position.set(r.x, y, r.z); }
    for (let i = 0; i < 4; i++) {
      const m = planks.current[i], p = r.planks[i];
      if (!m) continue;
      m.visible = on && Boolean(p);
      if (!p || !m.visible) continue;
      const float = p.state === "float" ? Math.sin(rt.time * 1.6 + i) * 0.06 : 0;
      m.position.set(p.x, p.state === "placed" ? y : SEA_Y + 0.12 + float, p.z);
      m.rotation.set(0, p.yaw, p.state === "float" ? Math.sin(rt.time + i) * 0.05 : 0);
    }
    if (sail.current) {
      sail.current.visible = on && r.sail > 0;
      sail.current.position.set(r.x - 0.2, y, r.z - 0.9);
      sail.current.scale.set(1, Math.max(0.01, r.sail), 1);
      sail.current.rotation.set(0, Math.PI + vy.islandSide * 0.3, 0);
    }
    if (isle.current) {
      isle.current.visible = on && vy.island > 0 && rt.world === "home";
      isle.current.position.set(r.x + vy.islandSide * 55, SEA_Y - 6 + vy.island * 5, r.z - 175);
    }
    if (tow.current) {
      // Bubbo's tow rope while he pulls the raft.
      const bub = rt.monsters.bubbo;
      tow.current.visible = on && rt.world === "home" && vy.flow > 0.3 && r.sail === 0 && r.built >= 3;
      if (tow.current.visible) { a.set(r.x, y + 0.2, r.z - 1.3); b.set(bub.x, SEA_Y + 0.2, bub.z + 0.4); span(tow.current, a, b, 0.04); }
    }
  });
  return <>
    <mesh ref={root} geometry={hatch} material={flatMat} visible={false} />
    {[0, 1, 2, 3].map((i) => <mesh key={i} ref={(el) => { planks.current[i] = el; }} geometry={plank} material={flatMat} visible={false} />)}
    <mesh ref={sail} geometry={mast} material={flatMat} visible={false} />
    <mesh ref={isle} geometry={island} material={flatMat} visible={false} />
    <mesh ref={tow} geometry={rope} material={ropeMat} visible={false} />
  </>;
}

// ------------------------------------------------------------ rain

function Rain() {
  const N = 320;
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => new THREE.BoxGeometry(0.03, 1.0, 0.03), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#d6e6f2", transparent: true, opacity: 0.55, depthWrite: false }), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const seeds = useMemo(() => Array.from({ length: N }, (_, i) => [Math.sin(i * 12.9898) * 43758.5453 % 1, Math.sin(i * 78.233) * 12543.3 % 1, Math.sin(i * 3.7) * 9631.1 % 1].map((v) => Math.abs(v))), []);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    m.visible = vy.sea && vy.storm > 0.25 && rt.world === "home";
    if (!m.visible) return;
    const c = rt.camera.target, n = Math.floor(N * Math.min(1, (vy.storm - 0.25) / 0.6));
    for (let i = 0; i < N; i++) {
      const [sx, sz, sy] = seeds[i];
      const fall = (rt.time * 16 + sy * 18) % 18;
      dummy.position.set(c.x - 18 + sx * 36, c.y + 13 - fall, c.z - 16 + sz * 32);
      dummy.rotation.set(0, 0, 0.22);
      dummy.scale.setScalar(i < n ? 1 : 0.0001);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, mat, N]} frustumCulled={false} visible={false} />;
}

// ------------------------------------------------------------ tool effects (pooled)

const FX_N = 24;
function Effects() {
  const sphere = useMemo(() => new THREE.SphereGeometry(1, 10, 7), []);
  const stick = useMemo(() => { const g = new THREE.CylinderGeometry(1, 1, 1, 6); g.translate(0, 0.5, 0); return g; }, []);
  const ring = useMemo(() => new THREE.TorusGeometry(1, 0.12, 6, 18), []);
  const flame = useMemo(fireGeometry, []);
  const mats = useMemo(() => ({
    bubble: bubbleMat,
    flame: flatMat,
    vine: new THREE.MeshLambertMaterial({ color: "#3f9b3a" }),
    gust: new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.6, depthWrite: false }),
    steam: new THREE.MeshBasicMaterial({ color: "#eef3f7", transparent: true, opacity: 0.7, depthWrite: false }),
    splash: new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.7, depthWrite: false }),
    sparkle: new THREE.MeshBasicMaterial({ color: "#ffe066" }),
    rope: new THREE.MeshLambertMaterial({ color: "#8a6a43" }),
  }), []);
  const refs = useRef<Array<THREE.Mesh | null>>([]);
  const a = useMemo(() => new THREE.Vector3(), []), b = useMemo(() => new THREE.Vector3(), []);
  const forward = useMemo(() => new THREE.Vector3(0, 0, 1), []);
  useFrame(() => {
    for (let i = 0; i < FX_N; i++) {
      const m = refs.current[i], f = vy.fx[i];
      if (!m) continue;
      m.visible = !!f && (vy.sea || vy.raft.on) && !usesVoyageBreath(f);
      if (!f || !m.visible) continue;
      const k = Math.max(0, Math.min(1, (rt.time - f.t0) / f.life));
      const lx = f.x + (f.tx - f.x) * k, ly = f.y + (f.ty - f.y) * k, lz = f.z + (f.tz - f.z) * k;
      m.material = mats[f.kind];
      m.quaternion.identity();
      switch (f.kind) {
        case "bubble": {
          m.geometry = sphere;
          m.position.set(lx, ly + Math.sin(k * Math.PI) * 0.5, lz);
          m.scale.setScalar(0.3 * (k > 0.9 ? (1 - k) * 10 : 1));
          break;
        }
        case "flame": {
          m.geometry = flame;
          m.position.set(lx, ly - 0.3, lz);
          m.scale.setScalar(0.4 + k * 0.7);
          m.rotation.set(0, rt.time * 6, 0);
          break;
        }
        case "vine":
        case "rope": {
          m.geometry = stick;
          const reach = f.kind === "rope" ? 1 : Math.min(1, Math.sin(k * Math.PI) * 1.7);
          a.set(f.x, f.y, f.z); b.set(f.x + (f.tx - f.x) * reach, f.y + (f.ty - f.y) * reach, f.z + (f.tz - f.z) * reach);
          span(m, a, b, f.kind === "rope" ? 0.04 : 0.07);
          break;
        }
        case "gust": {
          m.geometry = ring;
          m.position.set(lx, ly, lz);
          a.set(f.tx - f.x, f.ty - f.y, f.tz - f.z).normalize();
          m.quaternion.setFromUnitVectors(forward, a);
          m.scale.setScalar(0.25 + k * 0.9);
          break;
        }
        case "steam":
        case "splash": {
          m.geometry = sphere;
          m.position.set(lx + Math.sin(k * 7 + i) * 0.2, ly, lz);
          m.scale.setScalar((0.25 + k * 0.6) * (k > 0.75 ? (1 - k) * 4 : 1));
          break;
        }
        case "sparkle": {
          m.geometry = sphere;
          m.position.set(lx, ly, lz);
          m.scale.setScalar(0.12 * Math.sin(k * Math.PI) + 0.01);
          break;
        }
      }
    }
  });
  return <>{Array.from({ length: FX_N }, (_, i) => <mesh key={i} ref={(el) => { refs.current[i] = el; }} geometry={sphere} material={bubbleMat} visible={false} />)}</>;
}

export function VoyageProps() {
  return <>
    <FishSchool />
    <Cargo />
    <Galley />
    <VoyageObstacles />
    <StormProps />
    <MooringRopes />
    <Lifeboats />
    <Raft />
    <Rain />
    <Effects />
  </>;
}
