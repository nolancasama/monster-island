import { describe, expect, it } from "vitest";
import { DEBUG_DESTINATIONS, progressForDestination } from "./debugProgress";
import { debugDestinationGates, destinationForDebugPoint } from "./debugTravel";
import { newProgress } from "./progress";
import { gatesOf, isWalkable, PLAYER_R } from "../world/collision";
import { SPAWN } from "../world/island";

describe("debug teleport story selection", () => {
  it("keeps current progress for ground that is already walkable", () => {
    const gates = gatesOf(newProgress());
    expect(isWalkable(SPAWN.x, SPAWN.z, gates, PLAYER_R)).toBe(true);
    expect(destinationForDebugPoint(SPAWN.x, SPAWN.z, "home", gates)).toBeUndefined();

    const later = gatesOf(progressForDestination("fernCamp"));
    expect(destinationForDebugPoint(76, -184.5, "home", later)).toBeUndefined();
  });

  it("opens the forest with its earliest story point", () => {
    const gates = gatesOf(newProgress());
    expect(isWalkable(33.8, -13, gates, PLAYER_R)).toBe(false);
    expect(destinationForDebugPoint(33.8, -13, "home", gates)?.id).toBe("cliff");
  });

  it("uses prerequisite gates rather than the destination's own location", () => {
    const gates = gatesOf(newProgress());
    expect(isWalkable(35, -58, gatesOf(progressForDestination("volcano")), PLAYER_R)).toBe(false);
    expect(destinationForDebugPoint(35, -58, "home", gates)?.id).toBe("courtyard");
  });

  it("breaks equal-step ties by destination list order", () => {
    const gates = gatesOf(newProgress());
    expect(isWalkable(76, -184.5, gates, PLAYER_R)).toBe(false);
    expect(isWalkable(76, -184.5, gatesOf(progressForDestination("ropeFoot")), PLAYER_R)).toBe(false);
    expect(destinationForDebugPoint(76, -184.5, "home", gates)?.id).toBe("fernCamp");
  });

  it("selects a cloud destination that opens the summit gates", () => {
    const gates = gatesOf(progressForDestination("cloud:cloudDock"));
    expect(isWalkable(0, 160, gates, PLAYER_R)).toBe(false);
    expect(destinationForDebugPoint(0, 160, "cloud", gates)?.id).toBe("cloud:stormBeacon");
    expect(destinationForDebugPoint(0, 160, "home", gates)).toBeUndefined();
  });

  it("returns no story change when no destination makes the point walkable", () => {
    const gates = gatesOf(newProgress());
    expect(destinationForDebugPoint(-1000, -1000, "home", gates)).toBeUndefined();
    expect(destinationForDebugPoint(Number.NaN, 0, "home", gates)).toBeUndefined();
  });

  it("caches per-world gates in step order with stable list-order ties", () => {
    for (const world of ["home", "cloud"] as const) {
      const entries = debugDestinationGates(world);
      expect(debugDestinationGates(world)).toBe(entries);
      expect(entries.map(entry => entry.destination)).toEqual(
        DEBUG_DESTINATIONS.filter(destination => destination.world === world)
          .sort((a, b) => a.step - b.step)
      );
      for (const { destination, gates } of entries) {
        expect(gates).toEqual(gatesOf(progressForDestination(destination.id)));
      }
    }
  });
});
