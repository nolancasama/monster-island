import { FOODS } from "../data/foods";
import { PIRATES } from "../data/pirates";
import { COMPANION_IDS } from "../data/combat";
import { banner, getGame, setGame, toast, updateProgress, type Focus } from "../store";
import { animate, rt } from "../runtime";
import { GULL_BERTH, PIER2 } from "../world/lowland";
import { DECK_Y, HALF_BEAM, SHIP, SPOT, hullHalf, inShipArea, shipWalkable, shipWorld } from "../world/pirateShip";
import { PLAYER_R } from "../world/collision";
import { foodChoices, foodOfHave, handOverFood, interrogationFoods, setVoyageStage, truthfulAnswer, voyageStage, VOYAGE_JOBS, type VoyageJob, type VoyageStage } from "../logic/voyage";
import type { Progress } from "../logic/progress";
import { voyageEpoch, vy, type CrewId } from "../voyageRt";
import { DebugScriptCancelled } from "../debugLifecycle";
import { activeFriend, currentPhase } from "../voyageSim";
import { ask, fastMode, say, wait } from "./ask";
import { fadeThrough, follow, frameTwo, isRunning, run, shot } from "./script";
import { boatLeg, boatPose } from "./act3";
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

/** Where Gull's boat is tied, alongside the pirate ship's starboard side. */
export const MOORED = { x: SHIP.x + hullHalf(5.5) + 3.15, z: SHIP.z + 5.5 };
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
  vy.shipOffset = { x: 0, z: 0 }; vy.cut = true;
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
  await boatLeg(7, PIER2.x + 4, PIER2.z0 - 42);
  await say("harbor", "What a nice day! The sea is calm.", "いい てんきだ! うみが しずかだね。");
  await boatLeg(8, MOORED.x + 3, SHIP.z + 46);
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

/** The ship far off on the horizon (its offset from the mooring as it sails in). */
const SIGHTED = { x: 46, z: -60 };

async function capture() {
  const v = rt.voyage;
  // A big ship rises over the horizon to the north-east. The camera turns from the
  // boat's broadside view to look out at it, then follows its approach.
  vy.active = true; vy.shipOffset = { ...SIGHTED }; vy.flow = 0;
  const horizon = (): Shot => ({
    pos: { x: v.x - 9, y: 6.2, z: v.z + 12 },
    target: { x: SHIP.x + vy.shipOffset.x * 0.85, y: 3.2, z: SHIP.z + vy.shipOffset.z * 0.85 },
  });
  await glide(1.8, horizon, (k) => { vy.shipOffset.x = SIGHTED.x - 4 * ease(k); vy.shipOffset.z = SIGHTED.z + 5 * ease(k); });
  const held = { ...vy.shipOffset };
  await say("harbor", "Look! A big ship!", "みて! おおきな ふねだ!");
  const bx = v.x, bz = v.z;
  audio.play("whoosh");
  // The approach: the ship sails in alongside while the camera moves to the wide alongside view.
  const alongside = (): Shot => ({
    pos: { x: MOORED.x + 17, y: 9.5, z: MOORED.z + 19 },
    target: { x: SHIP.x + vy.shipOffset.x * 0.6, y: 4, z: SHIP.z + vy.shipOffset.z * 0.6 },
  });
  await glide(6, alongside, (k) => {
    const e = ease(k);
    vy.shipOffset.x = lerp(held.x, 0, e); vy.shipOffset.z = lerp(held.z, 0, e);
    v.x = lerp(bx, MOORED.x, e); v.z = lerp(bz, MOORED.z, e); v.yaw = Math.PI;
    boatPose();
  });
  vy.shipOffset = { x: 0, z: 0 };
  v.sail = 0.08;
  vy.crew.redbeard.x = HALF_BEAM - 1.6; vy.crew.redbeard.z = 9.4;
  // Settle on the captain at the rail above the boat.
  await glide(1.4, () => ({ pos: { x: MOORED.x + 9.5, y: 6.8, z: MOORED.z + 9.5 }, target: { x: SHIP.x + HALF_BEAM - 2, y: DECK_Y + 1.5, z: SHIP.z + 9 } }));
  await say("redbeard", "Stop! Stop that boat!", "とまれ! その ふねを とめろ!");
  await say("harbor", "Oh no! Pirates!", "たいへん! かいぞくだ!");
  // Three ropes fly across as the captain shouts, and stay as the boat's mooring lines (scene/VoyageProps).
  audio.play("whip");
  void over(1.2, (k) => { vy.ropes = Math.max(vy.ropes, k); });
  await say("redbeard", "Ropes, crew! Bring them here!", "ロープだ! つれてこい!");
  vy.ropes = 1;
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
  g.x = HUDDLE_PARTY.gull.x; g.z = HUDDLE_PARTY.gull.z; g.air = 0; g.yaw = Math.atan2(HUDDLE.x - g.x, HUDDLE.z - g.z) + Math.PI;
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
