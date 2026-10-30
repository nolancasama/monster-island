import { DEBUG_DESTINATIONS, progressForDestination } from "./debugProgress";
import { gatesOf, isWalkable, PLAYER_R, type Gates } from "../world/collision";

type World = "home" | "cloud";
type DestinationGates = { destination: typeof DEBUG_DESTINATIONS[number]; gates: Gates };
const cache: Partial<Record<World, DestinationGates[]>> = {};

/** Inventory is the only previous progress retained by fixtures; it has no gates.
 * Build lazily so normal play never constructs debug story fixtures. */
export function debugDestinationGates(world: World): readonly DestinationGates[] {
  return cache[world] ??= DEBUG_DESTINATIONS
    .map((destination, order) => ({ destination, order }))
    .filter(({ destination }) => destination.world === world)
    .sort((a, b) => a.destination.step - b.destination.step || a.order - b.order)
    .map(({ destination }) => ({ destination, gates: gatesOf(progressForDestination(destination.id)) }));
}

type Bounds = { x0: number; x1: number; z0: number; z1: number };
const masks: Partial<Record<World, Uint8Array>> = {};

/** Ground any story fixture opens, sampled once per world for the travel map
 * (row-major, `width` x `height`, cloud rows run north to south). Sampled at half
 * resolution: fixtures that share gates are checked once, most open first, and
 * the result never changes, so it costs about a second once per world. */
export function debugReachableMask(world: World, b: Bounds, width: number, height: number): Uint8Array {
  const cached = masks[world];
  if (cached?.length === width * height) return cached;
  const seen = new Set<string>();
  const gates = debugDestinationGates(world).map(d => d.gates).reverse()
    .filter(g => { const key = JSON.stringify(g); if (seen.has(key)) return false; seen.add(key); return true; });
  const mask = new Uint8Array(width * height);
  for (let py = 0; py < height; py += 2) {
    const z = world === "cloud" ? b.z1 - (py + 1) / height * (b.z1 - b.z0) : b.z0 + (py + 1) / height * (b.z1 - b.z0);
    for (let px = 0; px < width; px += 2) {
      const x = b.x0 + (px + 1) / width * (b.x1 - b.x0);
      if (!gates.some(g => isWalkable(x, z, g))) continue;
      for (let dy = 0; dy < 2 && py + dy < height; dy++) for (let dx = 0; dx < 2 && px + dx < width; dx++) mask[(py + dy) * width + px + dx] = 1;
    }
  }
  return masks[world] = mask;
}

/** No story change for open ground or points no story fixture can open. */
export function destinationForDebugPoint(x: number, z: number, world: World, current: Gates, radius = PLAYER_R) {
  if (isWalkable(x, z, current, radius)) return undefined;
  return debugDestinationGates(world).find(({ gates }) => isWalkable(x, z, gates, radius))?.destination;
}
