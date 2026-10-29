import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { passageShellGeometry, type PassageStyle, PASSAGE_INTERIOR } from "./models/passages";

const styles: PassageStyle[]=["hollow","mangrove","trunk","roots","stone","rock","harbor","shortcut"];
describe("physical stage passage shells",()=>{
  it("keep a genuinely open mouth but an opaque, closed interior at every style",()=>{
    for(const style of styles){
      const geometry=passageShellGeometry(style),material=new THREE.MeshBasicMaterial(),mesh=new THREE.Mesh(geometry,material);
      mesh.updateMatrixWorld();
      for(const x of [-1.4,0,1.4])for(const y of [.35,1.3,2.1]){
        const ray=new THREE.Raycaster(new THREE.Vector3(x,y,-3),new THREE.Vector3(0,0,1));
        const hit=ray.intersectObject(mesh)[0];
        expect(hit,`${style}: closed back at ${x},${y}`).toBeDefined();
        expect(hit.point.z,`${style}: usable open mouth`).toBeGreaterThan(1.5);
        expect(hit.point.z,`${style}: depth remains inside physical chamber`).toBeLessThan(PASSAGE_INTERIOR.depth+.3);
      }
      expect(geometry.getAttribute("position").count/3,`${style}: Chromebook triangle budget`).toBeLessThan(2200);
      geometry.dispose();material.dispose();
    }
  });
  it("encloses the player with side walls, roof and floor before the fade trigger",()=>{
    const geometry=passageShellGeometry("hollow"),material=new THREE.MeshBasicMaterial(),mesh=new THREE.Mesh(geometry,material);
    mesh.updateMatrixWorld();
    for(const dir of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0]]as const){
      const ray=new THREE.Raycaster(new THREE.Vector3(0,1.5,1.2),new THREE.Vector3(...dir));
      expect(ray.intersectObject(mesh).length,`closed shell toward ${dir}`).toBeGreaterThan(0);
    }
    geometry.dispose();material.dispose();
  });
});
