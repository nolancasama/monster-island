import type { FoodId } from "../types";
import type { PhraseId } from "./english";
import type { Progress } from "./progress";

/**
 * The pirate voyage's pure rules (docs/PIRATE_VOYAGE.md): the saved stage and
 * jobs, the fair food interrogation, the cargo hold's prepositions and the
 * three-lane steering. Scenes and timing live in flow/voyage*.ts.
 */

export const VOYAGE_STAGES = ["none", "captured", "jobs", "storm", "raft", "done"] as const;
export type VoyageStage = (typeof VOYAGE_STAGES)[number];
export const VOYAGE_JOBS = ["fishing", "cooking", "cargo", "sailing"] as const;
export type VoyageJob = (typeof VOYAGE_JOBS)[number];

export interface Voyage {
  stage: VoyageStage;
  /** Finished jobs, in the order they were done. */
  jobs: VoyageJob[];
  /** The pirates took their one food (never twice). */
  interrogated: boolean;
  /** The Captain Hat was given (never twice). */
  hat: boolean;
}

export const newVoyage = (): Voyage => ({ stage: "none", jobs: [], interrogated: false, hat: false });

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The stage that counts: a finished crossing (`act3.voyageDone`) is always done. */
export const voyageStage = (a: { voyageDone: boolean; voyage: Voyage }): VoyageStage => (a.voyageDone ? "done" : a.voyage.stage);

/** Re-validate a saved voyage. `voyageDone` stays the authority (see `voyageStage`). */
export function readVoyage(raw: unknown, voyageDone: boolean): Voyage {
  const v = newVoyage();
  if (!isObj(raw)) return v;
  const stage = VOYAGE_STAGES.includes(raw.stage as VoyageStage) ? (raw.stage as VoyageStage) : "none";
  // Without voyageDone the crossing is not finished: "done" alone is not trusted.
  v.stage = stage === "done" && !voyageDone ? "raft" : stage;
  if (v.stage === "none") return v;
  v.interrogated = raw.interrogated === true;
  const jobs = Array.isArray(raw.jobs) ? raw.jobs.filter((j): j is VoyageJob => typeof j === "string" && (VOYAGE_JOBS as readonly string[]).includes(j)) : [];
  v.jobs = [...new Set(jobs)];
  // Later stages imply every job; the hat comes with the last one.
  if (v.stage === "storm" || v.stage === "raft") v.jobs = [...VOYAGE_JOBS];
  v.hat = allJobsDone(v) && raw.hat === true;
  if (v.stage === "captured" && v.jobs.length) v.stage = "jobs";
  return v;
}

export const allJobsDone = (v: Voyage) => VOYAGE_JOBS.every((j) => v.jobs.includes(j));

const withVoyage = (p: Progress, voyage: Voyage): Progress => ({ ...p, act3: { ...p.act3, voyage } });

/** Stages only move forward (a checkpoint never rewinds). */
export function setVoyageStage(p: Progress, stage: VoyageStage): Progress {
  const v = p.act3.voyage;
  return VOYAGE_STAGES.indexOf(stage) <= VOYAGE_STAGES.indexOf(v.stage) ? p : withVoyage(p, { ...v, stage });
}

export function finishJob(p: Progress, job: VoyageJob): Progress {
  const v = p.act3.voyage;
  if (v.jobs.includes(job)) return p;
  return withVoyage(p, { ...v, stage: v.stage === "captured" ? "jobs" : v.stage, jobs: [...v.jobs, job] });
}

/** The keepsake: once, after all four jobs. */
export function markHatGiven(p: Progress): Progress {
  const v = p.act3.voyage;
  return v.hat || !allJobsDone(v) ? p : withVoyage(p, { ...v, hat: true });
}

// ------------------------------------------------------------ the interrogation

export const FOOD_ORDER: FoodId[] = ["apples", "bananas", "fish", "berries", "meat"];
export const HAVE_PHRASE: Record<FoodId, PhraseId> = { apples: "iHaveApples", bananas: "iHaveBananas", fish: "iHaveFish", berries: "iHaveBerries", meat: "iHaveMeat" };

const has = (bag: Partial<Record<FoodId, number>>, f: FoodId) => (bag[f] ?? 0) > 0;

/**
 * Up to three "Do you have …?" foods from the real bag: a held one and a missing
 * one when the bag has both, never the same food twice. `pick` chooses (tests pass a fixed one).
 */
export function interrogationFoods(bag: Partial<Record<FoodId, number>>, pick: (n: number) => number = (n) => Math.floor(Math.random() * n)): FoodId[] {
  const held = FOOD_ORDER.filter((f) => has(bag, f)), missing = FOOD_ORDER.filter((f) => !has(bag, f));
  const out: FoodId[] = [];
  const take = (from: FoodId[]) => {
    const left = from.filter((f) => !out.includes(f));
    if (left.length) out.push(left[pick(left.length)]);
  };
  take(held.length ? held : missing);
  take(missing.length && held.length ? missing : held.length ? held : missing);
  take([...held, ...missing]);
  return out.slice(0, 3);
}

/** The true answer to "Do you have …?". */
export const truthfulAnswer = (bag: Partial<Record<FoodId, number>>, food: FoodId): PhraseId => (has(bag, food) ? "yesIDo" : "noIDont");

/** "What food do you have?": only foods really held, or the honest "I don't have any food." */
export function foodChoices(bag: Partial<Record<FoodId, number>>): PhraseId[] {
  const held = FOOD_ORDER.filter((f) => has(bag, f));
  return held.length ? held.slice(0, 4).map((f) => HAVE_PHRASE[f]) : ["noFood"];
}

export const foodOfHave = (id: PhraseId): FoodId | null => FOOD_ORDER.find((f) => HAVE_PHRASE[f] === id) ?? null;

/** The pirates take one of the named food, once per voyage. */
export function handOverFood(p: Progress, food: FoodId | null): Progress {
  const v = p.act3.voyage;
  if (v.interrogated) return p;
  const bag = food && has(p.bag, food) ? { ...p.bag, [food]: (p.bag[food] ?? 0) - 1 } : p.bag;
  return { ...p, bag, act3: { ...p.act3, voyage: { ...v, interrogated: true } } };
}

// ------------------------------------------------------------ cargo: in, on, under, by

export const CARGO_ITEMS = ["barrel", "bag", "bottle"] as const;
export type CargoItem = (typeof CARGO_ITEMS)[number];
export const ITEM_NAME: Record<CargoItem, string> = { barrel: "the red barrel", bag: "the blue bag", bottle: "the green bottle" };
export type Furniture = "table" | "shelf" | "box" | "door";
export type Prep = "on" | "under" | "in" | "by";
/** What each piece of furniture offers when something is put down at it. */
export const SLOTS: Record<Furniture, Prep[]> = { table: ["on", "under"], shelf: ["on", "under"], box: ["in"], door: ["by"] };
export interface Placement { furniture: Furniture; prep: Prep }
export type CargoState = Record<CargoItem, Placement | null>;
export type CargoTask = { kind: "put"; item: CargoItem; furniture: Furniture; prep: Prep } | { kind: "where"; item: CargoItem };

export const PLACE_PHRASE: Record<string, PhraseId> = {
  "on table": "onTheTable", "under table": "underTheTable", "on shelf": "onTheShelf", "under shelf": "underTheShelf", "in box": "inTheBox", "by door": "byTheDoor"
};
export const placePhrase = (pl: Placement): PhraseId => PLACE_PHRASE[`${pl.prep} ${pl.furniture}`];
/** The pirate's instruction: "Put the red barrel under the table!" */
export const putLine = (t: Extract<CargoTask, { kind: "put" }>) => `Put ${ITEM_NAME[t.item]} ${t.prep} the ${t.furniture}!`;

const PUT_POOL: Array<{ furniture: Furniture; prep: Prep }> = [
  { furniture: "box", prep: "in" }, { furniture: "table", prep: "on" }, { furniture: "table", prep: "under" },
  { furniture: "door", prep: "by" }, { furniture: "shelf", prep: "on" }, { furniture: "shelf", prep: "under" },
];

/**
 * Six "put" tasks (every preposition at least once, shuffled, never two in a row
 * for one item) with two "Where is …?" questions after the 3rd and 6th.
 */
export function cargoTasks(pick: (n: number) => number = (n) => Math.floor(Math.random() * n)): CargoTask[] {
  const pool = [...PUT_POOL];
  for (let i = pool.length - 1; i > 0; i--) { const j = pick(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const tasks: CargoTask[] = [];
  let last: CargoItem | null = null;
  pool.forEach((slot, i) => {
    const items = CARGO_ITEMS.filter((it) => it !== last);
    const item = items[pick(items.length)];
    tasks.push({ kind: "put", item, ...slot });
    last = item;
    if (i === 2 || i === 5) tasks.push({ kind: "where", item });
  });
  return tasks;
}

/** Is a "put" task satisfied by the real state of the hold? */
export function taskDone(task: CargoTask, state: CargoState): boolean {
  if (task.kind !== "put") return false;
  const pl = state[task.item];
  return !!pl && pl.furniture === task.furniture && pl.prep === task.prep;
}

/** Only one thing fits each spot: a slot is free when nothing else sits there. */
export function slotFree(state: CargoState, item: CargoItem, pl: Placement): boolean {
  return CARGO_ITEMS.every((it) => it === item || !state[it] || state[it]!.furniture !== pl.furniture || state[it]!.prep !== pl.prep);
}

/** Four answers to "Where is …?": the true one and three others, in a stable order. */
export function whereChoices(state: CargoState, item: CargoItem): PhraseId[] {
  const truth = state[item] ? placePhrase(state[item]!) : null;
  const all = Object.values(PLACE_PHRASE);
  const others = all.filter((id) => id !== truth).slice(0, truth ? 3 : 4);
  return truth ? [truth, ...others].sort((a, b) => all.indexOf(a) - all.indexOf(b)) : others;
}

// ------------------------------------------------------------ steering: three lanes

export type Lane = -1 | 0 | 1;
export type SteerCommand = "turnLeft" | "turnRight" | "goStraight";

/** The lane after a command (the edges hold). */
export function steer(lane: Lane, cmd: SteerCommand): Lane {
  const next = lane + (cmd === "turnLeft" ? -1 : cmd === "turnRight" ? 1 : 0);
  return Math.max(-1, Math.min(1, next)) as Lane;
}

/** Where an obstacle lies relative to the vessel: what the captain calls out. */
export function obstacleSide(lane: Lane, obstacle: Lane): "left" | "ahead" | "right" {
  return obstacle < lane ? "left" : obstacle > lane ? "right" : "ahead";
}

/** A command is safe when the vessel's next lane is not the obstacle's. */
export const safeCommand = (lane: Lane, obstacle: Lane, cmd: SteerCommand) => steer(lane, cmd) !== obstacle;
