import { describe, expect, it } from "vitest";
import { ENEMIES, type EnemyKind } from "../data/combat";
import { ENEMY_SPAWNS, STAGES, zoneAt } from "../world/lowland";
import { CLOUD_ENEMY_SPAWNS, CLOUD_PUZZLES, CLOUD_STAGES, cloudZoneAt } from "../world/cloudisle";
import { isWalkable, moveCircle, type Gates } from "../world/collision";
import { hazardAt } from "./elements";
import { PANIC_TURN, canStartPanic, endPanicResistance, panicDuration, panicSpeedScale, recordPanicStep, startPanic, updatePanicHeading } from "./panic";

describe("burning panic rules", () => {
  it("gives heavy enemies the shorter, slower run", () => {
    expect([panicDuration("light"), panicDuration("medium"), panicDuration("heavy")]).toEqual([2.5, 2.5, 2]);
    expect([panicSpeedScale("light"), panicSpeedScale("medium"), panicSpeedScale("heavy")]).toEqual([1.7, 1.7, 1.2]);
    expect(startPanic("heavy", 10).until).toBe(12);
    for (const interval of Object.values(PANIC_TURN)) {
      expect(interval).toBeGreaterThanOrEqual(.35);
      expect(interval).toBeLessThanOrEqual(.7);
    }
  });

  it("cannot restart or extend an active panic and resists for exactly four seconds", () => {
    const panic = startPanic("light", 10);
    expect(canStartPanic(11, 0, panic, true, false)).toBe(false);
    expect(panic.until).toBe(12.5);
    const resistant = endPanicResistance(panic.until);
    expect(resistant).toBe(16.5);
    expect(canStartPanic(16.49, resistant, null, true, false)).toBe(false);
    expect(canStartPanic(16.5, resistant, null, true, false)).toBe(true);
    expect(canStartPanic(20, 0, null, false, false)).toBe(false);
    expect(canStartPanic(20, 0, null, true, true)).toBe(false);
  });

  it("holds a heading until its kind's turn time, flees, and bends home near its leash", () => {
    const panic = startPanic("light", 0);
    updatePanicHeading(panic, "gloomlet", 0, 0, 0, 0, 0, 0, 0, -2, 10);
    expect(panic.hz).toBeCloseTo(1);
    const hx = panic.hx, hz = panic.hz;
    updatePanicHeading(panic, "gloomlet", 0, .1, 0, 0, 0, 0, -2, 0, 10);
    expect(panic.hx).toBe(hx);
    expect(panic.hz).toBe(hz);
    updatePanicHeading(panic, "gloomlet", 0, .5, 0, 8, 0, 0, 0, 6, 10);
    expect(panic.hz).toBeLessThan(0);
    expect(Math.hypot(panic.hx, panic.hz)).toBeCloseTo(1);
  });

  it("retries blocked movement immediately, then heads straight home after three blocks", () => {
    const panic = startPanic("medium", 0);
    for (let n = 0; n < 3; n++) recordPanicStep(panic, .009, .1, .1 * n);
    expect(panic.blocked).toBe(3);
    expect(panic.turnAt).toBe(.2);
    updatePanicHeading(panic, "snapjaw", 1, .2, 3, 4, 0, 0, 3, 0, 20);
    expect(panic.hx).toBeCloseTo(-.6);
    expect(panic.hz).toBeCloseTo(-.8);
    recordPanicStep(panic, .02, .1, .3);
    expect(panic.blocked).toBe(0);
  });
});

describe("panic movement property", () => {
  it("makes net progress from every spawn in both worlds while staying walkable, in-zone and outside hazards", () => {
    const home: Gates = { solved: ["groveLilies", "canopyVines", "canopyRope", "causewayGate"], act2: true, cleared: STAGES };
    const cloud: Gates = { solved: [], cloud: { cleared: CLOUD_STAGES, solved: CLOUD_PUZZLES, tunnelOpen: true } };
    const out = { x: 0, z: 0 };
    for (const world of ["home", "cloud"] as const) {
      const gates = world === "home" ? home : cloud;
      const spawns = world === "home" ? ENEMY_SPAWNS : CLOUD_ENEMY_SPAWNS;
      const zoneAtPoint = world === "home" ? zoneAt : cloudZoneAt;
      const solved = world === "home" ? home.solved : CLOUD_PUZZLES;
      for (let i = 0; i < spawns.length; i++) {
        const spawn = spawns[i], kind: EnemyKind = spawn.kind, def = ENEMIES[kind];
        for (const bearing of [.51, 3.6]) {
          const panic = startPanic(def.weightClass, 0);
          const px = spawn.x + Math.sin(bearing) * 2, pz = spawn.z + Math.cos(bearing) * 2;
          let x = spawn.x, z = spawn.z;
          const dt = .125, expected = def.speed * panicSpeedScale(def.weightClass) * dt;
          for (let frame = 0; frame < 20; frame++) {
            const now = frame * dt;
            updatePanicHeading(panic, kind, i, now, x, z, spawn.x, spawn.z, px, pz, def.leash);
            const nx = x + panic.hx * expected, nz = z + panic.hz * expected;
            let moved = 0;
            if (!hazardAt(nx, nz, world, solved)) {
              moveCircle(x, z, nx, nz, def.radius, gates, false, undefined, out);
              if (zoneAtPoint(out.x, out.z) === spawn.zone && !hazardAt(out.x, out.z, world, solved)) {
                moved = Math.hypot(out.x - x, out.z - z);
                x = out.x; z = out.z;
              }
            }
            recordPanicStep(panic, moved, expected, now);
            expect(isWalkable(x, z, gates, def.radius), `${world}:${i}:${frame}:walkable`).toBe(true);
            expect(zoneAtPoint(x, z), `${world}:${i}:${frame}:zone`).toBe(spawn.zone);
            expect(hazardAt(x, z, world, solved), `${world}:${i}:${frame}:hazard`).toBeNull();
          }
          expect(Math.hypot(x - spawn.x, z - spawn.z), `${world}:${i}:${kind}:${bearing}:progress`).toBeGreaterThan(.08);
        }
      }
    }
  });
});
