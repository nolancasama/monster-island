import { MONSTERS, MONSTER_ORDER } from "../data/monsters";
import { FOODS } from "../data/foods";
import { OBSTACLES, gateOpen, newProgress, obstacleAvailable, type MonsterRecord, type Progress } from "./progress";
import { PHRASES, type PhraseId } from "./english";
import type { FoodId, MonsterId, ObstacleId } from "../types";
import { PLAYER_R, gatesOf, nearestWalkable } from "../world/collision";
import { ACT2_OBSTACLES, TUTORIAL_STEPS, bagMax, newAct2, prologueComplete, type Act2, type Checkpoint } from "./act2";
import { COMPANION_IDS, KO_HP, MAX_HP, MAX_MP, type CompanionId } from "../data/combat";
import { CHESTS, ZONES, STAGES, type ZoneId } from "../world/lowland";
import { newAct3, type Act3 } from "./act3";
import { CLOUD_AREAS, CLOUD_STAGES, CLOUD_PUZZLES, CLOUD_PICKUPS, CLOUD_CHESTS, CLOUD_SPAWNS, cloudNearestWalkable, cloudZoneAt } from "../world/cloudisle";

/**
 * Versioned save. A save of an unknown version, or one that does not parse,
 * is discarded whole, never half-loaded. Every field is re-validated, so an
 * edited or corrupted save cannot unlock something out of order.
 *
 * v1 (Phase 1 builds) migrates: classes that finished the beach continue into
 * the forest. It had `finished: boolean` where v2 has `endings` and no
 * journal size/part lines. v2 keeps its progress and gains the Phase 3 records.
 *
 * v4 adds Act 2 (`progress.act2`). Older saves load with a fresh Act 2: a
 * finished v3 adventure keeps everything and is offered the new chapter.
 * v4 is written under its own key; older keys are never overwritten.
 */

export const SAVE_KEY = "mi.save.v4";
export const SAVE_KEY_V3 = "mi.save.v3";
export const SAVE_KEY_V2 = "mi.save.v2";
export const SAVE_KEY_V1 = "mi.save.v1";
const VERSION = 4;

export interface SaveData {
  v: number;
  progress: Progress;
  player: { x: number; z: number; yaw: number };
  /** Play seconds (results card). */
  seconds: number;
}

export function encodeSave(progress: Progress, player: SaveData["player"], seconds: number): string {
  const data: SaveData = { v: VERSION, progress, player, seconds };
  return JSON.stringify(data);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

function readRecord(raw: unknown): MonsterRecord {
  const r = isObj(raw) ? raw : {};
  const asked: MonsterRecord["asked"] = {};
  if (isObj(r.asked)) for (const f of Object.keys(r.asked)) if (f in FOODS && typeof r.asked[f] === "boolean") asked[f as FoodId] = r.asked[f] as boolean;
  const canKnown: MonsterRecord["canKnown"] = {};
  if (isObj(r.canKnown)) for (const a of Object.keys(r.canKnown)) if (typeof r.canKnown[a] === "boolean") canKnown[a as keyof typeof canKnown] = r.canKnown[a] as boolean;
  const discovered = r.discovered === true;
  const described: MonsterRecord["described"] = {};
  if (discovered && isObj(r.described)) {
    if (r.described.name === true) described.name = true;
    if (r.described.size === true) described.size = true;
    if (r.described.part === true) described.part = true;
  }
  const friend = discovered && r.friend === true;
  return { discovered, asked, friend, canKnown, described, ...(friend && r.invited === true ? { invited: true } : {}) };
}

/** Act 2 fields, each re-validated; nothing of it stands before the prologue is complete. */
function readAct2(raw: unknown, p: Progress): Act2 {
  const a = newAct2();
  if (!isObj(raw) || raw.started !== true || !prologueComplete(p)) return a;
  const list = <T extends string>(v: unknown, ok: readonly T[]): T[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is T => typeof x === "string" && (ok as readonly string[]).includes(x)))] : []);
  a.started = true;
  a.lumoTaken = true;
  a.descended = raw.descended === true;
  const hp = Math.floor(num(raw.hp, MAX_HP));
  a.hp = hp <= 0 ? KO_HP : Math.min(MAX_HP, hp);
  const mp = isObj(raw.mp) ? raw.mp : {};
  for (const id of COMPANION_IDS) a.mp[id] = Math.max(0, Math.min(MAX_MP, num(mp[id], MAX_MP)));
  a.coins = Math.max(0, Math.min(9999, Math.floor(num(raw.coins, 0))));
  const items = isObj(raw.items) ? raw.items : {};
  const amber = Math.max(0, Math.min(99, Math.floor(num(items.amber, 0))));
  if (amber) a.items.amber = amber;
  a.chests = list(raw.chests, CHESTS.map((c) => c.id));
  a.tutorial = list(raw.tutorial, TUTORIAL_STEPS);
  a.upgrades = list<CompanionId>(raw.upgrades, COMPANION_IDS).filter((id) => p.monsters[id].friend);
  a.trained = list<CompanionId>(raw.trained, COMPANION_IDS);
  a.portFound = a.descended && raw.portFound === true;
  a.bought = a.portFound && raw.bought === true;
  a.harbor = a.portFound && raw.harbor === true;
  const checkpoints: Checkpoint[] = ["cliff", "camp", "port"];
  const cp = raw.checkpoint as Checkpoint;
  a.checkpoint = checkpoints.includes(cp) && (cp !== "port" || a.portFound) && (cp !== "camp" || a.descended) ? cp : "cliff";
  a.zone = typeof raw.zone === "string" && raw.zone in ZONES ? (raw.zone as ZoneId) : null;
  a.cleared = list(raw.cleared, STAGES);
  // Pre-expansion v4 has no clear flags. Honour already-reached places without
  // guessing which branch was taken; never replay the prologue or kidnapping.
  if (!Array.isArray(raw.cleared)) {
    if (a.portFound || a.zone === "port") a.cleared = [...STAGES];
    else if (a.zone === "coast") a.cleared = ["forest1", "grove", "canopy", "causeway"];
    else if (a.zone === "causeway" || p.solved.includes("causewayGate")) a.cleared = ["forest1", "grove", "canopy"];
    else if (a.checkpoint === "camp" || (a.zone && ["camp", "grove", "canopy", "oldTrail"].includes(a.zone))) a.cleared = ["forest1"];
  }
  return a;
}

/** Additive v4 chapter data; the harbour lead is the authority for every field. */
function readAct3(raw: unknown, p: Progress): Act3 {
  const a = newAct3();
  if (!p.act2.harbor || !isObj(raw)) return a;
  const list = <T extends string>(v: unknown, valid: readonly T[]): T[] => Array.isArray(v)
    ? [...new Set(v.filter((x): x is T => typeof x === "string" && (valid as readonly string[]).includes(x)))] : [];
  a.voyageDone = raw.voyageDone === true;
  // Cloud saves are already on the far side of the crossing, including a
  // reload during arrival. Do not replay the voyage on Continue.
  if (raw.world === "cloud") a.voyageDone = true;
  a.world = raw.world === "cloud" ? "cloud" : "home";
  if (!a.voyageDone) return a;
  a.cleared = list(raw.cleared, CLOUD_STAGES);
  a.hollowFound = a.cleared.includes("stormbreakCoast") && raw.hollowFound === true;
  const f = isObj(raw.family) ? raw.family : {};
  a.family.met = a.hollowFound && f.met === true;
  a.family.trusted = a.family.met && f.trusted === true;
  a.family.drawingSeen = a.family.trusted && f.drawingSeen === true;
  a.family.tunnelOpen = a.family.drawingSeen && f.tunnelOpen === true;
  a.puzzles = list(raw.puzzles, CLOUD_PUZZLES).filter((id) => p.monsters[id === "coastWindmill" ? "puff" : "leafy"].friend);
  a.chests = list(raw.chests, CLOUD_CHESTS.map((c) => c.id));
  // Reserve the later mountain fields and validate their prerequisites.
  // Slice A provides no interaction that writes these milestones.
  a.observatoryLamps = a.family.tunnelOpen ? list(raw.observatoryLamps, COMPANION_IDS).filter((id) => p.monsters[id].friend) : [];
  a.beaconDefeated = a.observatoryLamps.length === COMPANION_IDS.length && raw.beaconDefeated === true;
  a.skyFortressClue = a.beaconDefeated && raw.skyFortressClue === true;
  a.family.aftermathSeen = a.beaconDefeated && f.aftermathSeen === true;
  const e = isObj(raw.errands) ? raw.errands : {};
  a.errands.pickups = list(e.pickups, CLOUD_PICKUPS.map((pickup) => pickup.id));
  a.errands.bag = a.errands.pickups.some((id) => CLOUD_PICKUPS.find((pickup) => pickup.id === id)?.kind === "bag");
  a.errands.firewood = Math.min(3, a.errands.pickups.filter((id) => CLOUD_PICKUPS.find((pickup) => pickup.id === id)?.kind === "firewood").length);
  a.errands.moss = a.errands.pickups.some((id) => CLOUD_PICKUPS.find((pickup) => pickup.id === id)?.kind === "moss");
  a.errands.bagRewarded = a.family.trusted && a.errands.bag && e.bagRewarded === true;
  a.errands.firewoodRewarded = a.family.trusted && a.errands.firewood === 3 && e.firewoodRewarded === true;
  a.errands.mossRewarded = a.family.trusted && a.errands.moss && e.mossRewarded === true;
  a.stew = a.family.trusted ? Math.max(0, Math.min(3, Math.floor(num(raw.stew, 0)))) : 0;
  const area = CLOUD_AREAS.find((id) => id === raw.area);
  a.area = area ?? "cloudDock";
  if ((a.area === "hiddenHollow" && !a.hollowFound) || ((a.area === "backTunnel" || a.area === "windfallJunction") && !a.family.tunnelOpen)) a.area = "stormbreakCoast";
  a.checkpoint = raw.checkpoint === "hollow" && a.hollowFound ? "hollow" : "dock";
  return a;
}

export function decodeSave(text: string | null): SaveData | null {
  if (!text) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(raw) || ![1, 2, 3, VERSION].includes(raw.v as number) || !isObj(raw.progress)) return null;
  const src = raw.progress;
  const p = newProgress();
  const monsters = isObj(src.monsters) ? src.monsters : {};
  for (const id of MONSTER_ORDER) p.monsters[id] = readRecord(monsters[id]);
  const active = src.active as MonsterId | null;
  p.active = typeof active === "string" && p.monsters[active]?.friend && MONSTERS[active].companion !== false ? active : null;
  if (!p.active) p.active = MONSTER_ORDER.find((id) => p.monsters[id].friend && MONSTERS[id].companion !== false) ?? null;
  // Obstacles in dependency order, so a later one never stands without its prerequisite.
  const solved = Array.isArray(src.solved) ? (src.solved as unknown[]) : [];
  const endings = raw.v === 1 ? (src.finished === true ? 1 : 0) : Math.floor(num(src.endings, 0));
  for (const id of (Object.keys(OBSTACLES) as ObstacleId[]).filter((o) => !ACT2_OBSTACLES.includes(o))) {
    p.endings = endings >= 2 && p.solved.includes("cliff") ? 2 : endings >= 1 && p.solved.includes("river") ? 1 : 0;
    if (solved.includes(id) && obstacleAvailable(p, id)) p.solved.push(id);
  }
  p.metMaple = src.metMaple === true;
  // An ending stands only on the obstacle that leads to it.
  p.endings = endings >= 3 && gateOpen(p) && p.monsters.lumo.friend ? 3
    : endings >= 2 && p.solved.includes("cliff") ? 2 : endings >= 1 && p.solved.includes("river") ? 1 : 0;
  p.said = Array.isArray(src.said) ? (src.said as unknown[]).filter((s): s is PhraseId => typeof s === "string" && s in PHRASES) : [];
  // Act 2 (v4 only), then its permanent unlocks, which need the chapter to have begun.
  p.act2 = readAct2(raw.v === VERSION ? src.act2 : null, p);
  p.act3 = readAct3(raw.v === VERSION ? src.act3 : null, p);
  for (const id of ACT2_OBSTACLES) if (solved.includes(id) && obstacleAvailable(p, id)) p.solved.push(id);
  if (p.act2.started && isObj(src.act2) && !Array.isArray(src.act2.cleared) && solved.includes("causewayGate")) p.act2.cleared = [...new Set([...p.act2.cleared, "forest1", "grove", "canopy"] as const)];
  if (isObj(src.bag)) {
    const max = bagMax(p);
    for (const f of Object.keys(src.bag)) if (f in FOODS) p.bag[f as FoodId] = Math.max(0, Math.min(max, Math.floor(num(src.bag[f], 0))));
  }
  const pl = isObj(raw.player) ? raw.player : {};
  // Some pre-expansion saves stand just beyond a newly inserted exit while
  // still labelled with that branch. Preserve the return route as well.
  if (p.act2.started && isObj(src.act2) && !Array.isArray(src.act2.cleared)) {
    const z = num(pl.z, Infinity), zone = p.act2.zone;
    const passed = zone === "forest1" && z < -184.1 ? "forest1"
      : (zone === "grove" || zone === "canopy") && z < -241 ? zone
      : zone === "coast" && z < -287.6 ? "coast" : null;
    if (passed && !p.act2.cleared.includes(passed)) p.act2.cleared.push(passed);
  }
  // Validate position after migration and progression sanitization, against the
  // same solids and gates movement uses. Progress and the v3 format stay intact.
  let safe;
  if (p.act3.world === "cloud") {
    let x = num(pl.x, NaN), z = num(pl.z, NaN);
    // A position in valid but story-locked ground is still invalid for this
    // save. Keep it on the accessible side before projecting out of solids.
    const zone = cloudZoneAt(x, z);
    if ((!p.act3.cleared.includes("stormbreakCoast") && z > 43.7)
      || (!p.act3.family.tunnelOpen && (zone === "backTunnel" || zone === "windfallJunction"))) {
      ({ x, z } = CLOUD_SPAWNS[p.act3.area]);
    }
    safe = cloudNearestWalkable(x, z, PLAYER_R, { cleared: p.act3.cleared, solved: p.act3.puzzles, tunnelOpen: p.act3.family.tunnelOpen });
    p.act3.area = cloudZoneAt(safe.x, safe.z) ?? "cloudDock";
  } else {
    safe = nearestWalkable(num(pl.x, NaN), num(pl.z, NaN), PLAYER_R, gatesOf(p), false, true);
  }
  return {
    v: VERSION,
    progress: p,
    player: { x: safe.x, z: safe.z, yaw: num(pl.yaw, 0) },
    seconds: Math.max(0, num(raw.seconds, 0))
  };
}

export function readSave(): SaveData | null {
  try {
    for (const key of [SAVE_KEY, SAVE_KEY_V3, SAVE_KEY_V2, SAVE_KEY_V1]) {
      const save = decodeSave(localStorage.getItem(key));
      if (save) return save;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeSave(text: string) {
  try {
    localStorage.setItem(SAVE_KEY, text);
  } catch {
    /* storage blocked on some managed devices */
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(SAVE_KEY_V3);
    localStorage.removeItem(SAVE_KEY_V2);
    localStorage.removeItem(SAVE_KEY_V1);
  } catch {
    /* ignore */
  }
}
