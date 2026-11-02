import { afterEach, expect, it } from "vitest";
import { monsterRootY } from "../game/ride";
import { resetRuntime, rt } from "../game/runtime";
import { POND, POND_Y } from "../game/world/lowland";
import { CROSSING, RIVER_Y } from "../game/world/island";
import { standY } from "../game/world/collision";

afterEach(resetRuntime);
it("uses pond water for a submerged Grove body and preserves the beach river formula", () => {
  const m = rt.monsters.bubbo;
  m.swimming = true;
  for (const [x, z, level] of [[POND.x + 2, POND.z, POND_Y], [(CROSSING.west.x + CROSSING.east.x) / 2, CROSSING.z, RIVER_Y]]) {
    m.x = x; m.z = z; m.air = 0;
    for (const t of [0, .3, 1]) {
      expect(monsterRootY(m, [], t)).toBeCloseTo(Math.max(standY(x, z, []), level - .32 + Math.sin(t * 3) * .04));
    }
  }
  m.x = POND.x + 2; m.z = POND.z;
  expect(monsterRootY(m, [], 0)).toBeLessThan(POND_Y);
});
