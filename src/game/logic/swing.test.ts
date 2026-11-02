import { describe, expect, it } from "vitest";
import { SWING_DURATION, SWING_PULL, swingDirection, swingRadius, swingSweep } from "./swing";

describe("single enemy tether orbit", () => {
  it.each([10, 30, 60])("sweeps at least a full turn and ends on the aim at %i fps", fps => {
    for (const bearing of [-.4, 0, .4]) {
      const direction = swingDirection(bearing, 0);
      let sweep = 0;
      for (let age = 0; age < SWING_DURATION; age += 1 / fps) {
        const next = swingSweep(age, bearing, direction, 0, sweep);
        expect(next).toBeGreaterThanOrEqual(sweep);
        sweep = next;
      }
      sweep = swingSweep(SWING_DURATION, bearing, direction, 0, sweep);
      expect(sweep).toBeGreaterThanOrEqual(Math.PI * 2);
      expect(Math.sin(bearing + direction * sweep)).toBeCloseTo(0);
      expect(Math.cos(bearing + direction * sweep)).toBeCloseTo(1);
    }
  });

  it.each([10, 30, 60])("keeps one direction when the live aim turns at %i fps", fps => {
    let sweep = 0;
    for (let age = 0; age < SWING_DURATION; age += 1 / fps) {
      const next = swingSweep(age, .3, -1, age * 2, sweep);
      expect(next).toBeGreaterThanOrEqual(sweep);
      sweep = next;
    }
    sweep = swingSweep(SWING_DURATION, .3, -1, SWING_DURATION * 2, sweep);
    expect(sweep).toBeGreaterThanOrEqual(Math.PI * 2);
    expect(Math.sin(.3 - sweep)).toBeCloseTo(Math.sin(SWING_DURATION * 2));
  });

  it("pulls at the current bearing, accelerates and spirals in the last fifth", () => {
    expect(swingSweep(SWING_PULL, 0, 1, 0)).toBe(0);
    expect(swingRadius(0, 4, 1.2)).toBe(4);
    expect(swingRadius(SWING_PULL, 4, 1.2)).toBe(2.2);
    expect(swingRadius(.75, 4, 1.2)).toBe(2.2);
    expect(swingRadius(SWING_DURATION, 4, 1.2)).toBeCloseTo(3);
    expect(swingRadius(SWING_DURATION, 4, 3.1)).toBe(3.1);
    const quarter = SWING_PULL + (SWING_DURATION - SWING_PULL) / 4;
    const early = swingSweep(quarter, 0, 1, 0);
    const late = swingSweep(quarter * 2 - SWING_PULL, 0, 1, 0) - early;
    expect(late).toBeGreaterThan(early);
  });
});
