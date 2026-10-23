import { MONSTERS, LIVE_MONSTERS } from "../data/monsters";
import { FOODS } from "../data/foods";
import { friends, newProgress, objective, type Progress } from "../logic/progress";
import { clearSave, encodeSave, readSave, writeSave } from "../logic/save";
import { getGame, setGame, toast, useGame } from "../store";
import { animate, effect, resetRuntime, rt } from "../runtime";
import { BRAMBLE, CLIFF_TOP_SPOT, CROSSING, MAPLE, MONSTER_STONE, ROPE, SPAWN, VOLCANO, groundY } from "../world/island";
import { PLAYER_R, gatesOf, isWalkable, nearestWalkable } from "../world/collision";
import { say, wait } from "./ask";
import { fadeThrough, frameTwo, run, shot } from "./script";
import { poofTo, besidePlayer } from "./companion";
import { audio } from "../../audio/audio";
import { tts } from "../../audio/tts";
import { recognition, requestMicPermission } from "../../audio/recognition";

/**
 * Starting, continuing, saving, the intro with Professor Maple, Maple's
 * hints, the Phase 1 ending at the Monster Stone (which opens the forest)
 * and the Phase 2 ending on the cliff top.
 */

// ------------------------------------------------------------ save

let lastSaved = "";

export function saveNow() {
  const g = getGame();
  if (g.screen === "title") return;
  const p = rt.player;
  // Never save mid-ride or mid-climb: resume at the bank or the foot of the rope instead.
  const at = p.riding ? { x: CROSSING.west.x, z: CROSSING.west.z } : p.climbY !== null ? { x: ROPE.x, z: ROPE.z + 1.4 } : { x: p.x, z: p.z };
  const text = encodeSave(g.progress, { x: at.x, z: at.z, yaw: p.yaw }, Math.round(rt.playTime));
  if (text === lastSaved) return;
  lastSaved = text;
  writeSave(text);
}

/** Save whenever progress changes (and every few seconds for the position). */
export function installAutosave(): () => void {
  const unsub = useGame.subscribe((s, prev) => {
    if (s.progress !== prev.progress && s.screen !== "title") saveNow();
  });
  const timer = window.setInterval(saveNow, 5000);
  return () => {
    unsub();
    window.clearInterval(timer);
  };
}

export function hasSaved(): boolean {
  return readSave() !== null;
}

// ------------------------------------------------------------ start

/** Put the world in line with saved progress (palm moved, stones up, bridge fixed, rope up, companion beside you). */
function applyWorld(p: Progress) {
  rt.palm = rt.palmTarget = p.solved.includes("fallenPalm") ? 1 : 0;
  rt.vines = rt.palm;
  rt.stones = rt.stonesTarget = p.solved.includes("river") ? 1 : 0;
  rt.bridge = rt.bridgeTarget = p.solved.includes("bridge") ? 1 : 0;
  rt.rope = p.solved.includes("cliff") ? 1 : 0;
  rt.bramble = rt.brambleTarget = p.endings >= 1 ? 0 : 1;
  for (const id of LIVE_MONSTERS) {
    rt.monsters[id].noticed = p.monsters[id].discovered;
    // A symbol lights at its phase's ending.
    rt.stoneGlow[id] = p.endings >= MONSTERS[id].phase && p.monsters[id].friend ? 1 : 0;
  }
  if (p.active) {
    const m = rt.monsters[p.active];
    m.mode = "follow";
    const spot = nearestWalkable(rt.player.x - 1.4, rt.player.z + 0.6, MONSTERS[p.active].radius, gatesOf(p));
    m.x = spot.x;
    m.z = spot.z;
  }
}

async function beginAudio() {
  audio.unlock();
  const s = getGame().settings;
  audio.setVolumes(s.music, s.sfx);
  tts.setRate(s.slowVoice ? 0.8 : 1);
  audio.startAmbience();
  audio.startMusic("island");
  // The microphone is requested once, up front (never mid-sentence). The intro
  // plays while the browser's permission bubble waits; the first prompt is
  // minutes away.
  if (s.mic && getGame().micState === "unknown") {
    if (!recognition.supported) setGame({ micState: "unsupported" });
    else
      void requestMicPermission(8000).then((r) => {
        if (getGame().micState === "unknown") setGame({ micState: r === "granted" ? "ready" : r === "timeout" ? "unknown" : "blocked" });
      });
  }
}

export async function newGame() {
  clearSave();
  lastSaved = "";
  resetRuntime();
  setGame({
    screen: "game",
    mode: "busy",
    progress: newProgress(),
    journalOpen: false,
    settingsOpen: false,
    discovering: null,
    friendCard: null,
    hint: null,
    journalPulse: false,
    fade: 1
  });
  rt.camera.snap = true;
  await beginAudio();
  void intro();
}

export async function continueGame() {
  const save = readSave();
  if (!save) return newGame();
  resetRuntime();
  const p = save.progress;
  const gates = gatesOf(p);
  const spot = Number.isFinite(save.player.x) && isWalkable(save.player.x, save.player.z, gates, PLAYER_R) ? save.player : SPAWN;
  const safe = nearestWalkable(spot.x, spot.z, PLAYER_R, gates);
  rt.player.x = safe.x;
  rt.player.z = safe.z;
  rt.player.yaw = save.player.yaw;
  rt.playTime = save.seconds;
  rt.camera.snap = true;
  setGame({ screen: "game", mode: "explore", progress: p, journalOpen: false, settingsOpen: false, fade: 0, hint: null });
  applyWorld(p);
  await beginAudio();
  if (!p.metMaple) void intro();
}

// ------------------------------------------------------------ intro

async function intro() {
  await run(async () => {
    setGame({ fade: 0 });
    const m = rt.maple;
    frameTwo(rt.player, m, 0.95);
    m.wave = rt.time;
    await wait(700);
    m.talking = true;
    await say("maple", "Welcome to Monster Island!", "モンスターアイランドへ ようこそ!");
    await say("maple", "Let's find some monsters!", "モンスターを さがそう!");
    await say("maple", "Make new friends!", "あたらしい ともだちを つくろう!");
    setGame({ journalPulse: true });
    audio.play("journal");
    await say("maple", "Here is your Monster Journal.", "これが きみの モンスターずかん だよ。(M キー / 📖 ボタン)");
    m.talking = false;
    setGame((s) => ({ progress: { ...s.progress, metMaple: true } }));
    setGame({ hint: "move" });
  });
}

// ------------------------------------------------------------ Maple's hints

/** E on Maple: one line about the current objective. */
export function talkToMaple(): Promise<void> {
  return run(async () => {
    const m = rt.maple;
    frameTwo(rt.player, m);
    m.talking = true;
    const p = getGame().progress;
    const o = objective(p);
    if (o.id === "meetMaple") {
      m.talking = false;
      return;
    }
    const name = (id: keyof typeof MONSTERS) => MONSTERS[id].name;
    switch (o.id) {
      case "findMonster":
        if (o.monster === "leafy") await say("maple", "Monsters like food. Look near the apple trees!", "モンスターは たべものが すき。りんごの木の ちかくを さがしてみて!");
        else if (o.monster === "bubbo") await say("maple", "A water monster lives by the river!", "かわの ちかくに みずの モンスターが いるよ!");
        else await say("maple", "A shy monster lives on the forest hills. Look up in the trees!", "もりの おかに はずかしがりやの モンスターが いるよ。木の 上を みてみて!");
        break;
      case "describe":
        await say("maple", `Tell me about ${name(o.monster)}! Look at it.`, `${name(o.monster)}の ことを えいごで ずかんに かこう!`);
        break;
      case "askFood":
        await say("maple", `Ask ${name(o.monster)}: "Do you like ...?"`, `${name(o.monster)}に「Do you like ...?」と きいてみよう!`);
        break;
      case "getFood":
        await say("maple", `${name(o.monster)} likes ${FOODS[o.food].word}. Find some!`, `${FOODS[o.food].ja}を さがそう! ★の ところに あるよ`);
        break;
      case "giveFood":
        await say("maple", `Give ${FOODS[o.food].word} to ${name(o.monster)}!`, `${name(o.monster)}に ${FOODS[o.food].ja}を あげよう!`);
        break;
      case "obstacle":
        if (o.obstacle === "fallenPalm") await say("maple", "A palm tree fell on the path. Ask your monster friend!", "みちに ヤシの木が たおれている。モンスターに「Can you help me?」と きいてみよう!");
        else if (o.obstacle === "river") {
          if (o.helper && p.active !== o.helper) await say("maple", `Who can swim? Choose ${name(o.helper)} in your journal!`, `およげるのは だれ? ずかんで ${name(o.helper)}を えらぼう!`);
          else await say("maple", "Go to the river and ask!", "かわへ いって きいてみよう!");
        } else if (o.obstacle === "bridge") {
          if (o.helper && p.active !== o.helper) await say("maple", `The forest bridge is broken. Who can help? Choose ${name(o.helper)}!`, `もりの はしが こわれている。ずかんで ${name(o.helper)}を えらぼう!`);
          else await say("maple", "Go into the forest. The bridge is broken. Ask your friend!", "もりへ いこう。こわれた はしで「Can you help me?」と きいてみよう!");
        } else if (o.helper && p.active !== o.helper) await say("maple", `Who can fly? Choose ${name(o.helper)} in your journal!`, `とべるのは だれ? ずかんで ${name(o.helper)}を えらぼう!`);
        else await say("maple", "The cliff is very high. Who can fly?", "がけが たかい! とべる モンスターに きいてみよう!");
        break;
      case "stone":
        await say("maple", "What is that old stone across the river?", "かわの むこうの ふるい いしは なんだろう?");
        break;
      case "cliffTop":
        await say("maple", "Climb the rope! What can you see?", "ロープを のぼろう! なにが みえるかな?");
        break;
      default:
        if (p.endings >= 2) await say("maple", "One more monster lives on the volcano!", "かざんに あと 1ぴき モンスターが いるよ!");
        else await say("maple", "Two more monsters live on this island!", "この しまには あと 2ひき モンスターが いるよ!");
    }
    m.talking = false;
  });
}

export function readSign(): Promise<void> {
  return run(async () => {
    if (getGame().progress.endings >= 1) await say("self", "The forest! The path is open.", "もりだ! みちが ひらいている。");
    else await say("self", "The forest! The path is closed. Not yet!", "もりだ! でも みちが ふさがっている。まだ いけないみたい。");
  });
}

// ------------------------------------------------------------ ending

/** The Monster Stone: the Phase 1 ending. */
export function stoneEnding(): Promise<void> {
  return run(async () => {
    const p = getGame().progress;
    const s = MONSTER_STONE;
    const gy = groundY(s.x, s.z);
    rt.player.frozen = true;
    // A fixed staging in front of the stone: the player in the middle, friends either side.
    const stand = { x: s.x - 0.3, z: s.z + 3.6 };
    await fadeThrough(() => {
      rt.player.x = stand.x;
      rt.player.z = stand.z;
      rt.player.vx = rt.player.vz = 0;
      rt.player.yaw = Math.atan2(s.x - stand.x, s.z - stand.z);
      friends(p).forEach((id, i) => {
        const m = rt.monsters[id];
        m.mode = "script";
        m.x = stand.x + (i === 0 ? -1.5 : 1.6);
        m.z = stand.z - 0.4 + i * 0.2;
        m.look = { x: s.x, z: s.z };
        m.yaw = Math.atan2(s.x - m.x, s.z - m.z);
      });
      shot({ x: s.x - 1.2, y: gy + 2.6, z: s.z + 9.5 }, { x: s.x, y: gy + 1.5, z: s.z });
    }, 300);
    audio.play("stone");
    await wait(1200);
    for (const id of friends(p)) {
      const t0 = rt.time;
      animate(id, "power");
      audio.voice(id, "excited");
      effect("sparkle", s.x, gy + 1.6, s.z + 0.6);
      audio.play("sparkle");
      while (rt.stoneGlow[id] < 1) {
        rt.stoneGlow[id] = Math.min(1, (rt.time - t0) / 1.2);
        await wait(30);
      }
      await wait(400);
    }
    await wait(600);
    // Maple comes over the stepping stones; everyone turns to her.
    await fadeThrough(() => {
      rt.maple.x = stand.x - 3.4;
      rt.maple.z = stand.z + 1.2;
      rt.maple.yaw = Math.atan2(rt.player.x - rt.maple.x, rt.player.z - rt.maple.z);
      rt.player.yaw = Math.atan2(rt.maple.x - rt.player.x, rt.maple.z - rt.player.z);
      for (const id of friends(p)) rt.monsters[id].look = { x: rt.maple.x, z: rt.maple.z };
      shot({ x: stand.x + 1.8, y: gy + 2.4, z: stand.z + 6.8 }, { x: stand.x - 1.6, y: gy + 0.9, z: stand.z });
    });
    audio.startMusic("celebrate");
    rt.maple.talking = true;
    rt.maple.wave = rt.time;
    const names = friends(p).map((id) => MONSTERS[id].name);
    await say("maple", "Wow! You did it!", "すごい! やったね!");
    await say("maple", `${names.join(" and ")} are your friends!`, `${names.join("と ")}は きみの ともだち!`);
    await say("maple", "Look! Two lights are still dark.", "みて! まだ 2つ ひかって いないよ。");
    await say("maple", "Two more monsters live on this island. One lives in the forest!", "この しまには あと 2ひき モンスターが いる。1ぴきは もりに いるよ!");
    rt.maple.talking = false;
    // The bramble on the forest path withers away.
    await fadeThrough(() => {
      const by = groundY(BRAMBLE.x, BRAMBLE.z);
      shot({ x: BRAMBLE.x - 2.5, y: by + 2.6, z: BRAMBLE.z + 8.5 }, { x: BRAMBLE.x, y: by + 1, z: BRAMBLE.z - 1 });
    });
    rt.brambleTarget = 0;
    audio.play("vines");
    await wait(1600);
    await say("maple", "The forest path is open now!", "もりへの みちが ひらいたよ!");
    setGame((g) => ({ progress: { ...g.progress, endings: Math.max(g.progress.endings, 1) } }));
    saveNow();
    setGame({ screen: "results", seconds: Math.round(rt.playTime) });
  });
}

/** The cliff top: the volcano in the distance, the third light, the Phase 2 ending. */
export async function cliffTopEnding(): Promise<void> {
  const p = getGame().progress;
  // Further back from the edge than where the rope arrives, so the camera stands on the cliff top too.
  const top = { x: CLIFF_TOP_SPOT.x + 1, z: CLIFF_TOP_SPOT.z - 2 };
  const gy = groundY(top.x, top.z);
  rt.player.frozen = true;
  const toV = Math.atan2(VOLCANO.x - top.x, VOLCANO.z - top.z);
  await fadeThrough(() => {
    rt.player.x = top.x;
    rt.player.z = top.z;
    rt.player.vx = rt.player.vz = 0;
    rt.player.yaw = toV;
    friends(p).forEach((id, i) => {
      const m = rt.monsters[id];
      m.mode = "script";
      const side = i === 0 ? -1.4 : i === 1 ? 1.4 : 0;
      m.x = top.x + side + Math.sin(toV) * (i === 2 ? -1.2 : 0.2);
      m.z = top.z + Math.cos(toV) * (i === 2 ? -1.2 : 0.2) + (i === 2 ? 0 : 0.6);
      m.look = { x: VOLCANO.x, z: VOLCANO.z };
      m.yaw = toV;
    });
    // From the south-west corner of the cliff top: the group on the right, the smoking volcano beyond.
    shot({ x: top.x - 4, y: gy + 2.2, z: top.z + 3 }, { x: top.x + Math.sin(toV) * 30, y: gy + 6, z: top.z + Math.cos(toV) * 30 });
  }, 300);
  audio.startMusic("celebrate");
  await wait(1400);
  for (const id of friends(p)) {
    animate(id, "yes");
    audio.voice(id, "excited");
    await wait(300);
  }
  await say("self", "Wow! A volcano!", "わあ! かざんだ!");
  // Maple calls on the radio: the player and the companion listen.
  const listener = p.active ? rt.monsters[p.active] : null;
  if (listener) {
    listener.look = { x: rt.player.x, z: rt.player.z };
    frameTwo(rt.player, listener);
  }
  await say("maple", "Can you hear me? This is Maple!", "きこえる? メイプルだよ!");
  await say("maple", "The Monster Stone has a new light!", "モンスターストーンに あたらしい ひかりが ついたよ!");
  // The stone back on the beach lights Puff's symbol (seen there afterwards).
  for (const id of friends(p)) if (MONSTERS[id].phase === 2) rt.stoneGlow[id] = 1;
  toast({ en: "A new light on the Monster Stone!", ja: "モンスターストーンが ひかった!", icon: "star", tone: "good" });
  await say("maple", "One more monster lives on the volcano. Let's find it next time!", "かざんに あと 1ぴき モンスターが いる。つぎは その モンスターを さがそう!");
  setGame((g) => ({ progress: { ...g.progress, endings: 2 } }));
  saveNow();
  setGame({ screen: "results", seconds: Math.round(rt.playTime) });
}

/** "Keep exploring" from the results card. */
export function keepExploring() {
  rt.maple.x = MAPLE.x;
  rt.maple.z = MAPLE.z;
  rt.maple.yaw = MAPLE.yaw;
  const active = getGame().progress.active;
  for (const id of LIVE_MONSTERS) {
    const m = rt.monsters[id];
    m.look = null;
    m.mode = id === active ? "follow" : "wander";
    // Friends gathered for an ending go home, except the one following.
    const home = MONSTERS[id].home;
    if (id !== active && Math.hypot(m.x - home.x, m.z - home.z) > 8) poofTo(id, home.x, home.z);
  }
  if (active) {
    const spot = besidePlayer();
    if (Math.hypot(rt.monsters[active].x - spot.x, rt.monsters[active].z - spot.z) > 4) poofTo(active, spot.x, spot.z);
  }
  audio.startMusic("island");
  rt.camera.snap = true;
  setGame({ screen: "game", mode: "explore" });
}

export function toTitle() {
  saveNow();
  tts.cancel();
  setGame({ screen: "title", mode: "busy", hasSave: hasSaved(), journalOpen: false, settingsOpen: false, prompt: null, line: null });
}
