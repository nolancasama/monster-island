import { MONSTERS, LIVE_MONSTERS, MONSTER_ORDER, type MonsterDef } from "../data/monsters";
import { BAG_MAX, FOODS } from "../data/foods";
import type { AbilityId, Bag, FoodId, MonsterId, ObstacleId } from "../types";
import type { PhraseId } from "./english";

/**
 * The saved game: what the student has learned and unlocked. Pure functions
 * only (no store, no timers), so every rule here is unit-tested.
 */

export interface MonsterRecord {
  /** Seen up close and described in the journal ("It's green."): name and colour are known. */
  discovered: boolean;
  /** Foods asked about: true = "Yes, I do!", false = "No, I don't.". */
  asked: Partial<Record<FoodId, boolean>>;
  friend: boolean;
  /** "Can you ___?" answers heard from this monster. */
  canKnown: Partial<Record<AbilityId, boolean>>;
}

export interface Progress {
  monsters: Record<MonsterId, MonsterRecord>;
  /** The companion following the player (always a friend). */
  active: MonsterId | null;
  bag: Bag;
  solved: ObstacleId[];
  metMaple: boolean;
  /** The Phase 1 ending (the Monster Stone) has played. */
  finished: boolean;
  /** Every sentence produced at least once. */
  said: PhraseId[];
}

const emptyRecord = (): MonsterRecord => ({ discovered: false, asked: {}, friend: false, canKnown: {} });

export function newProgress(): Progress {
  const monsters = {} as Record<MonsterId, MonsterRecord>;
  for (const id of MONSTER_ORDER) monsters[id] = emptyRecord();
  return { monsters, active: null, bag: {}, solved: [], metMaple: false, finished: false, said: [] };
}

// ------------------------------------------------------------ monster answers

export function likes(def: MonsterDef, food: FoodId): boolean {
  return def.favorite === food;
}

/** The monster's spoken answer to "Do you like ___?". */
export function answerLike(def: MonsterDef, food: FoodId): { yes: boolean; short: string; long: string } {
  const word = FOODS[food].word;
  return likes(def, food)
    ? { yes: true, short: "Yes, I do!", long: `I like ${word}!` }
    : { yes: false, short: "No, I don't.", long: `I don't like ${word}.` };
}

export function canDo(def: MonsterDef, ability: AbilityId): boolean {
  return def.can.includes(ability);
}

export function answerCan(def: MonsterDef, ability: AbilityId): { yes: boolean; short: string } {
  return canDo(def, ability) ? { yes: true, short: "Yes, I can!" } : { yes: false, short: "No, I can't." };
}

// ------------------------------------------------------------ friendship

const withMonster = (p: Progress, id: MonsterId, patch: Partial<MonsterRecord>): Progress => ({
  ...p,
  monsters: { ...p.monsters, [id]: { ...p.monsters[id], ...patch } }
});

export function discover(p: Progress, id: MonsterId): Progress {
  return p.monsters[id].discovered ? p : withMonster(p, id, { discovered: true });
}

/** Records the answer to "Do you like <food>?". */
export function recordLike(p: Progress, id: MonsterId, food: FoodId): Progress {
  const yes = likes(MONSTERS[id], food);
  return withMonster(p, id, { asked: { ...p.monsters[id].asked, [food]: yes } });
}

export function recordCan(p: Progress, id: MonsterId, ability: AbilityId): Progress {
  return withMonster(p, id, { canKnown: { ...p.monsters[id].canKnown, [ability]: canDo(MONSTERS[id], ability) } });
}

/** The monster has said which food it likes. */
export function favoriteKnown(p: Progress, id: MonsterId): boolean {
  return p.monsters[id].asked[MONSTERS[id].favorite] === true;
}

/** Foods already answered "No" (shown crossed out on the question cards). */
export function dislikedKnown(p: Progress, id: MonsterId): FoodId[] {
  const asked = p.monsters[id].asked;
  return (Object.keys(asked) as FoodId[]).filter((f) => asked[f] === false);
}

export function has(p: Progress, food: FoodId): boolean {
  return (p.bag[food] ?? 0) > 0;
}

/** Food can be offered only after the monster said "I like ___" (English gates friendship). */
export function canOffer(p: Progress, id: MonsterId): boolean {
  const r = p.monsters[id];
  return r.discovered && !r.friend && favoriteKnown(p, id) && has(p, MONSTERS[id].favorite);
}

/** Eat the favourite food and become friends. The first friend becomes the companion. */
export function befriend(p: Progress, id: MonsterId): Progress {
  if (!canOffer(p, id)) return p;
  const food = MONSTERS[id].favorite;
  const next = withMonster(p, id, { friend: true });
  return { ...next, bag: { ...next.bag, [food]: (next.bag[food] ?? 0) - 1 }, active: next.active ?? id };
}

export function friends(p: Progress): MonsterId[] {
  return MONSTER_ORDER.filter((id) => p.monsters[id].friend);
}

/** Switch the companion. Only friends can follow; switching is immediate. */
export function setActive(p: Progress, id: MonsterId): Progress {
  if (!p.monsters[id].friend || p.active === id) return p;
  return { ...p, active: id };
}

export function pickUp(p: Progress, food: FoodId): Progress {
  const n = p.bag[food] ?? 0;
  if (n >= BAG_MAX) return p;
  return { ...p, bag: { ...p.bag, [food]: n + 1 } };
}

export function noteSaid(p: Progress, id: PhraseId): Progress {
  return p.said.includes(id) ? p : { ...p, said: [...p.said, id] };
}

// ------------------------------------------------------------ obstacles

export interface ObstacleDef {
  id: ObstacleId;
  /** The ability that solves it. */
  needs: AbilityId;
  /** The question the student asks the companion here. */
  question: PhraseId;
  /** Other real questions offered with it in mic-free mode (answered truthfully, solve nothing). */
  others: PhraseId[];
  /** Obstacles that must be solved before this one can be reached. */
  after: ObstacleId[];
}

export const OBSTACLES: Record<ObstacleId, ObstacleDef> = {
  fallenPalm: { id: "fallenPalm", needs: "grow", question: "canHelp", others: ["canSwim", "canJump"], after: [] },
  river: { id: "river", needs: "swim", question: "canSwim", others: ["canFly", "canJump"], after: ["fallenPalm"] }
};

export function isSolved(p: Progress, id: ObstacleId): boolean {
  return p.solved.includes(id);
}

export type ObstacleAnswer =
  /** No companion: nobody to ask. */
  | { kind: "alone" }
  | { kind: "answer"; monster: MonsterId; ability: AbilityId; yes: boolean; solves: boolean };

/**
 * The active companion's truthful answer to a question asked at an obstacle.
 * "Can you help me?" means "can you do what this obstacle needs?".
 */
export function askAtObstacle(p: Progress, obstacle: ObstacleId, ability: AbilityId | "help"): ObstacleAnswer {
  if (!p.active) return { kind: "alone" };
  const def = MONSTERS[p.active];
  const o = OBSTACLES[obstacle];
  const asked: AbilityId = ability === "help" ? o.needs : ability;
  const yes = canDo(def, asked);
  return { kind: "answer", monster: def.id, ability: asked, yes, solves: yes && asked === o.needs && !isSolved(p, obstacle) };
}

export function solve(p: Progress, id: ObstacleId): Progress {
  if (isSolved(p, id)) return p;
  if (OBSTACLES[id].after.some((o) => !isSolved(p, o))) return p;
  return { ...p, solved: [...p.solved, id] };
}

/** A friend whose power solves this obstacle (for hints). */
export function helperFor(p: Progress, id: ObstacleId): MonsterId | null {
  return friends(p).find((m) => canDo(MONSTERS[m], OBSTACLES[id].needs)) ?? null;
}

// ------------------------------------------------------------ objective

export type Objective =
  | { id: "meetMaple" }
  | { id: "findMonster"; monster: MonsterId }
  | { id: "askFood"; monster: MonsterId }
  | { id: "getFood"; monster: MonsterId; food: FoodId }
  | { id: "giveFood"; monster: MonsterId; food: FoodId }
  | { id: "obstacle"; obstacle: ObstacleId; helper: MonsterId | null }
  | { id: "stone" }
  | { id: "explore" };

/** Where each live monster can be reached from (the obstacle that guards it). */
export const GUARDED_BY: Partial<Record<MonsterId, ObstacleId>> = { bubbo: "fallenPalm" };

/** The one next thing to do (HUD card, Maple's hint, the star marker). */
export function objective(p: Progress): Objective {
  if (!p.metMaple) return { id: "meetMaple" };
  for (const id of LIVE_MONSTERS) {
    const r = p.monsters[id];
    if (r.friend) continue;
    const guard = GUARDED_BY[id];
    if (guard && !isSolved(p, guard)) return { id: "obstacle", obstacle: guard, helper: helperFor(p, guard) };
    if (!r.discovered) return { id: "findMonster", monster: id };
    const food = MONSTERS[id].favorite;
    if (!favoriteKnown(p, id)) return { id: "askFood", monster: id };
    if (!has(p, food)) return { id: "getFood", monster: id, food };
    return { id: "giveFood", monster: id, food };
  }
  if (!isSolved(p, "river")) return { id: "obstacle", obstacle: "river", helper: helperFor(p, "river") };
  if (!p.finished) return { id: "stone" };
  return { id: "explore" };
}
