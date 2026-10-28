import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { EMBER_TAIL_RIDE, HIP_Y, SEATED_EMBER } from "./poses";
import { KNEE_Y } from "./models/people";
import { RIDE_SEAT } from "../game/combat";

/**
 * Riding Ember (Act 2): Ember is upright with a big head, so the rider sits
 * piggyback against its back, legs round its sides. Checked against Ember's
 * body, belly, head and arm shapes (models/monsters.ts emberParts) and its
 * tail swung back while carrying the rider.
 */
const inside = (p: THREE.Vector3, c: number[], r: number[], pad: number) =>
  ((p.x - c[0]) / (r[0] + pad)) ** 2 + ((p.y - c[1]) / (r[1] + pad)) ** 2 + ((p.z - c[2]) / (r[2] + pad)) ** 2 < 1;
const ember = (p: THREE.Vector3, pad: number) =>
  inside(p, [0, 0.72, -0.05], [0.53, 0.604, 0.477], pad) ||
  inside(p, [0, 1.3, 0.03], [0.39, 0.351, 0.351], pad) ||
  [-1, 1].some((s) => inside(p, [s * 0.48, 0.85, 0.09], [0.091, 0.169, 0.104], pad));
/** The tail, swung by EMBER_TAIL_RIDE about its pivot (0, 0.49, -0.42). */
const tailPoints = (yaw: number) => {
  const pts: THREE.Vector3[] = [];
  const a = new THREE.Vector3(0, 0, 0), b = new THREE.Vector3(0.48, 0.04, -0.42), c = new THREE.Vector3(0.78, 0.38, -0.45);
  const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
  for (let t = 0; t <= 1; t += 0.1) pts.push(a.clone().lerp(b, t).applyQuaternion(rot).add(new THREE.Vector3(0, 0.49, -0.42)));
  for (let t = 0; t <= 1; t += 0.2) pts.push(b.clone().lerp(c, t).applyQuaternion(rot).add(new THREE.Vector3(0, 0.49, -0.42)));
  return pts;
};

describe("riding Ember", () => {
  const seat = RIDE_SEAT.ember;
  const limbs = () => {
    const out: Array<{ p: THREE.Vector3; label: string }> = [];
    for (const side of [-1, 1]) {
      const hip = new THREE.Vector3(side * 0.09, HIP_Y - SEATED_EMBER.drop + seat.up, -seat.back);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(SEATED_EMBER.thigh.x, side < 0 ? SEATED_EMBER.thigh.y : -SEATED_EMBER.thigh.y, side < 0 ? SEATED_EMBER.thigh.z : -SEATED_EMBER.thigh.z));
      const knee = hip.clone().add(new THREE.Vector3(0, KNEE_Y, 0).applyQuaternion(q));
      const shin = q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(SEATED_EMBER.knee, 0, 0)));
      for (let t = 0.5; t <= 1; t += 0.1) out.push({ p: hip.clone().lerp(knee, t), label: `thigh ${side} ${t.toFixed(1)}` });
      for (let t = 0; t <= 1; t += 0.1) out.push({ p: knee.clone().add(new THREE.Vector3(0, -0.22 * t, 0.04 * t).applyQuaternion(shin)), label: `shin ${side} ${t.toFixed(1)}` });
    }
    return out;
  };

  it("the legs go round Ember's body without passing through it", () => {
    for (const { p, label } of limbs()) expect(ember(p, 0.07), label).toBe(false);
  });

  it("the swung-back tail stays clear of the rider's legs", () => {
    const legs = limbs();
    for (const t of tailPoints(EMBER_TAIL_RIDE)) for (const { p, label } of legs) expect(t.distanceTo(p), label).toBeGreaterThan(0.22);
  });

  it("the rider's chest is against Ember's back, not inside it, and the head is clear of Ember's head", () => {
    const root = new THREE.Vector3(0, seat.up, -seat.back);
    // Torso capsule front (radius 0.164 in depth), 0.1 to 0.55 above the hips.
    for (let h = 0.1; h <= 0.55; h += 0.05) {
      const p = root.clone().add(new THREE.Vector3(0, HIP_Y - SEATED_EMBER.drop + h, 0.164 + h * Math.sin(SEATED_EMBER.lean)));
      expect(ember(p, 0.01), `chest ${h.toFixed(2)}`).toBe(false);
    }
    const head = root.clone().add(new THREE.Vector3(0, 1.3 - SEATED_EMBER.drop, 0.21));
    expect(ember(head, 0.02)).toBe(false);
  });
});
