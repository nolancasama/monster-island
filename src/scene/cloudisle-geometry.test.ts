import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { cloudGeometry } from "./CloudIsle";
import { cloudY } from "../game/world/cloudisle";
import { arenaGeometry } from "./StormBeacon";

describe("Cloud Isle's single real landscape", () => {
  it("fits the player and real beacon in the Cloud follow lens at both target sizes", () => {
    for (const [w,h] of [[1366,768],[1280,800]]) for (const z of [1,20,36,42]) {
      const y = cloudY(0,z), camera = new THREE.PerspectiveCamera(80,w/h,.1,900);
      camera.position.set(0,y+1.1+10*Math.sin(.55),z-(10*Math.cos(.55)-3));
      camera.lookAt(0,y+1.1,z+3); camera.setViewOffset(w,h,0,-h*.2,w,h); camera.updateMatrixWorld();
      const spire = new THREE.Vector3(0,51.5,169).project(camera);
      const player = new THREE.Vector3(0,y+.9,z).project(camera);
      expect(Math.abs(spire.x)).toBeLessThan(1); expect(spire.y).toBeGreaterThan(0); expect(spire.y).toBeLessThan(1);
      expect(Math.abs(player.x)).toBeLessThan(1); expect(Math.abs(player.y)).toBeLessThan(1);
    }
  });
  it("keeps the summit spire visible past the coast, forest and observatory from dock and coast", () => {
    const geometry = cloudGeometry.landscapeGeometry();
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    const summit = arenaGeometry(), beacon = new THREE.Mesh(summit,material);
    beacon.position.set(0,37,169);
    const world = new THREE.Group(); world.add(mesh,beacon); world.updateMatrixWorld(true);
    for (const z of [1, 20, 36]) {
      const origin = new THREE.Vector3(0, cloudY(0, z) + 1.1 + 10 * Math.sin(.55), z - (10 * Math.cos(.55) - 3));
      const target = new THREE.Vector3(0, 51.5, 169), direction = target.clone().sub(origin).normalize();
      const hit = new THREE.Raycaster(origin, direction, 0, 240).intersectObject(world,true)[0];
      expect(hit, `summit ray from z=${z}`).toBeDefined();
      expect(hit.point.z, `no nearer landscape hides summit from z=${z}`).toBeGreaterThan(163);
      expect(hit.point.y).toBeGreaterThan(45);
    }
    geometry.dispose(); summit.dispose(); material.dispose();
  });
  it("keeps terrain and landscape static geometry well below the full gameplay triangle budget", () => {
    const geometries = [...cloudGeometry.terrainTiles(), cloudGeometry.landscapeGeometry(), cloudGeometry.shelterGeometry("base")];
    const triangles = geometries.reduce((n, g) => n + (g.index?.count ?? g.getAttribute("position").count) / 3, 0);
    expect(triangles).toBeLessThan(40000);
    geometries.forEach(g => g.dispose());
  });
});
