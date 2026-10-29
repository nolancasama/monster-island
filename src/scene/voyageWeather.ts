import { rt } from "../game/runtime";
import { PIER2 } from "../game/world/lowland";

/** Fair water at the quay; the same continuous crossing darkens offshore. */
export function voyageStorm() {
  if (!rt.voyage.active) return 0;
  if (rt.world === "cloud") return 1;
  const t = Math.max(0, Math.min(1, (PIER2.z0 - 10 - rt.voyage.z) / 50));
  return t * t * (3 - 2 * t);
}
