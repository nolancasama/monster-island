import { describe, expect, it } from "vitest";
import { newProgress, objective, type Progress } from "./progress";
import {
  RESPAWN_AWAY, act2Objective, addCoins, addItem, bagMax, bestFood, buy, changeZone, craft, craftMissing, eatEffect, findPort, hearLead,
  hurt, markDescended, markTutorial, newZoneMemory, noteDefeat, openChest, practise, prologueComplete, regenMp, rested, spendMp, startAct2
} from "./act2";
import { decodeSave, encodeSave } from "./save";
import { PHRASES, heardQuantity } from "./english";
import { judgeSpeech } from "./speechMatch";
import { KO_HP, MAX_HP } from "../data/combat";
import type { FoodId, MonsterId } from "../types";

/** The finished prologue: all five friends, every unlock, the finale played. */
function done(): Progress {
  const p = newProgress();
  for (const id of ["leafy", "bubbo", "puff", "ember", "lumo"] as MonsterId[]) {
    p.monsters[id] = { discovered: true, asked: {}, friend: true, canKnown: {}, described: { name: id === "lumo", size: true, part: true }, ...(id === "ember" ? { invited: true } : {}) };
  }
  return { ...p, active: "leafy", metMaple: true, endings: 3, solved: ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame"] };
}
const v = (hp = 100, mp = 100) => ({ hp, mp: { leafy: mp, bubbo: mp, puff: mp, ember: mp } });

describe("Act 2 story", () => {
  it("Lumo is taken only after becoming a friend, once, and stays a friend", () => {
    const before = done();
    expect(prologueComplete(before)).toBe(true);
    expect(startAct2({ ...before, endings: 2 }).act2.started).toBe(false);
    const p = startAct2(before);
    expect(p.act2).toMatchObject({ started: true, lumoTaken: true });
    expect(p.monsters.lumo.friend).toBe(true);
    expect(startAct2(p)).toBe(p);
  });

  it("walks the chapter's objectives in order, with the harbour lead last", () => {
    let p = done();
    expect(objective(p)).toEqual({ id: "act2Start" });
    p = startAct2(p);
    expect(objective(p)).toEqual({ id: "descend" });
    p = markDescended(p);
    expect(objective(p)).toEqual({ id: "openChest" });
    p = openChest(p, "forestChest");
    expect(objective(p)).toEqual({ id: "rest" });
    p = markTutorial(p, "rest");
    expect(objective(p)).toEqual({ id: "reachPort" });
    expect(hearLead(p)).toBe(p);
    p = findPort(p);
    expect(objective(p)).toEqual({ id: "market" });
    const bought = buy(addCoins(p, 50), "apples", 1);
    expect(bought.ok).toBe(true);
    if (bought.ok) p = bought.progress;
    expect(objective(p)).toEqual({ id: "kitchen" });
    p = craft(addFood2(p, "berries"), "leafy");
    expect(objective(p)).toEqual({ id: "harbor" });
    p = hearLead(p);
    expect(objective(p)).toEqual({ id: "act2Done" });
  });

  it("reaching the town without the forest's chest or rest never sends the player back for them", () => {
    const p = findPort(markDescended(startAct2(done())));
    expect(act2Objective(p)).toEqual({ id: "market" });
  });

  it("the harbour can be visited before shopping: the lead still ends the chapter's main path", () => {
    const p = hearLead(findPort(markTutorial(openChest(markDescended(startAct2(done())), "forestChest"), "rest")));
    expect(act2Objective(p)).toEqual({ id: "act2Done" });
  });
});

function addFood2(p: Progress, f: FoodId): Progress {
  return { ...p, bag: { ...p.bag, [f]: (p.bag[f] ?? 0) + 1 } };
}

describe("HP and MP", () => {
  it("one HP pool, clamped; specials need enough MP; every friend regains MP on its own", () => {
    expect(hurt(v(10), 25).hp).toBe(0);
    expect(spendMp(v(100, 20), "leafy", 25)).toBeNull();
    const after = spendMp(v(), "bubbo", 30)!;
    expect(after.mp).toEqual({ leafy: 100, bubbo: 70, puff: 100, ember: 100 });
    const back = regenMp({ hp: 50, mp: { leafy: 0, bubbo: 99, puff: 50, ember: 100 } }, 1);
    expect(back.mp).toEqual({ leafy: 2, bubbo: 100, puff: 52, ember: 100 });
    expect(back.hp).toBe(50);
  });

  it("food restores HP and the MP of the friend who loves it, clamped to the maximum", () => {
    const low = { hp: 50, mp: { leafy: 10, bubbo: 10, puff: 10, ember: 90 } };
    expect(eatEffect(low, "apples")).toEqual({ hp: 65, mp: { leafy: 40, bubbo: 10, puff: 10, ember: 90 } });
    expect(eatEffect(low, "fish").mp.bubbo).toBe(40);
    expect(eatEffect(low, "berries").mp.puff).toBe(40);
    expect(eatEffect(low, "meat").mp.ember).toBe(100);
    expect(eatEffect({ ...low, hp: 95 }, "bananas").hp).toBe(MAX_HP);
    expect(bestFood(v(), { apples: 3 }, "leafy")).toBeNull();
    expect(bestFood({ hp: 100, mp: { leafy: 20, bubbo: 100, puff: 100, ember: 100 } }, { apples: 1, fish: 1 }, "leafy")).toBe("apples");
    expect(rested()).toEqual(v());
  });
});

describe("coins, the market, the kitchen, chests and the trainer", () => {
  const p0 = markDescended(startAct2(done()));

  it("buying needs the coins and room in the bag; the bag holds more in Act 2", () => {
    expect(bagMax(done())).toBe(3);
    expect(bagMax(p0)).toBe(9);
    expect(buy(p0, "fish", 1)).toEqual({ ok: false, reason: "coins" });
    const rich = addCoins(p0, 100);
    const res = buy(rich, "fish", 3);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.progress.act2.coins).toBe(100 - 24);
      expect(res.progress.bag.fish).toBe(3);
      expect(res.progress.act2.bought).toBe(true);
    }
    expect(buy({ ...rich, bag: { fish: 8 } }, "fish", 2)).toEqual({ ok: false, reason: "bag" });
  });

  it("a treat needs its two foods and one amber; eating it teaches the upgrade once", () => {
    const p = addFood2(addFood2(p0, "apples"), "berries");
    expect(craftMissing(p, "leafy")).toEqual(["amber"]);
    expect(craft(p, "leafy")).toBe(p);
    const ready = addItem(p, "amber");
    const made = craft(ready, "leafy");
    expect(made.act2.upgrades).toEqual(["leafy"]);
    expect(made.bag).toMatchObject({ apples: 0, berries: 0 });
    expect(made.act2.items.amber).toBe(0);
    expect(craft(addItem(addFood2(addFood2(made, "apples"), "berries"), "amber"), "leafy")).toEqual(addItem(addFood2(addFood2(made, "apples"), "berries"), "amber"));
  });

  it("a chest opens once and gives its first amber; nothing opens before Act 2", () => {
    expect(openChest(done(), "forestChest")).toEqual(done());
    const p = openChest(p0, "forestChest");
    expect(p.act2).toMatchObject({ coins: 15, items: { amber: 1 }, chests: ["forestChest"] });
    expect(p.bag.apples).toBe(2);
    expect(openChest(p, "forestChest")).toBe(p);
    expect(practise(practise(p, "puff"), "puff").act2.trained).toEqual(["puff"]);
  });
});

describe("areas: enemies come back only after a real absence", () => {
  it("re-entering at once keeps the knocked-out enemies down; after RESPAWN_AWAY of play they return", () => {
    let mem = changeZone(newZoneMemory(), "forest1", 0).mem;
    mem = noteDefeat(mem, "forest1", 0);
    mem = noteDefeat(mem, "forest1", 1);
    // Out and straight back in over the border: no fresh crowd.
    let r = changeZone(mem, "camp", 10);
    r = changeZone(r.mem, "forest1", 11);
    expect(r.respawn).toBeNull();
    expect(r.mem.defeated.forest1).toEqual([0, 1]);
    // Back and forth for a while never adds up: each absence counts on its own.
    for (let t = 12; t < 40; t += 2) r = changeZone(changeZone(r.mem, "camp", t).mem, "forest1", t + 1);
    expect(r.mem.defeated.forest1).toEqual([0, 1]);
    // A real absence (another area for RESPAWN_AWAY seconds): they are back.
    r = changeZone(changeZone(r.mem, "camp", 50).mem, "forest1", 50 + RESPAWN_AWAY);
    expect(r.respawn).toBe("forest1");
    expect(r.mem.defeated.forest1).toEqual([]);
  });

  it("the rope and the sanctuary are outside every area", () => {
    const r = changeZone(changeZone(newZoneMemory(), "forest1", 0).mem, null, 5);
    expect(r.mem.current).toBeNull();
    expect(r.mem.leftAt.forest1).toBe(5);
  });
});

describe("Act 2 saves", () => {
  const roundTrip = (p: Progress) => decodeSave(encodeSave(p, { x: 76, z: -190, yaw: 0 }, 100))!;

  it("a finished v3 save loads with everything kept and a fresh Act 2 waiting", () => {
    const v3 = JSON.stringify({ v: 3, progress: { ...done(), act2: undefined }, player: { x: 70, z: -136, yaw: 0 }, seconds: 2400 });
    const s = decodeSave(v3)!;
    expect(s.v).toBe(4);
    expect(s.progress.endings).toBe(3);
    expect(s.progress.monsters.lumo.friend).toBe(true);
    expect(s.progress.solved).toHaveLength(10);
    expect(s.progress.act2.started).toBe(false);
    expect(objective(s.progress)).toEqual({ id: "act2Start" });
  });

  it("round-trips Act 2 (HP, MP, coins, amber, chests, upgrades, unlocks, lessons, the town)", () => {
    let p = openChest(markDescended(startAct2(done())), "forestChest");
    p = findPort(markTutorial(p, "rest"));
    p = { ...p, solved: [...p.solved, "groveLilies", "canopyVines"], act2: { ...p.act2, hp: 42, mp: { leafy: 10, bubbo: 20, puff: 30, ember: 40 }, upgrades: ["ember"], trained: ["leafy"] } };
    const back = roundTrip(p).progress;
    expect(back.act2).toMatchObject({ started: true, lumoTaken: true, hp: 42, mp: { leafy: 10, bubbo: 20, puff: 30, ember: 40 }, coins: 15, items: { amber: 1 }, chests: ["forestChest"], upgrades: ["ember"], portFound: true, checkpoint: "port", trained: ["leafy"] });
    expect(back.solved).toEqual(expect.arrayContaining(["groveLilies", "canopyVines"]));
    expect(back.act2.tutorial).toContain("rest");
  });

  it("an edited save cannot start Act 2 early or unlock its puzzles, and a knocked-out save wakes with HP", () => {
    const early = { ...newProgress(), endings: 2, solved: ["fallenPalm", "river", "bridge", "cliff", "canopyVines"], act2: { ...startAct2(done()).act2 } };
    const s = decodeSave(JSON.stringify({ v: 4, progress: early, player: {}, seconds: 0 }))!;
    expect(s.progress.act2.started).toBe(false);
    expect(s.progress.solved).not.toContain("canopyVines");
    const ko = { ...startAct2(done()), act2: { ...startAct2(done()).act2, hp: 0 } };
    expect(roundTrip(ko).progress.act2.hp).toBe(KO_HP);
  });

  it("the bag keeps up to 9 of a food in Act 2 (3 before)", () => {
    expect(roundTrip({ ...startAct2(done()), bag: { fish: 7 } }).progress.bag.fish).toBe(7);
    expect(roundTrip({ ...done(), bag: { fish: 7 } }).progress.bag.fish).toBe(3);
  });
});

describe("Act 2 English", () => {
  const judge = (text: string, ids: Array<keyof typeof PHRASES>) => judgeSpeech([text], ids.map((id) => PHRASES[id]));

  it("shopping: the food names the sentence; a number in it sets how many", () => {
    expect(judge("I want three apples please", ["wantApples", "wantFish", "wantMeat"])).toMatchObject({ kind: "match", id: "wantApples" });
    expect(heardQuantity("I want three apples please")).toBe(3);
    expect(heardQuantity("I want two fish")).toBe(2);
    expect(heardQuantity("I want an apple")).toBeNull();
    expect(heardQuantity("one apple please")).toBe(1);
    expect(judge("two please", ["oneP", "twoP", "threeP"])).toMatchObject({ kind: "match", id: "twoP" });
    expect(judge("tree", ["oneP", "twoP", "threeP"])).toMatchObject({ kind: "match", id: "threeP" });
  });

  it("the harbour question, the kitchen's mixes and the trainer's commands", () => {
    expect(judge("where is the ship", ["whereShip"])).toMatchObject({ kind: "match", id: "whereShip" });
    expect(judge("mix the apples and berries", ["mixLeafy", "mixBubbo", "mixPuff", "mixEmber"])).toMatchObject({ kind: "match", id: "mixLeafy" });
    expect(judge("berries and bananas", ["mixLeafy", "mixBubbo", "mixPuff", "mixEmber"])).toMatchObject({ kind: "match", id: "mixPuff" });
    for (const [said, id] of [["pull", "cmdPull"], ["push", "cmdPush"], ["blow", "cmdBlow"], ["burn", "cmdBurn"]] as const) {
      expect(judge(said, [id])).toMatchObject({ kind: "match", id });
    }
  });
});
