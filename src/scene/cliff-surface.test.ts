import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { seaStacksGeometry } from "./models/highlands";
import { cliffFaceGeometry, cliffRopeGeometry } from "./models/lowland";
import { CLIFF_ROPE } from "../game/world/lowland";
import { groundY } from "../game/world/island";

describe("closed sanctuary descent surface", () => {
  it("has a solid, front-facing rock surface behind the entire climb, including strata seams", () => {
    const geometry = cliffFaceGeometry(),
      material = new THREE.MeshBasicMaterial(),
      mesh = new THREE.Mesh(geometry, material);
    mesh.updateMatrixWorld();
    const ray = new THREE.Raycaster();
    const r = CLIFF_ROPE,
      top = groundY(r.x, r.top.z),
      foot = groundY(r.foot.x, r.foot.z);
    for (let y = foot - 0.3; y < top - 0.2; y += 0.17)
      for (const x of [r.x - 1, r.x, r.x + 1]) {
        ray.set(new THREE.Vector3(x, y, r.bodyZ - 5), new THREE.Vector3(0, 0, 1));
        const hit = ray.intersectObject(mesh)[0];
        expect(hit, `${x},${y}`).toBeDefined();
        expect(hit.point.z).toBeGreaterThan(r.hangZ);
        expect(hit.point.z).toBeLessThan(r.faceZ + 0.1);
      }
    for (const direction of [-1, 1]) {
      ray.set(new THREE.Vector3(r.x, direction > 0 ? foot - 4 : top + 4, r.faceZ + 1), new THREE.Vector3(0, direction, 0));
      expect(ray.intersectObject(mesh).length, "top and underside caps").toBeGreaterThan(0);
    }
    geometry.dispose();
    material.dispose();
  });
  it("keeps the full hanging rope in front of the rock and close enough for the climber to reach", () => {
    const g = cliffRopeGeometry(),
      p = g.getAttribute("position"),
      r = CLIFF_ROPE;
    const top = groundY(r.x, r.top.z),
      foot = groundY(r.foot.x, r.foot.z);
    for (let i = 0; i < p.count; i++)
      if (p.getY(i) < top - 1 && p.getY(i) > foot + 1) {
        expect(p.getZ(i)).toBeLessThan(r.faceZ - 0.1);
        expect(p.getZ(i) - r.bodyZ).toBeGreaterThan(0.15);
        expect(p.getZ(i) - r.bodyZ).toBeLessThan(0.5);
      }
    g.dispose();
  });
});

it("legacy sea stacks cannot protrude into Act 2 clearings",()=>{
  const g=seaStacksGeometry(),mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial());mesh.updateMatrixWorld();
  for(const [x,z]of [[68,-168],[72,-168],[104,-160],[44,-158]]){
    const ray=new THREE.Raycaster(new THREE.Vector3(x,30,z),new THREE.Vector3(0,-1,0),0,35);
    expect(ray.intersectObject(mesh),`${x},${z}`).toHaveLength(0);
  }
  expect(g.getAttribute("position").count).toBeGreaterThan(0);
  g.dispose();(mesh.material as THREE.Material).dispose();
});
