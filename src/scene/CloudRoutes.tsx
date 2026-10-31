import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { rt } from "../game/runtime";
import { useGame } from "../game/store";
import { CANOPY_GLIDE, CANOPY_GUST_SPUR, CLOUD_CHASMS, CLOUD_DECKS, CLOUD_ELECTRIC_PANELS, CLOUD_PUZZLE_BARRIERS, CLOUD_ROUTE_GATES, CLOUD_ZONES, cloudY, electricPanelPhase } from "../game/world/cloudisle";
import { cloudGroundY } from "../game/world/cloudTerrain";
import { flatMat, additiveSprite } from "./materials";
import { PartBuilder } from "./partBuilder";
import { addKit, branch, bridge, caveMouth } from "./models/cloudKit";
import { canopyTreeKits, junctionKits } from "./cloudScenery";
export { canopyTreeKits } from "./cloudScenery";
import { audio } from "../audio/audio";

const at = (x: number, z: number, dy = 0): [number, number, number] => [x, cloudY(x, z) + dy, z];
const bark = "#626652", rock = "#293c50";
const gustTrail = CANOPY_GUST_SPUR.find(s => s.kind === "trail")!;
const viewpoint = CANOPY_GUST_SPUR.find(s => s.kind === "disc")!;

/** Actual post extents, shared with the rendered-foundation grounding test. */
export function canopyDeckSupports() {
  const posts: Array<{ x: number; z: number; bottom: number; top: number; radius: number }> = [];
  const put = (x: number, z: number) => {
    const radius = .22, top = cloudY(x, z) - .24;
    let bottom = cloudGroundY(x, z);
    for (const dx of [-radius, radius]) for (const dz of [-radius, radius]) bottom = Math.min(bottom, cloudGroundY(x + dx, z + dz));
    // The terrain triangles interpolate through grid vertices, including the
    // sharp drop under the spur. Include the enclosing 2/4 m grid cells rather
    // than seating a short post on the continuous shoulder above that chord.
    const foot = radius * 1.3;
    for (let gx = Math.floor((x - foot) / 4) * 4; gx <= Math.ceil((x + foot) / 4) * 4; gx += 2) {
      for (let gz = Math.floor((z - foot) / 4) * 4; gz <= Math.ceil((z + foot) / 4) * 4; gz += 2) bottom = Math.min(bottom, cloudGroundY(gx, gz));
    }
    bottom -= .3; // embed beneath the terrain grid's interpolated surface
    if (top > bottom) posts.push({ x, z, bottom, top, radius });
  };
  for (let i = 1; i < gustTrail.pts.length; i++) {
    const [ax, az] = gustTrail.pts[i - 1], [bx, bz] = gustTrail.pts[i];
    const length = Math.hypot(bx - ax, bz - az), steps = Math.ceil(length / 5);
    for (let j = 0; j <= steps; j++) for (const side of [-1, 1]) {
      put(ax + (bx - ax) * j / steps + (bz - az) / length * (gustTrail.w - .25) * side,
        az + (bz - az) * j / steps - (bx - ax) / length * (gustTrail.w - .25) * side);
    }
  }
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    put(viewpoint.x + Math.cos(angle) * (viewpoint.r - .7), viewpoint.z + Math.sin(angle) * (viewpoint.r - .7));
  }
  put(viewpoint.x, viewpoint.z);
  return posts;
}
export function canopyFoundationGeometry() {
  const b = new PartBuilder();
  for (const p of canopyDeckSupports()) {
    b.cyl(p.radius, p.radius * 1.3, p.top - p.bottom, p.x, p.bottom, p.z, bark, 6);
    // Branch braces overlap the post head and the underside of the planks.
    addKit(b, branch([.85, .25, 0], .22), [p.x, p.top - .25, p.z]);
    addKit(b, branch([-.85, .25, 0], .22), [p.x, p.top - .25, p.z]);
  }
  const beam = (ax: number, az: number, bx: number, bz: number) => {
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 4);
    for (let i = 0; i < steps; i++) {
      const x = THREE.MathUtils.lerp(ax, bx, i / steps), z = THREE.MathUtils.lerp(az, bz, i / steps);
      const nx = THREE.MathUtils.lerp(ax, bx, (i + 1) / steps), nz = THREE.MathUtils.lerp(az, bz, (i + 1) / steps);
      addKit(b, branch([nx - x, cloudY(nx, nz) - cloudY(x, z), nz - z], .3), [x, cloudY(x, z) - .45, z]);
    }
  };
  // Continuous bearers join the post heads and carry the planks between them.
  for (let i = 1; i < gustTrail.pts.length; i++) {
    const [ax, az] = gustTrail.pts[i - 1], [bx, bz] = gustTrail.pts[i], length = Math.hypot(bx - ax, bz - az);
    for (const side of [-1, 0, 1]) {
      const dx = (bz - az) / length * (gustTrail.w - .25) * side, dz = -(bx - ax) / length * (gustTrail.w - .25) * side;
      beam(ax + dx, az + dz, bx + dx, bz + dz);
    }
  }
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    beam(viewpoint.x, viewpoint.z, viewpoint.x + Math.cos(angle) * (viewpoint.r - .7), viewpoint.z + Math.sin(angle) * (viewpoint.r - .7));
  }
  return b.build();
}
function deckDistance(s: typeof CLOUD_DECKS[number], x: number, z: number): number {
  if (s.kind === "disc") return Math.hypot(x - s.x, z - s.z) - s.r;
  if (s.kind === "rect") return Math.max(s.x0 - x, x - s.x1, s.z0 - z, z - s.z1);
  let distance = Infinity;
  for (let i = 1; i < s.pts.length; i++) {
    const [ax, az] = s.pts[i - 1], [bx, bz] = s.pts[i], dx = bx - ax, dz = bz - az;
    const t = THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    distance = Math.min(distance, Math.hypot(x - ax - dx * t, z - az - dz * t) - s.w);
  }
  return distance;
}
/** Short, tessellated planks follow cloudY across their entire walking face. */
function deckPlank(b: PartBuilder, x: number, z: number) {
  const corners = [[x, z], [x, z + .5], [x + 1, z + .5], [x + 1, z]];
  const points = [0, -.26].flatMap(dy => corners.flatMap(([px, pz]) => [px, cloudY(px, pz) + .025 + dy, pz]));
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0]);
  g.computeVertexNormals();
  b.add(g, Math.round(z * 2) % 3 ? "#9d875f" : "#897553", [0, 0, 0]);
}
function canopyGeometry() {
  const b = new PartBuilder();
  b.add(canopyFoundationGeometry(), bark, [0, 0, 0]);
  const cells = new Set<string>();
  for (const s of CLOUD_DECKS) {
    const bounds = s.kind === "disc" ? [s.x - s.r, s.x + s.r, s.z - s.r, s.z + s.r]
      : s.kind === "rect" ? [s.x0, s.x1, s.z0, s.z1]
      : [Math.min(...s.pts.map(p => p[0])) - s.w, Math.max(...s.pts.map(p => p[0])) + s.w,
        Math.min(...s.pts.map(p => p[1])) - s.w, Math.max(...s.pts.map(p => p[1])) + s.w];
    for (let x = Math.floor(bounds[0]); x < bounds[1]; x++) for (let z = Math.floor(bounds[2] * 2) / 2; z < bounds[3]; z += .5) {
      // Include cells touching the edge, so every playable boundary is carried.
      if (deckDistance(s, x + .5, z + .25) <= Math.hypot(.5, .25)) cells.add(`${x},${z}`);
    }
  }
  for (const cell of cells) { const [x, z] = cell.split(",").map(Number); deckPlank(b, x, z); }
  // Low open rails on the sea side, with no rail across the entrance.
  const rail = (ax: number, az: number, bx: number, bz: number) => {
    const length = Math.hypot(bx - ax, bz - az), steps = Math.ceil(length / 1.5), yaw = Math.atan2(bx - ax, bz - az);
    for (let i = 0; i < steps; i++) {
      const t = (i + .5) / steps, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      b.box(.11, .11, length / steps + .1, x, cloudY(x, z) + 1.05, z, "#b6a77c", yaw);
      if (i % 2 === 0) b.cyl(.085, .1, 1.2, x, cloudY(x, z) - .1, z, bark, 5);
    }
  };
  for (let i = 1; i < gustTrail.pts.length; i++) {
    const [ax, az] = gustTrail.pts[i - 1], [bx, bz] = gustTrail.pts[i], length = Math.hypot(bx - ax, bz - az);
    const dx = -(bz - az) / length * gustTrail.w, dz = (bx - ax) / length * gustTrail.w;
    rail(ax + dx, az + dz, bx + dx, bz + dz);
  }
  for (let i = 0; i < 10; i++) {
    const a = Math.PI * (.25 + i * .15), c = a + Math.PI * .15;
    rail(viewpoint.x + Math.cos(a) * viewpoint.r, viewpoint.z + Math.sin(a) * viewpoint.r,
      viewpoint.x + Math.cos(c) * viewpoint.r, viewpoint.z + Math.sin(c) * viewpoint.r);
  }
  for (const { position, kit, yaw } of canopyTreeKits()) addKit(b, kit, position, yaw);
  for (const p of [CANOPY_GLIDE.from, CANOPY_GLIDE.to]) {
    // Pads end exactly on their lips; no geometry crosses the open glide gap.
    b.cyl(.95, 1.05, .08, p.x, cloudY(p.x, p.z) + .025, p.z, "#c4cda1", 8);
    b.torus(.72, .06, at(p.x, p.z, .14), [Math.PI / 2, 0, 0], "#e6dfb0");
    b.boxAt(.22, .04, .75, at(p.x, p.z, .17), [0, -.5, 0], "#526f68");
  }
  return b.build();
}
const vineBarrier = CLOUD_PUZZLE_BARRIERS.find(b => b.puzzle === "canopyVine")!;
const vineChasm = CLOUD_CHASMS.find(c => c.z0 === vineBarrier.z0)!;
const vineTrail = CLOUD_ZONES.skyrootCanopy.walk.filter(s => s.kind === "trail").find(s => s.pts.some((p, i) => i > 0 && s.pts[i - 1][1] < vineChasm.z0 && p[1] > vineChasm.z1))!;
const vineSegment = vineTrail.pts.findIndex((p, i) => i > 0 && vineTrail.pts[i - 1][1] < vineChasm.z0 && p[1] > vineChasm.z1);
const [vineA, vineB] = [vineTrail.pts[vineSegment - 1], vineTrail.pts[vineSegment]];
const vineSlope = (vineB[0] - vineA[0]) / (vineB[1] - vineA[1]);
// The ends rest 1.3 m back on level ground: the 2 m terrain grid slopes into the gap at its lip.
const vineLength = vineChasm.z1 - vineChasm.z0 + 2.6;
export const canopyBridgePlacement = {
  x: THREE.MathUtils.lerp(vineA[0], vineB[0], ((vineChasm.z0 + vineChasm.z1) / 2 - vineA[1]) / (vineB[1] - vineA[1])),
  // The trail crosses at an angle. Its complete footprint, including both
  // lips, must fit inside this z-aligned bridge and the barrier's x range.
  z: vineChasm.z0 - 1.3, length: vineLength,
  width: Math.min(vineBarrier.x1 - vineBarrier.x0, vineTrail.w * 2 * Math.hypot(1, vineSlope) + vineLength * Math.abs(vineSlope) + .4),
};
export function canopyBridgeKit() {
  const { x, z, length, width } = canopyBridgePlacement;
  return bridge({ length, width, deckAt: t => cloudY(x, z + t * length) - cloudY(x, z) });
}
function bridgeGeometry() { return canopyBridgeKit().geometry; }
function grottoGeometry() {
  const b = new PartBuilder();
  // A closed shell, with high ceiling above every gameplay camera. Portals
  // are at the southwest and northwest corners; exterior draws separately.
  for (let z = 276; z < 315; z++) {
    const y = cloudY(20, z);
    b.box(30, .8, 1.05, 24, y - .82, z + .5, "#344656");
    for (const x of [9, 39]) b.box(2.5, 42, 1.1, x, 9, z + .5, rock);
  }
  b.box(32, 2, 41, 24, 49, 295.5, "#233344");
  b.box(26, 42, 2, 27, 9, 276, rock);
  b.box(20, 42, 2, 30, 9, 314.8, rock);
  for (const [x, z] of [[12, 283], [29, 288], [30, 297], [12, 303], [36, 306], [22, 312]]) {
    const y = cloudY(x, z);
    b.add(new THREE.DodecahedronGeometry(2.6, 0), "#354b60", [x, y + 2.2, z], [0, z, .2], [1, 1.8, 1]);
    for (let i = 0; i < 3; i++) b.add(new THREE.ConeGeometry(.35 + i * .06, 1.7 + i * .4, 5), "#69bbc9", [x + (i - 1) * .65, y + 1 + i * .2, z - 1.6], [0, i, -.18 + i * .15]);
  }
  // Underground pool and waterfall share the room; no outdoor sea drawn here.
  b.box(14, .08, 2.2, 20, cloudY(20, 290.5) + .05, 290.5, "#307a94");
  b.box(2, 11, .12, 34, cloudY(34, 292) + 1, 292, "#75b9ca");
  b.cyl(2.6, 3.2, .08, 33, cloudY(33, 292), 292, "#3d8ca5", 12);
  // Basin, channels, boiler and overhead pipes: old raider machinery.
  b.cyl(1, 1.2, .8, 23.8, cloudY(23.8, 288), 288, "#6d7b80", 8);
  for (const z of [288, 297]) {
    b.cyl(.85, 1, 1.8, 25.8, cloudY(25.8, z), z, "#716d5e", 8);
    b.cyl(.22, .22, 3, 25.8, cloudY(25.8, z) + 1.7, z, "#8e8972", 6);
    b.torus(.7, .1, at(25.8, z, 1.2), [Math.PI / 2, 0, 0], "#d0a36a");
  }
  for (let z = 293; z < 305; z += 2) b.box(.22, .22, 2.1, 27.2, cloudY(27.2, z) + 2.4, z, "#ad8e66");
  for (const p of CLOUD_ELECTRIC_PANELS) {
    b.box(p.w + .3, .12, p.d + .3, p.x, cloudY(p.x, p.z), p.z, "#747e7c");
    for (const dx of [-1, 1]) b.box(.12, .13, p.d, p.x + dx * (p.w / 2 - .2), cloudY(p.x, p.z) + .05, p.z, "#c3b687");
  }
  return b.build();
}
function mouthsGeometry() {
  const b = new PartBuilder();
  for (const { position, kit, yaw } of junctionKits()) addKit(b, kit, position, yaw);
  // Broken, low masonry follows the eastern overlook's cliff, leaving the
  // panoramic view open above the player's shoulders.
  const overlook = CLOUD_ZONES.windfallJunction.walk.filter(s => s.kind === "disc").reduce((a, p) => p.x > a.x ? p : a);
  for (let i = 0; i < 7; i++) {
    if (i === 2 || i === 5) continue;
    const angle = -.9 + i * .3, x = overlook.x + Math.cos(angle) * (overlook.r - .25), z = overlook.z + Math.sin(angle) * (overlook.r - .25);
    const y = cloudGroundY(x, z) - .18, yaw = Math.PI / 2 - angle;
    b.box(1.35, .55 + i % 3 * .18, .65, x, y, z, "#65706e", yaw);
    b.box(1.45, .16, .78, x, y + .55 + i % 3 * .18, z, "#929381", yaw);
  }
  for (const [x, z] of [[12, 281], [12, 309]]) {
    const y = cloudY(x, z);
    addKit(b, caveMouth(6.4, 8, 3), [x, y - .85, z]);
    b.box(5, 5.5, .1, x + 1, y + .1, z + 1.5, "#142536");
  }
  return b.build();
}
function RouteGate({ x, z, open }: { x: number; z: number; open: boolean }) {
  const geo = useMemo(() => {
    const b = new PartBuilder();
    for (let x = -6; x <= 6; x++) b.box(.14, 2.5, .16, x, 0, 0, "#a8a082");
    for (const y of [.4, 1.7]) b.box(12.2, .13, .15, 0, y, 0, "#817b68");
    return b.build();
  }, []);
  return <mesh geometry={geo} material={flatMat} position={at(x, z, open ? -3 : 0)} />;
}
function ElectricPanels() {
  const refs = useRef<Array<THREE.Mesh | null>>([]);
  const edges = useRef<Array<THREE.Mesh | null>>([]);
  const sparks = useRef<THREE.InstancedMesh>(null);
  const previous = useRef([false,false]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => CLOUD_ELECTRIC_PANELS.forEach((p, i) => {
    const mesh = refs.current[i]; if (!mesh) return;
    const phase = electricPanelPhase(rt.time, p.phase), mat = mesh.material as THREE.MeshBasicMaterial;
    const active = phase >= 2.4, warning = phase >= 1.8;
    mat.color.set(active ? "#c8f2ff" : warning ? "#eea731" : "#12222f");
    const edge = edges.current[i];
    if(edge) (edge.material as THREE.MeshBasicMaterial).color.set(active ? "#48baff" : warning ? "#ffcc60" : "#294354");
    if(active && !previous.current[i] && Math.hypot(rt.player.x-p.x,rt.player.z-p.z)<22) audio.play("crackle");
    previous.current[i]=active;
    for(let n=0;n<4;n++) {
      const t=(rt.time*2+n*.23)%1;
      dummy.position.set(p.x+Math.sin(n*8+rt.time*4)*p.w*.38,cloudY(p.x,p.z)+.25+t*.7,p.z+Math.cos(n*9)*p.d*.35);
      dummy.rotation.set(0,0,rt.time*7+n);
      dummy.scale.setScalar(active ? .07+Math.sin(t*Math.PI)*.08 : 0);
      dummy.updateMatrix();sparks.current?.setMatrixAt(i*4+n,dummy.matrix);
    }
    if(sparks.current) sparks.current.instanceMatrix.needsUpdate=true;
  }));
  return <>{CLOUD_ELECTRIC_PANELS.map((p, i) => <group key={i}>
    <mesh ref={m=>{edges.current[i]=m;}} position={at(p.x,p.z,.13)}><boxGeometry args={[p.w,.12,p.d]}/><meshBasicMaterial color="#294354"/></mesh>
    <mesh ref={m => { refs.current[i] = m; }} position={at(p.x, p.z, .205)} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[p.w - .2, p.d - .2]} /><meshBasicMaterial color="#12222f" />
    </mesh>
  </group>)}
    <instancedMesh ref={sparks} args={[undefined,undefined,8]} frustumCulled={false}><octahedronGeometry args={[1,0]}/><meshBasicMaterial color="#e5fbff"/></instancedMesh>
  </>;
}
function RouteWind({ stopped }: { stopped: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null), dummy = useMemo(() => new THREE.Object3D(), []);
  const gustBarrier = CLOUD_PUZZLE_BARRIERS.find(b => b.puzzle === "canopyGust")!;
  const gustX = (gustBarrier.x0 + gustBarrier.x1) / 2;
  const gustZ = THREE.MathUtils.lerp(gustTrail.pts[0][1], gustTrail.pts[1][1],
    (gustX - gustTrail.pts[0][0]) / (gustTrail.pts[1][0] - gustTrail.pts[0][0]));
  const trails = CLOUD_ZONES.skyrootCanopy.walk.filter(s => s.kind === "trail");
  useFrame(() => {
    for (let i = 0; i < 32; i++) {
      const gust = i >= 20, t = (rt.time * .3 + i / 20) % 1;
      const trail = trails[i % trails.length], j = i % (trail.pts.length - 1), a = trail.pts[j], b = trail.pts[j + 1];
      const x = gust ? gustX + (t - .5) * 7 : THREE.MathUtils.lerp(a[0], b[0], t);
      const z = gust ? gustZ + Math.sin(i * 7) : THREE.MathUtils.lerp(a[1], b[1], t);
      dummy.position.set(x, cloudY(x, z) + .5 + i % 3 * .4, z);
      dummy.scale.setScalar(gust && stopped ? 0 : Math.sin(t * Math.PI)); dummy.updateMatrix(); ref.current?.setMatrixAt(i, dummy.matrix);
    }
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[undefined, undefined, 32]} frustumCulled={false}><boxGeometry args={[1.5, .025, .04]} /><meshBasicMaterial color="#c4d9cc" transparent opacity={.4} depthWrite={false} /></instancedMesh>;
}
function Steam({ lit }: { lit: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null), dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    for (let i = 0; i < 12; i++) {
      const t = (rt.time * .35 + i / 6) % 1, x = i < 6 ? 14 : 26;
      dummy.position.set(x + Math.sin(i * 3) * .2, cloudY(x, 297) + t * 3.5, 297);
      dummy.scale.setScalar((.15 + t * .35) * (i < 6 || lit ? 1 : 0)); dummy.updateMatrix(); ref.current?.setMatrixAt(i, dummy.matrix);
    }
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[undefined, undefined, 12]} frustumCulled={false}><icosahedronGeometry args={[1, 0]} /><meshBasicMaterial color="#7ca3b2" transparent opacity={.25} depthWrite={false} /></instancedMesh>;
}

/** Geometry is shared with the real route; inside the cave only this room and
 * its two mouths mount. Outdoor scenery is hidden by CloudIsle's parent. */
export function CloudRoutes({ inside }: { inside: boolean }) {
  const a = useGame(s => s.progress.act3);
  const canopy = useMemo(canopyGeometry, []), bridge = useMemo(bridgeGeometry, []), grotto = useMemo(grottoGeometry, []), mouths = useMemo(mouthsGeometry, []);
  const glow = useMemo(() => additiveSprite("#78d9ff", .6), []), fire = useMemo(() => additiveSprite("#ffac55", .8), []);
  const vine = a.puzzles.includes("canopyVine"), raft = a.puzzles.includes("grottoRaft"), boiler = a.puzzles.includes("grottoBoiler");
  return <>
    {!inside && <><mesh geometry={canopy} material={flatMat} /><mesh geometry={mouths} material={flatMat} />
      <mesh geometry={bridge} material={flatMat} position={at(canopyBridgePlacement.x, canopyBridgePlacement.z)} rotation={[vine ? 0 : 1.25, 0, 0]} />
      <RouteWind stopped={a.puzzles.includes("canopyGust")} />
    </>}
    {inside && <>
      <mesh geometry={grotto} material={flatMat} /><ElectricPanels /><Steam lit={boiler} />
      <pointLight position={at(20, 295, 5)} color="#67bfe6" intensity={8} distance={29} decay={1} />
      <pointLight position={at(25, 297, 2)} color="#ffad61" intensity={boiler ? 8 : 2} distance={13} decay={1} />
      {[[12, 283], [29, 288], [30, 297], [12, 303], [36, 306]].map(([x, z]) => <sprite key={`${x},${z}`} material={glow} position={at(x, z, 1.7)} scale={[3, 3, 1]} />)}
      <sprite material={fire} position={at(25.8, 297, 1)} scale={boiler ? [2, 2, 1] : [.5, .5, 1]} />
      <mesh position={at(20, 290.5, raft ? .18 : -1)}><boxGeometry args={[14, .25, 2.4]} /><meshLambertMaterial color="#9a8965" /></mesh>
      {!boiler && <RouteGate x={20} z={299.5} open={false} />}
    </>}
    {CLOUD_ROUTE_GATES.filter(g => inside === (g.zone === "thunderGrotto")).map(g => <RouteGate key={g.zone} x={g.x} z={g.z} open={a.cleared.includes(g.zone)} />)}
  </>;
}

export const cloudRouteGeometry = { canopyGeometry, bridgeGeometry, mouthsGeometry };
