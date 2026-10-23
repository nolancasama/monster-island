import { describe, expect, it } from "vitest";
import { MONSTERS, LIVE_MONSTERS, MONSTER_ORDER, monstersOfPhase } from "../data/monsters";
import { ISLAND_FOODS, islandFoods } from "../data/foods";
import {
  answerCan,
  befriendLumo,
  companions,
  gateOpen,
  GATES,
  invite,
  questionFoods,
  answerLike,
  askAtObstacle,
  befriend,
  canOffer,
  describeLine,
  discover,
  dislikedKnown,
  favoriteKnown,
  friends,
  missingLines,
  neededLine,
  optionalLines,
  newProgress,
  objective,
  pickUp,
  recordLike,
  setActive,
  solve,
  type Progress
} from "./progress";
import type { FoodId, MonsterId } from "../types";

/** Play the encounter loop for one monster: discover (and describe), ask until yes, fetch, give. */
function makeFriend(p: Progress, id: MonsterId): Progress {
  p = discover(p, id);
  for (const line of missingLines(p, id)) if (MONSTERS[id].phase >= 2) p = describeLine(p, id, line);
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

  it("live monsters like a food that exists on the island", () => {
    for (const id of LIVE_MONSTERS) expect(islandFoods({ endings: 2 })).toContain(MONSTERS[id].favorite);
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
      if (MONSTERS[id].companion === false) continue;
      let p = discover({ ...newProgress(), endings: 2 }, id);
      let asks = 0;
      while (!favoriteKnown(p, id)) {
        const food = questionFoods(p, id).find((f) => p.monsters[id].asked[f] === undefined)!;
        p = recordLike(p, id, food);
        asks++;
      }
      expect(favoriteKnown(p, id)).toBe(true);
      expect(asks).toBeLessThanOrEqual(4);
      expect(dislikedKnown(p, id).length).toBeLessThanOrEqual(3);
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
    expect(solve(newProgress(), "river").solved).toEqual([]);
    expect(solve(newProgress(), "bridge").solved).toEqual([]);
    expect(solve(solve(solve(newProgress(), "fallenPalm"), "river"), "cliff").solved).toEqual(["fallenPalm", "river"]);
  });

  it("only Puff flies up the cliff; 'Can you help me?' there means fly", () => {
    let p = { ...newProgress(), metMaple: true };
    p = solve(makeFriend(p, "leafy"), "fallenPalm");
    p = solve(solve(makeFriend(p, "bubbo"), "river"), "bridge");
    expect(askAtObstacle(p, "cliff", "fly")).toMatchObject({ monster: "leafy", yes: false, solves: false });
    p = setActive(makeFriend(p, "puff"), "puff");
    expect(askAtObstacle(p, "cliff", "fly")).toMatchObject({ yes: true, solves: true });
    expect(askAtObstacle(p, "cliff", "help")).toMatchObject({ yes: true, solves: true, ability: "fly" });
    expect(askAtObstacle(p, "cliff", "jump")).toMatchObject({ yes: false, solves: false });
    expect(askAtObstacle(p, "cliff", "swim")).toMatchObject({ yes: false, solves: false });
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
    p = { ...p, endings: 1 };
    expect(objective(p)).toEqual({ id: "obstacle", obstacle: "bridge", helper: "leafy" });
  });

  it("never mentions the forest before the Phase 1 ending", () => {
    let p = { ...newProgress(), metMaple: true };
    p = solve(makeFriend(p, "leafy"), "fallenPalm");
    p = solve(makeFriend(p, "bubbo"), "river");
    expect(objective(p).id).toBe("stone");
    // Puff is live, but its guard is not on the path yet.
    expect(monstersOfPhase(2)).toEqual(["puff"]);
  });

  it("walks the whole Phase 2 loop without a dead end", () => {
    let p = { ...newProgress(), metMaple: true };
    p = solve(makeFriend(p, "leafy"), "fallenPalm");
    p = setActive(solve(makeFriend(p, "bubbo"), "river"), "bubbo");
    p = { ...p, endings: 1 };
    expect(objective(p)).toEqual({ id: "obstacle", obstacle: "bridge", helper: "leafy" });
    // Bubbo is following: the bridge needs a switch back to Leafy.
    expect(askAtObstacle(p, "bridge", "help")).toMatchObject({ yes: false, solves: false });
    p = setActive(p, "leafy");
    expect(askAtObstacle(p, "bridge", "help")).toMatchObject({ yes: true, solves: true, ability: "grow" });
    p = solve(p, "bridge");
    expect(objective(p)).toEqual({ id: "findMonster", monster: "puff" });
    p = discover(p, "puff");
    expect(objective(p)).toEqual({ id: "describe", monster: "puff", line: "size" });
    p = describeLine(p, "puff", "size");
    expect(objective(p)).toEqual({ id: "describe", monster: "puff", line: "part" });
    p = describeLine(p, "puff", "part");
    expect(objective(p)).toEqual({ id: "askFood", monster: "puff" });
    p = recordLike(p, "puff", "berries");
    expect(objective(p)).toEqual({ id: "getFood", monster: "puff", food: "berries" });
    p = pickUp(p, "berries");
    expect(objective(p)).toEqual({ id: "giveFood", monster: "puff", food: "berries" });
    p = befriend(p, "puff");
    expect(p.monsters.puff.friend).toBe(true);
    expect(objective(p)).toEqual({ id: "obstacle", obstacle: "cliff", helper: "puff" });
    p = solve(p, "cliff");
    expect(objective(p).id).toBe("cliffTop");
    p = { ...p, endings: 2 };
    expect(objective(p)).toEqual({ id: "obstacle", obstacle: "lava", helper: "bubbo" });
  });

  it("a student who meets Bubbo's fish first still has one clear next step", () => {
    let p = { ...newProgress(), metMaple: true };
    p = pickUp(p, "fish");
    expect(objective(p).id).toBe("findMonster");
  });
});

describe("journal lines", () => {
  it("Puff's page needs size and body part; Phase 1 pages only an optional size", () => {
    let p = newProgress();
    expect(missingLines(p, "puff")).toEqual([]);
    p = discover(discover(p, "puff"), "leafy");
    expect(missingLines(p, "puff")).toEqual(["size", "part"]);
    expect(neededLine(p, "puff")).toBe("size");
    expect(missingLines(p, "leafy")).toEqual(["size"]);
    expect(neededLine(p, "leafy")).toBeNull();
    expect(optionalLines(p, "leafy")).toEqual([]);
    expect(optionalLines({ ...p, endings: 1 }, "leafy")).toEqual(["size"]);
    p = describeLine(p, "leafy", "part");
    expect(p.monsters.leafy.described).toEqual({});
    p = describeLine(describeLine(p, "puff", "part"), "puff", "size");
    expect(neededLine(p, "puff")).toBeNull();
  });

  it("an undiscovered monster cannot be described", () => {
    expect(describeLine(newProgress(), "puff", "size").monsters.puff.described).toEqual({});
  });

  it("sizes and parts match the models", () => {
    expect([MONSTERS.leafy.size, MONSTERS.bubbo.size, MONSTERS.puff.size]).toEqual(["small", "big", "small"]);
    expect(MONSTERS.puff.part).toBe("wings");
  });
});

describe("Volcano and Sanctuary", () => {
  function cliffTop(): Progress {
    let p = { ...newProgress(), metMaple: true };
    p = solve(makeFriend(p, "leafy"), "fallenPalm");
    p = solve(makeFriend(p, "bubbo"), "river");
    p = { ...p, endings: 1 };
    p = solve(p, "bridge");
    return setActive(solve(makeFriend(p, "puff"), "cliff"), "puff");
  }

  it("keeps meat cards out of Phases 1 and 2", () => {
    expect(islandFoods({ endings: 0 })).toEqual(ISLAND_FOODS);
    expect(islandFoods({ endings: 1 })).toEqual(ISLAND_FOODS);
    expect(islandFoods({ endings: 2 })).toEqual([...ISLAND_FOODS, "meat"]);
  });

  it("walks Phase 3, including every journal line, invitation and ending", () => {
    let p = cliffTop();
    expect(objective(p)).toEqual({ id: "cliffTop" });
    expect(solve(p, "lava")).toBe(p);
    p = { ...p, endings: 2 };
    expect(objective(p)).toEqual({ id: "obstacle", obstacle: "lava", helper: "bubbo" });
    expect(askAtObstacle(p, "lava", "help")).toMatchObject({ yes: false, solves: false });
    p = setActive(p, "bubbo");
    expect(askAtObstacle(p, "lava", "swim")).toMatchObject({ yes: true, solves: true });
    expect(askAtObstacle(p, "lava", "help")).toMatchObject({ ability: "swim", solves: true });
    p = solve(p, "lava");
    expect(objective(p)).toEqual({ id: "findMonster", monster: "ember" });
    expect(solve(p, "cave")).toBe(p);
    p = discover(p, "ember");
    for (const line of ["size", "part"] as const) {
      expect(objective(p)).toEqual({ id: "describe", monster: "ember", line });
      p = describeLine(p, "ember", line);
    }
    expect(objective(p)).toEqual({ id: "askFood", monster: "ember" });
    p = recordLike(p, "ember", "meat");
    expect(objective(p)).toEqual({ id: "getFood", monster: "ember", food: "meat" });
    p = pickUp(p, "meat");
    expect(objective(p)).toEqual({ id: "giveFood", monster: "ember", food: "meat" });
    p = befriend(p, "ember");
    expect(objective(p)).toEqual({ id: "letsGo", monster: "ember" });
    expect(solve(p, "cave")).toBe(p);
    p = invite(p, "ember");
    expect(p.active).toBe("ember");
    expect(objective(p)).toEqual({ id: "obstacle", obstacle: "cave", helper: "ember" });
    expect(askAtObstacle(p, "cave", "fire")).toMatchObject({ yes: true, solves: true });
    expect(solve(p, "gateLeaf")).toBe(p);
    p = solve(p, "cave");
    expect(objective(p)).toEqual({ id: "obstacle", obstacle: "gateLeaf", helper: "leafy" });
    // Pillars may be completed in any order; the objective names the first missing one.
    const order = ["gateFlame", "gateWing", "gateDrop", "gateLeaf"] as const;
    const helpers = ["ember", "puff", "bubbo", "leafy"] as const;
    for (let i = 0; i < order.length; i++) {
      expect(gateOpen(p)).toBe(false);
      p = setActive(p, helpers[i]);
      expect(askAtObstacle(p, order[i], "help")).toMatchObject({ yes: true, solves: true });
      p = solve(p, order[i]);
    }
    expect(GATES.every((id) => p.solved.includes(id))).toBe(true);
    expect(gateOpen(p)).toBe(true);
    expect(objective(p)).toEqual({ id: "findMonster", monster: "lumo" });
    p = discover(p, "lumo");
    expect(befriendLumo(p, "yesIDo")).toBe(p);
    for (const line of ["name", "size", "part"] as const) {
      expect(objective(p)).toEqual({ id: "describe", monster: "lumo", line });
      p = describeLine(p, "lumo", line);
    }
    expect(questionFoods(p, "lumo")).toEqual([]);
    expect(canOffer(pickUp(recordLike(p, "lumo", "apples"), "apples"), "lumo")).toBe(false);
    expect(objective(p)).toEqual({ id: "askBack", monster: "lumo" });
    for (const answer of ["yesIDo", "noIDont"] as const) {
      const friend = befriendLumo(p, answer);
      expect(friend.monsters.lumo.friend).toBe(true);
      expect(friend.said).toContain(answer);
      expect(friends(friend)).toContain("lumo");
      expect(companions(friend)).not.toContain("lumo");
      expect(setActive(friend, "lumo").active).toBe("leafy");
      expect(objective(friend)).toEqual({ id: "finale" });
      expect(objective({ ...friend, endings: 3 })).toEqual({ id: "explore" });
    }
  });
});
