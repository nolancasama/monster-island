import { NPCS, type NpcId } from "../data/town";
import { rt } from "../runtime";
import { PIPPA, SERVICES } from "../world/lowland";
import { frameTwo, run } from "./script";
import { ask, say } from "./ask";

/** Turn the player to a keeper and frame the two of them for the conversation. */
export function faceKeeper(id: NpcId) {
  const k = SERVICES[NPCS[id].service].keeper;
  rt.player.yaw = Math.atan2(k.x - rt.player.x, k.z - rt.player.z);
  frameTwo(rt.player, k, 0.85);
}

/**
 * Pippa behind the Food Market (found by exploring; never required): "Do you like
 * apples?" with the usual Speak / Tap answers, and a friendly reply to either.
 * She can be asked again any time.
 */
export function talkToPippa(): Promise<void> {
  return run(async () => {
    rt.player.yaw = Math.atan2(PIPPA.x - rt.player.x, PIPPA.z - rt.player.z);
    frameTwo(rt.player, PIPPA, 0.85);
    await say("pippa", "Hi! I'm Pippa. I'm eating my snack here.", "こんにちは! ピッパだよ。ここで おやつを たべてるの。");
    const said = await ask({ kind: "choice", options: ["yesIDo", "noIDont"], tapAlways: true, readQuestion: true, picture: "apples", cancellable: true,
      question: { by: "pippa", en: "Do you like apples?", ja: "りんごは すき?" }, help: "すきなら「Yes, I do.」、すきじゃないなら「No, I don't.」" });
    if (said === "yesIDo") await say("pippa", "Me too! Apples are yummy!", "わたしも! りんごって おいしいよね!");
    else if (said === "noIDont") await say("pippa", "Oh, okay! I like apples. They're sweet!", "そっか! わたしは りんごが すき。あまいんだよ!");
    else await say("pippa", "Come back any time!", "また きてね!");
  });
}
