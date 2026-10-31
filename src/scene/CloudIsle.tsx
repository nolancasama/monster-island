import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { rt } from "../game/runtime";
import { getGame, useGame } from "../game/store";
import { NPCS } from "../game/data/town";
import {
  CLOUD_BOUNDS, CLOUD_CHESTS, CLOUD_DOCK, CLOUD_GUSTS, CLOUD_PICKUPS,
  CLOUD_ZONES, COAST_GATE, HOLLOW_APPROACH, HOLLOW, RAIDER_BARRICADE,
  cloudY, type CloudGates,
} from "../game/world/cloudisle";
import { nearestOnTrail, PIER2, type WalkShape } from "../game/world/lowland";
import { cloudGroundY, cloudLandMask } from "../game/world/cloudTerrain";
import { additiveSprite, flatMat, occluderMat } from "./materials";
import { PartBuilder } from "./partBuilder";
import { npcGeometry } from "./models/lowland";
import { addKit, bridge, mountainConifer } from "./models/cloudKit";
import { CHEST_HINGE, CHEST_OPEN_ANGLE, chestBaseGeometry, chestLidGeometry } from "./models/chest";
import { voyageStorm } from "./voyageWeather";
import { CloudRoutes } from "./CloudRoutes";
import { Observatory, SummitWeather, SkyFortress, CagedLumo, HollowAftermath } from "./Observatory";
import { cloudTreePlacements, coniferY, landscapeKits, shelterKits } from "./cloudScenery";
import { StormBeacon } from "./StormBeacon";

export const CLOUD_FOG = { color: "#71818c", near: 40, far: 200 };
export const cloudView = { visible: false, fog: CLOUD_FOG, barriers: { coast: 0, tunnel: 0 } };
const near = (x: number, z: number, radius = 0) => Math.hypot(rt.camera.pos.x - x, rt.camera.pos.z - z) < CLOUD_FOG.far + radius;
const ground = (x: number, z: number, dy = 0): [number, number, number] => [x, cloudY(x, z) + dy, z];
const stone = "#65706e", timber = "#66513d";
/** Arc follows the same concealed turns as movement and the footprints. */
function approachPoint(t: number) {
  const k = Math.min(HOLLOW_APPROACH.length - 1.00001, t * (HOLLOW_APPROACH.length - 1));
  const i = Math.floor(k), a = HOLLOW_APPROACH[i], b = HOLLOW_APPROACH[i + 1], u = k - i;
  return { x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u };
}

function CloudSky() {
  const { scene } = useThree();
  const hemi = useRef<THREE.HemisphereLight>(null), ambient = useRef<THREE.AmbientLight>(null), sun = useRef<THREE.DirectionalLight>(null);
  useEffect(() => {
    const oldBackground = scene.background, oldFog = scene.fog;
    scene.background = new THREE.Color(CLOUD_FOG.color);
    scene.fog = new THREE.Fog(CLOUD_FOG.color, CLOUD_FOG.near, CLOUD_FOG.far);
    return () => { scene.background = oldBackground; scene.fog = oldFog; };
  }, [scene]);
  useFrame((_, dt) => {
    const warm = getGame().progress.act3.area === "hiddenHollow";
    const cave = getGame().progress.act3.area === "thunderGrotto";
    const clear = getGame().progress.act3.beaconDefeated;
    if (hemi.current) hemi.current.intensity = THREE.MathUtils.damp(hemi.current.intensity, cave ? .15 : clear ? 1.3 : warm ? .8 : 1.05, 2, dt);
    if (ambient.current) ambient.current.intensity = THREE.MathUtils.damp(ambient.current.intensity, cave ? .1 : clear ? .5 : warm ? .35 : .18, 2, dt);
    if (sun.current) { sun.current.intensity = cave ? 0 : clear ? 2 : 1.65; sun.current.color.set(clear ? "#fff1ce" : "#d0d7dd"); }
    (scene.background as THREE.Color).set(cave ? "#182a3a" : clear ? "#b8dced" : CLOUD_FOG.color);
    if (scene.fog instanceof THREE.Fog) { scene.fog.color.set(cave ? "#182a3a" : clear ? "#b8dced" : CLOUD_FOG.color); scene.fog.near = cave ? 18 : CLOUD_FOG.near; scene.fog.far = cave ? 60 : clear ? 340 : CLOUD_FOG.far; }
  });
  return <>
    <hemisphereLight ref={hemi} args={["#bbcbd8", "#7b7565", 1.05]} />
    <directionalLight ref={sun} position={[-35, 60, -15]} color="#d0d7dd" intensity={1.65} />
    <ambientLight ref={ambient} color="#d7d0be" intensity={.18} />
  </>;
}

function inShape(s: WalkShape, x: number, z: number): boolean {
  if (s.kind === "rect") return x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1;
  if (s.kind === "disc") return Math.hypot(x - s.x, z - s.z) <= s.r;
  return nearestOnTrail(s.pts, x, z).d <= s.w;
}
const shapes = Object.values(CLOUD_ZONES).flatMap(z => z.walk);
function onGround(x: number, z: number) { return shapes.some(s => inShape(s, x, z)); }

/** Heightfield chunks include a submerged apron around the island. */
/** The only terrain representation: the island heightfield, built in 48 m
 * chunks (2 m grid near walkable ground, 4 m on the open mountain, a short
 * skirt on every chunk edge hiding seams between the two) and merged into
 * 96 m east-west bands, one draw each. The whole island is ~42k triangles. */
function terrainTiles(): THREE.BufferGeometry[] {
  const size = 48, bands = new Map<number, THREE.BufferGeometry[]>();
  const x0 = Math.floor((CLOUD_BOUNDS.x0 - 110) / size), x1 = Math.ceil((CLOUD_BOUNDS.x1 + 110) / size);
  const z0 = Math.floor((CLOUD_BOUNDS.z0 - 50) / size), z1 = Math.ceil((Math.max(CLOUD_BOUNDS.z1, 480) + 50) / size);
  const color = new THREE.Color();
  for (let iz = z0; iz < z1; iz++) for (let ix = x0; ix < x1; ix++) {
    const ox = ix * size, oz = iz * size;
    // Chunks touching land or its 20 m underwater apron.
    let include = false, nearWalk = false;
    for (let z = oz - 20; z <= oz + size + 20 && !include; z += 4)
      for (let x = ox - 20; x <= ox + size + 20; x += 4) if (cloudLandMask(x, z)) { include = true; break; }
    if (!include) continue;
    for (let z = oz - 12; z <= oz + size + 12 && !nearWalk; z += 2)
      for (let x = ox - 12; x <= ox + size + 12; x += 2) if (onGround(x, z)) { nearWalk = true; break; }
    const step = nearWalk ? 2 : 4, positions: number[] = [], colors: number[] = [];
    const paint = (x: number, z: number, y: number, slope: number) => {
      const shade = slope > 55 ? "#6f6c64" : slope > 35 ? "#948e80"
        : y < 0 ? "#b5a47e" : y < .6 ? "#cdb98e" : y < 1.5 ? "#e2cf9f"
        : y > 26 ? "#86a06a" : y > 14 ? "#6fa553" : "#7cbc5c";
      color.set(shade).multiplyScalar(.93 + .07 * Math.sin(x * .31 + z * .23));
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b, color.r, color.g, color.b);
    };
    const tri = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, slope: number) => {
      positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
      paint((ax + bx + cx) / 3, (az + bz + cz) / 3, Math.max(ay, by, cy), slope);
    };
    for (let z = oz; z < oz + size; z += step) for (let x = ox; x < ox + size; x += step) {
      // Preserve the open water below the optional crane bridge.
      if (x + step / 2 > -43 && x + step / 2 < -40 && z + step > 59 && z < 79) continue;
      const a = cloudGroundY(x, z), b = cloudGroundY(x, z + step), c = cloudGroundY(x + step, z), d = cloudGroundY(x + step, z + step);
      if (Math.max(a, b, c, d) < -6) continue;
      const slope = Math.atan(Math.max(Math.abs(a - c), Math.abs(a - b), Math.abs(d - b), Math.abs(d - c)) / step) * 180 / Math.PI;
      tri(x, a, z, x, b, z + step, x + step, c, z, slope);
      tri(x + step, c, z, x, b, z + step, x + step, d, z + step, slope);
    }
    // Edge skirts (1.5 m) close any crack against a neighbour of the other resolution.
    for (let t = 0; t < size; t += step) {
      for (const [ax, az, bx, bz] of [[ox + t, oz, ox + t + step, oz], [ox + size, oz + t, ox + size, oz + t + step],
        [ox + t + step, oz + size, ox + t, oz + size], [ox, oz + t + step, ox, oz + t]]) {
        const ya = cloudGroundY(ax, az), yb = cloudGroundY(bx, bz);
        if (Math.max(ya, yb) < -6) continue;
        // Coloured like the ground they border, so seams never draw as dark lines.
        tri(ax, ya, az, bx, yb, bz, ax, ya - 1.5, az, 0); tri(bx, yb, bz, bx, yb - 1.5, bz, ax, ya - 1.5, az, 0);
      }
    }
    if (!positions.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    g.computeVertexNormals(); g.computeBoundingSphere();
    const band = Math.floor(oz / (size * 2));
    bands.set(band, [...bands.get(band) ?? [], g]);
  }
  return [...bands.entries()].sort((a, b) => a[0] - b[0]).map(([band, parts]) => {
    const g = mergeGeometries(parts)!;
    parts.forEach(p => p.dispose());
    g.computeBoundingSphere();
    g.userData.terrainChunk = { z: band * size * 2, depth: size * 2 };
    return g;
  });
}
function landscapeGeometry() {
  const b = new PartBuilder(5);
  for (const p of landscapeKits()) addKit(b, p.kit, p.position, p.yaw);
  // Intact working dock and the weathered remains of the neighbouring pier.
  b.box(3, .3, 9, 0, .5, -5, timber);
  for (const x of [-1.3, 1.3]) for (const z of [-8, -4, 0]) b.cyl(.13, .16, 2, x, -1, z, timber, 6);
  for (let i = 0; i < 5; i++) b.boxAt(1.8,.18,.6,[11,.4-i*.08,-3-i*1.1],[0,i*.2,-.12],timber);
  // A beached shipwreck: ribs overlap a continuous keel in the second inlet.
  b.box(1.1,.55,9,-25,cloudY(-25,61),61,timber,-.4);
  for(let i=0;i<6;i++) {
    const z=57+i*1.4;
    b.boxAt(6,.3,.3,[-25,cloudY(-25,z)+.7,z],[0,-.4,.22],timber);
  }
  // The abandoned supply camp occupies the third clearing's inland rim.
  for(const [x,z] of [[29,105],[32,106],[30,108],[34,108]]) crate(b,x,cloudY(x,z),z,1);

  return b.build();
}
function SpatialMesh({ geometry, material = flatMat }: { geometry: THREE.BufferGeometry; material?: THREE.Material }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    // Terrain bands span the island's width: cull on their z extent alone.
    const band = geometry.userData.terrainChunk as { z: number; depth: number } | undefined;
    if (ref.current && band) {
      const dz = Math.max(band.z - rt.camera.pos.z, 0, rt.camera.pos.z - band.z - band.depth);
      ref.current.visible = dz < CLOUD_FOG.far;
    }
  });
  return <mesh ref={ref} geometry={geometry} material={material} />;
}

function crate(b: PartBuilder, x: number, y: number, z: number, s = 1) {
  b.box(s, s, s, x, y, z, "#806c47");
  for (const dx of [-.43, .43]) b.box(.09 * s, s, 1.06 * s, x + dx * s, y, z, "#b79a68");
  b.box(.7 * s, .1 * s, .05, x, y + .43 * s, z - .53 * s, "#c1ae77", .5);
  // A crescent is a real open arc, never a filled circular badge.
  b.add(new THREE.TorusGeometry(.19 * s, .045 * s, 4, 12, Math.PI * 1.45), "#eee0ab", [x, y + .62 * s, z - .535 * s], [0, 0, -.7]);
}

function hollowShellGeometry() {
  const b = new PartBuilder();
  // The floor runs behind every wall, including the camera-side cutaway.
  b.box(30, .5, 26, -13, 3.5, 56, "#817765");
  b.box(2.5, 12, 24, -25.5, 3.8, 57, "#555954");
  b.box(2.5, 12, 24, -.5, 3.8, 57, "#5e6057");
  // The only opening at the rear is the family's existing back tunnel.
  b.box(9.5, 12, 2, -22.5, 3.8, 66, "#555954");
  b.box(13, 12, 2, -5.5, 3.8, 66, "#5b5d53");
  b.box(6, 5, 2, -15, 10.5, 66, "#555954");
  // A high rock ceiling stays above both follow and conversation cameras.
  b.box(29, 2.5, 22, -13, 14.3, 58, "#484c46");
  for (let i = 0; i < 7; i++) {
    const x = -23 + i * 3.3;
    b.cylAt(.42, 17, [x, 14.1 + Math.sin(i) * .3, 57], [Math.PI / 2, 0, -.14 + i * .045], timber, 6);
    b.add(new THREE.DodecahedronGeometry(2.5, 0), "#626257", [x, 7.2, 65.2], [.2, i, .3], [1, 1.25, .45]);
  }
  for (const x of [-24, -2]) for (const z of [51, 57, 63]) {
    b.add(new THREE.DodecahedronGeometry(2.6, 0), "#67695d", [x, 6.8, z], [.1, z, .2], [.4, 1.5, 1.25]);
  }
  return b.build().translate(0, 0, 140);
}

function HollowShell() {
  const shell = useMemo(hollowShellGeometry, []), front = useRef<THREE.Mesh>(null);
  const facade = useMemo(() => {
    const b = new PartBuilder();
    b.box(13, 10.5, 2, -19, 4, 49.3, "#555954");
    b.box(7, 10.5, 2, -3.5, 4, 49.3, "#555954");
    b.box(7, 3.5, 2, -10, 11, 49.3, "#555954");
    return b.build().translate(0, 0, 140);
  }, []);
  useFrame(() => {
    // The near wall is cut away only when the lens is outside it. The side
    // walls, rear wall and ceiling continue to close the whole visible room.
    if (front.current) front.current.visible = rt.camera.pos.z > 190.5;
  });
  return <>
    <mesh geometry={shell} material={flatMat} />
    <mesh ref={front} geometry={facade} material={flatMat} />
    {/* Normal +z: from inside, this is the bright back of the waterfall;
        from the approach it cannot sit between the lens and the family. */}
    <mesh position={[-10, 8.1, 190.4]}><planeGeometry args={[5.5, 8.2]} /><meshBasicMaterial color="#cce8e0" transparent opacity={.78} /></mesh>
  </>;
}
function shelterGeometry(upgrade: "base" | "bag" | "wood" | "moss") {
  const b = new PartBuilder(1);
  if (upgrade === "base") {
    const f = { ...HOLLOW.fire, z: HOLLOW.fire.z - 140 };
    for (let i = 0; i < 7; i++) { const a = i * Math.PI * 2 / 7; b.sphere(.25, f.x + Math.sin(a) * .6, 4.16, f.z + Math.cos(a) * .6, stone, [1, .55, 1], 6); }
    b.cyl(.34, .26, .45, f.x, 4.35, f.z, "#413e3b", 8);
    b.torus(.3, .045, [f.x, 4.8, f.z], [Math.PI / 2, 0, 0], "#967957");
    b.box(2, .15, 1.2, -19, 4.8, 54, timber);
    for (const dx of [-.8, .8]) b.box(.15, .8, .8, -19 + dx, 4, 54, timber);
    for (const x of [-18, -15.5]) {
      b.box(1.4, .12, 2.3, x, 4.05, 61, "#b89968"); b.box(1.2, .12, .45, x, 4.18, 61.7, "#ddd1a9");
      b.box(1.2, .09, 1.1, x, 4.18, 60.5, "#897b82");
    }
    for (let i = 0; i < 4; i++) b.cyl(.22, .18, .4, -19.5 + i * .42, 4.9, 54, ["#7f5b46", "#bd9e73"][i % 2], 7);
    for (const [x, z] of [[-8, 61.5], [-7, 61.5]]) b.cyl(.38, .34, .85, x, 4, z, timber, 8);
    crate(b, -6.8, 4, 54.5, .8);
    // Drying fish rack, food sacks, patched wall and a child's map and toys.
    for (const x of [-20, -17]) b.box(.12, 2, .12, x, 4, 63, timber);
    b.box(3.2, .1, .1, -18.5, 5.8, 63, timber);
    for (let i = 0; i < 5; i++) { b.cyl(.025, .025, .4, -19.5 + i * .5, 5.4, 63, "#b7a983", 4); b.sphere(.18, -19.5 + i * .5, 5.3, 63, "#8ba5a3", [.5, 1.7, .6], 6); }
    b.box(2.2, .9, .06, -9, 5.1, 63.8, "#c7b687");
    // The map and patched boards used to hang in front of the cave walls.


    b.boxAt(.06, .8, .03, [-9.2, 5.5, 63.75], [0, 0, -.5], "#718575");
    b.boxAt(.06, .7, .03, [-8.7, 5.5, 63.75], [0, 0, .5], "#718575");
    for (let i = 0; i < 3; i++) b.box(.22, .22, .22, -9 + i * .33, 4, 58.3, ["#cb915e", "#7f9e89", "#9a7d97"][i]);
    b.sphere(.28, -8.3, 4.25, 57.5, "#d2b06d", [1, 1, 1], 7);
    b.boxAt(1.6, .13, .12, [-21.3, 5, 56], [0, 0, .4], timber);
    b.boxAt(1.6, .13, .12, [-21.3, 5.4, 56], [0, 0, -.4], timber);
    // The unrepaired shelf leans, making the first upgrade legible.
    b.boxAt(1.6, .13, .6, [-7, 4.7, 61.5], [0, 0, -.16], timber);
  } else if (upgrade === "bag") {

    for (let i = 0; i < 3; i++) b.sphere(.22, -7.6 + i * .55, 5.95, 61.5, "#c3a97a", [1, 1.1, 1], 6);
  } else if (upgrade === "wood") {
    b.box(2.2, .35, 1.9, -16, 4, 56, "#b2936b");
    for (const dx of [-.65, .65]) b.box(.18, 1.9, .18, -16 + dx, 4.1, 56, timber);
    b.box(1.6, .16, .2, -16, 5.9, 56, timber);
    b.cylAt(.05, .9, [-16, 5.55, 56], [0, 0, 0], "#d5b77d", 5);
    for (let i = 0; i < 5; i++) b.cylAt(.13, .9, [-18, 4.2 + (i % 2) * .24, 56 + Math.floor(i / 2) * .3], [0, 0, Math.PI / 2], "#a38a60", 6);
  } else {
    b.box(1.5, .2, 2.3, -12.8, 4.06, 61.1, "#a8b89a");
    b.box(1.3, .15, .5, -12.8, 4.28, 61.8, "#e1d3b4");
    b.box(1.2, .1, 1.3, -12.8, 4.26, 60.6, "#c0a283");
    for (const x of [-19, -9]) b.sphere(.2, x, 4.12, 62, "#b9d29a", [1.5, .6, 1], 6);
  }
  for (const p of shelterKits(upgrade)) addKit(b, p.kit, [p.position[0],p.position[1],p.position[2]-140]);
  return b.build().translate(0, 0, 140);
}

function familyGeometry(who: "tala" | "bo" | "kiko") {
  const b = new PartBuilder(.6), child = who === "kiko", old = who === "bo";
  const h = child ? .78 : old ? 1.05 : 1.22, skin = "#cb9977";
  const coat = child ? "#caa15d" : old ? "#9a8371" : "#66837b";
  b.box(.48, h * .46, .3, 0, h * .34, 0, coat);
  for (const x of [-.14, .14]) { b.box(.16, h * .34, .18, x, .08, 0, "#4a504f"); b.box(.19, .1, .29, x, 0, -.04, "#554438"); }
  b.sphere(child ? .23 : .25, 0, h + .14, 0, skin, [1, 1.1, .9], 8);
  b.sphere(.26, 0, h + .27, .025, old ? "#d4d0ba" : "#3c332e", [1, .55, .95], 7);
  for (const x of [-.085, .085]) b.sphere(.027, x, h + .17, -.214, "#303635", [1, 1, .6], 6);
  b.box(.12, .025, .025, 0, h + .055, -.22, "#915d47");
  for (const x of [-.32, .32]) b.boxAt(.15, h * .41, .17, [x, h * .59, 0], [0, 0, x * .5], coat);
  if (old) { b.sphere(.15, 0, h -.01, -.19, "#e2dbc5", [1, 1, .5], 7); b.cyl(.035, .04, .85, .41, 0, -.12, timber, 5); }
  else if (!child) { b.box(.57, .12, .34, 0, h * .8, 0, "#bda476"); b.box(.08, .65, .04, .13, h * .36, -.18, "#bda476", .15); }
  else { b.box(.3, .3, .12, 0, h * .4, .2, "#926850"); b.box(.15, .05, .22, .33, h * .4, -.08, "#dbcca0"); }
  return b.build();
}

function FamilyMember({ who }: { who: "tala" | "bo" | "kiko" }) {
  const geo = useMemo(() => familyGeometry(who), [who]);
  const ref = useRef<THREE.Group>(null), arm = useRef<THREE.Group>(null);
  const p = HOLLOW[who];
  useFrame(() => {
    const g = ref.current; if (!g) return;
    const a = getGame().progress.act3;
    const dash = who === "kiko" && a.cleared.includes("stormbreakCoast") && !a.hollowFound;
    g.visible = near(p.x, p.z);
    if (dash) {
      const t = Math.min(1, Math.max(0, rt.kikoTrail));
      const p = approachPoint(t);
      g.position.set(p.x, cloudY(p.x, p.z) + Math.abs(Math.sin(t * 30)) * .13, p.z);
      g.rotation.y = -Math.PI / 2;
    } else {
      g.position.set(p.x, cloudY(p.x, p.z) + Math.sin(rt.time * 2.1 + p.x) * .018, p.z);
      const target = Math.atan2(rt.player.x - p.x, rt.player.z - p.z) + Math.PI;
      g.rotation.y += Math.atan2(Math.sin(target - g.rotation.y), Math.cos(target - g.rotation.y)) * .04;
      g.rotation.z = Math.sin(rt.time * (who === "kiko" ? 2.6 : 1.2) + p.x) * (a.beaconDefeated ? .065 : who === "kiko" ? .045 : .012);
    }
    if (arm.current) arm.current.rotation.x = Math.sin(rt.time * 2) * (a.beaconDefeated ? .24 : .13);
  });
  return <group ref={ref} position={ground(p.x, p.z)}><group ref={arm}><mesh geometry={geo} material={flatMat} /></group></group>;
}

function DiscoveryTrail() {
  const a = useGame(s => s.progress.act3), ref = useRef<THREE.Sprite>(null);
  const footprints = useMemo(() => {
    const b = new PartBuilder();
    for (let i = 0; i < 9; i++) {
      const t = i / 8, p = approachPoint(t), x = p.x + (i % 2 ? .12 : -.12), z = p.z;
      b.sphere(.12, x, cloudY(x, z) + .018, z, "#b6b58c", [.8, .08, 1.6], 6);
      // Bent leaves frame the small footprints, disturbed by Kiko's dash.
      b.boxAt(.08, .55, .07, [x + .4, cloudY(x, z) + .18, z], [.6, 0, -.6], "#97a27b");
    }
    return b.build();
  }, []);
  const glow = useMemo(() => additiveSprite("#e1dfab", .32), []);
  useFrame(() => {
    if (!ref.current) return;
    const t = (rt.time * .18) % 1, { x, z } = approachPoint(t);
    ref.current.position.set(x, cloudY(x, z) + .25, z); ref.current.scale.setScalar(.3 + Math.sin(t * Math.PI) * .18);
  });
  return <group visible={a.cleared.includes("stormbreakCoast") && !a.hollowFound}><mesh geometry={footprints} material={flatMat} /><sprite ref={ref} material={glow} /></group>;
}

function barrierGeometry(half: number) {
  const b = new PartBuilder(1);
  for (let x = -half; x <= half; x += 1) b.box(.18, 2.1, .2, x, 0, 0, "#938a65");
  for (const y of [.45, 1.5]) b.box(half * 2 + .3, .13, .14, 0, y, 0, "#81775b");
  return b.build();
}
function Barriers() {
  const a = useGame(s => s.progress.act3);
  const coast = useMemo(() => barrierGeometry(COAST_GATE.half), []), tunnel = useMemo(() => barrierGeometry(2.1), []);
  const road = useMemo(() => { const b = new PartBuilder();
    for (const x of [-3, 3]) b.box(.3, 3.2, .3, x, 0, 0, timber);
    for (const y of [.7, 1.5, 2.3]) b.box(6.4, .25, .22, 0, y, 0, timber);
    b.boxAt(6.7, .2, .2, [0, 1.6, 0], [0, 0, .35], timber);
    crate(b, 0, .8, -.2, .9); return b.build(); }, []);
  const cr = useRef<THREE.Mesh>(null), tr = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    const open = getGame().progress.act3.cleared.includes("stormbreakCoast");
    cloudView.barriers.coast = THREE.MathUtils.damp(cloudView.barriers.coast, open ? 1 : 0, 4, dt);
    cloudView.barriers.tunnel = THREE.MathUtils.damp(cloudView.barriers.tunnel, getGame().progress.act3.family.tunnelOpen ? 1 : 0, 4, dt);
    if (cr.current) cr.current.position.y = cloudY(COAST_GATE.x, COAST_GATE.z) - cloudView.barriers.coast * 2.6;
    if (tr.current) tr.current.position.y = cloudY(HOLLOW.tunnel.x, HOLLOW.tunnel.z) - cloudView.barriers.tunnel * 2.6;
  });
  return <>
    <mesh ref={cr} geometry={coast} material={flatMat} position={ground(0, COAST_GATE.z)} />
    <mesh ref={tr} geometry={tunnel} material={flatMat} position={ground(HOLLOW.tunnel.x, HOLLOW.tunnel.z)} />
    <mesh geometry={road} material={flatMat} position={ground(RAIDER_BARRICADE.x, RAIDER_BARRICADE.z)} />
    {/* Warm stone is retained behind the moved gate, with sight through its ribs. */}
    {a.family.tunnelOpen && <mesh geometry={tunnel} material={flatMat} position={ground(-19, 203, -.3)} rotation={[0, .8, Math.PI / 2]} scale={[.45, .4, .5]} />}
  </>;
}

function WindAndWater() {
  const streaks = useRef<THREE.InstancedMesh>(null), grass = useRef<THREE.InstancedMesh>(null), falls = useRef<THREE.Mesh>(null), fire = useRef<THREE.Sprite>(null), lantern = useRef<THREE.Sprite>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const glow = useMemo(() => additiveSprite("#ffac57", .8), []), lamp = useMemo(() => additiveSprite("#ffe3a3", .8), []);
  const windGeo = useMemo(() => new THREE.BoxGeometry(1.4, .025, .035), []);
  const windMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#c7d8d4", transparent: true, opacity: .42, depthWrite: false }), []);
  const grassGeo = useMemo(() => { const b = new PartBuilder(); b.cone(.12, .65, 0, 0, 0, "#93a17a", 4); return b.build(); }, []);
  useFrame(() => {
    CLOUD_GUSTS.forEach((lane, k) => {
      for (let i = 0; i < 12; i++) {
        const t = (rt.time * .23 + i / 12) % 1;
        const x = lane.x + (t - .5) * lane.w * lane.dx, z = lane.z + Math.sin(i * 3.3) * lane.d * .45;
        dummy.position.set(x, cloudY(x, z) + .3 + (i % 4) * .25, z);
        dummy.rotation.set(0, -.12, .025); dummy.scale.setScalar(Math.sin(t * Math.PI)); dummy.updateMatrix();
        streaks.current?.setMatrixAt(k * 12 + i, dummy.matrix);
      }
    });
    if (streaks.current) streaks.current.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < 64; i++) {
      const lane = CLOUD_GUSTS[i % 2], x = lane.x + Math.sin(i * 7.1) * lane.w * .45, z = lane.z + Math.cos(i * 3.2) * lane.d * .45;
      dummy.position.set(x, cloudY(x, z), z); dummy.rotation.set(0, 0, -.22 * lane.dx + Math.sin(rt.time * 3.5 + i) * .16);
      dummy.scale.setScalar(.7 + (i % 3) * .15); dummy.updateMatrix(); grass.current?.setMatrixAt(i, dummy.matrix);
    }
    if (grass.current) grass.current.instanceMatrix.needsUpdate = true;
    if (falls.current) {
      const d = Math.hypot(rt.player.x + 10, rt.player.z - 190);
      falls.current.scale.x = THREE.MathUtils.lerp(falls.current.scale.x, d < 3 ? .22 : 1, .08);
      falls.current.position.x = d < 3 ? -12 : -10;
    }
    if (fire.current) fire.current.scale.set(1.6, 1.6 + Math.sin(rt.time * 11) * .2, 1);
    if (lantern.current) lantern.current.scale.setScalar(getGame().progress.act3.errands.mossRewarded ? 3.8 : 1.8);
  });
  return <>
    <instancedMesh ref={streaks} args={[windGeo, windMat, 24]} frustumCulled={false} />
    <instancedMesh ref={grass} args={[grassGeo, flatMat, 64]} frustumCulled={false} />
    <mesh ref={falls} position={[-10, 9, 189.3]}><boxGeometry args={[5, 10, .12]} /><meshLambertMaterial color="#b5d9d9" transparent opacity={.5} depthWrite={false} /></mesh>
    <mesh position={[-13, 4.04, 185.5]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[3.5, 16]} /><meshLambertMaterial color="#a1c2bf" transparent opacity={.55} depthWrite={false} /></mesh>
    <sprite ref={fire} position={ground(HOLLOW.fire.x, HOLLOW.fire.z, .65)} material={glow} />
    <sprite ref={lantern} position={ground(-11, 200.5, 2)} material={lamp} />
    <pointLight position={ground(-14, 197, 2.4)} color="#ffc281" intensity={6} distance={16} decay={1.6} />
    <mesh position={ground(-11, 60.5, 1.7)}><cylinderGeometry args={[.16, .18, .35, 6]} /><meshBasicMaterial color="#e6ba72" /></mesh>
  </>;
}

function Vegetation() {
  const geometry = useMemo(() => mountainConifer().geometry, []);
  const tiles = useMemo(() => {
    const result = new Map<number, typeof cloudTreePlacements>();
    for (const p of cloudTreePlacements) {
      const key = Math.floor(p.z / 32);
      result.set(key, [...(result.get(key) ?? []), p]);
    }
    return [...result.values()];
  }, []);
  return <>{tiles.map((items, i) => <Trees key={i} items={items} geometry={geometry} />)}</>;
}
function Trees({ items, geometry }: { items: Array<{ x: number; z: number; s: number }>; geometry: THREE.BufferGeometry }) {
  const ref = useRef<THREE.InstancedMesh>(null), dummy = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => {
    const m = ref.current; if (!m) return;
    items.forEach((p, i) => { dummy.position.set(p.x, coniferY(p), p.z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(p.s); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); });
    m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere();
  }, [items, dummy]);
  useFrame(() => { if (ref.current) { const s = ref.current.boundingSphere; ref.current.visible = !s || near(s.center.x, s.center.z, s.radius); } });
  return <instancedMesh ref={ref} args={[geometry, flatMat, items.length]} />;
}

function CoastProps() {
  const a = useGame(s => s.progress.act3), rotor = useRef<THREE.Group>(null);
  const base = useMemo(() => {
    const b = new PartBuilder();
    b.box(.35,4.8,.35,-37,cloudY(-37,65),65,timber);
    b.box(7.5,.2,.25,-40,cloudY(-40,65)+3.7,65,timber);
    b.cyl(.5,.6,.22,40,cloudY(40,120),120,"#c6b577",8);
    return b.build();
  }, []);
  const blades = useMemo(() => { const b = new PartBuilder();
    for (let i=0;i<4;i++) b.boxAt(.45,1.65,.12,[Math.sin(i*Math.PI/2)*1.03,Math.cos(i*Math.PI/2)*1.03,0],[0,0,-i*Math.PI/2],"#c1b48c");
    return b.build(); }, []);
  const coveGate = useMemo(() => barrierGeometry(6.4), []);
  const seaBridge = useMemo(() => bridge({ length: Math.hypot(7,4), width: 3.2,
    deckAt: t => cloudY(-38-7*t,65+4*t)-cloudY(-38,65) }).geometry, []);
  useFrame((_, dt) => {
    if(rotor.current && getGame().progress.act3.puzzles.includes("coastWindmill")) rotor.current.rotation.z += dt*2.4;
  });
  return <>
    <mesh geometry={base} material={flatMat} />
    <group ref={rotor} position={ground(-37,65,4)}><mesh geometry={blades} material={flatMat} /></group>
    {a.puzzles.includes("coastWindmill") && <mesh geometry={seaBridge} material={flatMat} position={ground(-38,65)} rotation={[0,Math.atan2(-7,4),0]} />}
    {!a.puzzles.includes("coastCrate") && <mesh geometry={coveGate} material={flatMat} position={ground(41.5,123)} rotation={[0,Math.PI/2,0]} />}
    <mesh position={ground(a.puzzles.includes("coastCrate") ? 40 : 38.8,120,.4)}><boxGeometry args={[.8,.8,.8]} /><meshLambertMaterial color="#9e8558" /></mesh>
  </>;
}

function PickupsAndChests({ inside }: { inside: boolean }) {
  const a = useGame(s => s.progress.act3);
  const base = useMemo(chestBaseGeometry, []), lid = useMemo(chestLidGeometry, []);
  const glow = useMemo(() => additiveSprite("#d4efae", .55), []);
  const pickupGeo = useMemo(() => {
    const bag = new PartBuilder(), wood = new PartBuilder(), moss = new PartBuilder();
    bag.box(.5, .6, .25, 0, 0, 0, "#bb8b5e"); bag.torus(.17, .04, [0, .63, 0], [0, 0, 0], timber);
    for (let i = 0; i < 3; i++) wood.cylAt(.12, .8, [0, .15 + (i % 2) * .15, (i - 1) * .16], [0, 0, Math.PI / 2], "#a18d68", 6);
    for (let i = 0; i < 5; i++) moss.sphere(.17, Math.sin(i * 2) * .2, .1, Math.cos(i * 2) * .2, "#a4cb8c", [1, .6, 1], 6);
    return { bag: bag.build(), firewood: wood.build(), moss: moss.build() };
  }, []);
  return <>
    {CLOUD_PICKUPS.filter(p => inside === (p.x > 9 && p.z > 280) && !a.errands.pickups.includes(p.id)).map(p => <group key={p.id} position={ground(p.x, p.z, .07)}><mesh geometry={pickupGeo[p.kind]} material={flatMat} /><sprite material={glow} position={[0, .55, 0]} scale={[.65, .65, 1]} /></group>)}
    {CLOUD_CHESTS.filter(c => inside === (c.id === "cloudCrystalChest")).map(c => <group key={c.id} position={ground(c.x, c.z)} rotation={[0, c.yaw, 0]}><mesh geometry={base} material={flatMat} /><group position={CHEST_HINGE} rotation={[a.chests.includes(c.id) ? CHEST_OPEN_ANGLE : 0, 0, 0]}><mesh geometry={lid} material={flatMat} /></group></group>)}
  </>;
}

/** Shared by the departure quay and Cloud Isle; voyage animation uses the
 * same physical boat and sail, driven by the four English beats. */
function CloudSea({ crossing = false }: { crossing?: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(700, 700, 60, 60);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ color: "#526d78", flatShading: true }), []);
  const fair = useMemo(() => new THREE.Color("#1e74b4"), []), stormy = useMemo(() => new THREE.Color("#344e5c"), []);
  useFrame(() => {
    if (!ref.current) return;
    ref.current.visible = !crossing || rt.voyage.active && rt.world === "home";
    if (!ref.current.visible) return;
    const v = rt.voyage, storm = crossing ? voyageStorm() : getGame().progress.act3.beaconDefeated ? .05 : 1;
    const cx = crossing ? v.x : 0, cz = crossing ? v.z : 60;
    ref.current.position.set(cx, -.4, cz);
    mat.color.copy(fair).lerp(stormy, storm);
    const p = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + cx, z = p.getZ(i) + cz;
      p.setY(i, (.035 + storm * .24) * Math.sin(x * .29 + z * .16 + rt.time * 1.8)
        + storm * .1 * Math.sin(z * .57 - rt.time * 2.1));
    }
    p.needsUpdate = true;
  });
  return <mesh ref={ref} geometry={geometry} material={mat} position={[0, -.4, 60]} />;
}

function VoyageRocks() {
  const ref = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => {
    const b = new PartBuilder();
    // These fixed rocks are straight ahead at the Turn left prompt. The
    // following boat leg passes to their port side, leaving visible clearance.
    for (const [dx, dz, r, h] of [[0, 0, 2.6, 2.8], [-2.7, -2.5, 1.9, 2.1], [2.5, -4, 2.2, 3.4]]) {
      b.add(new THREE.DodecahedronGeometry(r, 0), "#59616a", [PIER2.x + dx, h * .3, PIER2.z0 - 44 + dz], [.3, dx, .2], [1, h / r, 1]);
      b.torus(r * .85, .07, [PIER2.x + dx, -.18, PIER2.z0 - 44 + dz], [Math.PI / 2, 0, 0], "#b0c9cc");
    }
    return b.build();
  }, []);
  useFrame(() => { if (ref.current) ref.current.visible = rt.voyage.active && rt.world === "home"; });
  return <mesh ref={ref} geometry={geometry} material={flatMat} />;
}

export function CloudBoat() {
  const root = useRef<THREE.Group>(null), sail = useRef<THREE.Mesh>(null), keeper = useRef<THREE.Mesh>(null);
  const hull = useMemo(() => {
    const b = new PartBuilder(); b.add(new THREE.CylinderGeometry(1.2, .7, .9, 7), timber, [0, .15, 0], [0, 0, 0], [1.3, 1, 3]);
    b.box(2.8, .15, 6.3, 0, .6, 0, "#ad9469"); b.cyl(.09, .12, 6, 0, .75, -.1, timber, 7);
    b.box(3.6, .1, .1, 0, 6.5, -.1, timber);
    for (const x of [-1.3, 1.3]) b.box(.1, .5, 5.2, x, .75, 0, timber);
    return b.build();
  }, []);
  const cloth = useMemo(() => { const b = new PartBuilder(); b.add(new THREE.PlaneGeometry(3.4, 4, 2, 2), "#eee1bc", [0, -2, 0]); return b.build(); }, []);
  const clothMat = useMemo(() => new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), []);
  const gull = useMemo(() => npcGeometry(NPCS.harbor), []);
  useFrame(() => {
    if (!root.current) return;
    const v = rt.voyage;
    if (keeper.current) keeper.current.visible = v.active;
    root.current.visible = getGame().progress.act2.harbor;
    if (v.active) {
      root.current.position.set(v.x, v.y, v.z); root.current.rotation.set(0, v.yaw, 0);
    } else {
      const p = rt.world === "cloud" ? CLOUD_DOCK.boat : { x: PIER2.x, z: PIER2.z0 - 3 };
      root.current.position.set(p.x, -.1 + Math.sin(rt.time * 1.5) * .035, p.z);
      root.current.rotation.set(0, rt.world === "cloud" ? 0 : Math.PI, Math.sin(rt.time) * .008);
    }
    if (sail.current) sail.current.scale.y = v.active ? Math.max(.03, v.sail) : 1;
  });
  return <><CloudSea crossing /><VoyageRocks /><group ref={root}><mesh geometry={hull} material={flatMat} /><mesh ref={sail} geometry={cloth} material={clothMat} position={[0, 6.4, -.1]} /><mesh ref={keeper} geometry={gull} material={flatMat} position={[.65, .75, 1.9]} rotation={[0, Math.PI, 0]} /></group></>;
}

export function CloudIsle() {
  const a = useGame(s => s.progress.act3);
  const inside = a.area === "thunderGrotto";
  const land = useMemo(terrainTiles, []), landscape = useMemo(landscapeGeometry, []);
  const room = useMemo(() => shelterGeometry("base"), []), shelf = useMemo(() => shelterGeometry("bag"), []), kitchen = useMemo(() => shelterGeometry("wood"), []), bedding = useMemo(() => shelterGeometry("moss"), []);
  const gull = useMemo(() => npcGeometry(NPCS.harbor), []);
  useEffect(() => { cloudView.visible = true; return () => { cloudView.visible = false; }; }, []);
  return <group>
    <CloudSky />
    <group visible={!inside}>
    <CloudSea />
    {land.map((g, i) => <SpatialMesh key={i} geometry={g} />)}
    <mesh geometry={landscape} material={occluderMat} />
    <HollowShell />
    <mesh geometry={room} material={flatMat} />
    {a.errands.bagRewarded && <mesh geometry={shelf} material={flatMat} />}
    {a.errands.firewoodRewarded && <mesh geometry={kitchen} material={flatMat} />}
    {a.errands.mossRewarded && <mesh geometry={bedding} material={flatMat} />}
    <Vegetation /><Barriers /><WindAndWater /><CoastProps />
    <FamilyMember who="tala" /><FamilyMember who="bo" /><FamilyMember who="kiko" /><DiscoveryTrail />
    <mesh geometry={gull} material={flatMat} position={ground(CLOUD_DOCK.gull.x, CLOUD_DOCK.gull.z)} rotation={[0, Math.PI, 0]} />
    <Observatory /><StormBeacon /><SummitWeather /><SkyFortress /><CagedLumo /><HollowAftermath />
    </group>
    <PickupsAndChests inside={inside} /><CloudRoutes inside={inside} />
  </group>;
}

// Exported for geometry-only inspection without mounting another world.
export const cloudGeometry = { terrainTiles, landscapeGeometry, shelterGeometry, familyGeometry };
export type CloudSceneGates = CloudGates;
