import { afterEach, expect, it, vi } from "vitest";
import { MONSTERS } from "./data/monsters";
import { newProgress } from "./logic/progress";
import { resetRuntime, rt } from "./runtime";
import { getGame, setGame } from "./store";
import { tick } from "./sim";
import { PHASE3_PLACE } from "./flow/obstacles";
import { PLAYER_R, gatesOf, isWalkable, moveCircle } from "./world/collision";
import { CLIFF_TOP_SPOT, LAVA } from "./world/island";

vi.mock("../audio/audio", () => ({ audio: { setNearness: vi.fn(), voice: vi.fn(), play: vi.fn() } }));

afterEach(() => {
  resetRuntime();
  setGame({ screen: "title", progress: newProgress() });
});

it("keeps Ember at home behind hot lava, then allows him to wander after cooling", () => {
  resetRuntime();
  const progress = { ...newProgress(), endings: 2, solved: ["fallenPalm", "river", "bridge", "cliff"] as const };
  setGame({ screen: "game", mode: "busy", progress: { ...progress, solved: [...progress.solved] } });
  Object.assign(rt.player, CLIFF_TOP_SPOT);
  const m = rt.monsters.ember;
  const home = MONSTERS.ember.home;
  const target = { x: home.x + 1, z: home.z };
  m.mode = "wander";
  m.target = target;
  m.until = rt.time + 10;
  tick(0.1);
  expect({ x: m.x, z: m.z }).toEqual({ x: home.x, z: home.z });

  setGame({ progress: { ...getGame().progress, solved: [...progress.solved, "lava"] } });
  m.mode = "wander";
  m.target = target;
  tick(0.1);
  // Solid rocks may project the first step away from the nominal home point.
  expect(Math.hypot(m.x - home.x, m.z - home.z)).toBeGreaterThan(0);
  expect(Math.hypot(m.x - home.x, m.z - home.z)).toBeLessThan(home.r);
  expect(isWalkable(m.x, m.z, gatesOf(getGame().progress), MONSTERS.ember.radius)).toBe(true);
});

it("can approach hot lava from the cliff top and cross only after cooling", () => {
  const gates = gatesOf({ endings: 2, solved: ["fallenPalm", "river", "bridge", "cliff"] });
  const place = PHASE3_PLACE.lava;
  const approach = moveCircle(CLIFF_TOP_SPOT.x, CLIFF_TOP_SPOT.z, place.x, place.z, PLAYER_R, gates);
  expect(approach.x).toBeCloseTo(place.x);
  expect(approach.z).toBeCloseTo(place.z);
  const hot = moveCircle(approach.x, approach.z, LAVA.x, LAVA.z0 - 1, PLAYER_R, gates);
  expect(hot.z).toBeGreaterThanOrEqual(LAVA.z1 + PLAYER_R);
  expect(isWalkable(LAVA.x, LAVA.z, gates, PLAYER_R)).toBe(false);
  const cooled = { ...gates, solved: [...gates.solved, "lava" as const] };
  const crossed = moveCircle(approach.x, approach.z, LAVA.x, LAVA.z0 - 1, PLAYER_R, cooled);
  expect(crossed.z).toBeCloseTo(LAVA.z0 - 1);
});
