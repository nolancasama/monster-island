import type { Text } from "../game/types";
import type { Objective } from "../game/logic/progress";
import { MONSTERS } from "../game/data/monsters";
import { FOODS } from "../game/data/foods";

/** UI text: short English with optional hiragana-forward Japanese help. */
export const UI = {
  speakKeys: { en: "Press SPACE and say it!", ja: "スペースを おして いってみよう" },
  speakTouch: { en: "Tap 🎤 and say it!", ja: "🎤を おして いってみよう" },
  listening: { en: "Listening...", ja: "きいているよ…" },
  tryAgain: { en: "Try again!", ja: "もう いちど!" },
  listen: { en: "Listen, then say it.", ja: "きいてから いってみよう" },
  rescue: { en: "Say it, or tap it.", ja: "いうか、タップしよう" },
  choose: { en: "Choose one.", ja: "えらぼう" },
  unclear: { en: "One sentence, please!", ja: "ひとつだけ いってね" },
  wrong: { en: "Not that one.", ja: "それじゃないよ" },
  next: { en: "Next", ja: "つぎへ" },
  journal: { en: "Journal", ja: "ずかん" },
  micBlocked: { en: "Microphone is off: tap the sentences.", ja: "マイクが つかえないので タップで こたえよう" },
  move: { en: "Move: WASD / arrows. Drag to look.", ja: "いどう: WASD / やじるし。ドラッグで みまわす" },
  moveTouch: { en: "Move with the stick. Drag to look.", ja: "スティックで いどう。ドラッグで みまわす" },
  switch: { en: "Open the journal (M) and choose a friend!", ja: "ずかん(M)で ともだちを えらぼう!" }
} satisfies Record<string, Text>;

/** The objective card. */
export function objectiveText(o: Objective): Text {
  const name = (id: keyof typeof MONSTERS) => MONSTERS[id].name;
  switch (o.id) {
    case "meetMaple":
      return { en: "Meet Professor Maple", ja: "メイプルはかせに あおう" };
    case "findMonster":
      return { en: "Find a monster!", ja: "モンスターを さがそう!" };
    case "describe":
      return { en: `Write about ${name(o.monster)}`, ja: `${name(o.monster)}の ことを ずかんに かこう` };
    case "askFood":
      return { en: `What does ${name(o.monster)} like?`, ja: `${name(o.monster)}の すきな たべものを きこう` };
    case "getFood":
      return { en: `Find ${FOODS[o.food].word}`, ja: `${FOODS[o.food].ja}を みつけよう` };
    case "giveFood":
      return { en: `Give ${FOODS[o.food].word} to ${name(o.monster)}`, ja: `${name(o.monster)}に あげよう` };
    case "obstacle":
      if (o.obstacle === "fallenPalm") return { en: "A tree is in the way!", ja: "木が みちを ふさいでいる!" };
      if (o.obstacle === "river") return { en: "Cross the river!", ja: "かわを わたろう!" };
      if (o.obstacle === "bridge") return { en: "Go into the forest!", ja: "もりへ いこう! こわれた はしが あるよ" };
      return { en: "Climb the high cliff!", ja: "たかい がけを のぼろう!" };
    case "stone":
      return { en: "Look at the old stone", ja: "ふるい いしを しらべよう" };
    case "cliffTop":
      return { en: "Climb the rope!", ja: "ロープを のぼろう!" };
    default:
      return { en: "Explore the island!", ja: "しまを たんけんしよう!" };
  }
}
