import { describe, expect, it } from "vitest";
import { blastKnock, bubbleAir, bubbleProfile, canControl, clearLine, endResistance, fallDamage, fallingAir, forwardTargets, hazardAt, ignite, inCone, oldestTrap, resistance, snareDuration, tickBurn, weaponVictims, type Control } from "./elements";
import { CLOUD_CHASMS } from "../world/cloudisle";
import { CANOPY_GAPS, ISLET, POND } from "../world/lowland";
import { HAZARDS } from "../world/hazards";

const trap = (t0: number, peak = 2.4): Control => ({ kind: "trapped", t0, until: t0 + 1.9, peak });

describe("elemental control", () => {
  it("sets resistance by weight and blocks control until its exact expiry", () => {
    for (const weight of ["light", "medium"] as const) {
      expect(resistance(weight)).toBe(weight === "light" ? 1.2 : 2);
      const until = endResistance(weight, 10);
      expect(canControl(weight, "grabbed", until - .01, until, null)).toBe(false);
      expect(canControl(weight, "grabbed", until, until, null)).toBe(true);
    }
  });
  it("never lifts or carries heavy enemies, but permits their grounded fling/snare", () => {
    for (const kind of ["trapped", "grabbed", "carried"] as const) expect(canControl("heavy", kind, 10, 0, null)).toBe(false);
    expect(canControl("heavy", "flung", 10, 0, null)).toBe(true);
    expect(canControl("heavy", "snared", 10, 0, null)).toBe(true);
    expect(bubbleProfile("heavy", true, 0, 0, false)).toBeNull();
  });
  it("does not extend an existing snare and supplies weight-specific durations/knock", () => {
    expect(canControl("light", "snared", 10, 0, { kind: "snared", t0: 9, until: 12 })).toBe(false);
    expect([snareDuration("light"), snareDuration("medium"), snareDuration("heavy")]).toEqual([3.5, 2.5, 2]);
    expect([blastKnock("light"), blastKnock("medium"), blastKnock("heavy")]).toEqual([9, 6, 2]);
  });
});

describe("burn clock", () => {
  it("ticks at three per second, two damage each, with no initial hit", () => {
    const burn = ignite(null, 10);
    expect(burn.until).toBe(12.5);
    expect(tickBurn(burn, 10.32).damage).toBe(0);
    expect(tickBurn(burn, 10 + 1 / 3).damage).toBe(2);
    expect(tickBurn(burn, 11).damage).toBe(6);
    expect(tickBurn(burn, 20)).toEqual({ burn: null, damage: 14 });
    expect(tickBurn(null, 20).damage).toBe(0);
  });
  it("refreshes without stacking or resetting tick phase; upgrade scales only tick damage", () => {
    let burn = ignite(null, 10);
    for (let i = 1; i <= 20; i++) burn = ignite(burn, 10 + i / 100);
    expect(burn.until).toBeCloseTo(12.7);
    expect(tickBurn(burn, 10.3).damage).toBe(0);
    const tick = tickBurn(burn, 10 + 1 / 3, 1.5);
    expect(tick.damage).toBe(3);
    expect(tickBurn(tick.burn, 10.4).damage).toBe(0);
    expect(ignite({ until: 9, tick: 8 }, 10).tick).toBeCloseTo(10 + 1 / 3);
  });
});

describe("bubble curves and pool", () => {
  it("rises for 1.1 seconds then holds for .8, falling from current air", () => {
    const c = trap(10);
    expect(bubbleAir(c, 10)).toBe(0);
    expect(bubbleAir(c, 10.55)).toBeCloseTo(1.2);
    expect(bubbleAir(c, 11.1)).toBeCloseTo(2.4);
    expect(bubbleAir(c, 11.9)).toBeCloseTo(2.4);
    expect(fallDamage(.8)).toBe(12);
    expect(fallDamage(2.4)).toBe(25);
    expect(fallDamage(9)).toBe(25);
    expect(fallingAir(.8, .2)).toBeCloseTo(.52);
    expect(fallingAir(.8, 1)).toBe(0);
  });
  it("uses the short medium trap before upgrade and caps actual cave footprints", () => {
    expect(bubbleProfile("medium", false, 0, 0, false)).toEqual({ peak: .8, duration: 1 });
    expect(bubbleProfile("medium", true, 0, 0, false)).toEqual({ peak: 2.4, duration: 1.9 });
    expect(bubbleProfile("light", false, 28, 298, true)?.peak).toBe(1.4);
    expect(bubbleProfile("light", false, 0, 20, true)?.peak).toBe(2.4);
    expect(bubbleProfile("light", false, 28, 298, false)?.peak).toBe(2.4);
  });
  it("the fourth trap evicts the oldest, ignoring other controls", () => {
    const list = [{ control: trap(12) }, { control: null }, { control: trap(10) }, { control: trap(11) }];
    expect(oldestTrap(list.slice(0, 3))).toBeNull();
    expect(oldestTrap(list)).toBe(list[2]);
  });
});

describe("direction, collision and hazards", () => {
  it("uses full cone angles and facing, excluding even nearby enemies behind", () => {
    const origin = { x: 0, z: 0 };
    expect(inCone(origin, 0, { x: 0, z: 4.5 }, 4.5, 70)).toBe(true);
    expect(inCone(origin, 0, { x: 0, z: -.1 }, 4.5, 70)).toBe(false);
    expect(inCone(origin, 0, { x: 3, z: 3 }, 4.5, 70)).toBe(false);
    expect(inCone(origin, Math.PI / 2, { x: 4, z: 0 }, 4.5, 70)).toBe(true);
    expect(inCone(origin, 0, { x: 0, z: 5 }, 4.5, 70)).toBe(false);
  });
  it("samples the entire line and returns nearest clear forward targets", () => {
    const origin = { x: 0, z: 0 }, list = [{ x: 0, z: -1 }, { x: 0, z: 4 }, { x: 0, z: 1 }, { x: 1, z: 3 }];
    const clear = (x: number, z: number) => !(x < .2 && z > 2 && z < 2.2);
    expect(clearLine(origin, list[1], clear)).toBe(false);
    expect(forwardTargets(list, origin, 0, 4.5, 70, clear)).toEqual([list[2], list[3]]);
  });
  it("allows one weapon hit per victim per swing/fling without mutating the ledger", () => {
    const victims = [3];
    expect(weaponVictims(victims, 3)).toBeNull();
    expect(weaponVictims(victims, 4)).toEqual([3, 4]);
    expect(victims).toEqual([3]);
    expect(weaponVictims([], 3)).toEqual([3]);
  });
  it("tests only explicit hazards, the matching world, and safe islands/decks", () => {
    expect(hazardAt(POND.x + 4, POND.z, "home")?.id).toBe("pond");
    expect(hazardAt(ISLET.x, ISLET.z, "home")).toBeNull();
    expect(hazardAt(POND.x + 4, POND.z, "cloud")).toBeNull();
    const g = CANOPY_GAPS.canopyVines;
    expect(hazardAt(g.x + 3, (g.z0 + g.z1) / 2, "home")?.kind).toBe("fall");
    expect(hazardAt(g.x, (g.z0 + g.z1) / 2, "home")?.kind).toBe("fall");
    expect(hazardAt(g.x, (g.z0 + g.z1) / 2, "home", ["canopyVines"])).toBeNull();
    expect(hazardAt(-42, 67, "cloud")?.id).toBe("coastSea");
    expect(hazardAt(-42, 67, "cloud", ["coastWindmill"])).toBeNull();
    const chasm = CLOUD_CHASMS[0];
    expect(hazardAt((chasm.x0 + chasm.x1) / 2, (chasm.z0 + chasm.z1) / 2, "cloud")?.kind).toBe("fall");
    expect(hazardAt(-42, 62, "cloud")?.id).toBe("coastSea");
    expect(hazardAt(999, 999, "home")).toBeNull();
    expect(HAZARDS).toHaveLength(1 + Object.keys(CANOPY_GAPS).length + CLOUD_CHASMS.length + 1);
  });
});
