import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { rt } from "../game/runtime";
import { getGame } from "../game/store";
import { NPCS, NPC_OF } from "../game/data/town";
import {
  lowlandRegionVisible,
  PORT_WALL,
  STAGE_EXITS,
  TOWN_GATE,
  townGateOpen,
  GROVE_DOOR,
  groveDoorOpen,
  gapDeck,
  lowlandBridgeY,
  CANOPY_GAPS,
  CANOPY_ROPES,
  CHESTS,
  LILY_PADS,
  POND,
  POND_Y,
  streamY,
  SERVICES,
  type ServiceId,
} from "../game/world/lowland";
import { TUNNEL, groundY, inTunnel } from "../game/world/island";
import { standY } from "../game/world/collision";
import { GROVE_STREAM } from "../game/world/groveStream";
import { nearestOnTrail } from "../game/world/lowland";
import { ropeCoilGeometry } from "./models/forest";
import { layerView } from "./layerView";
import { flatMat, occluderMat, smoothMat, canopySolidMat, canopyOccluderMat, causewayOccluderMat } from "./materials";
import { conformBridge } from "./models/bridge";
import { portDoorGeometry, portWallGeometry } from "./models/portWall";
import { groveDoorGeometry, groveDoorFrameGeometry } from "./models/groveDoor";
import { audio } from "../audio/audio";
import { Chest } from "./Chest";
import { Secrets } from "./Secrets";
import {
  spatialGeometry,
  stageBarrierGeometry,
  cliffFaceGeometry,
  cliffRopeGeometry,
  giantFernGeometry,
  canopyDeckGeometry,
  canopyRopeGeometry,
  canopyRopeAnchorsGeometry,
  updateCanopyPayingRope,
  lilyPadGeometry,
  updateLilyPadMatrices,
  lowlandPropsGeometry,
  lowlandSceneryY,
  lowlandSpots,
  lowlandTerrainTiles,
  lowlandWaterGeometry,
  mesaGeometry,
  npcGeometry,
  primevalTreeGeometry,
  reedGeometry,
  ropeBridgeGeometry,
  townGeometry,
  townSigns,
  treeFernGeometry,
  vineBridgeGeometry,
  type Spot,
} from "./models/lowland";

/**
 * Act 2's lowland below the sanctuary. Drawn only when it can be seen (from
 * the sanctuary or down in it), in tiles so the frustum skips what is out of
 * view, and with vegetation tiles beyond the fog switched off.
 */

const TILE = 96;
const FOG_NEAR = 55;
const FOG_FAR = 260;
const FAR = FOG_FAR;
/** The town wall drops out of distant views such as the sanctuary's lookout. */
const PORT_WALL_FAR = 70;

/** Read-only inspection surface for rendered region and gate transitions. */
export const lowlandView = { visible: false, fog: { near: FOG_NEAR, far: FOG_FAR }, barriers: {} as Record<string, number> };

function cameraInTunnel() {
  const c = rt.camera.pos;
  const floor = groundY(c.x, c.z);
  return inTunnel(c.x, c.z) && c.y > floor - .2 && c.y < floor + TUNNEL.roof + .15;
}

/** Instanced vegetation split into tiles, each with its own bounds (frustum culled) and a distance cut-off. */
function TiledInstances({ geometry, spots, material, far = FAR }: { geometry: THREE.BufferGeometry; spots: Spot[]; material: THREE.Material; far?: number }) {
  const tiles = useMemo(() => {
    const map = new Map<string, Spot[]>();
    for (const s of spots) {
      const key = `${Math.floor(s.x / TILE)},${Math.floor(s.z / TILE)}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return [...map.values()];
  }, [spots]);
  return (
    <>
      {tiles.map((t, i) => (
        <Tile key={i} geometry={geometry} spots={t} material={material} far={far} />
      ))}
    </>
  );
}

function Tile({ geometry, spots, material, far }: { geometry: THREE.BufferGeometry; spots: Spot[]; material: THREE.Material; far: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const items = useMemo(() => spots.map((s) => ({ ...s, y: lowlandSceneryY(s.x, s.z) - 0.05, scale: s.s })), [spots]);
  const object = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = object;
    const c = new THREE.Color();
    items.forEach((s, i) => {
      o.position.set(s.x, s.y, s.z);
      o.rotation.set(0, s.r, 0);
      o.scale.set(s.s, s.sy ?? s.s, s.s);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, c.setRGB(s.tint, s.tint * (0.95 + (i % 3) * 0.04), s.tint));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [items, object]);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const c = rt.camera.pos;
    const bounds = m.boundingSphere;
    m.visible = !bounds || Math.hypot(c.x - bounds.center.x, c.y - bounds.center.y, c.z - bounds.center.z) < far + bounds.radius;
    if (!m.visible || far >= FOG_FAR) return;
    // Ground clutter grows over eight metres; its tile keeps full-sized bounds.
    let changed = false;
    let growing = false;
    items.forEach((s, i) => {
      const t = Math.max(0, Math.min(1, (far - Math.hypot(c.x - s.x, c.y - s.y, c.z - s.z)) / 8));
      const scale = s.s * t * t * (3 - 2 * t);
      if (scale > 0.01) growing = true;
      if (Math.abs(scale - s.scale) < 0.01) return;
      s.scale = scale;
      object.position.set(s.x, s.y, s.z);
      object.rotation.set(0, s.r, 0);
      object.scale.set(scale, (s.sy ?? s.s) * scale / s.s, scale);
      object.updateMatrix();
      m.setMatrixAt(i, object.matrix);
      changed = true;
    });
    if (changed) m.instanceMatrix.needsUpdate = true;
    m.visible = growing;
  });
  return <instancedMesh ref={ref} args={[geometry, material, spots.length]} />;
}

/** Even small landmarks share the landscape's fog-matched distance rule. */
const near = (x: number, z: number) =>
  Math.hypot(rt.camera.pos.x - x, rt.camera.pos.y - groundY(x, z), rt.camera.pos.z - z) < FOG_FAR + 6;
/** Secret chests sit inside closed pockets: drawn only near the player (each chest is several calls). */
const nearSecretChest = (x: number, z: number) => Math.hypot(rt.player.x - x, rt.player.z - z) < 28;
const nearSideChest = (x: number, z: number) => Math.hypot(rt.player.x - x, rt.player.z - z) < 45;

function Keeper({ service }: { service: ServiceId }) {
  const def = NPCS[NPC_OF[service]];
  const geo = useMemo(() => npcGeometry(def), [def]);
  const ref = useRef<THREE.Group>(null);
  const k = SERVICES[service].keeper;
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    g.visible = near(k.x, k.z);
    const p = rt.player;
    const close = Math.hypot(p.x - k.x, p.z - k.z) < 7;
    const want = close ? Math.atan2(p.x - k.x, p.z - k.z) : k.yaw;
    let d = want - g.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    g.rotation.y += d * 0.08;
    g.position.y = groundY(k.x, k.z) + Math.abs(Math.sin(rt.time * 1.8 + k.x)) * 0.02;
  });
  return (
    <group ref={ref} position={[k.x, groundY(k.x, k.z), k.z]} rotation={[0, k.yaw, 0]}>
      <mesh geometry={geo} material={smoothMat} />
    </group>
  );
}

/** Lily pads rise and the bridges grow and unroll. */
function Unlocks() {
  const root = useRef<THREE.Group>(null);
  const lilies = useMemo(lilyPadGeometry, []);
  const g1 = CANOPY_GAPS.canopyVines,
    g2 = CANOPY_GAPS.canopyRope;
  const d1 = gapDeck("canopyVines"), d2 = gapDeck("canopyRope");
  const deck = (id: keyof typeof CANOPY_GAPS) => lowlandBridgeY(id, CANOPY_GAPS[id].x, gapDeck(id).z1);
  const vines = useMemo(() => conformBridge(vineBridgeGeometry(d1.z1 - d1.z0), g1.x, (d1.z0 + d1.z1) / 2, deck("canopyVines"),
    (x, z) => lowlandBridgeY("canopyVines", x, z)), [g1]);
  const rope = useMemo(() => conformBridge(ropeBridgeGeometry(d2.z1 - d2.z0), g2.x, (d2.z0 + d2.z1) / 2, deck("canopyRope"),
    (x, z) => lowlandBridgeY("canopyRope", x, z)), [g2]);
  const padRef = useRef<THREE.InstancedMesh>(null);
  const padValues = useMemo(() => new Float64Array(LILY_PADS.length).fill(-1), []);
  const padMatrix = useMemo(() => new THREE.Matrix4(), []);
  useFrame(() => {
    if (root.current) root.current.visible = true;
    const u = rt.act2Unlock;
    if (padRef.current) {
      padRef.current.visible = near(39, -223);
      updateLilyPadMatrices(padRef.current, u.groveLilies ?? 0, padValues, padMatrix);
    }
  });
  return (
    <group ref={root}>
      <instancedMesh ref={padRef} args={[lilies, flatMat, LILY_PADS.length]} frustumCulled={false} />
      {/* Each bridge grows from the near (south) end toward the far end. */}
      <BridgeGrow geometry={vines} at={[g1.x, deck("canopyVines"), d1.z1]} len={d1.z1 - d1.z0} which="canopyVines" />
      <BridgeGrow geometry={rope} at={[g2.x, deck("canopyRope"), d2.z1]} len={d2.z1 - d2.z0} which="canopyRope" />
    </group>
  );
}

/** Reused trailing ripples make Bubbo's pond crossing readable from the wide shot. */
function GroveWake() {
  const root = useRef<THREE.Group>(null);
  const rings = useRef<Array<THREE.Mesh | null>>([]);
  const geometry = useMemo(() => {
    const g = new THREE.RingGeometry(0.76, 0.82, 24).rotateX(-Math.PI / 2);
    const colours = new Float32Array(g.getAttribute("position").count * 3).fill(1);
    g.setAttribute("color", new THREE.BufferAttribute(colours, 3));
    return g;
  }, []);
  useFrame(() => {
    const m = rt.monsters.bubbo;
    const stream = nearestOnTrail(GROVE_STREAM.pts, m.x, m.z).d < GROVE_STREAM.w + 2;
    if (root.current) root.current.visible = m.swimming && (stream || Math.hypot(m.x - POND.x, m.z - POND.z) < POND.r + 2);
    for (let i = 0; i < 3; i++) {
      const ring = rings.current[i];
      if (!ring) continue;
      const t = (rt.time * 0.8 + i / 3) % 1;
      ring.position.set(m.x - Math.sin(m.yaw) * (0.7 + t * 1.7), (stream ? streamY(m.x, m.z) : POND_Y) + 0.025 + i * 0.003, m.z - Math.cos(m.yaw) * (0.7 + t * 1.7));
      ring.scale.setScalar(0.45 + t * 0.85);
    }
  });
  return <group ref={root} visible={false}>
    {[0, 1, 2].map(i => <mesh key={i} ref={m => { rings.current[i] = m; }} geometry={geometry} material={flatMat} />)}
  </group>;
}

/** A bridge that grows across its gap from the near end (scale along -z from the anchor). */
function BridgeGrow({
  geometry,
  at,
  len,
  which,
}: {
  geometry: THREE.BufferGeometry;
  at: [number, number, number];
  len: number;
  which: "canopyVines" | "canopyRope";
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const k = rt.act2Unlock[which] ?? 0;
    const g = ref.current;
    if (!g) return;
    g.visible = k > 0.01 && near(at[0], at[2]);
    g.scale.set(1, 1, Math.max(0.01, k));
  });
  return (
    <group ref={ref} position={at}>
      <mesh geometry={geometry} material={flatMat} position={[0, 0, -len / 2]} />
    </group>
  );
}

function CliffRope() {
  const geo = useMemo(cliffRopeGeometry, []);
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (ref.current) ref.current.visible = rt.cliffRope > 0.5;
  });
  return <mesh ref={ref} geometry={geo} material={flatMat} />;
}

/** Near views only: from the sanctuary these ropes would break its render budget. */
const CANOPY_ROPE_FAR = 40;

/** The entrance coil pays out continuously to Puff, then becomes the permanent rope. */
function CanopyRopes() {
  const anchors = useMemo(canopyRopeAnchorsGeometry, []);
  const entrance = useMemo(() => canopyRopeGeometry(CANOPY_ROPES.entrance), []);
  const exit = useMemo(() => canopyRopeGeometry(CANOPY_ROPES.exit), []);
  const coil = useMemo(ropeCoilGeometry, []);
  const paying = useMemo(() => new THREE.BufferGeometry(), []);
  const end = useMemo(() => new THREE.Vector3(), []);
  const payingMat = useMemo(() => new THREE.MeshLambertMaterial({ color: "#e6c68c", flatShading: true }), []);
  const hangRef = useRef<THREE.Mesh>(null), coilRef = useRef<THREE.Mesh>(null), payingRef = useRef<THREE.Mesh>(null);
  const r = CANOPY_ROPES.entrance, coilX = r.x + .9, coilZ = r.foot.z - .3;
  useEffect(() => () => { paying.dispose(); payingMat.dispose(); }, [paying, payingMat]);
  useFrame(() => {
    const solved = getGame().progress.solved.includes("canopyAscentRope");
    const flight = rt.canopyAscentRope;
    const hanging = solved || flight.tied > 0;
    const c = rt.camera.pos, near = Math.hypot(c.x - r.x, c.z - r.faceZ) < CANOPY_ROPE_FAR + 8;
    if (hangRef.current) hangRef.current.visible = hanging && near;
    if (coilRef.current) {
      coilRef.current.visible = !hanging && near;
      coilRef.current.scale.setScalar(Math.max(.03, 1 - flight.payout));
    }
    if (payingRef.current) {
      payingRef.current.visible = flight.carried && !hanging;
      if (payingRef.current.visible) {
        const m = rt.monsters.puff;
        end.set(m.x, standY(m.x, m.z, getGame().progress.solved) + m.air - .12, m.z);
        updateCanopyPayingRope(paying, end);
      }
    }
  });
  return <group>
    <DistanceMesh geometry={anchors} material={flatMat} far={CANOPY_ROPE_FAR} />
    <mesh ref={hangRef} geometry={entrance} material={flatMat} />
    <DistanceMesh geometry={exit} material={causewayOccluderMat} far={CANOPY_ROPE_FAR} />
    <mesh ref={coilRef} geometry={coil} material={smoothMat} position={[coilX, groundY(coilX, coilZ), coilZ]} />
    <mesh ref={payingRef} geometry={paying} material={payingMat} frustumCulled={false} />
  </group>;
}

/** The same air from the overlook to the quay, including both rope handoffs. */
function LowlandFog() {
  const { scene } = useThree();
  useFrame(() => {
    const fog = scene.fog as THREE.Fog | null;
    if (!fog) return;
    const lowland = lowlandRegionVisible(rt.player.x, rt.player.z, cameraInTunnel());
    fog.far = FOG_FAR;
    fog.near += ((lowland ? FOG_NEAR : 70) - fog.near) * 0.05;
    lowlandView.fog.near = fog.near;
    lowlandView.fog.far = fog.far;
  });
  return null;
}

export function Lowland() {
  const region = useRef<THREE.Group>(null);
  const terrain = useMemo(() => lowlandTerrainTiles(TILE), []);
  const spots = useMemo(lowlandSpots, []);
  const tree = useMemo(primevalTreeGeometry, []);
  const fern = useMemo(giantFernGeometry, []);
  const fernTree = useMemo(treeFernGeometry, []);
  const reed = useMemo(reedGeometry, []);
  const props = useMemo(() => spatialGeometry(lowlandPropsGeometry(), TILE), []);
  // Walking tops stay solid; north faces dissolve along the fixed Causeway sight line.
  const canopyDecks = useMemo(() => canopyDeckGeometry("solid"), []);
  const canopyFaces = useMemo(() => canopyDeckGeometry("occluder"), []);
  const cliff = useMemo(cliffFaceGeometry, []);
  const mesa = useMemo(mesaGeometry, []);
  const water = useMemo(() => spatialGeometry(lowlandWaterGeometry(), TILE), []);
  const waterTime = useMemo(() => ({ value: 0 }), []);
  const waterMat = useMemo(() => {
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.82, depthWrite: false });
    material.onBeforeCompile = shader => {
      shader.uniforms.uWaterTime = waterTime;
      shader.vertexShader = "varying vec3 vWaterPosition;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvWaterPosition = position;");
      shader.fragmentShader = "uniform float uWaterTime; varying vec3 vWaterPosition;\n" + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_begin>", `#include <normal_fragment_begin>
        float channel = step(28.0, vWaterPosition.x) * step(vWaterPosition.x, 75.0) * step(-215.0, vWaterPosition.z) * step(vWaterPosition.z, -207.0);
        // Flow scrolls east; two crossing wavelengths give low broad ripples.
        float flow = sin(vWaterPosition.x * 3.8 + vWaterPosition.z * 1.7 - uWaterTime * 3.0);
        float ripple = sin(vWaterPosition.x * 1.3 - vWaterPosition.z * 6.0 - uWaterTime * 2.0);
        normal = normalize(normal + channel * vec3(flow * .13, 0.0, ripple * .1));
        diffuseColor.rgb *= 1.0 + channel * (.055 * flow + .035 * ripple);
      `);
    };
    return material;
  }, [waterTime]);
  const town = useMemo(townGeometry, []);
  const portWall = useMemo(portWallGeometry, []);
  const signs = useMemo(townSigns, []);
  const signMat = useMemo(() => new THREE.MeshBasicMaterial({ map: signs.tex, side: THREE.DoubleSide }), [signs]);
  useFrame(() => {
    waterTime.value = rt.time;
    // Only the genuinely enclosed passage suppresses the real basin. Outside
    // its roof and walls the scenery uses the same distance/fog tiles everywhere.
    const shot = rt.camera.shot !== null && rt.camera.shot.target.z < -125;
    lowlandView.visible = !cameraInTunnel() && layerView(rt.player.layer).ground && (shot || lowlandRegionVisible(rt.player.x, rt.player.z));
    if (region.current) region.current.visible = lowlandView.visible;
  });
  return (
    <group ref={region}>
      <LowlandFog />
      {terrain.map((g, i) => (
        <DistanceMesh key={i} geometry={g} material={flatMat} />
      ))}
      <mesh geometry={cliff} material={flatMat} />
      <DistanceMesh geometry={canopyDecks} material={canopySolidMat} />
      <DistanceMesh geometry={canopyFaces} material={canopyOccluderMat} />
      <DistanceMesh geometry={mesa} material={flatMat} />
      {props.map((geometry, i) => (
        <DistanceMesh key={i} geometry={geometry} material={occluderMat} />
      ))}
      {water.map((geometry, i) => (
        <DistanceMesh key={i} geometry={geometry} material={waterMat} />
      ))}
      <DistanceMesh geometry={town} material={flatMat} />
      <DistanceMesh geometry={portWall} material={occluderMat} far={PORT_WALL_FAR} />
      <PortGate />
      <GroveDoor />
      <DistanceMesh geometry={signs.geo} material={signMat} />
      <TiledInstances geometry={tree} spots={spots.trees} material={occluderMat} />
      <TiledInstances geometry={fernTree} spots={spots.fernTrees} material={occluderMat} />
      <TiledInstances geometry={fern} spots={spots.ferns} material={flatMat} far={60} />
      <TiledInstances geometry={reed} spots={spots.reeds} material={flatMat} far={50} />
      {STAGE_EXITS.filter((gate) => gate.kind !== "wood" && gate.kind !== "groveDoor").map((gate) => (
        <StageBarrier key={`${gate.id}:${gate.x}`} gate={gate} />
      ))}
      <CliffRope />
      <CanopyRopes />
      <Unlocks />
      <GroveWake />
      <Secrets />
      {CHESTS.filter((c) => (c.layer ?? "ground") === "ground").map((c) => (
        <Chest key={c.id} id={c.id} visible={c.secret ? nearSecretChest : c.close ? nearSideChest : near} />
      ))}
      {(Object.keys(SERVICES) as ServiceId[]).map((s) => (
        <Keeper key={s} service={s} />
      ))}
    </group>
  );
}

function DistanceMesh({ geometry, material, far = FOG_FAR }: { geometry: THREE.BufferGeometry; material: THREE.Material; far?: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const bounds = useMemo(() => {
    geometry.computeBoundingSphere();
    return geometry.boundingSphere!;
  }, [geometry]);
  useFrame(() => {
    const c = rt.camera.pos;
    if (ref.current) ref.current.visible = Math.hypot(c.x - bounds.center.x, c.y - bounds.center.y, c.z - bounds.center.z) < far + bounds.radius;
  });
  return <mesh ref={ref} geometry={geometry} material={material} />;
}
/** The town's gate: its doors swing in toward the town once the coast is cleared. */
function PortGate() {
  const left = useRef<THREE.Mesh>(null), right = useRef<THREE.Mesh>(null);
  const doors = useMemo(() => ({ left: portDoorGeometry(1), right: portDoorGeometry(-1) }), []);
  const state = useRef({ open: false, k: -1 });
  const group = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (group.current) group.current.visible = Math.hypot(rt.camera.pos.x - TOWN_GATE.x, rt.camera.pos.z - PORT_WALL.z) < 120;
    const a2 = getGame().progress.act2, p = rt.player, s = state.current;
    const cleared = a2.cleared.includes("coast");
    s.open = townGateOpen(cleared, a2.portFound, Math.hypot(p.x - TOWN_GATE.x, p.z - PORT_WALL.z), s.open);
    // A save that loads with the gate open starts open, without a sound.
    if (s.k < 0) s.k = s.open ? 1 : 0;
    if (s.open && s.k === 0) audio.play("stones");
    s.k = Math.max(0, Math.min(1, s.k + (s.open ? dt : -dt) / .7));
    lowlandView.barriers.coast = cleared ? 1 : 0;
    const e = s.k * s.k * (3 - 2 * s.k) * Math.PI / 2;
    if (left.current) left.current.rotation.y = e;
    if (right.current) right.current.rotation.y = -e;
  });
  const y = groundY(TOWN_GATE.x, PORT_WALL.z);
  return <group ref={group}>
    <mesh ref={left} geometry={doors.left} material={occluderMat} position={[TOWN_GATE.x - PORT_WALL.gateHalf, y, PORT_WALL.z]} />
    <mesh ref={right} geometry={doors.right} material={occluderMat} position={[TOWN_GATE.x + PORT_WALL.gateHalf, y, PORT_WALL.z]} />
  </group>;
}
function GroveDoor() {
  const frame = useMemo(groveDoorFrameGeometry, []);
  const doors = useMemo(() => [groveDoorGeometry(1), groveDoorGeometry(-1)], []);
  const left = useRef<THREE.Mesh>(null), right = useRef<THREE.Mesh>(null);
  const state = useRef({ open: false, k: -1 });
  useFrame((_, dt) => {
    const game = getGame(), s = state.current;
    // The scene mounts behind the title, before Continue installs saved progress.
    if (game.screen !== "game") { s.open = false; s.k = -1; return; }
    const cleared = game.progress.act2.cleared.includes("grove");
    const opened = groveDoorOpen(cleared, Math.hypot(rt.player.x - GROVE_DOOR.x, rt.player.z - GROVE_DOOR.z), s.open, s.k < 0);
    if (s.k < 0) s.k = opened ? 1 : 0;
    else if (opened && !s.open) audio.play("stones");
    s.open = opened;
    s.k = Math.max(0, Math.min(1, s.k + (s.open ? dt : -dt) / .7));
    const angle = s.k * s.k * (3 - 2 * s.k) * GROVE_DOOR.openAngle;
    if (left.current) left.current.rotation.y = angle;
    if (right.current) right.current.rotation.y = -angle;
    lowlandView.barriers.grove = s.k;
  });
  const y = groundY(GROVE_DOOR.x, GROVE_DOOR.z);
  return <group>
    <DistanceMesh geometry={frame} material={occluderMat} />
    <mesh ref={left} geometry={doors[0]} material={occluderMat} position={[GROVE_DOOR.x - GROVE_DOOR.half, y, GROVE_DOOR.z]} />
    <mesh ref={right} geometry={doors[1]} material={occluderMat} position={[GROVE_DOOR.x + GROVE_DOOR.half, y, GROVE_DOOR.z]} />
  </group>;
}

function StageBarrier({ gate }: { gate: (typeof STAGE_EXITS)[number] }) {
  const geometry = useMemo(() => stageBarrierGeometry(gate), [gate]),
    ref = useRef<THREE.Mesh>(null),
    open = useRef(0);
  useFrame((_, dt) => {
    const target = getGame().progress.act2.cleared.includes(gate.id) ? 1 : 0;
    open.current += (target - open.current) * Math.min(1, dt * 5);
    lowlandView.barriers[gate.id] = open.current;
    const m = ref.current;
    if (!m) return;
    m.visible = near(gate.x, gate.z) && open.current < 0.995;
    m.position.y = lowlandSceneryY(gate.x, gate.z) - open.current * 4.3;
    m.scale.y = Math.max(0.01, 1 - open.current);
  });
  return <mesh ref={ref} geometry={geometry} material={flatMat} position={[gate.x, lowlandSceneryY(gate.x, gate.z), gate.z]} rotation={[0, gate.orientation === "z" ? Math.PI / 2 : 0, 0]} />;
}
