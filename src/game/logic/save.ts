import { MONSTER_ORDER } from "../data/monsters";
import { FOODS } from "../data/foods";
import { OBSTACLES, newProgress, type MonsterRecord, type Progress } from "./progress";
import { PHRASES, type PhraseId } from "./english";
import type { FoodId, MonsterId, ObstacleId } from "../types";

/**
 * Versioned save. A save of an unknown version, or one that does not parse,
 * is discarded whole, never half-loaded. Every field is re-validated, so an
 * edited or corrupted save cannot unlock something out of order.
 */

export const SAVE_KEY = "mi.save.v1";
const VERSION = 1;

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
  return { discovered, asked, friend: discovered && r.friend === true, canKnown };
}

export function decodeSave(text: string | null): SaveData | null {
  if (!text) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(raw) || raw.v !== VERSION || !isObj(raw.progress)) return null;
  const src = raw.progress;
  const p = newProgress();
  const monsters = isObj(src.monsters) ? src.monsters : {};
  for (const id of MONSTER_ORDER) p.monsters[id] = readRecord(monsters[id]);
  const active = src.active as MonsterId | null;
  p.active = typeof active === "string" && p.monsters[active]?.friend ? active : null;
  if (!p.active) p.active = MONSTER_ORDER.find((id) => p.monsters[id].friend) ?? null;
  if (isObj(src.bag)) {
    for (const f of Object.keys(src.bag)) if (f in FOODS) p.bag[f as FoodId] = Math.max(0, Math.min(3, Math.floor(num(src.bag[f], 0))));
  }
  // Obstacles in dependency order, so a later one never stands without its prerequisite.
  const solved = Array.isArray(src.solved) ? (src.solved as unknown[]) : [];
  for (const id of Object.keys(OBSTACLES) as ObstacleId[]) {
    if (solved.includes(id) && OBSTACLES[id].after.every((o) => p.solved.includes(o))) p.solved.push(id);
  }
  p.metMaple = src.metMaple === true;
  p.finished = src.finished === true && p.solved.includes("river");
  p.said = Array.isArray(src.said) ? (src.said as unknown[]).filter((s): s is PhraseId => typeof s === "string" && s in PHRASES) : [];
  const pl = isObj(raw.player) ? raw.player : {};
  return {
    v: VERSION,
    progress: p,
    player: { x: num(pl.x, NaN), z: num(pl.z, NaN), yaw: num(pl.yaw, 0) },
    seconds: Math.max(0, num(raw.seconds, 0))
  };
}

export function readSave(): SaveData | null {
  try {
    return decodeSave(localStorage.getItem(SAVE_KEY));
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
  } catch {
    /* ignore */
  }
}
