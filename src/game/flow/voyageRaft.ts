import { COMPANION_IDS } from "../data/combat";
import { banner, getGame, setGame, updateProgress } from "../store";
import { animate, rt } from "../runtime";
import { SEA_Y } from "../world/island";
import { CLOUD_DOCK } from "../world/cloudisle";
import { setVoyageStage, steer, safeCommand, obstacleSide, type Lane, type SteerCommand } from "../logic/voyage";
import { completeVoyage, travelCloud } from "../logic/act3";
import { vy, type Phase, type Plank } from "../voyageRt";
import { activeFriend, aim, setPhase, sparkleAt, toolFx } from "../voyageSim";
import { ask, choose, say, wait } from "./ask";
import { fadeThrough, isRunning, shot } from "./script";
import { switchTo } from "./companion";
import { ease, lerp, over, scene, until } from "./voyage";
import { arrive } from "./act3";
import { saveNow } from "./story";
import { travelCombat } from "../combat";
import { audio } from "../../audio/audio";
import type { PhraseId } from "../logic/english";

/**
 * The raft and the landing (docs/PIRATE_VOYAGE.md §5): gather three planks with
 * Leafy's vine, Bubbo tows past debris, Puff fills the little sail toward the
 * island, then Cloud Isle — where Gull's boat sails in to the dock.
 */

export const RAFT = { x: 76, z: -600 };
/** The hatch's top, where everyone on the raft stands. */
export const RAFT_Y = SEA_Y + 0.25;
/** Where pulled planks land (relative to the raft): beside it, then across its front. */
export const RAFT_SLOTS = [{ x: -1.7, z: 0, yaw: 0 }, { x: 1.7, z: 0, yaw: 0 }, { x: 0, z: -1.65, yaw: Math.PI / 2 }];
const say1 = (id: PhraseId, help: string) => ask({ kind: "command", options: [id], tapAlways: true, readSentence: true, help });

/** Everyone in place on the raft: the player frozen on the hatch, the friends around, the camera above. */
function raftHold() {
  const p = rt.player, r = vy.raft;
  p.frozen = true; p.x = r.x; p.z = r.z; p.floatY = RAFT_Y; p.vx = p.vz = 0;
  const spots: Record<string, [number, number, number]> = { leafy: [-0.75, 0.55, 0], ember: [0.75, 0.6, 0], puff: [0.1, 0.95, 0.9], bubbo: r.built >= 3 && vy.raft.sail === 0 && vy.flow > 0 ? [0, -4.2, -0.62] : [2.3, 1.3, -0.62] };
  for (const id of COMPANION_IDS) {
    const m = rt.monsters[id], [dx, dz, dy] = spots[id];
    m.mode = "script"; m.x = r.x + dx; m.z = r.z + dz; vy.monY[id] = RAFT_Y + dy; m.air = m.airTarget = 0;
  }
  raftShot();
}
const raftShot = () => shot({ x: vy.raft.x - 2.5, y: RAFT_Y + 7.5, z: vy.raft.z + 9.5 }, { x: vy.raft.x, y: RAFT_Y, z: vy.raft.z - 3.5 });

function arrowKeys(): () => void {
  const onKey = (e: KeyboardEvent) => {
    const id = e.key === "ArrowLeft" ? "turnLeft" : e.key === "ArrowRight" ? "turnRight" : e.key === "ArrowUp" ? "goStraight" : null;
    if (!id || !getGame().prompt?.choices.some((c) => c.id === id)) return;
    e.preventDefault();
    choose(id);
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}

export async function startRaft() {
  await scene(async () => {
    await fadeThrough(() => {
      // The ship is gone. A hatch floats on a calmer sea, with planks around it.
      vy.active = false; vy.sea = true; vy.boatMoored = false; vy.lifeboats = 0; vy.storm = 0.45; vy.flow = 0.15;
      vy.mastFall = 0; vy.shipPitch = vy.shipRoll = vy.shipSink = 0; vy.cut = false;
      rt.voyage.active = false;
      vy.raft = { on: true, x: RAFT.x, z: RAFT.z, built: 0, sail: 0, planks: [] };
      vy.raft.planks = ([[-6.5, -4.5], [6, -6], [-1.5, -9.5], [8, 0.5]] as Array<[number, number]>)
        .map(([x, z], i): Plank => ({ x: RAFT.x + x, z: RAFT.z + z, yaw: i * 0.9, state: "float", t0: 0, slot: -1 }));
      vy.island = 0;
      setGame({ fade: 1 });
      audio.startMusic("island");
      raftHold();
    }, 600);
    raftHold();
    await say("leafy", "Where is the ship?!", "ふねは どこ?!");
    await say("ember", "We're on a little raft!", "ちいさな いかだの うえだ!");
    await say1("weNeedWood", "「We need wood!」と いおう");
    if (activeFriend() !== "leafy") switchTo("leafy");
    await say("leafy", "How many?", "いくつ?");
    await say1("three", "「Three!」と こたえよう");
    await say("game", "Press J: Leafy's vine pulls a plank in!", "J: リーフィーの つるで いたを ひきよせよう!");
    raftHold();
  });
  raftHold();
  await gather();
  await tow();
  await sail();
  await land();
}

// ------------------------------------------------------------ 1. gather three planks

async function gather() {
  let asked = false, asking = false;
  const slotWorld = (i: number) => ({ x: vy.raft.x + RAFT_SLOTS[i].x, z: vy.raft.z + RAFT_SLOTS[i].z });
  const phase: Phase = {
    name: "raft-planks",
    tool(friend) {
      if (friend !== "leafy") return false;
      if (vy.raft.planks.some((p) => p.state === "pulled")) return false;
      const pl = aim(vy.raft.planks.filter((p) => p.state === "float"), (p) => p, 14, Math.PI, 14);
      if (!pl || vy.raft.built + vy.raft.planks.filter((p) => p.state === "pulled").length >= 3) return false;
      rt.player.yaw = Math.atan2(pl.x - rt.player.x, pl.z - rt.player.z);
      toolFx("leafy", { x: pl.x, y: SEA_Y + 0.2, z: pl.z });
      pl.state = "pulled"; pl.t0 = rt.time + 0.5; pl.slot = vy.raft.built;
      return true;
    },
    tick() {
      // A scene's end hands back the follow camera and unfreezes the player: keep everyone on the raft.
      if (!isRunning() && (!rt.player.frozen || rt.camera.mode !== "shot")) raftHold();
      for (const pl of vy.raft.planks) {
        if (pl.state !== "pulled") continue;
        const k = (rt.time - pl.t0) / 1.0;
        if (k < 0) continue;
        const s = slotWorld(pl.slot);
        if (!asked) {
          // The first plank waits by the raft until the student says where.
          const e = ease(Math.min(1, k));
          pl.x = lerp(pl.x, s.x + (s.x - vy.raft.x) * 0.9, e * 0.2); pl.z = lerp(pl.z, s.z + 1.6, e * 0.2);
          if (k >= 1 && !asking) {
            asking = true;
            void scene(async () => {
              raftHold();
              await say1("putItHere", "「Put it here!」と いおう");
              asked = true; pl.t0 = rt.time - 0.6;
              raftHold();
            });
          }
          continue;
        }
        const e = ease(Math.min(1, k));
        pl.x = lerp(pl.x, s.x, e * 0.35 + 0.05); pl.z = lerp(pl.z, s.z, e * 0.35 + 0.05);
        pl.yaw = lerp(pl.yaw, RAFT_SLOTS[pl.slot].yaw, e * 0.3);
        if (k >= 1) {
          pl.x = s.x; pl.z = s.z; pl.yaw = RAFT_SLOTS[pl.slot].yaw; pl.state = "placed";
          vy.raft.built++;
          sparkleAt(s.x, RAFT_Y + 0.3, s.z); audio.play("thud");
        }
      }
      vy.hud = { title: "Wood", ja: "いた", count: [vy.raft.built, 3], hint: activeFriend() === "leafy" ? "J: pull a plank · Jで いたを ひきよせる" : "Press 1: Leafy! · 1で リーフィー" };
    },
  };
  setPhase(phase);
  await until(() => vy.raft.built >= 3);
  setPhase(null);
  vy.raft.planks = vy.raft.planks.filter((p) => p.state === "placed");
  await scene(async () => {
    raftHold();
    for (const id of COMPANION_IDS) animate(id, "yes");
    audio.play("correct");
    await say("leafy", "The raft is ready!", "いかだが できた!");
    raftHold();
  });
}

// ------------------------------------------------------------ lanes: debris ahead of the raft

/** Steer past one thing in the water; a wrong lane is a gentle bump and a retry. */
async function dodge(i: number, kind: "rock" | "barrel", speakBy: "bubbo" | "puff"): Promise<boolean> {
  const lane = vy.lane as Lane;
  const options: Lane[] = lane === 0 ? [-1, 0, 1] : [lane, 0];
  const at = options[(i * 2 + 1) % options.length];
  const o = { id: i, kind, lane: at, z: -60, hit: 0 };
  vy.obstacles = [o];
  await over(2.2, (k) => { o.z = lerp(-60, -16, k); });
  const side = obstacleSide(lane, at);
  const what = kind === "rock" ? "A rock" : "A barrel";
  const said = (await ask({ kind: "choice", options: ["turnLeft", "goStraight", "turnRight"], tapAlways: true, readQuestion: true,
    question: { by: speakBy, en: side === "ahead" ? `${what} ahead!` : `${what} on the ${side}!`, ja: side === "ahead" ? "まえに なにか ある!" : side === "left" ? "ひだりに なにか ある!" : "みぎに なにか ある!" },
    help: "← → ↑ キーでも えらべるよ" })) as SteerCommand | null;
  const cmd: SteerCommand = said ?? "goStraight";
  const safe = safeCommand(lane, at, cmd);
  vy.lane = steer(lane, cmd);
  await over(1.6, (k) => { o.z = lerp(-16, safe ? 14 : -2, k); });
  vy.obstacles = [];
  if (!safe) {
    audio.play("bump");
    await say(speakBy, "Bump! Oops! Again!", "ゴツン! もう いちど!");
    return false;
  }
  audio.play("correct");
  return true;
}

// ------------------------------------------------------------ 2. Bubbo tows

async function tow() {
  await scene(async () => {
    raftHold();
    await say1("canSwim", "バボに「Can you swim?」");
    animate("bubbo", "yes");
    await say("bubbo", "Yes, I can!", "できるよ!");
    await say1("canHelp", "「Can you help me?」と たのもう");
    await say("bubbo", "Yes! Hold on!", "うん! つかまって!");
    switchTo("bubbo");
    vy.flow = 1; vy.lane = 0; vy.laneVis = 0; vy.storm = 0.3;
    raftHold();
    const stop = arrowKeys();
    try {
      const kinds: Array<"rock" | "barrel"> = ["barrel", "rock", "barrel", "rock", "barrel"];
      for (let i = 0; i < kinds.length; i++) {
        for (;;) { const ok = await dodge(i, kinds[i], "bubbo"); raftHold(); if (ok) break; }
      }
    } finally { stop(); }
    vy.flow = 0.2;
    animate("bubbo", "no");
    await say("bubbo", "I'm tired!", "つかれた〜!");
    raftHold();
  });
}

// ------------------------------------------------------------ 3. Puff's sail, toward the island

async function sail() {
  await scene(async () => {
    raftHold();
    await say1("puffHelp", "「Puff! Can you help me?」と たのもう");
    switchTo("puff");
    animate("puff", "yes");
    await say("puff", "Yes, I can!", "できるよ!");
    await over(1.2, (k) => { vy.raft.sail = k; });
    vy.flow = 0.9; vy.storm = 0.15;
    raftHold();
    // The island shows ahead; three turns toward it, then stop in the shallows.
    await over(1.5, (k) => { vy.island = k; });
    const sides: Array<"left" | "right"> = ["left", "right", "left"];
    for (const side of sides) {
      vy.islandSide = side === "left" ? -1 : 1;
      for (;;) {
        const said = await ask({ kind: "choice", options: ["turnLeft", "goStraight", "turnRight"], tapAlways: true, readQuestion: true,
          question: { by: "puff", en: `The island is on the ${side}!`, ja: side === "left" ? "しまは ひだり!" : "しまは みぎ!" }, help: "しまの ほうへ!" });
        if (said === (side === "left" ? "turnLeft" : "turnRight")) break;
        await say("puff", `Hmm... the island is on the ${side}!`, side === "left" ? "うーん… しまは ひだりだよ!" : "うーん… しまは みぎだよ!");
      }
      audio.play("whoosh");
      await over(1.4, (k) => { vy.islandSide = lerp(vy.islandSide, 0, k); });
    }
    await say("puff", "Shallow water! Say stop!", "あさい! 「Stop!」と いって!");
    await say1("cmdStop", "「Stop!」と いおう");
    await over(1.2, (k) => { vy.flow = lerp(0.9, 0, k); });
    raftHold();
  });
}

// ------------------------------------------------------------ 4. land on Cloud Isle

async function land() {
  await scene(async () => {
    raftHold();
    vy.storm = 0;
    await say("puff", "Look! An island!", "みて! しまだ!");
    await say1("where", "「Where?」と きこう");
    await say("puff", "Over there!", "あそこ!");
    await say1("letsGo", "「Let's go!」と いおう");
    await fadeThrough(() => {
      // Cloud Isle: the raft runs onto the beach by the dock and the friends hop ashore.
      rt.world = "cloud";
      vy.sea = false; vy.active = false; vy.flow = 0; vy.island = 0;
      vy.raft = { ...vy.raft, on: true, x: CLOUD_DOCK.spawn.x + 3.2, z: CLOUD_DOCK.spawn.z - 3.4, sail: 1 };
      vy.monY = {};
      rt.player.floatY = null;
      updateProgress((pr) => setVoyageStage(travelCloud(completeVoyage(pr), "cloud"), "done"));
      travelCombat();
      rt.player.x = CLOUD_DOCK.spawn.x; rt.player.z = CLOUD_DOCK.spawn.z; rt.player.yaw = Math.PI;
      COMPANION_IDS.forEach((id, i) => { const m = rt.monsters[id]; m.x = CLOUD_DOCK.spawn.x - 1.5 + i; m.z = CLOUD_DOCK.spawn.z + 1.6; m.mode = "script"; });
      vy.boatIn = 0;
      shot({ x: CLOUD_DOCK.spawn.x + 7, y: 6, z: CLOUD_DOCK.spawn.z + 9 }, { x: CLOUD_DOCK.boat.x, y: 0.5, z: CLOUD_DOCK.boat.z + 2 });
    }, 700);
    for (const id of COMPANION_IDS) animate(id, "hop");
    audio.play("splash");
    await wait(400);
    await over(5, (k) => { vy.boatIn = ease(k); });
    vy.boatIn = 1;
    await say("harbor", "I found my boat! I'll wait here.", "ぼくの ふねを みつけたよ! ここで まってるね。");
    vy.raft.on = false;
    arrive("cloud");
    banner({ title: "Cloud Isle", sub: "Find a way through Stormbreak Coast.", ja: "クラウドじま — あらしの かいがんを すすもう", tone: "place" });
    saveNow();
  });
}
