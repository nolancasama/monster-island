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
  switch: { en: "Open the journal (M) and choose a friend!", ja: "ずかん(M)で ともだちを えらぼう!" },
  // Act 2's tutorial (each shows until it is understood).
  attack: { en: "An enemy! Press J to attack. Hold J to keep going!", ja: "てきだ! J で こうげき。おしつづけると れんぞく こうげき!" },
  attackTouch: { en: "An enemy! Tap the big button to attack!", ja: "てきだ! おおきい ボタンで こうげき!" },
  coins: { en: "Coins! Walk near them to pick them up.", ja: "コインだ! ちかくを あるくと ひろえるよ" },
  special: { en: "Press K for a special move! It uses MP.", ja: "K で とくべつな わざ! MPを つかうよ" },
  specialTouch: { en: "Tap the special button! It uses MP.", ja: "とくべつな わざの ボタンを タップ! MPを つかうよ" },
  eat: { en: "HP or MP low? Press F to eat food!", ja: "HPや MPが へったら F で たべよう!" },
  eatTouch: { en: "HP or MP low? Tap Eat!", ja: "HPや MPが へったら「Eat」を タップ!" },
  switchAct2: { en: "Press 1-4 to change friends. Each friend fights in its own way!", ja: "1〜4 で ともだちを かえよう。それぞれ たたかいかたが ちがうよ!" }
} satisfies Record<string, Text>;

/** The objective card. */
export function objectiveText(o: Objective): Text {
  const name = (id: keyof typeof MONSTERS) => MONSTERS[id].name;
  switch (o.id) {
    case "meetMaple":
      return { en: "Meet Professor Maple", ja: "メイプルはかせに あおう" };
    case "findMonster":
      if (o.monster === "lumo") return { en: "Meet the legendary monster!", ja: "でんせつの モンスターに あおう!" };
      return { en: "Find a monster!", ja: "モンスターを さがそう!" };
    case "describe":
      if (o.line === "name") return { en: "Ask its name!", ja: "なまえを えいごで きこう!" };
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
      if (o.obstacle === "lava") return { en: "Cool the hot lava!", ja: "あつい ようがんを ひやそう!" };
      if (o.obstacle === "cave") return { en: "Light the dark cave!", ja: "くらい どうくつに あかりを つけよう!" };
      if (o.obstacle === "gateLeaf") return { en: "Wake the leaf pillar!", ja: "はっぱの はしらに ちからを あつめよう!" };
      if (o.obstacle === "gateDrop") return { en: "Fill the water basin!", ja: "みずの はしらを みたそう!" };
      if (o.obstacle === "gateWing") return { en: "Ring the high bell!", ja: "つばさの はしらの かねを ならそう!" };
      if (o.obstacle === "gateFlame") return { en: "Light the flame pillar!", ja: "ほのおの はしらに ひを つけよう!" };
      return { en: "Climb the high cliff!", ja: "たかい がけを のぼろう!" };
    case "stone":
      return { en: "Look at the old stone", ja: "ふるい いしを しらべよう" };
    case "cliffTop":
      return { en: "Climb the rope!", ja: "ロープを のぼろう!" };
    case "letsGo":
      return { en: `Invite ${name(o.monster)}!`, ja: `${name(o.monster)}に「Let's go!」と いおう!` };
    case "askBack":
      return { en: "Do you like monsters?", ja: "モンスターは すき? こたえよう!" };
    case "finale":
      return { en: "Celebrate with your friends!", ja: "ともだちと おいわいしよう!" };
    // Act 2: The Hunt for Lumo.
    case "act2Start":
      return { en: "New chapter! Visit Lumo in the garden.", ja: "あたらしい おはなし! にわの ルモに あいに いこう" };
    case "descend":
      return { en: "Climb down the cliff!", ja: "がけの ロープを おりよう!" };
    case "openChest":
      return { en: "Find the treasure chest!", ja: "たからばこを さがそう!" };
    case "crossing":
      return { en: "Reach Fern Crossing!", ja: "シダの ぶんきてんへ いこう!" };
    case "reachPort":
      return { en: "Rescue Lumo! Reach the port.", ja: "ルモを たすけよう! みなとへ いこう" };
    case "market":
      return { en: "Buy food at the market!", ja: "おみせで たべものを かおう!" };
    case "kitchen":
      return { en: "Make a monster treat!", ja: "キッチンで おやつを つくろう!" };
    case "harbor":
      return { en: "Ask at the harbor: Where is the ship?", ja: "みなとの じむしょで ふねの ことを きこう" };
    case "act2Done":
      return { en: "Lumo is on Cloud Isle! (To be continued)", ja: "ルモは クラウドじまに いる! (つづく)" };
    default:
      return { en: "Explore the island!", ja: "しまを たんけんしよう!" };
  }
}
