import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { cloudGeometry } from "./CloudIsle";
import { cloudY } from "../game/world/cloudisle";
import { arenaGeometry } from "./StormBeacon";
import { canopyTreeKits, cloudRouteGeometry } from "./CloudRoutes";

describe("Cloud Isle's single real landscape", () => {
  it("puts each current canopy platform socket on its carrying branch beneath a walkway", () => {
    const geometry = cloudRouteGeometry.canopyGeometry();
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.updateMatrixWorld(true);
    for (const { position, kit } of canopyTreeKits()) {
      const socket = new THREE.Vector3(...kit.anchors["walkwayBranch.platform"].point).add(new THREE.Vector3(...position));
      const floor = cloudY(socket.x, socket.z);
      expect(socket.y).toBeLessThanOrEqual(floor);
      expect(floor - socket.y).toBeLessThan(.3);
      const hit = new THREE.Raycaster(new THREE.Vector3(socket.x, floor + .1, socket.z), new THREE.Vector3(0, -1, 0), 0, .5).intersectObject(mesh)[0];
      expect(hit, "branch endpoint is under a real rendered walkway").toBeDefined();
      expect(Math.abs(hit.point.y - floor)).toBeLessThan(.2);
      // Each root flare meets real rock, whose skirt continues below the sea.
      const ground = kit.parts.find(p => p.id === "ground")!.bounds;
      expect(ground.min.y + position[1]).toBeLessThan(-.4);
      expect(kit.parts.find(p => p.id === "trunk")!.bounds.min.y).toBeLessThan(ground.max.y);
      kit.geometry.dispose();
    }
    geometry.dispose(); material.dispose();
  });
  it("fits the player and real beacon in the Cloud follow lens at both target sizes", () => {
    for (const [w,h] of [[1366,768],[1280,800]]) for (const z of [1,20,36,42]) {
      const y = cloudY(0,z), camera = new THREE.PerspectiveCamera(80,w/h,.1,900);
      camera.position.set(0,y+1.1+10*Math.sin(.55),z-(10*Math.cos(.55)-3));
      camera.lookAt(0,y+1.1,z+3); camera.setViewOffset(w,h,0,-h*.2,w,h); camera.updateMatrixWorld();
      const spire = new THREE.Vector3(0,51.5,349).project(camera);
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
    beacon.position.set(0,37,349);
    const world = new THREE.Group(); world.add(mesh,beacon); world.updateMatrixWorld(true);
    for (const z of [1, 20, 36]) {
      const origin = new THREE.Vector3(0, cloudY(0, z) + 1.1 + 10 * Math.sin(.55), z - (10 * Math.cos(.55) - 3));
      const target = new THREE.Vector3(0, 51.5, 349), direction = target.clone().sub(origin).normalize();
      const hit = new THREE.Raycaster(origin, direction, 0, 450).intersectObject(world,true)[0];
      expect(hit, `summit ray from z=${z}`).toBeDefined();
      expect(hit.point.z, `no nearer landscape hides summit from z=${z}`).toBeGreaterThan(343);
      expect(hit.point.y).toBeGreaterThan(45);
    }
    geometry.dispose(); summit.dispose(); material.dispose();
  });
  it("keeps terrain and landscape static geometry well below the full gameplay triangle budget", () => {
    const count = (g: THREE.BufferGeometry) => (g.index?.count ?? g.getAttribute("position").count) / 3;
    // The whole island heightfield, even if every band is in view: a few draws and
    // ~40% of the 140k view budget, leaving the rest for scenery (views measure ~90k).
    const terrain = cloudGeometry.terrainTiles();
    expect(terrain.length).toBeLessThanOrEqual(8);
    expect(terrain.reduce((n, g) => n + count(g), 0)).toBeLessThan(56000);
    const rest = [cloudGeometry.landscapeGeometry(), cloudGeometry.shelterGeometry("base")];
    expect(rest.reduce((n, g) => n + count(g), 0)).toBeLessThan(40000);
    [...terrain, ...rest].forEach(g => g.dispose());
  });
});
