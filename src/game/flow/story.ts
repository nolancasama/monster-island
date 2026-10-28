import { MONSTERS, LIVE_MONSTERS } from "../data/monsters";
import { FOODS } from "../data/foods";
import { companions, friends, gateOpen, GATES, newProgress, objective, type Progress } from "../logic/progress";
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
import { cb, resetCombat } from "../combat";
import { CLIFF_ROPE, CHESTS, zoneAt } from "../world/lowland";
import { gatherParty, kidnapScene, placeMapleForAct2, startAct2Scene } from "./act2";
import type { ObstacleId } from "../types";

/**
 * Starting, continuing, saving, the intro with Professor Maple, Maple's
 * hints, the Phase 1 ending at the Monster Stone (which opens the forest),
 * the Phase 2 ending on the cliff top (both celebrate with a banner and play
 * on) and the finale, the only ending with a results card.
 */

// ------------------------------------------------------------ save

let lastSaved = "";

export function saveNow() {
  const g = getGame();
  if (g.screen === "title") return;
  const p = rt.player;
  // Never save mid-ride or mid-climb: resume at the bank or the foot of the rope instead.
  // The cliff rope below the sanctuary resumes on its ledge.
  const climbAt = p.z < -140 ? CLIFF_ROPE.top : { x: ROPE.x, z: ROPE.z + 1.4 };
  const at = p.riding ? { x: CROSSING.west.x, z: CROSSING.west.z } : p.climbY !== null ? climbAt : { x: p.x, z: p.z };
  // Act 2's live HP and MP are written in with the rest of the progress.
  const progress = g.progress.act2.started ? { ...g.progress, act2: { ...g.progress.act2, hp: Math.round(cb.vitals.hp), mp: { ...cb.vitals.mp }, zone: zoneAt(p.x, p.z) } } : g.progress;
  const text = encodeSave(progress, { x: at.x, z: at.z, yaw: p.yaw }, Math.round(rt.playTime));
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
  rt.lava = p.solved.includes("lava") ? 1 : 0;
  rt.cave = p.solved.includes("cave") ? 1 : 0;
  for (const id of GATES) rt.pillars[id] = p.solved.includes(id) ? 1 : 0;
  rt.gate = gateOpen(p) ? 1 : 0;
  rt.starGlow = p.endings >= 3 ? 1 : 0;
  rt.finale = p.endings >= 3 ? "complete" : "idle";
  rt.monsters.lumo.mode = gateOpen(p) ? "idle" : "sleep";
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
  // Act 2: the cliff rope, the lowland's unlocks and opened chests; Maple and the friends travel with the story.
  if (p.act2.started) {
    rt.cliffRope = 1;
    rt.act2Scene = "done";
    for (const id of Object.keys(rt.act2Unlock) as ObstacleId[]) rt.act2Unlock[id] = p.solved.includes(id) ? 1 : 0;
    for (const c of CHESTS) if (p.act2.chests.includes(c.id)) rt.chestLid.set(c.id, 1);
    placeMapleForAct2();
    gatherParty();
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
    fade: 1,
    banner: null,
    panel: null
  });
  resetCombat();
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
  setGame({ screen: "game", mode: "explore", progress: p, journalOpen: false, settingsOpen: false, fade: 0, hint: null, banner: null, panel: null });
  resetCombat();
  applyWorld(p);
  await beginAudio();
  if (!p.metMaple) void intro();
}

/** Title screen, a finished prologue: straight to the sanctuary, where the new chapter begins. */
export async function startAct2FromTitle() {
  await continueGame();
  const p = getGame().progress;
  if (p.act2.started || p.endings < 3) return;
  const h = MONSTERS.lumo.home;
  const safe = nearestWalkable(h.x, h.z + 5, PLAYER_R, gatesOf(p));
  rt.player.x = safe.x;
  rt.player.z = safe.z;
  rt.player.yaw = Math.PI;
  rt.camera.snap = true;
  await startAct2Scene();
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
    // The final phase's short hints also work when Maple is reached by radio.
    let phase3Hint: [string, string] | undefined;
    if (o.id === "obstacle") phase3Hint = ({
      lava: ["It's hot! Who can help cool the lava?", "あつい! みずを だせる ともだちは だれ?"],
      cave: ["It's dark! Who can make fire?", "くらい! ひを つけられる ともだちは だれ?"],
      gateLeaf: ["A leaf! Ask a friend to help it grow.", "はっぱだ! しょくぶつを そだてる ともだちに きこう"],
      gateDrop: ["A drop! Who can swim? Fill the basin!", "しずくだ! およげる ともだちに みずを いれてもらおう"],
      gateWing: ["Wings! Who can fly to the bell?", "つばさだ! かねまで とべる ともだちは だれ?"],
      gateFlame: ["A flame! Who can make fire?", "ほのおだ! ひを つけられる ともだちは だれ?"]
    } as Record<string, [string, string]>)[o.obstacle];
    else if (o.id === "findMonster" && o.monster === "ember") phase3Hint = ["Look by the hot rocks. A monster likes meat!", "あつい いわの ちかくを みて! おにくが すきな モンスターだよ"];
    else if (o.id === "findMonster" && o.monster === "lumo") phase3Hint = ["A gentle monster is awake in the garden!", "にわで やさしい モンスターが おきたよ!"];
    else if (o.id === "describe" && o.line === "name") phase3Hint = ["Ask: What's your name?", "なまえを きいてみよう!"];
    else if (o.id === "letsGo") phase3Hint = ["Say: Let's go! Ember will come with you.", "エンバーに いっしょに いこうと いってみよう!"];
    else if (o.id === "askBack") phase3Hint = ["Do you like monsters? Tell your new friend!", "モンスターが すき? きみの こたえを いってみよう!"];
    else if (o.id === "finale") phase3Hint = ["Look! Lumo is shining!", "みて! ルモが ひかっているよ!"];
    else if (o.id === "explore" && p.endings >= 3) phase3Hint = ["You are a Monster Friend! Enjoy the island!", "モンスターフレンドだね! しまを たんけんしよう!"];
    // Act 2.
    else if (o.id === "act2Start") phase3Hint = ["Let's go and see Lumo in the garden!", "にわの ルモに あいに いこう!"];
    else if (o.id === "descend") phase3Hint = ["Climb down the rope at the cliff!", "がけの ロープを おりよう!"];
    else if (o.id === "openChest") phase3Hint = ["Follow the path. Look for a treasure chest!", "みちを すすんで たからばこを さがそう!"];
    else if (o.id === "rest") phase3Hint = ["Rest at the camp. Then choose a path!", "キャンプで やすもう。それから みちを えらぼう!"];
    else if (o.id === "reachPort") phase3Hint = ["Go north to the port. The grove or the canopy, both are OK!", "きたの みなとへ。どちらの みちでも いけるよ!"];
    else if (o.id === "market") phase3Hint = ["Buy food at the market: I want apples, please.", "おみせで「I want apples, please.」と いって かおう!"];
    else if (o.id === "kitchen") phase3Hint = ["Make a monster treat in the kitchen!", "キッチンで モンスターの おやつを つくろう!"];
    else if (o.id === "harbor") phase3Hint = ["Ask at the harbor office: Where is the ship?", "みなとの じむしょで「Where is the ship?」と きこう!"];
    else if (o.id === "act2Done") phase3Hint = ["Lumo is on Cloud Isle. We'll sail there soon!", "ルモは クラウドじまに いる。もうすぐ ふねで いこう!"];
    if (phase3Hint) {
      await say("maple", ...phase3Hint);
      m.talking = false;
      return;
    }
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
    // Only the final ending has a results card: the beach chapter celebrates
    // with a banner and play carries straight on toward the forest.
    toast({ en: "Beach Adventure: Clear!", ja: "はまべの ぼうけん クリア! もりへ いこう!", icon: "star", tone: "chapter" }, 4200);
    audio.play("sparkle");
    await fadeThrough(resumeExploring);
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
    // From the south-west corner of the cliff top: the group in front, the
    // whole volcano beyond, crater and smoke inside the top of the frame.
    shot({ x: top.x - 4, y: gy + 2.2, z: top.z + 3 }, { x: top.x + Math.sin(toV) * 30, y: gy + 7.5, z: top.z + Math.cos(toV) * 30 });
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
  await say("maple", "One more monster lives on the volcano. Let's find it!", "かざんに あと 1ぴき モンスターが いる。その モンスターを さがそう!");
  setGame((g) => ({ progress: { ...g.progress, endings: 2 } }));
  saveNow();
  toast({ en: "Forest Adventure: Clear!", ja: "もりの ぼうけん クリア! かざんへ いこう!", icon: "star", tone: "chapter" }, 4200);
  audio.play("sparkle");
  await fadeThrough(resumeExploring);
}

/** The final ending stays in the sanctuary, including the results backdrop. */
export function finaleEnding(): Promise<void> {
  return run(async () => {
    if (objective(getGame().progress).id !== "finale") return;
    const h = MONSTERS.lumo.home;
    const gy = groundY(h.x, h.z);
    const lumo = rt.monsters.lumo;
    rt.player.frozen = true;
    await fadeThrough(() => {
      rt.player.x = h.x;
      rt.player.z = h.z + 5;
      rt.player.vx = rt.player.vz = 0;
      rt.player.yaw = Math.PI;
      companions(getGame().progress).forEach((id, i) => {
        const m = rt.monsters[id];
        m.mode = "script";
        m.x = h.x - 3.6 + i * 2.4;
        m.z = h.z + 5.5;
        m.look = h;
      });
      lumo.mode = "script";
      lumo.x = h.x;
      lumo.z = h.z;
      lumo.yaw = 0;
      shot({ x: h.x + 8, y: gy + 5.3, z: h.z + 6 }, { x: h.x, y: gy + 3.8, z: h.z + 0.8 });
    }, 300);
    rt.finale = "rise";
    audio.startMusic("celebrate");
    audio.play("stone");
    animate("lumo", "power");
    const t0 = rt.time;
    let burst = 0;
    while (rt.time - t0 < 3) {
      const k = Math.min(1, (rt.time - t0) / 3);
      lumo.air = lumo.airTarget = k * 5;
      rt.stoneGlow.ember = k;
      rt.starGlow = k;
      if (k > burst * 0.2) {
        burst++;
        effect("sparkle", h.x, gy + 2 + lumo.air, h.z);
        audio.play("sparkle");
      }
      await wait(30);
    }
    rt.stoneGlow.ember = rt.starGlow = 1;
    await say("lumo", "Thank you, my friend!", "ありがとう、ともだち!");
    await fadeThrough(() => {
      rt.maple.x = h.x - 2.5;
      rt.maple.z = h.z + 3.5;
      rt.maple.yaw = Math.atan2(rt.player.x - rt.maple.x, rt.player.z - rt.maple.z);
      rt.player.yaw = Math.atan2(rt.maple.x - rt.player.x, rt.maple.z - rt.player.z);
      // The camera and the speaking group are inside the gate. Friends move
      // behind the two-shot so the closest big monster cannot cover Maple.
      companions(getGame().progress).forEach((id, i) => {
        const m = rt.monsters[id];
        m.x = h.x - 4 + i * 2.6;
        m.z = h.z + 0.7;
        m.look = rt.maple;
      });
      shot({ x: h.x + 4.5, y: gy + 3, z: h.z + 6.8 }, { x: h.x - 1, y: gy + 1.2, z: h.z + 3.8 });
    });
    rt.finale = "maple";
    rt.maple.talking = true;
    rt.maple.wave = rt.time;
    await say("maple", "The island is safe!", "しまは もう だいじょうぶ!");
    await say("maple", "You are a Monster Friend!", "きみは モンスターフレンドだよ!");
    await say("maple", "All five monsters are your friends!", "5ひき みんなが きみの ともだち!");
    rt.maple.talking = false;
    setGame((g) => ({ progress: { ...g.progress, endings: 3 } }));
    rt.finale = "complete";
    saveNow();
    // The prologue's end is no longer The End: the raiders come for Lumo (Act 2).
    await kidnapScene(true);
  });
}

/**
 * Back to free play after an ending: Maple goes home, friends gathered for
 * the scene go home too, the companion falls in beside the player.
 */
function resumeExploring() {
  rt.maple.x = MAPLE.x;
  rt.maple.z = MAPLE.z;
  rt.maple.yaw = MAPLE.yaw;
  const active = getGame().progress.active;
  for (const id of LIVE_MONSTERS) {
    const m = rt.monsters[id];
    m.look = null;
    m.air = m.airTarget = 0;
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
}

/** "Keep exploring" from the final results card. */
export function keepExploring() {
  resumeExploring();
  setGame({ screen: "game", mode: "explore" });
}

export function toTitle() {
  saveNow();
  tts.cancel();
  setGame({ screen: "title", mode: "busy", hasSave: hasSaved(), journalOpen: false, settingsOpen: false, prompt: null, line: null });
}
