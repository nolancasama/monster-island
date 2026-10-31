import { describe, expect, it } from "vitest";
import { ENEMIES } from "../data/combat";
import {
  CLOUD_CHESTS, CLOUD_DOCK, CLOUD_ENEMY_SPAWNS, CLOUD_OBSTACLE_PLACE, CLOUD_PICKUPS, CLOUD_PUZZLES, CLOUD_ROUTE_REQUIRED,
  CLOUD_SPAWNS, COAST_GATE, HOLLOW, RAIDER_BARRICADE, ROUTE_MOUTHS, OBSERVATORY, BEACON,
  cloudMove, cloudNearestWalkable, cloudWalkable, cloudWindAt, cloudY, cloudZoneAt, electricPanelActive,
  type CloudArea, type CloudGates,
} from "./cloudisle";

const OPEN: CloudGates = { cleared: ["stormbreakCoast"], solved: ["coastWindmill", "coastCrate"], tunnelOpen: true };
const ALL_OPEN: CloudGates = { ...OPEN, cleared: ["stormbreakCoast", "skyrootCanopy", "thunderGrotto", "ancientObservatory"], solved: CLOUD_PUZZLES, observatoryLamps: ["leafy", "bubbo", "puff", "ember"] };
function flood(gates: CloudGates, radius = .35, avoid: CloudArea[] = [], origin = CLOUD_DOCK.spawn) {
  const step = .6, start = [Math.round(origin.x / step), Math.round(origin.z / step)], queue = [start];
  const seen = new Set<string>([start.join(",")]);
  while (queue.length) {
    const [x, z] = queue.pop()!;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz, px = nx * step, pz = nz * step, key = `${nx},${nz}`;
      if (seen.has(key) || !cloudWalkable(px, pz, gates, radius)) continue;
      const area = cloudZoneAt(px, pz); if (area && avoid.includes(area)) continue;
      const p = cloudMove(x * step, z * step, px, pz, radius, gates);
      if (Math.hypot(p.x - px, p.z - pz) > .05) continue;
      seen.add(key); queue.push([nx, nz]);
    }
  }
  return (x: number, z: number, radius = 1.1) => {
    for (const key of seen) {
      const [a, b] = key.split(",").map(Number);
      if (Math.hypot(a * step - x, b * step - z) < radius) return true;
    }
    return false;
  };
}

describe("Cloud Isle slice A ground", () => {
  it("joins dock, coast, Hollow, back tunnel and the junction with real circle moves", () => {
    const reach = flood(OPEN);
    for (const area of ["cloudDock", "stormbreakCoast", "hiddenHollow", "backTunnel", "windfallJunction"] as const) {
      const p = CLOUD_SPAWNS[area]; expect(reach(p.x, p.z), area).toBe(true);
    }
    for (const p of [HOLLOW.rest, HOLLOW.tala, HOLLOW.bo, HOLLOW.kiko, CLOUD_DOCK.gull]) expect(reach(p.x, p.z)).toBe(true);
    for (const p of [...CLOUD_PICKUPS, ...CLOUD_CHESTS].filter(p => p.z <= 280)) expect(reach(p.x, p.z), p.id).toBe(true);
    for (const m of ROUTE_MOUTHS) expect(reach(m.x, m.z, 2)).toBe(true);
  });
  it("requires the coast first clear, including mounted edge approaches, and always allows retreat", () => {
    for (const radius of [.35, .7]) {
      const g = { ...OPEN, cleared: [] };
      const reach = flood(g, radius);
      expect(reach(HOLLOW.center.x, HOLLOW.center.z)).toBe(false);
      for (const e of CLOUD_ENEMY_SPAWNS.filter(e => e.zone === "stormbreakCoast")) expect(reach(e.x, e.z, 1.5)).toBe(true);
      for (let x = -12; x <= 12; x += .3) expect(cloudWalkable(x, COAST_GATE.z, g, radius)).toBe(false);
      expect(cloudMove(0, 156, 0, 160, radius, g).z).toBeLessThan(COAST_GATE.z);
      expect(cloudMove(0, 156, 0, 160, radius, OPEN).z).toBeCloseTo(160);
      expect(cloudMove(0, 156, 0, 153, radius, g).z).toBeCloseTo(153);
    }
  });
  it("needs the family's tunnel and never opens the raider road", () => {
    expect(flood({ ...OPEN, tunnelOpen: false })(0, 270)).toBe(false);
    expect(flood(OPEN, .35, ["hiddenHollow"])(0, 270)).toBe(false);
    for (const radius of [.35, .7]) {
      for (let x = 26; x <= 34; x += .3) expect(cloudWalkable(x, RAIDER_BARRICADE.z, OPEN, radius)).toBe(false);
      expect(cloudMove(30, 149, 30, 154, radius, OPEN).z).toBeLessThan(RAIDER_BARRICADE.z);
    }
    expect(cloudWalkable(0, 317, ALL_OPEN, .35)).toBe(true);
  });
  it("keeps both optional coves closed until their own free ability puzzle", () => {
    expect(flood({ ...OPEN, solved: [] })(-49, 70)).toBe(false);
    expect(flood({ ...OPEN, solved: [] })(48, 129)).toBe(false);
    const reach = flood({ ...OPEN, solved: [] });
    for (const id of ["coastWindmill", "coastCrate"] as const) {
      const p = CLOUD_OBSTACLE_PLACE[id]; expect(reach(p.x, p.z, 1.2)).toBe(true);
    }
  });
  it("puts every enemy on its area ground, and projects invalid saved ground", () => {
    for (const e of CLOUD_ENEMY_SPAWNS) {
      expect(cloudZoneAt(e.x, e.z)).toBe(e.zone);
      expect(cloudWalkable(e.x, e.z, ALL_OPEN, ENEMIES[e.kind].radius), `${e.kind} ${e.x},${e.z}`).toBe(true);
    }
    const p = cloudNearestWalkable(999, -999, .35, {});
    expect(cloudWalkable(p.x, p.z, {}, .35)).toBe(true);
    expect(cloudNearestWalkable(NaN, Infinity, .35, {})).toEqual(CLOUD_DOCK.spawn);
    expect(cloudY(0, 270)).toBeGreaterThan(cloudY(0, 0));
  });
  it("adds shooter replacements on reachable Cloud Isle ground without changing encounter counts", () => {
    const reach = flood(ALL_OPEN);
    expect(["stormbreakCoast", "skyrootCanopy", "thunderGrotto", "ancientObservatory"].map(zone =>
      CLOUD_ENEMY_SPAWNS.filter(e => e.zone === zone).length)).toEqual([6, 6, 6, 4]);
    const shooters = CLOUD_ENEMY_SPAWNS.filter(e => e.kind === "raiderShooter");
    expect(shooters.length).toBeGreaterThan(0);
    for (const e of shooters) {
      expect(reach(e.x, e.z, 1.5), `${e.zone} ${e.x},${e.z}`).toBe(true);
      expect(["stormCrab", "raiderDrone"]).toContain(e.replaces);
    }
  });
  it("supplies wind acceleration only as a projectile/light-prop query", () => {
    expect(cloudWindAt(6, 30).x).toBeGreaterThan(0);
    expect(cloudWindAt(-24, 65).x).toBeLessThan(0);
    expect(cloudWindAt(-13, 197)).toEqual({ x: 0, z: 0 });
  });
});

describe("Cloud Isle mountain routes", () => {
  const routes = [
    { area: "skyrootCanopy" as const, other: "thunderGrotto" as const, x: -20, required: CLOUD_ROUTE_REQUIRED.skyrootCanopy },
    { area: "thunderGrotto" as const, other: "skyrootCanopy" as const, x: 20, required: CLOUD_ROUTE_REQUIRED.thunderGrotto },
  ];
  for (const route of routes) {
    it(`connects junction through ${route.area} to the shared approach and back, including mounted radius`, () => {
      const gates = { ...ALL_OPEN, cleared: ["stormbreakCoast", route.area] };
      for (const radius of [.35, .7]) {
        const reach = flood(gates, radius, [route.other], CLOUD_SPAWNS.windfallJunction);
        expect(reach(route.x, 286), "route mouth").toBe(true);
        expect(reach(route.x, 303), "far route ground").toBe(true);
        expect(reach(0, 312), "shared observatory approach").toBe(true);
        const retreat = flood(gates, radius, [route.other], { x: 0, z: 312 });
        expect(retreat(0, 270), "retreat to junction").toBe(true);
      }
    });
    for (const missing of route.required) {
      it(`requires ${missing}, even with all clears and the other required puzzle solved`, () => {
        const gates = { ...ALL_OPEN, solved: CLOUD_PUZZLES.filter(id => id !== missing) };
        for (const radius of [.35, .7]) {
          const reach = flood(gates, radius, [route.other], CLOUD_SPAWNS.windfallJunction);
          const place = CLOUD_OBSTACLE_PLACE[missing];
          expect(reach(place.x, place.z, 1.5), "required interaction reachable").toBe(true);
          expect(reach(route.x, 303), "cannot bypass required mechanism").toBe(false);
          expect(reach(0, 312), "cannot reach approach through this route").toBe(false);
        }
      });
    }
    it(`blocks the ${route.area} far gate before its first clear without blocking retreat`, () => {
      for (const radius of [.35, .7]) {
        const gates = { ...ALL_OPEN, cleared: ["stormbreakCoast"] };
        const reach = flood(gates, radius, [route.other], CLOUD_SPAWNS.windfallJunction);
        expect(reach(route.x, 303)).toBe(true);
        expect(reach(0, 312)).toBe(false);
        for(let x=route.x-10;x<=route.x+10;x+=.3) expect(cloudWalkable(x,307,gates,radius),`gate edge ${x}`).toBe(false);
        const retreat = flood(gates, radius, [route.other], { x: route.x, z: 303 });
        expect(retreat(0, 270)).toBe(true);
      }
    });
  }
  it("keeps the junction light, both route encounters six strong, and all pickups reachable", () => {
    const junction = CLOUD_ENEMY_SPAWNS.filter(e => e.zone === "windfallJunction");
    expect(junction.length).toBeGreaterThan(0); expect(junction.length).toBeLessThanOrEqual(3);
    expect(junction.every(e => e.kind === "windSprite")).toBe(true);
    for (const route of routes) expect(CLOUD_ENEMY_SPAWNS.filter(e => e.zone === route.area)).toHaveLength(6);
    const reach = flood(ALL_OPEN);
    for (const p of [...CLOUD_PICKUPS, ...CLOUD_CHESTS]) expect(reach(p.x, p.z, 1.5), p.id).toBe(true);
    expect(flood({ ...ALL_OPEN, solved: CLOUD_PUZZLES.filter(id => id !== "canopyGust") })(-32, 303)).toBe(false);
  });
  it("gives electric panels a visible safe window longer than 1.5 seconds every cycle", () => {
    for(const offset of [0,1.2]) {
      for(let t=0;t<2.4;t+=.1) expect(electricPanelActive(t-offset,offset)).toBe(false);
      expect(electricPanelActive(2.4-offset,offset)).toBe(true);
      expect(electricPanelActive(3.9-offset,offset)).toBe(true);
      expect(electricPanelActive(4-offset,offset)).toBe(false);
    }
  });
});

describe("Ancient Observatory and Storm Beacon ground", () => {
  for (const route of ["skyrootCanopy", "thunderGrotto"] as const) {
    it(`joins ${route} to all four mechanisms, entrance rest and raised lift`, () => {
      const other = route === "skyrootCanopy" ? "thunderGrotto" : "skyrootCanopy";
      const gates = { ...ALL_OPEN, cleared: ["stormbreakCoast", route, "ancientObservatory"] };
      for (const radius of [.35, .7]) {
        const reach = flood(gates, radius, [other], CLOUD_SPAWNS.windfallJunction);
        for (const id of ["obsLeafy", "obsBubbo", "obsPuff", "obsEmber"] as const) {
          const at = CLOUD_OBSTACLE_PLACE[id];
          expect(reach(at.x, at.z), id).toBe(true);
        }
        expect(reach(OBSERVATORY.rest.x, OBSERVATORY.rest.z)).toBe(true);
        expect(reach(OBSERVATORY.lift.x, OBSERVATORY.lift.z)).toBe(true);
        expect(reach(BEACON.x, BEACON.z)).toBe(true);
        const retreat = flood(gates, radius, [other], { x: BEACON.x, z: BEACON.z });
        expect(retreat(OBSERVATORY.entrance.x, OBSERVATORY.entrance.z)).toBe(true);
      }
    });
  }

  it("requires the clear and every distinct lamp at the lift, including mounted approaches", () => {
    for (const radius of [.35, .7]) {
      for (const missing of ["leafy", "bubbo", "puff", "ember"]) {
        const gates = { ...ALL_OPEN, observatoryLamps: ALL_OPEN.observatoryLamps!.filter(id => id !== missing) };
        expect(flood(gates, radius, [], CLOUD_SPAWNS.ancientObservatory)(0, 349), missing).toBe(false);
        expect(cloudMove(0, 333, 0, 340, radius, gates).z).toBeLessThan(334.5);
      }
      const uncleared = { ...ALL_OPEN, cleared: ALL_OPEN.cleared!.filter(id => id !== "ancientObservatory") };
      expect(cloudWalkable(0, 335, uncleared, radius)).toBe(false);
    }
  });

  it("places four mixed enemies on the observatory floor and keeps the arena bounded", () => {
    const enemies = CLOUD_ENEMY_SPAWNS.filter(e => e.zone === "ancientObservatory");
    expect(enemies).toHaveLength(4);
    expect(new Set(enemies.map(e => e.kind))).toEqual(new Set(["windSprite", "raiderShooter", "thunderBeetle"]));
    expect(cloudY(0, 325)).toBe(22);
    expect(cloudY(0, 335)).toBeGreaterThan(22);
    expect(cloudY(0, 349)).toBe(37);
    const pushed = cloudMove(10, 349, 30, 349, .35, ALL_OPEN);
    expect(cloudWalkable(pushed.x, pushed.z, ALL_OPEN, .35)).toBe(true);
    expect(pushed.x).toBeLessThan(12);
    expect(cloudNearestWalkable(0, 349, .35, ALL_OPEN)).toEqual({ x: 0, z: 349 });
  });
});
