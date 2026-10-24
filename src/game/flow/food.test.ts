import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { newProgress } from "../logic/progress";
import { resetRuntime, rt } from "../runtime";
import { getGame, setGame } from "../store";
import { tick } from "../sim";
import { FOOD_SOURCES } from "../world/island";
import { BAG_MAX } from "../data/foods";
import { findFocus } from "./focus";
import { interact } from "./actions";

vi.mock("../../audio/audio", () => ({ audio: { setNearness: vi.fn(), voice: vi.fn(), play: vi.fn() } }));

const apple = FOOD_SOURCES.find((s) => s.food === "apples")!;

beforeEach(() => {
  vi.stubGlobal("window", { setTimeout: () => 0 });
  resetRuntime();
  setGame({ screen: "game", mode: "explore", progress: newProgress(), toasts: [] });
  // Stand just south of the apple, facing it.
  rt.player.x = apple.x;
  rt.player.z = apple.z + 1;
  rt.player.yaw = Math.PI;
});

afterEach(() => {
  resetRuntime();
  setGame({ screen: "title", progress: newProgress() });
  vi.unstubAllGlobals();
});

const focusId = () => findFocus()?.id;

it("food is collectible exactly while it is shown, once per regrowth", () => {
  expect(focusId()).toBe(apple.id);
  interact(findFocus());
  expect(getGame().progress.bag.apples).toBe(1);
  expect(rt.taken.has(apple.id)).toBe(true);
  // Gone (not shown, not focusable) and a second pick does nothing.
  expect(focusId()).not.toBe(apple.id);
  interact({ id: apple.id, kind: "food", verb: "Get", noun: "", x: apple.x, z: apple.z });
  expect(getGame().progress.bag.apples).toBe(1);
  // Just before it grows back it is still unavailable; the moment it is back it can be picked.
  for (let t = 0; t < apple.regrow - 0.2; t += 0.1) tick(0.1);
  expect(rt.taken.has(apple.id)).toBe(true);
  for (let i = 0; i < 4; i++) tick(0.1);
  expect(rt.taken.has(apple.id)).toBe(false);
  expect(rt.ripe.has(apple.id)).toBe(true);
  expect(focusId()).toBe(apple.id);
  interact(findFocus());
  expect(getGame().progress.bag.apples).toBe(2);
});

it("a full bag still focuses the food and says so instead of doing nothing", () => {
  setGame({ progress: { ...newProgress(), bag: { apples: BAG_MAX } } });
  expect(focusId()).toBe(apple.id);
  interact(findFocus());
  expect(getGame().progress.bag.apples).toBe(BAG_MAX);
  expect(rt.taken.has(apple.id)).toBe(false);
  expect(getGame().toasts.at(-1)?.en).toBe("Your bag is full!");
});
