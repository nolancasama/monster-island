import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { groundY } from "../game/world/island";
import { blocked } from "../game/world/collision";
import { CANOPY_GAPS, CHESTS, LILY_PADS, POND_Y, SERVICES, STAGES, STAGE_EXITS, gapDeck, lowlandBridgeY, lowlandRegionVisible, lowlandWalkable } from "../game/world/lowland";
import { mesaCameraLift } from "../game/world/mesa";
import { NPCS, NPC_OF } from "../game/data/town";
import { cameraProfileAt, DEFAULT_CAMERA } from "./cameraProfiles";
import { conformBridge } from "./models/bridge";
import { CHEST_HINGE, chestBaseGeometry, chestLidGeometry } from "./models/chest";
import {
  cliffFaceGeometry, cliffRopeGeometry, giantFernGeometry, lilyPadGeometry,
  lowlandPropsGeometry, lowlandSceneryY, lowlandSpots, lowlandTerrainTiles, lowlandWaterGeometry,
  mesaGeometry, npcGeometry, primevalTreeGeometry, reedGeometry, ropeBridgeGeometry,
  spatialGeometry, stageBarrierGeometry, townGeometry, treeFernGeometry, vineBridgeGeometry,
  type Spot,
} from "./models/lowland";

const TILE = 96, FOG_FAR = 260;
type Draw = { name: string; bounds: THREE.Sphere; triangles: number; far: number; spots?: Spot[] };
const draws: Draw[] = [];
const geometries = new Set<THREE.BufferGeometry>();
const triangles = (g: THREE.BufferGeometry) => (g.index?.count ?? g.getAttribute("position").count) / 3;
const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();

function add(name: string, geometry: THREE.BufferGeometry, x = 0, y = 0, z = 0, yaw = 0, far = FOG_FAR) {
  geometries.add(geometry);
  geometry.computeBoundingSphere();
  rotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
  matrix.compose(position.set(x, y, z), rotation, scale.setScalar(1));
  draws.push({ name, bounds: geometry.boundingSphere!.clone().applyMatrix4(matrix), triangles: triangles(geometry), far });
}

function instances(name: string, geometry: THREE.BufferGeometry, spots: Spot[], far = FOG_FAR) {
  geometries.add(geometry);
  const tiles = new Map<string, Spot[]>();
  for (const spot of spots) {
    const key = `${Math.floor(spot.x / TILE)},${Math.floor(spot.z / TILE)}`;
    if (!tiles.has(key)) tiles.set(key, []);
    tiles.get(key)!.push(spot);
  }
  geometry.computeBoundingSphere();
  for (const tile of tiles.values()) {
    // This is InstancedMesh.computeBoundingSphere's sphere union, with the
    // same matrices and full-sized bounds retained during clutter growth.
    const bounds = new THREE.Sphere().makeEmpty();
    for (const spot of tile) {
      rotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, spot.r);
      matrix.compose(position.set(spot.x, lowlandSceneryY(spot.x, spot.z) - .05, spot.z), rotation, scale.set(spot.s, spot.sy ?? spot.s, spot.s));
      bounds.union(geometry.boundingSphere!.clone().applyMatrix4(matrix));
    }
    draws.push({ name, bounds, triangles: triangles(geometry) * tile.length, far, spots: tile });
  }
}

beforeAll(() => {
  for (const geometry of lowlandTerrainTiles(TILE)) add("terrain", geometry);
  for (const geometry of spatialGeometry(lowlandPropsGeometry(), TILE)) add("props", geometry);
  for (const geometry of spatialGeometry(lowlandWaterGeometry(), TILE)) add("water", geometry);
  add("cliff", cliffFaceGeometry(), 0, 0, 0, 0, Infinity);
  add("rope", cliffRopeGeometry(), 0, 0, 0, 0, Infinity);
  add("mesa", mesaGeometry());
  add("town", townGeometry());
  const spots = lowlandSpots();
  instances("trees", primevalTreeGeometry(), spots.trees);
  instances("tree ferns", treeFernGeometry(), spots.fernTrees);
  instances("ferns", giantFernGeometry(), spots.ferns, 60);
  instances("reeds", reedGeometry(), spots.reeds, 50);
  for (const gate of STAGE_EXITS)
    add("barrier", stageBarrierGeometry(gate), gate.x, lowlandSceneryY(gate.x, gate.z), gate.z, gate.orientation === "z" ? Math.PI / 2 : 0);
  const lilies = lilyPadGeometry();
  geometries.add(lilies);
  lilies.computeBoundingSphere();
  const lilyBounds = new THREE.Sphere().makeEmpty();
  for (const pad of LILY_PADS) lilyBounds.union(lilies.boundingSphere!.clone().translate(new THREE.Vector3(pad.x, POND_Y + .06, pad.z)));
  draws.push({ name: "lilies", bounds: lilyBounds, triangles: triangles(lilies) * LILY_PADS.length, far: FOG_FAR });
  for (const id of ["canopyVines", "canopyRope"] as const) {
    const gap = CANOPY_GAPS[id], deck = gapDeck(id), len = deck.z1 - deck.z0;
    const y = lowlandBridgeY(id, gap.x, deck.z1);
    const geometry = conformBridge(id === "canopyVines" ? vineBridgeGeometry(len) : ropeBridgeGeometry(len), gap.x, (deck.z0 + deck.z1) / 2, y, (x, z) => lowlandBridgeY(id, x, z));
    add("bridge", geometry, gap.x, y, (deck.z0 + deck.z1) / 2);
  }
  for (const chest of CHESTS) {
    const y = lowlandSceneryY(chest.x, chest.z);
    add("chest", chestBaseGeometry(), chest.x, y, chest.z, chest.yaw);
    const lid = chestLidGeometry().translate(...CHEST_HINGE);
    add("chest lid", lid, chest.x, y, chest.z, chest.yaw);
  }
  for (const service of Object.values(SERVICES)) {
    const k = service.keeper;
    add("keeper", npcGeometry(NPCS[NPC_OF[service.id]]), k.x, groundY(k.x, k.z), k.z, k.yaw);
  }
}, 30000);

afterAll(() => { for (const geometry of geometries) geometry.dispose(); });

function cameraAt(x: number, z: number, width: number, height: number) {
  const point = { x, y: lowlandSceneryY(x, z), z, cloud: false, climbing: false };
  const profile = cameraProfileAt(point), frame = profile.resolve?.(point, DEFAULT_CAMERA) ?? profile;
  const focus = typeof profile.anchor === "function" ? profile.anchor(point, frame) : profile.anchor ?? point;
  const y = lowlandSceneryY(focus.x, focus.z) + 1.1, horizontal = frame.dist * Math.cos(frame.pitch);
  const target = new THREE.Vector3(focus.x - Math.sin(frame.yaw) * frame.ahead, y, focus.z - Math.cos(frame.yaw) * frame.ahead);
  const camera = new THREE.PerspectiveCamera(profile.fov ?? 55, width / height, .1, 400);
  camera.position.set(focus.x + Math.sin(frame.yaw) * (horizontal - frame.ahead), y + frame.dist * Math.sin(frame.pitch), focus.z + Math.cos(frame.yaw) * (horizontal - frame.ahead));
  camera.position.y += mesaCameraLift(target, camera.position);
  camera.lookAt(target); camera.updateMatrixWorld();
  return camera;
}

describe("lowland submitted triangle budget", () => {
  const views: Array<[string, number, number]> = [
    ["sanctuary basin", 87, -129], ["forest base", 75.5, -176],
    ["left neck", 47, -175], ["left arm", 42, -190], ["left approach", 42, -203],
    ["right neck", 104, -174], ["right arm", 113, -189], ["right approach", 104, -200],
    ["grove", 49, -215], ["grove north", 49, -234], ["grove east", 66, -217],
    ["canopy", 106, -211], ["canopy north", 109, -233], ["canopy west", 88, -213],
    ["canopy broken bridge", 106, -222.4], ["canopy upper root", 118, -233],
    ["causeway", 76, -251], ["coast", 70, -274], ["port", 76, -304],
  ];
  for (const [width, height] of [[1366, 768], [1280, 800]])
  for (const [name, x, z] of views) it(`${name} at ${width}×${height} leaves room for actors and effects`, () => {
    expect(lowlandRegionVisible(x, z)).toBe(true);
    const camera = cameraAt(x, z, width, height);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const visible = draws.filter(draw => {
      if (camera.position.distanceTo(draw.bounds.center) >= draw.far + draw.bounds.radius || !frustum.intersectsSphere(draw.bounds)) return false;
      // A tile submits every instance, including ones currently scaled to
      // zero, whenever any member has grown above the renderer's threshold.
      return !draw.spots || draw.far >= FOG_FAR || draw.spots.some(spot => {
        const d = Math.hypot(camera.position.x - spot.x, camera.position.y - lowlandSceneryY(spot.x, spot.z) + .05, camera.position.z - spot.z);
        const t = Math.max(0, Math.min(1, (draw.far - d) / 8));
        return spot.s * t * t * (3 - 2 * t) > .01;
      });
    });
    // Atlas signboards (10 triangles), chest sprites and secret effects fit
    // inside the remaining scene reserve alongside actors and the sanctuary.
    const count = visible.reduce((sum, draw) => sum + draw.triangles, 10);
    const expandedStage = name.startsWith("grove") || name.startsWith("canopy");
    expect(count, `${name}: ${count} submitted lowland triangles`).toBeLessThan(expandedStage ? 150000 : 120000);
    if (expandedStage) {
      expect(lowlandWalkable(x, z, { cleared: STAGES, solved: ["groveLilies", "canopyVines", "canopyRope"] }, .35), `${name}: gameplay floor`).toBe(true);
      expect(blocked(x, z, .35, { act2: true, cleared: STAGES, solved: ["groveLilies", "canopyVines", "canopyRope"] }), `${name}: clear camera subject`).toBe(false);
      // Lowland actors, effects, signs and the remaining island keep a conservative
      // reserve of 32 draws / 20k triangles in addition to all submitted scenery.
      expect(visible.length + 32, `${name}: scenery calls plus actor/effect reserve`).toBeLessThanOrEqual(110);
      expect(count + 20000, `${name}: scenery triangles plus actor/effect reserve`).toBeLessThanOrEqual(170000);
    }
    if (name === "sanctuary basin" || name === "forest base")
      expect(visible.some(draw => draw.name === "mesa"), `${name}: mesa in frustum`).toBe(true);
  });
});
