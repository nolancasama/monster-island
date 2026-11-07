/** Traversal layer: one walking surface per (x, z) within a layer. */
export type Layer = "ground" | "cave" | "high";
export const LAYERS: readonly Layer[] = ["ground", "cave", "high"];

/** Active physical world and the player's traversal layer. Kept independent of
 * the store so terrain and saved position validation never introduce a
 * store/geometry initialization cycle. Collision and height queries default to
 * `layer`: every active walker (player, friends, enemies in the player's zone)
 * shares it. Scenery that belongs to a fixed layer passes it explicitly. */
export const region = { world: "home" as "home" | "cloud", layer: "ground" as Layer };
