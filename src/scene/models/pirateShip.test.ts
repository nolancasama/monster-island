import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { cargoGeometry, floatBarrelGeometry, lifeboatGeometry, pirateShipGeometries, plankGeometry, raftGeometry, raftSailGeometry, riggingLines, rockGeometry, sailGeometry, sparGeometry } from "./pirateShip";
import { BOW_Z, BULWARK_THICKNESS, CANNONS, CARGO_SIZE, DECK_Y, HOLD, HOLD_CEILING_Y, HOLD_ENTRY, HOLD_HEADER_Y, HOLD_PILLAR, HOLD_RAMP, HOLD_SOLIDS, HOLD_STAIRS, HOLD_Y, MASTS, SHIP, SPOT, STERN_RAMP, STERN_STAIRS, holdLayerAt, hullHalf, shipFloorY, shipWalkable, shipWorld, touches } from "../../game/world/pirateShip";
import { SEA_Y } from "../../game/world/island";
import { cameraProfileAt } from "../cameraProfiles";
import { holdFollowPose } from "../holdCamera";

const tris = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3;

it("cuts a clear barrel crossing with a raised wooden frame on both faces of every cannon port", () => {
  const { base } = pirateShipGeometries();
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(base, material), ray = new THREE.Raycaster();
  for (const { x, z, side } of CANNONS) {
    const outer = hullHalf(z), inner = outer - BULWARK_THICKNESS;
    const y = DECK_Y + 0.45;
    ray.set(new THREE.Vector3(side * (outer + 0.5), y + 0.02, z + 0.04), new THREE.Vector3(-side, 0, 0));
    const barrel = ray.intersectObject(mesh).map(hit => hit.point.x * side);
    expect(barrel[0]).toBeCloseTo(Math.abs(x) + 0.9, 5);
    expect(barrel[1]).toBeCloseTo(Math.abs(x) - 0.2, 5);

    const throughWall = (dy: number, dz: number) => {
      ray.set(new THREE.Vector3(side * (outer + 0.1), y + dy, z + dz), new THREE.Vector3(-side, 0, 0));
      ray.far = BULWARK_THICKNESS + 0.2;
      const hits = ray.intersectObject(mesh);
      ray.far = Infinity;
      return hits.map(hit => hit.point.x * side);
    };
    // At least 4 cm beyond the barrel's envelope, including all four corners.
    for (const offset of [-0.19, 0.19]) {
      for (const cross of [-0.19, 0.013, 0.19]) {
        expect(throughWall(offset, cross)).toHaveLength(0);
        expect(throughWall(cross, offset)).toHaveLength(0);
      }
    }
    for (const offset of [-0.27, 0.27]) {
      for (const hits of [throughWall(offset, 0.013), throughWall(0.013, offset)]) {
        expect(hits).toHaveLength(2);
        expect(hits[0]).toBeGreaterThan(outer);
        expect(hits[1]).toBeLessThan(inner);
      }
    }
    const planking = throughWall(0.013, 0.42);
    expect(planking).toHaveLength(2);
    expect(planking[0]).toBeCloseTo(outer, 5);
    expect(planking[1]).toBeCloseTo(inner, 5);
  }
  base.dispose();
  material.dispose();
});

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
    expect(ray.intersectObject(mesh)[0]?.point.z).toBeCloseTo(HOLD.z0, 5);
    wood.dispose();
  });

  it("shows wood or treads through the deck opening from all four sides", () => {
    const { base } = pirateShipGeometries();
    const wood = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(base, wood), ray = new THREE.Raycaster();
    const { x0, x1, z0, z1 } = HOLD_RAMP;
    const x = HOLD_ENTRY.x, z = (z0 + z1) / 2;
    const lenses = [
      new THREE.Vector3(x + 1.2, DECK_Y + 3.8, z1 + 2.5), // hatch-from-deck
      new THREE.Vector3(x, DECK_Y + 4.1, z0 - 2),
      new THREE.Vector3(x0 - 2.1, DECK_Y + 4.1, z),
      new THREE.Vector3(x1 + 2.1, DECK_Y + 4.1, z),
    ];
    const direction = new THREE.Vector3();
    for (const lens of lenses) {
      for (let i = 0; i <= 10; i++) {
        for (let j = 0; j <= 20; j++) {
          // Include the seams along the lip and coaming at each end.
          const px = THREE.MathUtils.lerp(x0 - 0.01, x1 + 0.01, i / 10);
          const pz = THREE.MathUtils.lerp(z0 - 0.01, z1 + 0.01, j / 20);
          ray.set(lens, direction.set(px, DECK_Y, pz).sub(lens).normalize());
          expect(ray.intersectObject(mesh).length, `clear through the hatch at ${px}, ${pz}`).toBeGreaterThan(0);
        }
      }
    }
    wood.dispose();
  });

  it("keeps the follow lens and its sight line clear all the way down the hold stairs", () => {
    const { base, hold } = pirateShipGeometries();
    const wood = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const deckMesh = new THREE.Mesh(base, wood);
    const roomMeshes = [deckMesh, new THREE.Mesh(hold, wood)];
    const lens = new THREE.Vector3(), target = new THREE.Vector3(), direction = new THREE.Vector3();
    const feet = new THREE.Vector3(), ray = new THREE.Raycaster();
    const profile = cameraProfileAt({ ...shipWorld(HOLD_ENTRY), y: DECK_Y, climbing: false, cloud: false });
    expect(profile.id).toBe("pirate-ship");
    for (const x of [HOLD_ENTRY.x - 0.26, HOLD_ENTRY.x, HOLD_ENTRY.x + 0.26]) {
      let inside = false;
      for (let i = 0; i <= 120; i++) {
        const z = THREE.MathUtils.lerp(HOLD_RAMP.z1 + 0.6, HOLD_RAMP.z0 - 0.58, i / 120);
        inside = holdLayerAt(x, z, inside);
        const y = shipFloorY(x, z, inside)!;
        const player = { ...shipWorld({ x, z }), y };
        expect(holdFollowPose(player, inside, profile, lens, target)).not.toBeNull();
        // ArrowUp is the horizontal direction from the rendered lens to target.
        expect(lens.x).toBeCloseTo(target.x, 6);
        expect(target.z).toBeLessThan(lens.z - 0.5);

        lens.x -= SHIP.x;
        lens.z -= SHIP.z;
        target.x -= SHIP.x;
        target.z -= SHIP.z;
        if (lens.y < DECK_Y) {
          const bounds = lens.z >= HOLD_RAMP.z0 ? HOLD_RAMP : HOLD;
          expect(lens.x).toBeGreaterThan(bounds.x0 + 0.1);
          expect(lens.x).toBeLessThan(bounds.x1 - 0.1);
          expect(lens.z).toBeGreaterThan(bounds.z0 - 0.1);
          expect(lens.z).toBeLessThan(bounds.z1);
          if (bounds === HOLD) expect(lens.y).toBeLessThan(HOLD_CEILING_Y - 0.1);
          expect(HOLD_SOLIDS.some(box => touches(box, lens.x, lens.z, 0))).toBe(false);
          expect(Math.hypot(lens.x - HOLD_PILLAR.x, lens.z - HOLD_PILLAR.z)).toBeGreaterThan(HOLD_PILLAR.r);
        }
        expect(lens.y).toBeGreaterThan(HOLD_STAIRS.floorY(lens.z) + 0.15);
        feet.set(x, y + 0.12, z);
        // For the first ~0.93 m down, the feet are behind the hatch's near lip (the body stays in view); require them below 1 m.
        for (const point of y < DECK_Y - 1 ? [feet, target] : [target]) {
          direction.subVectors(point, lens);
          ray.far = direction.length() - 0.001;
          ray.set(lens, direction.normalize());
          expect(ray.intersectObjects(inside ? roomMeshes : [deckMesh]), `sight line at x=${x}, z=${z}`).toHaveLength(0);
        }
      }
      expect(inside).toBe(true);
    }
    wood.dispose();
  });
});
