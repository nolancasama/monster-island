import * as THREE from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RIDE_SEAT, cb, mountMotion, resetCombat } from "./combat";
import { seatOffset, type MountMotion } from "./ride";
import { newProgress } from "./logic/progress";
import { setGame } from "./store";
import { rt } from "./runtime";
import { region } from "./world/region";

vi.mock("../audio/audio", () => ({ audio: { play: vi.fn(), voice: vi.fn(), startMusic: vi.fn(), cancelPanic: vi.fn(), stopFlame: vi.fn() } }));

/** The scene's rig for a ridden friend (scene/Monsters): body group at its centre, rig child moved by the motion. */
function seatInWorld(m: MountMotion, seat: { up: number; back: number }, centre: THREE.Vector3, yaw: number) {
  const body = new THREE.Group(), rig = new THREE.Group(), mark = new THREE.Object3D();
  body.position.copy(centre); body.rotation.y = yaw;
  rig.position.y = m.bob; rig.rotation.set(m.pitch, 0, m.roll); rig.scale.set(1 / Math.sqrt(m.squash), m.squash, 1 / Math.sqrt(m.squash));
  mark.position.set(0, seat.up, -seat.back);
  body.add(rig); rig.add(mark);
  body.updateMatrixWorld(true);
  return mark.getWorldPosition(new THREE.Vector3());
}

describe("the rider moves with the ridden friend's body", () => {
  it.each([
    { bob: 0.07, roll: 0.1, pitch: 0, squash: 1 },
    { bob: 0.04, roll: -0.08, pitch: 0.16, squash: 1.03 },
    { bob: -0.05, roll: 0.2, pitch: -0.05, squash: 0.97 },
  ])("the seat point and the rider's offset agree for %j", (m) => {
    for (const friend of ["bubbo", "ember"] as const) for (const yaw of [0, 1.1, -2.4, Math.PI]) {
      const seat = RIDE_SEAT[friend];
      // The rider sits `back` behind the friend's centre, `up` above its root.
      const rider = new THREE.Vector3(3, 0, -5), fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      const centre = rider.clone().addScaledVector(fwd, seat.back);
      const still = seatInWorld({ bob: 0, roll: 0, pitch: 0, squash: 1 }, seat, centre, yaw);
      expect(still.distanceTo(new THREE.Vector3(rider.x, seat.up, rider.z))).toBeLessThan(1e-9);
      const moved = seatInWorld(m, seat, centre, yaw), off = seatOffset(m, seat, yaw);
      expect(moved.x).toBeCloseTo(rider.x + off.x, 9);
      expect(moved.y).toBeCloseTo(seat.up + off.y, 9);
      expect(moved.z).toBeCloseTo(rider.z + off.z, 9);
    }
  });
});

describe("the ridden friend's motion", () => {
  beforeEach(() => {
    const p = newProgress();
    p.act2.started = true; p.active = "bubbo";
    setGame({ screen: "game", mode: "explore", progress: p });
    region.world = "home";
    rt.time = rt.playTime = 10;
    resetCombat();
    Object.assign(rt.player, { x: 0, z: 0, y: 1, yaw: 0, speed: 0, step: 0 });
    cb.stance.friend = "bubbo"; cb.stance.k = 1;
  });

  it("nothing moves when no friend is ridden (the perched friends and walking)", () => {
    cb.stance.friend = "leafy";
    expect(mountMotion()).toEqual({ bob: 0, roll: 0, pitch: 0, squash: 1 });
    cb.stance.friend = null;
    expect(mountMotion()).toEqual({ bob: 0, roll: 0, pitch: 0, squash: 1 });
  });

  it("standing still is a gentle breath; running is a stride (Bubbo rocks, Ember gallops)", () => {
    const still = mountMotion();
    expect(Math.abs(still.bob)).toBeLessThan(0.02);
    expect(Math.abs(still.roll)).toBeLessThan(1e-9);
    Object.assign(rt.player, { speed: 4, step: 0.5 });
    const bubbo = mountMotion();
    expect(bubbo.bob).toBeGreaterThan(0.05);
    expect(Math.abs(bubbo.roll)).toBeGreaterThan(0.08);
    cb.stance.friend = "ember";
    rt.player.step = 0.25;
    const ember = mountMotion();
    expect(ember.bob).toBeGreaterThan(0.05);
    expect(Math.abs(ember.pitch)).toBeGreaterThan(0.04);
    // Subtle, never a shake: every angle stays small.
    for (const m of [bubbo, ember]) for (const a of [m.roll, m.pitch]) expect(Math.abs(a)).toBeLessThanOrEqual(0.22);
  });

  it("the friend's own attack leans it in; a hit on the rider jolts it", () => {
    cb.move = { friend: "bubbo", kind: "special", t0: rt.time - 0.35, tx: 0, tz: 5 };
    expect(mountMotion().pitch).toBeGreaterThan(0.12);
    cb.move = null;
    cb.hurtT = rt.time - 0.04;
    const jolt = mountMotion();
    expect(Math.abs(jolt.roll)).toBeGreaterThan(0.03);
    expect(jolt.bob).toBeLessThan(0);
    rt.time += 1;
    expect(Math.abs(mountMotion().roll)).toBeLessThan(1e-9);
  });
});
