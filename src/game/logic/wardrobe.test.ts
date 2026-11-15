import { describe, expect, it } from "vitest";
import { newProgress, type Progress } from "./progress";
import { addCoins, findPort, markDescended, startAct2 } from "./act2";
import { decodeSave, encodeSave } from "./save";
import { buyWearable, canWear, giveWearable, outfitOf, readWardrobe, takeOff, teamBonus, wardrobeBonus, wear, wornBy, markClothesVisited } from "./wardrobe";
import { STAT_BONUS, WEARABLES, WEARABLE_IDS, WEAR_STATS, type WearableId } from "../data/wearables";
import type { MonsterId } from "../types";

function done(): Progress {
  const p = newProgress();
  for (const id of ["leafy", "bubbo", "puff", "ember", "lumo"] as MonsterId[]) {
    p.monsters[id] = { discovered: true, asked: {}, friend: true, canKnown: {}, described: { name: id === "lumo", size: true, part: true }, ...(id === "ember" ? { invited: true } : {}) };
  }
  return { ...p, active: "leafy", metMaple: true, endings: 3, solved: ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame"] };
}

/** In Port Town with coins to spend. */
const town = (coins = 1000) => addCoins(findPort(markDescended(startAct2(done()))), coins);

function own(p: Progress, ...items: WearableId[]): Progress {
  for (const item of items) {
    const res = buyWearable(p, item);
    if (!res.ok) throw new Error(`could not buy ${item}`);
    p = res.progress;
  }
  return p;
}

const roundTrip = (p: Progress) => decodeSave(encodeSave(p, { x: 77, z: -303, yaw: 0 }, 30))!.progress;

describe("the catalog", () => {
  it("has 13 items for sale plus the Captain Hat gift, each stat on exactly one item, and a line and colours for each", () => {
    expect(WEARABLE_IDS.filter((id) => !WEARABLES[id].gift)).toHaveLength(13);
    expect(WEARABLE_IDS.filter((id) => WEARABLES[id].gift)).toEqual(["captainHat"]);
    for (const stat of WEAR_STATS) expect(WEARABLE_IDS.filter((id) => WEARABLES[id].stat === stat), stat).toHaveLength(1);
    for (const id of WEARABLE_IDS) {
      const d = WEARABLES[id];
      expect(d.line, id).toMatch(/^(This is an? |These are )[a-z ]+\.$/);
      expect(d.colors.length, id).toBeGreaterThan(0);
      expect(d.price > 0, id).toBe(!d.gift);
    }
  });
});

describe("buying and wearing", () => {
  it("buying costs coins once; not enough coins buys nothing", () => {
    expect(buyWearable(town(5), "pirateHat")).toEqual({ ok: false, reason: "coins" });
    const p = own(town(100), "pirateHat");
    expect(p.act2.coins).toBe(60);
    expect(p.act2.wardrobe.owned).toEqual(["pirateHat"]);
    expect(buyWearable(p, "pirateHat")).toEqual({ ok: false, reason: "owned" });
  });

  it("only owned items can be worn, by allowed wearers who are friends", () => {
    const p = own(town(), "explorerHat", "babyBonnet", "crown");
    expect(wear(town(), "crown", "player")).toEqual(town());
    expect(canWear(p, "explorerHat", "player")).toBe(true);
    expect(canWear(p, "explorerHat", "puff")).toBe(false);
    expect(canWear(p, "babyBonnet", "player")).toBe(false);
    expect(canWear(p, "babyBonnet", "ember")).toBe(true);
    expect(wear(p, "explorerHat", "puff")).toBe(p);
    const stranger = { ...p, monsters: { ...p.monsters, bubbo: { ...p.monsters.bubbo, friend: false } } };
    expect(canWear(stranger, "crown", "bubbo")).toBe(false);
    expect(wear(stranger, "crown", "bubbo")).toBe(stranger);
  });

  it("one wearer at a time, one item per slot; the replaced item stays owned", () => {
    let p = own(town(), "pirateHat", "crown", "sunglasses");
    p = wear(p, "pirateHat", "leafy");
    p = wear(p, "sunglasses", "leafy");
    expect(outfitOf(p, "leafy")).toEqual({ head: "pirateHat", face: "sunglasses" });
    p = wear(p, "pirateHat", "bubbo");
    expect(wornBy(p, "pirateHat")).toBe("bubbo");
    expect(outfitOf(p, "leafy")).toEqual({ face: "sunglasses" });
    p = wear(p, "crown", "bubbo");
    expect(outfitOf(p, "bubbo")).toEqual({ head: "crown" });
    expect(wornBy(p, "pirateHat")).toBeNull();
    expect(p.act2.wardrobe.owned).toContain("pirateHat");
    p = takeOff(p, "sunglasses");
    expect(p.act2.wardrobe.worn.leafy).toBeUndefined();
    expect(takeOff(p, "sunglasses")).toBe(p);
  });

  it("bonuses help the team only while worn, and a stat never counts twice", () => {
    let p = own(town(), "bandana", "goggles", "partyHat");
    expect(wardrobeBonus(p)).toEqual({ power: 0, push: 0, speed: 0, defense: 0, coins: 0, combo: 0 });
    p = wear(wear(wear(p, "bandana", "ember"), "goggles", "player"), "partyHat", "puff");
    expect(wardrobeBonus(p)).toMatchObject({ power: STAT_BONUS.power, push: STAT_BONUS.push, coins: 0 });
    expect(teamBonus(p)).toBe(teamBonus(p));
    expect(wardrobeBonus(takeOff(p, "bandana")).power).toBe(0);
  });

  it("a gift is never sold, and is given once", () => {
    expect(buyWearable(town(), "captainHat")).toEqual({ ok: false, reason: "gift" });
    const p = giveWearable(town(), "captainHat");
    expect(p.act2.wardrobe.owned).toEqual(["captainHat"]);
    expect(p.act2.coins).toBe(town().act2.coins);
    expect(giveWearable(p, "captainHat")).toBe(p);
    expect(canWear(p, "captainHat", "ember")).toBe(true);
  });

  it("the first visit is remembered", () => {
    const p = markClothesVisited(town());
    expect(p.act2.wardrobe.visited).toBe(true);
    expect(markClothesVisited(p)).toBe(p);
  });
});

describe("the saved wardrobe", () => {
  it("round-trips what is owned and worn", () => {
    const p = wear(wear(own(markClothesVisited(town()), "pirateHat", "heartGlasses"), "pirateHat", "player"), "heartGlasses", "puff");
    expect(roundTrip(p).act2.wardrobe).toEqual(p.act2.wardrobe);
  });

  it("drops bad ids, unowned or wrongly-slotted items, wrong wearers and duplicates", () => {
    const p = town();
    const w = readWardrobe({
      visited: "yes",
      owned: ["pirateHat", "pirateHat", "jetpack", 7, "explorerHat", "goggles", "crown"],
      worn: {
        player: { head: "crown", face: "pirateHat" },
        leafy: { head: "crown", face: "goggles" },
        puff: { head: "explorerHat" },
        bubbo: { head: "bigBow" },
        lumo: { head: "pirateHat" },
      },
    }, p);
    expect(w.visited).toBe(false);
    expect(w.owned).toEqual(["pirateHat", "explorerHat", "goggles", "crown"]);
    expect(w.worn).toEqual({ player: { head: "crown" }, leafy: { face: "goggles" } });
    const stranger = { ...p, monsters: { ...p.monsters, leafy: { ...p.monsters.leafy, friend: false } } };
    expect(readWardrobe({ owned: ["goggles"], worn: { leafy: { face: "goggles" } } }, stranger).worn).toEqual({});
    expect(readWardrobe(null, p)).toEqual({ owned: [], worn: {}, visited: false });
  });

  it("is ignored before the town is found", () => {
    const before = markDescended(startAct2(done()));
    const sneaky = { ...before, act2: { ...before.act2, wardrobe: { owned: ["crown" as const], worn: { player: { head: "crown" as const } }, visited: true } } };
    expect(roundTrip(sneaky).act2.wardrobe).toEqual({ owned: [], worn: {}, visited: false });
  });
});
