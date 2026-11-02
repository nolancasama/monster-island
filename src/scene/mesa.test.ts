import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { groundY } from "../game/world/island";
import { inMesa, MESA_OUTLINE } from "../game/world/lowland";
import { MESA_PLATEAU_Y, MESA_SKIRT_Y, MESA_STRATA, mesaCameraLift, mesaFloorY } from "../game/world/mesa";
import { mesaGeometry } from "./models/lowland";

describe("central mesa", () => {
  it("merges rock, trees and ruins into one deterministic draw under six thousand triangles", () => {
    const a = mesaGeometry(), b = mesaGeometry();
    expect(a.groups).toHaveLength(0);
    expect(a.getAttribute("position").count / 3).toBeLessThan(6000);
    expect(a.getAttribute("position").count / 3).toBeGreaterThan(1000);
    for (const name of ["position", "color", "normal"]) {
      expect(a.getAttribute(name).array).toEqual(b.getAttribute(name).array);
      expect(a.getAttribute(name).count).toBe(a.getAttribute("position").count);
    }
    const p = a.getAttribute("position");
    for (let i = 0; i < p.count; i++) expect(inMesa(p.getX(i), p.getZ(i), .001)).toBe(true);
    a.dispose(); b.dispose();
  });

  it("follows the exact footprint with a buried, closed skirt below terrain along every edge", () => {
    const geometry = mesaGeometry(), material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geometry, material); mesh.updateMatrixWorld();
    for (let i = 0; i < MESA_OUTLINE.length; i++) {
      const [ax, az] = MESA_OUTLINE[i], [bx, bz] = MESA_OUTLINE[(i + 1) % MESA_OUTLINE.length];
      const len = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / len, nz = (bx - ax) / len;
      for (let s = .05; s < len; s += .25) {
        const x = ax + (bx - ax) * s / len, z = az + (bz - az) * s / len;
        const terrain = groundY(x, z);
        expect(MESA_SKIRT_Y, `${x},${z}`).toBeLessThan(terrain - .6);
        // Check actual front faces both below the terrain and at eye height.
        for (const y of [terrain - .3, terrain + .15, 4.6]) {
          const ray = new THREE.Raycaster(new THREE.Vector3(x + nx * .5, y, z + nz * .5), new THREE.Vector3(-nx, 0, -nz), 0, 1);
          const hit = ray.intersectObject(mesh)[0];
          expect(hit, `${x},${y},${z}`).toBeDefined();
          expect(hit.distance).toBeCloseTo(.5, 3);
        }
      }
    }
    geometry.dispose(); material.dispose();
  });

  it("has continuous vertical strata and an upper plateau eighteen to twenty-two metres above the forest", () => {
    const geometry = mesaGeometry(), material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geometry, material); mesh.updateMatrixWorld();
    // Rays from the base and both arms must meet one unbroken silhouette at
    // every height, including the ledge seams and moss bands.
    for (const [x, z, dx, dz] of [[77, -180, 0, -1], [38, -208, 1, 0], [118, -208, -1, 0]]) {
      for (let y = 2; y < 22.05; y += .11) {
        const ray = new THREE.Raycaster(new THREE.Vector3(x, y, z), new THREE.Vector3(dx, 0, dz), 0, 80);
        expect(ray.intersectObject(mesh).length, `${x},${y},${z}`).toBeGreaterThan(0);
      }
    }
    for (const [x, z] of [[70, -207], [82, -204], [77, -217], [77, -222]]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(x, 40, z), new THREE.Vector3(0, -1, 0));
      const y = ray.intersectObject(mesh)[0].point.y;
      expect(y, `plateau at ${x},${z}`).toBeGreaterThanOrEqual(MESA_PLATEAU_Y - .29);
      expect(y, `plateau at ${x},${z}`).toBeLessThanOrEqual(MESA_PLATEAU_Y + .29);
      for (const forestX of [42, 113]) {
        expect(y - groundY(forestX, -190)).toBeGreaterThanOrEqual(18);
        expect(y - groundY(forestX, -190)).toBeLessThanOrEqual(22);
      }
    }
    expect(MESA_STRATA.length).toBeGreaterThanOrEqual(4);
    geometry.dispose(); material.dispose();
  });

  it("lifts crossing and grazing camera lines clear of every strata surface", () => {
    const targets = [
      new THREE.Vector3(60, 4, -207), new THREE.Vector3(94, 4, -211),
      new THREE.Vector3(77, 4, -180), new THREE.Vector3(77, 4, -239),
    ];
    for (const target of targets) for (const [x, z] of [[77, -209], [95, -215], [60, -215], [77, -182], [77, -239]]) {
      const camera = new THREE.Vector3(x, 9, z);
      camera.y += mesaCameraLift(target, camera);
      for (let t = .001; t <= 1; t += .001) {
        const p = new THREE.Vector3().lerpVectors(target, camera, t);
        expect(p.y, `${target.toArray()} to ${camera.toArray()} at ${t}`).toBeGreaterThanOrEqual(mesaFloorY(p.x, p.z) + .699);
      }
    }
    expect(mesaFloorY(42, -197)).toBe(-Infinity);
    expect(mesaCameraLift({ x: 42, y: 4, z: -197 }, { x: 42, y: 9, z: -188 })).toBe(0);
  });
});
