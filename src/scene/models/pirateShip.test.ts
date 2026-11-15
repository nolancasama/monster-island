import { describe, expect, it } from "vitest";
import type * as THREE from "three";
import { cargoGeometry, floatBarrelGeometry, lifeboatGeometry, pirateShipGeometries, plankGeometry, raftGeometry, raftSailGeometry, rockGeometry, sailGeometry, sparGeometry } from "./pirateShip";
import { DECK_Y, SPOT } from "../../game/world/pirateShip";

const tris = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3;

describe("the pirate ship's budget (docs/PIRATE_VOYAGE.md §8)", () => {
  it("the ship is at most 9k triangles in at most 6 draws", () => {
    const { base, tall, main } = pirateShipGeometries();
    const sails = [sailGeometry(5.2), sailGeometry(8.6), sailGeometry(7.0)];
    const meshes = [base, tall, main, ...sails];
    expect(meshes.length).toBeLessThanOrEqual(6);
    const total = meshes.reduce((n, g) => n + tris(g), 0);
    expect(total).toBeLessThanOrEqual(9000);
  });

  it("the raft and the wreckage stay under 2k triangles", () => {
    const parts = [raftGeometry(), ...[0, 1, 2, 3].map(() => plankGeometry()), raftSailGeometry(), lifeboatGeometry(), lifeboatGeometry(), sparGeometry(), floatBarrelGeometry(), rockGeometry()];
    expect(parts.reduce((n, g) => n + tris(g), 0)).toBeLessThanOrEqual(2000);
  });

  it("the cut-away rigging is its own mesh, and the mainmast stands on the deck about its foot", () => {
    const { tall, main } = pirateShipGeometries();
    expect(tris(tall)).toBeGreaterThan(0);
    main.computeBoundingBox();
    const b = main.boundingBox!;
    // Built about the mast's foot: the group placed at the foot can rotate it down.
    expect(b.min.y).toBeGreaterThanOrEqual(-1.2);
    expect(b.max.y).toBeGreaterThan(12);
    expect(Math.abs((b.min.x + b.max.x) / 2)).toBeLessThan(4.5);
    expect(SPOT.mainMast.z).toBeGreaterThan(-1);
    expect(DECK_Y).toBeGreaterThan(1);
  });

  it("each cargo item sits on its own base", () => {
    for (const item of ["barrel", "bag", "bottle"] as const) {
      const g = cargoGeometry(item);
      g.computeBoundingBox();
      expect(g.boundingBox!.min.y).toBeGreaterThanOrEqual(-0.01);
    }
  });
});
