import { afterAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { groundY } from "../game/world/island";
import { CAVE_MOUTHS } from "../game/world/lowland";
import { CAMERA_PROFILES } from "./cameraProfiles";
import { caveMouthGeometry } from "./models/cave";
import { mesaGeometry } from "./models/lowland";

const material = new THREE.MeshBasicMaterial();
const mouthGeometry = caveMouthGeometry();
const mouths = new THREE.Mesh(mouthGeometry, material), mesa = new THREE.Mesh(mesaGeometry(), material);
mouths.updateMatrixWorld(); mesa.updateMatrixWorld();
afterAll(() => { mouthGeometry.dispose(); mesa.geometry.dispose(); material.dispose(); });
const faceX = (z: number) => z < -222 ? 72 + (-222 - z) / 9 : 72;

describe("static recessed Grove cave mouths", () => {
  for (const [index, mouth] of CAVE_MOUTHS.entries()) {
    it(`mouth ${index + 1} opens through the mesa to a black throat 2.2 m behind its lip`, () => {
      const y = groundY(70.4, mouth.z);
      // The first surface is the deep throat, rather than a facade on the uncut mesa wall.
      for (const dz of [-.7, 0, .7]) {
        const z = mouth.z + dz;
        const ray = new THREE.Raycaster(new THREE.Vector3(mouth.portalX, y + 1.3, z), new THREE.Vector3(1, 0, 0));
        const hit = ray.intersectObjects([mouths, mesa])[0];
        expect(hit?.object).toBe(mouths);
        expect(hit.point.x).toBeCloseTo(faceX(z) + 1.75, 4);
        const color = mouthGeometry.getAttribute("color");
        expect(Math.max(...[hit.face!.a, hit.face!.b, hit.face!.c].flatMap(i => [color.getX(i), color.getY(i), color.getZ(i)]))).toBeLessThan(.004);
      }
      // The rock lip actually protrudes in front of the old face, and the side/ceiling
      // reveal occupies intermediate depths instead of being a second flat black plane.
      const p = mouthGeometry.getAttribute("position");
      const depths = Array.from({ length: p.count }, (_, i) => i).filter(i => Math.abs(p.getZ(i) - mouth.z) < 3)
        .map(i => p.getX(i) - faceX(p.getZ(i)));
      expect(Math.min(...depths)).toBeCloseTo(-.57, 4);
      expect(depths.some(d => Math.abs(d - .55) < .001)).toBe(true);
      expect(Math.max(...depths)).toBeCloseTo(1.75, 4);
    });

    it(`mouth ${index + 1} keeps the complete approach pocket and Grove player sight lines clear`, () => {
      const p = mouthGeometry.getAttribute("position");
      for (let i = 0; i < p.count; i++) {
        if (p.getZ(i) >= mouth.z0 && p.getZ(i) <= mouth.z1) expect(p.getX(i)).toBeGreaterThan(mouth.groundX1);
      }
      const frame = CAMERA_PROFILES.find(p => p.id === "flooded-grove")!;
      for (const x of [mouth.groundX0 + .4, mouth.portalX, mouth.groundX1 - .35]) for (const z of [mouth.z0 + .4, mouth.z, mouth.z1 - .4]) {
        const y = groundY(x, z), horizontal = frame.dist * Math.cos(frame.pitch) - frame.ahead;
        const head = new THREE.Vector3(x, y + 1.3, z);
        const lens = new THREE.Vector3(x + Math.sin(frame.yaw) * horizontal, y + 1.1 + frame.dist * Math.sin(frame.pitch), z + Math.cos(frame.yaw) * horizontal);
        const ray = new THREE.Raycaster(lens, head.clone().sub(lens).normalize(), 0, lens.distanceTo(head));
        expect(ray.intersectObject(mouths), `${x},${z}`).toEqual([]);
      }
    });
  }

  it("keeps both mouths in a single small static geometry with the props' attributes", () => {
    expect(mouthGeometry.getAttribute("position").count / 3).toBeLessThan(200);
    for (const name of ["normal", "color", "uv"]) expect(mouthGeometry.getAttribute(name).count).toBe(mouthGeometry.getAttribute("position").count);
    expect(mouthGeometry.groups).toEqual([]);
  });
});
