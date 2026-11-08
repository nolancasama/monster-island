import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { groundY } from "../game/world/island";
import { CAVE_MOUTHS, inMesa, MESA_BOUNDS, MESA_OUTLINE } from "../game/world/lowland";
import { MESA_CENTER, MESA_PLATEAU_Y, MESA_SKIRT_Y, MESA_STRATA, mesaCameraLift, mesaFloorY } from "../game/world/mesa";
import { mesaGeometry } from "./models/lowland";

describe("central mesa", () => {
  it("derives its bounds from a keyhole outline star-shaped about the plateau centre", () => {
    expect(MESA_BOUNDS).toEqual({
      x0: Math.min(...MESA_OUTLINE.map(p => p[0])), x1: Math.max(...MESA_OUTLINE.map(p => p[0])),
      z0: Math.min(...MESA_OUTLINE.map(p => p[1])), z1: Math.max(...MESA_OUTLINE.map(p => p[1])),
    });
    expect(MESA_BOUNDS.z0).toBe(-231);
    const spanAt = (z: number) => {
      const xs: number[] = [];
      MESA_OUTLINE.forEach(([ax, az], i) => {
        const [bx, bz] = MESA_OUTLINE[(i + 1) % MESA_OUTLINE.length];
        if ((az > z) !== (bz > z)) xs.push(ax + (bx - ax) * (z - az) / (bz - az));
      });
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(spanAt(-218)).toBeGreaterThanOrEqual(9);
    expect(spanAt(-218)).toBeLessThanOrEqual(11);
    expect(spanAt(-197)).toBeGreaterThan(spanAt(-218) * 1.8);
    for (let i = 0; i < MESA_OUTLINE.length; i++) {
      const [ax, az] = MESA_OUTLINE[i], [bx, bz] = MESA_OUTLINE[(i + 1) % MESA_OUTLINE.length];
      for (let s = 0; s <= 20; s++) for (let t = 0; t <= 20; t++) {
        const x = ax + (bx - ax) * s / 20, z = az + (bz - az) * s / 20;
        const px = MESA_CENTER[0] + (x - MESA_CENTER[0]) * t / 20;
        const pz = MESA_CENTER[1] + (z - MESA_CENTER[1]) * t / 20;
        expect(inMesa(px, pz, .0001), `fan at ${px},${pz}`).toBe(true);
      }
    }
  });

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
        // Banks can bury the first ledge; a higher stratum there rightly retreats from the foot.
        for (const y of [terrain - .3, terrain + .15, 4.6].filter(y => y < 4.8)) {
          // The two intentional west-face apertures are checked through to
          // their recessed throats by cave-mouths.test.ts. Probe below them
          // here so the original buried skirt still has to be watertight.
          const mouth = CAVE_MOUTHS.find(m => x < 74 && z >= m.z0 - .1 && z <= m.z1 + .1);
          const probeY = mouth ? Math.min(y, groundY(70.4, mouth.z) - .6) : y;
          const ray = new THREE.Raycaster(new THREE.Vector3(x + nx * .5, probeY, z + nz * .5), new THREE.Vector3(-nx, 0, -nz), 0, 1);
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
    for (const [x, z] of [[77, -205], [77, -212], [77, -215], [76, -219]]) {
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
