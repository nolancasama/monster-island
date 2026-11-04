import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { standY } from "../game/world/collision";
import { CANOPY_DECKS, CANOPY_FLIGHTS, CANOPY_FLIGHT_RIMS, lowlandDeckY, lowlandWalkable, lowlandY, STAGES, STAGE_EXITS, ZONES } from "../game/world/lowland";
import { canopyDeckGeometry, canopyFlightGeometry, lowlandSceneryY, streamRibbonGeometry } from "./models/lowland";

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
    for (const { walk } of CANOPY_DECKS) {
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
      if (z > -205.1 || z < -234.9) continue;
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

  for (const flight of CANOPY_FLIGHTS) it(`${flight.id} treads, supports and rims follow the authored flight`, () => {
    const geometry = canopyFlightGeometry(flight), material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geometry, material); mesh.updateMatrixWorld();
    const dz = (flight.topZ - flight.footZ) / flight.steps;
    const hitAt = (x: number, z: number) => new THREE.Raycaster(new THREE.Vector3(x, 40, z), new THREE.Vector3(0, -1, 0)).intersectObject(mesh)[0];
    for (let i = 0; i < flight.steps; i++) {
      const za = flight.footZ + dz * i, zb = za + dz;
      for (const x of [flight.x0 + 1, (flight.x0 + flight.x1) / 2, flight.x1 - 1]) {
        const riser = Math.abs(flight.height(x, zb) - flight.height(x, za));
        // Read actual mesh nosings, including roots, rather than the builder's metadata.
        for (const z of [za + dz * .001, zb - dz * .001]) {
          const hit = hitAt(x, z);
          expect(hit, `${flight.id} tread ${i}`).toBeDefined();
          expect(Math.abs(hit.point.y - flight.height(x, z)), JSON.stringify({ step: i, x, z, rendered: hit.point.y, expected: flight.height(x, z), riser })).toBeLessThanOrEqual(riser / 2 + .006);
        }
      }
      for (const rim of CANOPY_FLIGHT_RIMS.filter(r => r.az === flight.footZ)) {
        const z = (za + zb) / 2;
        expect(hitAt(rim.ax, z).point.y - flight.height(rim.ax, z)).toBeGreaterThan(.3);
      }
    }
    const p = geometry.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      expect(p.getX(i)).toBeGreaterThanOrEqual(flight.x0 - .221);
      expect(p.getX(i)).toBeLessThanOrEqual(flight.x1 + .221);
      expect(p.getZ(i)).toBeGreaterThanOrEqual(Math.min(flight.footZ, flight.topZ) - .221);
      expect(p.getZ(i)).toBeLessThanOrEqual(Math.max(flight.footZ, flight.topZ) + .221);
    }
    const count = p.count / 3;
    expect(count).toBeGreaterThanOrEqual(2000);
    expect(count).toBeLessThanOrEqual(3000);
    expect(count).toBe(flight.id === "entrance" ? 2834 : 2980);
    // Riser fronts must face the foot: single-sided materials expose bad winding.
    const x = (flight.x0 + flight.x1) / 2, direction = Math.sign(dz);
    for (const i of [1, 18, 35]) {
      const z = flight.footZ + dz * i;
      const y = (flight.height(x, z - dz) + 2 * flight.height(x, z) + flight.height(x, z + dz)) / 4;
      const ray = new THREE.Raycaster(new THREE.Vector3(x, y, z - direction * .05), new THREE.Vector3(0, 0, direction));
      expect(ray.intersectObject(mesh)[0]?.distance, `${flight.id} riser ${i}`).toBeCloseTo(.05, 3);
    }
    geometry.dispose(); material.dispose();
  });

  it("closes the approach south face and landing sides down to ground, with the gate on the landing", () => {
    const geometry = canopyDeckGeometry(), material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geometry, material); mesh.updateMatrixWorld();
    for (const [x, z, dx, dz] of [[97, -200.5, 0, -1], [92, -238, 1, 0], [100, -238, -1, 0]]) {
      const ground = lowlandY(x, z), top = lowlandDeckY(x, z, solved);
      for (const t of [.02, .5, .98]) {
        const ray = new THREE.Raycaster(new THREE.Vector3(x - dx, ground + (top - ground) * t, z - dz), new THREE.Vector3(dx, 0, dz));
        expect(ray.intersectObject(mesh)[0]?.distance).toBeCloseTo(1, 3);
      }
    }
    const gate = STAGE_EXITS.find(g => g.id === "canopy")!;
    expect(lowlandSceneryY(gate.x, gate.z)).toBeCloseTo(lowlandDeckY(gate.x, gate.z, solved), 6);
    geometry.dispose(); material.dispose();
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
