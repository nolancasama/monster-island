/** Global cartoon voice limits, in seconds. A blocked bark consumes no cooldown. */
export function yelpReady(now: number, last: number): boolean {
  return now - last >= .8;
}

export function barkReady(now: number, last: number, speaking: boolean, explore: boolean, openLine: boolean, listening: boolean, available: boolean): boolean {
  return now - last >= 4 && !speaking && explore && !openLine && !listening && available;
}
