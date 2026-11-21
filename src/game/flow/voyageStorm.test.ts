import { describe, expect, it } from "vitest";
import { SAIL_AIM } from "../voyageSim";
import { PLAYER_R } from "../world/collision";
import { DECK_Y, FISH_Y, shipFloorY, shipWalkable, shipWorld } from "../world/pirateShip";
import { BARREL_LANES, EMERGENCY_ROUTES, FALLEN_SPAR, PINNED, STORM_FIRES } from "./voyageStorm";

const hazards = [SAIL_AIM[1], FALLEN_SPAR, PINNED, ...STORM_FIRES.map(([x, z]) => ({ x, z }))];
const TASK_CLEARANCE = 0.9;

describe("storm panic staging", () => {
  it("keeps Bill out of the deck emergency routes", () => {
    expect(EMERGENCY_ROUTES).not.toHaveProperty("bill");
  });

  it.each(Object.entries(EMERGENCY_ROUTES))("keeps %s's whole run and station on open deck, away from the task targets", (_id, route) => {
    let from = route.start;
    for (const to of route.path) {
      const steps = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / .04);
      for (let i = 0; i <= steps; i++) {
        const k = i / steps;
        const x = from.x + (to.x - from.x) * k, z = from.z + (to.z - from.z) * k;
        const world = shipWorld({ x, z });
        const at = `local (${x.toFixed(2)}, ${z.toFixed(2)})`;
        expect(shipWalkable(world.x, world.z, PLAYER_R, false), at).toBe(true);
        expect([DECK_Y, FISH_Y], at).toContain(shipFloorY(x, z));
        // Preserve the middle aisle between the stern tasks and the forward spar approach.
        if (z >= -12 && z <= 10) expect(Math.abs(x), at).toBeGreaterThan(1.5);
        for (const target of hazards) {
          expect(Math.hypot(x - target.x, z - target.z), at).toBeGreaterThan(TASK_CLEARANCE);
        }
        for (const lane of BARREL_LANES) {
          const nearestX = Math.max(lane.x0, Math.min(lane.x1, x));
          expect(Math.hypot(x - nearestX, z - lane.z), at).toBeGreaterThan(TASK_CLEARANCE);
        }
      }
      from = to;
    }
  });
});
