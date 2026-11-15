import { NPCS, type NpcId } from "../data/town";
import { rt } from "../runtime";
import { SERVICES } from "../world/lowland";
import { frameTwo } from "./script";

/** Turn the player to a keeper and frame the two of them for the conversation. */
export function faceKeeper(id: NpcId) {
  const k = SERVICES[NPCS[id].service].keeper;
  rt.player.yaw = Math.atan2(k.x - rt.player.x, k.z - rt.player.z);
  frameTwo(rt.player, k, 0.85);
}
