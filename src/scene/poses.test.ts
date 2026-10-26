import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { HIP_Y, SEATED, squatAmount, squatPose } from "./poses";
import { KNEE_Y } from "./models/people";
import { BUBBO_SEAT } from "../game/ride";

const SOLE = HIP_Y - 0.02;

/** Sole position in the root frame for a squat pose (body leaned about the hip). */
function soleOf(c: number) {
  const p = squatPose(c);
  const hip = new THREE.Vector3(0, HIP_Y - p.drop, 0);
  const world = new THREE.Quaternion().setFromEuler(new THREE.Euler(p.lean + p.thigh, 0, 0));
  const knee = hip.clone().add(new THREE.Vector3(0, KNEE_Y, 0).applyQuaternion(world));
  const shin = world.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(p.knee, 0, 0)));
  return { knee, sole: knee.clone().add(new THREE.Vector3(0, -(SOLE + KNEE_Y), 0).applyQuaternion(shin)) };
}

describe("pickup squat", () => {
  it("keeps both feet planted under the hips while the knees bend", () => {
    for (const c of [0, 0.25, 0.5, 0.75, 1]) {
      const { knee, sole } = soleOf(c);
      expect(Math.abs(sole.z), `c=${c}`).toBeLessThan(0.01);
      expect(Math.abs(sole.y - (HIP_Y - SOLE)), `c=${c}`).toBeLessThan(0.01);
      // Knees come forward as the hips lower; they never bend backwards.
      if (c > 0) expect(knee.z).toBeGreaterThan(0.02);
    }
  });

  it("lowers the hips a moderate amount with a slight lean", () => {
    const deep = squatPose(1);
    expect(deep.drop).toBeGreaterThan(0.15);
    expect(deep.drop).toBeLessThan(0.3);
    expect(deep.lean).toBeLessThan(0.5);
  });

  it("goes down, holds briefly and comes back up within the pick time", () => {
    const total = 0.7;
    expect(squatAmount(0, total)).toBe(0);
    expect(squatAmount(0.3, total)).toBe(1);
    expect(squatAmount(total, total)).toBe(0);
    expect(squatAmount(0.1, total)).toBeGreaterThan(0);
    expect(squatAmount(0.6, total)).toBeLessThan(1);
  });
});

describe("riding Bubbo", () => {
  // Bubbo's body ellipsoid and eye bulges (models/monsters.ts bubboParts).
  const inside = (p: THREE.Vector3, c: number[], r: number[], pad: number) =>
    ((p.x - c[0]) / (r[0] + pad)) ** 2 + ((p.y - c[1]) / (r[1] + pad)) ** 2 + ((p.z - c[2]) / (r[2] + pad)) ** 2 < 1;
  const hits = (p: THREE.Vector3, pad: number) =>
    inside(p, [0, 0.42, 0], [0.575, 0.377, 0.529], pad) || [-1, 1].some((s) => inside(p, [s * 0.2, 0.72, 0.22], [0.12, 0.108, 0.12], pad));

  it("the seated legs straddle Bubbo without passing through his body or eyes", () => {
    for (const side of [-1, 1]) {
      // Player root = saddle point; body group drops by SEATED.drop.
      const hip = new THREE.Vector3(side * 0.09, HIP_Y - SEATED.drop + BUBBO_SEAT.up, -BUBBO_SEAT.back);
      // Left leg uses SEATED as written; the right leg mirrors y and z.
      const fixed = new THREE.Quaternion().setFromEuler(new THREE.Euler(SEATED.thigh.x, side < 0 ? SEATED.thigh.y : -SEATED.thigh.y, side < 0 ? SEATED.thigh.z : -SEATED.thigh.z));
      const knee = hip.clone().add(new THREE.Vector3(0, KNEE_Y, 0).applyQuaternion(fixed));
      const shin = fixed.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(SEATED.knee, 0, 0)));
      for (let t = 0.5; t <= 1; t += 0.1) expect(hits(hip.clone().lerp(knee, t), 0.07), `thigh ${side} ${t}`).toBe(false);
      for (let t = 0; t <= 1; t += 0.1) expect(hits(knee.clone().add(new THREE.Vector3(0, -0.22 * t, 0.04 * t).applyQuaternion(shin)), 0.07), `shin ${side} ${t}`).toBe(false);
    }
  });

  it("the seat rests on top of Bubbo's back", () => {
    const top = 0.42 + 0.377 * Math.sqrt(1 - (BUBBO_SEAT.back / 0.529) ** 2);
    expect(BUBBO_SEAT.up).toBeGreaterThanOrEqual(top);
    expect(BUBBO_SEAT.up - top).toBeLessThan(0.06);
  });
});
