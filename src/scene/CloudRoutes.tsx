import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { rt } from "../game/runtime";
import { useGame } from "../game/store";
import { CANOPY_GLIDE, CLOUD_ELECTRIC_PANELS, CLOUD_ROUTE_GATES, cloudY, electricPanelPhase } from "../game/world/cloudisle";
import { flatMat, additiveSprite } from "./materials";
import { PartBuilder } from "./partBuilder";
import { addKit, branch, bridge, caveMouth } from "./models/cloudKit";
import { canopyTreeKits } from "./cloudScenery";
export { canopyTreeKits } from "./cloudScenery";
import { audio } from "../audio/audio";

const at = (x: number, z: number, dy = 0): [number, number, number] => [x, cloudY(x, z) + dy, z];
const bark = "#626652", rock = "#293c50";
function span(b: PartBuilder, ax: number, az: number, bx: number, bz: number, width: number, color: string, dy = -.25, height = .4) {
  const len = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az);
  // Short sections follow precisely the same height function as collision.
  for (let i = 0; i < Math.ceil(len); i++) {
    const t = (i + .5) / Math.ceil(len), x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    b.box(width, height, len / Math.ceil(len) + .15, x, cloudY(x, z) + dy, z, color, yaw);
  }
}
/** Current layout only. Branch sockets are public for later walkway placement. */
export function canopyFoundationGeometry() {
  const b = new PartBuilder();
  for (const p of canopyTreeKits()) {
    b.cyl(5.4, 7, 6.3, p.position[0], -6, p.position[2], "#394b53", 10);
    p.kit.geometry.dispose();
  }
  return b.build();
}
function canopyGeometry() {
  const b = new PartBuilder();
  b.add(canopyFoundationGeometry(), "#394b53", [0, 0, 0]);
  span(b, -9, 279, -20, 286, 5.5, bark);
  span(b, -20, 304, -10, 311, 5.5, bark);
  span(b, -10, 311, 0, 312, 5.5, "#8c907d");
  span(b, -26, 302, -32, 303, 4, bark);
  for (const [z0, z1] of [[284, 289.5], [291.5, 298.5], [300.5, 306]]) {
    span(b, -20, z0, -20, z1, 14, "#707d64", -.28, .28);
    for (const x of [-26, -22, -18, -14]) {
      span(b, x, z0, x, z1, 3, "#6f775e", -.8, .8);
      // Heavy tapered roots beneath the walking tops make the height readable.
      addKit(b, branch([0, cloudY(x, z1) - cloudY(x, z0), z1 - z0], .8), [x, cloudY(x, z0) - 1, z0]);
    }
  }
  b.cyl(3, 3.2, .4, -32, cloudY(-32, 303) - .4, 303, bark, 8);
  for (const { position, kit } of canopyTreeKits()) {
    const [x, , z] = position, y = cloudY(x, z);
    // A full rock buttress carries every root, continuously below sea level.
    addKit(b, kit, position);
    // Hanging vines sit at the edges, never between camera and walker.
    for (const dx of [-1, 1]) b.cyl(.045, .045, 7, x + dx * 1.2, y + 1, z, "#82946b", 5);
  }
  for (const p of [CANOPY_GLIDE.from, CANOPY_GLIDE.to]) {
    b.cyl(1.25, 1.4, .1, p.x, cloudY(p.x, p.z) + .05, p.z, "#c4cda1", 8);
    b.torus(.85, .08, at(p.x, p.z, .18), [Math.PI / 2, 0, 0], "#e6dfb0");
    // Feather-shaped pad marker.
    b.boxAt(.22, .04, .85, at(p.x, p.z, .2), [0, -.5, 0], "#526f68");
  }
  // Junction ruins frame both mouths and the actual observatory above them.
  for (const side of [-1, 1]) {
    b.cyl(.7, 1, 2.8, side * 6.5, 11, 274, "#929381", 6);
    b.boxAt(2.1, .15, .65, [side * 6.5, 13.6, 274], [0, side * .55, 0], "#c4b78c");
  }
  b.cyl(2.1, 2.3, .12, 0, 11, 271, "#858a78", 8);
  return b.build();
}
function bridgeGeometry() {
  return bridge({ length: 2, width: 14, deckAt: t => cloudY(-20, 289.5 + t * 2) - cloudY(-20, 289.5) }).geometry;
}
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
  useFrame(() => {
    for (let i = 0; i < 32; i++) {
      const gust = i >= 20, t = (rt.time * .3 + i / 20) % 1;
      const x = gust ? -29 + (t - .5) * 4 : -26 + t * 14, z = gust ? 303 + Math.sin(i * 7) : 283 + (i * 2.37) % 24;
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
      <mesh geometry={bridge} material={flatMat} position={at(-20, 289.5)} rotation={[vine ? 0 : 1.25, 0, 0]} />
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
