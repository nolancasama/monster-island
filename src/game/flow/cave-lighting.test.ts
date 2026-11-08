import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { basicAttack, cb, elementObjectStates, hooks, resetCombat, specialAttack } from "../combat";
import { newProgress } from "../logic/progress";
import { resetRuntime, rt } from "../runtime";
import { getGame, setGame } from "../store";
import { CAVE_BRAZIERS, CAVE_ROUTE, CAVE_ROUTE_LENGTH, CAVE_TORCHES } from "../world/cave";
import { CAVE_MOUTHS, trailPoint } from "../world/lowland";
import { gatesOf, moveCircle } from "../world/collision";
import { ask } from "./ask";
import { findFocus } from "./focus";
import { ACT2_PLACE, lightCaveTorches, useObstacle } from "./obstacles";

vi.mock("../../audio/audio", () => ({ audio: { play: vi.fn(), voice: vi.fn() } }));
vi.mock("./ask", async original => ({
  ...await original<typeof import("./ask")>(),
  ask: vi.fn(), say: vi.fn(async () => {}),
  wait: vi.fn(async (ms: number) => { rt.time += ms / 1000; })
}));

beforeEach(() => {
  vi.stubGlobal("window", { setTimeout: () => 0 });
  resetRuntime(); vi.clearAllMocks();
  vi.mocked(ask).mockReset();
  const progress = newProgress();
  progress.act2.started = progress.act2.descended = true;
  progress.active = "ember";
  progress.monsters.ember.friend = progress.monsters.ember.discovered = true;
  setGame({ screen: "game", mode: "explore", progress, toasts: [], panel: null, line: null, journalOpen: false, settingsOpen: false });
  vi.mocked(ask).mockResolvedValueOnce("canFire").mockResolvedValueOnce("thankYou");
});
afterEach(() => {
  resetRuntime(); setGame({ screen: "title", progress: newProgress() });
  vi.unstubAllGlobals();
});

it.each([0, 1])("offers the English obstacle at mouth %s and ignites its nearest brazier", async index => {
  const mouth = CAVE_MOUTHS[index];
  const held = moveCircle(mouth.portalX - 1, mouth.z, mouth.portalX + 1, mouth.z, .35, gatesOf(getGame().progress), false, [], undefined, "ground");
  expect(held.x).toBeLessThanOrEqual(mouth.portalX);
  Object.assign(rt.player, held);
  Object.assign(rt.monsters.ember, { x: rt.player.x, z: rt.player.z });
  const brazier = CAVE_BRAZIERS.reduce((best, b) =>
    Math.hypot(b.x - rt.player.x, b.z - rt.player.z) < Math.hypot(best.x - rt.player.x, best.z - rt.player.z) ? b : best);
  expect(findFocus()).toMatchObject({ id: "caveTorches", kind: "obstacle", x: ACT2_PLACE.caveTorches.x, z: ACT2_PLACE.caveTorches.z });
  await useObstacle("caveTorches");
  expect(ask).toHaveBeenNthCalledWith(1, expect.objectContaining({ show: ["canFire"] }));
  expect(getGame().progress.solved).toContain("caveTorches");
  expect(rt.caveTorches).toMatchObject({ originS: index === 0 ? 0 : CAVE_ROUTE_LENGTH, animating: true });
  expect(rt.caveTorches.jet!.to).toMatchObject({ x: brazier.x, z: brazier.z });
  expect(rt.monsters.ember.x).toBeCloseTo(brazier.x - 1.75);
  expect(rt.monsters.ember.z).toBeCloseTo(brazier.z - .25);
});

it("fire on any brazier or cave torch only sparkles and never solves the environmental lights", () => {
  for (const object of [...CAVE_BRAZIERS, ...CAVE_TORCHES]) {
    hooks.caveFlame!(object.id);
    expect(getGame().progress.solved).not.toContain("caveTorches");
    expect(rt.caveTorches).toMatchObject({ originS: 0, spread: 0, animating: false });
    expect(rt.effects.at(-1)).toMatchObject({ kind: "sparkle", x: object.x, z: object.z });
  }
  expect(getGame().toasts).toEqual([]);
});

for (const move of ["Fire Breath", "Inferno"] as const) for (const layer of ["ground", "cave"] as const) {
  it(`${move} reacts locally to a ${layer === "ground" ? "brazier" : "torch"} without opening either cave mouth`, () => {
    const object = layer === "ground" ? CAVE_BRAZIERS[0] : CAVE_TORCHES[0];
    // The mouth centre keeps the ray inside the approach pocket to the brazier's rim.
    const at = layer === "ground" ? { x: 68, z: -227 } : trailPoint(CAVE_ROUTE, object.s);
    Object.assign(rt.player, at, { layer, yaw: Math.atan2(object.x - at.x, object.z - at.z) });
    rt.time = 10;
    resetCombat();
    cb.stance = { friend: "ember", k: 1, fromX: at.x, fromZ: at.z, leaving: null, leaveK: 0 };
    expect(move === "Fire Breath" ? basicAttack() : specialAttack()).toBe(true);
    expect(elementObjectStates().find(o => o.id === object.id)?.state).toBe("lit");
    expect(getGame().progress.solved).not.toContain("caveTorches");
    expect(rt.caveTorches).toMatchObject({ spread: 0, animating: false });
  });
}

it("keeps the original light source after solving and resets it for a new game", () => {
  expect(lightCaveTorches(CAVE_ROUTE_LENGTH)).toBe(true);
  rt.caveTorches.spread = .5;
  expect(lightCaveTorches(0)).toBe(false);
  expect(rt.caveTorches).toMatchObject({ originS: CAVE_ROUTE_LENGTH, spread: .5 });
  resetRuntime();
  expect(rt.caveTorches).toMatchObject({ originS: 0, spread: 0, animating: false, jet: null });
});
