import { audio } from "../audio/audio";
import { effect } from "./runtime";

/** Live reveals (enemies or chests): one capped smoke effect and a short pop. */
export function revealSmoke(x: number, y: number, z: number) {
  effect("smoke", x, y, z);
  audio.play("spawnPop");
}
