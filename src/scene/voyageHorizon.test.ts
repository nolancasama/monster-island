import { describe, expect, it } from "vitest";
import { BOAT_OUT, BOAT_OUT_START } from "../game/flow/voyageEncounter";
import { BASIN, GULL_BERTH } from "../game/world/lowland";
import { SHIP } from "../game/world/pirateShip";
import { homeSceneryVisible, openSeaFactor } from "./voyageHorizon";

const departure = { sea: true, active: false, boatMoored: false };
const riding = (z: number) => ({ active: true, z });
const outbound = (z: number, lens = z) => openSeaFactor("home", departure, riding(z), lens);

describe("the voyage horizon", () => {
  it("leaves the island and the departure view fully visible", () => {
    expect(openSeaFactor("home", { ...departure, sea: false }, riding(SHIP.z), SHIP.z)).toBe(0);
    expect(outbound(GULL_BERTH.z, GULL_BERTH.z - 18)).toBe(0);
  });

  it("thickens monotonically along the outbound route and clears the coast before the sighting", () => {
    const factors = Array.from({ length: 21 }, (_, i) => {
      const z = BOAT_OUT.at(BOAT_OUT.length * i / 20).z;
      return outbound(z, z + 6);
    });
    expect(factors[0]).toBeGreaterThan(0);
    expect(factors.some(value => value > 0 && value < 1)).toBe(true);
    expect(factors).toEqual([...factors].sort((a, b) => a - b));
    expect(factors.at(-2)).toBe(1);
    expect(factors.at(-1)).toBe(1);
    expect(outbound(BOAT_OUT_START.z)).toBeLessThan(outbound(BASIN.z0 - 60));
  });

  it("responds to lens distance without a camera swing skipping the fade", () => {
    const z = BASIN.z0 - 45;
    expect(outbound(z, z + 6)).toBeLessThan(outbound(z));
    expect(outbound(z, z - 6)).toBeGreaterThan(outbound(z));
    expect(outbound(z, z - 100)).toBe(outbound(z, z - 6));
  });

  it("hides home scenery from first sighting through the chase, capture, jobs, storm and raft", () => {
    const berth = riding(GULL_BERTH.z);
    expect(openSeaFactor("home", { ...departure, active: true }, berth, berth.z)).toBe(1);
    expect(openSeaFactor("home", { ...departure, boatMoored: true }, berth, berth.z)).toBe(1);
    const offBoat = { active: false, z: SHIP.z };
    expect(openSeaFactor("home", { ...departure, active: true }, offBoat, SHIP.z)).toBe(1);
    expect(openSeaFactor("home", departure, offBoat, SHIP.z)).toBe(1);
  });

  it("restores scenery after leaving the sea or changing worlds", () => {
    const aboard = { ...departure, active: true, boatMoored: true };
    const boat = { active: false, z: SHIP.z };
    const atSea = openSeaFactor("home", aboard, boat, SHIP.z);
    const backHome = openSeaFactor("home", { ...aboard, sea: false }, boat, SHIP.z);
    expect(atSea).toBe(1);
    expect(backHome).toBe(0);
    expect(openSeaFactor("cloud", aboard, boat, SHIP.z)).toBe(0);
    expect(homeSceneryVisible(atSea)).toBe(false);
    expect(homeSceneryVisible(backHome)).toBe(true);
    expect(homeSceneryVisible(0.999)).toBe(true);
  });
});
