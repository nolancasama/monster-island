import { describe, expect, it } from "vitest";
import { whipPoints } from "./whip";

describe("live whip curve", () => {
  const root = { x: .25, y: 1.25, z: -.5 };
  const tip = { x: 0, y: .5, z: 4 };
  const facing = { x: 0, z: 1 };

  it("fills the supplied array and keeps the moving root exact at every phase", () => {
    const out = new Float32Array(19 * 3);
    for (const phase of [0, .07, .15, .24, .4, .5]) {
      out.fill(NaN);
      expect(whipPoints(out, 19, root, tip, facing, phase, .3)).toBe(out);
      expect(Array.from(out.slice(0, 3))).toEqual([root.x, root.y, root.z]);
      expect(out.every(Number.isFinite)).toBe(true);
    }
    const moved = { x: 2, y: 2, z: 3 };
    whipPoints(out, 19, moved, tip, facing, .12, 0);
    expect(Array.from(out.slice(0, 3))).toEqual([2, 2, 3]);
  });

  it("reaches the supplied target exactly at the snap", () => {
    const out = new Float32Array(19 * 3);
    whipPoints(out, 19, root, tip, facing, .15, 0);
    expect(Array.from(out.slice(-3))).toEqual([tip.x, tip.y, tip.z]);
  });

  it("reduces curve amplitude under tension while retaining a bow", () => {
    const loose = new Float32Array(19 * 3), taut = new Float32Array(19 * 3);
    whipPoints(loose, 19, root, tip, facing, .15, 0);
    whipPoints(taut, 19, root, tip, facing, .15, 1);
    let looseDeviation = 0, tautDeviation = 0;
    for (let i = 1; i < 18; i++) {
      const t = i / 18, j = i * 3;
      const x = root.x + (tip.x - root.x) * t;
      const y = root.y + (tip.y - root.y) * t;
      const z = root.z + (tip.z - root.z) * t;
      looseDeviation += Math.hypot(loose[j] - x, loose[j + 1] - y, loose[j + 2] - z);
      tautDeviation += Math.hypot(taut[j] - x, taut[j + 1] - y, taut[j + 2] - z);
    }
    expect(tautDeviation).toBeLessThan(looseDeviation * .4);
    expect(tautDeviation).toBeGreaterThan(.1);
  });

  it("rises above the player's head before passing forward from the perch", () => {
    const out = new Float32Array(19 * 3);
    whipPoints(out, 19, root, tip, facing, .15, 0);
    const pastHead = 2 * 3;
    expect(out[pastHead + 2]).toBeGreaterThan(0);
    expect(out[pastHead + 1]).toBeGreaterThan(1.6);
  });

  it("clears the head when a taut right-hand strand crosses to a left-side target", () => {
    const out = new Float32Array(19 * 3);
    // Actual scale-.5 perch and fully lifted arm put the hand just above 1.1 m.
    const perchedHand = { x: .287, y: 1.10, z: -.415 };
    whipPoints(out, 19, perchedHand, { x: -1, y: .5, z: 2 }, facing, .3, 1);
    let checked = 0;
    for (let i = 1; i < 18; i++) {
      const j = i * 3;
      if (Math.abs(out[j + 2]) < .1 && Math.abs(out[j]) < .22) {
        expect(out[j + 1]).toBeGreaterThan(1.55);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
