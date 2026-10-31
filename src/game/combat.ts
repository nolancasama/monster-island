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
import { PLAYER_R, blocked, gatesOf, isWalkable, moveCircle, nearestWalkable, standY } from "./world/collision";
import { monsterRootY } from "./ride";
import { audio } from "../audio/audio";
import type { FoodId, MonsterId } from "./types";
import { debugEnabled } from "./debugAccess";
import { debugPaused, useDebug } from "./debugState";
import { blastKnock, bubbleAir, bubbleChain, bubbleProfile, canControl, clearLine, endResistance, fallDamage, fallingAir, forwardTargets, hazardAt, ignite, infernoStep, inCone, oldestTrap, snareDuration, tickBurn, weaponVictims, type Burn, type Control } from "./logic/elements";
import { objectState, secretEvent, tickSecrets, type ElementState, type SecretProgress } from "./logic/secrets";
import { ELEMENT_OBJECTS, EVENT_TAG, secretOf, type ElementEvent, type ElementObject } from "./world/elementObjects";

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
 *   Only Vine Grab selects inside its clear forward cone.
 * - Enemies notice, chase, wind up (visibly), lunge, recover, get knocked
 *   back and stunned, and are knocked out with a dizzy spin and a poof,
 *   dropping coins (and sometimes food or amber). They pause whenever a
 *   conversation, prompt or scene is open.
 * - One HP pool (the player's, also while riding) and each friend's own MP.
 */

export type EnemyState = "idle" | "alert" | "chase" | "windup" | "lunge" | "recover" | "stun" | "ko" | "gone" | "return";
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
  air: number;
  burn: Burn | null;
  control: Control | null;
  resistUntil: number;
  /** Heavy Root Snare slows locomotion without preventing attacks. */
  slowUntil: number;
  fall: { from: number; t0: number } | null;
  /** One victim ledger survives the swing-to-fling transition. */
  flight: { owner: CompanionId; victims: number[]; x: number; z: number; yaw: number; startX: number; startZ: number; bash?: { x: number; z: number } } | null;
  step: number;
}

export interface Shot {
  id: number;
  shape: MoveDef["shape"] | "hostile";
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

export interface Cyclone {
  id: number;
  x: number; z: number;
  ux: number; uz: number;
  age: number;
  stopped: boolean;
  bubbles: number[];
}

export interface BombChain {
  id: number;
  x: number; z: number; t0: number;
  pops: { i: number; depth: number }[];
  victims: number[];
}

/** Short-lived attack shapes for the scene (vines, jets, gusts, bursts, hits). */
export interface Fx {
  id: number;
  kind: "whip" | "pull" | "jet" | "gust" | "burst" | "hit" | "ko" | "eat" | "breath" | "trap" | "vine" | "blast" | "snare" | "cyclone" | "bomb" | "shrug" | "splashKo";
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
    hitT: -10, alertT: -10, air: 0, burn: null, control: null, resistUntil: 0, slowUntil: 0, fall: null, flight: null, step: 0
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
  cyclone: null as Cyclone | null,
  inferno: null as null | { age: number; tick: number },
  bombChain: null as BombChain | null,
  /** Partial environmental steps never enter the save. */
  elementObjects: {} as Record<string, ElementState>,
  drops: [] as Drop[],
  fx: [] as Fx[],
  stance: { friend: null, k: 0, fromX: 0, fromZ: 0, leaving: null, leaveK: 0 } as Stance,
  /** rt.time when each move is ready again. */
  ready: { basic: 0, special: 0 },
  /** The friend's last move (the scene animates it). */
  move: null as null | { friend: CompanionId; kind: "basic" | "special"; t0: number; tx: number; tz: number },
  /** Held J (keyboard) or the held touch button: basic attacks repeat. */
  hold: false,
  /** Keyboard only: touch K always starts a fixed burst. */
  holdK: false,
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
  clearSpecials();
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
  cb.elementObjects = {};
  cb.shots = [];
  cb.drops = [];
  cb.fx = [];
  cb.stance = { friend: null, k: 0, fromX: 0, fromZ: 0, leaving: null, leaveK: 0 };
  cb.ready = { basic: 0, special: 0 };
  cb.move = null;
  cb.hold = false;
  cb.holdK = cb.touchHold = false;
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
  clearSpecials();
  cb.shots = [];
  cb.drops = [];
  cb.fx = [];
  cb.stance = { friend: null, k: 0, fromX: 0, fromZ: 0, leaving: null, leaveK: 0 };
  cb.ready = { basic: 0, special: 0 };
  cb.move = null;
  cb.hold = cb.holdK = cb.touchHold = false;
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
  return (steed() ? 1.18 : 1) * (cb.inferno ? 0.5 : 1);
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

const freeBeaconMoves = () => cb.beacon.active && onCloudIsle() && combatZoneAt(rt.player.x, rt.player.z) === "stormBeacon";

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

function coneTargets(range: number, degrees: number): EnemyRt[] {
  const gates = gatesOf(getGame().progress);
  return forwardTargets(cb.enemies.filter(e => alive(e) && e.zone === currentCombatZone()), rt.player, rt.player.yaw, range, degrees,
    (x, z) => isWalkable(x, z, gates, 0.08));
}

/** Vine Grab alone selects a target, strictly inside its clear forward cone. */
export function pickTarget(range: number): EnemyRt | null {
  return coneTargets(range, 70)[0] ?? null;
}

function upgraded(f: CompanionId) {
  return getGame().progress.act2.upgrades.includes(f);
}

const secretProgress = (): SecretProgress => ({ secrets: getGame().progress.act2.secrets, objects: cb.elementObjects });

function applySecretProgress(next: SecretProgress) {
  const before = getGame().progress.act2.secrets;
  cb.elementObjects = next.objects;
  const found = next.secrets.filter(id => !before.includes(id));
  if (!found.length) return;
  updateProgress(p => ({ ...p, act2: { ...p.act2, secrets: next.secrets } }));
  for (const id of found) {
    const o = ELEMENT_OBJECTS.find(o => o.id === id)!;
    effect("sparkle", o.x, standY(o.x, o.z, getGame().progress.solved) + 1, o.z);
    audio.play("sparkle");
    toast({ en: "Secret found!", ja: "ひみつを みつけた!", tone: "good" }, 2500);
  }
}

const OBJECT_EVENT: Partial<Record<MoveDef["shape"], ElementEvent>> = {
  breath: "burn", inferno: "burn", trap: "lift", bomb: "bomb", grab: "grab", snare: "grab", blast: "wind", cyclone: "wind"
};

/** Every move reuses its area/path test here; tags and responses own behaviour.
 * A grab supplies the nearest enemy distance and selects at most one object. */
function dispatchObjects(shape: MoveDef["shape"], contains: (o: ElementObject) => boolean, nearest = Infinity): ElementObject | null {
  const event = OBJECT_EVENT[shape];
  if (!event) return null;
  const p = rt.player, progress = secretProgress();
  const objects = ELEMENT_OBJECTS.filter(o => o.world === cb.world && !progress.secrets.includes(secretOf(o)) && o.tags.includes(EVENT_TAG[event]) && o.on?.[event] && contains(o))
    .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
  let selected: ElementObject | null = null;
  for (const o of objects) {
    if (shape === "grab" && Math.hypot(o.x - p.x, o.z - p.z) >= nearest) continue;
    const before = secretProgress();
    const next = secretEvent(o.id, event, before);
    if (next === before) continue;
    applySecretProgress(next);
    selected = o;
    if (shape === "grab" || shape === "trap") break;
  }
  return selected;
}

/** Read-only semantic snapshot shared by the browser harness and E4b. */
export function elementObjectStates() {
  const p = secretProgress();
  return ELEMENT_OBJECTS.map(o => ({ id: o.id, world: o.world, x: o.x, z: o.z, ...objectState(o, p) }));
}

function objectCone(range: number, degrees: number) {
  const gates = gatesOf(getGame().progress), p = rt.player;
  return (o: ElementObject) => {
    if (!inCone(p, p.yaw, o, range, degrees)) return false;
    // Stop the ray at the near rim: a solid target must not occlude itself.
    const dx = o.x - p.x, dz = o.z - p.z, d = Math.hypot(dx, dz);
    const k = d > 0 ? Math.max(0, d - o.r - .1) / d : 0;
    return clearLine(p, { x: p.x + dx * k, z: p.z + dz * k }, (x, z) => isWalkable(x, z, gates, .08));
  };
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

function aimAt(range: number): { x: number; z: number } {
  const p = rt.player;
  return { x: p.x + Math.sin(p.yaw) * range, z: p.z + Math.cos(p.yaw) * range };
}

/** J: the active friend's basic attack (free; repeats while held). */
export function basicAttack(): boolean {
  const f = friendNow();
  if (!f || !canFight() || rt.time < cb.ready.basic) return false;
  const move = COMBAT[f].basic;
  const up = upgraded(f);
  const range = move.range * (up && (f === "ember" || f === "puff") ? COMBAT[f].upgrade.size : 1);
  const aim = aimAt(range);
  cb.ready.basic = rt.time + move.cooldown;
  cb.move = { friend: f, kind: "basic", t0: rt.time, tx: aim.x, tz: aim.z };
  const o = originOf(f);
  const yaw = rt.player.yaw, ux = Math.sin(yaw), uz = Math.cos(yaw);
  if (cb.beacon.active) cancelBeaconGust(cb.beacon, f, { x: ux, z: uz });
  if (move.shape === "trap") {
    const life = move.range / move.speed!;
    // Fixed ground-relative slope, sampled only at launch; never target an enemy.
    const y1 = standY(aim.x, aim.z, getGame().progress.solved) + 0.55;
    cb.shots.push({ id: nextId++, shape: "trap", owner: f, x: o.x, y: o.y, z: o.z, y1,
      vx: ux * move.speed!, vy: (y1 - o.y) / life, vz: uz * move.speed!, life, age: 0,
      radius: move.radius, damage: 0, knock: 0, stun: 0, size: 1, basic: true });
    pushFx("trap", o.x, o.y, o.z, ux, uz, yaw, 0.8);
    audio.play("bubble");
  } else if (move.shape === "breath") {
    pushFx("breath", o.x, o.y, o.z, ux, uz, yaw, range);
    hitBeaconShape(f, range, ux, uz, "cone", 50);
    dispatchObjects(move.shape, objectCone(range, 50));
    for (const e of coneTargets(range, 50)) {
      hit(e, move.damage, 0, 0, ux, uz, f, true);
      if (alive(e)) e.burn = ignite(e.burn, rt.time);
    }
    audio.play("fireball");
  } else if (move.shape === "grab") {
    pushFx("vine", o.x, o.y, o.z, ux, uz, yaw, range);
    hitBeaconShape(f, range, ux, uz, "cone", 70);
    const targets = coneTargets(range, 70);
    const enemy = targets[0];
    const grabbedObject = dispatchObjects(move.shape, objectCone(range, 70), enemy ? Math.hypot(enemy.x - rt.player.x, enemy.z - rt.player.z) : Infinity);
    const pair = up && !grabbedObject ? targets.filter(e => ENEMIES[e.kind].weightClass !== "heavy").slice(0, 2) : [];
    if (pair.length === 2) {
      const centre = { x: (pair[0].x + pair[1].x) / 2, z: (pair[0].z + pair[1].z) / 2 };
      for (const e of pair) {
        if (startControl(e, "grabbed", 0.35, f)) e.flight!.bash = centre;
        else hit(e, move.damage, 0, 0, ux, uz, f, true);
      }
    } else {
      const e = grabbedObject ? null : enemy;
      if (e) {
        hit(e, move.damage, 0, 0, ux, uz, f, true);
        if (ENEMIES[e.kind].weightClass === "heavy") {
          const dx = rt.player.x - e.x, dz = rt.player.z - e.z, d = Math.hypot(dx, dz) || 1;
          displaceEnemy(e, e.x + dx / d, e.z + dz / d);
        }
        else if (!startControl(e, "grabbed", 0.45, f)) { e.kx += ux * 5; e.kz += uz * 5; }
      }
    }
    audio.play("whip");
  } else if (move.shape === "blast") {
    const degrees = up ? 80 : 60;
    pushFx("blast", o.x, o.y, o.z, ux, uz, yaw, range);
    hitBeaconShape(f, range, ux, uz, "cone", degrees);
    dispatchObjects(move.shape, objectCone(range, degrees));
    for (const e of coneTargets(range, degrees)) {
      hit(e, move.damage, 0, 0, ux, uz, f, true);
      if (!alive(e)) continue;
      if (e.control?.kind === "trapped") pushBubble(e, ux, uz);
      else {
        const knock = blastKnock(ENEMIES[e.kind].weightClass);
        startControl(e, "flung", 0.6, f);
        if (e.control?.kind !== "snared") { e.kx = ux * knock; e.kz = uz * knock; }
      }
    }
    audio.play("whoosh");
  }
  return true;
}

/** K: the active friend's special (costs MP; a short cooldown). */
export function specialAttack(): boolean {
  const f = friendNow();
  if (!f || !canFight() || rt.time < cb.ready.special || cb.inferno) return false;
  const move = COMBAT[f].special;
  const spent = spendMp(cb.vitals, f, freeBeaconMoves() ? 0 : move.cost);
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
  const aim = aimAt(move.range);
  const yaw = p.yaw;
  const ux = Math.sin(yaw), uz = Math.cos(yaw);
  if (cb.beacon.active) {
    cancelBeaconGust(cb.beacon, f, { x: ux, z: uz });
  }
  cb.move = { friend: f, kind: "special", t0: rt.time, tx: aim.x, tz: aim.z };
  const o = originOf(f);
  switch (move.shape) {
    case "bomb": {
      const life = move.range / move.speed!;
      cb.shots.push({ id: nextId++, shape: "bomb", owner: f, ...o, y1: o.y, vx: ux * move.speed!, vy: 0, vz: uz * move.speed!,
        life, age: 0, radius: 0.8, damage: move.damage, knock: 0, stun: 0, size: move.radius });
      audio.play("splash");
      break;
    }
    case "inferno":
      cb.inferno = { age: 0, tick: 0.25 };
      infernoTick();
      audio.play("burst");
      break;
    case "snare": {
      const centre = moveCircle(p.x, p.z, aim.x, aim.z, 0.08, gatesOf(getGame().progress));
      pushFx("snare", centre.x, standY(centre.x, centre.z, getGame().progress.solved) + 0.5, centre.z, 0, 0, yaw, move.radius);
      hitBeaconShape(f, move.radius, 0, 0, "circle", 0, { ...p, ...centre });
      dispatchObjects(move.shape, o => Math.hypot(o.x - centre.x, o.z - centre.z) <= move.radius + o.r);
      for (const e of cb.enemies) {
        if (!alive(e) || e.zone !== currentCombatZone() || Math.hypot(e.x - centre.x, e.z - centre.z) > move.radius) continue;
        hit(e, move.damage, 0, 0, ux, uz, f);
        if (!alive(e)) continue;
        // Even a resisted snare cancels a ranged wind-up.
        if (isRanged(e.kind) && e.state === "windup") { e.state = "recover"; e.timer = ENEMIES[e.kind].recover; }
        const weight = ENEMIES[e.kind].weightClass;
        if (weight === "heavy") {
          if (e.slowUntil <= rt.time && canControl(weight, "snared", rt.time, e.resistUntil, e.control)) e.slowUntil = rt.time + snareDuration(weight);
          else pushFx("shrug", e.x, standY(e.x, e.z, getGame().progress.solved) + 0.8, e.z, 0, 0, 0, 1);
        } else startControl(e, "snared", snareDuration(weight), f);
      }
      audio.play("vines");
      break;
    }
    case "cyclone": {
      endCyclone();
      const centre = moveCircle(p.x, p.z, p.x + ux * 2, p.z + uz * 2, 0.08, gatesOf(getGame().progress));
      cb.cyclone = { id: nextId++, ...centre, ux, uz, age: 0, stopped: Math.hypot(centre.x - p.x - ux * 2, centre.z - p.z - uz * 2) > 0.01, bubbles: [] };
      updateCyclone(0);
      audio.play("wind");
      break;
    }
  }
  learn("special");
  return true;
}

function clearSpecials() {
  cb.inferno = null;
  cb.cyclone = null;
  cb.bombChain = null;
}

function infernoTick() {
  const move = COMBAT.ember.special, p = rt.player;
  const range = move.range * (upgraded("ember") ? COMBAT.ember.upgrade.size : 1);
  const ux = Math.sin(p.yaw), uz = Math.cos(p.yaw);
  hitBeaconShape("ember", range, ux, uz, "cone", 80);
  dispatchObjects(move.shape, objectCone(range, 80));
  for (const e of coneTargets(range, 80)) {
    hit(e, move.damage, 0, 0, ux, uz, "ember");
    if (alive(e)) e.burn = ignite(e.burn, rt.time);
  }
}

function updateInferno(dt: number) {
  const fire = cb.inferno;
  if (!fire) return;
  if (friendNow() !== "ember" || cb.knockedOut) { cb.inferno = null; return; }
  const step = infernoStep(fire.age, dt, cb.holdK, cb.vitals.mp.ember, freeBeaconMoves());
  cb.vitals.mp.ember = Math.max(0, cb.vitals.mp.ember - step.drain);
  fire.age = step.age;
  while (fire.tick <= fire.age + 1e-9 && fire.tick < 3 && (!step.done || fire.tick < fire.age - 1e-9)) {
    infernoTick();
    fire.tick += 0.25;
  }
  if (step.done) cb.inferno = null;
}

function detonateBomb(s: Shot) {
  s.life = 0;
  const move = COMBAT.bubbo.special;
  const enemies = cb.enemies.filter(e => alive(e) && e.zone === currentCombatZone());
  const chain = bubbleChain(enemies.map(e => ({ i: e.i, x: e.x, z: e.z, trapped: e.control?.kind === "trapped" })), s, move.radius);
  cb.bombChain = { id: nextId++, x: s.x, z: s.z, t0: rt.time, ...chain };
  pushFx("bomb", s.x, s.y, s.z, 0, 0, 0, move.radius);
  hitBeaconShape("bubbo", move.radius, 0, 0, "circle", 0, { ...rt.player, x: s.x, z: s.z });
  dispatchObjects("bomb", o => Math.hypot(o.x - s.x, o.z - s.z) <= move.radius + o.r);
  // Pop first: fall damage samples current air, before explosion knock can move it.
  for (const pop of chain.pops) {
    const e = enemies.find(e => e.i === pop.i)!;
    pushFx("bomb", e.x, standY(e.x, e.z, getGame().progress.solved) + e.air, e.z, 0, 0, 0, 2);
    popBubble(e);
  }
  for (const e of enemies) {
    if (Math.hypot(e.x - s.x, e.z - s.z) <= move.radius) {
      const dx = e.x - s.x, dz = e.z - s.z, d = Math.hypot(dx, dz);
      const ux = d > 1e-6 ? dx / d : s.vx / (Math.hypot(s.vx, s.vz) || 1);
      const uz = d > 1e-6 ? dz / d : s.vz / (Math.hypot(s.vx, s.vz) || 1);
      hit(e, move.damage, 0, 0, ux, uz, "bubbo");
      if (alive(e) && e.control?.kind !== "snared") { e.kx += ux * move.knock; e.kz += uz * move.knock; }
    }
    if (chain.victims.includes(e.i)) hit(e, 8, 0, 0, 0, 0, "bubbo");
  }
  audio.play("splash");
}

function endCyclone() {
  const c = cb.cyclone;
  if (!c) return;
  cb.cyclone = null;
  for (const e of cb.enemies) {
    if (!alive(e)) continue;
    if (c.bubbles.includes(e.i)) popBubble(e);
    if (e.control?.kind !== "carried" || e.control.source !== c.id) continue;
    const dx = e.x - c.x, dz = e.z - c.z, d = Math.hypot(dx, dz) || 1;
    // Continue the carry into a fling; resistance starts when that fling ends.
    e.control = { ...e.control, kind: "flung", t0: rt.time, until: rt.time + 0.6 };
    const speed = 4 * 1.5 / (1 - Math.exp(-1.5 * 0.6));
    e.kx = dx / d * speed; e.kz = dz / d * speed;
  }
}

function reflectShot(s: Shot) {
  const c = cb.cyclone;
  if (!c || !s.hostile || Math.hypot(s.x - c.x, s.z - c.z) > 1.6) return;
  s.hostile = false;
  s.owner = "puff";
  s.source = undefined;
  s.basic = false;
  s.vx = -s.vx; s.vz = -s.vz; s.vy = -(s.vy ?? 0);
  s.damage = 6;
}

function updateCyclone(dt: number) {
  const c = cb.cyclone;
  if (!c) return;
  const elapsed = Math.min(dt, Math.max(0, 4 - c.age));
  c.age += elapsed;
  const gates = gatesOf(getGame().progress);
  if (!c.stopped) {
    const count = Math.max(1, Math.ceil(1.8 * elapsed / 0.1));
    for (let n = 0; n < count; n++) {
      const x = c.x + c.ux * 1.8 * elapsed / count, z = c.z + c.uz * 1.8 * elapsed / count;
      if (!isWalkable(x, z, gates, 0.08)) { c.stopped = true; break; }
      c.x = x; c.z = z;
    }
  }
  hitBeaconShape("puff", 1.4, 0, 0, "circle", 0, { ...rt.player, x: c.x, z: c.z });
  dispatchObjects("cyclone", o => Math.hypot(o.x - c.x, o.z - c.z) <= 1.4 + o.r);
  const enemies = cb.enemies.filter(e => alive(e) && e.zone === currentCombatZone());
  let carried = enemies.filter(e => e.control?.kind === "carried" && e.control.source === c.id).length;
  c.bubbles = c.bubbles.filter(i => enemies.some(e => e.i === i && e.control?.kind === "trapped"));
  for (const e of enemies) {
    const dx = e.x - c.x, dz = e.z - c.z, d = Math.hypot(dx, dz);
    if (e.control?.kind === "trapped" && d <= 1.6 && !c.bubbles.includes(e.i)) c.bubbles.push(e.i);
    if (c.bubbles.includes(e.i)) continue;
    if (d > 1.4 || e.control?.kind === "carried") continue;
    const weight = ENEMIES[e.kind].weightClass;
    if (weight === "light") {
      if (carried < 3 && startControl(e, "carried", 4 - c.age, "puff")) {
        e.control!.source = c.id;
        e.air = 1.2;
        carried++;
      }
    } else {
      if (weight === "medium" && elapsed > 0) hit(e, COMBAT.puff.special.damage * elapsed, 0, 0, 0, 0, "puff");
      if (alive(e) && e.control?.kind !== "snared") {
        const ux = d > 1e-6 ? dx / d : c.ux, uz = d > 1e-6 ? dz / d : c.uz;
        displaceEnemy(e, e.x + ux * (weight === "heavy" ? 1 : 4) * elapsed, e.z + uz * (weight === "heavy" ? 1 : 4) * elapsed);
      }
    }
  }
  let slot = 0;
  for (const e of enemies) {
    const bubble = c.bubbles.includes(e.i) && e.control?.kind === "trapped";
    if (!bubble && !(e.control?.kind === "carried" && e.control.source === c.id)) continue;
    const angle = c.age * 4 + slot++ * Math.PI * 2 / 3;
    if (bubble) {
      // Preserve the trapped bubble and its current air throughout the carry.
      e.control!.t0 += elapsed; e.control!.until += elapsed;
      if (c.stopped) { popBubble(e); continue; }
    }
    const clear = displaceEnemy(e, c.x + Math.sin(angle) * 0.8, c.z + Math.cos(angle) * 0.8);
    if (!clear) { if (bubble) popBubble(e); else wallImpact(e, 0); }
  }
  for (const s of cb.shots) if (s.life > 0) reflectShot(s);
  if (c.age >= 4 - 1e-9) endCyclone();
}

function endControl(e: EnemyRt) {
  if (!e.control) return;
  if (e.air > 0) e.fall = { from: e.air, t0: rt.time };
  e.control = null;
  e.flight = null;
  e.kx = e.kz = 0;
  e.timer = 0;
  e.resistUntil = endResistance(ENEMIES[e.kind].weightClass, rt.time);
}

function startControl(e: EnemyRt, kind: Control["kind"], duration: number, owner: CompanionId, peak?: number): boolean {
  if (!alive(e)) return false;
  if ((e.control?.kind === "snared" && kind !== "snared") || !canControl(ENEMIES[e.kind].weightClass, kind, rt.time, e.resistUntil, e.control)) {
    pushFx("shrug", e.x, standY(e.x, e.z, getGame().progress.solved) + 0.8, e.z, 0, 0, 0, 1);
    return false;
  }
  e.control = { kind, t0: rt.time, until: rt.time + duration, peak, source: nextId++ };
  e.flight = { owner, victims: [], x: rt.player.x, z: rt.player.z, yaw: rt.player.yaw, startX: e.x, startZ: e.z };
  e.fall = null;
  if (kind !== "flung") e.kx = e.kz = 0;
  if ((e.state === "idle" || e.state === "return") && !hasAttackSlot(e)) e.waiting = true;
  if (!e.waiting) e.state = "stun";
  e.timer = duration;
  e.wander = null;
  return true;
}

function trapEnemy(e: EnemyRt) {
  const profile = bubbleProfile(ENEMIES[e.kind].weightClass, upgraded("bubbo"), e.x, e.z, onCloudIsle());
  if (!profile) {
    pushFx("shrug", e.x, standY(e.x, e.z, getGame().progress.solved) + 0.8, e.z, 0, 0, 0, 1);
    return;
  }
  // Check before evicting: a resisted shot must not pop another enemy's trap.
  if (!canControl(ENEMIES[e.kind].weightClass, "trapped", rt.time, e.resistUntil, e.control)) {
    startControl(e, "trapped", profile.duration, "bubbo", profile.peak);
    return;
  }
  const oldest = oldestTrap(cb.enemies.filter(alive));
  if (oldest && oldest !== e) popBubble(oldest);
  if (e.control?.kind === "trapped") popBubble(e);
  if (startControl(e, "trapped", profile.duration, "bubbo", profile.peak)) {
    e.air = 0;
    pushFx("trap", e.x, standY(e.x, e.z, getGame().progress.solved) + 0.8, e.z, 0, 0, 0, 1);
  }
}

function popBubble(e: EnemyRt) {
  if (e.control?.kind !== "trapped") return;
  const air = e.air;
  endControl(e);
  e.fall = { from: air, t0: rt.time };
  hit(e, fallDamage(air), 0, 0, 0, 0, "bubbo", true);
  pushFx("trap", e.x, standY(e.x, e.z, getGame().progress.solved) + air, e.z, 0, 0, 0, 1);
  audio.play("splash");
}

/** Forced motion samples centres for hazards, bodies for solids. No sliding
 * around a wall, and no inference that every unwalkable edge is a hazard. */
function displaceEnemy(e: EnemyRt, x: number, z: number, collision?: () => boolean | void): boolean {
  const progress = getGame().progress, gates = gatesOf(progress), radius = ENEMIES[e.kind].radius;
  const solved = cb.world === "cloud" ? progress.act3.puzzles : progress.solved;
  const fromX = e.x, fromZ = e.z, count = Math.max(1, Math.ceil(Math.hypot(x - fromX, z - fromZ) / 0.1));
  for (let i = 1; i <= count && alive(e); i++) {
    const nx = fromX + (x - fromX) * i / count, nz = fromZ + (z - fromZ) * i / count;
    const hazard = hazardAt(nx, nz, cb.world, solved);
    if (blocked(nx, nz, radius, gates) || (!hazard && !isWalkable(nx, nz, gates, 0))) return false;
    e.x = nx; e.z = nz;
    if (hazard) {
      pushFx("splashKo", nx, standY(nx, nz, getGame().progress.solved) + e.air, nz, 0, 0, 0, 1);
      knockOut(e);
      return true;
    }
    if (collision?.() === false) return true;
  }
  return true;
}

function pushBubble(e: EnemyRt, ux: number, uz: number) {
  const clear = displaceEnemy(e, e.x + ux * 4, e.z + uz * 4, () => {
    if (e.control?.kind !== "trapped") return;
    const other = cb.enemies.find(o => o !== e && alive(o) && o.zone === e.zone && Math.hypot(e.x - o.x, e.z - o.z) < ENEMIES[e.kind].radius + ENEMIES[o.kind].radius);
    if (other) { hit(other, 8, 0, 0, ux, uz, "puff"); popBubble(e); return false; }
  });
  if (!clear) popBubble(e);
}

function weaponCollisions(e: EnemyRt) {
  const flight = e.flight;
  if (!flight || !alive(e)) return;
  for (const o of cb.enemies) {
    if (o === e || !alive(o) || o.zone !== e.zone || Math.hypot(e.x - o.x, e.z - o.z) > ENEMIES[e.kind].radius + ENEMIES[o.kind].radius || Math.abs(e.air - o.air) > 1) continue;
    const victims = weaponVictims(flight.victims, o.i);
    if (!victims) continue;
    flight.victims = victims;
    const dx = o.x - e.x, dz = o.z - e.z, d = Math.hypot(dx, dz) || 1;
    hit(o, 10, 0, 0, dx / d, dz / d, flight.owner);
    if (alive(o) && o.control?.kind !== "snared") { o.kx += dx / d * 5; o.kz += dz / d * 5; }
    hit(e, 6, 0, 0, 0, 0, flight.owner);
    if (!alive(e)) break;
  }
}

function wallImpact(e: EnemyRt, speed: number) {
  const owner = e.flight?.owner ?? "puff";
  const swinging = e.control?.kind === "grabbed";
  endControl(e);
  e.kx = e.kz = 0;
  if (swinging || speed > 3) hit(e, 8, 0, swinging ? 0 : 0.6, 0, 0, owner);
}

/** Returns true while scripted control/falling owns the enemy's turn. */
function updateElements(e: EnemyRt, dt: number): boolean {
  if (e.slowUntil > 0 && rt.time >= e.slowUntil) {
    e.resistUntil = endResistance(ENEMIES[e.kind].weightClass, e.slowUntil);
    e.slowUntil = 0;
  }
  const burn = tickBurn(e.burn, rt.time, upgraded("ember") ? 1.5 : 1);
  e.burn = burn.burn;
  if (burn.damage) hit(e, burn.damage, 0, 0, 0, 0, "ember");
  if (!alive(e)) return true;
  const c = e.control, flight = e.flight;
  if (c?.kind === "trapped") {
    if (cb.cyclone?.bubbles.includes(e.i)) return true;
    e.air = bubbleAir(c, rt.time);
    if (rt.time >= c.until) popBubble(e);
    return true;
  }
  if (c?.kind === "grabbed" && flight) {
    const t = Math.min(1, (rt.time - c.t0) / (c.until - c.t0));
    if (flight.bash) {
      const x = flight.startX + (flight.bash.x - flight.startX) * t, z = flight.startZ + (flight.bash.z - flight.startZ) * t;
      if (!displaceEnemy(e, x, z)) { wallImpact(e, 5); return true; }
      if (t >= 1) { endControl(e); hit(e, 14, 0, 1, Math.sin(flight.yaw), Math.cos(flight.yaw), flight.owner, true); }
    } else {
      const angle = flight.yaw - 70 * Math.PI / 180 + t * 140 * Math.PI / 180;
      const x = flight.x + Math.sin(angle) * 2.2, z = flight.z + Math.cos(angle) * 2.2;
      if (!displaceEnemy(e, x, z, () => weaponCollisions(e))) { wallImpact(e, 5); return true; }
      if (alive(e) && t >= 1) {
        e.control = { ...c, kind: "flung", t0: rt.time, until: rt.time + 0.5 };
        e.kx = Math.cos(angle) * 5; e.kz = -Math.sin(angle) * 5;
      }
    }
    return true;
  }
  if (c?.kind === "snared") { e.kx = e.kz = 0; if (rt.time >= c.until) endControl(e); return true; }
  if (c?.kind === "carried") return true;
  if (Math.abs(e.kx) + Math.abs(e.kz) > 0.05) {
    const speed = Math.hypot(e.kx, e.kz);
    if (!displaceEnemy(e, e.x + e.kx * dt, e.z + e.kz * dt, c?.kind === "flung" ? () => weaponCollisions(e) : undefined)) wallImpact(e, speed);
    e.kx *= Math.exp(-dt * (c?.kind === "flung" ? 1.5 : 6));
    e.kz *= Math.exp(-dt * (c?.kind === "flung" ? 1.5 : 6));
  }
  if (!alive(e)) return true;
  if (c?.kind === "flung") {
    if (rt.time >= c.until) endControl(e);
    return true;
  }
  if (e.fall) {
    e.air = fallingAir(e.fall.from, rt.time - e.fall.t0);
    if (e.air <= 0) e.fall = null;
    return true;
  }
  return false;
}

function pushFx(kind: Fx["kind"], x: number, y: number, z: number, ax: number, az: number, yaw: number, size: number) {
  const life = kind === "breath" || kind === "hit" ? 0.35 : kind === "vine" ? 0.45 : kind === "ko" ? 0.9 : kind === "eat" ? 1 : 0.6;
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

function hitBeaconShape(friend: CompanionId, range: number, ux: number, uz: number, shape: "cone" | "circle", degrees = 70, centre = rt.player) {
  if (!cb.beacon.active) return;
  for (let i = 0; i < BEACON_PYLONS.length; i++) {
    if (cb.beacon.pylons[i].phase === "down") continue;
    const q = BEACON_PYLONS[i];
    if (shape === "circle" ? Math.hypot(q.x - centre.x, q.z - centre.z) > range + 1
      : !inCone(rt.player, Math.atan2(ux, uz), q, range + 1, degrees)) continue;
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
  if (e.control?.kind !== "snared") {
    e.kx += ux * knock * def.weight * 2.2;
    e.kz += uz * knock * def.weight * 2.2;
  }
  pushFx("hit", e.x, standY(e.x, e.z, getGame().progress.solved) + 0.6, e.z, 0, 0, 0, 1);
  audio.play("hit");
  learn("attack");
  if (e.hp <= 0) {
    knockOut(e);
    return;
  }
  if (stun > 0 && !e.control) {
    e.state = "stun";
    e.timer = Math.max(stun, 0.25);
  }
  if ((onCloudIsle() && awakeEnemies(e.zone) > 4) || (isRanged(e.kind) && awakeRanged(e.zone) > 2)
    || (["idle", "return"].includes(e.state) && !hasAttackSlot(e))) {
    // Damage and KO always count, even when all four attack slots are occupied.
    e.state = "idle";
    e.waiting = true;
    e.timer = Math.max(stun, 0.25);
    e.wander = null;
  }
}

function knockOut(e: EnemyRt) {
  const def = spawnDef(e);
  e.state = "ko";
  e.timer = 0.9;
  e.hp = 0;
  e.control = null;
  e.burn = null;
  e.flight = null;
  e.fall = null;
  e.air = 0;
  e.slowUntil = 0;
  e.kx = e.kz = 0;
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
    clearSpecials();
    cb.shots = [];
    cb.fx = [];
    if (next) hooks.cloudEnterZone?.(next);
  } else if (world === "home" && zone !== cb.zones.current) {
    const before = cb.zones.current;
    const { mem, respawn } = changeZone(cb.zones, zone as ZoneId | null, rt.playTime);
    cb.zones = mem;
    if (before) sendHome(before);
    clearSpecials();
    cb.shots = [];
    cb.fx = [];
    if (respawn) respawnZone(respawn);
    if (zone) hooks.enterZone?.(zone as ZoneId);
  }
  updateStance(paused ? 0 : dt);
  if (paused) {
    for (const e of cb.enemies) pauseElements(e, dt);
    return;
  }
  if (!cb.knockedOut) cb.vitals = regenMp(cb.vitals, dt);
  // Held J repeats the basic attack.
  if (cb.hold) basicAttack();
  const live = g.mode === "explore" && !isRunning();
  updateBeaconFight(dt, live, zone);
  if (live && !cb.knockedOut) {
    if (world === "home") applySecretProgress(tickSecrets(secretProgress(), dt, p));
    updateInferno(dt);
    updateCyclone(dt);
  }
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
    e.air = 0;
    e.burn = e.control = e.flight = e.fall = null;
    e.resistUntil = 0;
    e.slowUntil = 0;
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
  if (e.slowUntil > rt.time) { nx = e.x + (nx - e.x) * 0.4; nz = e.z + (nz - e.z) * 0.4; }
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
  cb.shots.push({ id: nextId++, shape: "hostile", owner: "puff", hostile: true, source: e.i,
    x: e.x, y, z: e.z, y1: p.y + 0.8, vx: dx * 3.2, vy: (p.y + 0.8 - y) * 3.2 / (distance || 1), vz: dz * 3.2, life: 4, age: 0, radius: 0.42, damage: def.damage, knock: 0, stun: 0, size: 1 });
  e.state = "recover";
  e.timer = def.recover;
  audio.play(e.kind === "windSprite" ? "wind" : e.kind === "raiderShooter" ? "fireball" : "bubble");
}

function pauseElements(e: EnemyRt, dt: number) {
  if (e.burn) { e.burn.until += dt; e.burn.tick += dt; }
  if (e.control) { e.control.t0 += dt; e.control.until += dt; }
  if (e.fall) e.fall.t0 += dt;
  e.resistUntil += dt;
  if (e.slowUntil > 0) e.slowUntil += dt;
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
  if (!live) { pauseElements(e, dt); return; }
  if (updateElements(e, dt)) return;
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
    if (e.control || e.fall) continue;
    const r = ENEMIES[e.kind].radius;
    const dx = e.x - p.x, dz = e.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < r + pr && d > 1e-4) stepTo(e, p.x + (dx / d) * (r + pr), p.z + (dz / d) * (r + pr), 0.016, null);
    for (let b = a + 1; b < list.length; b++) {
      const o = list[b];
      if (o.control || o.fall) continue;
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
      reflectShot(s);
      if (!s.hostile && s.shape !== "hostile" && dispatchObjects(s.shape, o => Math.hypot(o.x - s.x, o.z - s.z) <= o.r + s.radius)) {
        if (s.shape === "bomb") detonateBomb(s);
        s.life = 0;
        break;
      }
      if (!isWalkable(s.x, s.z, gates, 0.12) || (s.hostile && combatZoneAt(s.x, s.z) !== currentCombatZone())) {
        if (s.shape === "bomb") detonateBomb(s);
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
        if (pylon >= 0) {
          if (s.shape === "bomb") detonateBomb(s);
          else strikePylon(pylon, s.owner);
          s.life = 0; continue;
        }
      }
      for (const e of cb.enemies) {
        if (!alive(e) || e.zone !== currentCombatZone()) continue;
        const r = ENEMIES[e.kind].radius + s.radius;
        if (Math.abs(e.x - s.x) > r || Math.abs(e.z - s.z) > r || Math.hypot(e.x - s.x, e.z - s.z) > r) continue;
        const v = Math.hypot(s.vx, s.vz) || 1;
        if (s.shape === "trap") {
          hit(e, s.damage, s.knock, s.stun, s.vx / v, s.vz / v, s.owner, s.basic);
          trapEnemy(e);
        } else if (s.shape === "bomb") detonateBomb(s);
        else hit(e, s.damage, s.knock, s.stun, s.vx / v, s.vz / v, s.owner, s.basic);
        s.life = 0;
        break;
      }
      if (s.y < standY(s.x, s.z, solved) + 0.1) {
        if (s.shape === "bomb" && s.life > 0) detonateBomb(s);
        s.life = 0;
      }
    }
    if (s.shape === "bomb" && s.life > 0 && s.age >= s.life - 1e-9) {
      detonateBomb(s);
      s.life = 0;
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
