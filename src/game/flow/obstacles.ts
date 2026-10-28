import { MONSTERS } from "../data/monsters";
import { CAN_QUESTION, PHRASES } from "../logic/english";
import { OBSTACLES, askAtObstacle, gateOpen, helperFor, isSolved, obstacleAvailable, recordCan, solve } from "../logic/progress";
import { getGame, setGame, toast, updateProgress } from "../store";
import { animate, effect, rt, type MonsterRt } from "../runtime";
import { BRIDGE, CAVE, CLIFF_Z, CROSSING, FALLEN_PALM, GATE_PILLARS, LAVA, ROPE, SANCTUARY_GATE, groundY } from "../world/island";
import { ROPE_FOOT, ROPE_TOP, climbPath, ropeFlightPath } from "../world/rope";
import { ask, say, wait } from "./ask";
import { facePlayer, fadeThrough, frameTwo, run, shot } from "./script";
import { companionSpot, poofTo } from "./companion";
import { cliffTopEnding } from "./story";
import { audio } from "../../audio/audio";
import type { AbilityId, MonsterId, ObstacleId, Vec2 } from "../types";
import { ACT2_OBSTACLE_PLACE, CANOPY_GAPS, LILY_PADS, SHORTCUT_GATE } from "../world/lowland";

type Act2Obstacle = keyof typeof ACT2_OBSTACLE_PLACE;
const A2 = ACT2_OBSTACLE_PLACE;
/** Act 2's unlocks: where to stand, and what is said when no friend can help. */
export const ACT2_PLACE: Record<Act2Obstacle, { x: number; z: number; alone: { en: string; ja: string } }> = {
  groveLilies: { x: A2.groveLilies.x, z: A2.groveLilies.z, alone: { en: "The water is too deep!", ja: "みずが ふかい! およげる ともだちに きこう" } },
  canopyVines: { x: A2.canopyVines.x, z: A2.canopyVines.z, alone: { en: "The gap is too wide!", ja: "すきまが ひろすぎる! しょくぶつを そだてる ともだちに きこう" } },
  canopyRope: { x: A2.canopyRope.x, z: A2.canopyRope.z, alone: { en: "The rope bridge is on the other side!", ja: "つりばしが むこうがわに まいてある! とべる ともだちに きこう" } },
  causewayGate: { x: A2.causewayGate.x, z: A2.causewayGate.z, alone: { en: "Thorns hold the gate shut!", ja: "いばらが とびらを ふさいでいる! ひを つけられる ともだちに きこう" } }
};
const act2Face = Object.fromEntries((Object.keys(A2) as Act2Obstacle[]).map((id) => [id, A2[id].face])) as Record<Act2Obstacle, Vec2>;

/**
 * Obstacles: the student asks the companion the obstacle's question. The
 * companion answers truthfully from its data; only the right ability from the
 * right monster solves it, and a solved obstacle stays open for good.
 */

const ICON: Record<string, string> = { canSwim: "swim", canFly: "fly", canJump: "jump", canHelp: "help", canFire: "fire" };

const closedGate = { en: "The gate is closed!", ja: "とびらが しまっている!" };
/** Real approach positions on the route, shared with focus and test navigation. */
export const PHASE3_PLACE = {
  lava: { x: LAVA.x, z: LAVA.z + 1.8, alone: { en: "It's hot!", ja: "あつい!" } },
  cave: { x: CAVE.x, z: CAVE.z + 2.2, alone: { en: "It's dark!", ja: "くらい!" } },
  gateLeaf: { ...GATE_PILLARS.gateLeaf, alone: closedGate },
  gateDrop: { ...GATE_PILLARS.gateDrop, alone: closedGate },
  gateWing: { ...GATE_PILLARS.gateWing, alone: closedGate },
  gateFlame: { ...GATE_PILLARS.gateFlame, alone: closedGate }
};

const PLACE: Record<ObstacleId, { x: number; z: number; alone: { en: string; ja: string } }> = {
  ...PHASE3_PLACE,
  ...ACT2_PLACE,
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
  ...PHASE3_PLACE,
  ...act2Face,
  lava: LAVA,
  cave: CAVE,
  fallenPalm: FALLEN_PALM,
  river: CROSSING.east,
  bridge: { x: BRIDGE.x, z: BRIDGE.z0 },
  cliff: { x: ROPE.x, z: CLIFF_Z - 2 }
};
const FRAME: Record<ObstacleId, Vec2> = {
  ...PHASE3_PLACE,
  ...act2Face,
  lava: LAVA,
  cave: CAVE,
  fallenPalm: FALLEN_PALM,
  river: { x: (CROSSING.west.x + CROSSING.east.x) / 2, z: CROSSING.z },
  bridge: { x: BRIDGE.x, z: (BRIDGE.z0 + BRIDGE.z1) / 2 },
  cliff: { x: ROPE.x, z: ROPE.z - 0.4 }
};

/** From Phase 2 on the student thanks the monster after its power has worked. */
const THANKS = new Set<ObstacleId>(["bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame", "groveLilies", "canopyVines", "canopyRope", "causewayGate"]);

/** How the hint names an ability ("Who can help?", "とべる モンスター"). */
const NEED_WORD: Partial<Record<AbilityId, { en: string; ja: string }>> = {
  grow: { en: "help", ja: "たすけて くれる" },
  swim: { en: "swim", ja: "およげる" },
  fly: { en: "fly", ja: "とべる" },
  fire: { en: "make fire", ja: "ひを つけられる" }
};

/**
 * Bring the companion round to the player's side away from the camera (in
 * view, not blocking it): it walks there in follow mode (frameTwo has set the
 * side), then turns to the player.
 */
async function companionCloser(id: MonsterId) {
  const m = rt.monsters[id];
  const spot = companionSpot(id);
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
    if (!obstacleAvailable(getGame().progress, id)) {
      await say("self", place.alone.en, place.alone.ja);
      return;
    }
    facePlayer(FACE[id]);
    if (id === "lava") {
      frameTwo(rt.player, FRAME[id], 1.1);
      await say("maple", "It's hot!", "あつい! ともだちに たすけて もらおう!");
    }
    if (id === "cave") {
      frameTwo(rt.player, FRAME[id], 1.1);
      await say("self", "It's dark!", "くらい! ひが ひつようだね");
    }
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
          // Help means this obstacle's need. Lava also accepts Bubbo's
          // familiar direct question, without changing the three tap cards.
          speechAliases: ["canHelp", "canSwim"],
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

/** Touching the black cave mouth stops walking and names what is missing. */
export function lookIntoDarkCave(): Promise<void> {
  return run(async () => {
    facePlayer(CAVE);
    frameTwo(rt.player, CAVE, 1.1);
    const line = PLACE.cave.alone;
    await say("self", line.en, line.ja);
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
  else if (id === "cliff") await flyRope(monster);
  else if (id in ACT2_PLACE) await act2Power(id as Act2Obstacle, monster);
  else await phase3Power(id, monster);
}

/** A visible, permanent use of each power, followed by the shared thanks prompt. */
async function phase3Power(id: ObstacleId, monster: MonsterId) {
  const target = FACE[id];
  const m = rt.monsters[monster];
  const gy = groundY(target.x, target.z);
  m.mode = "script";
  m.look = target;
  // The companion and the whole obstacle remain in the shot throughout its action.
  m.x = target.x - 2.7;
  m.z = target.z + 0.4;
  m.yaw = Math.atan2(target.x - m.x, target.z - m.z);
  shot({ x: target.x + 7, y: gy + 3.3, z: target.z + 8.5 }, { x: target.x, y: gy + 1.1, z: target.z });
  animate(monster, "power");
  const drop = id === "lava" || id === "gateDrop";
  const leaf = id === "gateLeaf";
  audio.play(drop ? "splash" : leaf ? "vines" : id === "gateWing" ? "sparkle" : "whoosh");
  if (id === "gateWing") await glide(monster, target, 3.5, 1.2);
  const t0 = rt.time;
  let burst = -1;
  for (;;) {
    const k = Math.min(1, (rt.time - t0) / 2.2);
    if (id === "lava") rt.lava = k;
    else if (id === "cave") rt.cave = k;
    else rt.pillars[id] = k;
    if (Math.floor(k * 5) > burst) {
      burst = Math.floor(k * 5);
      effect(drop ? "splash" : leaf ? "leaves" : id === "gateWing" ? "notes" : "sparkle", target.x, gy + (id === "gateWing" ? 3.6 : 0.7), target.z);
    }
    if (k === 1) break;
    await wait(30);
  }
  updateProgress((p) => solve(p, id));
  if (id === "gateWing") {
    audio.play("stone");
    await glide(monster, { x: target.x - 2.7, z: target.z + 0.4 }, 0.35, 1);
  }
  if (gateOpen(getGame().progress) && rt.gate < 1) {
    const s = SANCTUARY_GATE;
    shot({ x: s.x + 9, y: groundY(s.x, s.z) + 5.5, z: s.z + 13 }, { x: s.x, y: groundY(s.x, s.z) + 1.6, z: s.z - 3 });
    audio.play("stones");
    const start = rt.time;
    while (rt.gate < 1) {
      rt.gate = Math.min(1, (rt.time - start) / 2);
      await wait(30);
    }
    rt.monsters.lumo.mode = "idle";
    animate("lumo", "notice");
    effect("sparkle", rt.monsters.lumo.x, groundY(rt.monsters.lumo.x, rt.monsters.lumo.z) + 1.5, rt.monsters.lumo.z);
    await say("self", "Look! A monster!", "みて! モンスターが おきたよ!");
  }
  animate(monster, "friend");
  audio.voice(monster, "excited");
  toast({ en: id === "lava" ? "The lava is cool!" : id === "cave" ? "The cave is lit!" : "A pillar is shining!", ja: id === "lava" ? "ようがんが かたまった!" : id === "cave" ? "どうくつが あかるくなった!" : "はしらが ひかった!", icon: "star", tone: "good" });
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
  // Wide enough to keep the coil, the whole face and the top edge in view.
  shot({ x: ROPE.x + 7.5, y: baseY + 3, z: ROPE.z + 11.5 }, { x: ROPE.x, y: baseY + 4.3, z: ROPE.z - 0.5 });
  // Picks up the rope end at the coil...
  const coil = { x: ROPE.x + 0.9, z: ROPE.z + 0.4 };
  await glide(id, coil, 0.5, 0.8);
  animate(id, "hop");
  audio.play("pick");
  await wait(300);
  // ...the coil vanishes in a puff of smoke as Puff lifts it (one rope only:
  // the carried coil under Puff until it is tied)...
  rt.ropeCarried = true;
  effect("poof", coil.x, baseY + 0.3, coil.z);
  audio.play("poof");
  animate(id, "power");
  audio.play("whoosh");
  // ...flies it up well clear of the face and over the edge to the stake...
  const path = ropeFlightPath({ x: m.x, y: groundY(m.x, m.z) + m.air, z: m.z }, baseY, MONSTERS[id].radius);
  await flyThrough(id, path, 3.2);
  // ...ties it, and the rope unrolls down the cliff.
  rt.ropeCarried = false;
  animate(id, "spin");
  audio.play("stones");
  const t0 = rt.time;
  while (rt.rope < 1) {
    rt.rope = Math.min(1, (rt.time - t0) / 1.2);
    await wait(30);
  }
  updateProgress((p) => solve(p, "cliff"));
  await wait(400);
  // Back down the same clear line, beside the new rope.
  await flyThrough(id, [...path.slice(1).reverse(), { x: ROPE.x + 1, y: baseY + 0.35, z: ROPE.z + 0.8 }], 2.4);
  m.look = { x: rt.player.x, z: rt.player.z };
  animate(id, "friend");
  audio.voice(id, "excited");
  effect("sparkle", m.x, 1, m.z);
  toast({ en: "The rope is up!", ja: "ロープが かかった!", icon: "path", tone: "good" });
}

/**
 * Fly a monster through absolute points at an even pace (eased at the ends),
 * facing where it travels; straight up or down it keeps its heading.
 */
async function flyThrough(id: MonsterId, points: Array<{ x: number; y: number; z: number }>, seconds: number) {
  const m = rt.monsters[id];
  const start = { x: m.x, y: groundY(m.x, m.z) + m.air, z: m.z };
  const pts = [start, ...points];
  const lens = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y, p.z - pts[i].z));
  const total = lens.reduce((a, b) => a + b, 0) || 1;
  const t0 = rt.time;
  for (;;) {
    const k = Math.min(1, (rt.time - t0) / seconds);
    let d = (k * k * (3 - 2 * k)) * total;
    let i = 0;
    while (i < lens.length - 1 && d > lens[i]) d -= lens[i++];
    const a = pts[i], b = pts[i + 1];
    const u = lens[i] ? Math.min(1, d / lens[i]) : 1;
    m.x = a.x + (b.x - a.x) * u;
    m.z = a.z + (b.z - a.z) * u;
    m.air = m.airTarget = a.y + (b.y - a.y) * u - groundY(m.x, m.z);
    if (Math.hypot(b.x - a.x, b.z - a.z) > 0.2) m.yaw = Math.atan2(b.x - a.x, b.z - a.z);
    else m.yaw = Math.PI;
    if (k >= 1) return;
    await wait(30);
  }
}

/** Fly a monster to a point at a height above the ground there (eased). */
/**
 * Act 2's powers, each a visible permanent change: Bubbo raises lily pads to
 * the islet, Leafy weaves a vine bridge, Puff flies the rolled-up rope bridge
 * across, Ember burns the thorns off the shortcut gate (which then rises).
 */
async function act2Power(id: Act2Obstacle, monster: MonsterId) {
  const place = A2[id];
  const target = place.face;
  const m = rt.monsters[monster];
  const gy = groundY(target.x, target.z);
  m.mode = "script";
  m.look = target;
  // Beside the player, toward the obstacle; the camera frames both from the side.
  const side = id === "groveLilies" ? { x: 0.4, z: 1.6 } : id === "causewayGate" ? { x: 1.8, z: -0.6 } : { x: 1.4, z: 0.3 };
  m.x = place.x + side.x;
  m.z = place.z + side.z;
  m.yaw = Math.atan2(target.x - m.x, target.z - m.z);
  const camSide = id === "groveLilies" ? { x: 4, z: 7 } : id === "causewayGate" ? { x: 6.5, z: -6 } : { x: -6.5, z: 2.5 };
  shot({ x: target.x + camSide.x, y: gy + 3.6, z: target.z + camSide.z }, { x: target.x, y: gy + 0.6, z: target.z });
  animate(monster, "power");
  audio.play(id === "groveLilies" ? "splash" : id === "canopyVines" ? "vines" : id === "canopyRope" ? "whoosh" : "burst");
  if (id === "canopyRope") {
    const g = CANOPY_GAPS.canopyRope;
    await glide(monster, { x: g.x + 0.6, z: g.z0 - 0.6 }, 3.4, 1.2);
  }
  const t0 = rt.time;
  let burst = -1;
  for (;;) {
    const k = Math.min(1, (rt.time - t0) / 2.2);
    rt.act2Unlock[id] = k;
    if (Math.floor(k * 5) > burst) {
      burst = Math.floor(k * 5);
      if (id === "groveLilies") {
        const pad = LILY_PADS[Math.min(LILY_PADS.length - 1, burst)];
        effect("splash", pad.x, gy, pad.z);
      } else if (id === "causewayGate") effect("sparkle", SHORTCUT_GATE.x, gy + 1.2, SHORTCUT_GATE.z);
      else effect(id === "canopyVines" ? "leaves" : "sparkle", target.x, gy + 0.6, target.z);
    }
    if (k === 1) break;
    await wait(30);
  }
  updateProgress((p) => solve(p, id));
  if (id === "canopyRope") await glide(monster, { x: place.x + side.x, z: place.z + side.z }, 0.35, 1);
  if (id === "causewayGate") audio.play("stones");
  animate(monster, "friend");
  audio.voice(monster, "excited");
  m.look = { x: rt.player.x, z: rt.player.z };
  frameTwo(rt.player, m);
  await say(monster, "We did it!", "やったね!");
}

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
  const bottomY = groundY(ROPE.x, ROPE.z);
  const place = (k: number) => {
    const q = climbPath(k);
    p.x = q.x;
    p.z = q.z;
    p.climbY = q.y;
    p.mantle = q.mantle;
    // The camera follows the climber up and down the face.
    const y = Math.max(bottomY + 1.6, q.y + 0.9);
    shot({ x: ROPE.x - 2.6, y: y + 0.8, z: ROPE.z + 7.2 }, { x: ROPE.x, y: y, z: ROPE.z - 0.2 });
  };
  p.frozen = true;
  // Only the start cuts: from wherever the player stood to the foot of the
  // rope (or the top beside the stake). The top itself is climbed over.
  await fadeThrough(() => {
    p.vx = p.vz = 0;
    p.yaw = Math.PI;
    place(up ? 0 : 1);
  }, 250);
  audio.play("whoosh");
  const t0 = rt.time;
  // About 5.6 s: steady hand over hand on the face, a slower mantle at the top.
  const dur = 5.6;
  for (;;) {
    const s = Math.min(1, (rt.time - t0) / dur);
    // A short ease at each end, constant pace between.
    const e = s < 0.08 ? (s * s) / 0.16 : s > 0.92 ? 1 - ((1 - s) * (1 - s)) / 0.16 : (s - 0.04) / 0.92;
    place(up ? e : 1 - e);
    if (s >= 1) break;
    await wait(30);
  }
  p.climbY = null;
  p.mantle = 0;
  if (up) {
    p.x = ROPE_TOP.x;
    p.z = ROPE_TOP.z;
  } else {
    // Step back from the rope onto the hill.
    const from = { x: p.x, z: p.z };
    const t1 = rt.time;
    p.yaw = 0;
    for (;;) {
      const k = Math.min(1, (rt.time - t1) / 0.45);
      p.x = from.x + (ROPE_FOOT.x - from.x) * k;
      p.z = from.z + (ROPE_FOOT.z - from.z) * k;
      p.step += 0.06;
      p.speed = k < 1 ? 2 : 0;
      if (k >= 1) break;
      await wait(30);
    }
  }
  p.yaw = up ? Math.PI : 0;
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

/** A scripted walk for a monster (eased, facing where it goes). */
async function glideWalk(m: MonsterRt, to: Vec2, seconds: number) {
  const from = { x: m.x, z: m.z };
  const d = Math.hypot(to.x - from.x, to.z - from.z);
  if (d < 0.05) return;
  m.yaw = Math.atan2(to.x - from.x, to.z - from.z);
  const t0 = rt.time;
  for (;;) {
    const k = Math.min(1, (rt.time - t0) / seconds);
    const s = k * k * (3 - 2 * k);
    m.x = from.x + (to.x - from.x) * s;
    m.z = from.z + (to.z - from.z) * s;
    m.step += d * 0.1;
    if (k >= 1) return;
    await wait(30);
  }
}

/** Hop onto Bubbo's saddle from `ground`, or off it onto `ground`. */
async function hop(p: typeof rt.player, ground: Vec2, on: boolean) {
  p.rideFrom.x = ground.x;
  p.rideFrom.z = ground.z;
  p.seat = on ? 0 : 1;
  p.riding = true;
  audio.play("whoosh");
  const t0 = rt.time;
  for (;;) {
    const k = Math.min(1, (rt.time - t0) / 0.55);
    const s = k * k * (3 - 2 * k);
    p.seat = on ? s : 1 - s;
    if (k >= 1) break;
    await wait(16);
  }
  if (!on) {
    p.riding = false;
    p.x = ground.x;
    p.z = ground.z;
  }
}

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

  // Ride across: Bubbo wades in at the bank and the player hops onto his back.
  // The simulation keeps the rider on the saddle (game/ride.ts), so rider and
  // body move as one; walking collision is off while frozen.
  m.mode = "script";
  const w = CROSSING.west;
  const e = CROSSING.east;
  const p = rt.player;
  p.frozen = true;
  p.vx = p.vz = 0;
  shot({ x: (w.x + e.x) / 2, y: 3.6, z: w.z + 9 }, { x: (w.x + e.x) / 2, y: 0, z: w.z });
  await glideWalk(m, { x: w.x + 0.9, z: w.z }, 0.6);
  m.yaw = Math.PI / 2;
  // Bubbo swims for the whole crossing: his height follows the bank down into
  // the water and back up (the higher of ground and water), with no jump.
  m.swimming = true;
  await hop(p, { x: p.x, z: p.z }, true);
  audio.play("splash");
  effect("splash", m.x + 0.6, -0.2, m.z);
  const from = m.x;
  const to = e.x - 0.6;
  const t0 = rt.time;
  const dur = 3.6;
  let splashes = 0;
  while (rt.time - t0 < dur) {
    const k = (rt.time - t0) / dur;
    const s = k * k * (3 - 2 * k);
    m.x = from + (to - from) * s;
    if (k > splashes * 0.33 + 0.15) {
      splashes++;
      effect("splash", m.x, -0.25, m.z + 0.4);
      audio.play("splash");
    }
    await wait(30);
  }
  m.x = to;
  // Hop off onto the far bank; Bubbo climbs out beside the player.
  await hop(p, { x: e.x + 0.3, z: e.z + 0.6 }, false);
  m.swimming = false;
  p.yaw = -Math.PI / 2;
  await glideWalk(m, { x: e.x - 0.2, z: e.z - 1 }, 0.5);
  await wait(300);

  // Stepping stones rise behind them: the crossing stays open.
  shot({ x: e.x + 4.5, y: 3.4, z: e.z + 6.5 }, { x: (w.x + e.x) / 2 + 0.5, y: -0.2, z: w.z });
  m.look = { x: (w.x + e.x) / 2, z: w.z };
  animate(id, "power");
  audio.play("stones");
  rt.stonesTarget = 1;
  await wait(1800);
  updateProgress((pr) => solve(pr, "river"));
  m.look = { x: p.x, z: p.z };
  p.frozen = false;
  animate(id, "friend");
  audio.voice(id, "excited");
  frameTwo(rt.player, m);
  await say("game", "Stepping stones! Now you can walk across.", "いしの みちが できた! これで いつでも わたれるよ");
}
