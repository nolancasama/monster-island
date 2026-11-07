import type { Layer } from "../game/world/region";

/** Which traversal layers draw this frame. Inside the cave nothing outside it is
 * drawn (the mesa's rock would otherwise surround the lens and the sun would
 * light the tunnels); from the ground and the treetops both of those draw, and
 * the cave's interior does not. Content slices drive their groups from this. */
export interface LayerViewState { ground: boolean; cave: boolean; high: boolean }

export function layerView(player: Layer): LayerViewState {
  return { ground: player !== "cave", cave: player === "cave", high: player !== "cave" };
}
