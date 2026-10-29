import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { GATE_PILLARS, groundY } from "../game/world/island";
import { massifGeometry } from "./models/highlands";
import { caveInteriorGeometry, gateWallGeometry, volcanoGroundGeometry, volcanoRocksGeometry } from "./models/volcano";

describe("the sanctuary's four visible gate pillars", () => {
  it("places the four interaction centres in a symmetric set in front of the gate", () => {
    const pillars = Object.values(GATE_PILLARS);
    expect(pillars[0].x + pillars[3].x).toBe(140);
    expect(pillars[1].x + pillars[2].x).toBe(140);
    expect(new Set(pillars.map(p => p.z)).size).toBe(1);
    expect(pillars.every(p => p.z > -133 && p.z < -129)).toBe(true);
  });

  it("keeps all four friend symbols clear of the real ridge, lining, rocks and gate walls", () => {
    const material = new THREE.MeshBasicMaterial();
    const meshes = Object.entries({
      massif: massifGeometry(), rocks: volcanoRocksGeometry(), walls: gateWallGeometry(),
      lining: caveInteriorGeometry(), ground: volcanoGroundGeometry()
    }).map(([name, geometry]) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name;
      mesh.updateMatrixWorld();
      return mesh;
    });
    // The settled, unmodified follow camera from the 1366×768 courtyard
    // baseline. The old ridge intersected the Leaf/Drop rays near x68,z-122.
    // Keeping this framing fixed verifies placement/clearing, independently of
    // any future camera changes. The second position is the courtyard entry.
    const blocked: { view: string; id: string; sample: number[]; mesh: string; at: number[] }[] = [];
    for (const [view, cameraZ] of [["courtyard", -120.13552752227027], ["approach", -118.93552752227027]] as const) {
      const origin = new THREE.Vector3(70, 24.800083040986856, cameraZ);
      for (const [id, p] of Object.entries(GATE_PILLARS)) {
        for (const [dx, dy] of [[0, 0], [-.14, 0], [.14, 0], [0, -.18], [0, .18]]) {
          const target = new THREE.Vector3(p.x + dx, groundY(p.x, p.z) + 2 + dy, p.z + .8);
          const ray = new THREE.Raycaster(origin, target.clone().sub(origin).normalize(), 0, origin.distanceTo(target) - .1);
          const hits = ray.intersectObjects(meshes);
          if (hits.length) blocked.push({ view, id, sample: [dx, dy], mesh: hits[0].object.name, at: hits[0].point.toArray() });
        }
      }
    }
    for (const mesh of meshes) mesh.geometry.dispose();
    material.dispose();
    expect(blocked, "every symbol has an unobstructed sightline across its face").toEqual([]);
  });
});
