import { describe, expect, it } from "vitest";
import { portDoorGeometry, portWallGeometry } from "../../scene/models/portWall";
import { CAMERA_PROFILES, cameraProfileAt } from "../../scene/cameraProfiles";
import { HOUSES, PORT_WALL, SERVICES, STAGES, TOWN_GATE, lowlandWalkable, townGateOpen } from "./lowland";

const walkableXs = (cleared: readonly (typeof STAGES)[number][], m: number) => {
  const out: number[] = [];
  for (let x = 19; x <= 135; x += .1) if (lowlandWalkable(x, PORT_WALL.z, { solved: [], cleared }, m)) out.push(x);
  return out;
};

describe("Port Town wall and gate", () => {
  it("closed, the whole wall line is shut", () => {
    expect(walkableXs(STAGES.filter(s => s !== "coast"), .5)).toEqual([]);
  });

  it("open, only the gate is passable, and a rider on Ember fits", () => {
    const xs = walkableXs([...STAGES], .5);
    expect(xs.length).toBeGreaterThan(0);
    for (const x of xs) expect(Math.abs(x - TOWN_GATE.x)).toBeLessThan(PORT_WALL.gateHalf);
    expect(lowlandWalkable(TOWN_GATE.x, PORT_WALL.z, { solved: [], cleared: [...STAGES] }, 1.2)).toBe(true);
  });

  it("the wall leaves every house and service clear", () => {
    const wallNorth = PORT_WALL.z - PORT_WALL.towerR;
    for (const h of [...HOUSES, ...Object.values(SERVICES).map(s => s.house)]) {
      expect(h.z + Math.max(h.w, h.d) / 2).toBeLessThan(wallNorth + 1.6);
    }
  });

  it("opens on approach only after the coast is cleared, then stays open", () => {
    expect(townGateOpen(false, false, 1, false)).toBe(false);
    expect(townGateOpen(true, false, 20, false)).toBe(false);
    expect(townGateOpen(true, false, 8.9, false)).toBe(true);
    expect(townGateOpen(true, false, 40, true)).toBe(true);
    expect(townGateOpen(true, true, 40, false)).toBe(true);
  });

  it("stays under budget", () => {
    expect(portWallGeometry().getAttribute("position").count / 3).toBeLessThan(8000);
    expect(portDoorGeometry(1).getAttribute("position").count / 3).toBeLessThan(600);
  });

  it("the raised gate view covers both sides of the wall", () => {
    const profile = CAMERA_PROFILES.find(p => p.id === "port-gate")!;
    for (const z of [PORT_WALL.z + 4, PORT_WALL.z, PORT_WALL.z - 6]) {
      expect(cameraProfileAt({ x: TOWN_GATE.x, y: 2, z, climbing: false, cloud: false }).id).toBe("port-gate");
    }
    expect(profile.pitch).toBeGreaterThan(.7);
  });
});
