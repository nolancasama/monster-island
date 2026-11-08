import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { BASIN, CAVE_MOUTHS, ZONES, lowlandWalkable, STAGES, zoneAt } from "./lowland";
import { isWalkable, obstaclesFor, solidsFor, standY, type Gates } from "./collision";

/** SHA-256 fixtures of every ground query. IEEE-754 bytes preserve exact
 * heights; the shape JSON preserves the complete ordered solid definitions.
 * No rounded heights or tolerance comparisons. Re-recorded 2026-11-08 for
 * the intentional Grove entrance → door stream move: its channel/tributaries
 * change ground heights and walking cuts; relocated tree/log/crate solids
 * change the ordered collision definitions. The shallow tributary that lay
 * along the new north bank was removed (it drew a pale strip over the deep
 * water). Door planes and cave pockets stay
 * unchanged. Both historical pocket variants include this new Grove layout. */
const BEFORE_LAYERS: Record<string, string> = {
  // Ground without mouth pockets, including the relocated door stream.
  closed: "ea1d06321e0b9a856bc03167c4fcf9511c8e331fe42d90f5a96be849aa39a577",
  grove: "f848d5bd2ab20f6a0584b3fd8521c03e24754dde07cbb85856280819a706e113",
  open: "289826e8612f6a6e59feb13ea5789cc73736b4649c71b7f4e0fa7f8547f9549f",
};
/** Mouth A ground, including the relocated door stream. */
const GOLDEN: Record<string, string> = {
  closed: "72c306d0902fd30e30364d065c11dbe42c8af7e8f103bcdb01c518a2e99af470",
  grove: "5c4754067309483fc0a1d89b9771e604334963d4fc5ace0c2ecc73ffd6149116",
  open: "5d5681292000813a83c170d552df115879b09b7f751426679fa43b66c03bd70b",
};
const STATES: Record<string, Gates> = {
  // Keep the dark-mouth gate open here to isolate the intended ground layout
  // change; cave.test.ts exercises the closed and permanently opened mouths.
  closed: { solved: ["caveTorches"], act2: true },
  grove: { solved: ["caveTorches", "groveStream", "groveLilies"], act2: true, cleared: ["forest1", "grove"] },
  open: { solved: ["caveTorches", "fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame", "groveStream", "groveLilies", "canopyVines", "canopyRope"], forest: true, volcano: true, act2: true, cleared: [...STAGES], secrets: ["emberThicket", "leafyStatues"] },
};

function digest(gates: Gates): string {
  const hash = createHash("sha256"), number = Buffer.allocUnsafe(8);
  // solidsFor has no position argument: its full result applies to every cell.
  hash.update(JSON.stringify(solidsFor(gates)));
  for (let z = BASIN.z0; z <= BASIN.z1; z += 0.5) {
    hash.update(JSON.stringify(obstaclesFor(gates, z, "ground")));
    for (let x = BASIN.x0; x <= BASIN.x1; x += 0.5) {
      hash.update(`${zoneAt(x, z) ?? "-"}:`);
      for (const r of [0, 0.35, 0.55]) {
        hash.update(lowlandWalkable(x, z, gates, r) ? "1" : "0");
        hash.update(isWalkable(x, z, gates, r, false, "ground") ? "1" : "0");
      }
      number.writeDoubleLE(standY(x, z, gates.solved, "ground"));
      hash.update(number);
    }
  }
  return hash.digest("hex");
}

/** Remove only authored pockets, restoring exact shape order even on failure. */
function withoutPockets(mouths: typeof CAVE_MOUTHS, check: () => void) {
  const walk = ZONES.grove.walk;
  const pockets = mouths.map(mouth => {
    const i = walk.findIndex(sh => sh.kind === "rect" && sh.x0 === mouth.groundX0 && sh.x1 === mouth.groundX1 && sh.z0 === mouth.z0 && sh.z1 === mouth.z1);
    expect(i).toBeGreaterThanOrEqual(0);
    return { i, shape: walk[i] };
  });
  for (const { i } of [...pockets].sort((a, b) => b.i - a.i)) walk.splice(i, 1);
  try { check(); } finally {
    for (const { i, shape } of pockets.sort((a, b) => a.i - b.i)) walk.splice(i, 0, shape);
  }
}

it("matches the door-stream ground golden with the mouth-B pocket removed", () => {
  withoutPockets(CAVE_MOUTHS.slice(1), () => {
    expect(Object.fromEntries(Object.entries(STATES).map(([name, gates]) => [name, digest(gates)]))).toEqual(GOLDEN);
  });
}, 120_000);

it("matches the door-stream ground golden without either cave-mouth pocket", () => {
  withoutPockets(CAVE_MOUTHS, () => {
    expect(Object.fromEntries(Object.entries(STATES).map(([name, gates]) => [name, digest(gates)]))).toEqual(BEFORE_LAYERS);
  });
}, 120_000);
