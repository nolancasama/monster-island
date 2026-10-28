import { FOOD_SOURCES } from "../world/island";
import { FOODS } from "../data/foods";
import { bagMax } from "../logic/act2";
import { companions, pickUp } from "../logic/progress";
import { getGame, setGame, toast, updateProgress, type Focus } from "../store";
import { effect, rt } from "../runtime";
import { talkTo } from "./encounter";
import { climbRope, useObstacle } from "./obstacles";
import { cliffTopEnding, readSign, stoneEnding, talkToMaple } from "./story";
import { switchTo } from "./companion";
import { isRunning, run } from "./script";
import { audio } from "../../audio/audio";
import { climbCliff, lookAtLockedGate, openChestScene, readForkSign, restAtCamp, talkToKeeper } from "./act2";
import type { ServiceId } from "../world/lowland";
import type { MonsterId, ObstacleId } from "../types";

/** E / Enter / the touch action button. */
export function interact(f: Focus | null = getGame().focus) {
  const g = getGame();
  if (!f || g.mode !== "explore" || isRunning()) return;
  if (g.hint === "talk" || g.hint === "move") setGame({ hint: null });
  switch (f.kind) {
    case "monster":
      void talkTo(f.id as MonsterId);
      return;
    case "food":
      pick(f.id);
      return;
    case "maple":
      void talkToMaple();
      return;
    case "obstacle":
      void useObstacle(f.id as ObstacleId);
      return;
    case "rope":
      void run(async () => {
        const up = f.id === "ropeUp";
        await climbRope(up);
        if (up && getGame().progress.endings < 2) await cliffTopEnding();
      });
      return;
    case "stone":
      if (getGame().progress.endings < 1) void stoneEnding();
      return;
    case "sign":
      if (f.id === "forkSign") void readForkSign();
      else if (f.id === "lockedGate") void lookAtLockedGate();
      else void readSign();
      return;
    // Act 2.
    case "cliffRope":
      void climbCliff(f.id === "cliffDown");
      return;
    case "chest":
      void openChestScene(f.id);
      return;
    case "rest":
      void restAtCamp();
      return;
    case "npc":
      void talkToKeeper(f.id as ServiceId);
  }
}

function pick(sourceId: string) {
  const s = FOOD_SOURCES.find((x) => x.id === sourceId);
  if (!s || rt.taken.has(s.id)) return;
  const before = getGame().progress.bag[s.food] ?? 0;
  if (before >= bagMax(getGame().progress)) {
    toast({ en: "Your bag is full!", ja: `${FOODS[s.food].ja}は もう いっぱい!`, icon: s.food, tone: "info" }, 2200);
    return;
  }
  updateProgress((p) => pickUp(p, s.food));
  if ((getGame().progress.bag[s.food] ?? 0) === before) return;
  rt.taken.set(s.id, s.regrow);
  // Turn to the food and squat for it: a full squat for food on the ground,
  // a shallower one for the fish basket.
  rt.player.yaw = Math.atan2(s.x - rt.player.x, s.z - rt.player.z);
  rt.player.action = { kind: "pick", t0: rt.time, food: s.food, depth: s.food === "fish" ? 0.45 : 1 };
  effect("sparkle", s.x, 0.8, s.z);
  audio.play("pick");
  toast({ en: `+1 ${FOODS[s.food].word}`, ja: FOODS[s.food].ja, icon: s.food, tone: "good" }, 1600);
}

/** Number keys / HUD chips: switch companion, or chat with the one already following (explore mode). */
export function switchByIndex(i: number) {
  const g = getGame();
  if (g.mode !== "explore" || isRunning()) return;
  const friends = companions(g.progress);
  const id = friends[i];
  if (!id) return;
  if (id === g.progress.active) void talkTo(id);
  else switchTo(id);
}
