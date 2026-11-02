import { describe, expect, it } from "vitest";
import { createWindFrame, stepWindFrame, WIND_ATTACH_SECONDS, WIND_TAIL_SPEED } from "./wind";

describe("live beak gust", () => {
  const effect = { id: 1, t0: 0, yaw: 0, size: 5 };

  it("keeps the attached cone rooted on the live beak and grows its length", () => {
    const frame = createWindFrame();
    const beak = { x: 2, y: 1.4, z: 3 };
    expect(stepWindFrame(frame, effect, .07, beak, true)).toBe(frame);
    expect(frame.attached).toBe(true);
    expect(frame.drawn).toBe(true);
    expect([frame.x, frame.y, frame.z]).toEqual([2, 1.4, 3]);
    expect(frame.length).toBeCloseTo(2.5);
    beak.x = 4;
    stepWindFrame(frame, effect, .1, beak, true);
    expect(frame.x).toBe(4);
  });

  it.each([10, 30, 60])("interpolates release at the attachment boundary at %i fps", fps => {
    const frame = createWindFrame();
    const beak = { x: 0, y: 1, z: 0 };
    for (let tick = 0; tick / fps <= .3; tick++) {
      const now = tick / fps;
      beak.x = now * 3;
      beak.z = now * 4;
      stepWindFrame(frame, effect, now, beak, true);
    }
    expect(frame.released).toBe(true);
    expect(frame.releaseX).toBeCloseTo(.14 * 3);
    expect(frame.releaseZ).toBeCloseTo(.14 * 4);
    expect(frame.y).toBe(1);
  });

  it("advances the released tail at 12 m/s without following a moving or turning beak", () => {
    const frame = createWindFrame();
    const beak = { x: 2, y: 1, z: 3 };
    stepWindFrame(frame, effect, .1, beak, true);
    stepWindFrame(frame, effect, .14, beak, true);
    const releasedZ = frame.z;
    beak.x = -100;
    beak.z = -100;
    stepWindFrame(frame, { ...effect, yaw: Math.PI }, .24, beak, true);
    expect(frame.attached).toBe(false);
    expect(frame.x).toBe(2);
    expect(frame.z - releasedZ).toBeCloseTo(WIND_TAIL_SPEED * .1);
    expect(frame.length).toBeCloseTo(5 - WIND_TAIL_SPEED * .1);
    stepWindFrame(frame, effect, WIND_ATTACH_SECONDS + effect.size / WIND_TAIL_SPEED, beak, true);
    expect(frame.drawn).toBe(false);
    expect(frame.length).toBe(0);
  });

  it("draws nothing for an invalid anchor during either phase", () => {
    const frame = createWindFrame();
    const beak = { x: 2, y: 1, z: 3 };
    stepWindFrame(frame, effect, .07, beak, true);
    stepWindFrame(frame, effect, .1, beak, false);
    expect(frame.drawn).toBe(false);
    expect(frame.length).toBe(0);
    stepWindFrame(frame, effect, .2, beak, false);
    expect(frame.drawn).toBe(false);
    expect(frame.length).toBe(0);
  });

  it("resets a reused record for a later blast at the new beak", () => {
    const frame = createWindFrame();
    const beak = { x: 2, y: 1, z: 3 };
    stepWindFrame(frame, effect, .2, beak, true);
    beak.x = 20;
    beak.z = 30;
    stepWindFrame(frame, { id: 2, t0: 1, yaw: Math.PI / 2, size: 6.5 }, 1.07, beak, true);
    expect(frame.released).toBe(false);
    expect(frame.attached).toBe(true);
    expect(frame.yaw).toBe(Math.PI / 2);
    expect(frame.x).toBe(20);
    expect(frame.z).toBe(30);
    expect(frame.length).toBeCloseTo(3.25);
  });
});
