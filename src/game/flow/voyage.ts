import { FOODS } from "../data/foods";
import { PIRATES } from "../data/pirates";
import { COMPANION_IDS } from "../data/combat";
import { banner, getGame, setGame, toast, updateProgress, type Focus } from "../store";
import { animate, rt } from "../runtime";
import { GULL_BERTH } from "../world/lowland";
import { DECK_Y, HALF_BEAM, SHIP, SPOT, inShipArea, shipWalkable, shipWorld } from "../world/pirateShip";
import { PLAYER_R } from "../world/collision";
import { foodChoices, foodOfHave, handOverFood, interrogationFoods, setVoyageStage, truthfulAnswer, voyageStage, VOYAGE_JOBS, type VoyageJob, type VoyageStage } from "../logic/voyage";
import type { Progress } from "../logic/progress";
import { voyageEpoch, vy, type CrewId } from "../voyageRt";
import { DebugScriptCancelled } from "../debugLifecycle";
import { activeFriend, currentPhase } from "../voyageSim";
import { ask, fastMode, say, wait } from "./ask";
import { fadeThrough, follow, frameTwo, isRunning, run, shot } from "./script";
import { boatLeg, boatPose } from "./act3";
import { BOAT_DECK_Y, BOAT_SCALE } from "../world/gullBoat";
import { BOAT_CHASE, BOAT_OUT, BOAT_OUT_START, CHASE_SECONDS, MOORED, MOORED_POSE, Motion, SHIP_CHASE_S, SHIP_PATH, boatChaseAt, horizonDrop, shipChaseAt, type Pose } from "./voyageEncounter";
import { saveNow } from "./story";
import { audio } from "../../audio/audio";
import { setVoyageTool } from "../../input/attackInput";
import { JOB_GIVER, JOB_NAMES, startJob } from "./voyageJobs";
import { startStorm } from "./voyageStorm";
import { startRaft } from "./voyageRaft";

/**
 * The pirate voyage (docs/PIRATE_VOYAGE.md): Gull's departure, the capture, the
 * food interrogation, the monsters scene, and free roam on the ship. Jobs live in
 * flow/voyageJobs.ts, the storm in voyageStorm.ts, the raft in voyageRaft.ts.
 * It stays behind the Cloud Isle release lock: only `sailWithGull()` starts it,
 * and only when the ship is open.
 */

const D = (s: number) => (fastMode() ? Math.min(0.25, s) : s);
export async function over(seconds: number, fn: (k: number) => void) {
  const start = rt.time, duration = D(seconds);
  for (;;) {
    const k = Math.min(1, (rt.time - start) / duration);
    fn(k);
    if (k === 1) return;
    await wait(16);
  }
}
export const ease = (t: number) => t * t * (3 - 2 * t);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Where Gull's boat is tied, alongside the pirate ship's starboard side (flow/voyageEncounter). */
export { MOORED };
/** Where the player stands after boarding (and resumes a saved voyage). */
export const BOARDED = shipWorld({ x: -2.1, z: 7.4 });

/**
 * The capture's huddle on the main deck (local): the player, Gull and the four
 * friends close together in a ring, the seven pirates in a wider ring round
 * them, facing in. The stern-starboard side (toward the camera) stays open.
 */
export const HUDDLE = { x: -1.2, z: 6.2 };
const ringAt = (r: number, deg: number) => ({ x: HUDDLE.x + Math.cos((deg * Math.PI) / 180) * r, z: HUDDLE.z + Math.sin((deg * Math.PI) / 180) * r });
/** The party's places in the huddle (angle 90° faces the stern, the camera's side). */
export const HUDDLE_PARTY = {
  player: ringAt(1.15, 90), gull: ringAt(1.15, 150), leafy: ringAt(1.15, 210), puff: ringAt(1.15, 270), bubbo: ringAt(1.15, 330), ember: ringAt(1.15, 30),
} as const;
/** The pirates' ring: Redbeard straight ahead of the player (bow side), the crew round the far side. */
export const HUDDLE_PIRATES: Record<Exclude<CrewId, "gull">, { x: number; z: number }> = {
  redbeard: ringAt(2.75, -90), pepper: ringAt(2.75, -55), bill: ringAt(2.75, -125), finn: ringAt(2.75, -160),
  tom: ringAt(2.75, -20), sam: ringAt(2.75, 165), max: ringAt(2.75, 15),
};

/** Aboard the pirate ship while it is in the world. */
export const onShip = () => vy.active && rt.world === "home" && inShipArea(rt.player.x, rt.player.z);
/** The voyage owns E and J: on the ship, or on the raft. */
export const voyaging = () => vy.sea && rt.world === "home" && (onShip() || vy.raft.on);

/** A save made during the voyage resumes it (the crossing is not finished). */
export function voyageResumable(p: Progress): VoyageStage | null {
  const stage = voyageStage(p.act3);
  return p.act3.world === "home" && (stage === "captured" || stage === "jobs" || stage === "storm" || stage === "raft") ? stage : null;
}

/**
 * What a save may hold while the voyage owns the sea: null (not voyaging), false
 * (nothing to save before the "captured" checkpoint), or a deck spot (loading
 * puts the player back at the stage's own spawn).
 */
export function voyageSavePoint(): { x: number; z: number } | false | null {
  if (!vy.sea || rt.world !== "home") return null;
  if (!voyageResumable(getGame().progress)) return false;
  const p = rt.player;
  return onShip() && !p.frozen && shipWalkable(p.x, p.z, PLAYER_R) ? { x: p.x, z: p.z } : { ...BOARDED };
}

/** The ship, the sea and the crew in place (after the capture, or on load). */
export function setScene() {
  vy.active = true; vy.sea = true; vy.storm = 0; vy.flow = 0.6; vy.gullAboard = true; vy.boatMoored = true; vy.ropes = 1;
  vy.shipOffset = { x: 0, z: 0 }; vy.shipYaw = 0; vy.shipSink = 0; vy.spyglass = 0; vy.cut = true;
  const v = rt.voyage;
  v.active = false; v.x = MOORED.x; v.z = MOORED.z; v.y = -0.1; v.yaw = Math.PI; v.sail = 0.08; v.stage = "moored";
  const done = getGame().progress.act3.voyage.jobs;
  vy.sails = done.includes("sailing") ? [1, 1, 1] : [0.12, 0.12, 0.12];
}

export const crewWorld = (id: CrewId) => shipWorld(vy.crew[id]);

/** Wait for any other scripted moment to finish, then run this one. */
export async function scene(fn: () => Promise<void>) {
  while (isRunning()) await wait(50);
  await run(fn);
}
/** A voyage flow that outlived a reset (title screen, Continue, debug travel) stops quietly. */
export class VoyageCancelled extends Error {}
export async function until(cond: () => boolean) {
  const e = voyageEpoch();
  while (!cond()) {
    await wait(60);
    if (voyageEpoch() !== e) throw new VoyageCancelled();
  }
}
/** Run a voyage flow from outside a script; a cancelled one ends without an error. */
export function guard(p: Promise<void>) {
  p.catch((err) => { if (!(err instanceof VoyageCancelled) && !(err instanceof DebugScriptCancelled)) throw err; });
}

// ------------------------------------------------------------ departure and capture

/** Gull's first trip: called inside the harbour's script by `sailWithGull()` when the ship is open. */
export async function startPirateVoyage(): Promise<void> {
  const ready = await ask({ kind: "command", options: ["yesIAm"], tapAlways: true, readQuestion: true, cancellable: true,
    question: { by: "harbor", en: "Are you ready?", ja: "じゅんびは いいかい?" }, help: "「Yes, I am!」と こたえよう" });
  if (!ready) return;
  await say("harbor", "Let's go!", "しゅっぱつだ!");
  await ask({ kind: "command", options: ["letsGo"], tapAlways: true, readSentence: true, help: "いっしょに「Let's go!」" });
  await depart();
  await capture();
  await interrogation();
  await monstersScene();
  updateProgress((p) => setVoyageStage(p, "captured"));
  saveNow();
  freeRoam();
}

async function depart() {
  const v = rt.voyage;
  vy.sea = true; vy.storm = 0; vy.flow = 0; vy.cut = false;
  // From the berth alongside the pier, where the boat was waiting.
  v.active = true; v.sail = 1; v.stage = "depart"; v.x = GULL_BERTH.x; v.z = GULL_BERTH.z; v.y = -0.1; v.yaw = GULL_BERTH.yaw;
  rt.player.frozen = true;
  audio.startMusic("island");
  boatPose();
  await boatLeg(7, BOAT_OUT_START.x, BOAT_OUT_START.z);
  await say("harbor", "What a nice day! The sea is calm.", "いい てんきだ! うみが しずかだね。");
  // Round the point and out to open water, then west for Cloud Isle; Gull eases off to look at something ahead.
  const out = new Motion(BOAT_OUT, [[0, 6], [9, 7], [13, 3], [16, 0]], 16, BOAT_OUT.length);
  // As he slows he lets the sail down (it would hide what lies ahead).
  await over(16, (k) => { setBoat(out.at(k * 16)); v.sail = k < 0.72 ? 1 : lerp(1, 0.12, ease((k - 0.72) / 0.28)); boatPose(); });
}

/** Gull's boat at a pose (its yaw is its heading). */
function setBoat(p: Pose) {
  const v = rt.voyage;
  v.x = p.x; v.z = p.z; v.yaw = p.h;
}
/** The pirate ship at a pose on its approach: offset from its mooring, turned to its heading, and sunk below the horizon by distance. */
function setShip(p: Pose) {
  vy.shipOffset = { x: p.x - SHIP.x, z: p.z - SHIP.z };
  // Its bow (local −z) points along the heading; exactly 0 once it lies at its mooring.
  const yaw = Math.atan2(Math.sin(p.h + Math.PI), Math.cos(p.h + Math.PI));
  vy.shipYaw = Math.abs(yaw) < 1e-4 && Math.hypot(vy.shipOffset.x, vy.shipOffset.z) < 1e-3 ? 0 : yaw;
  const v = rt.voyage;
  vy.shipSink = horizonDrop(Math.hypot(p.x - v.x, p.z - v.z));
}
/**
 * Evidence (e2e `encounterPose`): Gull's boat and the ship at one moment of the
 * encounter — `out` k 0..1 along the way out, `watch` k 0..1 of the ship's watched
 * leg, `chase` k 0..1 of the chase, `pull` k 0..1 of the rope pull to the mooring.
 */
export function poseEncounter(phase: "out" | "watch" | "chase" | "pull", k: number) {
  const v = rt.voyage;
  vy.sea = true; vy.active = phase !== "out"; vy.cut = false; vy.gullAboard = false; vy.boatMoored = false;
  v.active = true; v.sail = phase === "pull" ? 0.08 : 1; v.y = -0.1;
  vy.crew.gull.visible = false; vy.sails = phase === "pull" ? [0.12, 0.12, 0.12] : [1, 1, 1];
  rt.player.frozen = true;
  if (phase === "out") setBoat(BOAT_OUT.at(k * BOAT_OUT.length));
  else if (phase === "watch") { v.sail = 0.12; setBoat(BOAT_OUT.end); setShip(SHIP_PATH.at(k * SHIP_CHASE_S)); }
  else if (phase === "chase") { setBoat(boatChaseAt(k * CHASE_SECONDS)); setShip(shipChaseAt(k * CHASE_SECONDS)); if (k >= 1) shipAtRest(); }
  else {
    shipAtRest(); vy.ropes = 1;
    const a = BOAT_CHASE.end, e = ease(k), dh = Math.atan2(Math.sin(MOORED_POSE.h - a.h), Math.cos(MOORED_POSE.h - a.h));
    setBoat({ x: lerp(a.x, MOORED_POSE.x, e), z: lerp(a.z, MOORED_POSE.z, e), h: a.h + dh * e });
  }
  boatPose();
}
/** The ship resting at its mooring, level. */
function shipAtRest() {
  vy.shipOffset = { x: 0, z: 0 }; vy.shipYaw = 0; vy.shipSink = 0;
}

type Shot = { pos: { x: number; y: number; z: number }; target: { x: number; y: number; z: number } };
const lerp3 = (a: Shot["pos"], b: Shot["pos"], t: number) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) });
/** The shot the camera is in now (scripts own it while Gull's boat is ridden: the rig follows each shot exactly). */
const currentShot = (): Shot | null => (rt.camera.shot ? { pos: { ...rt.camera.shot.pos }, target: { ...rt.camera.shot.target } } : null);
/**
 * Ease from wherever the camera is to a shot that may itself move (`to(k)`), so a
 * framing change is a smooth cinematic move instead of a cut. Position and
 * look-at blend together, keeping orientation and distance continuous.
 */
async function glide(seconds: number, to: (k: number) => Shot, each?: (k: number) => void) {
  const from = currentShot() ?? to(0);
  await over(seconds, (k) => {
    each?.(k);
    const e = ease(k), end = to(k);
    shot(lerp3(from.pos, end.pos, e), lerp3(from.target, end.target, e));
  });
}

// ------------------------------------------------------------ the sighting, the spyglass and the chase

let spyPressed = false;
/** E, Enter, Space or the on-screen button while Gull's spyglass prompt shows (flow/input, ui/VoyageHud). */
export function pressSpyglass() {
  if (!getGame().spyglass) return;
  spyPressed = true;
  setGame({ spyglass: null });
}
async function spyglassPrompt(step: "raise" | "lower") {
  spyPressed = false;
  setGame({ spyglass: step });
  try { await until(() => spyPressed); } finally { if (getGame().spyglass === step) setGame({ spyglass: null }); }
}

/** The ship's place along its path while it is watched (it sails on slowly toward the chase start). */
let watchedS = 0;
function sailWatched(ds: number) { watchedS = Math.min(SHIP_CHASE_S, watchedS + ds); setShip(SHIP_PATH.at(watchedS)); }

/**
 * Looking out over the bow from the boat's stern quarter, above the rail: the
 * party and Gull in the lower part of the frame, the ship on the horizon ahead.
 * `ahead` and `out` are boat-local metres (forward, starboard) before scaling.
 */
const lookout = (ahead = -3.2, out = 1.45, up = 2.9): Shot => {
  const v = rt.voyage, fx = Math.sin(v.yaw), fz = Math.cos(v.yaw), rx = Math.cos(v.yaw), rz = -Math.sin(v.yaw);
  const ship = { x: SHIP.x + vy.shipOffset.x, z: SHIP.z + vy.shipOffset.z };
  return {
    pos: { x: v.x + (fx * ahead + rx * out) * BOAT_SCALE, y: v.y + BOAT_DECK_Y + up, z: v.z + (fz * ahead + rz * out) * BOAT_SCALE },
    target: { x: ship.x, y: 4.5 - vy.shipSink * 0.6, z: ship.z },
  };
};

async function capture() {
  const v = rt.voyage;
  // Phase A — far off, dead ahead, only masts and sails show over the horizon; the hull rises as it nears.
  vy.active = true; vy.flow = 0; vy.cut = false; watchedS = 0;
  // Under full sail as it comes on; Gull is still in his own boat, not on its deck.
  vy.sails = [1, 1, 1]; vy.crew.gull.visible = false;
  setShip(SHIP_PATH.at(0));
  await glide(2.6, () => lookout(), (k) => sailWatched(k * 0.12));
  await say("harbor", "Look! A ship!", "みて! ふねだ!");
  await say("harbor", "Use the spyglass!", "ぼうえんきょうで みてごらん!");
  // Phase B — the spyglass: raise it with the interact key or the button, look, answer, lower it.
  await spyglassPrompt("raise");
  audio.play("whoosh");
  await over(1.1, (k) => { vy.spyglass = k; sailWatched(0.08); shot(lookout().pos, lookout().target); });
  vy.spyglass = 1;
  // The ship sails on while it is watched (it stays far off; nothing waits on it).
  let watching = true;
  void (async () => { while (watching) { sailWatched(0.035); shot(lookout().pos, lookout().target); await wait(16); } })();
  try {
    for (;;) {
      const seen = await ask({ kind: "choice", options: ["iCanSeeAShip", "iCanSeeAFish"], tapAlways: true, readQuestion: true,
        question: { by: "harbor", en: "What can you see?", ja: "なにが みえる?" }, help: "ぼうえんきょうの なかを みて こたえよう" });
      if (seen === "iCanSeeAShip") break;
      await say("harbor", "A fish? Look again!", "さかな? もういちど みてごらん!");
    }
    await say("harbor", "Yes! A big ship with red sails...", "そう! あかい ほの おおきな ふねだ…");
    await spyglassPrompt("lower");
  } finally { watching = false; }
  await over(0.9, (k) => { vy.spyglass = 1 - k; shot(lookout().pos, lookout().target); });
  vy.spyglass = 0;
  // Phase C — recognition: the rest of its watched leg, then the turn toward the boat begins the chase.
  const s0 = watchedS;
  await glide(1.6, () => lookout(-3.6, 1.2, 3.3), (k) => { watchedS = lerp(s0, SHIP_CHASE_S, ease(k)); setShip(SHIP_PATH.at(watchedS)); });
  watchedS = SHIP_CHASE_S; setShip(SHIP_PATH.at(watchedS));
  await say("harbor", "Red sails... It's a pirate ship! Oh no! Pirates!", "あかい ほ… かいぞくせんだ! たいへん!");
  await say("harbor", "Hold on! We turn left!", "つかまって! ひだりへ にげるよ!");
  await ask({ kind: "command", options: ["turnLeft"], tapAlways: true, readSentence: true, help: "いっしょに「Turn left!」" });
  audio.play("whoosh");
  void over(1.4, (k) => { v.sail = lerp(0.12, 1, ease(k)); });
  // The chase: the ship bears round onto the boat and runs it down; Gull bears away to port, and the
  // ship hooks across his bow and stops broadside in the way. The camera rides off the boat's
  // starboard quarter, high enough to keep both vessels in view.
  const chaseShot = (): Shot => {
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    const ship = { x: SHIP.x + vy.shipOffset.x, z: SHIP.z + vy.shipOffset.z };
    return {
      pos: { x: v.x - fx * 15 + fz * 9, y: 11, z: v.z - fz * 15 - fx * 9 },
      target: { x: v.x + (ship.x - v.x) * 0.45, y: 3.2, z: v.z + (ship.z - v.z) * 0.45 },
    };
  };
  const toChase = currentShot();
  await over(CHASE_SECONDS, (k) => {
    const t = k * CHASE_SECONDS;
    setBoat(boatChaseAt(t)); setShip(shipChaseAt(t)); boatPose();
    // Ease from the lookout into the chase framing over its first two seconds.
    const end = chaseShot(), blend = toChase ? ease(Math.min(1, t / 2)) : 1;
    shot(toChase ? lerp3(toChase.pos, end.pos, blend) : end.pos, toChase ? lerp3(toChase.target, end.target, blend) : end.target);
  });
  setBoat(BOAT_CHASE.end); shipAtRest(); boatPose();
  v.sail = 0.3;
  // Hove to: the pirates spill their sails.
  void over(2.4, (k) => { vy.sails = vy.sails.map(() => lerp(1, 0.12, ease(k))); });
  await say("harbor", "Oh no! The ship is in the way!", "たいへん! ふねが じゃまで すすめない!");
  vy.crew.redbeard.x = HALF_BEAM - 1.6; vy.crew.redbeard.z = 9.4;
  // Settle on the captain at the rail, the boat stopped short of the ship's side.
  const rail = { x: SHIP.x + HALF_BEAM - 2, y: DECK_Y + 1.5, z: SHIP.z + 9 };
  await glide(1.6, () => ({ pos: { x: v.x + 7.5, y: 6.8, z: v.z + 9.5 }, target: rail }));
  await say("redbeard", "Stop! Stop that boat!", "とまれ! その ふねを とめろ!");
  // Three ropes fly across as the captain shouts, then haul the boat in alongside, where they stay as its mooring lines.
  audio.play("whip");
  await over(1.2, (k) => { vy.ropes = Math.max(vy.ropes, k); });
  vy.ropes = 1;
  await say("redbeard", "Ropes, crew! Pull them in!", "ロープだ! ひきよせろ!");
  const from: Pose = { x: v.x, z: v.z, h: v.yaw }, dh = Math.atan2(Math.sin(MOORED_POSE.h - from.h), Math.cos(MOORED_POSE.h - from.h));
  v.sail = 0.08;
  const alongside = () => shot({ x: v.x + 7.5, y: 6.8, z: v.z + 9.5 }, rail);
  await over(3, (k) => {
    const e = ease(k);
    // boatPose seats everyone and frames the boat's own view: the scene's shot replaces it.
    setBoat({ x: lerp(from.x, MOORED_POSE.x, e), z: lerp(from.z, MOORED_POSE.z, e), h: from.h + dh * e }); boatPose(); alongside();
  });
  setBoat(MOORED_POSE); boatPose(); alongside();
  await say("redbeard", "Bring them here!", "つれてこい!");
  await surrounded();
}

/** Place the party in the huddle and the pirates round it (the capture's reveal, also used by tests). */
export function huddleUp() {
  const v = rt.voyage, p = rt.player;
  // The boat stays tied alongside; from here the ship's deck carries everyone.
  v.active = false; vy.boatMoored = true; vy.cut = true; vy.gullAboard = true;
  const at = shipWorld(HUDDLE_PARTY.player), centre = shipWorld(HUDDLE);
  p.x = at.x; p.z = at.z; p.vx = p.vz = 0; p.floatY = null; p.riding = false; p.climbY = null;
  p.yaw = Math.atan2(centre.x - at.x, centre.z - at.z);
  for (const id of COMPANION_IDS) {
    const m = rt.monsters[id], w = shipWorld(HUDDLE_PARTY[id]);
    m.mode = "script"; m.x = w.x; m.z = w.z; m.air = m.airTarget = 0; m.look = null;
    m.yaw = Math.atan2(centre.x - w.x, centre.z - w.z) + Math.PI;
    delete vy.monY[id];
  }
  const g = vy.crew.gull;
  g.visible = true; g.x = HUDDLE_PARTY.gull.x; g.z = HUDDLE_PARTY.gull.z; g.air = 0; g.yaw = Math.atan2(HUDDLE.x - g.x, HUDDLE.z - g.z) + Math.PI;
  for (const id of Object.keys(HUDDLE_PIRATES) as Array<keyof typeof HUDDLE_PIRATES>) {
    const c = vy.crew[id], s = HUDDLE_PIRATES[id];
    c.x = s.x; c.z = s.z; c.air = 0; c.visible = true; c.menace = true;
    c.yaw = Math.atan2(HUDDLE.x - s.x, HUDDLE.z - s.z);
  }
  rt.camera.snap = true;
}

/** The pirates are back at their own places (after the monsters scene, or on load). */
export function crewHome() {
  for (const id of Object.keys(vy.crew) as CrewId[]) {
    const home = id === "gull" ? SPOT.gull : id === "redbeard" ? SPOT.captain : id === "pepper" ? SPOT.cook : id === "bill" ? SPOT.bill
      : id === "finn" ? SPOT.finn : SPOT.crew[id === "tom" ? 0 : id === "sam" ? 1 : 2];
    Object.assign(vy.crew[id], { x: home.x, z: home.z, menace: false, air: 0 });
  }
}

/**
 * The capture: a fade to black while the pirates pull everyone aboard, then the
 * reveal of the party huddled together, the crew all round them. No one jumps
 * or swings across.
 */
async function surrounded() {
  const centre = shipWorld(HUDDLE);
  const reveal: Shot = { pos: { x: centre.x + 7.2, y: DECK_Y + 6.6, z: centre.z + 5.4 }, target: { x: centre.x - 0.2, y: DECK_Y + 0.9, z: centre.z - 0.7 } };
  setGame({ fade: 1 });
  await wait(fastMode() ? 20 : 650);
  huddleUp();
  for (const id of COMPANION_IDS) audio.voice(id, "surprised");
  shot(reveal.pos, reveal.target);
  await wait(fastMode() ? 20 : 350);
  setGame({ fade: 0 });
  await wait(fastMode() ? 20 : 700);
  // A slow push in on the huddle while the crew close round.
  await glide(1.6, () => ({ pos: lerp3(reveal.pos, { x: centre.x + 5.6, y: DECK_Y + 5.2, z: centre.z + 4.4 }, 1), target: reveal.target }));
}

// ------------------------------------------------------------ the food interrogation

async function interrogation() {
  frameTwo(rt.player, crewWorld("redbeard"), 0.9);
  rt.player.yaw = Math.atan2(crewWorld("redbeard").x - rt.player.x, crewWorld("redbeard").z - rt.player.z);
  await say("redbeard", "Ahoy! I'm Captain Redbeard!", "やあ! わしは キャプテン・レッドビアードだ!");
  // The bag stays open on screen through every question (ui/VoyageBag).
  setGame({ voyageBag: { target: null } });
  try {
    await say("redbeard", "We are hungry. Let's see your bag!", "はらぺこだ。バッグを みせろ!");
    await questions();
  } finally {
    setGame({ voyageBag: null });
  }
}

async function questions() {
  for (const food of interrogationFoods(getGame().progress.bag)) {
    setGame({ voyageBag: { target: food } });
    for (;;) {
      const said = await ask({ kind: "choice", options: ["yesIDo", "noIDont"], tapAlways: true, readQuestion: true, picture: food,
        question: { by: "redbeard", en: `Do you have ${FOODS[food].word}?`, ja: `${FOODS[food].ja}を もってる?` }, help: "バッグの なかみを みて、ほんとうの ことを こたえよう" });
      const truth = truthfulAnswer(getGame().progress.bag, food);
      if (said === truth) {
        await say("redbeard", truth === "yesIDo" ? "Ho ho! Good!" : "No? Too bad!", truth === "yesIDo" ? "ほほう! いいぞ!" : "ない? ざんねん!");
        break;
      }
      const n = getGame().progress.bag[food] ?? 0;
      toast({ en: `Your bag: ${n} ${FOODS[food].word}`, ja: `バッグ: ${FOODS[food].ja} ${n}こ`, icon: food, tone: "info" }, 2600);
      await say("redbeard", "Hmm? Look in your bag!", "あれ? バッグを よく みてごらん!");
    }
  }
  setGame({ voyageBag: { target: null } });
  const choices = foodChoices(getGame().progress.bag);
  const said = await ask({ kind: "choice", options: choices, tapAlways: true, readQuestion: true,
    icons: Object.fromEntries(choices.map((c) => [c, foodOfHave(c) ?? "bag"])),
    question: { by: "redbeard", en: "What food do you have?", ja: "どんな たべものを もってる?" }, help: "もっている たべものを いおう" });
  const food = said ? foodOfHave(said) : null;
  const already = getGame().progress.act3.voyage.interrogated;
  setGame({ voyageBag: { target: food } });
  updateProgress((p) => handOverFood(p, food));
  if (food) {
    if (!already) toast({ en: `-1 ${FOODS[food].word}`, ja: `${FOODS[food].ja} 1こ わたした`, icon: food, tone: "info" }, 2200);
    vy.crew.redbeard.hold = food;
    await say("redbeard", `${FOODS[food].word[0].toUpperCase()}${FOODS[food].word.slice(1)}! Yummy! Thank you!`, "おいしそう! ありがとう!");
    vy.crew.redbeard.hold = null;
  } else await say("redbeard", "No food?! Oh no! We are so hungry!", "たべものが ない?! はらぺこだ!");
}

// ------------------------------------------------------------ the monsters

async function monstersScene() {
  const mid = shipWorld(HUDDLE);
  shot({ x: mid.x + 5.2, y: DECK_Y + 5.4, z: mid.z + 6.2 }, { x: mid.x, y: DECK_Y + 0.8, z: mid.z - 0.6 });
  await say("redbeard", "What's that? Monsters!", "なんだ それは? モンスター!");
  await say("redbeard", "Monsters! Delicious!", "モンスター! おいしそう!");
  // The cook leans in on the huddle.
  const pep = vy.crew.pepper, from = { ...HUDDLE_PIRATES.pepper };
  void over(0.6, (k) => { pep.x = lerp(from.x, lerp(from.x, HUDDLE.x, 0.3), ease(k)); pep.z = lerp(from.z, lerp(from.z, HUDDLE.z, 0.3), ease(k)); });
  await say("pepper", "Monster soup!", "モンスタースープだ!");
  for (const id of COMPANION_IDS) { animate(id, "hide"); audio.voice(id, "surprised"); }
  await ask({ kind: "command", options: ["theyreMyFriends"], tapAlways: true, readSentence: true, help: "ともだちを まもろう!" });
  await say("redbeard", "Your friends? Hmm...", "ともだち? ふむ…");
  for (;;) {
    const said = await ask({ kind: "choice", options: ["yesTheyCan", "noTheyCant"], tapAlways: true, readQuestion: true,
      question: { by: "redbeard", en: "Can they help us?", ja: "かれらは てつだえるか?" }, help: "モンスターは なにが できるかな?" });
    if (said === "yesTheyCan") break;
    await say("pepper", "Then... monster soup!", "じゃあ… モンスタースープ!");
    await say("redbeard", "Hmm... are you sure?", "ほんとうに?");
  }
  for (const id of COMPANION_IDS) { animate(id, "yes"); audio.voice(id, "excited"); }
  for (const c of Object.values(vy.crew)) c.menace = false;
  await say("redbeard", "Okay! Show me!", "よし! みせてみろ!");
  // The crew go back to work (behind a short fade, so nobody slides across the deck).
  await fadeThrough(() => { crewHome(); frameTwo(rt.player, crewWorld("redbeard"), 0.9); }, 350);
  await say("redbeard", "My crew needs help. Talk to them!", "クルーが こまっている。はなしかけて みろ!");
  banner({ title: "The Pirate Ship", sub: "Help the crew: fish, cook, cargo and sails!", ja: "かいぞくせん — クルーを てつだおう!", tone: "place" }, 4200);
}

// ------------------------------------------------------------ free roam

export function freeRoam() {
  rt.player.frozen = false;
  rt.player.floatY = null;
  for (const id of COMPANION_IDS) { const m = rt.monsters[id]; m.mode = id === getGame().progress.active ? "follow" : "party"; m.air = m.airTarget = 0; delete vy.monY[id]; }
  follow();
}

/** Put the player and the friends on deck (a resumed save, or a restarted stage). */
export function placeOnDeck(at: { x: number; z: number } = BOARDED) {
  const p = rt.player;
  p.x = at.x; p.z = at.z; p.yaw = Math.PI; p.vx = p.vz = 0; p.floatY = null; p.riding = false; p.climbY = null;
  COMPANION_IDS.forEach((id, i) => { const m = rt.monsters[id], o = shipWorld({ x: (i - 1.5) * 0.9, z: 7 }); m.x = o.x; m.z = o.z; m.air = m.airTarget = 0; });
  rt.camera.snap = true;
}

/** Resume a voyage saved after the capture: each stage restarts from its start. */
export async function resumeVoyage() {
  const stage = voyageResumable(getGame().progress);
  if (!stage) return;
  if (stage === "raft") { guard(startRaft()); return; }
  setScene();
  const p = rt.player;
  placeOnDeck(inShipArea(p.x, p.z) && shipWalkable(p.x, p.z, PLAYER_R) && stage !== "storm" ? { x: p.x, z: p.z } : BOARDED);
  if (stage === "storm") { guard(startStorm()); return; }
  freeRoam();
  toast({ en: "On the pirate ship!", ja: "かいぞくせんの うえ!", tone: "info" }, 2200);
}

// ------------------------------------------------------------ talking to the crew, J

/** E targets on the ship: the running phase's, or the crew in free roam. */
export function voyageCandidates(): Array<{ focus: Focus; reach: number }> {
  const ph = currentPhase();
  if (ph) return ph.candidates ? ph.candidates() : [];
  if (!onShip()) return [];
  const out: Array<{ focus: Focus; reach: number }> = [];
  for (const id of Object.keys(vy.crew) as CrewId[]) {
    const c = vy.crew[id];
    if (!c.visible) continue;
    const w = crewWorld(id), name = id === "gull" ? "Captain Gull" : PIRATES[id].name;
    out.push({ focus: { id: `crew:${id}`, kind: "npc", verb: "Talk to", noun: name, x: w.x, z: w.z }, reach: 2.4 });
  }
  return out;
}

export function voyageInteract(f: Focus) {
  const ph = currentPhase();
  if (ph) { ph.interact?.(f); return; }
  if (!f.id.startsWith("crew:")) return;
  const id = f.id.slice(5) as CrewId;
  const giver = JOB_GIVER[id];
  const done = getGame().progress.act3.voyage.jobs;
  if (giver && !done.includes(giver)) { guard(startJob(giver)); return; }
  void run(async () => {
    frameTwo(rt.player, crewWorld(id), 0.85);
    if (giver) { await say(id as Exclude<CrewId, "gull">, "Thank you, friend!", "ありがとう、なかま!"); return; }
    if (id === "gull") {
      const left = VOYAGE_JOBS.filter((j: VoyageJob) => !done.includes(j));
      await say("harbor", left.length ? `Help the crew! ${left.length} more: ${left.map((j) => JOB_NAMES[j]).join(", ")}.` : "You did it! They like you now!", left.length ? "クルーを てつだおう!" : "やったね! みんな なかよしだ!");
      return;
    }
    await say(id, done.includes("cooking") ? "Yummy dinner! Thank you!" : "I'm hungry!", done.includes("cooking") ? "おいしかった! ありがとう!" : "おなかが すいた!");
  });
}

/**
 * J and K while the voyage owns the sea (Gull's boat, the ship, the raft): consumed,
 * never ordinary combat. J is the running job's tool for the active friend; with
 * nothing to do (or K) it does nothing.
 */
export function voyageAttack(slot: "basic" | "special"): boolean {
  if (!vy.sea || rt.world !== "home") return false;
  const friend = activeFriend();
  if (slot === "basic" && friend && voyaging()) currentPhase()?.tool?.(friend);
  return true;
}
setVoyageTool(voyageAttack);
