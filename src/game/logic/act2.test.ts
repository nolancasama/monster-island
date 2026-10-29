import { describe, expect, it } from "vitest";
import { newProgress, objective, type Progress } from "./progress";
import {
  clearStage, remainingEnemies, RESPAWN_AWAY, act2Objective, addCoins, addItem, bagMax, bestFood, buy, changeZone, craft, craftMissing, eatEffect, eatHelps, findPort, hearLead,
  hurt, markDescended, markTutorial, newZoneMemory, noteDefeat, openChest, practise, prologueComplete, reachCrossing, regenMp, rested, spendMp, stayAtInn, startAct2, addFood, chestFoodOverflow, afterKnockout
} from "./act2";
import { decodeSave, encodeSave } from "./save";
import { PHRASES, heardQuantity } from "./english";
import { judgeSpeech } from "./speechMatch";
import { STAGES, ENEMY_SPAWNS, CHESTS, CAMP2, ZONES, zoneAt } from "../world/lowland";
import { PLAYER_R, gatesOf, isWalkable } from "../world/collision";
import { FOODS } from "../data/foods";
import { FOOD_RESTORE, KO_HP, MAX_HP } from "../data/combat";
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
    expect(objective(p)).toEqual({ id: "crossing" });
    p = reachCrossing(p);
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
  it("quick-eat chooses only the active friend's favourite when HP or that friend's MP needs it", () => {
    const bag = { apples: 3, fish: 3, berries: 3, meat: 3, bananas: 3 };
    for (const food of Object.keys(FOOD_RESTORE) as FoodId[]) {
      const friend = FOOD_RESTORE[food].friend;
      if (!friend) continue;
      expect(bestFood(v(90), bag, friend)).toBe(food);
      const lowMp = v();
      lowMp.mp[friend] = 90;
      expect(bestFood(lowMp, bag, friend)).toBe(food);
      expect(bestFood(v(50, 0), { ...bag, [food]: 0 }, friend)).toBeNull();
      expect(bestFood(v(), bag, friend)).toBeNull();
      expect(bestFood(v(50, 0), { bananas: 3 }, friend)).toBeNull();
    }
    expect(bestFood(v(50, 0), bag, null)).toBeNull();
    const otherLow = v();
    otherLow.mp.bubbo = 0;
    expect(bestFood(otherLow, bag, "leafy")).toBeNull();
  });

  it("deliberate eating can help another friend or restore HP with bananas, without wasting food", () => {
    const lowMp = v();
    lowMp.mp.bubbo = 95;
    expect(eatHelps(lowMp, "fish")).toBe(true);
    expect(eatEffect(lowMp, "fish")).toEqual(v());
    expect(eatHelps(lowMp, "apples")).toBe(false);
    expect(eatHelps(lowMp, "bananas")).toBe(false);
    expect(eatHelps(v(95), "bananas")).toBe(true);
    expect(eatEffect(v(95), "bananas")).toEqual(v());
    for (const food of Object.keys(FOOD_RESTORE) as FoodId[]) expect(eatHelps(v(), food)).toBe(false);
  });

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

  it("preserves all chest coins and overflow across saves at the old currency ceiling", () => {
    const rich = addItem(addCoins(p0, 9999), "amber", 99);
    const p = { ...rich, bag: { apples: 99 } };
    const opened = openChest(p, "forestChest");
    expect(opened.act2.coins).toBe(10016);
    expect(opened.act2.items.amber).toBe(100);
    const loaded = decodeSave(encodeSave(opened, { x: 76, z: -168, yaw: 0 }, 20))!;
    expect(loaded.progress.act2.coins).toBe(10016);
    expect(loaded.progress.act2.items.amber).toBe(100);
  });

  it("validates every saved food to 0–99 in either chapter", () => {
    for (const started of [false, true]) for (const count of [-20, 0, 9, 99, 300]) {
      const p = started ? startAct2(done()) : done();
      p.bag = Object.fromEntries(Object.keys(FOODS).map(id => [id, count]));
      const loaded = decodeSave(encodeSave(p, { x: 70, z: -137, yaw: 0 }, 20))!;
      for (const food of Object.keys(FOODS) as FoodId[]) expect(loaded.progress.bag[food]).toBe(Math.max(0, Math.min(99, count)));
    }
  });

  it("buying needs the coins and room in the bag; the bag holds 99 in both chapters", () => {
    expect(bagMax(done())).toBe(99);
    expect(bagMax(p0)).toBe(99);
    expect(buy(p0, "fish", 1)).toEqual({ ok: false, reason: "coins" });
    const rich = addCoins(p0, 100);
    const res = buy(rich, "fish", 3);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.progress.act2.coins).toBe(100 - 24);
      expect(res.progress.bag.fish).toBe(3);
      expect(res.progress.act2.bought).toBe(true);
    }
    expect(buy({ ...rich, bag: { fish: 98 } }, "fish", 2)).toEqual({ ok: false, reason: "bag" });
    expect(buy({ ...p0, bag: { fish: 99 } }, "fish", 1)).toEqual({ ok: false, reason: "bag" });
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

  it("every food uses the same cap for additions and purchases in both chapters", () => {
    for (const base of [done(), p0]) for (const food of Object.keys(FOODS) as FoodId[]) {
      const p = { ...addCoins(base, 1000), bag: { [food]: 98 } };
      expect(addFood(p, food, 3).added).toBe(1);
      expect(addFood(p, food, 3).progress.bag[food]).toBe(99);
      const full = addFood(p, food, 1).progress;
      expect(addFood(full, food, 1)).toEqual({ progress: full, added: 0 });
      expect(buy(p, food, 2)).toEqual({ ok: false, reason: "bag" });
      const bought = buy(p, food, 1);
      expect(bought.ok && bought.progress.bag[food]).toBe(99);
      expect(buy(full, food, 1)).toEqual({ ok: false, reason: "bag" });
    }
  });

  it("all chest overflow becomes coins, preserving amber and the food that fits, once", () => {
    for (const c of CHESTS) for (const room of [0, 1, 99]) {
      const p = { ...p0, bag: c.food ? { [c.food.id]: 99 - room } : {} };
      const overflow = c.food ? Math.max(0, c.food.n - room) : 0;
      expect(chestFoodOverflow(p, c.id)).toBe(overflow);
      const opened = openChest(p, c.id);
      expect(opened.act2.coins).toBe(c.coins + overflow);
      expect(opened.act2.items.amber ?? 0).toBe(c.amber);
      if (c.food) expect(opened.bag[c.food.id]).toBe(Math.min(99, 99 - room + c.food.n));
      expect(opened.act2.chests).toEqual([c.id]);
      expect(openChest(opened, c.id)).toBe(opened);
      expect(chestFoodOverflow(opened, c.id)).toBe(0);
    }
  });
});

describe("paid inn and Fern Crossing", () => {
  it("only yes with 10 coins buys a room; no and insufficient funds change nothing", () => {
    for (const coins of [0, 9, 10, 25]) {
      const p = findPort(addCoins(markDescended(startAct2(done())), coins));
      expect(p.act2.checkpoint).toBe("cliff");
      expect(stayAtInn(p, false)).toEqual({ outcome: "declined", progress: p });
      const result = stayAtInn(p, true);
      if (coins < 10) expect(result).toEqual({ outcome: "coins", progress: p });
      else {
        expect(result.outcome).toBe("rest");
        expect(result.progress.act2.coins).toBe(coins - 10);
        expect(result.progress.act2.checkpoint).toBe("port");
      }
    }
  });

  it("reaching the safe crossing records the compatible wake point without healing", () => {
    const p = markDescended(startAct2(done()));
    p.act2.hp = 12;
    p.act2.mp = v(12, 8).mp;
    p.act2.coins = 9;
    const reached = reachCrossing(p);
    expect(reached.act2).toMatchObject({ checkpoint: "camp", hp: 12, mp: v(12, 8).mp, coins: 9, tutorial: ["rest"] });
    expect(reachCrossing(reached)).toBe(reached);
    expect(zoneAt(CAMP2.rest.x, CAMP2.rest.z)).toBe("camp");
    expect(ZONES.camp).toMatchObject({ name: { en: "Fern Crossing" }, hostile: false });
    const loaded = decodeSave(encodeSave(reached, { ...CAMP2.rest, yaw: Math.PI }, 50))!;
    expect(loaded.progress.act2.checkpoint).toBe("camp");
    expect(isWalkable(loaded.player.x, loaded.player.z, gatesOf(loaded.progress), PLAYER_R)).toBe(true);
    const recovered = afterKnockout({ hp: 0, mp: reached.act2.mp });
    expect(recovered.hp).toBeGreaterThanOrEqual(60);
    expect(recovered.mp).toEqual(reached.act2.mp);
    expect(reached.act2.coins).toBe(9);
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
    expect(back.act2).toMatchObject({ started: true, lumoTaken: true, hp: 42, mp: { leafy: 10, bubbo: 20, puff: 30, ember: 40 }, coins: 15, items: { amber: 1 }, chests: ["forestChest"], upgrades: ["ember"], portFound: true, checkpoint: "cliff", trained: ["leafy"] });
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

  it("save validation clamps each food to 0–99 in both chapters", () => {
    for (const p of [done(), startAct2(done())]) {
      expect(roundTrip({ ...p, bag: { apples: 120, fish: 99, berries: 98.9, bananas: -4, meat: NaN } }).progress.bag)
        .toEqual({ apples: 99, fish: 99, berries: 98, bananas: 0, meat: 0 });
    }
  });
});

describe("Act 2 English", () => {
  const judge = (text: string, ids: Array<keyof typeof PHRASES>) => judgeSpeech([text], ids.map((id) => PHRASES[id]));

  it("the inn's polite answers tolerate beginner recognition without confusing no and yes", () => {
    expect(PHRASES.yesPlease.en).toBe("Yes, please.");
    expect(PHRASES.noThankYou.en).toBe("No, thank you.");
    for (const text of ["Yes, please.", "yes", "yess pleas", "yeah please"]) expect(judge(text, ["yesPlease", "noThankYou"])).toMatchObject({ kind: "match", id: "yesPlease" });
    for (const text of ["No, thank you.", "no", "know sank you"]) expect(judge(text, ["yesPlease", "noThankYou"])).toMatchObject({ kind: "match", id: "noThankYou" });
    expect(judge("yes no", ["yesPlease", "noThankYou"]).kind).toBe("none");
    expect(judge("thank you", ["yesPlease", "noThankYou"]).kind).toBe("none");
  });

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

describe("persistent stage clears and pre-expansion saves",()=>{
  it("requires every registered enemy; duplicates and other stages cannot satisfy the count",()=>{
    for(const zone of STAGES){
      const ids=ENEMY_SPAWNS.flatMap((e,i)=>e.zone===zone?[i]:[]),p=startAct2(done());
      expect(remainingEnemies(zone,[])).toBe(ids.length);
      expect(clearStage(p,zone,[...ids.slice(1),...ids.slice(1),999])).toBe(p);
      const cleared=clearStage(p,zone,ids);
      expect(cleared.act2.cleared).toEqual([zone]);
      expect(clearStage(cleared,zone,[])).toBe(cleared);
      let memory=changeZone(newZoneMemory(),zone,0).mem;
      memory=noteDefeat(memory,zone,ids[0]);
      memory=changeZone(memory,"camp",1).mem;
      const respawn=changeZone(memory,zone,14);
      expect(respawn.respawn).toBe(zone);
      expect(cleared.act2.cleared).toEqual([zone]);
      const loaded=decodeSave(encodeSave(cleared,{x:75.5,z:-154.4,yaw:0},20))!;
      expect(loaded.progress.act2.cleared).toEqual([zone]);
    }
  });
  it("migrates old town and route saves without replaying the story or losing inventory",()=>{
    for(const [zone,flags]of [["port",STAGES],["coast",["forest1","grove","canopy","causeway"]],["causeway",["forest1","grove","canopy"]],["grove",["forest1"]]] as const){
      const p=startAct2(done());p.act2.descended=true;p.act2.zone=zone;p.act2.portFound=zone==="port";
      p.act2.coins=73;p.act2.upgrades=["leafy"];p.bag={fish:3};
      const raw=JSON.parse(encodeSave(p,{x:77,z:zone==="port"?-300:-203,yaw:0},99));
      delete raw.progress.act2.cleared;
      const loaded=decodeSave(JSON.stringify(raw))!;
      expect(loaded.progress.act2.cleared).toEqual([...flags]);
      expect(loaded.progress.act2).toMatchObject({started:true,lumoTaken:true,coins:73,upgrades:["leafy"]});
      expect(loaded.progress.bag).toEqual({fish:3});
      expect(loaded.progress.endings).toBe(3);
    }
  });
  it("new in-progress saves do not acquire unlocks merely by loading or resting",()=>{
    const p=startAct2(done());p.act2.descended=true;p.act2.zone="camp";p.act2.checkpoint="camp";
    const loaded=decodeSave(encodeSave(p,{x:76,z:-191,yaw:0},10))!;
    expect(loaded.progress.act2.cleared).toEqual([]);
  });
});

it("legacy branch saves already past a new exit keep their retreat route",()=>{
  for(const [zone,x,z]of [["grove",58,-243],["canopy",95,-244],["forest1",79,-185],["coast",76,-289]]as const){
    const p=startAct2(done());p.act2.descended=true;p.act2.zone=zone;
    const raw=JSON.parse(encodeSave(p,{x,z,yaw:0},20));delete raw.progress.act2.cleared;
    expect(decodeSave(JSON.stringify(raw))!.progress.act2.cleared).toContain(zone);
  }
});
