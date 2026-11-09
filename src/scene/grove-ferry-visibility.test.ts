import { afterAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { groundY } from "../game/world/island";
import { GROVE_STREAM_FERRY } from "../game/world/groveStream";
import { streamY } from "../game/world/lowland";
import { GROVE_FERRY_SHOT } from "./cameraProfiles";
import {
  giantFernGeometry, lowlandPropsGeometry, lowlandSceneryY, lowlandSpots,
  lowlandTerrainTiles, mesaGeometry, primevalTreeGeometry, reedGeometry, treeFernGeometry,
} from "./models/lowland";

// The same opaque faces and instance transforms as Lowland.tsx. This shot
// clears the scenery geometrically; it does not depend on foliage dissolving.
const material = new THREE.MeshBasicMaterial();
const scenery: Array<{ name: string; mesh: THREE.Mesh }> = [];
const geometries = new Set<THREE.BufferGeometry>();
function add(name: string, geometry: THREE.BufferGeometry) {
  geometries.add(geometry);
  const mesh = new THREE.Mesh(geometry, material);
  scenery.push({ name, mesh });
  return mesh;
}
for (const geometry of lowlandTerrainTiles()) add("terrain", geometry);
add("mesa", mesaGeometry());
add("props", lowlandPropsGeometry());
const spots = lowlandSpots();
for (const [name, geometry, instances] of [
  ["tree", primevalTreeGeometry(), spots.trees],
  ["fern", giantFernGeometry(), spots.ferns],
  ["tree fern", treeFernGeometry(), spots.fernTrees],
  ["reed", reedGeometry(), spots.reeds],
] as const) {
  geometries.add(geometry);
  for (const spot of instances) {
    if (Math.hypot(spot.x - GROVE_FERRY_SHOT.target.x, spot.z - GROVE_FERRY_SHOT.target.z) > 22) continue;
    const mesh = add(name, geometry);
    mesh.position.set(spot.x, lowlandSceneryY(spot.x, spot.z) - .05, spot.z);
    mesh.rotation.y = spot.r;
    mesh.scale.set(spot.s, spot.sy ?? spot.s, spot.s);
  }
}
scenery.forEach(({ mesh }) => mesh.updateMatrixWorld());
afterAll(() => { geometries.forEach(geometry => geometry.dispose()); material.dispose(); });

describe("entrance ferry cinematic sight lines", () => {
  it("keeps terrain, props and foliage clear of Bubbo's body and the rider on both banks and throughout the swim", () => {
    const { north, south } = GROVE_STREAM_FERRY;
    const { pos } = GROVE_FERRY_SHOT;
    const lens = new THREE.Vector3(pos.x, pos.y, pos.z);
    const failures: string[] = [];
    const route = Array.from({ length: 13 }, (_, i) => {
      const t = i / 12;
      return { x: north.x + (south.x - north.x) * t, z: north.z + (south.z - north.z) * t };
    });
    route.push({ ...north, x: north.x + 1.05 }, { ...south, x: south.x + 1.05 });
    for (const { x, z } of route) {
      const base = Math.max(groundY(x, z), streamY(x, z));
      for (const dx of [-.7, 0, .7]) for (const dz of [-.8, 0, .8]) for (const height of [.3, 1, 1.8, 2.7]) {
        const subject = new THREE.Vector3(x + dx, base + height, z + dz);
        const ray = new THREE.Raycaster(lens, subject.clone().sub(lens).normalize(), .001, lens.distanceTo(subject) - .02);
        for (const { name, mesh } of scenery) {
          const hit = ray.intersectObject(mesh)[0];
          if (hit) failures.push(`x=${x}, z=${z}, dx=${dx}, dz=${dz}, h=${height}: ${name} at ${hit.point.toArray().map(v => v.toFixed(2))}`);
        }
      }
    }
    expect(scenery.some(item => item.name === "tree")).toBe(true);
    expect(failures).toEqual([]);
  });
});
