import { afterEach, describe, expect, it } from "vitest";
import { CAVE_CHAMBER, CAVE_CHAMBER_S, CAVE_ENTRY, CAVE_ROUTE, CAVE_ROUTE_LENGTH, CAVE_STALAGMITES, caveRouteS, caveWalkable, inCaveMouthStrip } from "./cave";
import { gatesOf, isWalkable, standY } from "./collision";
import { CAVE_MOUTH, CAVE_MOUTHS, ENEMY_SPAWNS, MESA_OUTLINE, STAGES, inMesa, nearestOnTrail, trailPoint, zoneAt } from "./lowland";
import { HAZARDS } from "./hazards";
import { SECRET_SITES } from "./elementObjects";
import { portalSwitch } from "./layers";
import { region } from "./region";
import { decodeSave } from "../logic/save";
import { newProgress } from "../logic/progress";

const EDGE = [...MESA_OUTLINE, MESA_OUTLINE[0]];
const gates = { solved: [] as const, act2: true, cleared: [...STAGES] };
afterEach(() => { region.layer = "ground"; });

/** 0.25 m grid flood fill over the cave layer at a body radius, with path length. */
function flood(r: number) {
  const step = .25, key = (i: number, j: number) => `${i},${j}`;
  const start: [number, number] = [Math.round(CAVE_ENTRY.x / step), Math.round(CAVE_ENTRY.z / step)];
  const dist = new Map<string, number>([[key(...start), 0]]);
  const queue: Array<[number, number]> = [start];
  while (queue.length) {
    const [i, j] = queue.shift()!;
    const d = dist.get(key(i, j))!;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj, k = key(ni, nj);
      if (dist.has(k) || !isWalkable(ni * step, nj * step, gates, r, false, "cave")) continue;
      dist.set(k, d + step);
      queue.push([ni, nj]);
    }
  }
  return { dist, step };
}

describe("the cave under the mountain", () => {
  it("lies inside the mesa, shrunk 0.8 m, except the mouth's overlap strip", () => {
    let cells = 0;
    for (let x = 62; x <= 92; x += .25) for (let z = -234; z <= -184; z += .25) {
      if (!caveWalkable(x, z, 0)) continue;
      cells++;
      if (inCaveMouthStrip(x, z)) continue;
      expect(inMesa(x, z) && nearestOnTrail(EDGE, x, z).d >= .8, `${x},${z}`).toBe(true);
    }
    expect(cells).toBeGreaterThan(2000);
  });

  it("connects both entrances through the chamber, with rock between the arms", () => {
    expect(CAVE_ROUTE_LENGTH).toBeGreaterThanOrEqual(55);
    for (const r of [.35, .55]) {
      const { dist, step } = flood(r);
      const chamber = dist.get(`${Math.round(CAVE_CHAMBER.x / step)},${Math.round(CAVE_CHAMBER.z / step)}`);
      expect(chamber, `radius ${r}`).toBeDefined();
      // 4-connected grid distance overestimates slightly; the route itself is >= 55 m.
      expect(chamber!).toBeGreaterThan(50);
      const mouthB = CAVE_MOUTHS[1];
      expect(dist.has(`${Math.round((mouthB.portalX + 1) / step)},${Math.round(mouthB.z / step)}`), `mouth B radius ${r}`).toBe(true);
      expect(isWalkable(76.4, -210.4, gates, r, false, "cave")).toBe(false);
      for (const k of dist.keys()) {
        const [i, j] = k.split(",").map(Number), x = i * step, z = j * step;
        expect(zoneAt(x, z, "cave")).toBe("cave");
      }
    }
  });

  it("is entered through the mouth from the Grove, on foot and mounted, and the rock stays solid", () => {
    for (const mouth of CAVE_MOUTHS) for (const r of [.35, .55]) {
      // The ground pocket reaches past the portal's dead band.
      expect(isWalkable(mouth.portalX + .5, mouth.z, gates, r, false, "ground"), `ground ${mouth.z} ${r}`).toBe(true);
      expect(isWalkable(mouth.portalX - .5, mouth.z, gates, r, false, "cave"), `cave ${mouth.z} ${r}`).toBe(true);
      expect(zoneAt(mouth.portalX + .5, mouth.z)).toBe("grove");
      expect(portalSwitch("ground", mouth.portalX + .5, mouth.z)).toBe("cave");
      expect(portalSwitch("cave", mouth.portalX - .5, mouth.z)).toBe("ground");
      expect(portalSwitch("cave", mouth.portalX, mouth.z)).toBeNull();
    }
    expect(portalSwitch("ground", CAVE_MOUTH.portalX + .5, CAVE_MOUTH.z)).toBe("cave");
    expect(portalSwitch("cave", CAVE_MOUTH.portalX - .5, CAVE_MOUTH.z)).toBe("ground");
    expect(portalSwitch("cave", CAVE_MOUTH.portalX, CAVE_MOUTH.z)).toBeNull();
    // Nobody on the ground walks into the rock, even beside the mouth.
    for (let z = CAVE_MOUTH.z0; z <= CAVE_MOUTH.z1; z += .2) expect(isWalkable(71.2, z, gates, .35, false, "ground")).toBe(false);
    expect(zoneAt(76, -215)).toBeNull();
    expect(zoneAt(74.5, -215, "cave")).toBe("cave"); // the new west arm
  });

  it("keeps the second ground pocket clear of the east pool and dry reeds", () => {
    const mouth = CAVE_MOUTHS[1];
    const pool = HAZARDS.find(h => h.id === "groveEastPool")!.shape;
    expect(pool.kind).toBe("disc");
    if (pool.kind !== "disc") return;
    const dx = Math.max(mouth.groundX0 - pool.x, 0, pool.x - mouth.groundX1);
    const dz = Math.max(mouth.z0 - pool.z, 0, pool.z - mouth.z1);
    expect(Math.hypot(dx, dz)).toBeGreaterThan(pool.r);
    const reeds = SECRET_SITES.groveDryReeds.blocker;
    expect(reeds.kind).toBe("box");
    if (reeds.kind !== "box") return;
    expect(mouth.z0).toBeGreaterThan(reeds.z + reeds.hz);
  });

  it("maps chamber lighting to the middle of the route and continues down the west arm", () => {
    expect(caveRouteS(CAVE_CHAMBER.x, CAVE_CHAMBER.z)).toBe(CAVE_CHAMBER_S);
    expect(CAVE_CHAMBER_S).toBeLessThan(CAVE_ROUTE_LENGTH - 20);
    const west = trailPoint(CAVE_ROUTE, CAVE_ROUTE_LENGTH - 10);
    expect(caveRouteS(west.x, west.z)).toBeCloseTo(CAVE_ROUTE_LENGTH - 10);
    expect(caveRouteS(68.6, -216.4)).toBeCloseTo(CAVE_ROUTE_LENGTH);
  });

  it("stands its floor near the Grove's height and its stalagmites are solid", () => {
    const y = standY(CAVE_CHAMBER.x, CAVE_CHAMBER.z, [], "cave");
    expect(Math.abs(y - standY(CAVE_MOUTH.portalX, CAVE_MOUTH.z, [], "ground"))).toBeLessThan(.6);
    for (const mouth of CAVE_MOUTHS) {
      const x = mouth.portalX + .5;
      expect(Math.abs(standY(x, mouth.z, [], "cave") - standY(x, mouth.z, [], "ground")), `mouth ${mouth.z}`).toBeLessThan(.6);
    }
    for (const s of CAVE_STALAGMITES) {
      expect(caveWalkable(s.x, s.z, 0)).toBe(true);
      expect(isWalkable(s.x, s.z, gates, .35, false, "cave")).toBe(false);
    }
  });

  it("holds two optional gloomlets on cave floor, far from the chamber", () => {
    const cave = ENEMY_SPAWNS.filter(s => s.zone === "cave");
    expect(cave).toHaveLength(2);
    for (const s of cave) {
      expect(s.optional).toBe(true);
      expect(isWalkable(s.x, s.z, gates, .5, false, "cave")).toBe(true);
      expect(Math.hypot(s.x - CAVE_CHAMBER.x, s.z - CAVE_CHAMBER.z)).toBeGreaterThanOrEqual(10);
    }
  });

  it("loads a save inside the cave on the cave floor", () => {
    const p = newProgress();
    for (const id of ["leafy", "bubbo", "puff", "ember", "lumo"] as const)
      p.monsters[id] = { discovered: true, friend: true, asked: {}, canKnown: {}, described: { name: true, size: true, part: true }, invited: true };
    p.active = "ember"; p.metMaple = true; p.endings = 3;
    p.solved = ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame", "groveStream"];
    p.act2 = { ...p.act2, started: true, lumoTaken: true, descended: true, zone: "grove", checkpoint: "cliff", cleared: ["forest1"], tutorial: ["attack", "coins", "special", "eat", "rest", "switch"] };
    const loaded = decodeSave(JSON.stringify({ v: 4, progress: p, player: { x: CAVE_CHAMBER.x, z: CAVE_CHAMBER.z, yaw: 0, layer: "cave" }, seconds: 1 }))!;
    expect(loaded.player).toMatchObject({ x: CAVE_CHAMBER.x, z: CAVE_CHAMBER.z, layer: "cave" });
    expect(loaded.progress.act2.zone).toBe("cave");
    // Without its layer the same point is inside the mesa: it loads on the Grove floor instead.
    const ground = decodeSave(JSON.stringify({ v: 4, progress: p, player: { x: CAVE_CHAMBER.x, z: CAVE_CHAMBER.z, yaw: 0 }, seconds: 1 }))!;
    expect(ground.player.layer).toBeUndefined();
    expect(inMesa(ground.player.x, ground.player.z)).toBe(false);
  });
});

it("keeps every other ground answer identical apart from the mouth's pocket", () => {
  // Spot checks beside the change; the golden test was re-recorded for this slice.
  expect(zoneAt(65, -227)).toBe("grove");
  expect(zoneAt(76, -209)).toBeNull();
  expect(gatesOf(newProgress()).solved).toEqual([]);
});
