import type { Progress } from "./progress";
import { addCoins, addFood, addItem, rested, type Vitals } from "./act2";
import { COMPANION_IDS, MAX_HP, MAX_MP, type CompanionId } from "../data/combat";
import { CLOUD_AREAS, CLOUD_STAGES, CLOUD_PUZZLES, CLOUD_PICKUPS, CLOUD_CHESTS, CLOUD_ENEMY_SPAWNS, type CloudAreaId, type CloudStageId, type CloudPuzzleId } from "../world/cloudisle";

export type { CloudAreaId, CloudStageId, CloudPuzzleId } from "../world/cloudisle";

/** Reserved chapter fields are saved now so later mountain slices remain additive. */
export const CLOUD_AREA_IDS = CLOUD_AREAS;
export const CLOUD_STAGE_IDS = CLOUD_STAGES;
export const CLOUD_PUZZLE_IDS = CLOUD_PUZZLES;
export type FamilyMilestone = "met" | "trusted" | "drawingSeen" | "tunnelOpen" | "aftermathSeen";
export type ErrandId = "bag" | "firewood" | "moss";

export interface Act3 {
  voyageDone: boolean;
  world: "home" | "cloud";
  area: CloudAreaId;
  hollowFound: boolean;
  family: Record<FamilyMilestone, boolean>;
  errands: {
    bag: boolean; firewood: number; moss: boolean;
    bagRewarded: boolean; firewoodRewarded: boolean; mossRewarded: boolean;
    /** Unique world pickup IDs; never sourced from bag food or materials. */
    pickups: string[];
  };
  stew: number;
  cleared: CloudStageId[];
  chests: string[];
  puzzles: CloudPuzzleId[];
  observatoryLamps: CompanionId[];
  beaconDefeated: boolean;
  skyFortressClue: boolean;
  checkpoint: "dock" | "hollow" | "observatory";
}

export function newAct3(): Act3 {
  return {
    voyageDone: false, world: "home", area: "cloudDock", hollowFound: false,
    family: { met: false, trusted: false, drawingSeen: false, tunnelOpen: false, aftermathSeen: false },
    errands: { bag: false, firewood: 0, moss: false, bagRewarded: false, firewoodRewarded: false, mossRewarded: false, pickups: [] },
    stew: 0, cleared: [], chests: [], puzzles: [], observatoryLamps: [], beaconDefeated: false, skyFortressClue: false, checkpoint: "dock"
  };
}

const patch = (p: Progress, next: Partial<Act3>): Progress => ({ ...p, act3: { ...p.act3, ...next } });
const allowed = (p: Progress) => p.act2.harbor;

/** The first voyage is recorded before arrival; loading on Cloud Isle never replays it. */
export function completeVoyage(p: Progress): Progress {
  return !allowed(p) || p.act3.voyageDone ? p : patch(p, { voyageDone: true });
}

export function travelCloud(p: Progress, world: Act3["world"]): Progress {
  if (!allowed(p) || (world === "cloud" && !p.act3.voyageDone)) return p;
  return patch(p, { world, area: "cloudDock" });
}

export function discoverHollow(p: Progress): Progress {
  return !allowed(p) || !p.act3.cleared.includes("stormbreakCoast") || p.act3.hollowFound ? p : patch(p, { hollowFound: true });
}

export function markFamily(p: Progress, milestone: FamilyMilestone): Progress {
  const a = p.act3;
  if (!allowed(p) || !a.hollowFound || a.family[milestone]) return p;
  const ready = milestone === "met" || (milestone === "trusted" && a.family.met)
    || (milestone === "drawingSeen" && a.family.trusted) || (milestone === "tunnelOpen" && a.family.drawingSeen)
    || (milestone === "aftermathSeen" && a.beaconDefeated);
  return ready ? patch(p, { family: { ...a.family, [milestone]: true } }) : p;
}

/** Finding the Hollow changes the wake destination even before its mats are used. */
export function cloudWakeArea(p: Progress): "dock" | "hollow" | "observatory" {
  if (p.act3.checkpoint === "observatory") return "observatory";
  return p.act3.hollowFound ? "hollow" : "dock";
}

export function restCloud(p: Progress): Progress {
  if (!allowed(p) || p.act3.world !== "cloud") return p;
  const checkpoint = p.act3.area === "hiddenHollow" && p.act3.hollowFound ? "hollow"
    : p.act3.area === "cloudDock" ? "dock" : null;
  if (!checkpoint) return p;
  return { ...patch(p, { checkpoint }), act2: { ...p.act2, ...rested() } };
}

export type CookStewResult = { ok: true; progress: Progress } | { ok: false; reason: "fish" | "full" | "family" };
export function cookStew(p: Progress): CookStewResult {
  if (!allowed(p) || !p.act3.family.trusted) return { ok: false, reason: "family" };
  if (p.act3.stew >= 3) return { ok: false, reason: "full" };
  if ((p.bag.fish ?? 0) < 1) return { ok: false, reason: "fish" };
  return { ok: true, progress: patch({ ...p, bag: { ...p.bag, fish: p.bag.fish! - 1 } }, { stew: p.act3.stew + 1 }) };
}

/** Deliberate bag action only. Stew has no FoodId and cannot be selected by quick-eat. */
export function eatStew(p: Progress, v: Vitals): { progress: Progress; vitals: Vitals } | null {
  if (!allowed(p) || p.act3.stew < 1 || (v.hp >= MAX_HP && COMPANION_IDS.every((id) => v.mp[id] >= MAX_MP))) return null;
  const mp = { ...v.mp };
  for (const id of COMPANION_IDS) mp[id] = Math.min(MAX_MP, mp[id] + 40);
  return { progress: patch(p, { stew: p.act3.stew - 1 }), vitals: { hp: Math.min(MAX_HP, v.hp + 50), mp } };
}

export interface CloudPickupRule { id: string; kind: ErrandId }
/** Supplied world placements are the only accepted source of errand materials. */
export function collectErrandPickup(p: Progress, id: string, placements: readonly CloudPickupRule[] = CLOUD_PICKUPS): Progress {
  const pickup = placements.find((x) => x.id === id);
  if (!allowed(p) || !pickup || p.act3.errands.pickups.includes(id)) return p;
  const e = p.act3.errands;
  return patch(p, { errands: { ...e, pickups: [...e.pickups, id],
    bag: e.bag || pickup.kind === "bag", moss: e.moss || pickup.kind === "moss",
    firewood: Math.min(3, e.firewood + Number(pickup.kind === "firewood")) } });
}

/** Handing in never consumes the player's inventory; each shelter upgrade is permanent. */
export function claimErrand(p: Progress, id: ErrandId): Progress {
  if (!allowed(p) || !p.act3.family.trusted) return p;
  const e = p.act3.errands;
  const rewardKey = `${id}Rewarded` as "bagRewarded" | "firewoodRewarded" | "mossRewarded";
  if (e[rewardKey] || (id === "firewood" ? e.firewood < 3 : !e[id])) return p;
  const next = id === "firewood" ? addItem(p, "amber") : addCoins(p, id === "bag" ? 20 : 30);
  return patch(next, { errands: { ...e, [rewardKey]: true } });
}

export function solveCloudPuzzle(p: Progress, id: CloudPuzzleId): Progress {
  if (!allowed(p) || p.act3.puzzles.includes(id)) return p;
  const friend = id === "coastWindmill" ? "puff" : "leafy";
  return p.monsters[friend].friend ? patch(p, { puzzles: [...p.act3.puzzles, id] }) : p;
}

export interface CloudChestRule { id: string; coins: number; amber?: number; food?: { id: import("../types").FoodId; n: number }; puzzle?: CloudPuzzleId }
export function openCloudChest(p: Progress, id: string, placements: readonly CloudChestRule[] = CLOUD_CHESTS): Progress {
  const chest = placements.find((x) => x.id === id);
  if (!allowed(p) || !chest || p.act3.chests.includes(id) || (chest.puzzle && !p.act3.puzzles.includes(chest.puzzle))) return p;
  let next = addCoins(p, chest.coins);
  if (chest.amber) next = addItem(next, "amber", chest.amber);
  if (chest.food) next = addFood(next, chest.food.id, chest.food.n).progress;
  return patch(next, { chests: [...p.act3.chests, id] });
}

export function clearCloudStage(p: Progress, zone: CloudStageId, defeated: readonly number[], spawns: readonly { zone: string }[] = CLOUD_ENEMY_SPAWNS): Progress {
  if (!allowed(p) || p.act3.cleared.includes(zone)) return p;
  const required = spawns.flatMap((enemy, index) => enemy.zone === zone ? [index] : []);
  return required.length && required.every((id) => defeated.includes(id)) ? patch(p, { cleared: [...p.act3.cleared, zone] }) : p;
}
