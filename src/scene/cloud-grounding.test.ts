import { expect, it } from "vitest";
import * as THREE from "three";
import { cloudGeometry } from "./CloudIsle";
import { canopyFoundationGeometry } from "./CloudRoutes";
import { canopyTreeKits, coniferKits, landscapeKits, shelterKits } from "./cloudScenery";
import { bridge } from "./models/cloudKit";
import { cloudY, cloudZoneAt } from "../game/world/cloudisle";

it("draws terrain or rock under every grounded kit footprint, including the canopy roots", () => {
  // Only supporting surfaces are in the ray scene. The kit under test cannot
  // pass by hitting its own root, post, plinth or small integral contact rock.
  const surfaces = [...cloudGeometry.terrainTiles(), canopyFoundationGeometry()];
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const terrain = new THREE.Group();
  surfaces.forEach(g => terrain.add(new THREE.Mesh(g, material)));
  terrain.updateMatrixWorld(true);
  const crane = bridge({ length: Math.hypot(7, 4), width: 3.2,
    deckAt: t => cloudY(-38-7*t,65+4*t)-cloudY(-38,65) });
  const placements = [...landscapeKits(), ...coniferKits(), ...canopyTreeKits(), ...shelterKits("base"), ...shelterKits("bag"),
    { id: "sea-bridge", kit: crane, position: [-38,cloudY(-38,65),65] as [number,number,number], yaw: Math.atan2(-7,4) }];
  for (const p of placements) for (const part of p.kit.parts.filter(part => part.ground)) {
    const b = part.bounds, matrix = new THREE.Matrix4().makeRotationY(p.yaw).setPosition(...p.position);
    // Centre and four near-corners cover the complete support footprint.
    for (const [u,v] of [[.5,.5],[.15,.15],[.85,.15],[.15,.85],[.85,.85]]) {
      const point = new THREE.Vector3(THREE.MathUtils.lerp(b.min.x,b.max.x,u), b.min.y, THREE.MathUtils.lerp(b.min.z,b.max.z,v)).applyMatrix4(matrix);
      // The heightfield has no overhangs, so outside the canopy (whose walkway
      // foundations stand above the roots) the ray can start well above the hill.
      const startY = p.id.startsWith("canopy") ? p.position[1]+1 : Math.max(p.position[1],cloudY(point.x,point.z),point.y)+25;
      const ray = new THREE.Raycaster(new THREE.Vector3(point.x, startY, point.z), new THREE.Vector3(0,-1,0), 0, 60);
      const hit = ray.intersectObject(terrain,true)[0];
      const label = `${p.id}/${part.id} at ${point.x.toFixed(2)},${point.z.toFixed(2)}`;
      expect(hit, label + " has drawn support").toBeDefined();
      expect(hit.point.y, label + " feet meet that support").toBeGreaterThanOrEqual(point.y - .05);
      if (p.id.startsWith("canopy")) continue;
      // On walkable ground the drawn terrain is the collision floor; off it the
      // island heightfield may rise around a footing, which then sits embedded
      // but never swallowed: the ground stays below the footing's top, allowing
      // 15 cm of grass over the edge of a thin slab laid on gently uneven ground.
      // 15 cm: the 2 m terrain grid chords the walking floor's tightest hill crowns.
      if (cloudZoneAt(point.x, point.z)) expect(Math.abs(hit.point.y-cloudY(point.x,point.z)), label + " terrain follows collision height").toBeLessThan(.15);
      else expect(hit.point.y, label + " is not swallowed").toBeLessThan(point.y + (b.max.y - b.min.y) + .15);
    }
  }
  placements.forEach(p => p.kit.geometry.dispose());
  surfaces.forEach(g => g.dispose()); material.dispose();
}, 30000);
