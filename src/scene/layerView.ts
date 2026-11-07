import type { Layer } from "../game/world/region";

/** Which traversal layers draw this frame. Inside the cave nothing outside it is
 * drawn (the mesa's rock would otherwise surround the lens and the sun would
 * light the tunnels); from the ground and the treetops both of those draw, and
 * the cave's interior does not. Content slices drive their groups from this. */
export interface LayerViewState { ground: boolean; cave: boolean; high: boolean }

/** Smoothed 0 (outside) → 1 (inside the cave), plus the lit cave's warmth at the
 * player (0..1). Sky, sun and fog read it; the cave component drives it. */
export const caveAtmosphere = { k: 0, warm: 0 };

export function layerView(player: Layer): LayerViewState {
  return { ground: player !== "cave", cave: player === "cave", high: player !== "cave" };
}
