import type { FoodId, ItemId, ObstacleId } from "../types";
import type { Progress } from "./progress";
import { BAG_MAX } from "../data/foods";
import { ACT2_BAG_MAX, COMPANION_IDS, FOOD_RESTORE, KO_HP, MAX_HP, MAX_MP, MP_REGEN, PRICES, RECIPES, type CompanionId } from "../data/combat";
import { CHESTS, type ZoneId } from "../world/lowland";

/**
 * Act 2, "The Hunt for Lumo": what is saved and the pure rules on it.
 * HP and MP change every frame in a fight, so the live values sit in the
 * runtime (combat.ts) and are copied into the save when it is written;
 * every other Act 2 change is a progress update like the prologue's.
 */

export type TutorialStep = "attack" | "coins" | "special" | "eat" | "rest" | "switch";
export const TUTORIAL_STEPS: TutorialStep[] = ["attack", "coins", "special", "eat", "rest", "switch"];
/** Where a knocked-out player wakes up: the foot of the rope, the camp, or the town's inn. */
export type Checkpoint = "cliff" | "camp" | "port";

export interface Act2 {
  /** The kidnapping has played (Lumo stays a friend; being taken is a separate fact). */
  started: boolean;
  lumoTaken: boolean;
  /** Climbed down the cliff at least once. */
  descended: boolean;
  hp: number;
  mp: Record<CompanionId, number>;
  coins: number;
  items: Partial<Record<ItemId, number>>;
  /** Friends who have eaten their treat (and learned its upgrade). */
  upgrades: CompanionId[];
  /** One-time treasure chests opened. */
  chests: string[];
  /** Tutorial hints already understood (never shown again). */
  tutorial: TutorialStep[];
  checkpoint: Checkpoint;
  portFound: boolean;
  /** Has bought food once (the full shop conversation; afterwards quick buying). */
  bought: boolean;
  /** Heard where the raiders' ship went. */
  harbor: boolean;
  /** Special commands practised with the trainer. */
  trained: CompanionId[];
  /** The area the player was in when last saved. */
  zone: ZoneId | null;
}

export const fullMp = (): Record<CompanionId, number> => ({ leafy: MAX_MP, bubbo: MAX_MP, puff: MAX_MP, ember: MAX_MP });

export function newAct2(): Act2 {
  return {
    started: false, lumoTaken: false, descended: false, hp: MAX_HP, mp: fullMp(), coins: 0, items: {}, upgrades: [],
    chests: [], tutorial: [], checkpoint: "cliff", portFound: false, bought: false, harbor: false, trained: [], zone: null
  };
}

/** The original adventure is over: all five friends, the finale played. */
export function prologueComplete(p: Progress): boolean {
  return p.endings >= 3 && p.monsters.lumo.friend;
}

const withAct2 = (p: Progress, patch: Partial<Act2>): Progress => ({ ...p, act2: { ...p.act2, ...patch } });

/** The raiders take Lumo: recorded once, and only after Lumo has become a friend. */
export function startAct2(p: Progress): Progress {
  if (!prologueComplete(p) || p.act2.started) return p;
  return withAct2(p, { started: true, lumoTaken: true });
}

export function bagMax(p: Progress): number {
  return p.act2.started ? ACT2_BAG_MAX : BAG_MAX;
}

export function markTutorial(p: Progress, step: TutorialStep): Progress {
  return p.act2.tutorial.includes(step) ? p : withAct2(p, { tutorial: [...p.act2.tutorial, step] });
}

export function setCheckpoint(p: Progress, c: Checkpoint): Progress {
  return p.act2.checkpoint === c ? p : withAct2(p, { checkpoint: c });
}

export function markDescended(p: Progress): Progress {
  return p.act2.descended ? p : withAct2(p, { descended: true });
}

export function findPort(p: Progress): Progress {
  return p.act2.portFound || !p.act2.started ? p : withAct2(p, { portFound: true, checkpoint: "port" });
}

export function hearLead(p: Progress): Progress {
  return p.act2.harbor || !p.act2.portFound ? p : withAct2(p, { harbor: true });
}

export function addCoins(p: Progress, n: number): Progress {
  return withAct2(p, { coins: Math.max(0, Math.min(9999, p.act2.coins + Math.floor(n))) });
}

export function addItem(p: Progress, item: ItemId, n = 1): Progress {
  return withAct2(p, { items: { ...p.act2.items, [item]: Math.max(0, (p.act2.items[item] ?? 0) + n) } });
}

/** Add food to the bag, up to the bag's limit; returns how many fitted. */
export function addFood(p: Progress, food: FoodId, n: number): { progress: Progress; added: number } {
  const have = p.bag[food] ?? 0;
  const added = Math.max(0, Math.min(n, bagMax(p) - have));
  return { progress: added ? { ...p, bag: { ...p.bag, [food]: have + added } } : p, added };
}

// ------------------------------------------------------------ HP and MP

export interface Vitals {
  hp: number;
  mp: Record<CompanionId, number>;
}

const clampHp = (n: number) => Math.max(0, Math.min(MAX_HP, n));
const clampMp = (n: number) => Math.max(0, Math.min(MAX_MP, n));

/** Damage to the player (or the friend carrying the player: one shared HP pool). */
export function hurt(v: Vitals, n: number): Vitals {
  return { ...v, hp: clampHp(v.hp - n) };
}

/** Spend MP on a special; null when there is not enough. */
export function spendMp(v: Vitals, friend: CompanionId, cost: number): Vitals | null {
  if (v.mp[friend] < cost) return null;
  return { ...v, mp: { ...v.mp, [friend]: clampMp(v.mp[friend] - cost) } };
}

/** Every friend's MP comes back slowly, also while another friend is out. */
export function regenMp(v: Vitals, dt: number): Vitals {
  const mp = { ...v.mp };
  for (const id of COMPANION_IDS) mp[id] = clampMp(mp[id] + MP_REGEN * dt);
  return { ...v, mp };
}

/** Eating: HP for the player, MP for the friend who loves that food. */
export function eatEffect(v: Vitals, food: FoodId): Vitals {
  const r = FOOD_RESTORE[food];
  const mp = { ...v.mp };
  if (r.friend) mp[r.friend] = clampMp(mp[r.friend] + r.mp);
  return { hp: clampHp(v.hp + r.hp), mp };
}

/** Would eating this food help right now (HP or its friend's MP below full)? */
export function eatHelps(v: Vitals, food: FoodId): boolean {
  const r = FOOD_RESTORE[food];
  return v.hp < MAX_HP || (r.friend !== null && v.mp[r.friend] < MAX_MP);
}

/**
 * Which food the quick-eat key uses: the active friend's favourite if its MP
 * is low, otherwise whatever helps most. Null when nothing in the bag helps.
 */
export function bestFood(v: Vitals, bag: Partial<Record<FoodId, number>>, active: CompanionId | null): FoodId | null {
  const have = (Object.keys(FOOD_RESTORE) as FoodId[]).filter((f) => (bag[f] ?? 0) > 0 && eatHelps(v, f));
  if (!have.length) return null;
  const score = (f: FoodId) => {
    const r = FOOD_RESTORE[f];
    const hp = Math.min(r.hp, MAX_HP - v.hp);
    const mp = r.friend ? Math.min(r.mp, MAX_MP - v.mp[r.friend]) * (r.friend === active ? 1.5 : 0.6) : 0;
    return hp + mp;
  };
  return have.sort((a, b) => score(b) - score(a))[0];
}

/** A rest at a camp or the inn: everything back to full. */
export function rested(): Vitals {
  return { hp: MAX_HP, mp: fullMp() };
}

/** After a knock-out: enough HP to carry on; MP, coins and items are kept. */
export function afterKnockout(v: Vitals): Vitals {
  return { ...v, hp: Math.max(v.hp, KO_HP) };
}

// ------------------------------------------------------------ shop, kitchen, chests

export type BuyResult = { ok: true; progress: Progress } | { ok: false; reason: "coins" | "bag" };

export function buy(p: Progress, food: FoodId, n: number): BuyResult {
  const cost = PRICES[food] * n;
  if (p.act2.coins < cost) return { ok: false, reason: "coins" };
  if ((p.bag[food] ?? 0) + n > bagMax(p)) return { ok: false, reason: "bag" };
  const next = addCoins(addFood(p, food, n).progress, -cost);
  return { ok: true, progress: withAct2(next, { bought: true }) };
}

/** What is still missing for a friend's treat (empty = it can be made). */
export function craftMissing(p: Progress, friend: CompanionId): Array<FoodId | ItemId> {
  const r = RECIPES[friend];
  const missing: Array<FoodId | ItemId> = r.foods.filter((f) => (p.bag[f] ?? 0) < 1);
  if ((p.act2.items.amber ?? 0) < r.amber) missing.push("amber");
  return missing;
}

/** Make and feed the treat: uses the foods and amber, teaches the upgrade (once per friend). */
export function craft(p: Progress, friend: CompanionId): Progress {
  if (p.act2.upgrades.includes(friend) || craftMissing(p, friend).length || !p.monsters[friend].friend) return p;
  const r = RECIPES[friend];
  const bag = { ...p.bag };
  for (const f of r.foods) bag[f] = (bag[f] ?? 0) - 1;
  const next = addItem({ ...p, bag }, "amber", -r.amber);
  return withAct2(next, { upgrades: [...next.act2.upgrades, friend] });
}

export function practise(p: Progress, friend: CompanionId): Progress {
  return p.act2.trained.includes(friend) ? p : withAct2(p, { trained: [...p.act2.trained, friend] });
}

/** Open a one-time chest: its coins, amber and food (food that does not fit stays behind). */
export function openChest(p: Progress, id: string): Progress {
  const c = CHESTS.find((x) => x.id === id);
  if (!c || p.act2.chests.includes(id) || !p.act2.started) return p;
  let next = withAct2(p, { chests: [...p.act2.chests, id] });
  next = addCoins(next, c.coins);
  if (c.amber) next = addItem(next, "amber", c.amber);
  if (c.food) next = addFood(next, c.food.id, c.food.n).progress;
  return next;
}

// ------------------------------------------------------------ enemy areas

/**
 * Secret-of-Mana style areas: an area's normal enemies come back when it is
 * entered again, but only after the player has spent RESPAWN_AWAY seconds
 * of play somewhere else, so stepping back and forth over a border never
 * makes a fresh crowd (and fresh coins) appear.
 */
export const RESPAWN_AWAY = 12;

export interface ZoneMemory {
  current: ZoneId | null;
  /** Spawn indices knocked out in each area (cleared when it respawns). */
  defeated: Partial<Record<ZoneId, number[]>>;
  /** Play time the player last left each area. */
  leftAt: Partial<Record<ZoneId, number>>;
}

export function newZoneMemory(): ZoneMemory {
  return { current: null, defeated: {}, leftAt: {} };
}

/** Moving into `zone` at play time `now` (null = outside every area, e.g. on the rope). */
export function changeZone(mem: ZoneMemory, zone: ZoneId | null, now: number): { mem: ZoneMemory; respawn: ZoneId | null } {
  if (zone === mem.current) return { mem, respawn: null };
  const leftAt = { ...mem.leftAt };
  if (mem.current) leftAt[mem.current] = now;
  let defeated = mem.defeated;
  let respawn: ZoneId | null = null;
  if (zone) {
    const away = leftAt[zone] === undefined ? Infinity : now - leftAt[zone]!;
    if (away >= RESPAWN_AWAY && (defeated[zone]?.length ?? 0) > 0) {
      defeated = { ...defeated, [zone]: [] };
      respawn = zone;
    }
  }
  return { mem: { current: zone, defeated, leftAt }, respawn };
}

export function noteDefeat(mem: ZoneMemory, zone: ZoneId, index: number): ZoneMemory {
  const list = mem.defeated[zone] ?? [];
  return list.includes(index) ? mem : { ...mem, defeated: { ...mem.defeated, [zone]: [...list, index] } };
}

// ------------------------------------------------------------ objective

export type Act2Objective =
  /** A finished prologue save: go and see Lumo, which starts Act 2. */
  | { id: "act2Start" }
  | { id: "descend" }
  | { id: "openChest" }
  | { id: "rest" }
  | { id: "reachPort" }
  | { id: "market" }
  | { id: "kitchen" }
  | { id: "harbor" }
  | { id: "act2Done" };

/** The Act 2 step, once the prologue is complete. */
export function act2Objective(p: Progress): Act2Objective {
  const a = p.act2;
  if (!a.started) return { id: "act2Start" };
  if (!a.descended) return { id: "descend" };
  if (!a.chests.includes("forestChest")) return { id: "openChest" };
  if (!a.tutorial.includes("rest")) return { id: "rest" };
  if (!a.portFound) return { id: "reachPort" };
  if (a.harbor) return { id: "act2Done" };
  if (!a.bought) return { id: "market" };
  if (!a.upgrades.length) return { id: "kitchen" };
  return { id: "harbor" };
}

/** Act 2's permanent unlocks exist only once the chapter has begun. */
export const ACT2_OBSTACLES: ObstacleId[] = ["groveLilies", "canopyVines", "canopyRope", "causewayGate"];
