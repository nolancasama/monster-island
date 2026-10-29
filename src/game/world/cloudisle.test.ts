import { describe, expect, it } from "vitest";
import {
  CLOUD_CHESTS, CLOUD_DOCK, CLOUD_ENEMY_SPAWNS, CLOUD_OBSTACLE_PLACE, CLOUD_PICKUPS, CLOUD_PUZZLES, CLOUD_ROUTE_REQUIRED,
  CLOUD_SPAWNS, COAST_GATE, HOLLOW, RAIDER_BARRICADE, ROUTE_MOUTHS,
  cloudMove, cloudNearestWalkable, cloudWalkable, cloudWindAt, cloudY, cloudZoneAt, electricPanelActive,
  type CloudArea, type CloudGates,
} from "./cloudisle";

const OPEN: CloudGates = { cleared: ["stormbreakCoast"], solved: ["coastWindmill", "coastCrate"], tunnelOpen: true };
const ALL_OPEN: CloudGates = { ...OPEN, cleared: ["stormbreakCoast", "skyrootCanopy", "thunderGrotto"], solved: CLOUD_PUZZLES };
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
    for (const p of [...CLOUD_PICKUPS, ...CLOUD_CHESTS].filter(p => p.z <= 100)) expect(reach(p.x, p.z), p.id).toBe(true);
    for (const m of ROUTE_MOUTHS) expect(reach(m.x, m.z, 2)).toBe(true);
  });
  it("requires the coast first clear, including mounted edge approaches, and always allows retreat", () => {
    for (const radius of [.35, .7]) {
      const g = { ...OPEN, cleared: [] };
      const reach = flood(g, radius);
      expect(reach(HOLLOW.center.x, HOLLOW.center.z)).toBe(false);
      for (const e of CLOUD_ENEMY_SPAWNS.filter(e => e.zone === "stormbreakCoast")) expect(reach(e.x, e.z, 1.5)).toBe(true);
      for (let x = -12; x <= 12; x += .3) expect(cloudWalkable(x, COAST_GATE.z, g, radius)).toBe(false);
      expect(cloudMove(0, 42, 0, 46, radius, g).z).toBeLessThan(COAST_GATE.z);
      expect(cloudMove(0, 42, 0, 46, radius, OPEN).z).toBeCloseTo(46);
      expect(cloudMove(0, 42, 0, 39, radius, g).z).toBeCloseTo(39);
    }
  });
  it("needs the family's tunnel and never opens the raider road or observatory interior", () => {
    expect(flood({ ...OPEN, tunnelOpen: false })(0, 90)).toBe(false);
    expect(flood(OPEN, .35, ["hiddenHollow"])(0, 90)).toBe(false);
    for (const radius of [.35, .7]) {
      for (let x = 1; x <= 9; x += .3) expect(cloudWalkable(x, RAIDER_BARRICADE.z, OPEN, radius)).toBe(false);
      expect(cloudMove(5, 55, 5, 60, radius, OPEN).z).toBeLessThan(RAIDER_BARRICADE.z);
    }
    expect(cloudWalkable(0, 137, ALL_OPEN, .35)).toBe(false);
  });
  it("keeps both optional coves closed until their own free ability puzzle", () => {
    expect(flood({ ...OPEN, solved: [] })(-17, 30)).toBe(false);
    expect(flood({ ...OPEN, solved: [] })(17, 39)).toBe(false);
    const reach = flood({ ...OPEN, solved: [] });
    for (const id of ["coastWindmill", "coastCrate"] as const) {
      const p = CLOUD_OBSTACLE_PLACE[id]; expect(reach(p.x, p.z, 1.2)).toBe(true);
    }
  });
  it("puts every enemy on its area ground, and projects invalid saved ground", () => {
    for (const e of CLOUD_ENEMY_SPAWNS) {
      expect(cloudZoneAt(e.x, e.z)).toBe(e.zone);
      expect(cloudWalkable(e.x, e.z, ALL_OPEN, .5)).toBe(true);
    }
    const p = cloudNearestWalkable(999, -999, .35, {});
    expect(cloudWalkable(p.x, p.z, {}, .35)).toBe(true);
    expect(cloudNearestWalkable(NaN, Infinity, .35, {})).toEqual(CLOUD_DOCK.spawn);
    expect(cloudY(0, 90)).toBeGreaterThan(cloudY(0, 0));
  });
  it("supplies wind acceleration only as a projectile/light-prop query", () => {
    expect(cloudWindAt(-4, 20).x).toBeGreaterThan(0);
    expect(cloudWindAt(2, 34).x).toBeLessThan(0);
    expect(cloudWindAt(-13, 57)).toEqual({ x: 0, z: 0 });
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
        expect(reach(route.x, 106), "route mouth").toBe(true);
        expect(reach(route.x, 123), "far route ground").toBe(true);
        expect(reach(0, 132), "shared observatory approach").toBe(true);
        const retreat = flood(gates, radius, [route.other], { x: 0, z: 132 });
        expect(retreat(0, 90), "retreat to junction").toBe(true);
      }
    });
    for (const missing of route.required) {
      it(`requires ${missing}, even with all clears and the other required puzzle solved`, () => {
        const gates = { ...ALL_OPEN, solved: CLOUD_PUZZLES.filter(id => id !== missing) };
        for (const radius of [.35, .7]) {
          const reach = flood(gates, radius, [route.other], CLOUD_SPAWNS.windfallJunction);
          const place = CLOUD_OBSTACLE_PLACE[missing];
          expect(reach(place.x, place.z, 1.5), "required interaction reachable").toBe(true);
          expect(reach(route.x, 123), "cannot bypass required mechanism").toBe(false);
          expect(reach(0, 132), "cannot reach approach through this route").toBe(false);
        }
      });
    }
    it(`blocks the ${route.area} far gate before its first clear without blocking retreat`, () => {
      for (const radius of [.35, .7]) {
        const gates = { ...ALL_OPEN, cleared: ["stormbreakCoast"] };
        const reach = flood(gates, radius, [route.other], CLOUD_SPAWNS.windfallJunction);
        expect(reach(route.x, 123)).toBe(true);
        expect(reach(0, 132)).toBe(false);
        for(let x=route.x-10;x<=route.x+10;x+=.3) expect(cloudWalkable(x,127,gates,radius),`gate edge ${x}`).toBe(false);
        const retreat = flood(gates, radius, [route.other], { x: route.x, z: 123 });
        expect(retreat(0, 90)).toBe(true);
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
    expect(flood({ ...ALL_OPEN, solved: CLOUD_PUZZLES.filter(id => id !== "canopyGust") })(-32, 123)).toBe(false);
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
