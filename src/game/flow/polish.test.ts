import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cb, combatTick, hooks, resetCombat } from "../combat";
import { newProgress } from "../logic/progress";
import { resetRuntime, rt } from "../runtime";
import { getGame, setGame } from "../store";
import { CAMP2, CHESTS } from "../world/lowland";
import { findFocus } from "./focus";
import { openChestScene, talkToKeeper } from "./act2";
import { ask, say } from "./ask";
import type { PhraseId } from "../logic/english";
import { FOOD_SOURCES } from "../world/island";
import { interact } from "./actions";

vi.mock("../../audio/audio", () => ({ audio: { play: vi.fn(), setScene: vi.fn(), startMusic: vi.fn() } }));
vi.mock("./ask", async (original) => ({
  ...await original<typeof import("./ask")>(),
  ask: vi.fn(), say: vi.fn(async () => {}), fastMode: () => true,
  wait: vi.fn(async () => { rt.time += 1; })
}));
vi.mock("./script", async (original) => ({
  ...await original<typeof import("./script")>(),
  frameTwo: vi.fn(),
  fadeThrough: vi.fn(async (during: () => void | Promise<void>) => { await during(); })
}));

beforeEach(() => {
  vi.stubGlobal("window", { setTimeout: () => 0 });
  resetRuntime();
  const progress = newProgress();
  progress.act2 = { ...progress.act2, started: true, descended: true, portFound: true, coins: 25 };
  setGame({ screen: "game", mode: "explore", progress, toasts: [], journalOpen: false, settingsOpen: false });
  resetCombat();
  cb.vitals = { hp: 12, mp: { leafy: 1, bubbo: 2, puff: 3, ember: 4 } };
  vi.clearAllMocks();
});

afterEach(() => {
  resetRuntime();
  setGame({ screen: "title", progress: newProgress() });
  resetCombat();
  vi.unstubAllGlobals();
});

describe("inn conversation", () => {
  it("asks the exact English before charging, accepts once and fills every friend's MP", async () => {
    let answer!: (id: PhraseId | null) => void;
    vi.mocked(ask).mockImplementationOnce(() => new Promise((resolve) => { answer = resolve; }));
    const visit = talkToKeeper("inn");
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({
      kind: "choice", options: ["yesPlease", "noThankYou"],
      question: { en: "Welcome to the Seaside Inn! A room is 10 coins. Would you like a room?", by: "innkeeper" }
    }));
    expect(getGame().progress.act2.coins).toBe(25);
    expect(cb.vitals.hp).toBe(12);
    // A repeated interaction during the conversation cannot create a second charge.
    await talkToKeeper("inn");
    expect(ask).toHaveBeenCalledTimes(1);
    answer("yesPlease");
    await visit;
    expect(getGame().progress.act2).toMatchObject({ coins: 15, checkpoint: "port" });
    expect(cb.vitals).toEqual({ hp: 100, mp: { leafy: 100, bubbo: 100, puff: 100, ember: 100 } });
    expect(getGame().progress.act2).toMatchObject(cb.vitals);
    expect(say).toHaveBeenCalledWith("innkeeper", "Good night!", expect.any(String));
  });

  it.each([0, 9])("yes with %i coins refuses without charge, healing or checkpoint change", async (coins) => {
    setGame((g) => ({ progress: { ...g.progress, act2: { ...g.progress.act2, coins } } }));
    vi.mocked(ask).mockResolvedValueOnce("yesPlease");
    await talkToKeeper("inn");
    expect(say).toHaveBeenCalledWith("innkeeper", "Sorry, you need 10 coins.", expect.any(String));
    expect(getGame().progress.act2).toMatchObject({ coins, checkpoint: "cliff" });
    expect(cb.vitals.hp).toBe(12);
    expect(cb.vitals.mp.ember).toBe(4);
  });

  it.each(["noThankYou", null] as const)("declining or cancelling (%s) keeps all vitals and coins", async (answer) => {
    vi.mocked(ask).mockResolvedValueOnce(answer);
    await talkToKeeper("inn");
    if (answer) expect(say).toHaveBeenCalledWith("innkeeper", "OK. See you!", expect.any(String));
    expect(getGame().progress.act2).toMatchObject({ coins: 25, checkpoint: "cliff" });
    expect(cb.vitals).toEqual({ hp: 12, mp: { leafy: 1, bubbo: 2, puff: 3, ember: 4 } });
  });
});

it("chest food overflow has an explicit coin toast and preserves the chest's other rewards", async () => {
  const c = CHESTS.find((c) => c.id === "forestChest")!;
  setGame((g) => ({ progress: { ...g.progress, bag: { apples: 99 } } }));
  await openChestScene(c.id);
  expect(getGame().progress.act2).toMatchObject({ coins: 42, items: { amber: 1 }, chests: [c.id] });
  expect(getGame().progress.bag.apples).toBe(99);
  expect(getGame().toasts.some((t) => t.en === "Bag full! +2 coins")).toBe(true);
});

it("Crossing arrival records a safe wake point without healing or offering a rest", () => {
  rt.player.x = CAMP2.rest.x;
  rt.player.z = CAMP2.rest.z;
  hooks.enterZone!("camp");
  expect(getGame().progress.act2).toMatchObject({ checkpoint: "camp", tutorial: ["rest"] });
  expect(cb.vitals).toEqual({ hp: 12, mp: { leafy: 1, bubbo: 2, puff: 3, ember: 4 } });
  expect(findFocus()?.id).not.toBe("campRest");
  expect(findFocus()?.verb).not.toBe("Rest");
});

it("a knock-out wakes at the compatible camp checkpoint for free and can resume safely", async () => {
  setGame((g) => ({ progress: { ...g.progress, act2: { ...g.progress.act2, checkpoint: "camp" } } }));
  rt.player.x = 44;
  rt.player.z = -220;
  cb.vitals.hp = 0;
  cb.knockedOut = true;
  hooks.knockout!();
  await vi.waitFor(() => expect(getGame().mode).toBe("explore"));
  expect(cb.knockedOut).toBe(false);
  expect(cb.vitals.hp).toBeGreaterThanOrEqual(60);
  expect(rt.player.x).toBeCloseTo(CAMP2.rest.x);
  expect(rt.player.z).toBeCloseTo(CAMP2.rest.z - 0.4);
  expect(getGame().progress.act2.coins).toBe(25);
  combatTick(0);
  expect(cb.zones.current).toBe("camp");
  expect(cb.knockedOut).toBe(false);
  expect(cb.vitals.hp).toBeGreaterThanOrEqual(60);
});

it("food drops remain on the floor at 99 past their lifetime and can be collected after a slot opens", () => {
  setGame((g) => ({ progress: { ...g.progress, bag: { fish: 99 } } }));
  rt.player.x = 75.6;
  rt.player.z = -190;
  cb.zones.current = "camp";
  cb.drops = [{ id: 123, kind: "food", food: "fish", value: 1, x: rt.player.x, z: rt.player.z, y: 1, vx: 0, vz: 0, vy: 0, t0: 0, magnet: true }];
  rt.time = 61;
  combatTick(0);
  expect(cb.drops).toHaveLength(1);
  expect(cb.drops[0].magnet).toBe(false);
  expect(getGame().progress.bag.fish).toBe(99);
  setGame((g) => ({ progress: { ...g.progress, bag: { fish: 98 } } }));
  rt.time += 1;
  combatTick(0);
  expect(cb.drops).toHaveLength(0);
  expect(getGame().progress.bag.fish).toBe(99);
});

it.each([false, true])("every ground source stays available at 99 (Act 2: %s)", (started) => {
  for (const source of FOOD_SOURCES) {
    setGame((g) => ({ progress: { ...g.progress, bag: { [source.food]: 99 }, act2: { ...g.progress.act2, started } } }));
    const focus = { id: source.id, kind: "food" as const, verb: "Pick", noun: source.food, x: source.x, z: source.z };
    interact(focus);
    expect(getGame().progress.bag[source.food]).toBe(99);
    expect(rt.taken.has(source.id), "a refused pickup has no regrow cooldown").toBe(false);
    expect(getGame().toasts.some(t => t.en === "Your bag is full!")).toBe(true);
    setGame((g) => ({ progress: { ...g.progress, bag: { [source.food]: 98 } } }));
    interact(focus);
    expect(getGame().progress.bag[source.food]).toBe(99);
    expect(rt.taken.has(source.id)).toBe(true);
  }
});
