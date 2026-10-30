import { COMBAT, ENEMIES, FOOD_RESTORE, MAX_HP, type CompanionId, type EnemyKind, type MoveDef } from "./data/combat";
import { BAG_MAX, FOODS } from "./data/foods";
import { MONSTERS } from "./data/monsters";
import { clearStage, remainingEnemies, addCoins, addFood, addItem, afterKnockout, favouriteFood, changeZone, eatEffect, eatHelps, hurt, markTutorial, newZoneMemory, noteDefeat, regenMp, spendMp, type TutorialStep, type Vitals, type ZoneMemory } from "./logic/act2";
import { getGame, setGame, toast, updateProgress, type HintKey } from "./store";
import { effect, rt } from "./runtime";
import { isRunning } from "./flow/script";
import { ENEMY_SPAWNS, ZONES, zoneAt, type StageId, type ZoneId } from "./world/lowland";
import { CLOUD_ENEMY_SPAWNS, CLOUD_ZONES, CLOUD_STAGES, CLOUD_ELECTRIC_PANELS, electricPanelActive, cloudWindAt, cloudZoneAt, type CloudAreaId, type CloudStageId } from "./world/cloudisle";
import { clearCloudStage } from "./logic/act3";
import { BEACON_ARENA, BEACON_PYLONS, cancelBeaconGust, newBeacon, strikeBeaconPylon, tickBeacon } from "./logic/beacon";
import { PLAYER_R, gatesOf, isWalkable, moveCircle, nearestWalkable, standY } from "./world/collision";
import { monsterRootY } from "./ride";
import { audio } from "../audio/audio";
import type { FoodId, MonsterId } from "./types";
import { debugEnabled } from "./debugAccess";
import { debugPaused, useDebug } from "./debugState";

/**
 * Act 2's real-time fights, in the explorable world (no battle screen).
 *
 * - Areas: the lowland is split into zones (world/lowland.ts). Entering a
 *   hostile zone puts the active friend in its combat position (on the
 *   backpack, on a shoulder, or carrying the player); a safe zone (the camp,
 *   the town) puts everyone back to following. The position depends on the
 *   zone only, never on how near an enemy is, so it never flickers.
 * - Attacks happen only when the player presses J (basic) or K (special):
 *   friends never attack by themselves. Projectiles follow the firing facing;
 *   Leafy's melee and pull retain their forgiving target selection.
 * - Enemies notice, chase, wind up (visibly), lunge, recover, get knocked
 *   back and stunned, and are knocked out with a dizzy spin and a poof,
 *   dropping coins (and sometimes food or amber). They pause whenever a
 *   conversation, prompt or scene is open.
 * - One HP pool (the player's, also while riding) and each friend's own MP.
 */

export type EnemyState = "idle" | "alert" | "chase" | "windup" | "lunge" | "recover" | "stun" | "pulled" | "ko" | "gone" | "return";
export type CombatZone = ZoneId | CloudAreaId;
interface CloudZoneMemory {
  current: CloudAreaId | null;
  defeated: Partial<Record<CloudAreaId, number[]>>;
  leftAt: Partial<Record<CloudAreaId, number>>;
}

export const onCloudIsle = () => getGame().progress.act3.world === "cloud";
export const combatZoneAt = (x: number, z: number): CombatZone | null => onCloudIsle() ? cloudZoneAt(x, z) : zoneAt(x, z);
export const currentCombatZone = (): CombatZone | null => onCloudIsle() ? cb.cloudZones.current : cb.zones.current;
export const currentCloudZone = (): CloudAreaId | null => cb.cloudZones.current;
const activeSpawns = () => onCloudIsle() ? CLOUD_ENEMY_SPAWNS : ENEMY_SPAWNS;

/** Wind lanes still move loose drops; combat shots keep their launch velocity. */
function projectileWind(x: number, z: number): { x: number; z: number } {
  return onCloudIsle() ? cloudWindAt(x, z, getGame().progress.act3.puzzles) : { x: 0, z: 0 };
}

export interface EnemyRt {
  /** Index into ENEMY_SPAWNS. */
  i: number;
  kind: EnemyKind;
  zone: CombatZone;
  homeX: number;
  homeZ: number;
  x: number;
  z: number;
  yaw: number;
  /** Knock-back velocity (decays). */
  kx: number;
  kz: number;
  hp: number;
  state: EnemyState;
  /** A hit can stun a sleeping enemy without occupying a fifth attack slot. */
  waiting: boolean;
  /** Seconds left in the current state (counts down only while the fight runs). */
  timer: number;
  /** Idle wander target. */
  wander: { x: number; z: number } | null;
  /** Lunge direction, locked at the wind-up. */
  dx: number;
  dz: number;
  struck: boolean;
  /** rt.time of the last hit (the scene flashes it) and of noticing the player ("!"). */
  hitT: number;
  alertT: number;
  /** A vine pull: where it is dragged from and to. */
  pull: { fx: number; fz: number; tx: number; tz: number; t: number } | null;
  step: number;
}

export interface Shot {
  id: number;
  shape: MoveDef["shape"];
  owner: CompanionId;
  x: number;
  y: number;
  z: number;
  vx: number;
  /** Fixed launch slope; never follows an enemy after firing. */
  vy?: number;
  vz: number;
  y1: number;
  life: number;
  age: number;
  radius: number;
  damage: number;
  knock: number;
  stun: number;
  size: number;
  /** Hostile wind puffs use the same pooled projectile renderer. */
  hostile?: boolean;
  source?: number;
  basic?: boolean;
}

export interface Drop {
  id: number;
  kind: "coin" | "food" | "amber";
  food?: FoodId;
  value: number;
  x: number;
  y: number;
  z: number;
  vy: number;
  vx: number;
  vz: number;
  t0: number;
  magnet: boolean;
}

/** Short-lived attack shapes for the scene (vines, jets, gusts, bursts, hits). */
export interface Fx {
  id: number;
  kind: "whip" | "pull" | "jet" | "gust" | "burst" | "hit" | "ko" | "eat";
  x: number;
  y: number;
  z: number;
  /** Direction (whip/jet/gust) or a second point (pull). */
  ax: number;
  az: number;
  yaw: number;
  size: number;
  t0: number;
  life: number;
}

export interface Stance {
  /** The friend in its combat position (null: everyone follows). */
  friend: CompanionId | null;
  /** 0 = following, 1 = in position (eases over the hop on/off). */
  k: number;
  /** Where the friend was when the hop on began (the blend's start). */
  fromX: number;
  fromZ: number;
  /** A friend hopping off (after a switch), shown easing back down. */
  leaving: CompanionId | null;
  leaveK: number;
}

let nextId = 1;
const MOUNT_TIME = 0.4;
let worldEnemies: Partial<Record<"home" | "cloud", EnemyRt[]>> = {};

function spawnEnemy(i: number, cloud = false): EnemyRt {
  const s = (cloud ? CLOUD_ENEMY_SPAWNS : ENEMY_SPAWNS)[i];
  return {
    i, kind: s.kind, zone: s.zone, homeX: s.x, homeZ: s.z, x: s.x, z: s.z, yaw: (i * 2.39) % (Math.PI * 2), kx: 0, kz: 0,
    hp: ENEMIES[s.replaces ?? s.kind].hp, state: "idle", waiting: false, timer: 1 + (i % 5) * 0.4, wander: null, dx: 0, dz: 1, struck: false,
    hitT: -10, alertT: -10, pull: null, step: 0
  };
}

export const cb = {
  /** Supplied by the scene's actual camera, including aspect and camera blends. */
  onScreen: null as null | ((x: number, y: number, z: number) => boolean),
  beacon: newBeacon(),
  /** Live HP and MP (written into progress when the game saves). */
  vitals: { hp: MAX_HP, mp: { leafy: 100, bubbo: 100, puff: 100, ember: 100 } } as Vitals,
  enemies: ENEMY_SPAWNS.map((_, i) => spawnEnemy(i)),
  zones: newZoneMemory() as ZoneMemory,
  cloudZones: { current: null, defeated: {}, leftAt: {} } as CloudZoneMemory,
  world: "home" as "home" | "cloud",
  shots: [] as Shot[],
  drops: [] as Drop[],
  fx: [] as Fx[],
  stance: { friend: null, k: 0, fromX: 0, fromZ: 0, leaving: null, leaveK: 0 } as Stance,
  /** rt.time when each move is ready again. */
  ready: { basic: 0, special: 0 },
  /** The friend's last move (the scene animates it). */
  move: null as null | { friend: CompanionId; kind: "basic" | "special"; t0: number; tx: number; tz: number },
  /** Held J (keyboard) or the held touch button: basic attacks repeat. */
  hold: false,
  /** The touch attack button is held down. */
  touchHold: false,
  /** The player cannot be hurt again until this rt.time. */
  safeUntil: 0,
  hurtT: -10,
  /** Player knock-back velocity. */
  knock: { x: 0, z: 0 },
  knockedOut: false,
  /** Enemies knocked out in the tutorial forest this visit (the special's lesson comes after a few). */
  kos: 0,
  /** Coins waiting to be added to progress (batched: one store update per pickup burst). */
  pendingCoins: 0,
  lastMpWarn: -10
};

/** Called with the live fight when a knock-out happens (the flow owns the scene). */
export const hooks = { knockout: null as null | (() => void), enterZone: null as null | ((zone: ZoneId) => void), cloudEnterZone: null as null | ((zone: CloudAreaId) => void), beaconDefeated: null as null | (() => void) };

/** No per-attempt boss progress is saved; checkpoints and lamps live in act3. */
export function resetBeaconFight() {
  cb.beacon = newBeacon();
  cb.enemies = cb.enemies.filter(e => e.i < 10000);
  cb.shots = cb.shots.filter(s => !s.hostile);
}

/** Back to a clean fight: from saved progress (load) or after a new game. */
export function resetCombat() {
  resetBeaconFight();
  worldEnemies = {};
  const p = getGame().progress;
  cb.vitals = { hp: p.act2.hp, mp: { ...p.act2.mp } };
  cb.enemies = activeSpawns().map((_, i) => spawnEnemy(i, onCloudIsle()));
  cb.zones = newZoneMemory();
  cb.cloudZones = { current: null, defeated: {}, leftAt: {} };
  cb.world = onCloudIsle() ? "cloud" : "home";
  cb.shots = [];
  cb.drops = [];
  cb.fx = [];
  cb.stance = { friend: null, k: 0, fromX: 0, fromZ: 0, leaving: null, leaveK: 0 };
  cb.ready = { basic: 0, special: 0 };
  cb.move = null;
  cb.hold = false;
  cb.safeUntil = 0;
  cb.knock = { x: 0, z: 0 };
  cb.knockedOut = false;
  cb.kos = 0;
  cb.pendingCoins = 0;
}

/** Boats keep each world's encounter memory; only a new game/load resets it.
 * The ordinary zone-entry path applies the same 12 seconds away on return. */
export function travelCombat() {
  const next = onCloudIsle() ? "cloud" : "home";
  if (next === cb.world) return;
  const before = cb.world === "cloud" ? cb.cloudZones.current : cb.zones.current;
  if (before) {
    sendHome(before);
    if (cb.world === "cloud") cb.cloudZones.leftAt[before as CloudAreaId] = rt.playTime;
    else cb.zones.leftAt[before as ZoneId] = rt.playTime;
  }
  if (cb.world === "cloud") cb.cloudZones.current = null;
  else cb.zones.current = null;
  worldEnemies[cb.world] = cb.enemies;
  cb.enemies = worldEnemies[next] ?? activeSpawns().map((_, i) => spawnEnemy(i, next === "cloud"));
  cb.world = next;
  cb.shots = [];
  cb.drops = [];
  cb.fx = [];
  cb.stance = { friend: null, k: 0, fromX: 0, fromZ: 0, leaving: null, leaveK: 0 };
  cb.ready = { basic: 0, special: 0 };
  cb.move = null;
  cb.hold = cb.touchHold = false;
  cb.knock = { x: 0, z: 0 };
}

export function act2Live(): boolean {
  return getGame().progress.act2.started;
}

/** The zone the player is in (null on the ledge, the rope, or anywhere south of the cliff). */
export function currentZone(): ZoneId | null {
  return cb.zones.current;
}

export function inHostileZone(): boolean {
  if (onCloudIsle()) {
    const z = cb.cloudZones.current;
    return z !== null && CLOUD_ZONES[z].hostile;
  }
  const z = cb.zones.current;
  return z !== null && ZONES[z].hostile;
}

// ------------------------------------------------------------ stance

/** Is this friend in (or hopping into) its combat position? */
export function mounted(id: MonsterId): boolean {
  return cb.stance.friend === id && cb.stance.k > 0;
}

/** The player is riding (Bubbo or Ember in combat): 0..1 of the hop on. */
export function rideK(): number {
  const f = cb.stance.friend;
  return f && COMBAT[f].stance === "ride" ? cb.stance.k : 0;
}

/** The friend carrying the player, if any. */
export function steed(): CompanionId | null {
  const f = cb.stance.friend;
  return f && COMBAT[f].stance === "ride" && cb.stance.k > 0.5 ? f : null;
}

/** Collision radius of the player (a ridden friend is wider). */
export function playerRadius(): number {
  const s = steed();
  return s ? Math.max(PLAYER_R, MONSTERS[s].radius) : PLAYER_R;
}

/** Riding is a little quicker than walking. */
export function speedScale(): number {
  return steed() ? 1.18 : 1;
}

/** Seats on each rider (in the friend's frame): back = behind its centre, up = above its root. */
export const RIDE_SEAT: Record<"bubbo" | "ember", { back: number; up: number }> = {
  bubbo: { back: 0.2, up: 0.82 },
  ember: { back: 0.67, up: 0.95 }
};

/** Where a perched friend sits on the player, in the player's frame (x right, z forward). */
const PERCH: Record<"leafy" | "puff", { x: number; y: number; z: number; scale: number }> = {
  leafy: { x: 0, y: 0.74, z: -0.43, scale: 0.5 },
  puff: { x: 0.44, y: 1.1, z: -0.04, scale: 0.5 }
};

export interface MountPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
}

/**
 * Where a friend in (or hopping into) its combat position is drawn. Riders:
 * the friend stands where the player is and the player sits on it. Perched
 * friends: on the player's backpack or shoulder, smaller. Null when it follows.
 */
export function mountPose(id: MonsterId): MountPose | null {
  const s = cb.stance;
  const leaving = s.leaving === id && s.leaveK > 0;
  if (!(s.friend === id && s.k > 0) && !leaving) return null;
  const k = leaving ? s.leaveK : s.k;
  const p = rt.player;
  const m = rt.monsters[id];
  const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
  const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
  const e = k * k * (3 - 2 * k);
  const solved = getGame().progress.solved;
  if (id === "leafy" || id === "puff") {
    const c = PERCH[id];
    let x = p.x + rx * c.x + fx * c.z;
    let z = p.z + rz * c.x + fz * c.z;
    let y = p.y + c.y;
    // Puff flies out to the target and back for each attack.
    const mv = cb.move;
    if (id === "puff" && mv && mv.friend === "puff" && !leaving) {
      const t = (rt.time - mv.t0) / (mv.kind === "special" ? 0.9 : 0.5);
      if (t < 1) {
        const out = Math.sin(t * Math.PI) * (mv.kind === "special" ? 1.6 : 1.1);
        const dx = mv.tx - x, dz = mv.tz - z, d = Math.hypot(dx, dz) || 1;
        x += (dx / d) * out;
        z += (dz / d) * out;
        y += Math.sin(t * Math.PI) * (mv.kind === "special" ? 1.2 : 0.4);
      }
    }
    if (id === "puff") y += Math.sin(rt.time * 9) * 0.03;
    const ground = standY(s.fromX, s.fromZ, solved);
    // The hop: from where it stood, up in an arc, onto the player.
    const from = { x: s.fromX, y: ground, z: s.fromZ };
    return {
      x: from.x + (x - from.x) * e,
      y: from.y + (y - from.y) * e + Math.sin(e * Math.PI) * 0.6,
      z: from.z + (z - from.z) * e,
      yaw: p.yaw,
      scale: 1 + (c.scale - 1) * e
    };
  }
  // Riders: the friend stands under the player (its seat is behind its centre).
  const seat = RIDE_SEAT[id as "bubbo" | "ember"];
  const x = p.x + fx * seat.back;
  const z = p.z + fz * seat.back;
  const cx = s.fromX + (x - s.fromX) * e;
  const cz = s.fromZ + (z - s.fromZ) * e;
  m.x = cx;
  m.z = cz;
  return { x: cx, y: monsterRootY(m, solved, rt.time), z: cz, yaw: p.yaw, scale: 1 };
}

/** The rider's seat height (absolute), for the player's body. */
export function riderSeatY(): number | null {
  const f = cb.stance.friend;
  if (!f || COMBAT[f].stance !== "ride") return null;
  const m = rt.monsters[f];
  return monsterRootY(m, getGame().progress.solved, rt.time) + RIDE_SEAT[f as "bubbo" | "ember"].up;
}

function updateStance(dt: number) {
  const g = getGame();
  const s = cb.stance;
  const active = g.progress.active as CompanionId | null;
  // Scenes (conversations, powers, the rope) take the friend off; play puts it back.
  const want = inHostileZone() && active && !isRunning() && rt.player.climbY === null && !cb.knockedOut ? active : null;
  if (s.leaving) {
    s.leaveK = Math.max(0, s.leaveK - dt / MOUNT_TIME);
    if (s.leaveK <= 0) s.leaving = null;
  }
  if (s.friend && s.friend !== want) {
    // Off: the friend drops beside the player and follows again.
    const off = s.friend;
    const sceneOwnsFriend = isRunning();
    const perched = off === "leafy" || off === "puff";
    if (s.k > 0.05 && want !== null) {
      s.leaving = off;
      s.leaveK = s.k;
    }
    const m = rt.monsters[off];
    const p = rt.player;
    m.x = p.x - Math.sin(p.yaw) * 1.3 - Math.cos(p.yaw) * 0.9;
    m.z = p.z - Math.cos(p.yaw) * 1.3 + Math.sin(p.yaw) * 0.9;
    if (COMBAT[off].stance === "ride") {
      m.x = p.x + Math.cos(p.yaw) * 1.2;
      m.z = p.z - Math.sin(p.yaw) * 1.2;
    }
    if (!sceneOwnsFriend) {
      const gates = gatesOf(g.progress);
      const landing = nearestWalkable(m.x, m.z, MONSTERS[off].radius, gates, MONSTERS[off].can.includes("swim"));
      m.x = landing.x;
      m.z = landing.z;
      // Combat itself set "script" on mount. Only a running scene may keep
      // ownership; otherwise this friend would stay at the hostile border.
      m.mode = off === active ? "follow" : "party";
      m.target = m.look = null;
      m.air = m.airTarget = 0;
      if (want === null && perched && s.k > 0.05) {
        s.fromX = m.x;
        s.fromZ = m.z;
        s.leaving = off;
        s.leaveK = s.k;
      }
      if (!perched && want === null) {
        const ground = nearestWalkable(p.x, p.z, PLAYER_R, gates);
        p.x = ground.x;
        p.z = ground.z;
        p.y = standY(p.x, p.z, g.progress.solved);
      }
    } else if (m.mode !== "script" && m.mode !== "talk") m.mode = "follow";
    if (s.k > 0.05) audio.play("mount");
    s.friend = null;
    s.k = 0;
  }
  if (!s.friend && want) {
    const m = rt.monsters[want];
    s.friend = want;
    s.k = 0;
    s.fromX = m.x;
    s.fromZ = m.z;
    m.mode = "script";
    m.look = null;
    effect("sparkle", m.x, standY(m.x, m.z, g.progress.solved) + 0.8, m.z);
    audio.play("mount");
    audio.voice(want, "excited");
  }
  if (s.friend) {
    s.k = Math.min(1, s.k + dt / MOUNT_TIME);
    const m = rt.monsters[s.friend];
    m.mode = "script";
    // A rider walks for the player; a friend perched on the player keeps its feet still.
    m.speed = COMBAT[s.friend].stance === "ride" ? rt.player.speed : 0;
    m.step = rt.player.step;
    m.yaw = rt.player.yaw;
  }
}

// ------------------------------------------------------------ attacks

function friendNow(): CompanionId | null {
  const s = cb.stance;
  return s.friend && s.k >= 0.95 ? s.friend : null;
}

function canFight(): boolean {
  const g = getGame();
  return g.screen === "game" && g.mode === "explore" && !g.journalOpen && !g.settingsOpen && !isRunning() && !cb.knockedOut && act2Live();
}

const alive = (e: EnemyRt) => e.state !== "ko" && e.state !== "gone";
const awakeEnemies = (zone: CombatZone) => cb.enemies.filter((e) => e.zone === zone && alive(e) && e.state !== "idle" && e.state !== "return").length;
export const isRanged = (kind: EnemyKind) => kind === "forestSpitter" || kind === "raiderShooter" || kind === "windSprite";
const awakeRanged = (zone: CombatZone) => cb.enemies.filter(e => e.zone === zone && isRanged(e.kind) && alive(e) && e.state !== "idle" && e.state !== "return").length;
const hasAttackSlot = (e: EnemyRt) => (!onCloudIsle() || awakeEnemies(e.zone) < 4) && (!isRanged(e.kind) || awakeRanged(e.zone) < 2);
/** Replacement spawns retain the original HP, drops and rewards. */
function spawnDef(e: EnemyRt) {
  // Boat progress already names the destination while sendHome still handles
  // the departing world's live enemies.
  const spawns = cb.world === "cloud" ? CLOUD_ENEMY_SPAWNS : ENEMY_SPAWNS;
  const spawn = e.i < 10000 ? spawns[e.i] : undefined;
  return ENEMIES[spawn?.replaces ?? e.kind];
}

/** Incoming direction points towards the target: only J against the front is armoured. */
export function crabDamage(kind: EnemyKind, damage: number, basic: boolean, yaw: number, ux: number, uz: number): number {
  const frontal = -(ux * Math.sin(yaw) + uz * Math.cos(yaw));
  return kind === "stormCrab" && basic && frontal > 0.5 ? damage * 0.5 : damage;
}

/** Forgiving aim: the nearest enemy roughly in front, or failing that the nearest close by. */
export function pickTarget(range: number): EnemyRt | null {
  const p = rt.player;
  const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
  let best: EnemyRt | null = null;
  let bestScore = Infinity;
  for (const e of cb.enemies) {
    if (!alive(e) || e.zone !== currentCombatZone()) continue;
    const dx = e.x - p.x, dz = e.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > range) continue;
    const facing = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
    if (facing < -0.25 && d > 3.2) continue;
    const score = d - facing * 2.5;
    if (score < bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}

function upgraded(f: CompanionId) {
  return getGame().progress.act2.upgrades.includes(f);
}

/** Origin of a friend's attack (its mouth or hands). */
function originOf(f: CompanionId): { x: number; y: number; z: number } {
  const pose = mountPose(f);
  const p = rt.player;
  const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
  if (!pose) return { x: p.x, y: p.y + 1, z: p.z };
  if (f === "leafy") return { x: pose.x, y: pose.y + 0.45, z: pose.z };
  if (f === "puff") return { x: pose.x + fx * 0.2, y: pose.y + 0.2, z: pose.z + fz * 0.2 };
  if (f === "bubbo") return { x: pose.x + fx * 0.6, y: pose.y + 0.45, z: pose.z + fz * 0.6 };
  return { x: pose.x + fx * 0.5, y: pose.y + 1.2, z: pose.z + fz * 0.5 };
}

function aimAt(target: EnemyRt | null, range: number, targeted = true): { x: number; z: number } {
  const p = rt.player;
  if (!targeted) return { x: p.x + Math.sin(p.yaw) * range, z: p.z + Math.cos(p.yaw) * range };
  // The pylon is a world target, using the same forgiving aim as ordinary foes.
  if (cb.beacon.active && currentCloudZone() === "stormBeacon") {
    const best = BEACON_PYLONS.map((q, i) => ({ ...q, i, d: Math.hypot(q.x - p.x, q.z - p.z) }))
      .filter(q => cb.beacon.pylons[q.i].phase !== "down" && q.d <= range + 1 &&
        ((q.x - p.x) * Math.sin(p.yaw) + (q.z - p.z) * Math.cos(p.yaw) > -q.d * .25 || q.d < 3.2))
      .sort((a, b) => a.d - b.d)[0];
    // A pylon right in front of the player wins even when a wind sprite hovers closer.
    if (best && (!target || best.d < 3.5 || best.d < Math.hypot(target.x - p.x, target.z - p.z))) {
      if (p.speed < .6) p.yaw = Math.atan2(best.x - p.x, best.z - p.z);
      return { x: best.x, z: best.z };
    }
  }
  if (target) {
    // Turn to face it (only when standing; on the move the friend aims for us).
    if (p.speed < 0.6) p.yaw = Math.atan2(target.x - p.x, target.z - p.z);
    return { x: target.x, z: target.z };
  }
  return { x: p.x + Math.sin(p.yaw) * range, z: p.z + Math.cos(p.yaw) * range };
}

/** J: the active friend's basic attack (free; repeats while held). */
export function basicAttack(): boolean {
  const f = friendNow();
  if (!f || !canFight() || rt.time < cb.ready.basic) return false;
  const move = COMBAT[f].basic;
  const up = upgraded(f);
  const size = up ? COMBAT[f].upgrade.size : 1;
  const dmg = move.damage * (up ? COMBAT[f].upgrade.damage : 1);
  const range = move.range * (move.shape === "whip" ? size : 1);
  const target = move.shape === "whip" ? pickTarget(range + 1.5) : null;
  const aim = aimAt(target, range, move.shape === "whip");
  cb.ready.basic = rt.time + move.cooldown;
  cb.move = { friend: f, kind: "basic", t0: rt.time, tx: aim.x, tz: aim.z };
  const o = originOf(f);
  const dx = aim.x - rt.player.x, dz = aim.z - rt.player.z;
  const yaw = Math.atan2(dx, dz);
  if (cb.beacon.active) cancelBeaconGust(cb.beacon, f, { x: dx, z: dz });
  if (move.shape === "whip") {
    // A sweeping vine: everything in a wide arc in front, out to its reach.
    const p = rt.player;
    pushFx("whip", o.x, o.y, o.z, Math.sin(yaw), Math.cos(yaw), yaw, range);
    hitBeaconShape(f, range, Math.sin(yaw), Math.cos(yaw), "cone");
    for (const e of cb.enemies) {
      if (!alive(e) || e.zone !== currentCombatZone()) continue;
      const ex = e.x - p.x, ez = e.z - p.z;
      const d = Math.hypot(ex, ez);
      if (d > range + ENEMIES[e.kind].radius) continue;
      const facing = d > 0.01 ? (ex * Math.sin(yaw) + ez * Math.cos(yaw)) / d : 1;
      if (facing > 0.2 || d < 1) hit(e, dmg, move.knock, move.stun, ex / (d || 1), ez / (d || 1), f, true);
    }
    audio.play("whip");
  } else {
    const offsets = COMBAT[f].upgrade.twin && up ? [-0.3, 0.3] : [0];
    const life = move.range / move.speed!;
    // Facing is planar. Lock the launch slope to the ground ahead so a low
    // mouth-level bubble can travel uphill without aiming at an enemy.
    const y1 = standY(aim.x, aim.z, getGame().progress.solved) + 0.55;
    for (const offset of offsets) {
      cb.shots.push({
        id: nextId++, shape: move.shape, owner: f, x: o.x + Math.cos(yaw) * offset, y: o.y, z: o.z - Math.sin(yaw) * offset, y1,
        vx: Math.sin(yaw) * move.speed!, vy: (y1 - o.y) / life, vz: Math.cos(yaw) * move.speed!, life, age: 0,
        radius: Math.min(1, move.radius * size), damage: dmg, knock: move.knock, stun: move.stun, size, basic: true
      });
    }
    audio.play(move.shape === "fireball" ? "fireball" : move.shape === "wind" ? "wind" : "bubble");
  }
  return true;
}

/** K: the active friend's special (costs MP; a short cooldown). */
export function specialAttack(): boolean {
  const f = friendNow();
  if (!f || !canFight() || rt.time < cb.ready.special) return false;
  const move = COMBAT[f].special;
  const spent = onCloudIsle() && currentCloudZone() === "stormBeacon" ? cb.vitals : spendMp(cb.vitals, f, move.cost);
  if (!spent) {
    if (rt.time - cb.lastMpWarn > 1.5) {
      cb.lastMpWarn = rt.time;
      audio.play("error");
      toast({ en: "Not enough MP!", ja: `${MONSTERS[f].name}の MPが たりない! たべものを たべよう`, icon: f, tone: "warn" }, 1800);
    }
    return false;
  }
  cb.vitals = spent;
  cb.ready.special = rt.time + move.cooldown;
  const p = rt.player;
  const targeted = move.shape === "pull" || move.shape === "burst";
  const target = targeted ? pickTarget(move.shape === "burst" ? move.range : move.range + 1) : null;
  const aim = aimAt(target, move.range, targeted);
  const yaw = Math.atan2(aim.x - p.x, aim.z - p.z);
  const ux = Math.sin(yaw), uz = Math.cos(yaw);
  if (cb.beacon.active) {
    cancelBeaconGust(cb.beacon, f, { x: ux, z: uz });
    hitBeaconShape(f, move.range, ux, uz, move.shape === "burst" ? "burst" : move.shape === "jet" || move.shape === "pull" ? "beam" : "cone");
  }
  cb.move = { friend: f, kind: "special", t0: rt.time, tx: aim.x, tz: aim.z };
  const o = originOf(f);
  const inZone = cb.enemies.filter((e) => alive(e) && e.zone === currentCombatZone());
  if (move.shape === "pull") {
    // Vine Pull: the vine catches the target and drags it to the player, stunned.
    if (target) {
      const tx = p.x + ux * 1.7, tz = p.z + uz * 1.7;
      target.pull = { fx: target.x, fz: target.z, tx, tz, t: 0 };
      target.state = "pulled";
      target.timer = 0.4;
      pushFx("pull", o.x, o.y, o.z, target.x, target.z, yaw, 1);
      hit(target, move.damage, 0, move.stun, ux, uz, f);
    } else pushFx("pull", o.x, o.y, o.z, aim.x, aim.z, yaw, 1);
    audio.play("vines");
  } else if (move.shape === "jet") {
    // Water Jet: a straight beam; everything along it is pushed away.
    pushFx("jet", o.x, o.y, o.z, ux, uz, yaw, move.range);
    for (const e of inZone) {
      const ex = e.x - p.x, ez = e.z - p.z;
      const along = ex * ux + ez * uz;
      const across = Math.abs(ex * uz - ez * ux);
      if (along > -0.3 && along < move.range && across < move.radius + ENEMIES[e.kind].radius) hit(e, move.damage, move.knock, move.stun, ux, uz, f);
    }
    audio.play("splash");
  } else if (move.shape === "gust") {
    // Strong Gust: a wide cone that blows enemies far back and dizzies them.
    pushFx("gust", o.x, o.y, o.z, ux, uz, yaw, move.range);
    for (const e of inZone) {
      const ex = e.x - p.x, ez = e.z - p.z;
      const d = Math.hypot(ex, ez);
      if (d > move.range) continue;
      const facing = d > 0.01 ? (ex * ux + ez * uz) / d : 1;
      if (facing > 0.55 || d < 1.2) hit(e, move.damage, move.knock, move.stun, ex / (d || 1), ez / (d || 1), f);
    }
    audio.play("whoosh");
  } else {
    // Flame Burst: a ring of fire all round the player.
    pushFx("burst", p.x, p.y + 0.3, p.z, 0, 0, yaw, move.range);
    for (const e of inZone) {
      const ex = e.x - p.x, ez = e.z - p.z;
      const d = Math.hypot(ex, ez);
      if (d < move.range + ENEMIES[e.kind].radius) hit(e, move.damage, move.knock, move.stun, ex / (d || 1), ez / (d || 1), f);
    }
    audio.play("burst");
  }
  learn("special");
  return true;
}

function pushFx(kind: Fx["kind"], x: number, y: number, z: number, ax: number, az: number, yaw: number, size: number) {
  const life = kind === "whip" ? 0.3 : kind === "pull" ? 0.45 : kind === "hit" ? 0.35 : kind === "ko" ? 0.9 : kind === "eat" ? 1 : 0.6;
  cb.fx.push({ id: nextId++, kind, x, y, z, ax, az, yaw, size, t0: rt.time, life });
  if (cb.fx.length > 24) cb.fx.shift();
}

function strikePylon(index: number, friend: CompanionId) {
  const result = strikeBeaconPylon(cb.beacon, index, friend);
  if (result === "blocked") { audio.play("bump"); return; }
  const p = BEACON_PYLONS[index];
  effect(result === "shorted" ? "splash" : "sparkle", p.x, BEACON_ARENA.y + 1.6, p.z);
  audio.play(result === "shorted" ? "splash" : "rumble");
  if (result === "down") {
    toast({ en: "Storm pylon down!", ja: "嵐の とうを とめた！", tone: "good" }, 1800);
    if (cb.beacon.power === 0) {
      cb.beacon.active = false;
      cb.enemies = cb.enemies.filter(e => e.i < 10000);
      cb.shots = [];
      hooks.beaconDefeated?.();
    }
  }
}

function hitBeaconShape(friend: CompanionId, range: number, ux: number, uz: number, shape: "beam" | "cone" | "burst") {
  if (!cb.beacon.active) return;
  for (let i = 0; i < BEACON_PYLONS.length; i++) {
    if (cb.beacon.pylons[i].phase === "down") continue;
    const q = BEACON_PYLONS[i], dx = q.x - rt.player.x, dz = q.z - rt.player.z;
    const distance = Math.hypot(dx, dz), along = dx * ux + dz * uz;
    if (distance > range + 1) continue;
    if (shape === "beam" && (along < -.3 || Math.abs(dx * uz - dz * ux) > 1.9)) continue;
    if (shape === "cone" && along / (distance || 1) < .2 && distance > 1.5) continue;
    strikePylon(i, friend);
  }
}

function updateBeaconFight(dt: number, live: boolean, zone: CombatZone | null) {
  const b = cb.beacon;
  if (!onCloudIsle() || zone !== "stormBeacon") {
    if (b.active) resetBeaconFight();
    return;
  }
  if (getGame().progress.act3.beaconDefeated || cb.knockedOut || !live) return;
  if (!b.active) b.active = true;
  const before = b.attack;
  tickBeacon(b, dt, rt.player);
  if (before !== b.attack) {
    if (b.attack === "gustTell") audio.play("wind");
    if (b.attack === "lightningTell") audio.play("alert");
    if (b.attack === "lightning") audio.play("snap");
  }
  if (b.attack === "gust" && !b.gustCancelled) {
    // Clamp well inside the disc before moving: wind can never throw a child off.
    const p = rt.player, cx = BEACON_ARENA.x, cz = BEACON_ARENA.z;
    const nx = p.x + b.gust.x * dt * 3, nz = p.z + b.gust.z * dt * 3;
    if (Math.hypot(nx - cx, nz - cz) < BEACON_ARENA.radius - 1.8 && cloudZoneAt(nx, nz) === "stormBeacon") {
      p.x = nx; p.z = nz;
    }
  }
  if (b.attack === "lightning" && b.rings.some(r => Math.hypot(rt.player.x - r.x, rt.player.z - r.z) < 2.05)) hurtPlayer(12, 0, 0, 0);
  if (b.power === 1 && !b.spritesAdded) {
    b.spritesAdded = true;
    const source = CLOUD_ENEMY_SPAWNS.findIndex(s => s.kind === "windSprite");
    for (let i = 0; i < 2; i++) {
      const sprite = spawnEnemy(source, true);
      const x = i === 0 ? -5 : 5, z = 174;
      Object.assign(sprite, { i: 10000 + i, zone: "stormBeacon", x, z, homeX: x, homeZ: z, state: "alert", timer: 1.2, alertT: rt.time });
      cb.enemies.push(sprite);
    }
    audio.play("alert");
  }
}

function hit(e: EnemyRt, damage: number, knock: number, stun: number, ux: number, uz: number, _by: CompanionId, basic = false) {
  if (!alive(e)) return;
  const def = ENEMIES[e.kind];
  e.hp -= crabDamage(e.kind, damage, basic, e.yaw, ux, uz);
  // Interrupting a ranged enemy also disperses its in-flight shot.
  if (isRanged(e.kind)) {
    for (const s of cb.shots) if (s.source === e.i && s.hostile) s.life = 0;
  }
  e.hitT = rt.time;
  e.kx += ux * knock * def.weight * 2.2;
  e.kz += uz * knock * def.weight * 2.2;
  pushFx("hit", e.x, standY(e.x, e.z, getGame().progress.solved) + 0.6, e.z, 0, 0, 0, 1);
  audio.play("hit");
  learn("attack");
  if (e.hp <= 0) {
    knockOut(e);
    return;
  }
  // A hit interrupts a wind-up; specials leave it dizzy for longer.
  if (e.state !== "pulled") {
    e.state = "stun";
    e.timer = Math.max(stun, 0.25);
  }
  if ((onCloudIsle() && awakeEnemies(e.zone) > 4) || (isRanged(e.kind) && awakeRanged(e.zone) > 2)) {
    // Damage and KO always count, even when all four attack slots are occupied.
    e.state = "idle";
    e.waiting = true;
    e.timer = Math.max(stun, 0.25);
    e.pull = null;
    e.wander = null;
  }
}

function knockOut(e: EnemyRt) {
  const def = spawnDef(e);
  e.state = "ko";
  e.timer = 0.9;
  e.hp = 0;
  const before = getGame().progress;
  let next;
  if (onCloudIsle()) {
    const zone = e.zone as CloudAreaId;
    const list = cb.cloudZones.defeated[zone] ?? [];
    cb.cloudZones.defeated[zone] = list.includes(e.i) ? list : [...list, e.i];
    next = CLOUD_STAGES.includes(zone as CloudStageId) ? clearCloudStage(before, zone as CloudStageId, cb.cloudZones.defeated[zone] ?? []) : before;
  } else {
    cb.zones = noteDefeat(cb.zones, e.zone as ZoneId, e.i);
    next = clearStage(before, e.zone as ZoneId, cb.zones.defeated[e.zone as ZoneId] ?? []);
  }
  if (next !== before) {
    updateProgress(() => next);
    audio.play("chest");
    toast({ en: "Area Cleared!", ja: "エリア クリア! みちが ひらいた!", tone: "good", icon: "star" }, 2400);
  }
  if (e.zone === "forest1") cb.kos++;
  audio.play("ko");
  // Rewards pop out: coins always, sometimes food or amber.
  const coins = def.coins[0] + Math.floor(Math.random() * (def.coins[1] - def.coins[0] + 1));
  const pieces = Math.min(4, Math.max(1, Math.round(coins / 3)));
  for (let k = 0; k < pieces; k++) dropAt(e.x, e.z, "coin", Math.round(coins / pieces));
  if (Math.random() < def.foodChance) {
    const foods: FoodId[] = ["apples", "fish", "berries", "meat"];
    dropAt(e.x, e.z, "food", 1, foods[Math.floor(Math.random() * foods.length)]);
  }
  if (Math.random() < def.amberChance) dropAt(e.x, e.z, "amber", 1);
  hint("coins");
}

/** Uses normal defeat bookkeeping so stage exits open after the cheat. */
export function debugKillZone() {
  if (!debugEnabled) return;
  const zone = combatZoneAt(rt.player.x, rt.player.z);
  for (const e of cb.enemies) if (e.zone === zone && alive(e)) knockOut(e);
  if (onCloudIsle() && zone === "stormBeacon" && !getGame().progress.act3.beaconDefeated) {
    cb.beacon.power = 0;
    cb.beacon.active = false;
    for (const pylon of cb.beacon.pylons) pylon.phase = "down";
    cb.shots = [];
    hooks.beaconDefeated?.();
  }
}

function dropAt(x: number, z: number, kind: Drop["kind"], value: number, food?: FoodId) {
  const a = Math.random() * Math.PI * 2;
  const v = 1.2 + Math.random() * 1.4;
  cb.drops.push({ id: nextId++, kind, food, value, x, z, y: standY(x, z, getGame().progress.solved) + 0.5, vy: 4 + Math.random() * 1.5, vx: Math.cos(a) * v, vz: Math.sin(a) * v, t0: rt.time, magnet: false });
  if (cb.drops.length > 60) cb.drops.shift();
}

// ------------------------------------------------------------ eating

/** F / tapping a food in the bag: eat it (HP for the player, MP for the friend who loves it). */
export function eat(food: FoodId | null = favouriteFood(getGame().progress.active as CompanionId | null)): boolean {
  const g = getGame();
  if (!act2Live() || g.mode !== "explore" || isRunning() || cb.knockedOut) return false;
  if (!food) {
    toast({ en: "Choose a friend first!", ja: "なかまを えらぼう!", tone: "info" }, 1600);
    return false;
  }
  if ((g.progress.bag[food] ?? 0) < 1) {
    toast({ en: `No ${FOODS[food].word}!`, ja: `${FOODS[food].ja}が ないよ!`, icon: food, tone: "info" }, 1600);
    return false;
  }
  if (!eatHelps(cb.vitals, food)) {
    toast({ en: "You're full!", ja: "HPも MPも いっぱい!", icon: food, tone: "info" }, 1600);
    return false;
  }
  const before = cb.vitals;
  cb.vitals = eatEffect(before, food);
  const gains: string[] = [];
  const hp = cb.vitals.hp - before.hp;
  const friend = FOOD_RESTORE[food].friend;
  const mp = friend ? cb.vitals.mp[friend] - before.mp[friend] : 0;
  if (hp > 0) gains.push(`+${Number(hp.toFixed(2))} HP`);
  if (friend && mp > 0) gains.push(`${MONSTERS[friend].name} +${Number(mp.toFixed(2))} MP`);
  updateProgress((p) => ({ ...p, bag: { ...p.bag, [food]: (p.bag[food] ?? 1) - 1 } }));
  const p = rt.player;
  pushFx("eat", p.x, p.y + 1.6, p.z, 0, 0, 0, 1);
  audio.play("munch");
  rt.player.action = { kind: "cheer", t0: rt.time };
  const effect = gains.join(" · ");
  const word = FOODS[food].word;
  toast({ en: `Yum! ${word[0].toUpperCase()}${word.slice(1)}! ${effect}`, ja: `${FOODS[food].ja}を たべた! · ${effect}`, icon: food, tone: "good" }, 1600);
  learn("eat");
  return true;
}

// ------------------------------------------------------------ tutorial hints

const HINT_OF: Partial<Record<TutorialStep, HintKey>> = { attack: "attack", coins: "coins", special: "special", eat: "eat", switch: "switchAct2" };

/** Show a tutorial hint (once understood it never comes back). */
export function hint(step: TutorialStep) {
  const g = getGame();
  if (g.progress.act2.tutorial.includes(step)) return;
  const key = HINT_OF[step];
  if (key && g.hint !== key) setGame({ hint: key });
}

/** A lesson was understood: mark it and clear its hint. */
export function learn(step: TutorialStep) {
  const g = getGame();
  if (g.progress.act2.tutorial.includes(step)) {
    if (g.hint === HINT_OF[step]) setGame({ hint: null });
    return;
  }
  updateProgress((p) => markTutorial(p, step));
  if (getGame().hint === HINT_OF[step]) setGame({ hint: null });
}

// ------------------------------------------------------------ the frame

export function combatTick(dt: number) {
  if (debugPaused()) return;
  const g = getGame();
  if (g.screen !== "game" || !act2Live()) return;
  const world = onCloudIsle() ? "cloud" : "home";
  if (cb.world !== world) travelCombat();
  const paused = g.journalOpen || g.settingsOpen;
  const p = rt.player;
  // Areas (null on the rope and anywhere south of the cliff).
  const zone = p.climbY === null ? combatZoneAt(p.x, p.z) : null;
  if (world === "cloud" && zone !== cb.cloudZones.current) {
    const mem = cb.cloudZones;
    if (mem.current) {
      mem.leftAt[mem.current] = rt.playTime;
      sendHome(mem.current);
    }
    const next = zone as CloudAreaId | null;
    if (next && rt.playTime - (mem.leftAt[next] ?? -Infinity) >= 12 && (mem.defeated[next]?.length ?? 0) > 0) {
      mem.defeated[next] = [];
      respawnZone(next);
    }
    mem.current = next;
    cb.shots = [];
    cb.fx = [];
    if (next) hooks.cloudEnterZone?.(next);
  } else if (world === "home" && zone !== cb.zones.current) {
    const before = cb.zones.current;
    const { mem, respawn } = changeZone(cb.zones, zone as ZoneId | null, rt.playTime);
    cb.zones = mem;
    if (before) sendHome(before);
    cb.shots = [];
    cb.fx = [];
    if (respawn) respawnZone(respawn);
    if (zone) hooks.enterZone?.(zone as ZoneId);
  }
  updateStance(paused ? 0 : dt);
  if (paused) return;
  if (!cb.knockedOut) cb.vitals = regenMp(cb.vitals, dt);
  // Held J repeats the basic attack.
  if (cb.hold) basicAttack();
  const live = g.mode === "explore" && !isRunning();
  updateBeaconFight(dt, live, zone);
  if (live && zone === "thunderGrotto" && CLOUD_ELECTRIC_PANELS.some(panel =>
    Math.abs(p.x - panel.x) < panel.w / 2 && Math.abs(p.z - panel.z) < panel.d / 2 && electricPanelActive(rt.time, panel.phase))) {
    hurtPlayer(5, 0, 0, 0);
  }
  for (const e of cb.enemies) if (e.zone === zone) updateEnemy(e, dt, live);
  if (live && zone && inHostileZone()) {
    const fighting = cb.enemies.some((e) => e.zone === zone && alive(e) && ["alert", "chase", "windup", "lunge"].includes(e.state));
    audio.startMusic(fighting ? "forest" : "danger");
  }
  separate();
  if (live) updateShots(dt);
  updateDrops(dt);
  // Player knock-back decays.
  cb.knock.x *= Math.exp(-dt * 7);
  cb.knock.z *= Math.exp(-dt * 7);
  cb.fx = cb.fx.filter((f) => rt.time - f.t0 < f.life);
  if (cb.move && rt.time - cb.move.t0 > 1) cb.move = null;
}

function sendHome(zone: CombatZone) {
  for (const e of cb.enemies) {
    if (e.zone !== zone || !alive(e)) continue;
    e.x = e.homeX;
    e.z = e.homeZ;
    e.kx = e.kz = 0;
    e.pull = null;
    e.wander = null;
    e.state = "idle";
    e.waiting = false;
    e.hp = spawnDef(e).hp;
  }
}

/** A fresh crowd in an area: everyone back at home, full health, patrols reset. */
function respawnZone(zone: CombatZone) {
  for (const e of cb.enemies) if (e.zone === zone && e.i < 10000) Object.assign(e, spawnEnemy(e.i, onCloudIsle()));
}

function moveEnemy(e: EnemyRt, tx: number, tz: number, speed: number, dt: number): number {
  const dx = tx - e.x, dz = tz - e.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) return 0;
  const step = Math.min(d, speed * dt);
  return stepTo(e, e.x + (dx / d) * step, e.z + (dz / d) * step, dt, Math.atan2(dx, dz));
}

const moveOut = { x: 0, z: 0 };
function stepTo(e: EnemyRt, nx: number, nz: number, dt: number, face: number | null): number {
  const q = moveCircle(e.x, e.z, nx, nz, ENEMIES[e.kind].radius, gatesOf(getGame().progress), false, undefined, moveOut);
  if (combatZoneAt(q.x, q.z) !== e.zone) return 0;
  const moved = Math.hypot(q.x - e.x, q.z - e.z);
  e.x = q.x;
  e.z = q.z;
  e.step += moved * 2.4;
  if (face !== null) {
    let d = face - e.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    e.yaw += d * Math.min(1, dt * 8);
  }
  return moved;
}

/** Check the whole sight line against scenery, closed gates and area borders.
 * Requiring ground along the line also prevents firing across an unopened gap. */
function rangedClear(e: EnemyRt): boolean {
  if (e.zone !== currentCombatZone() || combatZoneAt(e.x, e.z) !== e.zone || cb.knockedOut) return false;
  const gates = gatesOf(getGame().progress);
  if (!isWalkable(e.x, e.z, gates, ENEMIES[e.kind].radius)) return false;
  const y = standY(e.x, e.z, getGame().progress.solved) + 0.8;
  if (!cb.onScreen?.(e.x, y, e.z)) return false;
  const dx = rt.player.x - e.x, dz = rt.player.z - e.z;
  const count = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.12));
  for (let i = 1; i <= count; i++) {
    const x = e.x + dx * i / count, z = e.z + dz * i / count;
    if (combatZoneAt(x, z) !== e.zone || !isWalkable(x, z, gates, 0.08)) return false;
  }
  return true;
}

function updateRanged(e: EnemyRt, dt: number, distance: number) {
  const def = ENEMIES[e.kind], p = rt.player;
  const dx = (p.x - e.x) / (distance || 1), dz = (p.z - e.z) / (distance || 1);
  // Recovery is a full pause between shots; backing away is still permitted.
  if (distance < 3 && ["chase", "windup", "recover"].includes(e.state)) {
    if (e.state === "windup") { e.state = "chase"; e.timer = 0; }
    stepTo(e, e.x - dx * def.speed * dt, e.z - dz * def.speed * dt, dt, Math.atan2(dx, dz));
    if (e.state === "recover" && e.timer <= 0) e.state = "chase";
    return;
  }
  if (e.state === "recover") {
    if (e.timer <= 0) e.state = "chase";
    return;
  }
  if (e.state === "chase") {
    if (currentCombatZone() !== e.zone || cb.knockedOut || Math.hypot(e.x - e.homeX, e.z - e.homeZ) > def.leash) {
      e.state = "return";
      return;
    }
    if (distance < 6) {
      const step = Math.min(6 - distance, def.speed * dt);
      stepTo(e, e.x - dx * step, e.z - dz * step, dt, Math.atan2(dx, dz));
    } else if (distance > 9) moveEnemy(e, p.x, p.z, def.speed, dt);
    else if (rangedClear(e)) {
      e.state = "windup";
      e.timer = def.windup;
      e.yaw = Math.atan2(dx, dz);
    }
    return;
  }
  if (!rangedClear(e)) { e.state = "chase"; e.timer = 0; return; }
  e.yaw = Math.atan2(dx, dz);
  if (e.timer > 0) {
    // Wind Sprites retain their authored sideways drift while charging.
    // Movement belongs to the creature; the released shot never drifts.
    if (e.kind === "windSprite") {
      const drift = Math.sin(rt.time * 2 + e.i) * 0.65 * dt;
      stepTo(e, e.x - dz * drift, e.z + dx * drift, dt, null);
    }
    return;
  }
  // Sample the player's position now, after the tell, and never steer again.
  e.dx = dx; e.dz = dz;
  const y = standY(e.x, e.z, getGame().progress.solved) + 0.9;
  cb.shots.push({ id: nextId++, shape: e.kind === "windSprite" ? "wind" : e.kind === "raiderShooter" ? "fireball" : "bubble", owner: "puff", hostile: true, source: e.i,
    x: e.x, y, z: e.z, y1: p.y + 0.8, vx: dx * 3.2, vy: (p.y + 0.8 - y) * 3.2 / (distance || 1), vz: dz * 3.2, life: 4, age: 0, radius: 0.42, damage: def.damage, knock: 0, stun: 0, size: 1 });
  e.state = "recover";
  e.timer = def.recover;
  audio.play(e.kind === "windSprite" ? "wind" : e.kind === "raiderShooter" ? "fireball" : "bubble");
}

function updateEnemy(e: EnemyRt, dt: number, live: boolean) {
  if (e.state === "gone") return;
  const def = ENEMIES[e.kind];
  const p = rt.player;
  if (e.state === "ko") {
    // Dizzy spin, a hop, then a poof: it runs off home (no fall, no hurt).
    e.timer -= dt;
    e.yaw += dt * 14;
    if (e.timer <= 0) {
      e.state = "gone";
      effect("poof", e.x, standY(e.x, e.z, getGame().progress.solved) + 0.4, e.z);
      audio.play("poof");
    }
    return;
  }
  if (!live) return;
  // Knock-back slides it along the ground (still blocked by scenery).
  if (Math.abs(e.kx) + Math.abs(e.kz) > 0.05) {
    stepTo(e, e.x + e.kx * dt, e.z + e.kz * dt, dt, null);
    e.kx *= Math.exp(-dt * 6);
    e.kz *= Math.exp(-dt * 6);
  }
  const here = currentCombatZone() === e.zone && !cb.knockedOut;
  const dPlayer = Math.hypot(p.x - e.x, p.z - e.z);
  const dHome = Math.hypot(e.x - e.homeX, e.z - e.homeZ);
  e.timer -= dt;
  if (isRanged(e.kind) && ["chase", "windup", "recover"].includes(e.state)) {
    updateRanged(e, dt, dPlayer);
    return;
  }
  switch (e.state) {
    case "idle": {
      if (e.waiting) {
        if (e.timer > 0) return;
        e.waiting = false;
      }
      if (here && dPlayer < def.notice && hasAttackSlot(e) && (!isRanged(e.kind) || rangedClear(e))) {
        e.state = "alert";
        e.timer = 0.55;
        e.alertT = rt.time;
        audio.play("alert");
        if (e.zone === "forest1") hint("attack");
        if (e.zone === "forest1" && e.kind === "snapjaw" && cb.kos >= 2) hint("special");
        return;
      }
      // Pottering about near home.
      if (!e.wander && e.timer <= 0) {
        const a = Math.random() * Math.PI * 2;
        e.wander = { x: e.homeX + Math.cos(a) * 2, z: e.homeZ + Math.sin(a) * 2 };
      }
      if (e.wander && moveEnemy(e, e.wander.x, e.wander.z, def.speed * 0.35, dt) < 1e-4) {
        e.wander = null;
        e.timer = 1.5 + Math.random() * 2.5;
      }
      return;
    }
    case "alert":
      e.yaw = Math.atan2(p.x - e.x, p.z - e.z);
      if (e.timer <= 0) e.state = "chase";
      return;
    case "chase":
      if (!here || dHome > def.leash) {
        e.state = "return";
        return;
      }
      if (dPlayer < def.windupAt) {
        e.state = "windup";
        e.timer = def.windup;
        e.dx = (p.x - e.x) / (dPlayer || 1);
        e.dz = (p.z - e.z) / (dPlayer || 1);
        e.yaw = Math.atan2(e.dx, e.dz);
        // Crabs keep their armour facing forward while scuttling sideways.
        if (e.kind === "stormCrab") e.yaw += Math.PI / 2;
        return;
      }
      moveEnemy(e, p.x, p.z, def.speed, dt);
      return;
    case "windup":
      if (e.timer <= 0) {
        e.state = "lunge";
        e.timer = e.kind === "raiderDrone" ? 0.48 : e.kind === "thunderBeetle" ? 0.4 : 0.32;
        e.struck = false;
        audio.play("snap");
      }
      return;
    case "lunge": {
      stepTo(e, e.x + e.dx * def.lunge * dt, e.z + e.dz * def.lunge * dt, dt, null);
      const reach = e.kind === "thunderBeetle" ? def.reach + playerRadius() : def.reach * 0.6 + playerRadius() + def.radius * 0.5;
      if (!e.struck && here && Math.hypot(p.x - e.x, p.z - e.z) < reach) {
        e.struck = true;
        hurtPlayer(def.damage, e.dx, e.dz);
      }
      if (e.timer <= 0) {
        e.state = "recover";
        e.timer = def.recover;
      }
      return;
    }
    case "recover":
    case "stun":
      if (e.timer <= 0) e.state = here ? "chase" : "return";
      return;
    case "pulled": {
      const pl = e.pull;
      if (pl) {
        pl.t = Math.min(1, pl.t + dt / 0.4);
        const k = pl.t * pl.t * (3 - 2 * pl.t);
        stepTo(e, pl.fx + (pl.tx - pl.fx) * k, pl.fz + (pl.tz - pl.fz) * k, dt, null);
        if (pl.t >= 1) {
          e.pull = null;
          e.state = "stun";
          e.timer = COMBAT.leafy.special.stun;
        }
      } else e.state = "stun";
      return;
    }
    case "return":
      if (here && dPlayer < def.notice * 0.8 && dHome < def.leash * 0.7 && hasAttackSlot(e) && (!isRanged(e.kind) || rangedClear(e))) {
        e.state = "chase";
        return;
      }
      if (moveEnemy(e, e.homeX, e.homeZ, def.speed * 0.8, dt) < 1e-4 || dHome < 0.3) {
        e.state = "idle";
        e.timer = 1;
        e.hp = spawnDef(e).hp;
      }
      return;
  }
}

/** Enemies never stand inside each other or inside the player. */
function separate() {
  const p = rt.player;
  const pr = playerRadius();
  const list = cb.enemies.filter((e) => alive(e) && e.zone === currentCombatZone());
  for (let a = 0; a < list.length; a++) {
    const e = list[a];
    const r = ENEMIES[e.kind].radius;
    const dx = e.x - p.x, dz = e.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < r + pr && d > 1e-4) stepTo(e, p.x + (dx / d) * (r + pr), p.z + (dz / d) * (r + pr), 0.016, null);
    for (let b = a + 1; b < list.length; b++) {
      const o = list[b];
      const rr = r + ENEMIES[o.kind].radius;
      const ox = o.x - e.x, oz = o.z - e.z;
      const od = Math.hypot(ox, oz);
      if (od < rr && od > 1e-4) {
        const push = (rr - od) / 2;
        stepTo(o, o.x + (ox / od) * push, o.z + (oz / od) * push, 0.016, null);
        stepTo(e, e.x - (ox / od) * push, e.z - (oz / od) * push, 0.016, null);
      }
    }
  }
}

function hurtPlayer(n: number, ux: number, uz: number, knock = 5) {
  if (debugEnabled && useDebug.getState().invincible) return;
  if (rt.time < cb.safeUntil || cb.knockedOut) return;
  cb.vitals = hurt(cb.vitals, n);
  cb.safeUntil = rt.time + 1.1;
  cb.hurtT = rt.time;
  cb.knock.x = ux * knock;
  cb.knock.z = uz * knock;
  audio.play("hurt");
  if (cb.vitals.hp <= 0) {
    cb.knockedOut = true;
    if (onCloudIsle() && cb.beacon.active) resetBeaconFight();
    hooks.knockout?.();
  }
}

/** After the knock-out scene: HP back, everything else kept, the area calm again. */
export function wakeUp() {
  cb.vitals = afterKnockout(cb.vitals);
  cb.knockedOut = false;
  cb.safeUntil = rt.time + 2;
  for (const e of cb.enemies) if (alive(e) && e.state !== "idle") e.state = "return";
}

function updateShots(dt: number) {
  const solved = getGame().progress.solved;
  const gates = gatesOf(getGame().progress);
  for (const s of cb.shots) {
    if (s.life <= 0) continue;
    // Swept substeps stop slow frames skipping thin walls or a target in the path.
    const travel = Math.min(dt, Math.max(0, s.life - s.age));
    const count = Math.max(1, Math.ceil(Math.hypot(s.vx, s.vz) * travel / 0.12));
    const step = travel / count;
    for (let n = 0; n < count && s.life > 0; n++) {
      s.age += step;
      s.x += s.vx * step;
      s.y += (s.vy ?? 0) * step;
      s.z += s.vz * step;
      if (!isWalkable(s.x, s.z, gates, 0.12) || (s.hostile && combatZoneAt(s.x, s.z) !== currentCombatZone())) {
        s.life = 0;
        break;
      }
      if (s.hostile) {
        const p = rt.player;
        const v = Math.hypot(s.vx, s.vz) || 1;
        if (Math.hypot(p.x - s.x, p.z - s.z) < playerRadius() + s.radius) {
          // Ranged shots cause light damage without moving the player.
          hurtPlayer(s.damage, s.vx / v, s.vz / v, 0);
          s.life = 0;
        }
        continue;
      }
      if (cb.beacon.active) {
        const pylon = BEACON_PYLONS.findIndex((p, i) => cb.beacon.pylons[i].phase !== "down" && Math.hypot(p.x - s.x, p.z - s.z) < 1.05 + s.radius);
        if (pylon >= 0) { strikePylon(pylon, s.owner); s.life = 0; continue; }
      }
      for (const e of cb.enemies) {
        if (!alive(e) || e.zone !== currentCombatZone()) continue;
        const r = ENEMIES[e.kind].radius + s.radius;
        if (Math.abs(e.x - s.x) > r || Math.abs(e.z - s.z) > r || Math.hypot(e.x - s.x, e.z - s.z) > r) continue;
        const v = Math.hypot(s.vx, s.vz) || 1;
        hit(e, s.damage, s.knock, s.stun, s.vx / v, s.vz / v, s.owner, s.basic);
        // Big bubbles and big fireballs splash the enemies next to the one they hit.
        if (s.size > 1.3) {
          for (const o of cb.enemies) if (o !== e && alive(o) && o.zone === e.zone && Math.hypot(o.x - e.x, o.z - e.z) < 1.8) hit(o, s.damage * 0.5, s.knock * 0.6, s.stun, (o.x - e.x) / 1.8, (o.z - e.z) / 1.8, s.owner, s.basic);
        }
        s.life = 0;
        break;
      }
      if (s.y < standY(s.x, s.z, solved) + 0.1) s.life = 0;
    }
  }
  cb.shots = cb.shots.filter((s) => s.age < s.life);
}

function updateDrops(dt: number) {
  const p = rt.player;
  const solved = getGame().progress.solved;
  let coins = 0;
  const kept: Drop[] = [];
  for (const d of cb.drops) {
    // Full food stays on the floor, ready to collect after eating or giving some away.
    const full = d.kind === "food" && (getGame().progress.bag[d.food!] ?? 0) >= BAG_MAX;
    if (full) {
      d.magnet = false;
      d.t0 = rt.time;
    }
    const dx = p.x - d.x, dz = p.z - d.z;
    const dist = Math.hypot(dx, dz);
    if (!full && !cb.knockedOut && rt.time - d.t0 > 0.45 && dist < 3.2) d.magnet = true;
    if (d.magnet) {
      const sp = 9 * dt;
      d.x += (dx / (dist || 1)) * Math.min(dist, sp);
      d.z += (dz / (dist || 1)) * Math.min(dist, sp);
      d.y += (p.y + 0.8 - d.y) * Math.min(1, dt * 8);
      if (dist < 0.6) {
        if (collect(d)) {
          if (d.kind === "coin") coins += d.value;
          continue;
        }
        d.magnet = false;
      }
    } else {
      const ground = standY(d.x, d.z, solved) + 0.3;
      const wind = projectileWind(d.x, d.z);
      d.vx += wind.x * dt;
      d.vz += wind.z * dt;
      d.vy -= 14 * dt;
      d.y += d.vy * dt;
      d.x += d.vx * dt;
      d.z += d.vz * dt;
      d.vx *= Math.exp(-dt * 3);
      d.vz *= Math.exp(-dt * 3);
      if (d.y < ground) {
        d.y = ground;
        d.vy = Math.abs(d.vy) > 1.5 ? -d.vy * 0.35 : 0;
      }
    }
    if (rt.time - d.t0 < 60) kept.push(d);
  }
  cb.drops = kept;
  if (coins) {
    updateProgress((pr) => addCoins(pr, coins));
    audio.play("coin");
    learn("coins");
  }
}

/** Pick up one drop (coins are summed by the caller). False when it cannot be taken (full bag). */
function collect(d: Drop): boolean {
  if (d.kind === "coin") return true;
  if (d.kind === "amber") {
    updateProgress((p) => addItem(p, "amber", 1));
    audio.play("sparkle");
    toast({ en: "+1 amber!", ja: "こはくを みつけた! おやつの ざいりょうだよ", icon: "amber", tone: "good" }, 2200);
    return true;
  }
  const food = d.food!;
  const res = addFood(getGame().progress, food, 1);
  if (!res.added) return false;
  updateProgress(() => res.progress);
  audio.play("pick");
  toast({ en: `+1 ${FOODS[food].word}`, ja: FOODS[food].ja, icon: food, tone: "good" }, 1400);
  return true;
}

/** Hidden companions keep their records and inventory but have no world activity. */
export function companionVisible(id: MonsterId): boolean {
  const p = getGame().progress;
  if (id === "lumo") return !p.act2.lumoTaken || ["capture", "escape", "reveal"].includes(rt.act2Scene);
  if (!p.act2.started || !inHostileZone() || rt.act2Scene !== "done") return true;
  return id === p.active || (cb.stance.leaving === id && cb.stance.leaveK > 0);
}
export function stageStatus() {
  const zone = currentZone();
  if (!zone || !ZONES[zone].hostile || getGame().progress.act2.cleared.includes(zone as StageId)) return null;
  const remaining = remainingEnemies(zone, cb.zones.defeated[zone] ?? []);
  const last = remaining === 1 ? cb.enemies.find((e) => e.zone === zone && alive(e)) : null;
  return { zone, remaining, last };
}

export function cloudStageStatus() {
  const zone = currentCloudZone();
  if (!onCloudIsle() || !zone || !CLOUD_STAGES.includes(zone as CloudStageId) || getGame().progress.act3.cleared.includes(zone as CloudStageId)) return null;
  const defeated = cb.cloudZones.defeated[zone] ?? [];
  const remaining = CLOUD_ENEMY_SPAWNS.reduce((n, e, i) => n + Number(e.zone === zone && !defeated.includes(i)), 0);
  const last = remaining === 1 ? cb.enemies.find((e) => e.zone === zone && alive(e)) : null;
  return { zone, remaining, last };
}
