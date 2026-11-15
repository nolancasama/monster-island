import { WEARABLES, type WearableId, type Wearer } from "../data/wearables";
import { buyWearable, canWear, markClothesVisited, takeOff, wear } from "../logic/wardrobe";
import { getGame, setGame, toast, updateProgress } from "../store";
import { animate, effect, rt } from "../runtime";
import { ask, say, speak } from "./ask";
import { run, walkY } from "./script";
import { faceKeeper } from "./town";
import { audio } from "../../audio/audio";

/**
 * Ms. Button's clothes shop (docs/PORT_TOWN_REVAMP.md §3.4): a short English
 * greeting the first time, then the panel, whose buttons call the actions below.
 */
export function clothesShop(): Promise<void> {
  return run(async () => {
    faceKeeper("tailor");
    if (getGame().progress.act2.wardrobe.visited) {
      await say("tailor", "Hello again! Look at my hats!", "また きてくれたね! ぼうしを みてね!");
      setGame({ panel: "clothes" });
      return;
    }
    await say("tailor", "Welcome! I'm Ms. Button.", "ようこそ! わたしは ボタンさん。");
    await say("tailor", "I have funny hats and glasses!", "おもしろい ぼうしと めがねが あるよ!");
    const answer = await ask({
      kind: "choice",
      options: ["yesPlease", "noThankYou"],
      question: { en: "Do you want a hat?", ja: "ぼうしは いかが?", by: "tailor" },
      readQuestion: true,
      cancellable: true
    });
    if (!answer) return;
    updateProgress(markClothesVisited);
    if (answer === "noThankYou") {
      await say("tailor", "OK. See you!", "わかった。またね!");
      return;
    }
    setGame({ panel: "clothes" });
  });
}

/** Tapping a card: Ms. Button names the item ("This is a pirate hat."). */
export function sayItem(item: WearableId) {
  void speak(WEARABLES[item].line, "tailor");
}

/** Opening the who-picker. */
export function askWhoWears() {
  void speak("Who will wear it?", "tailor");
}

/** The card's Buy button; true when bought (the panel then asks who will wear it). */
export function buyClothes(item: WearableId): boolean {
  const res = buyWearable(getGame().progress, item);
  if (!res.ok) {
    if (res.reason === "coins") {
      audio.play("error");
      toast({ en: "Not enough coins!", ja: "コインが たりない!", icon: "coin", tone: "warn" }, 1800);
    }
    return false;
  }
  updateProgress(() => res.progress);
  audio.play("buy");
  askWhoWears();
  return true;
}

/** Put an owned item on someone: Ms. Button approves, the wearer sparkles and cheers. */
export function wearClothes(item: WearableId, who: Wearer) {
  if (!canWear(getGame().progress, item, who)) return;
  updateProgress((p) => wear(p, item, who));
  void speak("Great choice!", "tailor");
  audio.play("sparkle");
  const at = who === "player" ? rt.player : rt.monsters[who];
  effect("sparkle", at.x, walkY(at) + 1.3, at.z);
  if (who === "player") rt.player.action = { kind: "cheer", t0: rt.time };
  else {
    animate(who, "friend");
    audio.voice(who, "excited");
  }
}

export function takeOffClothes(item: WearableId) {
  updateProgress((p) => takeOff(p, item));
  audio.play("whoosh");
}
