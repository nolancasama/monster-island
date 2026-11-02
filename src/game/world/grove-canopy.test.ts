import { describe, expect, it } from "vitest";
import { ENEMIES } from "../data/combat";
import { hazardAt } from "../logic/elements";
import { blocked, isWalkable, PLAYER_R, type Gates } from "./collision";
import { HAZARDS } from "./hazards";
import { CANOPY_ENCOUNTERS, ENEMY_SPAWNS, STAGES } from "./lowland";
import { SECRET_IDS } from "./elementObjects";

const solved = ["groveLilies", "canopyVines", "canopyRope"] as const;
const open: Gates = { act2: true, cleared: STAGES, solved, secrets: SECRET_IDS };

describe("Grove and Canopy hazard boundaries", () => {
  it("flags only Canopy voids for the future player fall flow", () => {
    const homeFalls = HAZARDS.filter(h => h.world === "home" && h.kind === "fall");
    expect(homeFalls.length).toBeGreaterThan(2);
    for (const h of HAZARDS) {
      expect(!!h.playerFall, h.id).toBe(h.world === "home" && h.kind === "fall");
    }
    let samples = 0;
    for (let x = 19; x <= 135; x += .5) for (let z = -344; z <= -154; z += .5) {
      const h = hazardAt(x, z, "home", solved);
      if (h?.kind !== "fall") continue;
      samples++;
      expect(x, h.id).toBeGreaterThanOrEqual(83);
      expect(x, h.id).toBeLessThanOrEqual(119);
      expect(z, h.id).toBeGreaterThanOrEqual(-241);
      expect(z, h.id).toBeLessThanOrEqual(-198);
    }
    expect(samples).toBeGreaterThan(1000);
  });

  it("never labels solid rock, roots or a closed secret as a fall hazard", () => {
    let samples = 0;
    for (const secrets of [[], SECRET_IDS]) {
      const gates = { ...open, secrets };
      for (let x = 82; x <= 120; x += .25) for (let z = -242; z <= -198; z += .25) {
        if (hazardAt(x, z, "home", solved)?.kind !== "fall") continue;
        samples++;
        expect(blocked(x, z, 0, gates), `solid fall at ${x},${z}`).toBe(false);
        expect(isWalkable(x, z, gates, PLAYER_R), `player edge at ${x},${z}`).toBe(false);
      }
    }
    expect(samples).toBeGreaterThan(1000);
  });
});

it("keeps existing enemy indices stable and appends the expanded stage encounters", () => {
  // Enemy array indices are persistent identities. These are the pre-Slice-C
  // homes, including optional arm encounters and the appended original Canopy foe.
  const homes: Array<[string, string, number, number]> = [
    ["forest1", "gloomlet", 74.6, -162.8], ["forest1", "gloomlet", 75.6, -170.2],
    ["forest1", "forestSpitter", 66.4, -167.8], ["forest1", "snapjaw", 72.6, -178.6], ["forest1", "gloomlet", 85, -177.2],
    ["grove", "gloomlet", 57, -211], ["grove", "forestSpitter", 38.8, -211.6], ["grove", "snapjaw", 51.5, -211.8],
    ["grove", "gloomlet", 48.6, -216.4], ["grove", "forestSpitter", 46.4, -226.8], ["grove", "snapjaw", 48.5, -232.2],
    ["grove", "gloomlet", 37.8, -233.8], ["grove", "snapjaw", 56, -239.5],
    ["canopy", "gloomlet", 97, -203.3], ["canopy", "snapjaw", 106, -208.6], ["canopy", "forestSpitter", 105.2, -230.6],
    ["canopy", "snapjaw", 112, -235], ["causeway", "raiderShooter", 62, -248.2], ["causeway", "shellback", 61.4, -258.4],
    ["causeway", "raiderShooter", 85, -247.4], ["causeway", "shellback", 91.6, -260.1], ["causeway", "gloomlet", 95, -249.6],
    ["causeway", "shellback", 103.4, -251.8], ["causeway", "snapjaw", 107.4, -249.2], ["coast", "gloomlet", 65.4, -272.4],
    ["coast", "gloomlet", 85.2, -280.4], ["coast", "raiderShooter", 77.4, -284.6], ["coast", "gloomlet", 64, -278],
    ["canopy", "gloomlet", 98, -207], ["forest1", "gloomlet", 49, -175], ["forest1", "snapjaw", 42, -186],
    ["forest1", "gloomlet", 42, -196], ["forest1", "gloomlet", 103, -174], ["forest1", "snapjaw", 113, -184],
    ["forest1", "gloomlet", 113, -194],
  ];
  expect(ENEMY_SPAWNS.slice(0, homes.length).map(e => [e.zone, e.kind, e.x, e.z])).toEqual(homes);
  expect(ENEMY_SPAWNS.filter(e => e.zone === "grove" && !e.optional)).toHaveLength(10);
  expect(ENEMY_SPAWNS.filter(e => e.zone === "canopy" && !e.optional)).toHaveLength(9);
  expect(ENEMY_SPAWNS.some(e => e.zone === "canopy" && ENEMIES[e.kind].weightClass === "heavy")).toBe(true);
});

it("gives every named Canopy encounter a Puff-reachable void and retains interior enemies", () => {
  for (const encounter of CANOPY_ENCOUNTERS) {
    const e = ENEMY_SPAWNS.find(e => e.zone === "canopy" && e.x === encounter.x && e.z === encounter.z);
    expect(e, `${encounter.name} enemy`).toBeDefined();
    const radius = ENEMIES[e!.kind].radius;
    expect(isWalkable(e!.x, e!.z, open, radius), encounter.name).toBe(true);
    // Integrate the actual light/medium Puff fling distance (.55 seconds,
    // 1.5/s exponential drag). Check the same .1m hazard/solid substeps as
    // displaceEnemy so proximity alone cannot count through a wall.
    const knock = ENEMIES[e!.kind].weightClass === "light" ? 9 : 6;
    const reach = knock * (1 - Math.exp(-1.5 * .55)) / 1.5;
    let reachesVoid = false;
    for (let a = 0; a < Math.PI * 2 && !reachesVoid; a += Math.PI / 32) {
      for (let d = .05; d <= reach; d += .05) {
        const x = e!.x + Math.sin(a) * d, z = e!.z + Math.cos(a) * d;
        if (blocked(x, z, radius, open)) break;
        if (hazardAt(x, z, "home", solved)?.kind === "fall") { reachesVoid = true; break; }
        if (!isWalkable(x, z, open, 0)) break;
      }
    }
    expect(reachesVoid, `${encounter.name} Puff fling into void`).toBe(true);
  }
  const shellback = ENEMY_SPAWNS.find(e => e.zone === "canopy" && e.kind === "shellback")!;
  expect(shellback).toBeDefined();
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 16) {
    expect(hazardAt(shellback.x + Math.sin(a) * 2, shellback.z + Math.cos(a) * 2, "home", solved)).toBeNull();
  }
});
