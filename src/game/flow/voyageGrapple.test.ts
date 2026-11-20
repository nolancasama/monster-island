import { describe, expect, it } from "vitest";
import type { Vec3 } from "../types";
import { BOAT_DECK_Y, BOAT_INNER, BOAT_RAIL } from "../world/gullBoat";
import { DECK_Y, SHIP } from "../world/pirateShip";
import { BOAT_CHASE, MOORED_POSE } from "./voyageEncounter";
import { GRAPPLE_RADIUS, GRAPPLE_RAIL, GRAPPLE_THROWERS, grappleGunwale, grappleHand, grapplePosition, grappleRopePoint, grappleSlack, readyGrapple } from "./voyageGrapple";

const point = (): Vec3 => ({ x: 0, y: 0, z: 0 });
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const chase = BOAT_CHASE.end;
const boat = { x: chase.x, y: -0.1, z: chase.z, yaw: chase.h };
const mix = (a: number, b: number, k: number) => a + (b - a) * k;

function releaseAt(i: number) {
  const hook = readyGrapple(), landing = point();
  grappleGunwale(landing, boat, i);
  const z = GRAPPLE_RAIL.z[i];
  const yaw = Math.atan2(landing.x - SHIP.x - GRAPPLE_RAIL.x, landing.z - SHIP.z - z);
  const crew = { x: GRAPPLE_RAIL.x + Math.sin(yaw) * 0.36, z: z + Math.cos(yaw) * 0.36, yaw, air: 0 };
  Object.assign(hook, { pitch: 0.32, handY: 1.62, handZ: 0.36 });
  grappleHand(hook.release, crew, hook, 0);
  return { hook, crew, landing };
}

describe("starboard grappling hooks", () => {
  for (const [i, id] of GRAPPLE_THROWERS.entries()) {
    it(`${id} throws from his grip to his gunwale point with increasing horizontal travel`, () => {
      const { hook, landing } = releaseAt(i);
      const p = point();
      hook.phase = "flight";
      grapplePosition(p, hook.release, landing, hook);
      expect(p).toEqual(hook.release);
      let previous = -1;
      for (let n = 0; n <= 100; n++) {
        hook.progress = n / 100;
        grapplePosition(p, hook.release, landing, hook);
        const travel = Math.hypot(p.x - hook.release.x, p.z - hook.release.z);
        expect(travel).toBeGreaterThan(previous);
        previous = travel;
        if (n > 0 && n < 100) expect(p.y).toBeGreaterThan(mix(hook.release.y, landing.y, hook.progress));
      }
      expect(distance(p, landing)).toBeLessThan(1e-9);
      const dx = p.x - boat.x, dz = p.z - boat.z;
      expect(dx * Math.cos(boat.yaw) - dz * Math.sin(boat.yaw)).toBeCloseTo(BOAT_INNER.halfX + BOAT_RAIL.width);
      expect(p.y).toBeCloseTo(boat.y + BOAT_DECK_Y + BOAT_RAIL.height + GRAPPLE_RADIUS);
    });

    it(`${id}'s line reaches only the airborne hook, then stays taut at the moving gunwale`, () => {
      const { hook, crew, landing } = releaseAt(i);
      const hand = point(), tip = point(), previous = point(), p = point();
      for (const phase of ["flight", "attached"] as const) for (let n = 0; n <= 100; n++) {
        const k = n / 100;
        hook.phase = phase;
        hook.progress = phase === "flight" ? k : 1;
        hook.pitch = mix(0.32, 0.38, Math.min(1, k * 2));
        hook.handY = mix(1.62, 1.33, Math.min(1, k * 2));
        grappleHand(hand, crew, hook, -0.04);
        const live = phase === "flight" ? boat : {
          x: mix(boat.x, MOORED_POSE.x, k), y: boat.y, z: mix(boat.z, MOORED_POSE.z, k), yaw: mix(boat.yaw, MOORED_POSE.h, k),
        };
        grappleGunwale(landing, live, i);
        grapplePosition(tip, hand, landing, hook);
        const direct = distance(hand, tip);
        const slack = grappleSlack(direct, hook);
        grappleRopePoint(previous, hand, tip, slack, 0);
        expect(previous).toEqual(hand);
        let length = 0;
        for (let j = 1; j <= 24; j++) {
          grappleRopePoint(p, hand, tip, slack, j / 24);
          length += distance(previous, p);
          Object.assign(previous, p);
          // Check the rope centreline with its radius against the outside of each hull.
          if (p.x < SHIP.x + GRAPPLE_RAIL.x + 1.02) expect(p.y).toBeGreaterThan(DECK_Y + 0.95 + GRAPPLE_RADIUS);
          const localX = (p.x - live.x) * Math.cos(live.yaw) - (p.z - live.z) * Math.sin(live.yaw);
          if (localX < BOAT_INNER.halfX + BOAT_RAIL.width + GRAPPLE_RADIUS) {
            expect(p.y).toBeGreaterThanOrEqual(live.y + BOAT_DECK_Y + BOAT_RAIL.height + GRAPPLE_RADIUS - 1e-9);
          }
        }
        expect(distance(p, tip)).toBeLessThan(1e-9);
        expect(length).toBeLessThanOrEqual(direct + slack + 1e-9);
        if (phase === "attached") {
          expect(slack).toBe(0);
          expect(length).toBeCloseTo(direct);
          expect(tip).toEqual(landing);
        } else if (k > 0 && k < 1) {
          expect(slack).toBeGreaterThan(0);
          expect(distance(tip, landing)).toBeGreaterThan(0);
        }
      }
    });
  }
});
