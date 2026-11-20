import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { cargoGeometry, floatBarrelGeometry, lifeboatGeometry, pirateShipGeometries, plankGeometry, raftGeometry, raftSailGeometry, riggingLines, rockGeometry, sailGeometry, sparGeometry } from "./pirateShip";
import { BOW_Z, CARGO_SIZE, DECK_Y, HOLD_CEILING_Y, HOLD_HEADER_Y, HOLD_PORTAL, HOLD_RAMP, HOLD_STAIRS, HOLD_Y, MASTS, SPOT, STERN_RAMP, STERN_STAIRS, shipWalkable, shipWorld } from "../../game/world/pirateShip";
import { SEA_Y } from "../../game/world/island";

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
      const { min, max } = g.boundingBox!;
      expect(min.y).toBeCloseTo(0, 5);
      expect(max.y).toBeCloseTo(CARGO_SIZE[item].height, 5);
      expect(Math.max(max.x, -min.x, max.z, -min.z)).toBeLessThanOrEqual(CARGO_SIZE[item].radius + 1e-5);
    }
  });
});

describe("pirate ship attachments and stair geometry", () => {
  it("builds ropes at their named anchors in the correct mesh frame", () => {
    const meshes = pirateShipGeometries();
    const ropes = riggingLines();
    expect(ropes.filter(({ mesh }) => mesh === "main").map(({ fromOn, toOn }) => [fromOn, toOn]))
      .toEqual([["mast:main", "boom:main"]]);
    expect(ropes.some(({ fromOn, toOn }) => fromOn === "bowsprit" && toOn === "stem")).toBe(true);
    for (const { from, to, mesh, fromOn, toOn } of ropes) {
      const vertices = meshes[mesh].attributes.position;
      for (const [point, anchor] of [[from, fromOn], [to, toOn]] as const) {
        const [x, y, z] = point;
        if (anchor.startsWith("mast:")) {
          const mast = MASTS[anchor.slice(5) as keyof typeof MASTS];
          const radius = THREE.MathUtils.lerp(0.24, 0.13, (y - DECK_Y) / mast.h);
          expect(Math.hypot(x - mast.x, z - mast.z)).toBeLessThan(radius * Math.cos(Math.PI / 8));
          expect(y).toBeGreaterThan(DECK_Y);
          expect(y).toBeLessThan(DECK_Y + mast.h);
        }
        if (anchor.startsWith("boom:")) {
          const mast = MASTS[anchor.slice(5) as keyof typeof MASTS];
          expect(Math.abs(x - mast.x)).toBeLessThan(0.08);
          expect(Math.abs(y - DECK_Y - 2.25)).toBeLessThan(0.08);
          expect(Math.abs(z - mast.z - 2.2)).toBeLessThan(2.3);
        }
        if (anchor === "stem") {
          expect([x, y]).toEqual([0, SEA_Y]);
          expect(z).toBeLessThan(BOW_Z);
        }
        const local = new THREE.Vector3(...point);
        if (mesh === "main") local.sub(new THREE.Vector3(MASTS.main.x, DECK_Y, MASTS.main.z));
        const vertex = new THREE.Vector3();
        let found = false;
        for (let i = 0; i < vertices.count && !found; i++) {
          found = vertex.fromBufferAttribute(vertices, i).distanceToSquared(local) < 1e-8;
        }
        expect(found, anchor).toBe(true);
      }
      for (let i = 0; i <= 100; i++) {
        const [x, y, z] = from.map((value, axis) => THREE.MathUtils.lerp(value, to[axis], i / 100));
        const world = shipWorld({ x, z });
        if (shipWalkable(world.x, world.z)) expect(y - 0.025).toBeGreaterThanOrEqual(DECK_Y + 2.2);
      }
    }
  });

  it("renders each tread at its computed height with an open corridor above it", () => {
    const { base, tall, main } = pirateShipGeometries();
    const wood = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const meshes = [base, tall, main].map((geometry) => new THREE.Mesh(geometry, wood));
    meshes[2].position.set(MASTS.main.x, DECK_Y, MASTS.main.z);
    meshes[2].updateMatrixWorld();
    const ray = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    for (const [ramp, stairs] of [[HOLD_RAMP, HOLD_STAIRS], [STERN_RAMP, STERN_STAIRS]] as const) {
      for (const { z0, z1, y } of stairs.steps) {
        for (const x of [ramp.x0 + 0.01, (ramp.x0 + ramp.x1) / 2, ramp.x1 - 0.01]) {
          for (const z of [z0 + 0.01, (z0 + z1) / 2, z1 - 0.01]) {
            ray.set(new THREE.Vector3(x, y + 2, z), down);
            const [hit] = ray.intersectObjects(meshes);
            expect(hit?.point.y, `tread at ${x}, ${z}`).toBeCloseTo(y, 5);
          }
        }
      }
    }
    wood.dispose();
  });

  it("lines the hatch below deck and closes the head of the hold doorway", () => {
    const { base } = pirateShipGeometries();
    const wood = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(base, wood), ray = new THREE.Raycaster();
    const { x0, x1, z0, z1 } = HOLD_RAMP, x = (x0 + x1) / 2;
    for (const edge of [x0, x1]) {
      for (const z of [z0 + 0.1, 0.32, z1 - 0.16]) {
        ray.set(new THREE.Vector3(x, DECK_Y - 0.08, z), new THREE.Vector3(Math.sign(edge - x), 0, 0));
        expect(ray.intersectObject(mesh)[0]?.point.x).toBeCloseTo(edge, 5);
      }
    }
    for (const y of [(HOLD_HEADER_Y + HOLD_CEILING_Y) / 2, DECK_Y - 0.02]) {
      ray.set(new THREE.Vector3(x, y, z0 + 0.15), new THREE.Vector3(0, 0, -1));
      expect(ray.intersectObject(mesh)[0]?.point.z).toBeCloseTo(z0, 5);
    }
    ray.set(new THREE.Vector3(x, HOLD_Y + 1.88, 0.15), new THREE.Vector3(0, 0, -1));
    expect(ray.intersectObject(mesh)[0]?.point.z).toBeCloseTo(HOLD_PORTAL.enterZ - 0.12, 5);
    wood.dispose();
  });
});
