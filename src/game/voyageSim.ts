import { addFx, vy, type Candidate, type CrewId, type FxKind, type Phase as VoyagePhase, type VoyageFx } from "./voyageRt";
import { animate, effect, rt } from "./runtime";
import { getGame } from "./store";
import { DECK_Y, HOLD_BOX, HOLD_SHELF, HOLD_TABLE, HOLD_Y, MASTS, SAIL_FOOT, SHIP, SPOT, sailHeight } from "./world/pirateShip";
import { SEA_Y } from "./world/island";
import type { CargoItem, Placement } from "./logic/voyage";
import type { CompanionId } from "./data/combat";
import { audio } from "../audio/audio";
import { cb, mountPose, mounted } from "./combat";
import { monsterRootY } from "./ride";
import { EMBER_MOUTH, PUFF_BEAK } from "../scene/anchors";
import { BUBBO_MOUTH, voyageEmitter } from "../scene/voyageAnchors";

/**
 * The pirate voyage's free play (docs/PIRATE_VOYAGE.md §3–§5): the running
 * phase (a job, a storm emergency, a raft step) owns the E targets, the J tool
 * and a per-frame tick. J is always the active friend's tool on the ship:
 * Bubbo's bubble, Ember's flame, Leafy's vine, Puff's gust. Tools aim
 * generously (a wide cone, then the nearest thing close by), so a child who
 * roughly faces the right way succeeds.
 */

export type { Candidate };
export type Phase = VoyagePhase & {
  stance?(): CompanionId | null;
  stanceYaw?(): number;
  keepStanceDuringScene?(): boolean;
};

export const currentPhase = (): Phase | null => vy.phase;
export function setPhase(p: Phase | null) {
  vy.phase = p;
  if (!p) vy.hud = null;
}

export const stanceReady = (friend: CompanionId) => activeFriend() === friend && cb.stance.friend === friend && cb.stance.k >= .99;

export const TOOL: Record<CompanionId, { kind: FxKind; name: string; ja: string }> = {
  bubbo: { kind: "bubble", name: "Bubble", ja: "あわ" },
  ember: { kind: "flame", name: "Fire", ja: "ほのお" },
  leafy: { kind: "vine", name: "Vine", ja: "つる" },
  puff: { kind: "gust", name: "Wind", ja: "かぜ" },
};

// ------------------------------------------------------------ places (local to SHIP)

export const L = (x: number, z: number) => ({ x: SHIP.x + x, z: SHIP.z + z });

/** Where each cargo item rests (local, its base height): on/under/in/by, or its own spot on the floor. */
const FLOOR = {
  barrel: { x: 0.35, y: HOLD_Y, z: -8.85 },
  bag: { x: -1.35, y: HOLD_Y, z: -2.25 },
  bottle: { x: 4.4, y: HOLD_Y, z: -9.15 },
} as const;
const CARGO_SLOTS = {
  table: { on: { ...SPOT.table, y: HOLD_Y + HOLD_TABLE.top }, under: { ...SPOT.table, y: HOLD_Y } },
  shelf: { on: { ...SPOT.shelf, y: HOLD_Y + HOLD_SHELF.top }, under: { ...SPOT.shelf, y: HOLD_Y } },
  box: { in: { ...SPOT.box, y: HOLD_Y + HOLD_BOX.base } },
  door: { by: { x: SPOT.door.x + 1.34, y: HOLD_Y, z: SPOT.door.z + 0.52 } },
} as const;
export function cargoSpot(item: CargoItem, pl: Placement | null): Readonly<{ x: number; y: number; z: number }> {
  if (!pl) return FLOOR[item];
  if (pl.furniture === "table" || pl.furniture === "shelf") {
    if (pl.prep === "on" || pl.prep === "under") return CARGO_SLOTS[pl.furniture][pl.prep];
  }
  if (pl.furniture === "box" && pl.prep === "in") return CARGO_SLOTS.box.in;
  return CARGO_SLOTS.door.by;
}

/** Base of the carried prop, shared by the prop mesh and Leafy's supporting vines. */
export const carriedCargoY = (y: number, time: number) => y + 1.65 + Math.sin(time * 3) * 0.05;

/** The centre of each sail's cloth (mizzen, main, fore), local. */
export const SAIL_AIM = [MASTS.mizzen, MASTS.main, MASTS.fore].map((m) => ({ x: m.x + 0.4, y: DECK_Y + SAIL_FOOT + sailHeight(m) * 0.5 + 0.3, z: m.z + 2.0 }));

/** A marker's height above the dish on the stove, and above a pirate's feet. */
export const MARKER_LIFT = { dish: 1.0, crew: 2.55 };

/**
 * Where the cooking job's marker points (local to the ship), or null: over the
 * finished dish until it is taken, then over the pirate who ordered it until it
 * is handed over. Never over anyone else (scene/VoyageProps draws it).
 */
export function cookMarker(): { x: number; y: number; z: number; kind: "dish" | "crew"; who?: CrewId } | null {
  if (vy.phase?.name !== "cooking") return null;
  const cook = vy.cook, st = SPOT.stove;
  if (cook.dish && !vy.carry) return { x: st.x, y: DECK_Y + 1.4 + MARKER_LIFT.dish, z: st.z, kind: "dish" };
  if (vy.carry?.kind === "dish" && cook.order) {
    const c = vy.crew[cook.order.who];
    return { x: c.x, y: DECK_Y + MARKER_LIFT.crew, z: c.z, kind: "crew", who: cook.order.who };
  }
  return null;
}

// ------------------------------------------------------------ aiming

/** The player's hand (world), a little in front at chest height. */
export function hand(): { x: number; y: number; z: number } {
  const p = rt.player;
  return { x: p.x + Math.sin(p.yaw) * 0.45, y: p.y + 1.1, z: p.z + Math.cos(p.yaw) * 0.45 };
}

/**
 * The best target for a tool: inside `range` and within `cone` radians of the
 * facing (the straightest, then the nearest); otherwise the nearest within
 * `close` metres in any direction. Positions are world.
 */
export function aim<T>(items: T[], at: (t: T) => { x: number; z: number }, range: number, cone = 0.75, close = 2.6): T | null {
  const p = rt.player, fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
  let best: T | null = null, score = Infinity;
  for (const t of items) {
    const q = at(t), dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
    if (d > range) continue;
    const ang = d < 0.01 ? 0 : Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / d)));
    const s = ang <= cone ? ang * 3 + d * 0.15 : d <= close ? 10 + d : Infinity;
    if (s < score) { score = s; best = t; }
  }
  return best;
}

const friendEffects = new WeakMap<VoyageFx, boolean>();
const stormEffects = new WeakSet<VoyageFx>();
export const isPosedToolFx = (fx: VoyageFx) => friendEffects.get(fx) === true;
export const usesVoyageBreath = (fx: VoyageFx) => fx.kind === "flame" && friendEffects.has(fx);
export const usesStormCombatVisuals = (fx: VoyageFx) => stormEffects.has(fx);

/** Use the rig's emitter, with a transform from the current pose when the rig hasn't rendered. */
function friendSource(friend: CompanionId, posed: boolean) {
  const emitter = voyageEmitter(friend);
  if (emitter) return emitter;
  const pose = posed ? mountPose(friend) : null;
  const m = rt.monsters[friend];
  const root = pose ?? m;
  const height = pose?.y ?? monsterRootY(m, getGame().progress.solved, rt.time);
  const scale = pose?.scale ?? 1;
  const [x, y, z] = friend === "ember" ? EMBER_MOUTH : friend === "puff" ? PUFF_BEAK : friend === "bubbo" ? BUBBO_MOUTH : LEAFY_HAND_FALLBACK;
  const s = Math.sin(root.yaw), c = Math.cos(root.yaw);
  return { x: root.x + (x * c + z * s) * scale, y: height + y * scale, z: root.z + (z * c - x * s) * scale };
}

const LEAFY_HAND_FALLBACK = [.38, .65, .03] as const;

/** Travel time also drives the sail's response. */
export const GUST_TRAVEL = .6;

export function toolFx(friend: CompanionId, to: { x: number; y: number; z: number }) {
  const kind = TOOL[friend].kind;
  const posed = activeFriend() === friend && mounted(friend);
  const phase = currentPhase();
  const shipTool = vy.active && rt.world === "home" && Boolean(phase?.stance);
  const source = posed || shipTool ? friendSource(friend, posed) : null;
  const life = kind === "vine" ? 0.55 : kind === "gust" ? GUST_TRAVEL : kind === "flame" ? 0.5 : 0.45;
  addFx(kind, source ?? hand(), to, life, rt.time);
  const fx = vy.fx[vy.fx.length - 1];
  if ((kind === "bubble" && phase?.name === "storm-fires") || (kind === "gust" && phase?.name === "storm-sail")) {
    stormEffects.add(fx);
  }
  if (source) {
    friendEffects.set(fx, posed);
    if (friend === "ember" && rt.monsters.ember.anim?.kind !== "power") animate("ember", "power");
  }
  audio.play(kind === "bubble" ? "bubble" : kind === "flame" ? "fireball" : kind === "vine" ? "vines" : "wind");
  return fx;
}

export function voyageBreath(): VoyageFx | undefined {
  if (!vy.active || rt.world !== "home" || !currentPhase()?.stance || activeFriend() !== "ember") return;
  for (let i = vy.fx.length - 1; i >= 0; i--) {
    const fx = vy.fx[i];
    if (usesVoyageBreath(fx) && (!isPosedToolFx(fx) || mounted("ember")) && rt.time - fx.t0 <= fx.life) return fx;
  }
}

/** Steam and a hiss where water meets fire. */
export function steamAt(x: number, y: number, z: number) {
  addFx("steam", { x, y, z }, { x, y: y + 1.6, z }, 1.3, rt.time);
  effect("smoke", x, y + 0.4, z);
  audio.play("sizzle");
}

export function sparkleAt(x: number, y: number, z: number) {
  addFx("sparkle", { x, y, z }, { x, y: y + 0.8, z }, 0.9, rt.time);
  effect("sparkle", x, y, z);
}

// ------------------------------------------------------------ the frame

export function voyageTick(dt: number, holdJ: boolean) {
  if (!vy.sea) return;
  vy.hold = holdJ;
  vy.flowDist += vy.flow * dt * 3.2;
  if (vy.fx.length && vy.fx.some((f) => rt.time - f.t0 > f.life)) vy.fx = vy.fx.filter((f) => rt.time - f.t0 <= f.life);
  vy.laneVis += (vy.lane - vy.laneVis) * Math.min(1, dt * 1.4);
  vy.shipBob = vy.active ? Math.sin(rt.time * 0.9) * 0.04 * (1 + vy.storm * 3) : 0;
  vy.phase?.tick?.(dt);
}

/** The voyage's active friend (null before the party exists). */
export const activeFriend = () => (getGame().progress.active ?? null) as CompanionId | null;

/** The sea's surface height at a world point (fish, planks, debris). */
export const SURFACE_Y = SEA_Y + 0.05;
