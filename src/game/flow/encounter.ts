import { MONSTERS } from "../data/monsters";
import { FOODS } from "../data/foods";
import { COLOR_PHRASE, LIKE_PHRASE, PART_PHRASE, PHRASES, SIZE_PHRASE, foodOfPhrase, type PhraseId } from "../logic/english";
import {
  answerLike,
  befriend,
  befriendLumo,
  describeLine,
  discover,
  dislikedKnown,
  favoriteKnown,
  has,
  invite,
  LUMO_ASK_BACK,
  neededLine,
  questionFoods,
  recordLike,
  type DescribeLine
} from "../logic/progress";
import { getGame, setGame, toast, updateProgress } from "../store";
import { animate, effect, rt } from "../runtime";
import { ask, say, wait } from "./ask";
import { facePlayer, frameTwo, run, shot } from "./script";
import { switchTo } from "./companion";
import { nearestWalkable, gatesOf } from "../world/collision";
import { groundY } from "../world/island";
import { audio } from "../../audio/audio";
import type { MonsterId } from "../types";

/**
 * One monster encounter: discover (call a shy flier down, describe it for the journal), communicate
 * ("Do you like ___?" until it says yes), befriend (give the food; it asks
 * back), then it joins. Every step is saved as it happens, so walking away
 * mid-way resumes at the same step.
 */

function beginTalk(id: MonsterId) {
  const m = rt.monsters[id];
  m.mode = "talk";
  m.target = null;
  m.look = { x: rt.player.x, z: rt.player.z };
  facePlayer(m);
  // Stand a comfortable distance apart.
  const d = Math.hypot(m.x - rt.player.x, m.z - rt.player.z);
  if (d < 1.4) {
    const k = 1.4 / Math.max(d, 0.01);
    m.x = rt.player.x + (m.x - rt.player.x) * k;
    m.z = rt.player.z + (m.z - rt.player.z) * k;
  }
  frameTwo(rt.player, m);
}

function endTalk(id: MonsterId) {
  const m = rt.monsters[id];
  m.look = null;
  m.talking = false;
  const p = getGame().progress;
  m.mode = p.active === id ? "follow" : "idle";
  m.until = rt.time + 2;
}

/** E on a monster. */
export function talkTo(id: MonsterId): Promise<void> {
  const p = getGame().progress;
  if (id === "ember" && p.monsters[id].friend && !p.monsters[id].invited) {
    return run(async () => {
      try {
        beginTalk(id);
        await inviteAlong(id);
      } finally {
        endTalk(id);
      }
    });
  }
  if (p.monsters[id].friend) return friendChat(id);
  return run(async () => {
    try {
      if (perched(id)) {
        const ok = await callDown(id);
        if (!ok) return;
      }
      beginTalk(id);
      if (!getGame().progress.monsters[id].discovered) {
        const ok = await describe(id);
        if (!ok) return;
      } else if (neededLine(getGame().progress, id)) {
        // Walked away mid-page: finish writing it.
        setGame({ discovering: { monster: id, colored: true, lines: writtenLines(id) } });
        const ok = await describeLines(id);
        setGame({ discovering: null });
        if (!ok) return;
      }
      if (id === "lumo") {
        await lumoFriendship();
        return;
      }
      if (!favoriteKnown(getGame().progress, id)) {
        const ok = await askLikes(id);
        if (!ok) return;
      }
      const food = MONSTERS[id].favorite;
      if (has(getGame().progress, food)) await feed(id);
      else await wantsFood(id);
    } finally {
      endTalk(id);
    }
  });
}

// ------------------------------------------------------------ discover

/** A shy flier still waiting up in its tree. */
function perched(id: MonsterId): boolean {
  return Boolean(MONSTERS[id].perch) && !getGame().progress.monsters[id].discovered;
}

/** "Come here!": the shy flier comes down from its perch to the player. */
async function callDown(id: MonsterId): Promise<boolean> {
  const m = rt.monsters[id];
  const def = MONSTERS[id];
  const perch = def.perch!;
  facePlayer(perch);
  // Over the player's shoulder, looking up into the tree.
  const p = rt.player;
  const dx = perch.x - p.x;
  const dz = perch.z - p.z;
  const len = Math.hypot(dx, dz) || 1;
  const gy = groundY(p.x, p.z);
  shot(
    { x: p.x - (dx / len) * 3.6 + (dz / len) * 1.6, y: gy + 1.5, z: p.z - (dz / len) * 3.6 - (dx / len) * 1.6 },
    { x: perch.x, y: groundY(perch.x, perch.z) + perch.y * 0.75, z: perch.z }
  );
  m.mode = "script";
  m.look = { x: p.x, z: p.z };
  animate(id, "hide");
  audio.voice(id, "surprised");
  const said = await ask({
    kind: "command",
    options: ["comeHere"],
    question: { en: "A shy monster! Call it.", by: "game" },
    help: "はずかしがりやの モンスター。えいごで よんでみよう",
    readQuestion: true,
    readSentence: true,
    onWrong: () => {
      animate(id, "tilt");
      audio.voice(id, "surprised");
    }
  });
  if (!said) return false;
  // It flutters down and lands in front of the player.
  animate(id, "hop");
  audio.voice(id, "happy");
  const spot = nearestWalkable(p.x + (dx / len) * 1.7, p.z + (dz / len) * 1.7, def.radius, gatesOf(getGame().progress));
  const from = { x: m.x, z: m.z };
  m.airTarget = 0.35;
  const t0 = rt.time;
  while (rt.time - t0 < 1.3) {
    const k = Math.min(1, (rt.time - t0) / 1.3);
    const s = k * k * (3 - 2 * k);
    m.x = from.x + (spot.x - from.x) * s;
    m.z = from.z + (spot.z - from.z) * s;
    m.yaw = Math.atan2(p.x - m.x, p.z - m.z);
    await wait(30);
  }
  m.look = { x: p.x, z: p.z };
  return true;
}

/** Lines already written on the page (the discovery card shows them). */
function writtenLines(id: MonsterId): DescribeLine[] {
  const d = getGame().progress.monsters[id].described;
  return (["name", "size", "part"] as DescribeLine[]).filter((l) => d[l]);
}

/** The phrase for one journal line about a monster ("It's small.", "It has wings."). */
export function linePhrase(id: MonsterId, line: DescribeLine): PhraseId {
  const def = MONSTERS[id];
  return line === "name" ? "whatsYourName" : line === "size" ? SIZE_PHRASE[def.size] : PART_PHRASE[def.part!];
}

const LINE_ASK: Record<DescribeLine, { en: string; ja: string }> = {
  name: { en: "Ask its name!", ja: "なまえを きこう" },
  size: { en: "Is it big or small?", ja: "おおきい? ちいさい? えいごで いおう" },
  part: { en: "Look! What does it have?", ja: "からだの とくちょうを えいごで いおう" }
};

/** From Phase 2 on a new page also needs its size and body part ("It's small." "It has wings."). */
async function describeLines(id: MonsterId): Promise<boolean> {
  for (;;) {
    const line = neededLine(getGame().progress, id);
    if (!line) return true;
    const said = await ask({
      kind: "command",
      options: [linePhrase(id, line)],
      question: { en: LINE_ASK[line].en, by: "game" },
      help: LINE_ASK[line].ja,
      readQuestion: true,
      readSentence: true
    });
    if (!said) return false;
    updateProgress((p) => describeLine(p, id, line));
    const d = getGame().discovering;
    if (d) setGame({ discovering: { ...d, lines: [...(d.lines ?? []), line] }, journalPulse: true });
    audio.play("journal");
    if (line === "name") {
      audio.voice(id, "hello");
      await say(id, `I'm ${MONSTERS[id].name}!`, undefined, { target: true });
    }
    animate(id, line === "part" ? "power" : "hop");
    audio.voice(id, "happy");
    await wait(900);
  }
}

/** "New monster!": describe it to write its journal page. */
async function describe(id: MonsterId): Promise<boolean> {
  const def = MONSTERS[id];
  const first = !Object.values(getGame().progress.monsters).some((r) => r.discovered);
  animate(id, def.temper === "shy" ? "hide" : "notice");
  audio.play("discover");
  audio.voice(id, "surprised");
  setGame({ discovering: { monster: id, colored: false, lines: [] } });
  await wait(700);
  const said = await ask({
    kind: "command",
    options: [COLOR_PHRASE[def.color]],
    question: { en: "What color is it?", by: "game" },
    help: "いろを えいごで いって、ずかんに かこう",
    readQuestion: true,
    readSentence: first
  });
  if (!said) {
    setGame({ discovering: null });
    return false;
  }
  updateProgress((p) => discover(p, id));
  setGame({ discovering: { monster: id, colored: true, lines: [] }, journalPulse: true });
  audio.play("journal");
  await wait(900);
  animate(id, "hop");
  audio.voice(id, "hello");
  if (id !== "lumo") await say(id, `Hi! I'm ${def.name}!`, undefined, { target: true });
  const ok = await describeLines(id);
  setGame({ discovering: null });
  return ok;
}

/** From the journal: say an optional line about a friend from the beach ("It's small."). */
export function writeLine(id: MonsterId, line: DescribeLine): Promise<void> {
  return run(async () => {
    const def = MONSTERS[id];
    const said = await ask({
      kind: "command",
      options: [linePhrase(id, line)],
      question: { en: `${def.name}: is it big or small?`, by: "game" },
      help: `${def.name}は おおきい? ちいさい? えいごで いおう`,
      picture: id,
      readQuestion: true,
      readSentence: true,
      cancellable: true
    });
    if (!said) return;
    updateProgress((p) => describeLine(p, id, line));
    audio.play("journal");
    setGame({ journalPulse: true });
    toast({ en: PHRASES[said].en, ja: "ずかんに かいたよ", icon: id, tone: "good" });
  });
}

// ------------------------------------------------------------ communicate

/** Ask about foods until the monster says yes. Returns false if the student walks away. */
async function askLikes(id: MonsterId): Promise<boolean> {
  const def = MONSTERS[id];
  const icons: Partial<Record<PhraseId, string>> = {};
  for (const f of questionFoods(getGame().progress, id)) icons[LIKE_PHRASE[f]] = f;
  let first = !Object.values(getGame().progress.monsters).some((r) => Object.keys(r.asked).length > 0);
  if (first) {
    await say("game", `What does ${def.name} like? Ask!`, `${def.name}の すきな たべものは なにかな? きいてみよう!`);
  }
  for (;;) {
    const crossed = dislikedKnown(getGame().progress, id).map((f) => LIKE_PHRASE[f]);
    const said = await ask({
      kind: "choice",
      options: questionFoods(getGame().progress, id).map((f) => LIKE_PHRASE[f]),
      frame: { before: "Do you like", after: "?" },
      icons,
      crossed,
      help: "たべものを えらんで きいてみよう",
      cancellable: true
    });
    if (!said) return false;
    const food = foodOfPhrase(said)!;
    const ans = answerLike(def, food);
    updateProgress((p) => recordLike(p, id, food));
    const m = rt.monsters[id];
    m.talking = true;
    if (ans.yes) {
      animate(id, "spin");
      audio.voice(id, "excited");
      effect("hearts", m.x, 1.2, m.z);
    } else {
      animate(id, "no");
      audio.voice(id, "sad");
    }
    await say(id, `${ans.short} ${ans.long}`, undefined, { target: true, tone: ans.yes ? "yes" : "no", food });
    m.talking = false;
    if (ans.yes) {
      setGame({ journalPulse: true });
      return true;
    }
    // After two "No"s it glances at what it really likes (a hint, not the answer).
    if (dislikedKnown(getGame().progress, id).length >= 2) {
      m.look = def.foodSpot;
      await wait(1100);
      m.look = { x: rt.player.x, z: rt.player.z };
    }
    first = false;
  }
}

// ------------------------------------------------------------ befriend

/** It said what it likes, but the student has none: show where to look. */
async function wantsFood(id: MonsterId) {
  const def = MONSTERS[id];
  const food = FOODS[def.favorite];
  await say("game", `Find ${food.word} for ${def.name}!`, `${food.ja}を みつけて、${def.name}に あげよう!`, { food: def.favorite });
}

async function feed(id: MonsterId) {
  const def = MONSTERS[id];
  const food = def.favorite;
  const m = rt.monsters[id];
  rt.player.action = { kind: "give", t0: rt.time };
  audio.play("give");
  await wait(500);
  animate(id, "eat");
  audio.play("munch");
  await wait(1300);
  animate(id, "spin");
  audio.voice(id, "excited");
  effect("hearts", m.x, 1.2, m.z);
  await wait(700);
  // The monster asks back: the student produces the answer pattern.
  const back = await ask({
    kind: "choice",
    options: ["yesIDo", "noIDont"],
    question: { en: `Do you like ${FOODS[food].word}?`, by: id },
    help: "あなたは? こたえよう",
    readQuestion: true
  });
  m.talking = true;
  if (back === "yesIDo") {
    animate(id, "yes");
    audio.voice(id, "happy");
    await say(id, "Me too!", undefined, { target: true, tone: "yes" });
  } else {
    animate(id, "hop");
    audio.voice(id, "happy");
    await say(id, "That's OK!", "だいじょうぶ!", { tone: "yes" });
  }
  m.talking = false;
  // Friendship (the food leaves the bag now; walking away before this point keeps it).
  updateProgress((p) => befriend(p, id));
  animate(id, "friend");
  audio.play("friend");
  effect("hearts", m.x, 1.4, m.z);
  effect("sparkle", m.x, 1, m.z);
  setGame({ friendCard: id, journalPulse: true });
  await say("game", `${def.name} is your friend!`, `${def.name}と ともだちに なった!`);
  setGame({ friendCard: null });
  if (def.phase >= 2) {
    await inviteAlong(id);
    return;
  }
  const p = getGame().progress;
  if (p.active === id) {
    m.mode = "follow";
    await say("game", `${def.name} will come with you.`, `${def.name}が ついてくるよ。こまったら たすけて もらおう!`);
  } else {
    toast({ en: `${def.name} is in your journal.`, ja: `ずかん(M)で ${def.name}を えらべるよ`, icon: id, tone: "info" }, 4200);
  }
}

/** The saved invitation is separate from Ember's friendship so interruption resumes here. */
async function inviteAlong(id: MonsterId) {
  const said = await ask({
    kind: "command",
    options: ["letsGo"],
    question: { en: `Take ${MONSTERS[id].name} with you!`, by: "game" },
    help: `${MONSTERS[id].name}を さそおう`,
    readQuestion: true,
    readSentence: true,
    onWrong: () => animate(id, "tilt")
  });
  if (!said) return;
  switchTo(id, true);
  if (id === "ember") updateProgress((p) => invite(p, id));
  const m = rt.monsters[id];
  m.mode = "talk";
  m.talking = true;
  animate(id, "yes");
  audio.voice(id, "excited");
  await say(id, "OK! Let's go!", undefined, { target: true, tone: "yes" });
  m.talking = false;
  m.mode = "follow";
}

async function lumoFriendship() {
  const back = await ask({
    kind: "choice",
    options: [...LUMO_ASK_BACK.answers],
    question: { en: LUMO_ASK_BACK.en, by: "lumo" },
    help: "あなたは? こたえよう",
    readQuestion: true
  });
  if (back !== "yesIDo" && back !== "noIDont") return;
  const m = rt.monsters.lumo;
  m.talking = true;
  animate("lumo", "yes");
  audio.voice("lumo", "happy");
  await say("lumo", back === "yesIDo" ? "Me too! I like you!" : "That's OK! We can be friends!", undefined, { target: true, tone: "yes" });
  m.talking = false;
  updateProgress((p) => befriendLumo(p, back));
  animate("lumo", "friend");
  audio.play("friend");
  effect("hearts", m.x, 1.8, m.z);
  setGame({ friendCard: "lumo", journalPulse: true });
  await say("game", "Lumo is your friend!", "Lumoと ともだちに なった!");
  setGame({ friendCard: null });
}

// ------------------------------------------------------------ friends

/** E on a friend: the companion chats; another friend comes along. */
async function friendChat(id: MonsterId) {
  const p = getGame().progress;
  if (p.active !== id && MONSTERS[id].companion !== false) {
    switchTo(id);
    return;
  }
  const def = MONSTERS[id];
  animate(id, "hop");
  audio.voice(id, "happy");
  const lines: Array<{ en: string; ja?: string }> = id === "lumo"
    ? [{ en: "I like monsters!" }, { en: "You are my friend!" }, { en: "Thank you!" }]
    : [def.powerLine, { en: `I like ${FOODS[def.favorite].word}!` }];
  const line = lines[Math.floor(rt.time) % lines.length];
  await run(async () => {
    if (id === "lumo") beginTalk(id);
    rt.monsters[id].talking = true;
    // "I like apples!" is target English (never glossed); the power line has help.
    await say(id, line.en, line.ja, { target: !line.ja });
    rt.monsters[id].talking = false;
    if (id === "lumo") endTalk(id);
  });
}
