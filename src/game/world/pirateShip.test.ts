import { describe, expect, it } from "vitest";
import { DECK_Y, FISH_Y, HOLD_Y, SHIP, SPOT, inShipArea, shipFloorY, shipStandY, shipWalkable, shipWorld } from "./pirateShip";
import { isWalkable, standY } from "./collision";

const R = 0.32;
const W = (p: { x: number; z: number }) => shipWorld(p);

describe("the pirate ship's decks (docs/PIRATE_VOYAGE.md §2)", () => {
  it("every place a person stands is walkable, at its deck's height", () => {
    const people = [SPOT.boardDeck, SPOT.captain, SPOT.gull, SPOT.cook, SPOT.bill, SPOT.finn, ...SPOT.crew];
    for (const p of people) {
      const w = W(p);
      expect(shipWalkable(w.x, w.z, R), JSON.stringify(p)).toBe(true);
    }
    expect(shipStandY(W(SPOT.boardDeck).x, W(SPOT.boardDeck).z)).toBeCloseTo(DECK_Y, 6);
    expect(shipStandY(W(SPOT.bill).x, W(SPOT.bill).z)).toBeCloseTo(HOLD_Y, 6);
    expect(shipStandY(W(SPOT.finn).x, W(SPOT.finn).z)).toBeCloseTo(FISH_Y, 6);
  });

  it("the sea, the rails, the masts and the furniture are not walkable", () => {
    for (const p of [{ x: 6, z: 0 }, { x: 0, z: 22 }, { x: 0, z: -22 }, { x: 4.4, z: 0 }]) expect(shipWalkable(W(p).x, W(p).z, 0), JSON.stringify(p)).toBe(false);
    for (const p of [SPOT.mainMast, SPOT.helm, SPOT.table, SPOT.stove, { x: 3, z: -4 }, { x: 0, z: -8 }]) expect(shipWalkable(W(p).x, W(p).z, R), JSON.stringify(p)).toBe(false);
  });

  it("the hold is reached only down its ramp, and the ramp has no step", () => {
    // Straight across the hold's rail from the main deck: blocked.
    for (let x = -1; x <= 2; x += 0.5) expect(shipWalkable(W({ x, z: -0.95 }).x, W({ x, z: -0.95 }).z, R)).toBe(false);
    // Down the ramp: walkable all the way, heights within a step of each other.
    let last = shipFloorY(-2.25, 2.4)!;
    for (let z = 2.4; z >= -3; z -= 0.1) {
      const w = W({ x: -2.25, z });
      expect(shipWalkable(w.x, w.z, 0.25), `z ${z.toFixed(1)}`).toBe(true);
      const y = shipFloorY(-2.25, z)!;
      expect(Math.abs(y - last)).toBeLessThan(0.1);
      last = y;
    }
    expect(last).toBeCloseTo(HOLD_Y, 6);
  });

  it("the stern stairs lead down to the fishing deck", () => {
    let last = shipFloorY(2.5, 11.5)!;
    for (let z = 11.5; z <= 17; z += 0.1) {
      const w = W({ x: 2.5, z });
      expect(shipWalkable(w.x, w.z, 0.25), `z ${z.toFixed(1)}`).toBe(true);
      const y = shipFloorY(2.5, z)!;
      expect(Math.abs(y - last)).toBeLessThan(0.1);
      last = y;
    }
    expect(last).toBeCloseTo(FISH_Y, 6);
  });

  it("the galley is entered through its door only", () => {
    expect(shipWalkable(W({ x: 0, z: -13 }).x, W({ x: 0, z: -13 }).z, R)).toBe(true);
    expect(shipWalkable(W({ x: -2.5, z: -13 }).x, W({ x: -2.5, z: -13 }).z, R)).toBe(false);
  });

  it("the game's collision and heights use the ship inside its area only", () => {
    const deck = W(SPOT.boardDeck);
    expect(inShipArea(deck.x, deck.z)).toBe(true);
    expect(inShipArea(SHIP.x, SHIP.z + 40)).toBe(false);
    expect(isWalkable(deck.x, deck.z, { solved: [], act2: true }, R)).toBe(true);
    expect(isWalkable(deck.x + 6, deck.z, { solved: [], act2: true }, R)).toBe(false);
    expect(standY(deck.x, deck.z, [])).toBeCloseTo(DECK_Y, 6);
  });
});
