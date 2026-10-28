import { MONSTERS, MONSTER_ORDER, monstersOfPhase, type MonsterDef } from "../data/monsters";
import { FOODS, islandFoods } from "../data/foods";
import type { AbilityId, Bag, FoodId, MonsterId, ObstacleId } from "../types";
import type { PhraseId } from "./english";
import { ACT2_OBSTACLES, act2Objective, bagMax, newAct2, prologueComplete, type Act2, type Act2Objective } from "./act2";

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
  /** Journal lines said beyond the colour: "It's small." (size), "It has wings." (part). */
  described: { name?: boolean; size?: boolean; part?: boolean };
  /** Ember's post-friendship "Let's go!" has been said. */
  invited?: boolean;
}

export interface Progress {
  monsters: Record<MonsterId, MonsterRecord>;
  /** The companion following the player (always a friend). */
  active: MonsterId | null;
  bag: Bag;
  solved: ObstacleId[];
  metMaple: boolean;
  /** The highest phase whose ending has played (1: the Monster Stone, 2: the cliff top). */
  endings: number;
  /** Every sentence produced at least once. */
  said: PhraseId[];
  /** Act 2: The Hunt for Lumo (untouched until the prologue is complete). */
  act2: Act2;
}

const emptyRecord = (): MonsterRecord => ({ discovered: false, asked: {}, friend: false, canKnown: {}, described: {} });

export function newProgress(): Progress {
  const monsters = {} as Record<MonsterId, MonsterRecord>;
  for (const id of MONSTER_ORDER) monsters[id] = emptyRecord();
  return { monsters, active: null, bag: {}, solved: [], metMaple: false, endings: 0, said: [], act2: newAct2() };
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

export type DescribeLine = "name" | "size" | "part";

/** Records a journal line said about a monster (size or body part). */
export function describeLine(p: Progress, id: MonsterId, line: DescribeLine): Progress {
  const r = p.monsters[id];
  if (!r.discovered || (line === "part" && !MONSTERS[id].part)) return p;
  if (line === "name" && id !== "lumo") return p;
  return withMonster(p, id, { described: { ...r.described, [line]: true } });
}

/** Lines this monster's journal page has but the student has not said yet, in order. */
export function missingLines(p: Progress, id: MonsterId): DescribeLine[] {
  const r = p.monsters[id];
  if (!r.discovered) return [];
  const out: DescribeLine[] = [];
  if (id === "lumo" && !r.described.name) out.push("name");
  if (!r.described.size) out.push("size");
  if (MONSTERS[id].part && !r.described.part) out.push("part");
  return out;
}

/**
 * The next line that is part of the story: from Phase 2 on, a new monster's
 * page is written in full (colour, size, body part). Phase 1 monsters' size
 * lines are optional extras (see optionalLines) and never block anything.
 */
export function neededLine(p: Progress, id: MonsterId): DescribeLine | null {
  return MONSTERS[id].phase >= 2 ? (missingLines(p, id)[0] ?? null) : null;
}

/** Optional journal lines (Phase 1 monsters' sizes), once the forest is open. */
export function optionalLines(p: Progress, id: MonsterId): DescribeLine[] {
  return MONSTERS[id].phase < 2 && p.endings >= 1 ? missingLines(p, id) : [];
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

/** After three No answers, offer only the favourite; every answer stays truthful. */
export function questionFoods(p: Progress, id: MonsterId): FoodId[] {
  if (MONSTERS[id].companion === false) return [];
  return dislikedKnown(p, id).length >= 3 ? [MONSTERS[id].favorite] : islandFoods(p);
}

export function has(p: Progress, food: FoodId): boolean {
  return (p.bag[food] ?? 0) > 0;
}

/** Food can be offered only after the monster said "I like ___" (English gates friendship). */
export function canOffer(p: Progress, id: MonsterId): boolean {
  const r = p.monsters[id];
  return MONSTERS[id].companion !== false && r.discovered && !r.friend && favoriteKnown(p, id) && has(p, MONSTERS[id].favorite);
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

/** Friends available for companion chips and switching. */
export function companions(p: Progress): MonsterId[] {
  return friends(p).filter((id) => MONSTERS[id].companion !== false);
}

/** Finish Ember's encounter with "Let's go!" and make it follow. */
export function invite(p: Progress, id: MonsterId): Progress {
  if (id !== "ember" || !p.monsters[id].friend) return p;
  return setActive(withMonster(p, id, { invited: true }), id);
}

export const LUMO_ASK_BACK = { en: "Do you like monsters?", answers: ["yesIDo", "noIDont"] as const };

/** Either answer makes Lumo a friend; it stays in the sanctuary. */
export function befriendLumo(p: Progress, answer: "yesIDo" | "noIDont"): Progress {
  if (!gateOpen(p) || !p.monsters.lumo.discovered || neededLine(p, "lumo") || p.monsters.lumo.friend) return p;
  return noteSaid(withMonster(p, "lumo", { friend: true }), answer);
}

/** Switch the companion. Only friends can follow; switching is immediate. */
export function setActive(p: Progress, id: MonsterId): Progress {
  if (MONSTERS[id].companion === false || !p.monsters[id].friend || p.active === id) return p;
  return { ...p, active: id };
}

export function pickUp(p: Progress, food: FoodId): Progress {
  const n = p.bag[food] ?? 0;
  if (n >= bagMax(p)) return p;
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
  river: { id: "river", needs: "swim", question: "canSwim", others: ["canFly", "canJump"], after: ["fallenPalm"] },
  bridge: { id: "bridge", needs: "grow", question: "canHelp", others: ["canSwim", "canFly"], after: ["river"] },
  cliff: { id: "cliff", needs: "fly", question: "canFly", others: ["canJump", "canSwim"], after: ["bridge"] },
  lava: { id: "lava", needs: "swim", question: "canHelp", others: ["canFly", "canJump"], after: ["cliff"] },
  cave: { id: "cave", needs: "fire", question: "canFire", others: ["canFly", "canSwim"], after: ["lava"] },
  gateLeaf: { id: "gateLeaf", needs: "grow", question: "canHelp", others: ["canSwim", "canFly"], after: ["cave"] },
  gateDrop: { id: "gateDrop", needs: "swim", question: "canSwim", others: ["canFly", "canFire"], after: ["cave"] },
  gateWing: { id: "gateWing", needs: "fly", question: "canFly", others: ["canFire", "canSwim"], after: ["cave"] },
  gateFlame: { id: "gateFlame", needs: "fire", question: "canFire", others: ["canSwim", "canFly"], after: ["cave"] },
  // Act 2: the grove's lily pads (optional treasure), the canopy's two gaps, and the causeway's shortcut gate.
  groveLilies: { id: "groveLilies", needs: "swim", question: "canSwim", others: ["canFly", "canFire"], after: [] },
  canopyVines: { id: "canopyVines", needs: "grow", question: "canHelp", others: ["canSwim", "canFire"], after: [] },
  canopyRope: { id: "canopyRope", needs: "fly", question: "canFly", others: ["canJump", "canSwim"], after: ["canopyVines"] },
  causewayGate: { id: "causewayGate", needs: "fire", question: "canFire", others: ["canSwim", "canFly"], after: [] }
};

export const GATES: ObstacleId[] = ["gateLeaf", "gateDrop", "gateWing", "gateFlame"];

export function gateOpen(p: Progress): boolean {
  return GATES.every((id) => isSolved(p, id));
}

/** Route and story prerequisites, shared by questions and permanent unlocks. */
export function obstacleAvailable(p: Progress, id: ObstacleId): boolean {
  if (OBSTACLES[id].after.some((o) => !isSolved(p, o))) return false;
  if (id === "lava" && p.endings < 2) return false;
  if (id === "cave" && (!p.monsters.ember.friend || !p.monsters.ember.invited)) return false;
  if (ACT2_OBSTACLES.includes(id) && !p.act2.started) return false;
  return true;
}

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
  return { kind: "answer", monster: def.id, ability: asked, yes, solves: yes && asked === o.needs && !isSolved(p, obstacle) && obstacleAvailable(p, obstacle) };
}

export function solve(p: Progress, id: ObstacleId): Progress {
  if (isSolved(p, id)) return p;
  if (!obstacleAvailable(p, id)) return p;
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
  | { id: "describe"; monster: MonsterId; line: DescribeLine }
  | { id: "askFood"; monster: MonsterId }
  | { id: "getFood"; monster: MonsterId; food: FoodId }
  | { id: "giveFood"; monster: MonsterId; food: FoodId }
  | { id: "obstacle"; obstacle: ObstacleId; helper: MonsterId | null }
  /** The Phase 1 ending. */
  | { id: "stone" }
  /** The Phase 2 ending. */
  | { id: "cliffTop" }
  | { id: "letsGo"; monster: MonsterId }
  | { id: "askBack"; monster: MonsterId }
  | { id: "finale" }
  | { id: "explore" }
  | Act2Objective;

/** Where each live monster can be reached from (the obstacle that guards it). */
export const GUARDED_BY: Partial<Record<MonsterId, ObstacleId>> = { bubbo: "fallenPalm", puff: "bridge", ember: "lava" };

/** The next step toward befriending one monster, or null once it is a friend. */
function befriendStep(p: Progress, id: MonsterId): Objective | null {
  const r = p.monsters[id];
  if (r.friend) return id === "ember" && !r.invited ? { id: "letsGo", monster: id } : null;
  const guard = GUARDED_BY[id];
  if (guard && !isSolved(p, guard)) return { id: "obstacle", obstacle: guard, helper: helperFor(p, guard) };
  if (!r.discovered) return { id: "findMonster", monster: id };
  const line = neededLine(p, id);
  if (line) return { id: "describe", monster: id, line };
  if (id === "lumo") return { id: "askBack", monster: id };
  const food = MONSTERS[id].favorite;
  if (!favoriteKnown(p, id)) return { id: "askFood", monster: id };
  if (!has(p, food)) return { id: "getFood", monster: id, food };
  return { id: "giveFood", monster: id, food };
}

/**
 * The one next thing to do (HUD card, Maple's hint, the star marker).
 * Each phase is finished, ending included, before the next one is mentioned.
 */
export function objective(p: Progress): Objective {
  if (!p.metMaple) return { id: "meetMaple" };
  for (const id of monstersOfPhase(1)) {
    const step = befriendStep(p, id);
    if (step) return step;
  }
  if (!isSolved(p, "river")) return { id: "obstacle", obstacle: "river", helper: helperFor(p, "river") };
  if (p.endings < 1) return { id: "stone" };
  for (const id of monstersOfPhase(2)) {
    const step = befriendStep(p, id);
    if (step) return step;
  }
  if (!isSolved(p, "cliff")) return { id: "obstacle", obstacle: "cliff", helper: helperFor(p, "cliff") };
  if (p.endings < 2) return { id: "cliffTop" };
  if (!isSolved(p, "lava")) return { id: "obstacle", obstacle: "lava", helper: helperFor(p, "lava") };
  const ember = befriendStep(p, "ember");
  if (ember) return ember;
  if (!isSolved(p, "cave")) return { id: "obstacle", obstacle: "cave", helper: helperFor(p, "cave") };
  for (const gate of GATES) {
    if (!isSolved(p, gate)) return { id: "obstacle", obstacle: gate, helper: helperFor(p, gate) };
  }
  const lumo = befriendStep(p, "lumo");
  if (lumo) return lumo;
  if (p.endings < 3) return { id: "finale" };
  // The prologue is complete: Act 2 carries the story on.
  if (prologueComplete(p)) return act2Objective(p);
  return { id: "explore" };
}
