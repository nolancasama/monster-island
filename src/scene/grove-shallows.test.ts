import { afterAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { SHALLOW_KEEP_OUTS, SHALLOW_WATER_DEPTH, inShallowShape } from "../game/world/groveShallows";
import { lowlandY } from "../game/world/lowland";
import { groveShallowsGeometry } from "./models/groveShallows";
import { lowlandTerrainTiles } from "./models/lowland";

const geometry = groveShallowsGeometry();
const positions = geometry.getAttribute("position");
afterAll(() => geometry.dispose());

describe("flooded forest surface", () => {
  it("uses one ungrouped lightweight batch", () => {
    expect(positions.count).toBeGreaterThan(0);
    expect(positions.count / 3).toBeLessThan(2500);
    expect(geometry.groups).toHaveLength(0);
  });

  it("leaves the authored puzzle banks and dry islands out of every water face", () => {
    const overlaps: Array<[number, number]> = [];
    for (let i = 0; i < positions.count; i += 3) {
      // Sample vertices, edges, and the interior: a dry hole must not be
      // bridged by a transparent triangle whose corners merely miss it.
      for (let a = 0; a <= 4; a++) for (let b = 0; b <= 4 - a; b++) {
        const c = 4 - a - b;
        const x = (positions.getX(i) * a + positions.getX(i + 1) * b + positions.getX(i + 2) * c) / 4;
        const z = (positions.getZ(i) * a + positions.getZ(i + 1) * b + positions.getZ(i + 2) * c) / 4;
        if (SHALLOW_KEEP_OUTS.some(s => inShallowShape(s, x, z))) overlaps.push([x, z]);
      }
    }
    expect(overlaps).toEqual([]);
  });

  it("holds its waterline an ankle above the unchanged walking floor", () => {
    for (let i = 0; i < positions.count; i++) {
      expect(positions.getY(i) - lowlandY(positions.getX(i), positions.getZ(i))).toBeCloseTo(SHALLOW_WATER_DEPTH, 3);
    }
  });

  it("keeps wading feet submerged and the surface above the rendered forest floor", () => {
    let feet = Infinity, rendered = Infinity;
    let worst = "", worstRendered = "";
    const terrainGeometry = lowlandTerrainTiles();
    const material = new THREE.MeshBasicMaterial();
    const terrain = terrainGeometry.map(g => new THREE.Mesh(g, material));
    const ray = new THREE.Raycaster(), origin = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0);
    const renderedFloor = (x: number, z: number) => {
      ray.set(origin.set(x, 100, z), down);
      const hit = ray.intersectObjects(terrain, false)[0];
      if (!hit) throw new Error(`Missing rendered floor at ${x},${z}`);
      return hit.point.y;
    };
    for (let i = 0; i < positions.count; i += 3) {
      const x = (positions.getX(i) + positions.getX(i + 1) + positions.getX(i + 2)) / 3;
      const y = (positions.getY(i) + positions.getY(i + 1) + positions.getY(i + 2)) / 3;
      const z = (positions.getZ(i) + positions.getZ(i + 1) + positions.getZ(i + 2)) / 3;
      if (y - lowlandY(x, z) < feet) worst = JSON.stringify({ x, z, y, floor: lowlandY(x, z), vertices: [0, 1, 2].map(j => [positions.getX(i + j), positions.getY(i + j), positions.getZ(i + j)]) });
      feet = Math.min(feet, y - lowlandY(x, z));
      const floor = renderedFloor(x, z);
      if (y - floor < rendered) worstRendered = JSON.stringify({ x, z, y, floor });
      rendered = Math.min(rendered, y - floor);
    }
    terrainGeometry.forEach(g => g.dispose()); material.dispose();
    expect(feet, `minimum water depth over walking feet: ${worst}; rendered clearance ${rendered}: ${worstRendered}`).toBeGreaterThan(.025);
    expect(rendered, "minimum water clearance over rendered floor").toBeGreaterThan(.005);
  });
});
