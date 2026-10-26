import type { FoodId, MonsterId, ObstacleId, Vec2, Vec3 } from "./types";
import { MONSTERS, MONSTER_ORDER } from "./data/monsters";
import { MAPLE, SPAWN } from "./world/island";

/**
 * Mutable per-frame state shared by the scene, input and game flow. Kept out
 * of React so 60 fps updates never re-render components.
 */

export type MonsterAnim =
  /** Happy bounce: "Yes, I do!" / "Yes, I can!". */
  | "yes"
  /** Head shake: "No, I don't." / "No, I can't.". */
  | "no"
  /** Excited spin (favourite food). */
  | "spin"
  | "eat"
  | "hop"
  /** The monster's own friendship dance. */
  | "friend"
  /** Using its power on an obstacle. */
  | "power"
  /** Shy: hides its face, then peeks. */
  | "hide"
  /** "!" surprise when it notices the player. */
  | "notice"
  /** Puzzled head tilt (a request it does not understand). */
  | "tilt";

export interface MonsterRt {
  id: MonsterId;
  x: number;
  z: number;
  /** Extra height (hops, riding); the ground is added by the scene. */
  lift: number;
  yaw: number;
  speed: number;
  /** Walk-cycle phase. */
  step: number;
  /** wander/idle/eat/sleep/play: on its own at home. talk: in a conversation. follow: companion. script: a cutscene moves it. */
  mode: "wander" | "idle" | "eat" | "sleep" | "play" | "talk" | "follow" | "script";
  target: Vec2 | null;
  /** Mode ends at this rt.time. */
  until: number;
  anim: { kind: MonsterAnim; t0: number } | null;
  /** Face this point (the player in conversations). */
  look: Vec2 | null;
  talking: boolean;
  /** Has reacted to the player's first approach. */
  noticed: boolean;
  /** Fades in after a teleport. */
  poofT0: number;
  /** In water (swims instead of walking). */
  swimming: boolean;
  /** Fliers: height above the ground (eases toward airTarget). */
  air: number;
  airTarget: number;
}

export interface CameraShot {
  pos: Vec3;
  target: Vec3;
}

export interface Effect {
  id: number;
  kind: "hearts" | "sparkle" | "leaves" | "splash" | "poof" | "notes";
  x: number;
  y: number;
  z: number;
  t0: number;
}

function monsterStart(id: MonsterId): MonsterRt {
  const h = MONSTERS[id].home;
  return {
    id,
    x: h.x,
    z: h.z,
    lift: 0,
    yaw: 0,
    speed: 0,
    step: 0,
    mode: "idle",
    target: null,
    until: 0,
    anim: null,
    look: null,
    talking: false,
    noticed: false,
    poofT0: -10,
    swimming: false,
    air: 0,
    airTarget: 0
  };
}

export const rt = {
  /** Real seconds since load (animation). */
  time: 0,
  /** Test hook only: slows or freezes the clock for frame-by-frame captures. */
  timeScale: 1,
  /** Seconds of play (paused on the title and results). */
  playTime: 0,
  player: {
    x: SPAWN.x,
    z: SPAWN.z,
    y: 0,
    yaw: SPAWN.yaw,
    vx: 0,
    vz: 0,
    speed: 0,
    step: 0,
    /** A cutscene owns the player (no input movement). */
    frozen: false,
    /** Riding Bubbo across the river (the simulation keeps the player on the saddle). */
    riding: false,
    /** While riding: 0 = standing at rideFrom, 1 = seated on Bubbo (the hop on and off). */
    seat: 0,
    rideFrom: { x: 0, z: 0 },
    /** Climbing the cliff rope: the height the player hangs at (null = on the ground). */
    climbY: null as number | null,
    /** Short gesture: give food, cheer. */
    action: null as null | { kind: "give" | "cheer" | "pick"; t0: number; food?: FoodId; depth?: number }
  },
  /** Keyboard + joystick intent, camera space: x = right, y = forward. */
  joy: { x: 0, y: 0, active: false },
  camera: {
    yaw: -0.5,
    pitch: 0.46,
    dist: 9,
    mode: "follow" as "follow" | "shot",
    shot: null as CameraShot | null,
    snap: false,
    pos: { x: 0, y: 6, z: 6 } as Vec3,
    target: { x: 0, y: 1, z: 0 } as Vec3
  },
  maple: { x: MAPLE.x, z: MAPLE.z, yaw: MAPLE.yaw, talking: false, wave: -10 },
  monsters: Object.fromEntries(MONSTER_ORDER.map((id) => [id, monsterStart(id)])) as Record<MonsterId, MonsterRt>,
  /** Picked food sources: id -> seconds until it grows back. */
  taken: new Map<string, number>(),
  /** Food that grew back: id -> rt.time it became collectible (drives the pop-in). */
  ripe: new Map<string, number>(),
  /** Fallen palm: 0 = across the pass, 1 = lifted aside. */
  palm: 0,
  palmTarget: 0,
  /** Vines growing on the palm (0..1). */
  vines: 0,
  /** Stepping stones: 0 = under water, 1 = risen. */
  stones: 0,
  stonesTarget: 0,
  /** Leafy's vines across the broken bridge (0..1). */
  bridge: 0,
  bridgeTarget: 0,
  /** The cliff rope: 0 = coiled at the foot, 1 = hanging from the top. */
  rope: 0,
  /** The bramble on the forest path: 1 = closed, 0 = gone. */
  bramble: 1,
  brambleTarget: 1,
  /** Permanent Phase 3 unlocks, animated by the ability scenes (0..1). */
  lava: 0,
  cave: 0,
  caveWarned: false,
  pillars: { gateLeaf: 0, gateDrop: 0, gateWing: 0, gateFlame: 0 } as Partial<Record<ObstacleId, number>>,
  gate: 0,
  starGlow: 0,
  /** Read-only through __mi.state(), for scene capture and acceptance waits. */
  finale: "idle" as "idle" | "rise" | "maple" | "complete",
  /** Monster Stone symbols lit (0..1 per symbol). */
  stoneGlow: { leafy: 0, bubbo: 0, puff: 0, ember: 0 } as Record<MonsterId, number>,
  effects: [] as Effect[],
  /** Which side of the player the companion walks on (+1 left, -1 right); conversations flip it out of the shot. */
  followSide: 1,
  /** Seconds without progress (the star marker brightens, Maple nudges). */
  idle: 0
};

let effectId = 1;
export function effect(kind: Effect["kind"], x: number, y: number, z: number) {
  rt.effects.push({ id: effectId++, kind, x, y, z, t0: rt.time });
  if (rt.effects.length > 12) rt.effects.shift();
}

export function animate(id: MonsterId, kind: MonsterAnim) {
  rt.monsters[id].anim = { kind, t0: rt.time };
}

/** Squat-and-reach length (s); walking waits for it so the feet never slide. */
export const PICK_TIME = 0.7;

export function resetRuntime() {
  const p = rt.player;
  p.x = SPAWN.x;
  p.z = SPAWN.z;
  p.yaw = SPAWN.yaw;
  p.vx = p.vz = p.speed = 0;
  p.frozen = false;
  p.riding = false;
  p.seat = 0;
  p.climbY = null;
  p.action = null;
  rt.joy.x = rt.joy.y = 0;
  rt.camera.mode = "follow";
  rt.camera.shot = null;
  rt.camera.yaw = -0.5;
  rt.camera.pitch = 0.46;
  rt.camera.dist = 9;
  rt.camera.snap = true;
  for (const id of MONSTER_ORDER) rt.monsters[id] = monsterStart(id);
  rt.taken.clear();
  rt.ripe.clear();
  rt.palm = rt.palmTarget = 0;
  rt.vines = 0;
  rt.stones = rt.stonesTarget = 0;
  rt.bridge = rt.bridgeTarget = 0;
  rt.rope = 0;
  rt.bramble = rt.brambleTarget = 1;
  rt.lava = rt.cave = rt.gate = rt.starGlow = 0;
  rt.caveWarned = false;
  for (const id of Object.keys(rt.pillars) as ObstacleId[]) rt.pillars[id] = 0;
  rt.finale = "idle";
  for (const id of MONSTER_ORDER) rt.stoneGlow[id] = 0;
  rt.effects = [];
  rt.idle = 0;
  rt.playTime = 0;
}
