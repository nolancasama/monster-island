import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { standY } from "../game/world/collision";
import { CANOPY_DECKS, CANOPY_ROPES, lowlandDeckY, lowlandWalkable, lowlandY, STAGES, STAGE_EXITS } from "../game/world/lowland";
import { canopyDeckGeometry, canopyRopeGeometry, canopyRopeAnchorsGeometry, updateCanopyPayingRope, lowlandSceneryY, streamRibbonGeometry } from "./models/lowland";

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
    geometry.dispose();
  });

  for (const [id, rope] of Object.entries(CANOPY_ROPES)) it(`${id} has one continuous visible rope down to its foot`, () => {
    const geometry = canopyRopeGeometry(rope), positions = geometry.getAttribute("position");
    const top = standY(rope.top.x, rope.top.z, solved), foot = standY(rope.foot.x, rope.foot.z, solved);
    // Ray samples through the rope's vertical run prove there are no missing
    // segments, including immediately beneath the lip and near the loose end.
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material); mesh.updateMatrixWorld();
    for (let y = foot + .8; y < top - .5; y += .14) {
      const ray = new THREE.Raycaster(new THREE.Vector3(rope.x - 1, y, rope.hangZ), new THREE.Vector3(1, 0, 0));
      expect(ray.intersectObject(mesh).length, `${id} rope at ${y}`).toBeGreaterThan(0);
    }
    expect(positions.count / 3).toBeLessThan(1000);
    const anchors = canopyRopeAnchorsGeometry();
    anchors.computeBoundingBox();
    expect(anchors.boundingBox!.max.y).toBeGreaterThan(top + 1.2);
    geometry.dispose(); anchors.dispose(); material.dispose();
  });

  it("updates a single paying-out tube with its free end attached to Puff", () => {
    const geometry = new THREE.BufferGeometry();
    const r = CANOPY_ROPES.entrance;
    for (const y of [4, 8, 15]) {
      const end = new THREE.Vector3(r.x + .45, y, r.foot.z);
      updateCanopyPayingRope(geometry, end);
      const position = geometry.getAttribute("position");
      const lastRing = new THREE.Vector3();
      for (let j = 0; j < 6; j++) lastRing.add(new THREE.Vector3().fromBufferAttribute(position, 48 * 7 + j));
      lastRing.divideScalar(6);
      expect(lastRing.distanceTo(end)).toBeLessThan(.0001);
      expect(geometry.index!.count / 3).toBe(576);
    }
    geometry.dispose();
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
