import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { rt } from "../game/runtime";
import { useGame } from "../game/store";
import { CANOPY_GLIDE, CANOPY_GUST_SPUR, CLOUD_CAVES, CLOUD_CHASMS, CLOUD_CHESTS, CLOUD_DECKS, CLOUD_ELECTRIC_PANELS, CLOUD_OBSTACLE_PLACE, CLOUD_PUZZLE_BARRIERS, CLOUD_ROUTE_GATES, CLOUD_ZONES, GROTTO_MOUTHS, cloudY, electricPanelPhase } from "../game/world/cloudisle";
import { nearestOnTrail, type WalkShape } from "../game/world/lowland";
import { cloudGroundY } from "../game/world/cloudTerrain";
import { flatMat, occluderMat, additiveSprite } from "./materials";
import { PartBuilder } from "./partBuilder";
import { addKit, branch, bridge, caveMouth } from "./models/cloudKit";
import { canopyTreeKits, junctionKits } from "./cloudScenery";
export { canopyTreeKits } from "./cloudScenery";
import { audio } from "../audio/audio";

const at = (x: number, z: number, dy = 0): [number, number, number] => [x, cloudY(x, z) + dy, z];
const bark = "#626652";
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
// ------------------------------------------------------------------ Thunder Grotto
// The cave is generated from CLOUD_CAVES on a 1 m grid: a floor at walking
// height, rock walls along every edge of the footprint, and a ceiling 6.5 m up.
// Walls face inward and walls/ceiling use the line-of-sight material, so a
// follow camera outside a narrow passage still sees the player.
const CEILING = 6.5;
const raftWater = CLOUD_PUZZLE_BARRIERS.find(b => b.puzzle === "grottoRaft")!;
const boilerGate = CLOUD_PUZZLE_BARRIERS.find(b => b.puzzle === "grottoBoiler")!;
function caveDistance(x: number, z: number): number {
  let d = Infinity;
  for (const s of CLOUD_CAVES as readonly WalkShape[]) {
    const e = s.kind === "disc" ? Math.hypot(x - s.x, z - s.z) - s.r
      : s.kind === "trail" ? nearestOnTrail(s.pts, x, z).d - s.w
      : Math.max(s.x0 - x, x - s.x1, s.z0 - z, z - s.z1);
    d = Math.min(d, e);
  }
  return d;
}
const inWater = (x: number, z: number) => x > raftWater.x0 && x < raftWater.x1 && z > raftWater.z0 && z < raftWater.z1;
function grottoShell(): { floor: THREE.BufferGeometry; shell: THREE.BufferGeometry } {
  const floor: number[] = [], floorColor: number[] = [], shell: number[] = [], shellColor: number[] = [];
  const color = new THREE.Color();
  // Triangles are wound so their normal faces `towards`.
  const tri = (out: number[], cols: number[], hex: string, towards: THREE.Vector3, ...p: THREE.Vector3[]) => {
    const n = new THREE.Vector3().subVectors(p[1], p[0]).cross(new THREE.Vector3().subVectors(p[2], p[0]));
    const [a, b, c] = n.dot(towards) >= 0 ? p : [p[0], p[2], p[1]];
    out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    color.set(hex);
    for (let i = 0; i < 3; i++) cols.push(color.r, color.g, color.b);
  };
  const quad = (out: number[], cols: number[], hex: string, towards: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
    tri(out, cols, hex, towards, a, b, c); tri(out, cols, hex, towards, a, c, d);
  };
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const up = v(0, 1, 0), down = v(0, -1, 0);
  const roof = (x: number, z: number) => cloudY(x, z) + CEILING + .6 * Math.sin(x * .7 + z * .4) * Math.sin(z * .5 - x * .3);
  const b = { x0: Math.floor(Math.min(...GROTTO_MOUTHS.map(m => m.x))) - 4, x1: 84, z0: 278, z1: 396 };
  const cave = (x: number, z: number) => caveDistance(x + .5, z + .5) < .9;
  for (let z = b.z0; z < b.z1; z++) for (let x = b.x0; x < b.x1; x++) {
    if (!cave(x, z)) continue;
    const shade = .92 + .08 * Math.sin(x * 1.3 + z * .7);
    const stone = `#${new THREE.Color("#7c8580").multiplyScalar(shade).getHexString()}`;
    const water = inWater(x + .5, z + .5);
    const y = (px: number, pz: number) => cloudY(px, pz) - (water ? .35 : 0);
    quad(floor, floorColor, water ? "#3f93b4" : stone, up, v(x, y(x, z), z), v(x + 1, y(x + 1, z), z), v(x + 1, y(x + 1, z + 1), z + 1), v(x, y(x, z + 1), z + 1));
    quad(shell, shellColor, "#46525a", down, v(x, roof(x, z), z), v(x + 1, roof(x + 1, z), z), v(x + 1, roof(x + 1, z + 1), z + 1), v(x, roof(x, z + 1), z + 1));
    // A wall on every edge whose neighbour is outside the cave, facing inward.
    for (const [dx, dz, ax, az, bx, bz] of [[-1, 0, x, z, x, z + 1], [1, 0, x + 1, z, x + 1, z + 1], [0, -1, x, z, x + 1, z], [0, 1, x, z + 1, x + 1, z + 1]]) {
      if (cave(x + dx, z + dz)) continue;
      const rockHex = (x + z) % 3 ? "#5f6a6e" : "#68737a";
      quad(shell, shellColor, rockHex, v(-dx, 0, -dz), v(ax, cloudY(ax, az) - .4, az), v(bx, cloudY(bx, bz) - .4, bz), v(bx, roof(bx, bz), bz), v(ax, roof(ax, az), az));
    }
  }
  const build = (pos: number[], col: number[]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals(); g.computeBoundingSphere();
    return g;
  };
  return { floor: build(floor, floorColor), shell: build(shell, shellColor) };
}
const crystalChest = CLOUD_CHESTS.find(c => c.id === "cloudCrystalChest")!;
/** Crystal clusters: a ring in the crystal chamber, a few in the lake chamber. */
const GROTTO_CRYSTALS: Array<[number, number]> = [
  ...Array.from({ length: 7 }, (_, i) => [crystalChest.x - 2 + Math.cos(i * .9 + .3) * 5.2, crystalChest.z + Math.sin(i * .9 + .3) * 5.2] as [number, number]),
  [44, 314], [60, 330], [44, 330], [30, 291], [46, 355],
];
function grottoGeometry() {
  const b = new PartBuilder();
  for (const [x, z] of GROTTO_CRYSTALS) {
    const y = cloudY(x, z);
    b.add(new THREE.DodecahedronGeometry(1.1, 0), "#4e6a7e", [x, y + .5, z], [0, x, .2], [1, .9, 1]);
    for (let i = 0; i < 3; i++) b.add(new THREE.ConeGeometry(.3 + i * .06, 1.5 + i * .45, 5), "#69bbc9", [x + (i - 1) * .55, y + .9 + i * .2, z], [0, i, -.18 + i * .15]);
  }
  // Raft basin: a stone lip on the near shore of the underground lake.
  const raft = CLOUD_OBSTACLE_PLACE.grottoRaft;
  b.cyl(1, 1.2, .8, raft.x + 3, cloudY(raft.x + 3, raft.z), raft.z, "#6d7b80", 8);
  // Old raider machinery: boiler, chimneys and overhead pipes by the gate.
  const boiler = CLOUD_OBSTACLE_PLACE.grottoBoiler;
  for (const dx of [-3, 0]) {
    const x = boiler.x + dx, z = boiler.z;
    b.cyl(.85, 1, 1.8, x, cloudY(x, z), z, "#716d5e", 8);
    b.cyl(.22, .22, 3, x, cloudY(x, z) + 1.7, z, "#8e8972", 6);
    b.torus(.7, .1, at(x, z, 1.2), [Math.PI / 2, 0, 0], "#d0a36a");
  }
  for (let x = boilerGate.x0 + 2; x < boilerGate.x1 - 2; x += 2) b.box(2.1, .22, .22, x, cloudY(x, boilerGate.z0) + 3.4, boilerGate.z0 - 1, "#ad8e66");
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
  // The grotto's two openings in the mountainside, framing the dark passage.
  for (const m of GROTTO_MOUTHS) addKit(b, caveMouth(6.4, 6.5, 3), [m.x, cloudY(m.x, m.z) - .6, m.z], m.yaw + Math.PI / 2);
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
      // Two chimneys over the boiler; the second only once Ember lights it.
      const t = (rt.time * .35 + i / 6) % 1, { x: bx, z } = CLOUD_OBSTACLE_PLACE.grottoBoiler, x = i < 6 ? bx - 3 : bx;
      dummy.position.set(x + Math.sin(i * 3) * .2, cloudY(x, z) + 3 + t * 3.5, z);
      dummy.scale.setScalar((.15 + t * .35) * (i < 6 || lit ? 1 : 0)); dummy.updateMatrix(); ref.current?.setMatrixAt(i, dummy.matrix);
    }
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[undefined, undefined, 12]} frustumCulled={false}><icosahedronGeometry args={[1, 0]} /><meshBasicMaterial color="#7ca3b2" transparent opacity={.25} depthWrite={false} /></instancedMesh>;
}

/** Geometry is shared with the real route; inside the cave only this room and
 * its two mouths mount. Outdoor scenery is hidden by CloudIsle's parent. */
/** Cool light in each chamber; the crystal chamber glows brightest. */
const GROTTO_LIGHTS: Array<[number, number, string, number]> = [
  [28, 298, "#67bfe6", 6], [52, 322, "#67bfe6", 7], [crystalChest.x - 2, crystalChest.z, "#7fe0f0", 9], [32, 374, "#9fd0ff", 5],
];
export function CloudRoutes({ inside }: { inside: boolean }) {
  const a = useGame(s => s.progress.act3);
  const canopy = useMemo(canopyGeometry, []), bridge = useMemo(bridgeGeometry, []), grotto = useMemo(grottoGeometry, []), shell = useMemo(grottoShell, []), mouths = useMemo(mouthsGeometry, []);
  const glow = useMemo(() => additiveSprite("#78d9ff", .6), []), fire = useMemo(() => additiveSprite("#ffac55", .8), []);
  const vine = a.puzzles.includes("canopyVine"), raft = a.puzzles.includes("grottoRaft"), boiler = a.puzzles.includes("grottoBoiler");
  return <>
    {!inside && <><mesh geometry={canopy} material={flatMat} /><mesh geometry={mouths} material={flatMat} />
      <mesh geometry={bridge} material={flatMat} position={at(canopyBridgePlacement.x, canopyBridgePlacement.z)} rotation={[vine ? 0 : 1.25, 0, 0]} />
      <RouteWind stopped={a.puzzles.includes("canopyGust")} />
    </>}
    {inside && <>
      <mesh geometry={shell.floor} material={flatMat} /><mesh geometry={shell.shell} material={occluderMat} />
      <mesh geometry={grotto} material={flatMat} /><ElectricPanels /><Steam lit={boiler} />
      {GROTTO_LIGHTS.map(([x, z, c, i]) => <pointLight key={`${x},${z}`} position={at(x, z, 4)} color={c} intensity={i} distance={22} decay={1} />)}
      <pointLight position={at(CLOUD_OBSTACLE_PLACE.grottoBoiler.x, CLOUD_OBSTACLE_PLACE.grottoBoiler.z, 2)} color="#ffad61" intensity={boiler ? 8 : 2} distance={13} decay={1} />
      {GROTTO_CRYSTALS.map(([x, z]) => <sprite key={`${x},${z}`} material={glow} position={at(x, z, 1.6)} scale={[2.4, 2.4, 1]} />)}
      <sprite material={fire} position={at(CLOUD_OBSTACLE_PLACE.grottoBoiler.x, CLOUD_OBSTACLE_PLACE.grottoBoiler.z, 1)} scale={boiler ? [2, 2, 1] : [.5, .5, 1]} />
      <mesh position={at((raftWater.x0 + raftWater.x1) / 2, (raftWater.z0 + raftWater.z1) / 2, raft ? .05 : -1)}><boxGeometry args={[4, .25, raftWater.z1 - raftWater.z0 + 1.6]} /><meshLambertMaterial color="#9a8965" /></mesh>
      {!boiler && <RouteGate x={(boilerGate.x0 + boilerGate.x1) / 2} z={(boilerGate.z0 + boilerGate.z1) / 2} open={false} />}
    </>}
    {CLOUD_ROUTE_GATES.filter(g => inside === (g.zone === "thunderGrotto")).map(g => <RouteGate key={g.zone} x={g.x} z={g.z} open={a.cleared.includes(g.zone)} />)}
  </>;
}

export const cloudRouteGeometry = { canopyGeometry, bridgeGeometry, mouthsGeometry, grottoGeometry, grottoShell };
