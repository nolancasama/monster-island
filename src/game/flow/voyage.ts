import { FOODS } from "../data/foods";
import { PIRATES } from "../data/pirates";
import { COMPANION_IDS, type CompanionId } from "../data/combat";
import { banner, getGame, toast, updateProgress, type Focus } from "../store";
import { animate, rt } from "../runtime";
import { PIER2 } from "../world/lowland";
import { DECK_Y, SHIP, SPOT, inShipArea, shipWalkable, shipWorld } from "../world/pirateShip";
import { PLAYER_R } from "../world/collision";
import { foodChoices, foodOfHave, handOverFood, interrogationFoods, setVoyageStage, truthfulAnswer, voyageStage, VOYAGE_JOBS, type VoyageJob, type VoyageStage } from "../logic/voyage";
import type { Progress } from "../logic/progress";
import { voyageEpoch, vy, type CrewId } from "../voyageRt";
import { DebugScriptCancelled } from "../debugLifecycle";
import { activeFriend, currentPhase, freeTool } from "../voyageSim";
import { ask, fastMode, say, wait } from "./ask";
import { follow, frameTwo, isRunning, run, shot } from "./script";
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
export const MOORED = { x: SHIP.x + 7.4, z: SHIP.z + 5.5 };
/** Where the player stands after boarding (and resumes a saved voyage). */
export const BOARDED = shipWorld({ x: -1.4, z: 7.4 });

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
  v.active = true; v.sail = 1; v.stage = "depart"; v.x = PIER2.x; v.z = PIER2.z0 - 3; v.y = -0.1; v.yaw = Math.PI;
  rt.player.frozen = true;
  audio.startMusic("island");
  boatPose();
  await boatLeg(7, PIER2.x + 4, PIER2.z0 - 42);
  await say("harbor", "What a nice day! The sea is calm.", "いい てんきだ! うみが しずかだね。");
  await boatLeg(8, MOORED.x + 3, SHIP.z + 46);
}

async function capture() {
  const v = rt.voyage;
  // A big ship comes in fast from the south-east.
  vy.active = true; vy.shipOffset = { x: 46, z: -60 }; vy.flow = 0;
  shot({ x: v.x + 14, y: 7, z: v.z + 10 }, { x: SHIP.x + 30, y: 4, z: SHIP.z - 20 });
  await say("harbor", "Look! A big ship!", "みて! おおきな ふねだ!");
  const bx = v.x, bz = v.z;
  audio.play("whoosh");
  await over(6, (k) => {
    const e = ease(k);
    vy.shipOffset.x = lerp(46, 0, e); vy.shipOffset.z = lerp(-60, 0, e);
    v.x = lerp(bx, MOORED.x, e); v.z = lerp(bz, MOORED.z, e); v.yaw = Math.PI;
    boatPose();
    shot({ x: MOORED.x + 16, y: 9, z: MOORED.z + 18 }, { x: SHIP.x + vy.shipOffset.x * 0.6, y: 4, z: SHIP.z + vy.shipOffset.z * 0.6 });
  });
  vy.shipOffset = { x: 0, z: 0 };
  v.sail = 0.08;
  shot({ x: MOORED.x + 9, y: 6.5, z: MOORED.z + 9 }, { x: SHIP.x + 1, y: DECK_Y + 1.5, z: SHIP.z + 9 });
  vy.crew.redbeard.x = 2.6; vy.crew.redbeard.z = 9.4;
  await say("redbeard", "Stop! Stop that boat!", "とまれ! その ふねを とめろ!");
  await say("harbor", "Oh no! Pirates!", "たいへん! かいぞくだ!");
  // Three ropes fly across as the captain shouts, and stay as the boat's mooring lines (scene/VoyageProps).
  audio.play("whip");
  void over(1.2, (k) => { vy.ropes = Math.max(vy.ropes, k); });
  await say("redbeard", "Ropes, crew! Bring them here!", "ロープだ! つれてこい!");
  vy.ropes = 1;
  await boardArcs();
}

/** Everyone swings across on the ropes: arcs, never a teleport. */
async function boardArcs() {
  const v = rt.voyage, boatY = v.y + 0.75;
  // The boat stays tied alongside; from here the ship's deck carries everyone.
  v.active = false; vy.boatMoored = true; vy.cut = true;
  const p = rt.player;
  p.floatY = boatY;
  for (const id of COMPANION_IDS) vy.monY[id] = boatY;
  const deckOf: Record<CompanionId, { x: number; z: number }> = {
    leafy: shipWorld({ x: -2.7, z: 6.6 }), bubbo: shipWorld({ x: 0.9, z: 7.2 }), puff: shipWorld({ x: -0.4, z: 6.2 }), ember: shipWorld({ x: 1.9, z: 8.2 }),
  };
  shot({ x: MOORED.x + 5, y: 9, z: MOORED.z + 12 }, { x: SHIP.x + 2, y: DECK_Y + 1, z: SHIP.z + 7 });
  // The player first.
  const from = { x: p.x, z: p.z };
  audio.play("whoosh");
  await over(1.1, (k) => {
    const e = ease(k);
    p.x = lerp(from.x, BOARDED.x, e); p.z = lerp(from.z, BOARDED.z, e);
    p.floatY = lerp(boatY, DECK_Y, e) + Math.sin(k * Math.PI) * 2.6;
    p.yaw = Math.atan2(BOARDED.x - from.x, BOARDED.z - from.z);
  });
  p.floatY = null;
  // The friends, one after another.
  for (const id of COMPANION_IDS) {
    const m = rt.monsters[id], to = deckOf[id], sx = m.x, sz = m.z;
    m.mode = "script";
    audio.voice(id, "surprised");
    await over(0.8, (k) => {
      const e = ease(k);
      m.x = lerp(sx, to.x, e); m.z = lerp(sz, to.z, e);
      vy.monY[id] = lerp(boatY, DECK_Y, e) + Math.sin(k * Math.PI) * 2.2;
    });
    delete vy.monY[id];
  }
  // Gull too (his height is relative to the deck).
  vy.gullAboard = true;
  const g = vy.crew.gull, gl = { x: MOORED.x - SHIP.x, z: MOORED.z - SHIP.z };
  await over(0.9, (k) => {
    const e = ease(k);
    g.x = lerp(gl.x, SPOT.gull.x, e); g.z = lerp(gl.z, SPOT.gull.z, e); g.air = lerp(boatY - DECK_Y, 0, e) + Math.sin(k * Math.PI) * 2.2;
  });
  g.air = 0;
}

// ------------------------------------------------------------ the food interrogation

async function interrogation() {
  frameTwo(rt.player, crewWorld("redbeard"), 0.9);
  rt.player.yaw = Math.atan2(crewWorld("redbeard").x - rt.player.x, crewWorld("redbeard").z - rt.player.z);
  await say("redbeard", "Ahoy! I'm Captain Redbeard!", "やあ! わしは キャプテン・レッドビアードだ!");
  await say("redbeard", "We are hungry. Let's see your bag!", "はらぺこだ。バッグを みせろ!");
  for (const food of interrogationFoods(getGame().progress.bag)) {
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
  const choices = foodChoices(getGame().progress.bag);
  const said = await ask({ kind: "choice", options: choices, tapAlways: true, readQuestion: true,
    icons: Object.fromEntries(choices.map((c) => [c, foodOfHave(c) ?? "bag"])),
    question: { by: "redbeard", en: "What food do you have?", ja: "どんな たべものを もってる?" }, help: "もっている たべものを いおう" });
  const food = said ? foodOfHave(said) : null;
  const already = getGame().progress.act3.voyage.interrogated;
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
  const mid = shipWorld({ x: 0, z: 7.5 });
  shot({ x: mid.x + 4, y: DECK_Y + 5, z: mid.z + 8 }, { x: mid.x, y: DECK_Y + 0.8, z: mid.z - 1 });
  await say("redbeard", "What's that? Monsters!", "なんだ それは? モンスター!");
  await say("redbeard", "Monsters! Delicious!", "モンスター! おいしそう!");
  vy.crew.pepper.x = 1.4; vy.crew.pepper.z = 6.2;
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
  await say("redbeard", "Okay! Show me!", "よし! みせてみろ!");
  vy.crew.pepper.x = SPOT.cook.x; vy.crew.pepper.z = SPOT.cook.z;
  vy.crew.redbeard.x = SPOT.captain.x; vy.crew.redbeard.z = SPOT.captain.z;
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

/** J on the ship or the raft: the active friend's tool (K does nothing there). */
export function voyageAttack(slot: "basic" | "special"): boolean {
  if (!voyaging()) return false;
  if (slot !== "basic") return true;
  const friend = activeFriend();
  if (!friend) return true;
  if (!currentPhase()?.tool?.(friend)) freeTool(friend);
  return true;
}
setVoyageTool(voyageAttack);
