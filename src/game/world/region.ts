/** Active physical world. Kept independent of the store so terrain and saved
 * position validation never introduce a store/geometry initialization cycle. */
export const region = { world: "home" as "home" | "cloud" };
