import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { flatMat, shipCutMaterial, smoothMat, updateShipCut } from "./materials";
import { npcGeometry } from "./models/lowland";
import { pirateShipGeometries, sailGeometry, supplySignAtlas } from "./models/pirateShip";
import { PIRATES } from "../game/data/pirates";
import { NPCS } from "../game/data/town";
import { COUNTER_CUSTOMER, DECK_Y, HOLD_LANTERN, MASTS, SAIL_FOOT, SHIP, SPOT, hullHalf, sailHeight, shipFloorY } from "../game/world/pirateShip";
import { SEA_Y } from "../game/world/island";
import { CREW_IDS, vy, type CrewId } from "../game/voyageRt";
import { rt } from "../game/runtime";
import { steeringWaterX, steeringWaveFlow } from "../game/flow/voyageJobs";
import { VoyageProps, foodGeo } from "./VoyageProps";

/** The three gaff sails: mizzen, main, fore (the order of `vy.sails`), each from its boom to its gaff. */
const SAILS = [MASTS.mizzen, MASTS.main, MASTS.fore].map((m) => ({ mast: m, h: sailHeight(m) }));
const tallMat = shipCutMaterial(flatMat, "tall");
const sailMat = shipCutMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, forceSinglePass: true }), "sail");
const lanternGlass = new THREE.MeshLambertMaterial({ color: "#e9a04c", emissive: "#ffb45c", emissiveIntensity: 1.15 });
/** The break-up tips the bow down about a pivot at the stern. */
const PIVOT = { y: DECK_Y, z: 12 };

function CrewMember({ id }: { id: CrewId }) {
  const geo = useMemo(() => npcGeometry(id === "gull" ? NPCS.harbor : PIRATES[id]), [id]);
  const ref = useRef<THREE.Group>(null);
  const held = useRef<THREE.Mesh>(null);
  const lean = useRef(0);
  useFrame(() => {
    const g = ref.current, c = vy.crew[id];
    if (!g) return;
    const below = id === "bill" && c.x === SPOT.bill.x && c.z === SPOT.bill.z;
    g.visible = c.visible && below === vy.inHold;
    if (!g.visible) return;
    // Face the player when close (local frame), as the town's keepers do; round the captured
    // party, face in toward the huddle.
    const px = rt.player.x - SHIP.x - vy.shipOffset.x, pz = rt.player.z - SHIP.z - vy.shipOffset.z;
    const atCounter = id === "pepper" && c.x === SPOT.cook.x && c.z === SPOT.cook.z;
    const faceCustomer = atCounter && pz < SPOT.counter.z;
    const grapples = vy.grapples;
    const hook = id === "tom" || id === "sam" || id === "max" ? grapples?.[id] : undefined;
    const staged = Boolean(hook || (grapples && id === "redbeard"));
    const want = staged ? c.yaw : faceCustomer ? Math.atan2(COUNTER_CUSTOMER.x - c.x, COUNTER_CUSTOMER.z - c.z)
      : c.menace ? c.yaw : Math.hypot(px - c.x, pz - c.z) < 5 && c.air === 0 ? Math.atan2(px - c.x, pz - c.z) : c.yaw;
    let d = want - g.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    g.rotation.y = staged ? want : g.rotation.y + d * 0.1;
    // Closing in: a lean toward the party and a slow, heavy sway (posture, never weapons).
    lean.current += ((c.menace ? 0.16 : 0) - lean.current) * 0.08;
    g.rotation.order = "YXZ";
    g.rotation.x = hook ? hook.pitch : lean.current;
    g.rotation.z = staged ? 0 : lean.current * Math.sin(rt.time * 1.6 + c.x * 3) * 0.35;
    const cheer = rt.time - c.cheer < 1.6 ? Math.abs(Math.sin((rt.time - c.cheer) * 9)) * 0.28 : 0;
    const idleBob = staged ? 0 : Math.abs(Math.sin(rt.time * 1.7 + c.x)) * 0.02;
    g.position.set(c.x, (shipFloorY(c.x, c.z, below) ?? DECK_Y) + c.air + cheer + idleBob, c.z);
    const h = held.current;
    if (h) {
      const food = c.hold === "fish3" ? "fish" : c.hold;
      h.visible = Boolean(food);
      if (food && h.geometry !== foodGeo(food)) h.geometry = foodGeo(food);
      h.scale.setScalar(c.hold === "fish3" ? 1.6 : 1.2);
    }
  });
  return <group ref={ref}>
    <mesh geometry={geo} material={smoothMat} />
    <mesh ref={held} geometry={foodGeo("fish")} material={flatMat} position={[0, 2.05, 0.15]} visible={false} />
  </group>;
}

/** Waves sampled in world space; `flow` slides the pattern past the vessel. */
export function seaHeight(x: number, z: number, t: number, storm: number, flow: number): number {
  const zz = z + flow;
  return SEA_Y + (0.05 + storm * 0.32) * Math.sin(x * 0.29 + zz * 0.16 + t * 1.8) + (0.03 + storm * 0.16) * Math.sin(zz * 0.57 - t * 2.1 + x * 0.05);
}

/** Open water around the view while the voyage owns the sea (replaces the home sea and the old crossing's). */
function VoyageSea() {
  const ref = useRef<THREE.Mesh>(null);
  const STEP = 10, N = 72;
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(STEP * N, STEP * N, N, N);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ color: "#1e74b4", flatShading: true }), []);
  const fair = useMemo(() => new THREE.Color("#1f78b8"), []), stormy = useMemo(() => new THREE.Color("#2c4452"), []);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    m.visible = vy.sea && rt.world === "home" && !vy.inHold;
    if (!m.visible) return;
    // Centred on what the camera looks at, snapped to the grid so the facets never swim.
    const cx = Math.round(rt.camera.target.x / STEP) * STEP, cz = Math.round(rt.camera.target.z / STEP) * STEP;
    m.position.set(cx, 0, cz);
    mat.color.copy(fair).lerp(stormy, vy.storm);
    const p = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setY(i, seaHeight(p.getX(i) + cx - steeringWaterX(), p.getZ(i) + cz, rt.time, vy.storm, steeringWaveFlow()));
    p.needsUpdate = true;
  });
  return <mesh ref={ref} geometry={geometry} material={mat} visible={false} />;
}

/** Foam slipping past the hull and trailing behind the stern while the ship "sails". */
function Wake() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const COUNT = 30;
  // Thin foam streaks lying along the water, long in the direction it flows.
  const geo = useMemo(() => { const g = new THREE.PlaneGeometry(0.16, 1.9); g.rotateX(-Math.PI / 2); return g; }, []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#e4f2fb", transparent: true, opacity: 0.26, depthWrite: false }), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    m.visible = vy.active && vy.flow > 0.05 && vy.raft.on === false && !vy.inHold;
    if (!m.visible) return;
    for (let i = 0; i < COUNT; i++) {
      // Foam is born at the bow and slides aft along both sides with the water. It fades before
      // the stern: the fish swim beside and behind the fishing deck.
      const side = i % 2 ? -1 : 1;
      const k = ((vy.flowDist * 0.12 + i / COUNT) % 1 + 1) % 1;
      const z = -20 + k * 33;
      const x = side * (Math.max(hullHalf(z), hullHalf(-13) * 0.4) + 0.25 + (z + 20) * 0.025 + Math.sin(i * 3.1) * 0.25);
      const s = Math.sin(k * Math.PI) * Math.min(1, vy.flow);
      dummy.position.set(SHIP.x + x, seaHeight(SHIP.x + x - steeringWaterX(), SHIP.z + z, rt.time, vy.storm, steeringWaveFlow()) + 0.05, SHIP.z + z);
      dummy.scale.set(1 + s, 1, Math.max(0.01, s) * (1.2 + Math.min(1, vy.flow) * 0.8));
      dummy.rotation.set(0, side * 0.12, 0);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, mat, COUNT]} frustumCulled={false} visible={false} />;
}

/** Captain Redbeard's ship and crew, drawn only while the voyage needs them. */
export function PirateShip() {
  const ship = useMemo(pirateShipGeometries, []);
  const hatchOpen = useMemo(() => ({ value: false }), []);
  const deckMat = useMemo(() => {
    const material = flatMat.clone();
    material.map = supplySignAtlas();
    // The hatch shade uses a reserved white atlas sample, so the exterior
    // base and the four coloured signs can stay in one draw.
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uHoldOpen = hatchOpen;
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform bool uHoldOpen;")
        .replace("#include <map_fragment>", `
#ifdef USE_MAP
if (uHoldOpen && vMapUv.x > 0.8 && vMapUv.y < 0.2) discard;
#endif
#include <map_fragment>`);
    };
    return material;
  }, [hatchOpen]);
  const sails = useMemo(() => SAILS.map((s) => sailGeometry(s.h)), []);
  const tornSail = useMemo(() => sailGeometry(SAILS[1].h, true), []);
  const yawed = useRef<THREE.Group>(null), outer = useRef<THREE.Group>(null), mainMast = useRef<THREE.Group>(null);
  const hold = useRef<THREE.Group>(null);
  const sailRefs = useRef<Array<THREE.Mesh | null>>([]);
  const dir = useMemo(() => new THREE.Vector3(), []);
  useFrame((state, dt) => {
    const g = outer.current;
    const cam = state.camera;
    cam.getWorldDirection(dir);
    const len = Math.hypot(dir.x, dir.z) || 1;
    const near = Math.hypot(rt.player.x - SHIP.x, rt.player.z - SHIP.z) < 40;
    updateShipCut(rt.player.x, rt.player.z, dir.x / len, dir.z / len, vy.active && vy.cut && near);
    const y = yawed.current;
    if (!g || !y) return;
    const c = rt.camera.pos;
    // Far enough for the sighting on the horizon (the fog hides it beyond).
    y.visible = vy.active && rt.world === "home" && Math.hypot(c.x - SHIP.x - vy.shipOffset.x, c.z - SHIP.z - vy.shipOffset.z) < 300;
    if (!y.visible) return;
    if (hold.current) hold.current.visible = vy.inHold;
    hatchOpen.value = vy.inHold;
    // Heading about the ship's origin (its interception), then the storm's pitch and roll about the stern pivot.
    y.position.set(SHIP.x + vy.shipOffset.x, vy.shipBob - vy.shipSink, SHIP.z + vy.shipOffset.z);
    y.rotation.set(0, vy.shipYaw, 0);
    g.position.set(0, PIVOT.y, PIVOT.z);
    g.rotation.set(vy.shipPitch, 0, vy.shipRoll);
    if (mainMast.current) mainMast.current.rotation.set(0, 0, -vy.mastFall * 1.3);
    sailMat.opacity = THREE.MathUtils.damp(sailMat.opacity, vy.cutSails, 13, dt);
    if (Math.abs(sailMat.opacity - vy.cutSails) < 0.01) sailMat.opacity = vy.cutSails;
    const fading = sailMat.opacity > 0 && sailMat.opacity < 1;
    if (sailMat.transparent !== fading) {
      sailMat.transparent = fading;
      sailMat.depthWrite = !fading;
      sailMat.needsUpdate = true;
    }
    for (let i = 0; i < sailRefs.current.length; i++) {
      const m = sailRefs.current[i];
      if (!m) continue;
      m.visible = sailMat.opacity > 0;
      const fill = vy.sails[i], slack = 1 - fill;
      // Filling changes the cloth's depth: a slack sail hangs flat from boom to gaff (sagging only
      // a little) and luffs about its mast; a full one bellies out and holds still.
      m.scale.x = 0.06 + 0.94 * fill + Math.sin(rt.time * (3 + i) + i) * 0.05 * slack;
      m.scale.y = 0.95 + 0.05 * fill;
      m.rotation.y = Math.sin(rt.time * 2.3 + i * 1.7) * 0.08 * slack;
      if (i === 1) m.geometry = vy.sewn < 1 ? tornSail : sails[1];
    }
  });
  const mm = SPOT.mainMast;
  return (
    <>
      <VoyageSea />
      <Wake />
      <group ref={yawed} visible={false}>
      <group ref={outer}>
        <group position={[0, -PIVOT.y, -PIVOT.z]}>
          <mesh geometry={ship.base} material={deckMat} />
          <group ref={hold} visible={false}>
            <mesh geometry={ship.hold} material={flatMat} />
            <mesh geometry={ship.lantern} material={lanternGlass} />
            <pointLight color="#ffba68" intensity={20} distance={11} decay={2}
              position={[HOLD_LANTERN.x, HOLD_LANTERN.y - 0.16, HOLD_LANTERN.z]} />
          </group>
          <mesh geometry={ship.tall} material={tallMat} />
          <group ref={mainMast} position={[mm.x, DECK_Y, mm.z]}>
            <mesh geometry={ship.main} material={tallMat} />
            <mesh ref={(el) => { sailRefs.current[1] = el; }} geometry={sails[1]} material={sailMat} position={[0.12, SAIL_FOOT, 0.1]} />
          </group>
          {[0, 2].map((i) => (
            <mesh key={i} ref={(el) => { sailRefs.current[i] = el; }} geometry={sails[i]} material={sailMat} position={[SAILS[i].mast.x + 0.12, DECK_Y + SAIL_FOOT, SAILS[i].mast.z + 0.1]} />
          ))}
          {CREW_IDS.map((id) => <CrewMember key={id} id={id} />)}
        </group>
      </group>
      </group>
      <VoyageProps />
    </>
  );
}
