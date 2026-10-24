import { describe, expect, it } from "vitest";
import {
  BRIDGE,
  CLIFF_TOP_SPOT,
  CROSSING,
  FOOD_SOURCES,
  FOREST_SIGN,
  INTERACT_RANGE,
  MAPLE,
  MONSTER_STONE,
  ROPE,
  SPAWN,
  X_WEST,
  Z_NORTH,
  FALLEN_PALM,
  LAVA,
  CAVE,
  GATE_PILLARS,
  SANCTUARY_GATE
} from "./island";
import { PLAYER_R, blocked, inForest, isWalkable, moveCircle, type Gates } from "./collision";
import { MONSTERS } from "../data/monsters";
import type { ObstacleId } from "../types";

const STEP = 0.5;

/** Flood fill of the cells a player can walk to from the spawn (real collision moves). */
function reachable(solved: ObstacleId[], forest = false, volcano = false, start = SPAWN, climb = false): Set<string> {
  const gates: Gates = { solved, forest, volcano };
  const key = (i: number, j: number) => `${i},${j}`;
  const toCell = (x: number, z: number) => [Math.round(x / STEP), Math.round(z / STEP)];
  const [si, sj] = toCell(start.x, start.z);
  const seen = new Set([key(si, sj)]);
  const queue: Array<[number, number]> = [[si, sj]];
  const enqueue = (x: number, z: number) => {
    const [i, j] = toCell(x, z);
    const k = key(i, j);
    if (!seen.has(k) && isWalkable(i * STEP, j * STEP, gates, PLAYER_R)) {
      seen.add(k);
      queue.push([i, j]);
    }
  };
  while (queue.length) {
    const [i, j] = queue.pop()!;
    // Puff's rope is a scripted transition, not a walkable ramp up the cliff.
    // Include the real interaction edge only once the rope has been solved.
    if (climb && solved.includes("cliff")) {
      if (Math.hypot(i * STEP - ROPE.x, j * STEP - ROPE.z) <= INTERACT_RANGE) enqueue(CLIFF_TOP_SPOT.x, CLIFF_TOP_SPOT.z);
      if (Math.hypot(i * STEP - CLIFF_TOP_SPOT.x, j * STEP - CLIFF_TOP_SPOT.z) <= INTERACT_RANGE) enqueue(ROPE.x, ROPE.z + 1.2);
    }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di;
      const nj = j + dj;
      const k = key(ni, nj);
      if (seen.has(k)) continue;
      const tx = ni * STEP;
      const tz = nj * STEP;
      if (tx < X_WEST - 1 || tx > 85 || tz < -151 || tz > 16) continue;
      if (!isWalkable(tx, tz, gates, PLAYER_R)) continue;
      const p = moveCircle(i * STEP, j * STEP, tx, tz, PLAYER_R, gates);
      if (Math.hypot(p.x - tx, p.z - tz) > 0.05) continue;
      seen.add(k);
      queue.push([ni, nj]);
    }
  }
  return seen;
}

function canReach(cells: Set<string>, x: number, z: number, range: number): boolean {
  for (const k of cells) {
    const [i, j] = k.split(",").map(Number);
    if (Math.hypot(i * STEP - x, j * STEP - z) <= range) return true;
  }
  return false;
}

describe("island reachability", () => {
  const closed = reachable([]);
  const palm = reachable(["fallenPalm"]);
  const all = reachable(["fallenPalm", "river"]);

  it("the spawn is open ground", () => {
    expect(isWalkable(SPAWN.x, SPAWN.z, { solved: [] }, PLAYER_R)).toBe(true);
    expect(blocked(SPAWN.x, SPAWN.z, PLAYER_R)).toBe(false);
  });

  it("Maple, Leafy and the west foods are reachable from the start", () => {
    expect(canReach(closed, MAPLE.x, MAPLE.z, INTERACT_RANGE)).toBe(true);
    expect(canReach(closed, MONSTERS.leafy.home.x, MONSTERS.leafy.home.z, INTERACT_RANGE)).toBe(true);
    for (const s of FOOD_SOURCES.filter((f) => f.food !== "fish" && f.z > Z_NORTH)) expect(canReach(closed, s.x, s.z, INTERACT_RANGE), s.id).toBe(true);
  });

  it("the fallen palm closes the east beach until Leafy moves it", () => {
    expect(canReach(closed, FALLEN_PALM.x, FALLEN_PALM.z, INTERACT_RANGE)).toBe(true);
    expect(canReach(closed, MONSTERS.bubbo.home.x, MONSTERS.bubbo.home.z, 3)).toBe(false);
    const fish = FOOD_SOURCES.find((f) => f.food === "fish")!;
    expect(canReach(closed, fish.x, fish.z, INTERACT_RANGE)).toBe(false);
    expect(canReach(palm, fish.x, fish.z, INTERACT_RANGE)).toBe(true);
    expect(canReach(palm, MONSTERS.bubbo.home.x, MONSTERS.bubbo.home.z, INTERACT_RANGE)).toBe(true);
  });

  it("the river closes the far bank until Bubbo crosses it", () => {
    expect(canReach(palm, CROSSING.west.x, CROSSING.west.z, 1)).toBe(true);
    expect(canReach(palm, MONSTER_STONE.x, MONSTER_STONE.z, 4)).toBe(false);
    expect(canReach(all, MONSTER_STONE.x, MONSTER_STONE.z, 3)).toBe(true);
    // ...and the stepping stones lead back again.
    expect(canReach(all, SPAWN.x, SPAWN.z, 0.5)).toBe(true);
  });

  it("nobody walks into the sea or the jungle", () => {
    for (const k of all) {
      const j = Number(k.split(",")[1]);
      expect(j * STEP).toBeGreaterThanOrEqual(Z_NORTH);
    }
  });

  const puff = MONSTERS.puff.home;
  const berries = FOOD_SOURCES.filter((f) => f.id === "berry2" || f.id === "berry3");
  const opened = reachable(["fallenPalm", "river"], true);
  const bridged = reachable(["fallenPalm", "river", "bridge"], true);
  const everything = reachable(["fallenPalm", "river", "bridge", "cliff"], true);

  it("the bramble closes the forest until the Phase 1 ending", () => {
    expect([...all].some((k) => k.split(",").map(Number)[1] * STEP < Z_NORTH - 1)).toBe(false);
    expect(canReach(all, FOREST_SIGN.x, FOREST_SIGN.z, INTERACT_RANGE)).toBe(true);
    expect(canReach(opened, BRIDGE.x, BRIDGE.z1 + 0.6, 1)).toBe(true);
  });

  it("the broken bridge closes the hills until Leafy repairs it", () => {
    expect(canReach(opened, puff.x, puff.z, 4)).toBe(false);
    for (const b of berries) expect(canReach(opened, b.x, b.z, INTERACT_RANGE), b.id).toBe(false);
    expect(canReach(bridged, puff.x, puff.z, INTERACT_RANGE)).toBe(true);
    for (const b of berries) expect(canReach(bridged, b.x, b.z, INTERACT_RANGE), b.id).toBe(true);
    expect(canReach(bridged, ROPE.x, ROPE.z, INTERACT_RANGE)).toBe(true);
    // ...and the bridge leads back to the beach.
    expect(canReach(bridged, SPAWN.x, SPAWN.z, 0.5)).toBe(true);
  });

  it("the cliff top is reached only by the rope, never on foot", () => {
    expect(canReach(everything, CLIFF_TOP_SPOT.x, CLIFF_TOP_SPOT.z, 2)).toBe(false);
    expect(isWalkable(CLIFF_TOP_SPOT.x, CLIFF_TOP_SPOT.z, { solved: ["fallenPalm", "river", "bridge", "cliff"], forest: true }, PLAYER_R)).toBe(true);
    expect(isWalkable(CLIFF_TOP_SPOT.x, CLIFF_TOP_SPOT.z, { solved: ["fallenPalm", "river", "bridge"], forest: true }, PLAYER_R)).toBe(false);
  });

  it("the forest stays inside its own clearings", () => {
    for (const k of everything) {
      const [i, j] = k.split(",").map(Number);
      if (j * STEP < Z_NORTH - 0.5) expect(inForest(i * STEP, j * STEP), k).toBe(true);
    }
  });
});

describe("required interactions remain reachable through each chapter", () => {
  const beach: ObstacleId[] = ["fallenPalm", "river"];
  const hills: ObstacleId[] = [...beach, "bridge"];
  const top: ObstacleId[] = [...hills, "cliff"];
  const cooled: ObstacleId[] = [...top, "lava"];
  const lit: ObstacleId[] = [...cooled, "cave"];
  const final: ObstacleId[] = [...lit, ...Object.keys(GATE_PILLARS) as ObstacleId[]];
  const cases = [
    { chapter: "beach arrival", solved: [] as ObstacleId[], forest: false, volcano: false, targets: [MAPLE, MONSTERS.leafy.home, FALLEN_PALM, ...FOOD_SOURCES.filter((f) => ["apple1", "apple2", "banana", "berry"].includes(f.id))] },
    { chapter: "palm lifted", solved: ["fallenPalm"] as ObstacleId[], forest: false, volcano: false, targets: [MONSTERS.bubbo.home, CROSSING.west, ...FOOD_SOURCES.filter((f) => f.food === "fish")] },
    { chapter: "forest opened", solved: beach, forest: true, volcano: false, targets: [MONSTER_STONE, FOREST_SIGN, { x: BRIDGE.x, z: BRIDGE.z1 + 0.6 }] },
    { chapter: "bridge repaired", solved: hills, forest: true, volcano: false, targets: [MONSTERS.puff.home, ROPE, ...FOOD_SOURCES.filter((f) => ["berry2", "berry3"].includes(f.id))] },
    { chapter: "cliff climbed", solved: top, forest: true, volcano: true, targets: [CLIFF_TOP_SPOT, LAVA] },
    { chapter: "lava cooled", solved: cooled, forest: true, volcano: true, targets: [MONSTERS.ember.home, CAVE, ...FOOD_SOURCES.filter((f) => f.food === "meat")] },
    { chapter: "cave lit", solved: lit, forest: true, volcano: true, targets: Object.values(GATE_PILLARS) },
    { chapter: "sanctuary opened", solved: final, forest: true, volcano: true, targets: [MAPLE, ...Object.values(MONSTERS).map((m) => m.home), ...FOOD_SOURCES, FALLEN_PALM, CROSSING.west, MONSTER_STONE, FOREST_SIGN, { x: BRIDGE.x, z: BRIDGE.z1 + 0.6 }, ROPE, CLIFF_TOP_SPOT, LAVA, CAVE, ...Object.values(GATE_PILLARS), SANCTUARY_GATE] }
  ];

  for (const state of cases) {
    it(`${state.chapter}: quest objects, NPCs and pickups can be approached from spawn`, () => {
      const cells = reachable(state.solved, state.forest, state.volcano, SPAWN, true);
      for (const p of state.targets) expect(canReach(cells, p.x, p.z, INTERACT_RANGE), `${state.chapter}: ${p.x},${p.z}`).toBe(true);
    });
  }
});

describe("volcano and sanctuary reachability", () => {
  const phase2: ObstacleId[] = ["fallenPalm", "river", "bridge", "cliff"];
  const start = { ...CLIFF_TOP_SPOT, yaw: 0 };
  const fromTop = (solved: ObstacleId[], volcano = true) => reachable(solved, true, volcano, start);
  const hot = fromTop(phase2);
  const cooled = fromTop([...phase2, "lava"]);
  const lit = fromTop([...phase2, "lava", "cave"]);
  const pillars = Object.keys(GATE_PILLARS) as ObstacleId[];

  it("the lava replaces the cliff rockfall and guards Ember and the only meat", () => {
    expect(canReach(hot, LAVA.x, LAVA.z, INTERACT_RANGE)).toBe(true);
    expect(canReach(hot, MONSTERS.ember.home.x, MONSTERS.ember.home.z, INTERACT_RANGE)).toBe(false);
    expect(canReach(cooled, MONSTERS.ember.home.x, MONSTERS.ember.home.z, INTERACT_RANGE)).toBe(true);
    const meat = FOOD_SOURCES.find((s) => s.food === "meat")!;
    expect(canReach(hot, meat.x, meat.z, INTERACT_RANGE)).toBe(false);
    expect(canReach(cooled, meat.x, meat.z, INTERACT_RANGE)).toBe(true);
    expect(canReach(fromTop([...phase2, "lava"], false), meat.x, meat.z, INTERACT_RANGE)).toBe(false);
  });

  it("the dark cave stops the player before the sanctuary until Ember lights it", () => {
    expect(canReach(cooled, CAVE.x, CAVE.z, INTERACT_RANGE)).toBe(true);
    for (const p of Object.values(GATE_PILLARS)) {
      expect(canReach(cooled, p.x, p.z, INTERACT_RANGE)).toBe(false);
      expect(canReach(lit, p.x, p.z, INTERACT_RANGE)).toBe(true);
    }
    expect(canReach(lit, MONSTERS.lumo.home.x, MONSTERS.lumo.home.z, INTERACT_RANGE)).toBe(false);
  });

  it("each pillar is necessary and all four open a permanent passage both ways", () => {
    for (const omitted of pillars) {
      const cells = fromTop([...phase2, "lava", "cave", ...pillars.filter((p) => p !== omitted)]);
      expect(canReach(cells, MONSTERS.lumo.home.x, MONSTERS.lumo.home.z, INTERACT_RANGE), omitted).toBe(false);
    }
    const opened = fromTop([...phase2, "lava", "cave", ...pillars]);
    expect(canReach(opened, SANCTUARY_GATE.x, SANCTUARY_GATE.z, 0.5)).toBe(true);
    expect(canReach(opened, MONSTERS.lumo.home.x, MONSTERS.lumo.home.z, INTERACT_RANGE)).toBe(true);
    expect(canReach(opened, CLIFF_TOP_SPOT.x, CLIFF_TOP_SPOT.z, 0.5)).toBe(true);
  });
});
