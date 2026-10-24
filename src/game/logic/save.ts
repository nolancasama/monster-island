import { MONSTERS, MONSTER_ORDER } from "../data/monsters";
import { FOODS } from "../data/foods";
import { OBSTACLES, gateOpen, newProgress, obstacleAvailable, type MonsterRecord, type Progress } from "./progress";
import { PHRASES, type PhraseId } from "./english";
import type { FoodId, MonsterId, ObstacleId } from "../types";
import { PLAYER_R, gatesOf, nearestWalkable } from "../world/collision";

/**
 * Versioned save. A save of an unknown version, or one that does not parse,
 * is discarded whole, never half-loaded. Every field is re-validated, so an
 * edited or corrupted save cannot unlock something out of order.
 *
 * v1 (Phase 1 builds) migrates: classes that finished the beach continue into
 * the forest. It had `finished: boolean` where v2 has `endings` and no
 * journal size/part lines. v2 keeps its progress and gains the Phase 3 records.
 */

export const SAVE_KEY = "mi.save.v3";
export const SAVE_KEY_V2 = "mi.save.v2";
export const SAVE_KEY_V1 = "mi.save.v1";
const VERSION = 3;

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

export function decodeSave(text: string | null): SaveData | null {
  if (!text) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(raw) || (raw.v !== VERSION && raw.v !== 2 && raw.v !== 1) || !isObj(raw.progress)) return null;
  const src = raw.progress;
  const p = newProgress();
  const monsters = isObj(src.monsters) ? src.monsters : {};
  for (const id of MONSTER_ORDER) p.monsters[id] = readRecord(monsters[id]);
  const active = src.active as MonsterId | null;
  p.active = typeof active === "string" && p.monsters[active]?.friend && MONSTERS[active].companion !== false ? active : null;
  if (!p.active) p.active = MONSTER_ORDER.find((id) => p.monsters[id].friend && MONSTERS[id].companion !== false) ?? null;
  if (isObj(src.bag)) {
    for (const f of Object.keys(src.bag)) if (f in FOODS) p.bag[f as FoodId] = Math.max(0, Math.min(3, Math.floor(num(src.bag[f], 0))));
  }
  // Obstacles in dependency order, so a later one never stands without its prerequisite.
  const solved = Array.isArray(src.solved) ? (src.solved as unknown[]) : [];
  const endings = raw.v === 1 ? (src.finished === true ? 1 : 0) : Math.floor(num(src.endings, 0));
  for (const id of Object.keys(OBSTACLES) as ObstacleId[]) {
    p.endings = endings >= 2 && p.solved.includes("cliff") ? 2 : endings >= 1 && p.solved.includes("river") ? 1 : 0;
    if (solved.includes(id) && obstacleAvailable(p, id)) p.solved.push(id);
  }
  p.metMaple = src.metMaple === true;
  // An ending stands only on the obstacle that leads to it.
  p.endings = endings >= 3 && gateOpen(p) && p.monsters.lumo.friend ? 3
    : endings >= 2 && p.solved.includes("cliff") ? 2 : endings >= 1 && p.solved.includes("river") ? 1 : 0;
  p.said = Array.isArray(src.said) ? (src.said as unknown[]).filter((s): s is PhraseId => typeof s === "string" && s in PHRASES) : [];
  const pl = isObj(raw.player) ? raw.player : {};
  // Validate position after migration and progression sanitization, against the
  // same solids and gates movement uses. Progress and the v3 format stay intact.
  const safe = nearestWalkable(num(pl.x, NaN), num(pl.z, NaN), PLAYER_R, gatesOf(p), false, true);
  return {
    v: VERSION,
    progress: p,
    player: { x: safe.x, z: safe.z, yaw: num(pl.yaw, 0) },
    seconds: Math.max(0, num(raw.seconds, 0))
  };
}

export function readSave(): SaveData | null {
  try {
    return decodeSave(localStorage.getItem(SAVE_KEY)) ?? decodeSave(localStorage.getItem(SAVE_KEY_V2)) ?? decodeSave(localStorage.getItem(SAVE_KEY_V1));
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
    localStorage.removeItem(SAVE_KEY_V2);
    localStorage.removeItem(SAVE_KEY_V1);
  } catch {
    /* ignore */
  }
}
