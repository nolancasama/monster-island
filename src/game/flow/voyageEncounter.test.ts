import { describe, expect, it } from "vitest";
import {
  BOAT_CHASE, BOAT_OUT, BOAT_OUT_START, CHASE_SECONDS, MOORED_POSE, Path, SHIP_CHASE_S, SHIP_PATH, SHIP_REST,
  boatChaseAt, clearance, horizonDrop, pathEndingAt, polygonGap, shipChaseAt, shipFootprint, type Pose,
} from "./voyageEncounter";
import { HALF_BEAM, SHIP } from "../world/pirateShip";
import { BOAT_HALF_BEAM } from "../world/gullBoat";

const STEP = 1 / 60;
const angle = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const ease = (k: number) => k * k * (3 - 2 * k);
/** The rope pull from where the chase stops to the mooring (flow/voyage `pullAlongside`). */
const pulled = (k: number): Pose => {
  const a = BOAT_CHASE.end, b = MOORED_POSE, e = ease(k), dh = Math.atan2(Math.sin(b.h - a.h), Math.cos(b.h - a.h));
  return { x: a.x + (b.x - a.x) * e, z: a.z + (b.z - a.z) * e, h: a.h + dh * e };
};

describe("paths", () => {
  it("lines and arcs give continuous position and heading", () => {
    const p = new Path({ x: 0, z: 0, h: 0 }, [{ line: 10 }, { arc: 5, turn: Math.PI / 2 }, { line: 3 }]);
    expect(p.length).toBeCloseTo(10 + 2.5 * Math.PI + 3, 3);
    const e = p.end;
    expect(e.x).toBeCloseTo(5 + 3, 2); expect(e.z).toBeCloseTo(15, 2); expect(e.h).toBeCloseTo(Math.PI / 2, 5);
    for (let s = 0.05; s < p.length; s += 0.05) {
      const a = p.at(s - 0.05), b = p.at(s);
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThan(0.051);
      expect(angle(a.h, b.h)).toBeLessThan(0.05 / 5 + 1e-6);
    }
  });
  it("pathEndingAt ends exactly at its pose", () => {
    const e = pathEndingAt({ x: 3, z: -4, h: 1 }, [{ line: 7 }, { arc: 9, turn: -0.8 }, { line: 2 }]).end;
    expect(e.x).toBeCloseTo(3, 3); expect(e.z).toBeCloseTo(-4, 3); expect(angle(e.h, 1)).toBeLessThan(1e-6);
  });
  it("polygon gap is zero for overlap and the true distance apart", () => {
    const sq = (x: number): Array<[number, number]> => [[x, 0], [x + 1, 0], [x + 1, 1], [x, 1]];
    expect(polygonGap(sq(0), sq(0.5))).toBe(0);
    expect(polygonGap(sq(0), sq(3))).toBeCloseTo(2, 6);
  });
});

describe("the interception", () => {
  it("the ship ends at its mooring, bow south, and the boat moors alongside its starboard side", () => {
    const s = shipChaseAt(CHASE_SECONDS);
    expect(s.x).toBeCloseTo(SHIP.x, 2); expect(s.z).toBeCloseTo(SHIP.z, 2); expect(angle(s.h, Math.PI)).toBeLessThan(1e-4);
    expect(MOORED_POSE.x - BOAT_HALF_BEAM).toBeGreaterThan(SHIP.x + HALF_BEAM + 1);
    expect(clearance(SHIP_REST, MOORED_POSE)).toBeGreaterThan(1.2);
  });

  it("the hulls never touch: sighting, chase and rope pull, every frame", () => {
    // While watched the ship sails up to the chase start; the boat holds at its sighting spot.
    for (let s = 0; s <= SHIP_CHASE_S; s += 0.25) expect(clearance(SHIP_PATH.at(s), BOAT_OUT.end)).toBeGreaterThan(60);
    let min = Infinity;
    for (let t = 0; t <= CHASE_SECONDS + 1e-9; t += STEP) min = Math.min(min, clearance(shipChaseAt(t), boatChaseAt(t)));
    expect(min).toBeGreaterThan(1.5);
    for (let k = 0; k <= 1; k += 0.01) expect(clearance(SHIP_REST, pulled(k))).toBeGreaterThan(1.2);
    // The departure out to the sighting never comes near the ship's mooring area either.
    for (let s = 0; s <= BOAT_OUT.length; s += 0.5) expect(clearance(SHIP_PATH.at(0), BOAT_OUT.at(s))).toBeGreaterThan(60);
  });

  it("the ship stops across the boat's course: both its intended heading and its escape are blocked", () => {
    const stop = boatChaseAt(CHASE_SECONDS), ship = shipFootprint(SHIP_REST).hull;
    expect(clearance(SHIP_REST, stop)).toBeGreaterThan(3);
    expect(clearance(SHIP_REST, stop)).toBeLessThan(9);
    // A boat-sized probe sailing on along either heading runs into the hull within 20 m.
    for (const h of [stop.h, BOAT_OUT.end.h]) {
      let hit = -1;
      for (let d = 0; d <= 20; d += 0.25) {
        if (clearance(SHIP_REST, { x: stop.x + Math.sin(h) * d, z: stop.z + Math.cos(h) * d, h: stop.h }) === 0) { hit = d; break; }
      }
      expect(hit).toBeGreaterThan(0);
    }
    expect(ship.length).toBeGreaterThan(10);
  });

  it("the ship crosses the boat's intended course ahead of it before the boat stops", () => {
    // Ahead of the boat along its westward sighting heading, the ship's hull is in the way by mid-chase.
    const o = BOAT_OUT.end;
    const blocked = (t: number) => {
      const b = boatChaseAt(t);
      for (let d = 6; d <= 30; d += 0.5) if (clearance(shipChaseAt(t), { x: b.x + Math.sin(o.h) * d, z: b.z + Math.cos(o.h) * d, h: o.h }) === 0) return true;
      return false;
    };
    let first = -1;
    for (let t = 0; t <= CHASE_SECONDS; t += 0.1) if (blocked(t)) { first = t; break; }
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(CHASE_SECONDS * 0.8);
    // The boat is still moving when the way is shut (it slows because of it).
    const v = Math.hypot(boatChaseAt(first + 0.1).x - boatChaseAt(first).x, boatChaseAt(first + 0.1).z - boatChaseAt(first).z) / 0.1;
    expect(v).toBeGreaterThan(0.5);
  });

  it("speeds, accelerations and turn rates stay natural", () => {
    for (const [at, vmax, amax, wmax] of [[shipChaseAt, 11, 4.5, 0.5], [boatChaseAt, 4, 2, 0.35]] as const) {
      let prev = at(0), pv = 0;
      for (let t = STEP; t <= CHASE_SECONDS; t += STEP) {
        const p = at(t), v = Math.hypot(p.x - prev.x, p.z - prev.z) / STEP;
        expect(v).toBeLessThan(vmax);
        if (t > 2 * STEP) expect(Math.abs(v - pv) / STEP).toBeLessThan(amax);
        expect(angle(p.h, prev.h) / STEP).toBeLessThan(wmax);
        prev = p; pv = v;
      }
    }
    // Both come to (near) rest at the end.
    const a = shipChaseAt(CHASE_SECONDS - 0.1), b = shipChaseAt(CHASE_SECONDS);
    expect(Math.hypot(b.x - a.x, b.z - a.z) / 0.1).toBeLessThan(1);
    expect(Math.hypot(boatChaseAt(CHASE_SECONDS).x - boatChaseAt(CHASE_SECONDS - 0.1).x, boatChaseAt(CHASE_SECONDS).z - boatChaseAt(CHASE_SECONDS - 0.1).z)).toBeLessThan(0.01);
  });

  it("the boat leaves the pier heading south and sights the ship far ahead", () => {
    expect(BOAT_OUT_START.h).toBeCloseTo(Math.PI, 6);
    const o = BOAT_OUT.end, s = SHIP_PATH.at(0);
    const d = Math.hypot(s.x - o.x, s.z - o.z);
    expect(d).toBeGreaterThan(160);
    expect(d).toBeLessThan(230);
    // Ahead: within 25° of the boat's heading.
    expect(angle(Math.atan2(s.x - o.x, s.z - o.z), o.h)).toBeLessThan((25 * Math.PI) / 180);
  });

  it("the horizon hides the hull far off and lets it rise smoothly", () => {
    expect(horizonDrop(180)).toBeGreaterThan(3.4);
    expect(horizonDrop(100)).toBe(0);
    for (let d = 100; d < 260; d += 1) expect(Math.abs(horizonDrop(d + 1) - horizonDrop(d))).toBeLessThan(0.3);
  });
});
