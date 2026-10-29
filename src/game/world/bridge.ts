/** A deck meets the height and slope of both banks, independent of travel direction.
 * The land overlap also covers the walker's radius at the carved gap's lips. */
export function bridgeSurfaceY(x: number, z: number, z0: number, z1: number, bank: (x: number, z: number) => number): number {
  const t = Math.max(0, Math.min(1, (z - z0) / (z1 - z0)));
  const a = bank(x, z0), b = bank(x, z1), length = z1 - z0;
  const slope = (at: number) => (bank(x, at + .025) - bank(x, at - .025)) / .05;
  const y = (2 * t ** 3 - 3 * t ** 2 + 1) * a + (t ** 3 - 2 * t ** 2 + t) * length * slope(z0)
    + (-2 * t ** 3 + 3 * t ** 2) * b + (t ** 3 - t ** 2) * length * slope(z1);
  return Math.max(bank(x, z), y);
}
