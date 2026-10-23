import { FOOD_SOURCES } from "../world/island";
import { FOODS } from "../data/foods";
import { companions, pickUp } from "../logic/progress";
import { getGame, setGame, toast, updateProgress, type Focus } from "../store";
import { effect, rt } from "../runtime";
import { talkTo } from "./encounter";
import { climbRope, useObstacle } from "./obstacles";
import { cliffTopEnding, readSign, stoneEnding, talkToMaple } from "./story";
import { switchTo } from "./companion";
import { isRunning, run } from "./script";
import { audio } from "../../audio/audio";
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
      void readSign();
  }
}

function pick(sourceId: string) {
  const s = FOOD_SOURCES.find((x) => x.id === sourceId);
  if (!s || rt.taken.has(s.id)) return;
  const before = getGame().progress.bag[s.food] ?? 0;
  updateProgress((p) => pickUp(p, s.food));
  if ((getGame().progress.bag[s.food] ?? 0) === before) return;
  rt.taken.set(s.id, s.regrow);
  rt.player.action = { kind: "pick", t0: rt.time };
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
