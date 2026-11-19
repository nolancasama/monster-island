import { BASIN } from "../game/world/lowland";

const HAZE_START = 8;
const OPEN_SEA = 95;
const MAX_LENS_OFFSET = 6;

/** Fraction of home scenery obscured. The outbound leg leaves the basin to the south. */
export function openSeaFactor(
  world: "home" | "cloud",
  voyage: { sea: boolean; active: boolean; boatMoored: boolean },
  boat: { active: boolean; z: number },
  cameraZ: number,
): number {
  if (world !== "home" || !voyage.sea) return 0;
  // The ship is active from the sighting onward. After boarding, the sea
  // persists without a ridden boat, including after the ship breaks up.
  if (voyage.active || voyage.boatMoored || !boat.active) return 1;

  // Let the lens affect the haze without letting a scripted camera swing
  // skip the departure or bring back the coast from open water.
  const lensOffset = Math.max(-MAX_LENS_OFFSET, Math.min(MAX_LENS_OFFSET, boat.z - cameraZ));
  const offCoast = BASIN.z0 - boat.z + lensOffset;
  const t = Math.max(0, Math.min(1, (offCoast - HAZE_START) / (OPEN_SEA - HAZE_START)));
  return t * t * (3 - 2 * t);
}

export const homeSceneryVisible = (factor: number) => factor < 1;
