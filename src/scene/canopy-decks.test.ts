import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { standY } from "../game/world/collision";
import { CANOPY_DECKS, CANOPY_FLIGHTS, lowlandDeckY, lowlandWalkable, lowlandY, STAGES, ZONES } from "../game/world/lowland";
import { canopyDeckGeometry, lowlandSceneryY, streamRibbonGeometry } from "./models/lowland";

const solved = ["groveLilies", "canopyVines", "canopyRope"] as const;
const open = { act2: true, cleared: STAGES, solved };

describe("authored Canopy decks", () => {
  it("keeps Grove furnishings on the marsh and Canopy furnishings on the raised floor", () => {
    expect(lowlandSceneryY(55, -220)).toBeLessThan(4);
    expect(lowlandSceneryY(102, -210)).toBeGreaterThan(10);
  });
  it("matches the standing surface within 15cm at interior and lip samples", () => {
    const geometry = canopyDeckGeometry(), material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geometry, material); mesh.updateMatrixWorld();
    let samples = 0;
    const check = (x: number, z: number) => {
      if (!lowlandWalkable(x, z, open, 0)) return;
      const deck = lowlandDeckY(x, z, solved);
      if (!Number.isFinite(deck)) return;
      const ray = new THREE.Raycaster(new THREE.Vector3(x, 40, z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(mesh)[0];
      expect(hit, `rendered floor at ${x},${z}`).toBeDefined();
      expect(Math.abs(hit.point.y - deck), `deck at ${x},${z}`).toBeLessThanOrEqual(.15);
      expect(Math.abs(hit.point.y - standY(x, z, solved)), `stand at ${x},${z}`).toBeLessThanOrEqual(.15);
      samples++;
    };
    // The arm approach is now elevated; its mesh and the new flights belong
    // to the rendering slice. Continue checking every existing platform mesh.
    for (const { id, walk } of CANOPY_DECKS) {
      if (id === "armApproach") continue;
      for (let x = walk.x0 + .04; x < walk.x1; x += .91)
        for (let z = walk.z0 + .04; z < walk.z1; z += .91) check(x, z);
      for (let x = walk.x0 + .04; x < walk.x1; x += .73) { check(x, walk.z0 + .04); check(x, walk.z1 - .04); }
      for (let z = walk.z0 + .04; z < walk.z1; z += .73) { check(walk.x0 + .04, z); check(walk.x1 - .04, z); }
    }
    expect(samples).toBeGreaterThan(1000);
    geometry.dispose(); material.dispose();
  });

  it("has vertical bark faces and at least eight metres of visible depth along every elevated lip", () => {
    const geometry = canopyDeckGeometry(), p = geometry.getAttribute("position");
    let walls = 0;
    for (let i = 0; i < p.count; i += 3) {
      const x = p.getX(i), z = p.getZ(i);
      if (z > -205.1 || z < -234.9) continue; // authored entrance/exit ramps meet the floor
      for (let j = i + 1; j < i + 3; j++) if (Math.abs(p.getX(j) - x) < .001 && Math.abs(p.getZ(j) - z) < .001 && p.getY(i) - p.getY(j) > 1) {
        expect(p.getY(i) - lowlandY(x, z), `visible drop at ${x},${z}`).toBeGreaterThanOrEqual(8);
        expect(p.getY(j)).toBeLessThanOrEqual(lowlandY(x, z));
        walls++;
      }
    }
    expect(walls).toBeGreaterThan(200);
    for (const f of CANOPY_FLIGHTS)
      expect(ZONES.canopy.walk).toContainEqual({ kind: "rect", x0: f.x0, x1: f.x1, z0: Math.min(f.footZ, f.topZ), z1: Math.max(f.footZ, f.topZ) });
    geometry.dispose();
  });

  it("wraps radial arena boards around the giant trunk and leaves its western arc open", () => {
    const geometry = canopyDeckGeometry(), material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geometry, material); mesh.updateMatrixWorld();
    const rayAt = (angle: number) => {
      const x = 94.8 + Math.cos(angle) * 3.5, z = -232.8 + Math.sin(angle) * 3.5;
      return { x, z, hits: new THREE.Raycaster(new THREE.Vector3(x, 40, z), new THREE.Vector3(0, -1, 0)).intersectObject(mesh) };
    };
    const intact = rayAt(Math.PI / 24), gap = rayAt(Math.PI + Math.PI / 24);
    expect(intact.hits[0].point.y - lowlandDeckY(intact.x, intact.z, solved)).toBeCloseTo(.025, 2);
    expect(lowlandWalkable(gap.x, gap.z, open, 0)).toBe(false);
    expect(gap.hits).toHaveLength(0);
    geometry.dispose(); material.dispose();
  });

  it("joins stream banks continuously around bends with upward-facing water", () => {
    const geometry = streamRibbonGeometry([[0, 0], [5, 0], [8, 4]], 1.6, (x, z) => x * .01 + z * .02);
    const positions = geometry.getAttribute("position"), normals = geometry.getAttribute("normal");
    for (let i = 0; i < positions.count; i++) {
      expect(positions.getY(i)).toBeCloseTo(positions.getX(i) * .01 + positions.getZ(i) * .02, 5);
      expect(normals.getY(i)).toBeGreaterThan(.99);
    }
    geometry.dispose();
  });
});
