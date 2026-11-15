import { rt } from "../game/runtime";
import { PIER2 } from "../game/world/lowland";
import { vy } from "../game/voyageRt";

/** Fair water at the quay; the same continuous crossing darkens offshore. */
export function voyageStorm() {
  // The pirate voyage drives its own weather (docs/PIRATE_VOYAGE.md §4), on deck too.
  if (vy.sea && rt.world === "home") return vy.storm;
  if (!rt.voyage.active) return 0;
  if (rt.world === "cloud") return 1;
  const t = Math.max(0, Math.min(1, (PIER2.z0 - 10 - rt.voyage.z) / 50));
  return t * t * (3 - 2 * t);
}

/**
 * The voyage camera's roll (radians): a gentle sway while sailing, and a slow
 * roll of up to 6° in the storm (docs/PIRATE_VOYAGE.md §4). Zero ashore.
 */
export function voyageRoll(t: number) {
  if (!vy.sea || rt.world !== "home") return 0;
  const sway = Math.sin(t * 0.55) * 0.012 * Math.min(1, vy.flow + 0.3);
  const storm = Math.sin(t * 0.7) * 0.105 * vy.storm;
  return sway * (1 - vy.storm) + storm;
}
