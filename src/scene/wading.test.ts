import { describe, expect, it } from "vitest";
import { wadingStep, wadingTrack } from "./wading";

describe("pooled wading footsteps", () => {
  it("emits alternating steps after distance travelled, including a cheap enemy cadence", () => {
    const player = wadingTrack(), enemy = wadingTrack();
    expect(wadingStep(player, 0, 0, 0, true)).toBe(false);
    expect(wadingStep(player, .4, 0, .15, true)).toBe(false);
    expect(wadingStep(player, .8, 0, .3, true)).toBe(true);
    expect(player.side).toBe(-1);
    expect(wadingStep(player, 1.6, 0, .6, true)).toBe(true);
    expect(player.side).toBe(1);
    wadingStep(enemy, 0, 0, 0, true, .9, .38);
    expect(wadingStep(enemy, .8, 0, .3, true, .9, .38)).toBe(false);
    expect(wadingStep(enemy, 1, 0, .4, true, .9, .38)).toBe(true);
    expect(wadingStep(enemy, 2, 0, .6, true, .9, .38)).toBe(false);
  });

  it("never splashes while stationary, dry, teleported, or after the clock resets", () => {
    const track = wadingTrack();
    wadingStep(track, 0, 0, 10, true);
    expect(wadingStep(track, 1, 0, 11, true)).toBe(true);
    expect(wadingStep(track, 1, 0, 12, true)).toBe(false);
    expect(wadingStep(track, 2, 0, 13, false)).toBe(false);
    expect(wadingStep(track, 3, 0, 14, true)).toBe(true);
    expect(wadingStep(track, 30, 0, 15, true)).toBe(false);
    expect(wadingStep(track, 31, 0, 0, true)).toBe(false);
  });
});
