import { COMPANION_IDS, type CompanionId } from "../data/combat";
import { MONSTERS } from "../data/monsters";
import { setGame, updateProgress } from "../store";
import { animate, rt } from "../runtime";
import { DECK_Y, SHIP, SPOT, shipWorld } from "../world/pirateShip";
import { setVoyageStage } from "../logic/voyage";
import { vy, type CrewId, type Phase } from "../voyageRt";
import { L, SAIL_AIM, activeFriend, aim, setPhase, sparkleAt, steamAt, toolFx } from "../voyageSim";
import { ask, say, wait } from "./ask";
import { shot } from "./script";
import { switchTo } from "./companion";
import { ease, lerp, over, placeOnDeck, scene, setScene, until } from "./voyage";
import { cheer } from "./voyageJobs";
import { startRaft } from "./voyageRaft";
import { saveNow } from "./story";
import { audio } from "../../audio/audio";
import type { PhraseId } from "../logic/english";

/**
 * The storm (docs/PIRATE_VOYAGE.md §4): four forgiving emergencies in order,
 * none with a timer, each asking its friend with the student's line; then the
 * break-up, the lifeboats and the wave that carries everyone to the raft.
 */

const say1 = (id: PhraseId, help: string) => ask({ kind: "command", options: [id], tapAlways: true, readSentence: true, help });
let nextBolt = 0;

/** Lightning now and then while the storm blows (no draw calls: a flash and a rumble). */
function weather() {
  if (rt.time < nextBolt) return;
  nextBolt = rt.time + 4 + Math.random() * 5;
  vy.flash = rt.time;
  audio.play("rumble");
}

async function ask4Help(id: PhraseId, friend: CompanionId, by: CrewId, call: [string, string], how: [string, string]) {
  await scene(async () => {
    await say(by === "gull" ? "harbor" : by, call[0], call[1]);
    await say1(id, `「${MONSTERS[friend].name}! Can you help me?」と たのもう`);
    switchTo(friend);
    animate(friend, "yes"); audio.voice(friend, "excited");
    await say(friend, "Yes, I can!", "できるよ!");
    await say("game", how[0], how[1]);
  });
}

function friendHint(f: CompanionId) {
  return activeFriend() === f ? null : `Press ${COMPANION_IDS.indexOf(f) + 1}: ${MONSTERS[f].name}! · ${COMPANION_IDS.indexOf(f) + 1}で ${MONSTERS[f].name}`;
}

export async function startStorm() {
  if (!vy.active) setScene();
  vy.flow = 1.2; vy.cut = true; vy.sewn = 1; vy.mastFall = 0; vy.shipPitch = 0; vy.shipRoll = 0; vy.shipSink = 0; vy.lifeboats = 0;
  vy.barrels = []; vy.fires = []; vy.spar = null;
  for (const id of Object.keys(vy.crew) as CrewId[]) vy.crew[id].visible = true;
  audio.startMusic("danger");
  await scene(async () => {
    rt.player.frozen = true;
    shot({ x: L(9, 0).x, y: DECK_Y + 8, z: L(0, 16).z }, { x: L(0, 0).x, y: DECK_Y + 1.5, z: L(0, 2).z });
    const from = vy.storm;
    await over(3, (k) => { vy.storm = lerp(from, 1, ease(k)); if (k > 0.5) weather(); });
    vy.storm = 1;
    await say("redbeard", "A storm! Hold on, crew!", "あらしだ! みんな つかまれ!");
  });
  await barrels();
  await fires();
  await torn();
  await spar();
  await breakUp();
}

// ------------------------------------------------------------ 1. barrels (Leafy)

const BARREL_LANES = [{ z: 1.6, x0: -0.9, x1: 3.2 }, { z: 4.6, x0: -3.3, x1: 3.3 }, { z: 6.4, x0: -3.3, x1: 3.3 }];

async function barrels() {
  vy.barrels = BARREL_LANES.map((l, i) => ({ x: lerp(l.x0, l.x1, 0.3 + i * 0.2), z: l.z, vx: (i % 2 ? -1 : 1) * (1.4 + i * 0.3), tied: false, t0: 0 }));
  await ask4Help("leafyHelp", "leafy", "redbeard", ["Help! The barrels!", "たいへん! たるが!"], ["Go near a barrel and press J!", "たるの ちかくで J!"]);
  const phase: Phase = {
    name: "storm-barrels",
    tool(friend) {
      if (friend !== "leafy") return false;
      const b = aim(vy.barrels.filter((x) => !x.tied), (x) => L(x.x, x.z), 7, 1.0, 3.5);
      if (!b) return false;
      const w = L(b.x, b.z);
      toolFx("leafy", { x: w.x, y: DECK_Y + 0.5, z: w.z });
      b.tied = true; b.t0 = rt.time;
      sparkleAt(w.x, DECK_Y + 1, w.z); audio.play("snap");
      return true;
    },
    tick(dt) {
      weather();
      BARREL_LANES.forEach((l, i) => {
        const b = vy.barrels[i];
        if (!b || b.tied) return;
        b.x += b.vx * dt;
        if (b.x < l.x0 || b.x > l.x1) { b.vx = -b.vx; b.x = Math.max(l.x0, Math.min(l.x1, b.x)); audio.play("thud"); }
      });
      const n = vy.barrels.filter((b) => b.tied).length;
      vy.hud = { title: "Barrels", ja: "たる", count: [n, 3], hint: friendHint("leafy") ?? "Near a barrel: J · たるの ちかくで J" };
    },
  };
  setPhase(phase);
  await until(() => vy.barrels.every((b) => b.tied));
  setPhase(null);
  await scene(async () => { cheer("redbeard", "bill"); animate("leafy", "yes"); await say("redbeard", "Good job, Leafy!", "よくやった、リーフィー!"); });
}

// ------------------------------------------------------------ 2. fires (Bubbo)

async function fires() {
  await scene(async () => {
    rt.player.frozen = true;
    shot({ x: L(8, 0).x, y: DECK_Y + 9, z: L(0, 14).z }, { x: L(0, 0).x, y: DECK_Y, z: L(0, 3).z });
    for (const [x, z] of [[-2.6, 5.2], [2.5, 8.6], [1.6, 0.6]]) {
      vy.flash = rt.time; audio.play("rumble");
      vy.fires.push({ x, z, out: false, t0: 0 });
      audio.play("crackle");
      await wait(500);
    }
  });
  await ask4Help("bubboHelp", "bubbo", "pepper", ["Fire! Fire!", "かじだ! かじだ!"], ["Face a fire and press J!", "ひの ほうを むいて J!"]);
  const phase: Phase = {
    name: "storm-fires",
    tool(friend) {
      if (friend !== "bubbo") return false;
      const f = aim(vy.fires.filter((x) => !x.out && !x.t0), (x) => L(x.x, x.z), 8, 0.9, 3.5);
      if (!f) return false;
      const w = L(f.x, f.z);
      toolFx("bubbo", { x: w.x, y: DECK_Y + 0.4, z: w.z });
      f.t0 = rt.time + 0.45;
      return true;
    },
    tick() {
      weather();
      for (const f of vy.fires) if (!f.out && f.t0 && rt.time >= f.t0) {
        f.out = true;
        const w = L(f.x, f.z);
        steamAt(w.x, DECK_Y + 0.2, w.z);
      }
      const n = vy.fires.filter((f) => f.out).length;
      vy.hud = { title: "Fires", ja: "ひ", count: [n, 3], hint: friendHint("bubbo") ?? "Face a fire: J · ひを むいて J" };
    },
  };
  setPhase(phase);
  await until(() => vy.fires.every((f) => f.out));
  setPhase(null);
  await scene(async () => { cheer("pepper"); animate("bubbo", "yes"); await say("pepper", "Phew! Thank you, Bubbo!", "ふう! ありがとう、バボ!"); });
  vy.fires = [];
}

// ------------------------------------------------------------ 3. the torn mainsail (Puff)

async function torn() {
  vy.sewn = 0; vy.sails[1] = 0.1;
  vy.flash = rt.time; audio.play("snap");
  // Two pirates come to sew.
  vy.crew.tom.x = -0.4; vy.crew.tom.z = 4.2; vy.crew.sam.x = 2.0; vy.crew.sam.z = 4.5;
  await scene(async () => {
    rt.player.frozen = true;
    const m = L(SPOT.mainMast.x, SPOT.mainMast.z);
    shot({ x: m.x + 13, y: DECK_Y + 7, z: m.z + 4 }, { x: m.x, y: DECK_Y + 5, z: m.z + 1.5 });
    await say("redbeard", "The sail!", "ほが!");
  });
  await ask4Help("puffHelp", "puff", "redbeard", ["We need wind to sew it!", "ぬうには かぜが ひつよう!"], ["Stand near the big sail. Hold J!", "おおきな ほの ちかくで Jを おしつづけて!"]);
  let sew = 0, lastGust = -10;
  const SEW = 3;
  const phase: Phase = {
    name: "storm-sail",
    tool(friend) {
      const m = L(SPOT.mainMast.x, SPOT.mainMast.z);
      return friend === "puff" && Math.hypot(rt.player.x - m.x, rt.player.z - m.z) < 7;
    },
    tick(dt) {
      weather();
      // Broadside, like the sailing job, so the torn sail is seen filling.
      const p = rt.player;
      shot({ x: p.x + 15, y: DECK_Y + 7.5, z: p.z + 3.5 }, { x: p.x - 1.5, y: DECK_Y + 3.6, z: p.z - 1 });
      const m = L(SPOT.mainMast.x, SPOT.mainMast.z), s = SAIL_AIM[1], w = L(s.x, s.z);
      const working = vy.hold && activeFriend() === "puff" && Math.hypot(rt.player.x - m.x, rt.player.z - m.z) < 7;
      vy.sails[1] = Math.max(0.1, Math.min(1, vy.sails[1] + (working ? dt * 0.9 : -dt * 0.45)));
      if (working && rt.time - lastGust > 0.3) { lastGust = rt.time; toolFx("puff", { x: w.x, y: s.y, z: w.z }); }
      if (vy.sails[1] >= 0.9) {
        sew += dt;
        if (Math.random() < dt * 3) { cheer("tom", "sam"); sparkleAt(m.x + (Math.random() - 0.5) * 2, DECK_Y + 2 + Math.random() * 3, m.z + 1.5); }
      }
      if (sew >= SEW && vy.sewn < 1) { vy.sewn = 1; vy.sails[1] = 1; audio.play("correct"); }
      vy.hud = { title: "Sail", ja: "ほ", value: vy.sails[1], band: [0.9, 1], hint: friendHint("puff") ?? `Hold J: keep it full! ${Math.round(Math.min(1, sew / SEW) * 100)}% · Jで いっぱいに` };
    },
  };
  vy.cut = false;
  setPhase(phase);
  await until(() => vy.sewn >= 1);
  setPhase(null);
  vy.cut = true;
  await scene(async () => { cheer("redbeard", "tom", "sam"); animate("puff", "yes"); await say("tom", "We fixed it! Thank you, Puff!", "なおった! ありがとう、パフ!"); });
  vy.crew.tom.x = SPOT.crew[0].x; vy.crew.tom.z = SPOT.crew[0].z; vy.crew.sam.x = SPOT.crew[1].x; vy.crew.sam.z = SPOT.crew[1].z;
}

// ------------------------------------------------------------ 4. the fallen spar (Leafy)

const PINNED = { x: -1.8, z: -11.4 };

async function spar() {
  vy.crew.max.x = PINNED.x; vy.crew.max.z = PINNED.z; vy.crew.max.yaw = 0.4;
  await scene(async () => {
    rt.player.frozen = true;
    vy.flash = rt.time; audio.play("snap");
    vy.spar = { x: PINNED.x + 0.2, z: PINNED.z + 0.3, lift: 0 };
    audio.play("thud");
    await say("max", "Help me!", "たすけて!");
    await say1("whereIsHe", "「Where is he?」と きこう");
    const w = L(PINNED.x, PINNED.z);
    shot({ x: w.x + 5, y: DECK_Y + 5.5, z: w.z + 7 }, { x: w.x, y: DECK_Y + 0.8, z: w.z });
    await say("redbeard", "Over there! At the front!", "あそこだ! まえの ほう!");
    switchTo("leafy");
    await say("game", "Leafy! Go to him and press J to lift the spar!", "リーフィー! そばへ いって Jで もちあげよう!");
  });
  const phase: Phase = {
    name: "storm-spar",
    tool(friend) {
      if (friend !== "leafy" || !vy.spar || vy.spar.lift > 0) return false;
      const w = L(vy.spar.x, vy.spar.z);
      if (Math.hypot(rt.player.x - w.x, rt.player.z - w.z) > 6) return false;
      toolFx("leafy", { x: w.x, y: DECK_Y + 0.4, z: w.z });
      vy.spar.lift = 0.01; audio.play("creak");
      return true;
    },
    tick(dt) {
      weather();
      if (vy.spar && vy.spar.lift > 0 && vy.spar.lift < 1) vy.spar.lift = Math.min(1, vy.spar.lift + dt * 0.8);
      vy.hud = { title: "Help Max!", ja: "マックスを たすけよう", hint: friendHint("leafy") ?? "Go to the front. J! · まえへ いって J" };
    },
  };
  setPhase(phase);
  await until(() => (vy.spar?.lift ?? 1) >= 1);
  setPhase(null);
  await scene(async () => {
    vy.spar = null; cheer("max");
    animate("leafy", "yes");
    await say("max", "Thank you! You saved me!", "ありがとう! たすかった!");
  });
  vy.crew.max.x = SPOT.crew[2].x; vy.crew.max.z = SPOT.crew[2].z;
}

// ------------------------------------------------------------ the break-up

async function breakUp() {
  await scene(async () => {
    rt.player.frozen = true;
    placeOnDeck(shipWorld({ x: -0.6, z: 13.2 }));
    rt.player.yaw = Math.PI;
    for (const id of COMPANION_IDS) rt.monsters[id].mode = "script";
    vy.cut = false;
    shot({ x: SHIP.x + 20, y: 10, z: SHIP.z + 24 }, { x: SHIP.x, y: 3, z: SHIP.z - 1 });
    vy.flash = rt.time; audio.play("rumble");
    await say("redbeard", "Oh no! The mast!", "たいへん! マストが!");
    audio.play("snap");
    await over(1.8, (k) => { vy.mastFall = ease(k); });
    audio.play("thud");
    await over(1.6, (k) => { const e = ease(k); vy.shipPitch = -0.07 * e; vy.shipRoll = 0.05 * e; vy.shipSink = 0.5 * e; });
    await say("redbeard", "Abandon ship! To the lifeboats!", "ふねを すてろ! きゅうめいボートへ!");
    for (const id of Object.keys(vy.crew) as CrewId[]) vy.crew[id].visible = false;
    vy.lifeboats = 0.02; vy.boatMoored = false;
    await say("harbor", "Hold on, friends! I'll find you!", "みんな、がんばって! かならず みつけるよ!");
    await over(3.5, (k) => { vy.lifeboats = 0.02 + 0.98 * k; });
    await say("redbeard", "Good luck, crew!", "がんばれ、なかまたち!");
    vy.flash = rt.time;
    await say("game", "A big wave!", "おおきな なみ!");
    setGame({ fade: 1 });
    await wait(500);
  });
  updateProgress((p) => setVoyageStage(p, "raft"));
  saveNow();
  await startRaft();
}
