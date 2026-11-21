import { describe, expect, it } from "vitest";
import { boatWakeIntensity } from "../game/world/gullBoat";
import { BoatWake, raftWakeIntensity, raftWakeSpeed } from "./BoatWake";

describe("raft wake", () => {
  it("draws nothing at rest even when the cloth is filled", () => {
    const wake = new BoatWake(true);
    expect(raftWakeSpeed(0.2)).toBe(0);
    const stopped = raftWakeIntensity(0, 1);
    expect(stopped).toBe(0);
    wake.update(0, 0, Math.PI, 0, -0.05, 0, 0.016, raftWakeIntensity(3, 1));
    expect(wake.geometry.drawRange.count).toBeGreaterThan(0);
    wake.update(0, 0, Math.PI, 0, 0, 0, 0.016, stopped);
    expect(wake.geometry.drawRange.count).toBe(0);
    wake.dispose();
  });

  it("gets stronger with speed and sail fill but stays below Gull's boat", () => {
    const slow = raftWakeSpeed(0.5), fast = raftWakeSpeed(0.9);
    expect(raftWakeIntensity(slow, 0)).toBeGreaterThan(0);
    expect(raftWakeIntensity(fast, 0)).toBeGreaterThan(raftWakeIntensity(slow, 0));
    expect(raftWakeIntensity(fast, 1)).toBeGreaterThan(raftWakeIntensity(fast, 0));
    expect(raftWakeIntensity(fast, 1)).toBeLessThan(boatWakeIntensity(fast, false));
  });
});
