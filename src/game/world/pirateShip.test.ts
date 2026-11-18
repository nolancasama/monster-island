import { describe, expect, it } from "vitest";
import {
  BEAM, BUCKET, CANNONS, DECK_BARRELS, DECK_Y, FISH_DECK, FISH_Y, HALF_BEAM, HOLD, HOLD_RAMP, HOLD_STAIRS, HOLD_Y, MASTS, MESS, SHIP, SPOT, STERN_RAMP, STERN_STAIRS, SUPPLY_CRATES,
  hullHalf, inShipArea, sailHeight, shipFloorY, shipSolidAt, shipStandY, shipWalkable, shipWorld,
} from "./pirateShip";
import { PLAYER_R, isWalkable, standY } from "./collision";

const R = 0.32;
const W = (p: { x: number; z: number }) => shipWorld(p);
const walk = (p: { x: number; z: number }, r = R) => shipWalkable(W(p).x, W(p).z, r);

describe("the pirate ship's decks (docs/PIRATE_VOYAGE.md §2)", () => {
  it("every place a person stands is walkable, at its deck's height", () => {
    const people = [SPOT.boardDeck, SPOT.captain, SPOT.gull, SPOT.cook, SPOT.bill, SPOT.finn, ...SPOT.crew, SPOT.fishing];
    for (const p of people) expect(walk(p), JSON.stringify(p)).toBe(true);
    expect(shipStandY(W(SPOT.boardDeck).x, W(SPOT.boardDeck).z)).toBeCloseTo(DECK_Y, 6);
    expect(shipStandY(W(SPOT.bill).x, W(SPOT.bill).z)).toBeCloseTo(HOLD_Y, 6);
    expect(shipStandY(W(SPOT.finn).x, W(SPOT.finn).z)).toBeCloseTo(FISH_Y, 6);
  });

  it("the sea, the rails, the masts and the furniture are not walkable", () => {
    for (const p of [{ x: HALF_BEAM + 0.2, z: 0 }, { x: 0, z: 22 }, { x: 0, z: -22 }, { x: HALF_BEAM - 0.1, z: 0 }]) expect(walk(p, 0), JSON.stringify(p)).toBe(false);
    for (const p of [SPOT.mainMast, SPOT.helm, SPOT.table, SPOT.stove, SPOT.counter, SPOT.supplies, MESS, BUCKET, { x: HOLD.x1 + 0.2, z: -4 }, { x: 0, z: -8 }])
      expect(walk(p), JSON.stringify(p)).toBe(false);
  });

  it("guards the hold rim beyond the stair entrance", () => {
    for (let x = HOLD_RAMP.x1 + 0.5; x <= HOLD.x1; x += 0.5) expect(walk({ x, z: HOLD.z1 })).toBe(false);
  });

  it.each([
    { name: "hold", ramp: HOLD_RAMP, stairs: HOLD_STAIRS, y0: HOLD_Y, y1: DECK_Y },
    { name: "stern", ramp: STERN_RAMP, stairs: STERN_STAIRS, y0: DECK_Y, y1: FISH_Y },
  ])("keeps the $name stairs walkable with flat landings and guarded sides", ({ ramp, stairs, y0, y1 }) => {
    const x = (ramp.x0 + ramp.x1) / 2;
    expect(ramp.x1 - ramp.x0).toBeGreaterThanOrEqual(2 * PLAYER_R + 0.2);
    const endpoints = [ramp.z0 - 0.5, ramp.z1 + 0.5];
    for (const [start, end] of [endpoints, [...endpoints].reverse()]) {
      let last = shipFloorY(x, start)!;
      for (let i = 0; i <= 100; i++) {
        const z = start + (end - start) * i / 100;
        expect(walk({ x, z }, PLAYER_R), `z ${z.toFixed(2)}`).toBe(true);
        const y = shipFloorY(x, z)!;
        expect(Math.abs(y - last)).toBeLessThan(0.05);
        last = y;
      }
    }
    expect(shipFloorY(x, ramp.z0 - 0.5)).toBeCloseTo(y0, 6);
    expect(shipFloorY(x, stairs.slopeStart)).toBeCloseTo(y0, 6);
    expect(shipFloorY(x, stairs.slopeEnd)).toBeCloseTo(y1, 6);
    expect(shipFloorY(x, ramp.z1 + 0.5)).toBeCloseTo(y1, 6);
    for (const { z0, z1, y } of stairs.steps) {
      // Height is monotonic between tread edges, so these bound the error.
      for (const z of [z0, z1]) expect(Math.abs(shipFloorY(x, z)! - y)).toBeLessThanOrEqual(0.06 + 1e-9);
      for (const edge of [ramp.x0, ramp.x1]) expect(walk({ x: edge, z: (z0 + z1) / 2 }, PLAYER_R)).toBe(false);
    }
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
    for (const c of SUPPLY_CRATES) {
      expect(shipSolidAt(W(c).x, W(c).z, 0.1)).toBe(true);
      expect(walk({ x: c.x + 1.15, z: c.z }), JSON.stringify(c)).toBe(true);
    }
  });

  it("every sail fills its mast from the boom up to the gaff", () => {
    for (const m of Object.values(MASTS)) {
      expect(sailHeight(m)).toBeGreaterThan(m.h * 0.55);
      expect(m.gaff).toBeLessThan(m.h);
    }
  });
});
