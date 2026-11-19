import { describe, expect, it } from "vitest";
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import {
  BEAM, BULWARK_THICKNESS, BUCKET, CANNONS, COUNTER_CUSTOMER, COUNTER_SOLID, DECK_BARRELS, DECK_Y, FISH_DECK, FISH_LANDING_Z, FISH_Y, HALF_BEAM, HOLD, HOLD_CEILING_Y, HOLD_PORTAL, HOLD_RAMP, HOLD_STAIRS, HOLD_Y, MASTS, MESS, SHIP, SHIP_SOLIDS, SPOT, STERN_RAMP, STERN_STAIRS, STOVE_SOLID, SUPPLY_CRATES, SUPPLY_SIZE, SUPPLY_SOLID,
  crateApproach, hullHalf, inShipArea, sailHeight, shipFloorY, shipSolidAt, shipStandY, shipWalkable, shipWorld, touches,
} from "./pirateShip";
import { PLAYER_R, isWalkable, standY } from "./collision";
import { pirateShipGeometries } from "../../scene/models/pirateShip";
import { cargoSpot } from "../voyageSim";
import { resetVoyageRt, updateHoldView, vy } from "../voyageRt";
import type { Placement } from "../logic/voyage";

const R = 0.32;
const W = (p: { x: number; z: number }) => shipWorld(p);
const walk = (p: { x: number; z: number }, r = R, below = false) => shipWalkable(W(p).x, W(p).z, r, below);

describe("the pirate ship's decks (docs/PIRATE_VOYAGE.md §2)", () => {
  it("every place a person stands is walkable, at its deck's height", () => {
    const people = [SPOT.boardDeck, SPOT.captain, SPOT.gull, SPOT.cook, SPOT.finn, ...SPOT.crew, SPOT.fishing];
    for (const p of people) expect(walk(p), JSON.stringify(p)).toBe(true);
    expect(walk(SPOT.bill, R, true)).toBe(true);
    expect(shipStandY(W(SPOT.boardDeck).x, W(SPOT.boardDeck).z)).toBeCloseTo(DECK_Y, 6);
    expect(shipStandY(W(SPOT.bill).x, W(SPOT.bill).z, true)).toBeCloseTo(HOLD_Y, 6);
    expect(shipStandY(W(SPOT.finn).x, W(SPOT.finn).z)).toBeCloseTo(FISH_Y, 6);
  });

  it("the sea, the rails, the masts and the furniture are not walkable", () => {
    for (const p of [{ x: HALF_BEAM + 0.2, z: 0 }, { x: 0, z: 22 }, { x: 0, z: -22 }, { x: HALF_BEAM - 0.1, z: 0 }]) expect(walk(p, 0), JSON.stringify(p)).toBe(false);
    for (const p of [SPOT.mainMast, SPOT.helm, SPOT.stove, SPOT.counter, SPOT.supplies, MESS, BUCKET])
      expect(walk(p), JSON.stringify(p)).toBe(false);
    for (const p of [SPOT.table, SPOT.shelf, SPOT.box, { x: HOLD.x1 + 0.2, z: -4 }, { x: 0, z: -8 }])
      expect(walk(p, R, true), JSON.stringify(p)).toBe(false);
  });

  it("covers the hold and guards the three closed edges of the stair opening", () => {
    for (let x = HOLD.x0 + 0.45; x <= HOLD.x1 - 0.4; x += 0.45) {
      for (let z = HOLD.z0 + 0.45; z <= HOLD.z1 - 0.65; z += 0.45) {
        expect(shipFloorY(x, z)).toBe(DECK_Y);
        expect(walk({ x, z }, PLAYER_R)).toBe(true);
      }
    }
    const { x0, x1, z0, z1 } = HOLD_RAMP;
    const x = (x0 + x1) / 2, z = (z0 + z1) / 2;
    expect(shipFloorY(x, z)).toBeLessThan(DECK_Y);
    for (const p of [{ x: x0 - 0.1, z }, { x: x1 + 0.1, z }, { x, z: z0 - 0.1 }]) expect(walk(p, PLAYER_R)).toBe(false);
    expect(walk({ x, z: z1 + 0.15 }, PLAYER_R)).toBe(true);
  });

  it.each([
    { name: "hold", ramp: HOLD_RAMP, stairs: HOLD_STAIRS, y0: HOLD_Y, y1: DECK_Y },
    { name: "stern", ramp: STERN_RAMP, stairs: STERN_STAIRS, y0: DECK_Y, y1: FISH_Y },
  ])("keeps the $name stairs walkable with flat landings and guarded sides", ({ ramp, stairs, y0, y1 }) => {
    const x = (ramp.x0 + ramp.x1) / 2;
    const hold = ramp === HOLD_RAMP;
    const below = (z: number) => hold && z < HOLD_PORTAL.enterZ;
    expect(ramp.x1 - ramp.x0).toBeGreaterThanOrEqual(2 * PLAYER_R + 0.2);
    const endpoints = [ramp.z0 - 0.5, ramp.z1 + 0.5];
    for (const [start, end] of [endpoints, [...endpoints].reverse()]) {
      let last = shipFloorY(x, start, below(start))!;
      for (let i = 0; i <= 100; i++) {
        const z = start + (end - start) * i / 100;
        expect(walk({ x, z }, PLAYER_R, below(z)), `z ${z.toFixed(2)}`).toBe(true);
        const y = shipFloorY(x, z, below(z))!;
        expect(Math.abs(y - last)).toBeLessThan(0.05);
        last = y;
      }
    }
    expect(shipFloorY(x, ramp.z0 - 0.5, hold)).toBeCloseTo(y0, 6);
    expect(shipFloorY(x, stairs.slopeStart)).toBeCloseTo(y0, 6);
    expect(shipFloorY(x, stairs.slopeEnd)).toBeCloseTo(y1, 6);
    expect(shipFloorY(x, ramp.z1 + 0.5)).toBeCloseTo(y1, 6);
    for (const { z0, z1, y } of stairs.steps) {
      // Height is monotonic between tread edges, so these bound the error.
      for (const z of [z0, z1]) expect(Math.abs(shipFloorY(x, z)! - y)).toBeLessThanOrEqual(0.06 + 1e-9);
      for (const edge of [ramp.x0, ramp.x1]) expect(walk({ x: edge, z: (z0 + z1) / 2 }, PLAYER_R, below((z0 + z1) / 2))).toBe(false);
    }
  });

  it("renders one fishing landing surface across the last tread and deck seam", () => {
    const { base } = pirateShipGeometries();
    const material = new MeshBasicMaterial();
    const mesh = new Mesh(base, material);
    const ray = new Raycaster();
    for (const x of [STERN_RAMP.x0 + 0.24, STERN_RAMP.x1 - 0.23]) {
      for (const z of [FISH_LANDING_Z + 0.012, 15.17, FISH_DECK.z0 - 0.035, FISH_DECK.z0 + 0.035]) {
        ray.set(new Vector3(x, FISH_Y + 0.3, z), new Vector3(0, -1, 0));
        const hits = ray.intersectObject(mesh).filter(({ point }) => Math.abs(point.y - FISH_Y) < 1e-5);
        expect(hits, `x ${x}, z ${z}`).toHaveLength(1);
      }
      for (const z of [FISH_LANDING_Z, FISH_DECK.z0]) {
        expect(Math.abs(shipFloorY(x, z - 0.001)! - shipFloorY(x, z + 0.001)!)).toBeLessThan(0.002);
      }
    }
    material.dispose();
  });

  it("opens the galley across the former bulkhead", () => {
    for (const x of [-5, -2, 0, 2, 5]) {
      for (const z of [-13.3, -13, -12.7]) expect(walk({ x, z }, PLAYER_R)).toBe(true);
    }
  });

  it("the game's collision and heights use the ship inside its area only", () => {
    const deck = W(SPOT.boardDeck);
    expect(inShipArea(deck.x, deck.z)).toBe(true);
    expect(inShipArea(SHIP.x, SHIP.z + 40)).toBe(false);
    expect(isWalkable(deck.x, deck.z, { solved: [], act2: true }, R)).toBe(true);
    expect(isWalkable(SHIP.x + HALF_BEAM + 0.5, deck.z, { solved: [], act2: true }, R)).toBe(false);
    expect(standY(deck.x, deck.z, [])).toBeCloseTo(DECK_Y, 6);
  });
});

describe("the wider ship (2026-11-16: the beam is 1.5× the first build)", () => {
  it("the hull, the hold, the galley and the fishing deck are half as wide again; the length is unchanged", () => {
    expect(BEAM).toBe(1.5);
    expect(hullHalf(0)).toBeCloseTo(4.5 * 1.5, 6);
    expect(hullHalf(-21)).toBeCloseTo(1.5 * 1.5, 6);
    expect(hullHalf(15)).toBeCloseTo(4 * 1.5, 6);
    expect(hullHalf(16)).toBe(0);
    expect(HOLD.x1 - HOLD.x0).toBeCloseTo(5.6 * 1.5, 6);
    expect(FISH_DECK.x1 - FISH_DECK.x0).toBeCloseTo(6 * 1.5, 6);
    // The walkable deck amidships spans the new beam less the rails.
    let across = 0;
    for (let x = -8; x <= 8; x += 0.05) if (walk({ x, z: 4.3 }, 0)) across += 0.05;
    expect(across).toBeGreaterThan(12.5);
  });

  it("the cannons and the barrels by the bulwarks are solid, and leave the walking lines clear", () => {
    for (const c of CANNONS) expect(shipSolidAt(W(c).x, W(c).z, 0.1), JSON.stringify(c)).toBe(true);
    for (const b of DECK_BARRELS) expect(shipSolidAt(W(b).x, W(b).z, 0.1), JSON.stringify(b)).toBe(true);
    // A friend's whole width still passes inboard of each one (even beside the hold's rail).
    for (const c of [...CANNONS, ...DECK_BARRELS]) expect(walk({ x: c.x - Math.sign(c.x) * 0.92, z: c.z }, 0.55), JSON.stringify(c)).toBe(true);
  });

  it("the supply crates stand in the galley and can be reached from the stove's side", () => {
    for (const [i, c] of SUPPLY_CRATES.entries()) {
      const prev = SUPPLY_CRATES[i - 1];
      if (prev) expect(Math.hypot(c.x - prev.x, c.z - prev.z) - SUPPLY_SIZE.depth).toBeGreaterThanOrEqual(0.25);
      expect(shipSolidAt(W(c).x, W(c).z, 0.1)).toBe(true);
      expect(walk(crateApproach(c), PLAYER_R), c.food).toBe(true);
      expect(Math.hypot(crateApproach(c).x - c.x, crateApproach(c).z - c.z)).toBeLessThan(1.7);
      for (const n of [-SUPPLY_SIZE.width / 2, 0, SUPPLY_SIZE.width / 2 + SUPPLY_SIZE.signDepth]) {
        for (const d of [-SUPPLY_SIZE.depth / 2, 0, SUPPLY_SIZE.depth / 2]) {
          const at = crateApproach(c, n);
          const x = at.x + Math.sin(c.yaw) * d, z = at.z + Math.cos(c.yaw) * d;
          const wallGap = x + hullHalf(z) - BULWARK_THICKNESS;
          expect(wallGap).toBeGreaterThan(0);
          if (n < 0) expect(wallGap).toBeLessThan(0.07);
          expect(SHIP_SOLIDS.some(b => b !== SUPPLY_SOLID && touches(b, x, z, 0))).toBe(false);
        }
      }
    }
  });

  it("keeps Pepper behind the counter, clear of the stove, and in talk range", () => {
    const p = SPOT.cook, s = COUNTER_CUSTOMER;
    expect(p.z + PLAYER_R).toBeLessThan(COUNTER_SOLID.z0);
    expect(s.z - PLAYER_R).toBeGreaterThan(COUNTER_SOLID.z1);
    expect(touches(COUNTER_SOLID, (p.x + s.x) / 2, SPOT.counter.z, 0)).toBe(true);
    expect(touches(STOVE_SOLID, p.x, p.z, PLAYER_R)).toBe(false);
    expect(walk(s, PLAYER_R)).toBe(true);
    expect(Math.hypot(s.x - p.x, s.z - p.z)).toBeLessThan(2.4);
  });

  it("every sail fills its mast from the boom up to the gaff", () => {
    for (const m of Object.values(MASTS)) {
      expect(sailHeight(m)).toBeGreaterThan(m.h * 0.55);
      expect(m.gaff).toBeLessThan(m.h);
    }
  });
});

describe("the enclosed cargo hold", () => {
  it("changes views only at the corresponding stair threshold", () => {
    resetVoyageRt();
    try {
      const x = (HOLD_RAMP.x0 + HOLD_RAMP.x1) / 2;
      const { enterZ, exitZ } = HOLD_PORTAL;
      const mid = (enterZ + exitZ) / 2;
      const locate = (z: number) => updateHoldView(SHIP.x + x, SHIP.z + z, true);
      expect(locate(mid)).toBe(false);
      expect(vy.inHold).toBe(false);
      expect(locate(enterZ - 0.01)).toBe(true);
      for (const z of [enterZ - 0.01, enterZ + 0.01, mid, exitZ - 0.01]) expect(locate(z)).toBe(false);
      expect(vy.inHold).toBe(true);
      const bill = W(SPOT.bill);
      expect(standY(bill.x, bill.z, [])).toBe(HOLD_Y);
      expect(locate(exitZ + 0.01)).toBe(true);
      for (const z of [exitZ + 0.01, exitZ - 0.01, mid, enterZ + 0.01]) expect(locate(z)).toBe(false);
      expect(vy.inHold).toBe(false);
      expect(standY(bill.x, bill.z, [])).toBe(DECK_Y);
    } finally {
      resetVoyageRt();
    }
  });

  it("keeps every floor item and furniture slot inside the room and reachable from the hold floor", () => {
    expect(HOLD_CEILING_Y - HOLD_Y).toBeGreaterThan(2.5);
    const placements: Array<Placement | null> = [null, { prep: "on", furniture: "table" }, { prep: "under", furniture: "table" },
      { prep: "on", furniture: "shelf" }, { prep: "under", furniture: "shelf" }, { prep: "in", furniture: "box" }, { prep: "by", furniture: "door" }];
    for (const item of ["barrel", "bag", "bottle"] as const) {
      for (const placement of placements) {
        const at = cargoSpot(item, placement);
        expect(at.x).toBeGreaterThan(HOLD.x0);
        expect(at.x).toBeLessThan(HOLD.x1);
        expect(at.z).toBeGreaterThan(HOLD.z0);
        expect(at.z).toBeLessThan(HOLD.z1);
        expect(at.y).toBeGreaterThanOrEqual(HOLD_Y);
        expect(at.y).toBeLessThan(HOLD_CEILING_Y);
        expect(shipFloorY(at.x, at.z, true)).toBe(HOLD_Y);
        if (!placement) expect(walk(at, PLAYER_R, true)).toBe(true);
        else {
          const target = SPOT[placement.furniture];
          const reachable = Array.from({ length: 16 }, (_, i) => {
            const a = i * Math.PI / 8;
            const stand = { x: target.x + 1.35 * Math.cos(a), z: target.z + 1.35 * Math.sin(a) };
            return walk(stand, PLAYER_R, true) && Math.hypot(stand.x - at.x, stand.z - at.z) < 3;
          });
          expect(reachable).toContain(true);
        }
      }
    }
  });
});
