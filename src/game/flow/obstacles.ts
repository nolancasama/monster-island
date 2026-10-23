import { MONSTERS } from "../data/monsters";
import { CAN_QUESTION, PHRASES } from "../logic/english";
import { OBSTACLES, askAtObstacle, helperFor, isSolved, recordCan, solve } from "../logic/progress";
import { getGame, setGame, toast, updateProgress } from "../store";
import { animate, effect, rt } from "../runtime";
import { BRIDGE, CLIFF_HEIGHT, CLIFF_TOP_SPOT, CLIFF_Z, CROSSING, FALLEN_PALM, ROPE, groundY } from "../world/island";
import { ask, say, wait } from "./ask";
import { facePlayer, fadeThrough, frameTwo, run, shot } from "./script";
import { besidePlayer, poofTo } from "./companion";
import { cliffTopEnding } from "./story";
import { audio } from "../../audio/audio";
import type { AbilityId, MonsterId, ObstacleId, Vec2 } from "../types";

/**
 * Obstacles: the student asks the companion the obstacle's question. The
 * companion answers truthfully from its data; only the right ability from the
 * right monster solves it, and a solved obstacle stays open for good.
 */

const ICON: Record<string, string> = { canSwim: "swim", canFly: "fly", canJump: "jump", canHelp: "help" };

const PLACE: Record<ObstacleId, { x: number; z: number; alone: { en: string; ja: string } }> = {
  bridge: {
    x: BRIDGE.x,
    z: BRIDGE.z1 + 1.2,
    alone: { en: "The bridge is broken!", ja: "はしが こわれている! モンスターの ともだちに たすけて もらおう" }
  },
  cliff: {
    x: ROPE.x,
    z: ROPE.z + 1.2,
    alone: { en: "The cliff is too high!", ja: "がけが たかすぎる! とべる モンスターを さがそう" }
  },
  fallenPalm: {
    x: FALLEN_PALM.x - 1.6,
    z: FALLEN_PALM.z,
    alone: { en: "This tree is too heavy!", ja: "おもくて うごかない! モンスターの ともだちに たすけて もらおう" }
  },
  river: {
    x: CROSSING.west.x,
    z: CROSSING.west.z,
    alone: { en: "The river is too wide!", ja: "かわが ひろすぎる! およげる モンスターを さがそう" }
  }
};

/** What the player faces at each obstacle, and the point the shot frames. */
const FACE: Record<ObstacleId, Vec2> = {
  fallenPalm: FALLEN_PALM,
  river: CROSSING.east,
  bridge: { x: BRIDGE.x, z: BRIDGE.z0 },
  cliff: { x: ROPE.x, z: CLIFF_Z - 2 }
};
const FRAME: Record<ObstacleId, Vec2> = {
  fallenPalm: FALLEN_PALM,
  river: { x: (CROSSING.west.x + CROSSING.east.x) / 2, z: CROSSING.z },
  bridge: { x: BRIDGE.x, z: (BRIDGE.z0 + BRIDGE.z1) / 2 },
  cliff: { x: ROPE.x, z: ROPE.z - 0.4 }
};

/** From Phase 2 on the student thanks the monster after its power has worked. */
const THANKS = new Set<ObstacleId>(["bridge", "cliff"]);

/** How the hint names an ability ("Who can help?", "とべる モンスター"). */
const NEED_WORD: Partial<Record<AbilityId, { en: string; ja: string }>> = {
  grow: { en: "help", ja: "たすけて くれる" },
  swim: { en: "swim", ja: "およげる" },
  fly: { en: "fly", ja: "とべる" }
};

/**
 * Bring the companion round to the player's side away from the camera (in
 * view, not blocking it): it walks there in follow mode (frameTwo has set the
 * side), then turns to the player.
 */
async function companionCloser(id: MonsterId) {
  const m = rt.monsters[id];
  const spot = besidePlayer(1.5, 1.1 * rt.followSide);
  if (Math.hypot(m.x - spot.x, m.z - spot.z) > 6) poofTo(id, spot.x, spot.z);
  m.mode = "follow";
  const t0 = rt.time;
  while (Math.hypot(m.x - spot.x, m.z - spot.z) > 0.55 && rt.time - t0 < 1.4) await wait(40);
  m.mode = "talk";
  m.target = null;
  m.look = { x: rt.player.x, z: rt.player.z };
}

export function useObstacle(id: ObstacleId): Promise<void> {
  return run(async () => {
    const o = OBSTACLES[id];
    const place = PLACE[id];
    if (isSolved(getGame().progress, id)) return;
    facePlayer(FACE[id]);
    const active = getGame().progress.active;
    if (!active) {
      await say("self", place.alone.en, place.alone.ja);
      return;
    }
    // Frame the obstacle beyond the player, then bring the companion into view.
    frameTwo(rt.player, FRAME[id], 1.1);
    await companionCloser(active);
    const m = rt.monsters[active];
    try {
      for (;;) {
        const said = await ask({
          kind: "choice",
          options: [o.question, ...o.others],
          show: [o.question],
          icons: Object.fromEntries([o.question, ...o.others].map((q) => [q, ICON[q]])),
          shuffle: true,
          help: `${MONSTERS[active].name}に きいてみよう`,
          cancellable: true
        });
        if (!said) return;
        const ability = CAN_QUESTION[said]!;
        const ans = askAtObstacle(getGame().progress, id, ability);
        if (ans.kind === "alone") return;
        updateProgress((p) => recordCan(p, active, ans.ability));
        m.talking = true;
        animate(active, ans.yes ? "yes" : "no");
        audio.voice(active, ans.yes ? "happy" : "sad");
        await say(active, ans.yes ? "Yes, I can!" : "No, I can't.", undefined, { target: true, tone: ans.yes ? "yes" : "no" });
        m.talking = false;
        if (ans.solves) {
          await perform(id, active);
          if (THANKS.has(id)) await thanks(active);
          if (id === "cliff") await climbAndEnd(active);
          return;
        }
        if (ans.ability === o.needs || said === o.question) {
          // The right question for the wrong monster: who can?
          await notThisOne(id, active);
          return;
        }
        if (ans.yes) {
          animate(active, "hop");
          await say("game", `That won't help here. ${PHRASES[o.question].en}`, "ここでは やくに たたないね。べつの しつもんを してみよう");
        }
      }
    } finally {
      m.look = null;
      m.talking = false;
      m.mode = "follow";
    }
  });
}

async function notThisOne(id: ObstacleId, active: MonsterId) {
  const helper = helperFor(getGame().progress, id);
  const need = OBSTACLES[id].needs;
  const word = NEED_WORD[need] ?? { en: need, ja: "" };
  if (helper && helper !== active) {
    const name = MONSTERS[helper].name;
    setGame({ hint: "switch" });
    await say("game", `${MONSTERS[active].name} can't. Who can ${word.en}? Open your journal!`, `${MONSTERS[active].name}は できないみたい。ずかん(M)で ${name}を えらぼう!`);
  } else {
    await say("game", `Find a monster friend who can ${word.en}!`, `${word.ja} モンスターを さがそう!`);
  }
}

async function perform(id: ObstacleId, monster: MonsterId) {
  if (id === "fallenPalm") await growVines(monster);
  else if (id === "river") await ferry(monster);
  else if (id === "bridge") await weaveBridge(monster);
  else await flyRope(monster);
}

/** "Thank you!": the student thanks the friend whose power just worked. */
async function thanks(id: MonsterId) {
  const m = rt.monsters[id];
  m.mode = "talk";
  m.look = { x: rt.player.x, z: rt.player.z };
  frameTwo(rt.player, m);
  await ask({
    kind: "command",
    options: ["thankYou"],
    question: { en: `Say thank you to ${MONSTERS[id].name}!`, by: "game" },
    help: "おれいを いおう",
    readQuestion: true,
    readSentence: true,
    onWrong: () => animate(id, "tilt")
  });
  m.talking = true;
  animate(id, "spin");
  audio.voice(id, "excited");
  effect("hearts", m.x, 1.2 + m.air, m.z);
  await say(id, "You're welcome!", "どういたしまして!", { tone: "yes" });
  m.talking = false;
}

// ------------------------------------------------------------ Leafy's bridge

async function weaveBridge(id: MonsterId) {
  const m = rt.monsters[id];
  m.mode = "script";
  const south = { x: BRIDGE.x - 0.9, z: BRIDGE.z1 + 0.9 };
  m.x = south.x;
  m.z = south.z;
  m.look = { x: BRIDGE.x, z: BRIDGE.z0 };
  const mid = (BRIDGE.z0 + BRIDGE.z1) / 2;
  const gy = groundY(BRIDGE.x, BRIDGE.z1 + 1);
  shot({ x: BRIDGE.x + 7.5, y: gy + 3.2, z: BRIDGE.z1 + 4.5 }, { x: BRIDGE.x, y: gy - 0.4, z: mid });
  animate(id, "power");
  audio.play("vines");
  effect("leaves", BRIDGE.x, gy + 0.6, BRIDGE.z1);
  const t0 = rt.time;
  let leaves = 0;
  while (rt.bridge < 1) {
    rt.bridge = rt.bridgeTarget = Math.min(1, (rt.time - t0) / 2.2);
    if (rt.bridge > leaves * 0.3 + 0.2) {
      leaves++;
      effect("leaves", BRIDGE.x, gy + 0.3, BRIDGE.z1 - (BRIDGE.z1 - BRIDGE.z0) * rt.bridge * 0.8);
    }
    await wait(30);
  }
  await wait(500);
  updateProgress((p) => solve(p, "bridge"));
  animate(id, "friend");
  audio.voice(id, "excited");
  effect("sparkle", m.x, 1, m.z);
  m.look = { x: rt.player.x, z: rt.player.z };
  frameTwo(rt.player, m);
  await say(id, "We did it!", "やったね!");
  toast({ en: "The bridge is fixed!", ja: "はしが なおった!", icon: "path", tone: "good" });
}

// ------------------------------------------------------------ Puff's rope

async function flyRope(id: MonsterId) {
  const m = rt.monsters[id];
  m.mode = "script";
  const baseY = groundY(ROPE.x, ROPE.z);
  shot({ x: ROPE.x + 6.5, y: baseY + 2.4, z: ROPE.z + 9 }, { x: ROPE.x, y: baseY + 3.6, z: ROPE.z - 0.5 });
  // Picks up the rope end at the coil...
  const coil = { x: ROPE.x + 0.9, z: ROPE.z + 0.4 };
  await glide(id, coil, 0.5, 0.8);
  animate(id, "hop");
  audio.play("pick");
  await wait(300);
  // ...flies it up the cliff...
  animate(id, "power");
  audio.play("whoosh");
  await glide(id, { x: ROPE.x, z: ROPE.z - 0.2 }, CLIFF_HEIGHT + 1, 2);
  await glide(id, { x: ROPE.x, z: CLIFF_Z - 1.2 }, 0.6, 0.8);
  // ...ties it, and the rope unrolls down the cliff.
  animate(id, "spin");
  audio.play("stones");
  const t0 = rt.time;
  while (rt.rope < 1) {
    rt.rope = Math.min(1, (rt.time - t0) / 1.2);
    await wait(30);
  }
  updateProgress((p) => solve(p, "cliff"));
  await wait(400);
  await glide(id, { x: ROPE.x + 1, z: ROPE.z + 0.8 }, 0.35, 1.4);
  m.look = { x: rt.player.x, z: rt.player.z };
  animate(id, "friend");
  audio.voice(id, "excited");
  effect("sparkle", m.x, 1, m.z);
  toast({ en: "The rope is up!", ja: "ロープが かかった!", icon: "path", tone: "good" });
}

/** Fly a monster to a point at a height above the ground there (eased). */
async function glide(id: MonsterId, to: Vec2, air: number, seconds: number) {
  const m = rt.monsters[id];
  const from = { x: m.x, z: m.z, y: groundY(m.x, m.z) + m.air };
  const toY = groundY(to.x, to.z) + air;
  const t0 = rt.time;
  for (;;) {
    const k = Math.min(1, (rt.time - t0) / seconds);
    const s = k * k * (3 - 2 * k);
    m.x = from.x + (to.x - from.x) * s;
    m.z = from.z + (to.z - from.z) * s;
    // Height is kept absolute while the ground under it changes (the cliff edge).
    m.air = m.airTarget = from.y + (toY - from.y) * s - groundY(m.x, m.z);
    if (Math.abs(to.x - from.x) + Math.abs(to.z - from.z) > 0.1) m.yaw = Math.atan2(to.x - from.x, to.z - from.z);
    if (k >= 1) return;
    await wait(30);
  }
}

/** "Let's go!" at the foot of the rope, the climb, and the Phase 2 ending at the top. */
async function climbAndEnd(id: MonsterId) {
  const m = rt.monsters[id];
  m.mode = "talk";
  frameTwo(rt.player, m);
  await ask({
    kind: "command",
    options: ["letsGo"],
    question: { en: "Climb up! What do you say?", by: "game" },
    help: "みんなに こえを かけよう",
    readQuestion: true,
    readSentence: true,
    onWrong: () => animate(id, "tilt")
  });
  m.talking = true;
  animate(id, "yes");
  audio.voice(id, "excited");
  await say(id, "Let's go!", undefined, { target: true, tone: "yes" });
  m.talking = false;
  m.mode = "follow";
  await climbRope(true);
  await cliffTopEnding();
}

/** Climb the rope up (or down). Friends poof over afterwards, as they do when left behind. */
export async function climbRope(up: boolean) {
  const p = rt.player;
  const bottom = { x: ROPE.x, z: ROPE.z + 0.15 };
  const top = CLIFF_TOP_SPOT;
  const bottomY = groundY(bottom.x, bottom.z);
  const topY = groundY(top.x, top.z);
  p.frozen = true;
  await fadeThrough(() => {
    p.x = bottom.x;
    p.z = bottom.z;
    p.vx = p.vz = 0;
    p.yaw = Math.PI;
    p.climbY = up ? bottomY : topY - 0.1;
    shot({ x: ROPE.x - 1.8, y: bottomY + 2.6, z: ROPE.z + 7.5 }, { x: ROPE.x, y: bottomY + CLIFF_HEIGHT * 0.55, z: ROPE.z });
  }, 250);
  audio.play("whoosh");
  const from = p.climbY!;
  const to = up ? topY - 0.1 : bottomY;
  const t0 = rt.time;
  const dur = 2.4;
  for (;;) {
    const k = Math.min(1, (rt.time - t0) / dur);
    p.climbY = from + (to - from) * (k * k * (3 - 2 * k));
    p.step += 0.06;
    if (k >= 1) break;
    await wait(30);
  }
  await fadeThrough(() => {
    p.climbY = null;
    const spot = up ? top : { x: ROPE.x, z: ROPE.z + 1.4 };
    p.x = spot.x;
    p.z = spot.z;
    p.yaw = up ? Math.PI : 0;
  }, 250);
  p.frozen = false;
}

// ------------------------------------------------------------ Leafy's vines

async function growVines(id: MonsterId) {
  const m = rt.monsters[id];
  m.mode = "script";
  m.look = { x: FALLEN_PALM.x, z: FALLEN_PALM.z };
  const gy = groundY(FALLEN_PALM.x, FALLEN_PALM.z);
  shot({ x: FALLEN_PALM.x - 7.5, y: gy + 3.6, z: FALLEN_PALM.z + 5.5 }, { x: FALLEN_PALM.x - 0.4, y: gy + 0.9, z: FALLEN_PALM.z });
  animate(id, "power");
  audio.play("vines");
  effect("leaves", FALLEN_PALM.x, 0.8, FALLEN_PALM.z);
  const t0 = rt.time;
  while (rt.vines < 1) {
    rt.vines = Math.min(1, (rt.time - t0) / 1.6);
    await wait(30);
  }
  rt.palmTarget = 1;
  await wait(1500);
  audio.play("thud");
  effect("leaves", FALLEN_PALM.x + 0.5, 0.4, FALLEN_PALM.z - 2.4);
  updateProgress((p) => solve(p, "fallenPalm"));
  await wait(500);
  animate(id, "friend");
  audio.voice(id, "excited");
  effect("sparkle", m.x, 1, m.z);
  m.look = { x: rt.player.x, z: rt.player.z };
  frameTwo(rt.player, m);
  await say(id, "We did it!", "やったね!");
  toast({ en: "The path is open!", ja: "みちが ひらいた!", icon: "path", tone: "good" });
}

// ------------------------------------------------------------ Bubbo's ferry

async function ferry(id: MonsterId) {
  const m = rt.monsters[id];
  // Bubbo asks back: the student answers about themself (both answers lead on).
  const back = await ask({
    kind: "choice",
    options: ["yesICan", "noICant"],
    question: { en: "Can you swim?", by: id },
    help: "あなたは およげる? こたえよう",
    readQuestion: true
  });
  m.talking = true;
  animate(id, back === "yesICan" ? "yes" : "hop");
  audio.voice(id, "happy");
  if (back === "yesICan") await say(id, "Me too! Let's go!", undefined, { target: true, tone: "yes" });
  else await say(id, "That's OK! Get on!", "だいじょうぶ! せなかに のって!", { tone: "yes" });
  m.talking = false;

  // Ride across.
  m.mode = "script";
  const w = CROSSING.west;
  const e = CROSSING.east;
  rt.player.frozen = true;
  m.x = w.x + 0.9;
  m.z = w.z;
  m.yaw = Math.PI / 2;
  rt.player.x = m.x;
  rt.player.z = m.z;
  rt.player.yaw = Math.PI / 2;
  rt.player.riding = true;
  audio.play("splash");
  effect("splash", m.x + 0.6, -0.2, m.z);
  shot({ x: (w.x + e.x) / 2, y: 3.6, z: w.z + 9 }, { x: (w.x + e.x) / 2, y: 0, z: w.z });
  const from = m.x;
  const to = e.x - 0.6;
  const t0 = rt.time;
  const dur = 3.6;
  let splashes = 0;
  while (rt.time - t0 < dur) {
    const k = (rt.time - t0) / dur;
    const s = k * k * (3 - 2 * k);
    m.x = from + (to - from) * s;
    m.swimming = s > 0.08 && s < 0.92;
    rt.player.x = m.x;
    rt.player.z = m.z;
    if (k > splashes * 0.33 + 0.15) {
      splashes++;
      effect("splash", m.x, -0.25, m.z + 0.4);
      audio.play("splash");
    }
    await wait(30);
  }
  m.swimming = false;
  rt.player.riding = false;
  rt.player.x = e.x + 0.3;
  rt.player.z = e.z + 0.6;
  rt.player.yaw = -Math.PI / 2;
  m.x = e.x - 0.2;
  m.z = e.z - 1;
  await wait(500);

  // Stepping stones rise behind them: the crossing stays open.
  shot({ x: e.x + 4.5, y: 3.4, z: e.z + 6.5 }, { x: (w.x + e.x) / 2 + 0.5, y: -0.2, z: w.z });
  m.look = { x: (w.x + e.x) / 2, z: w.z };
  animate(id, "power");
  audio.play("stones");
  rt.stonesTarget = 1;
  await wait(1800);
  updateProgress((p) => solve(p, "river"));
  m.look = { x: rt.player.x, z: rt.player.z };
  rt.player.frozen = false;
  animate(id, "friend");
  audio.voice(id, "excited");
  frameTwo(rt.player, m);
  await say("game", "Stepping stones! Now you can walk across.", "いしの みちが できた! これで いつでも わたれるよ");
}
