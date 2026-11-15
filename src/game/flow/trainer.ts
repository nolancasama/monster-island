import { MONSTERS } from "../data/monsters";
import { COMBOS } from "../data/combos";
import { COMPANION_IDS, type CompanionId } from "../data/combat";
import { knowsCombo, learnCombo } from "../logic/act2";
import { banner, getGame, setGame, updateProgress } from "../store";
import { animate, effect, rt } from "../runtime";
import { ask, say, wait } from "./ask";
import { run, walkY } from "./script";
import { poofTo } from "./companion";
import { faceKeeper } from "./town";
import { audio } from "../../audio/audio";

/**
 * Coach Rex teaches one combo per friend (docs/PORT_TOWN_REVAMP.md §4.3): a
 * greeting, the combo panel, and a short spoken lesson for the chosen friend.
 */
export function trainer(): Promise<void> {
  return run(async () => {
    faceKeeper("trainer");
    await say("trainer", "Hi! I'm Coach Rex. I teach monster combos!", "やあ! コーチの レックスだ。モンスターの コンボを おしえるぞ!");
    const p = getGame().progress;
    const friends = COMPANION_IDS.filter((f) => p.monsters[f].friend);
    if (friends.length && friends.every((f) => knowsCombo(p, f))) await say("trainer", "Your friends know every combo. Great job!", "ともだちは みんな コンボを しってるね。すごい!");
    setGame({ panel: "combos" });
  });
}

/** The panel's Learn button: Rex explains the combo and asks; one amber teaches it. */
export function learnComboScene(friend: CompanionId): Promise<void> {
  setGame({ panel: null });
  return run(async () => {
    faceKeeper("trainer");
    const c = COMBOS[friend];
    await say("trainer", c.rule.en, c.rule.ja);
    await say("trainer", c.extra.en, c.extra.ja);
    const answer = await ask({
      kind: "choice",
      options: ["yesPlease", "noThankYou"],
      question: { en: "Do you want to learn it? It's one amber.", ja: "ならう? こはく 1こ だよ。", by: "trainer" },
      readQuestion: true,
      cancellable: true
    });
    if (!answer) return;
    if (answer === "noThankYou") {
      await say("trainer", "OK! Come back any time!", "わかった! いつでも おいで!");
      return;
    }
    const res = learnCombo(getGame().progress, friend);
    if (!res.ok) {
      if (res.reason === "amber") await say("trainer", "Sorry! You need one amber. Look in treasure chests!", "ごめんね! こはくが 1こ いるよ。たからばこを さがそう!");
      return;
    }
    updateProgress(() => res.progress);
    // The friend shows off its new combo, there and then.
    const m = rt.monsters[friend];
    if (Math.hypot(m.x - rt.player.x, m.z - rt.player.z) > 4) poofTo(friend, rt.player.x + 1.2, rt.player.z + 0.8);
    m.mode = "script";
    m.look = { x: rt.player.x, z: rt.player.z };
    animate(friend, "power");
    audio.play("comboLearn");
    audio.voice(friend, "excited");
    effect("sparkle", m.x, walkY(m) + 1.2, m.z);
    banner({ title: `${MONSTERS[friend].name} learned ${c.name.en}!`, sub: c.rule.en.replace(/^\S+ combo! /, ""), ja: `${MONSTERS[friend].name}は ${c.name.ja}を おぼえた!`, tone: "clear" }, 3600);
    await wait(900);
    await say("trainer", "Great! Try it in a fight!", "いいね! たたかいで ためして みよう!");
    await ask({ kind: "command", options: ["thankYou"], readSentence: true, help: "コーチに おれいを いおう" });
    m.mode = friend === getGame().progress.active ? "follow" : "party";
    m.look = null;
  });
}
