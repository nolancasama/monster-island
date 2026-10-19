import { MONSTERS } from "../data/monsters";
import { FOODS, ISLAND_FOODS } from "../data/foods";
import { COLOR_PHRASE, LIKE_PHRASE, foodOfPhrase, type PhraseId } from "../logic/english";
import { answerLike, befriend, discover, dislikedKnown, favoriteKnown, has, recordLike } from "../logic/progress";
import { getGame, setGame, toast, updateProgress } from "../store";
import { animate, effect, rt } from "../runtime";
import { ask, say, wait } from "./ask";
import { facePlayer, frameTwo, run } from "./script";
import { switchTo } from "./companion";
import { audio } from "../../audio/audio";
import type { MonsterId } from "../types";

/**
 * One monster encounter: discover (describe it for the journal), communicate
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
  if (p.monsters[id].friend) return friendChat(id);
  return run(async () => {
    beginTalk(id);
    try {
      if (!getGame().progress.monsters[id].discovered) {
        const ok = await describe(id);
        if (!ok) return;
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

/** "New monster!": describe it to write its journal page. */
async function describe(id: MonsterId): Promise<boolean> {
  const def = MONSTERS[id];
  const first = !Object.values(getGame().progress.monsters).some((r) => r.discovered);
  animate(id, def.temper === "shy" ? "hide" : "notice");
  audio.play("discover");
  audio.voice(id, "surprised");
  setGame({ discovering: { monster: id, colored: false } });
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
  setGame({ discovering: { monster: id, colored: true }, journalPulse: true });
  audio.play("journal");
  await wait(900);
  animate(id, "hop");
  audio.voice(id, "hello");
  await say(id, `Hi! I'm ${def.name}!`, undefined, { target: true });
  setGame({ discovering: null });
  return true;
}

// ------------------------------------------------------------ communicate

/** Ask about foods until the monster says yes. Returns false if the student walks away. */
async function askLikes(id: MonsterId): Promise<boolean> {
  const def = MONSTERS[id];
  const icons: Partial<Record<PhraseId, string>> = {};
  for (const f of ISLAND_FOODS) icons[LIKE_PHRASE[f]] = f;
  let first = !Object.values(getGame().progress.monsters).some((r) => Object.keys(r.asked).length > 0);
  if (first) {
    await say("game", `What does ${def.name} like? Ask!`, `${def.name}の すきな たべものは なにかな? きいてみよう!`);
  }
  for (;;) {
    const crossed = dislikedKnown(getGame().progress, id).map((f) => LIKE_PHRASE[f]);
    const said = await ask({
      kind: "choice",
      options: ISLAND_FOODS.map((f) => LIKE_PHRASE[f]),
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
  const p = getGame().progress;
  if (p.active === id) {
    m.mode = "follow";
    await say("game", `${def.name} will come with you.`, `${def.name}が ついてくるよ。こまったら たすけて もらおう!`);
  } else {
    toast({ en: `${def.name} is in your journal.`, ja: `ずかん(M)で ${def.name}を えらべるよ`, icon: id, tone: "info" }, 4200);
  }
}

// ------------------------------------------------------------ friends

/** E on a friend: the companion chats; another friend comes along. */
async function friendChat(id: MonsterId) {
  const p = getGame().progress;
  if (p.active !== id) {
    switchTo(id);
    return;
  }
  const def = MONSTERS[id];
  animate(id, "hop");
  audio.voice(id, "happy");
  const lines: Array<{ en: string; ja?: string }> = [def.powerLine, { en: `I like ${FOODS[def.favorite].word}!` }];
  const line = lines[Math.floor(rt.time) % lines.length];
  await run(async () => {
    rt.monsters[id].talking = true;
    // "I like apples!" is target English (never glossed); the power line has help.
    await say(id, line.en, line.ja, { target: !line.ja });
    rt.monsters[id].talking = false;
  });
}
