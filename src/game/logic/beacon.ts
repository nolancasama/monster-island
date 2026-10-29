import type { CompanionId } from "../data/combat";

export const BEACON_ARENA = { x: 0, z: 169, y: 37, radius: 12 };
export const BEACON_PYLONS = [{ x: -7, z: 168 }, { x: 7, z: 168 }, { x: 0, z: 175 }] as const;
export type PylonPhase = "shielded" | "charging" | "exposed" | "down";
export interface BeaconPylon { phase: PylonPhase; timer: number; shorted: boolean }
export interface BeaconState {
  active: boolean;
  pylons: BeaconPylon[];
  power: number;
  attack: "calm" | "gustTell" | "gust" | "lightningTell" | "lightning";
  timer: number;
  turn: number;
  gust: { x: number; z: number };
  rings: { x: number; z: number }[];
  gustCancelled: boolean;
  spritesAdded: boolean;
}

/** Failed attempts and reloads deliberately reconstruct all three pylons. */
export function newBeacon(): BeaconState {
  return { active: false, power: 3, pylons: BEACON_PYLONS.map((_, i) => ({ phase: "shielded", timer: 1.5 + i * 1.5, shorted: false })),
    attack: "calm", timer: 2.5, turn: 0, gust: { x: 1, z: 0 }, rings: [], gustCancelled: false, spritesAdded: false };
}

/** A visible charge always precedes exposure; the generous open window repeats. */
export function tickBeacon(state: BeaconState, dt: number, player: { x: number; z: number }): void {
  if (!state.active || state.power === 0) return;
  for (const p of state.pylons) {
    if (p.phase === "down") continue;
    p.timer -= dt;
    if (p.timer > 0) continue;
    if (p.phase === "shielded") { p.phase = "charging"; p.timer = 2.4; }
    else if (p.phase === "charging") { p.phase = "exposed"; p.timer = 6; }
    else { p.phase = "shielded"; p.timer = 2.5; }
  }
  state.timer -= dt;
  if (state.timer > 0) return;
  if (state.attack === "calm") {
    state.gustCancelled = false;
    if (state.turn % 2 === 0) {
      state.attack = "gustTell"; state.timer = 1;
      state.gust = { x: state.turn % 4 === 0 ? 1 : -1, z: 0 };
    } else {
      state.attack = "lightningTell"; state.timer = 1.2;
      // Only one ring tracks the player's starting position. Most of the arena stays safe.
      state.rings = [{ x: player.x, z: player.z }, { x: -player.x * .5, z: 169 + (169 - player.z) * .5 }];
    }
  } else if (state.attack === "gustTell") { state.attack = state.gustCancelled ? "calm" : "gust"; state.timer = state.gustCancelled ? 3.5 : .7; if (state.gustCancelled) state.turn++; }
  else if (state.attack === "lightningTell") { state.attack = "lightning"; state.timer = .35; }
  else { state.attack = "calm"; state.timer = 3.5; state.turn++; state.rings = []; }
}

/** Any manual attack works while exposed; Bubbo rewards early attention to charge. */
export function strikeBeaconPylon(state: BeaconState, index: number, friend: CompanionId): "blocked" | "shorted" | "down" {
  const p = state.pylons[index];
  if (!state.active || !p || p.phase === "down") return "blocked";
  if (p.phase === "charging" && friend === "bubbo") {
    p.phase = "exposed"; p.timer = 6; p.shorted = true;
    return "shorted";
  }
  if (p.phase !== "exposed") return "blocked";
  p.phase = "down"; p.timer = 0;
  state.power = state.pylons.filter(q => q.phase !== "down").length;
  return "down";
}

/** Aim in the streak direction, with a forgiving sixty-degree cone. */
export function cancelBeaconGust(state: BeaconState, friend: CompanionId, direction: { x: number; z: number }): boolean {
  if (!state.active || friend !== "puff" || !["gustTell", "gust"].includes(state.attack)) return false;
  const length = Math.hypot(direction.x, direction.z);
  if (!length || (direction.x * state.gust.x + direction.z * state.gust.z) / length < .5) return false;
  state.gustCancelled = true;
  if (state.attack === "gust") { state.attack = "calm"; state.timer = 3.5; state.turn++; }
  return true;
}
