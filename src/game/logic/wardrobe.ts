import type { Progress } from "./progress";
import { STAT_BONUS, WEARABLES, WEARABLE_IDS, WEARERS, WEAR_SLOTS, type WearSlot, type WearStat, type Wearer, type WearableId } from "../data/wearables";

/**
 * The clothes the player owns and who wears what (pure; saved as
 * `act2.wardrobe`). Rules in docs/PORT_TOWN_REVAMP.md §3.3: bought once, one
 * wearer at a time, one item per slot per wearer, bonuses team-wide.
 */
export interface Wardrobe {
  owned: WearableId[];
  worn: Partial<Record<Wearer, Partial<Record<WearSlot, WearableId>>>>;
  /** Has met Ms. Button (the full greeting is only the first time). */
  visited: boolean;
}

export const newWardrobe = (): Wardrobe => ({ owned: [], worn: {}, visited: false });

const withWardrobe = (p: Progress, wardrobe: Wardrobe): Progress => ({ ...p, act2: { ...p.act2, wardrobe } });
const isWearable = (v: unknown): v is WearableId => typeof v === "string" && (WEARABLE_IDS as readonly string[]).includes(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The item's own rule: anyone, the player only, or the friends only. */
export function allowedWearer(item: WearableId, who: Wearer): boolean {
  const rule = WEARABLES[item].who;
  return rule === "everyone" || (rule === "player") === (who === "player");
}

/** Allowed by the item, and a friend (never Lumo) when it is a monster. */
export function canWear(p: Progress, item: WearableId, who: Wearer): boolean {
  return allowedWearer(item, who) && (who === "player" || p.monsters[who].friend);
}

export function wornBy(p: Progress, item: WearableId): Wearer | null {
  const slot = WEARABLES[item].slot;
  for (const who of WEARERS) if (p.act2.wardrobe.worn[who]?.[slot] === item) return who;
  return null;
}

export function outfitOf(p: Progress, who: Wearer): Partial<Record<WearSlot, WearableId>> {
  return p.act2.wardrobe.worn[who] ?? {};
}

export type BuyWearResult = { ok: true; progress: Progress } | { ok: false; reason: "owned" | "coins" };

export function buyWearable(p: Progress, item: WearableId): BuyWearResult {
  const w = p.act2.wardrobe;
  if (w.owned.includes(item)) return { ok: false, reason: "owned" };
  const price = WEARABLES[item].price;
  if (p.act2.coins < price) return { ok: false, reason: "coins" };
  return { ok: true, progress: { ...p, act2: { ...p.act2, coins: p.act2.coins - price, wardrobe: { ...w, owned: [...w.owned, item] } } } };
}

/** Put an owned item on `who`: it leaves anyone else and replaces `who`'s item in that slot. */
export function wear(p: Progress, item: WearableId, who: Wearer): Progress {
  const w = p.act2.wardrobe;
  const slot = WEARABLES[item].slot;
  if (!w.owned.includes(item) || !canWear(p, item, who) || w.worn[who]?.[slot] === item) return p;
  const worn: Wardrobe["worn"] = {};
  for (const id of WEARERS) {
    const outfit = { ...(w.worn[id] ?? {}) };
    if (outfit[slot] === item) delete outfit[slot];
    if (id === who) outfit[slot] = item;
    if (Object.keys(outfit).length) worn[id] = outfit;
  }
  return withWardrobe(p, { ...w, worn });
}

/** Take an item off whoever wears it; it stays owned. */
export function takeOff(p: Progress, item: WearableId): Progress {
  const who = wornBy(p, item);
  if (!who) return p;
  const w = p.act2.wardrobe;
  const outfit = { ...(w.worn[who] ?? {}) };
  delete outfit[WEARABLES[item].slot];
  const worn = { ...w.worn };
  if (Object.keys(outfit).length) worn[who] = outfit;
  else delete worn[who];
  return withWardrobe(p, { ...w, worn });
}

export function markClothesVisited(p: Progress): Progress {
  return p.act2.wardrobe.visited ? p : withWardrobe(p, { ...p.act2.wardrobe, visited: true });
}

export type WearBonus = Record<WearStat, number>;

/** Team-wide bonuses of everything worn (a stat never counts twice). */
export function wardrobeBonus(p: Progress): WearBonus {
  const bonus: WearBonus = { power: 0, push: 0, speed: 0, defense: 0, coins: 0, combo: 0 };
  for (const who of WEARERS) {
    const outfit = p.act2.wardrobe.worn[who];
    if (!outfit || (who !== "player" && !p.monsters[who].friend)) continue;
    for (const slot of WEAR_SLOTS) {
      const stat = outfit[slot] ? WEARABLES[outfit[slot]!].stat : null;
      if (stat) bonus[stat] = STAT_BONUS[stat];
    }
  }
  return bonus;
}

let memo: { wardrobe: Wardrobe; monsters: Progress["monsters"]; bonus: WearBonus } | null = null;

/** `wardrobeBonus`, recomputed only when the wardrobe or the friends change (per-hit use). */
export function teamBonus(p: Progress): WearBonus {
  if (memo && memo.wardrobe === p.act2.wardrobe && memo.monsters === p.monsters) return memo.bonus;
  memo = { wardrobe: p.act2.wardrobe, monsters: p.monsters, bonus: wardrobeBonus(p) };
  return memo.bonus;
}

/** Re-validate a saved wardrobe (docs/PORT_TOWN_REVAMP.md §5); `p.monsters` must already be read. */
export function readWardrobe(raw: unknown, p: Progress): Wardrobe {
  const w = newWardrobe();
  if (!isObj(raw)) return w;
  w.visited = raw.visited === true;
  w.owned = Array.isArray(raw.owned) ? [...new Set(raw.owned.filter(isWearable))] : [];
  const worn = isObj(raw.worn) ? raw.worn : {};
  const used = new Set<WearableId>();
  for (const who of WEARERS) {
    const saved = worn[who];
    if (!isObj(saved)) continue;
    const outfit: Partial<Record<WearSlot, WearableId>> = {};
    for (const slot of WEAR_SLOTS) {
      const item = saved[slot];
      if (!isWearable(item) || !w.owned.includes(item) || used.has(item) || WEARABLES[item].slot !== slot || !canWear(p, item, who)) continue;
      outfit[slot] = item;
      used.add(item);
    }
    if (Object.keys(outfit).length) w.worn[who] = outfit;
  }
  return w;
}
