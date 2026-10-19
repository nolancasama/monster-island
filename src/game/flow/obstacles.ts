import { MONSTERS } from "../data/monsters";
import { CAN_QUESTION, PHRASES } from "../logic/english";
import { OBSTACLES, askAtObstacle, helperFor, isSolved, recordCan, solve } from "../logic/progress";
import { getGame, setGame, toast, updateProgress } from "../store";
import { animate, effect, rt } from "../runtime";
import { CROSSING, FALLEN_PALM, groundY } from "../world/island";
import { ask, say, wait } from "./ask";
import { facePlayer, frameTwo, run, shot } from "./script";
import { besidePlayer, poofTo } from "./companion";
import { audio } from "../../audio/audio";
import type { MonsterId, ObstacleId } from "../types";

/**
 * Obstacles: the student asks the companion the obstacle's question. The
 * companion answers truthfully from its data; only the right ability from the
 * right monster solves it, and a solved obstacle stays open for good.
 */

const ICON: Record<string, string> = { canSwim: "swim", canFly: "fly", canJump: "jump", canHelp: "help" };

const PLACE: Record<ObstacleId, { x: number; z: number; alone: { en: string; ja: string } }> = {
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
    facePlayer(id === "river" ? { x: CROSSING.east.x, z: CROSSING.east.z } : { x: FALLEN_PALM.x, z: FALLEN_PALM.z });
    const active = getGame().progress.active;
    if (!active) {
      await say("self", place.alone.en, place.alone.ja);
      return;
    }
    // Frame the obstacle beyond the player, then bring the companion into view.
    frameTwo(rt.player, id === "river" ? { x: (CROSSING.west.x + CROSSING.east.x) / 2, z: CROSSING.z } : { x: FALLEN_PALM.x, z: FALLEN_PALM.z }, 1.1);
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
  if (helper && helper !== active) {
    const name = MONSTERS[helper].name;
    setGame({ hint: "switch" });
    await say("game", `${MONSTERS[active].name} can't. Who can ${need === "grow" ? "help" : need}? Open your journal!`, `${MONSTERS[active].name}は できないみたい。ずかん(M)で ${name}を えらぼう!`);
  } else {
    await say("game", `Find a monster friend who can ${need === "grow" ? "help" : need}!`, `${need === "swim" ? "およげる" : "たすけて くれる"} モンスターを さがそう!`);
  }
}

async function perform(id: ObstacleId, monster: MonsterId) {
  if (id === "fallenPalm") await growVines(monster);
  else await ferry(monster);
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
