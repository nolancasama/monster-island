import { FOODS } from "../data/foods";
import { PIRATES } from "../data/pirates";
import { COMPANION_IDS } from "../data/combat";
import { banner, getGame, setGame, toast, updateProgress, type Focus } from "../store";
import { animate, rt } from "../runtime";
import { GULL_BERTH } from "../world/lowland";
import { DECK_Y, HALF_BEAM, SHIP, SPOT, holdSavePosition, inShipArea, shipStandY, shipWalkable, shipWorld } from "../world/pirateShip";
import { PLAYER_R } from "../world/collision";
import { foodChoices, foodOfHave, handOverFood, interrogationFoods, setVoyageStage, truthfulAnswer, voyageStage, VOYAGE_JOBS, type VoyageJob, type VoyageStage } from "../logic/voyage";
import type { Progress } from "../logic/progress";
import { restoreHold, voyageEpoch, vy, type CaptureBeat, type CrewId } from "../voyageRt";
import { DebugScriptCancelled } from "../debugLifecycle";
import { activeFriend, currentPhase } from "../voyageSim";
import { ask, fastMode, say, wait } from "./ask";
import { fadeThrough, follow, frameTwo, isRunning, run, shot } from "./script";
import { CLOSE_UP_EASE, closeUp, endCloseUp } from "./closeUp";
import { boatLeg, boatPose } from "./act3";
import { BOAT_DECK_Y, BOAT_SCALE } from "../world/gullBoat";
import { BOAT_CHASE, BOAT_OUT, BOAT_OUT_START, CHASE_SECONDS, MOORED, MOORED_POSE, Motion, SHIP_CHASE_S, SHIP_PATH, boatChaseAt, horizonDrop, shipChaseAt, type Pose } from "./voyageEncounter";
import { GRAPPLE_RAIL, GRAPPLE_THROWERS, grappleGunwale, grappleHand, readyGrapple } from "./voyageGrapple";
import { saveNow } from "./story";
import { audio } from "../../audio/audio";
import { setVoyageTool } from "../../input/attackInput";
import { setActivityStance } from "../combat";
import { JOB_GIVER, JOB_NAMES, billAvailable, startJob } from "./voyageJobs";
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
  redbeard: ringAt(2.75, -90), pepper: ringAt(4.6, -62), bill: ringAt(2.75, -125), finn: ringAt(2.75, -160),
  tom: ringAt(2.75, -20), sam: ringAt(2.75, 165), max: ringAt(2.75, 15),
};
export const PEPPER_LEAN = ringAt(4.6 * 0.7, -62);

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
  if (onShip() && vy.inHold) return holdSavePosition(p.x, p.z, PLAYER_R);
  return onShip() && !p.frozen && shipWalkable(p.x, p.z, PLAYER_R) ? { x: p.x, z: p.z } : { ...BOARDED };
}

/** The ship, the sea and the crew in place (after the capture, or on load). */
export function setScene() {
  vy.active = true; vy.sea = true; vy.storm = 0; vy.flow = 0.6; vy.gullAboard = true; vy.boatMoored = true; vy.ropes = 1;
  vy.shipOffset = { x: 0, z: 0 }; vy.shipYaw = 0; vy.shipSink = 0; vy.spyglass = 0; vy.cut = true;
  vy.cutSails = 1; vy.grapples = null; captureBeat(null);
  const v = rt.voyage;
  v.active = false; v.x = MOORED.x; v.z = MOORED.z; v.y = -0.1; v.yaw = Math.PI; v.sail = 0.08; v.stage = "moored";
  const done = getGame().progress.act3.voyage.jobs;
  vy.sails = done.includes("sailing") ? [1, 1, 1] : [0.12, 0.12, 0.12];
}

export const crewWorld = (id: CrewId) => shipWorld(vy.crew[id]);

/** Wait for any other scripted moment to finish, then run this one. */
export async function scene(fn: () => Promise<void>) {
  while (isRunning()) await wait(50);
  await run(() => withCaptureCleanup(fn));
}

/** The harbour already owns run() when it calls startPirateVoyage. */
async function withCaptureCleanup(fn: () => Promise<void>) {
  const epoch = voyageEpoch();
  try {
    await fn();
  } finally {
    if (epoch === voyageEpoch()) {
      vy.cutSails = 1;
      vy.grapples = null;
      captureBeat(null);
    }
  }
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
  const epoch = voyageEpoch();
  const ready = await ask({ kind: "command", options: ["yesIAm"], tapAlways: true, readQuestion: true, cancellable: true,
    question: { by: "harbor", en: "Are you ready?", ja: "じゅんびは いいかい?" }, help: "「Yes, I am!」と こたえよう" });
  if (!ready) return;
  await say("harbor", "Let's go!", "しゅっぱつだ!");
  await ask({ kind: "command", options: ["letsGo"], tapAlways: true, readSentence: true, help: "いっしょに「Let's go!」" });
  checkCaptureEpoch(epoch);
  await depart();
  checkCaptureEpoch(epoch);
  await withCaptureCleanup(async () => {
    await capture();
    checkCaptureEpoch(epoch);
    await interrogation();
    checkCaptureEpoch(epoch);
    await monstersScene();
    checkCaptureEpoch(epoch);
  });
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
  vy.ropes = 0; vy.grapples = null; vy.cutSails = 1; captureBeat(null);
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
function captureBeat(beat: CaptureBeat | null) {
  vy.captureBeat = beat;
  vy.captureProgress = 0;
}

function checkCaptureEpoch(epoch: number) {
  if (epoch !== voyageEpoch()) throw new DebugScriptCancelled();
}
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
  const epoch = voyageEpoch(), v = rt.voyage;
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
    checkCaptureEpoch(epoch);
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
  await grappleCapture();
  await surrounded();
}

const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const unit = (t: number) => Math.max(0, Math.min(1, t));

async function grappleCapture() {
  const epoch = voyageEpoch(), v = rt.voyage;
  const captain = vy.crew.redbeard;
  captain.x = HALF_BEAM - 1.7; captain.z = 4.25; captain.yaw = 0;
  const grapples = vy.grapples = { tom: readyGrapple(), sam: readyGrapple(), max: readyGrapple() };
  const landing = { x: 0, y: 0, z: 0 };
  for (const [i, id] of GRAPPLE_THROWERS.entries()) {
    const c = vy.crew[id];
    c.x = GRAPPLE_RAIL.x - 1.5; c.z = GRAPPLE_RAIL.z[i] + 0.35;
    grappleGunwale(landing, v, i);
    c.yaw = Math.atan2(landing.x - SHIP.x - GRAPPLE_RAIL.x, landing.z - SHIP.z - GRAPPLE_RAIL.z[i]);
  }
  await say("harbor", "Oh no! The ship is in the way!", "たいへん! ふねが じゃまで すすめない!");
  checkCaptureEpoch(epoch);
  captureBeat("turn");
  const rail = { x: SHIP.x + captain.x, y: DECK_Y + 1.2, z: SHIP.z + captain.z };
  const faceBoat = Math.atan2(v.x - rail.x, v.z - rail.z);
  await glide(1.6, () => ({ pos: { x: rail.x + 5.2, y: DECK_Y + 3.15, z: rail.z + 3.1 }, target: rail }), (k) => {
    checkCaptureEpoch(epoch);
    vy.captureProgress = k;
    captain.yaw = faceBoat * ease(unit((k - 0.16) / 0.72));
  });
  captureBeat("order");
  await say("redbeard", "Stop! Stop that boat!", "とまれ! その ふねを とめろ!");
  checkCaptureEpoch(epoch);
  captureBeat("step");
  const throwShot = (): Shot => ({
    pos: { x: v.x + 4.8, y: 7.9, z: v.z + 13.2 },
    target: { x: lerp(SHIP.x + GRAPPLE_RAIL.x, v.x, 0.49), y: DECK_Y + 1.25, z: lerp(SHIP.z, v.z, 0.56) },
  });
  await glide(1.05, throwShot, (k) => {
    checkCaptureEpoch(epoch);
    vy.captureProgress = k;
    for (let i = 0; i < GRAPPLE_THROWERS.length; i++) {
      const c = vy.crew[GRAPPLE_THROWERS[i]], e = ease(k);
      c.x = GRAPPLE_RAIL.x - 1.5 * (1 - e); c.z = GRAPPLE_RAIL.z[i] + 0.35 * (1 - e);
      c.air = 0.06 * Math.abs(Math.sin(k * Math.PI * 3));
    }
  });
  captureBeat("throw");
  const windup = 0.62, release = 0.91, flight = 0.95, stagger = 0.8;
  const duration = release + flight + stagger * (GRAPPLE_THROWERS.length - 1);
  await over(duration, (k) => {
    checkCaptureEpoch(epoch);
    vy.captureProgress = k;
    for (let i = 0; i < GRAPPLE_THROWERS.length; i++) {
      const id = GRAPPLE_THROWERS[i], c = vy.crew[id], hook = grapples[id];
      const t = k * duration - i * stagger;
      if (t >= release) {
        if (hook.phase !== "flight" && hook.phase !== "attached") {
          c.air = 0;
          c.x = GRAPPLE_RAIL.x + Math.sin(c.yaw) * 0.36;
          c.z = GRAPPLE_RAIL.z[i] + Math.cos(c.yaw) * 0.36;
          hook.pitch = 0.32; hook.handY = 1.62; hook.handZ = 0.36;
          grappleHand(hook.release, c, hook, vy.shipBob);
          audio.play("whip");
        }
        hook.progress = unit((t - release) / flight);
        hook.phase = hook.progress >= 1 - 1e-9 ? "attached" : "flight";
        const settle = ease(unit((t - release) / 0.45));
        hook.handY = lerp(1.62, 1.33, settle);
        hook.pitch = lerp(0.32, 0.38, settle);
      } else if (t >= windup) {
        const lunge = ease(unit((t - windup) / (release - windup)));
        hook.phase = "lunge";
        hook.pitch = lerp(-0.23, 0.32, lunge);
        hook.handY = lerp(1.98, 1.62, lunge);
        hook.handZ = lerp(0.24, 0.36, lunge);
        c.x = GRAPPLE_RAIL.x + Math.sin(c.yaw) * 0.36 * lunge;
        c.z = GRAPPLE_RAIL.z[i] + Math.cos(c.yaw) * 0.36 * lunge;
      } else if (t >= 0) {
        const raise = ease(t / windup);
        hook.phase = "raise";
        hook.pitch = -0.23 * raise;
        hook.handY = lerp(0.9, 1.98, raise);
        hook.handZ = lerp(0.27, 0.24, raise);
      }
    }
  });
  vy.ropes = 1;
  captureBeat("landed");
  await say("redbeard", "Ropes, crew! Pull them in!", "ロープだ! ひきよせろ!");
  checkCaptureEpoch(epoch);
  captureBeat("haul");
  const from: Pose = { x: v.x, z: v.z, h: v.yaw }, dh = angleDelta(from.h, MOORED_POSE.h);
  v.sail = 0.08;
  const alongside = () => { const view = throwShot(); shot(view.pos, view.target); };
  await over(3, (k) => {
    checkCaptureEpoch(epoch);
    vy.captureProgress = k;
    const e = ease(k);
    // boatPose seats everyone and frames the boat's own view: the scene's shot replaces it.
    setBoat({ x: lerp(from.x, MOORED_POSE.x, e), z: lerp(from.z, MOORED_POSE.z, e), h: from.h + dh * e }); boatPose(); alongside();
  });
  setBoat(MOORED_POSE); boatPose(); alongside();
  captureBeat("alongside");
  await say("redbeard", "Bring them here!", "つれてこい!");
  checkCaptureEpoch(epoch);
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
  const epoch = voyageEpoch();
  const centre = shipWorld(HUDDLE);
  const reveal: Shot = { pos: { x: centre.x + 7.5, y: DECK_Y + 6.2, z: centre.z + 4.8 }, target: { x: centre.x, y: DECK_Y + 0.85, z: centre.z - 0.75 } };
  setGame({ fade: 1 });
  await wait(fastMode() ? 20 : 650);
  checkCaptureEpoch(epoch);
  huddleUp();
  vy.grapples = null;
  // The high diagonal sees the full ring from the open side. From this height
  // the main and mizzen cloth can cross the foreground during the push in.
  vy.cutSails = 0;
  for (const id of COMPANION_IDS) audio.voice(id, "surprised");
  shot(reveal.pos, reveal.target);
  await wait(fastMode() ? 20 : 350);
  checkCaptureEpoch(epoch);
  captureBeat("reveal");
  setGame({ fade: 0 });
  await wait(fastMode() ? 20 : 700);
  // A slow push in on the huddle while the crew close round.
  checkCaptureEpoch(epoch);
  captureBeat("encircle");
  await glide(1.6, () => ({ pos: { x: centre.x + 5.9, y: DECK_Y + 4.9, z: centre.z + 3.8 }, target: reveal.target }), (k) => {
    checkCaptureEpoch(epoch);
    vy.captureProgress = k;
  });
}

// ------------------------------------------------------------ the food interrogation

async function interrogation() {
  const epoch = voyageEpoch(), centre = shipWorld(HUDDLE);
  captureBeat(null);
  // Bring the lens in below the booms for the return from Redbeard's close-up.
  vy.cutSails = 1;
  shot({ x: centre.x + 6.7, y: DECK_Y + 1.95, z: centre.z + 2.3 },
    { x: centre.x, y: DECK_Y + 0.97, z: centre.z - 0.5 });
  rt.player.yaw = Math.atan2(crewWorld("redbeard").x - rt.player.x, crewWorld("redbeard").z - rt.player.z);
  // The captain's questions are his: a medium close-up from his introduction to the food handed over.
  closeUp("redbeard");
  await say("redbeard", "Ahoy! I'm Captain Redbeard!", "やあ! わしは キャプテン・レッドビアードだ!");
  // The bag stays open on screen through every question (ui/VoyageBag).
  setGame({ voyageBag: { target: null } });
  try {
    await say("redbeard", "We are hungry. Let's see your bag!", "はらぺこだ。バッグを みせろ!");
    await questions();
  } finally {
    endCloseUp();
    setGame({ voyageBag: null });
  }
  checkCaptureEpoch(epoch);
  captureBeat("interrogation-wide");
  await over(CLOSE_UP_EASE + 0.35, (k) => { checkCaptureEpoch(epoch); vy.captureProgress = k; });
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
  const epoch = voyageEpoch(), mid = shipWorld(HUDDLE);
  // Look down enough to see the smaller friends hide behind Ember and Gull.
  vy.cutSails = 0;
  captureBeat("monsters-wide");
  shot({ x: mid.x + 5.8, y: DECK_Y + 4.35, z: mid.z + 3.1 }, { x: mid.x, y: DECK_Y + 0.8, z: mid.z - 0.75 });
  await say("redbeard", "What's that? Monsters!", "なんだ それは? モンスター!");
  checkCaptureEpoch(epoch);
  captureBeat(null);
  closeUp("redbeard");
  await say("redbeard", "Monsters! Delicious!", "モンスター! おいしそう!");
  checkCaptureEpoch(epoch);
  endCloseUp();
  captureBeat("monsters-wide");
  // The cook leans in on the huddle.
  const pep = vy.crew.pepper, from = { ...HUDDLE_PIRATES.pepper };
  await over(0.6, (k) => {
    checkCaptureEpoch(epoch);
    pep.x = lerp(from.x, PEPPER_LEAN.x, ease(k)); pep.z = lerp(from.z, PEPPER_LEAN.z, ease(k));
  });
  captureBeat("pepper-in");
  closeUp("pepper");
  await say("pepper", "Monster soup!", "モンスタースープだ!");
  checkCaptureEpoch(epoch);
  endCloseUp();
  captureBeat("pepper-out");
  for (const id of COMPANION_IDS) { animate(id, "hide"); audio.voice(id, "surprised"); }
  await ask({ kind: "command", options: ["theyreMyFriends"], tapAlways: true, readSentence: true, help: "ともだちを まもろう!" });
  checkCaptureEpoch(epoch);
  captureBeat(null);
  closeUp("redbeard");
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
  // The crew go back to work (behind a short fade, so nobody slides across the deck); the fade hides the cut.
  await fadeThrough(() => { crewHome(); frameTwo(rt.player, crewWorld("redbeard"), 0.9); closeUp("redbeard", { cut: true }); }, 350);
  await say("redbeard", "My crew needs help. Talk to them!", "クルーが こまっている。はなしかけて みろ!");
  endCloseUp();
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
  // A save made below deck resumes on the hold floor; the deck cover lies above the same x/z.
  restoreHold(getGame().progress.act3.voyage.inHold === true && stage !== "storm");
  if (vy.inHold) placeOnDeck(holdSavePosition(p.x, p.z, PLAYER_R));
  else {
    const keep = inShipArea(p.x, p.z) && shipWalkable(p.x, p.z, PLAYER_R) && stage !== "storm";
    placeOnDeck(keep ? { x: p.x, z: p.z } : BOARDED);
  }
  p.y = shipStandY(p.x, p.z, vy.inHold);
  if (vy.inHold) {
    // Friends wait beside the player in the hold, not up on the deck.
    COMPANION_IDS.forEach((id, i) => { const m = rt.monsters[id]; m.x = p.x + (i - 1.5) * 0.7; m.z = p.z + 0.9; });
  }
  if (stage === "storm") { guard(startStorm()); return; }
  freeRoam();
  toast({ en: "On the pirate ship!", ja: "かいぞくせんの うえ!", tone: "info" }, 2200);
}

// ------------------------------------------------------------ talking to the crew, J

/** E targets on the ship: the running phase's, or the crew in free roam. */
export function voyageCandidates(): Array<{ focus: Focus; reach: number }> {
  const ph = currentPhase();
  if (ph) {
    const out = ph.candidates?.() ?? [];
    return !billAvailable() && out.some(({ focus }) => focus.id === "crew:bill")
      ? out.filter(({ focus }) => focus.id !== "crew:bill") : out;
  }
  if (!onShip()) return [];
  const out: Array<{ focus: Focus; reach: number }> = [];
  for (const id of Object.keys(vy.crew) as CrewId[]) {
    const c = vy.crew[id];
    if (!c.visible || id === "bill" && !billAvailable()) continue;
    const w = crewWorld(id), name = id === "gull" ? "Captain Gull" : PIRATES[id].name;
    out.push({ focus: { id: `crew:${id}`, kind: "npc", verb: "Talk to", noun: name, x: w.x, z: w.z }, reach: 2.4 });
  }
  return out;
}

export function voyageInteract(f: Focus) {
  if (f.id === "crew:bill" && !billAvailable()) return;
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
setActivityStance(() => onShip() && vy.sea ? currentPhase()?.stance?.() ?? null : null, {
  yaw: () => currentPhase()?.stanceYaw?.(),
  keepDuringScene: () => currentPhase()?.keepStanceDuringScene?.() ?? false,
});
