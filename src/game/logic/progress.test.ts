import { describe, expect, it } from "vitest";
import { MONSTERS, LIVE_MONSTERS, MONSTER_ORDER } from "../data/monsters";
import { ISLAND_FOODS } from "../data/foods";
import {
  answerCan,
  answerLike,
  askAtObstacle,
  befriend,
  canOffer,
  discover,
  dislikedKnown,
  favoriteKnown,
  friends,
  newProgress,
  objective,
  pickUp,
  recordLike,
  setActive,
  solve,
  type Progress
} from "./progress";
import type { FoodId, MonsterId } from "../types";

/** Play the encounter loop for one monster: discover, ask until yes, fetch, give. */
function makeFriend(p: Progress, id: MonsterId): Progress {
  p = discover(p, id);
  for (const food of ISLAND_FOODS) {
    p = recordLike(p, id, food);
    if (favoriteKnown(p, id)) break;
  }
  p = pickUp(p, MONSTERS[id].favorite);
  return befriend(p, id);
}

describe("food preferences", () => {
  it("every monster likes exactly one island food... or a later-phase food", () => {
    for (const id of MONSTER_ORDER) {
      const def = MONSTERS[id];
      const yes = (["apples", "bananas", "fish", "berries", "meat"] as FoodId[]).filter((f) => answerLike(def, f).yes);
      expect(yes).toEqual([def.favorite]);
    }
  });

  it("Phase 1 monsters like a food that exists on the beach", () => {
    for (const id of LIVE_MONSTERS) expect(ISLAND_FOODS).toContain(MONSTERS[id].favorite);
  });

  it("answers use the target sentences", () => {
    expect(answerLike(MONSTERS.leafy, "apples")).toEqual({ yes: true, short: "Yes, I do!", long: "I like apples!" });
    expect(answerLike(MONSTERS.leafy, "fish")).toEqual({ yes: false, short: "No, I don't.", long: "I don't like fish." });
    expect(answerLike(MONSTERS.bubbo, "fish").long).toBe("I like fish!");
    expect(answerCan(MONSTERS.bubbo, "swim").short).toBe("Yes, I can!");
    expect(answerCan(MONSTERS.leafy, "swim").short).toBe("No, I can't.");
  });

  it("records yes and no answers in the journal", () => {
    let p = discover(newProgress(), "leafy");
    p = recordLike(p, "leafy", "fish");
    p = recordLike(p, "leafy", "bananas");
    expect(dislikedKnown(p, "leafy").sort()).toEqual(["bananas", "fish"]);
    expect(favoriteKnown(p, "leafy")).toBe(false);
    p = recordLike(p, "leafy", "apples");
    expect(favoriteKnown(p, "leafy")).toBe(true);
  });

  it("never needs more than three no answers before the yes", () => {
    for (const id of LIVE_MONSTERS) {
      let p = discover(newProgress(), id);
      let asks = 0;
      for (const food of ISLAND_FOODS) {
        if (favoriteKnown(p, id)) break;
        p = recordLike(p, id, food);
        asks++;
      }
      expect(favoriteKnown(p, id)).toBe(true);
      expect(asks).toBeLessThanOrEqual(ISLAND_FOODS.length);
    }
  });
});

describe("friendship progression", () => {
  it("food can only be offered after the monster said what it likes", () => {
    let p = discover(newProgress(), "leafy");
    p = pickUp(p, "apples");
    expect(canOffer(p, "leafy")).toBe(false);
    expect(befriend(p, "leafy").monsters.leafy.friend).toBe(false);
    p = recordLike(p, "leafy", "apples");
    expect(canOffer(p, "leafy")).toBe(true);
  });

  it("needs the favourite food in the bag", () => {
    let p = recordLike(discover(newProgress(), "bubbo"), "bubbo", "fish");
    p = pickUp(p, "apples");
    expect(canOffer(p, "bubbo")).toBe(false);
    p = pickUp(p, "fish");
    expect(canOffer(p, "bubbo")).toBe(true);
  });

  it("befriending eats one food and the first friend follows", () => {
    let p = recordLike(discover(newProgress(), "leafy"), "leafy", "apples");
    p = pickUp(pickUp(p, "apples"), "apples");
    p = befriend(p, "leafy");
    expect(p.monsters.leafy.friend).toBe(true);
    expect(p.bag.apples).toBe(1);
    expect(p.active).toBe("leafy");
    expect(canOffer(p, "leafy")).toBe(false);
  });

  it("the bag holds at most three of a food", () => {
    let p = newProgress();
    for (let i = 0; i < 5; i++) p = pickUp(p, "berries");
    expect(p.bag.berries).toBe(3);
  });
});

describe("companion switching", () => {
  it("only friends can be the companion, and switching is immediate", () => {
    let p = makeFriend(newProgress(), "leafy");
    expect(setActive(p, "bubbo").active).toBe("leafy");
    p = solve(p, "fallenPalm");
    p = makeFriend(p, "bubbo");
    expect(p.active).toBe("leafy");
    expect(friends(p)).toEqual(["leafy", "bubbo"]);
    p = setActive(p, "bubbo");
    expect(p.active).toBe("bubbo");
    p = setActive(p, "leafy");
    expect(p.active).toBe("leafy");
  });
});

describe("ability gating", () => {
  it("nobody to ask without a companion", () => {
    expect(askAtObstacle(newProgress(), "fallenPalm", "help")).toEqual({ kind: "alone" });
  });

  it("Leafy can help with the palm but cannot swim the river", () => {
    const p = makeFriend(newProgress(), "leafy");
    expect(askAtObstacle(p, "fallenPalm", "help")).toMatchObject({ yes: true, solves: true, ability: "grow" });
    expect(askAtObstacle(p, "fallenPalm", "swim")).toMatchObject({ yes: false, solves: false });
    expect(askAtObstacle(p, "fallenPalm", "jump")).toMatchObject({ yes: true, solves: false });
    expect(askAtObstacle(p, "river", "swim")).toMatchObject({ yes: false, solves: false });
  });

  it("Bubbo swims the river; Bubbo cannot fly", () => {
    let p = solve(makeFriend(newProgress(), "leafy"), "fallenPalm");
    p = setActive(makeFriend(p, "bubbo"), "bubbo");
    expect(askAtObstacle(p, "river", "swim")).toMatchObject({ yes: true, solves: true });
    expect(askAtObstacle(p, "river", "fly")).toMatchObject({ yes: false, solves: false });
    expect(askAtObstacle(p, "river", "help")).toMatchObject({ yes: true, solves: true, ability: "swim" });
  });

  it("an obstacle cannot be solved before the one in front of it", () => {
    const p = solve(newProgress(), "river");
    expect(p.solved).toEqual([]);
  });

  it("a solved obstacle is never asked again", () => {
    let p = solve(makeFriend(newProgress(), "leafy"), "fallenPalm");
    expect(askAtObstacle(p, "fallenPalm", "help")).toMatchObject({ solves: false });
    p = solve(p, "fallenPalm");
    expect(p.solved).toEqual(["fallenPalm"]);
  });
});

describe("objective and puzzle completion", () => {
  it("walks the whole Phase 1 loop without a dead end", () => {
    let p = newProgress();
    expect(objective(p).id).toBe("meetMaple");
    p = { ...p, metMaple: true };
    expect(objective(p)).toEqual({ id: "findMonster", monster: "leafy" });
    p = discover(p, "leafy");
    expect(objective(p)).toEqual({ id: "askFood", monster: "leafy" });
    p = recordLike(p, "leafy", "apples");
    expect(objective(p)).toEqual({ id: "getFood", monster: "leafy", food: "apples" });
    p = pickUp(p, "apples");
    expect(objective(p)).toEqual({ id: "giveFood", monster: "leafy", food: "apples" });
    p = befriend(p, "leafy");
    expect(objective(p)).toEqual({ id: "obstacle", obstacle: "fallenPalm", helper: "leafy" });
    p = solve(p, "fallenPalm");
    expect(objective(p)).toEqual({ id: "findMonster", monster: "bubbo" });
    p = makeFriend(p, "bubbo");
    expect(objective(p)).toEqual({ id: "obstacle", obstacle: "river", helper: "bubbo" });
    p = solve(p, "river");
    expect(objective(p).id).toBe("stone");
    p = { ...p, finished: true };
    expect(objective(p).id).toBe("explore");
  });

  it("a student who meets Bubbo's fish first still has one clear next step", () => {
    let p = { ...newProgress(), metMaple: true };
    p = pickUp(p, "fish");
    expect(objective(p).id).toBe("findMonster");
  });
});
