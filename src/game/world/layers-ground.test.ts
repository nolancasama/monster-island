import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { BASIN, CAVE_MOUTHS, ZONES, lowlandWalkable, STAGES, zoneAt } from "./lowland";
import { isWalkable, obstaclesFor, solidsFor, standY, type Gates } from "./collision";

/** SHA-256 fixtures of every ground query. IEEE-754 bytes preserve exact
 * heights; the shape JSON preserves the complete ordered solid definitions.
 * No rounded heights or tolerance comparisons. */
const BEFORE_LAYERS: Record<string, string> = {
  // Recorded at 405a5be (slice C), before any layer code existed.
  closed: "7c7a0b873e746f302a367b013149120afe610ce95207892e2084238f8dbe0624",
  grove: "8dcb2b9f8ee01ead6dfd92f80f2216daec62f93079007d4bc944a637958a2120",
  open: "248788df64985bf4c854a53e48cdf544e0796d4a30360ba56d788f2521746893",
};
/** Slice D's ground, with mouth A's original approach pocket. */
const GOLDEN: Record<string, string> = {
  closed: "a624baab5400a01ac460db59c894ad9cce95759b86dfcf6e70b3ab74e7c7cb02",
  grove: "415049ab9864c0e961ec33ab0794eedee0bd8b54c71a6dcaf7aa4962ab904e33",
  open: "d9910051b53900b8be3006392a4a71836a2b35fa48b88ee048bfd28ee16a904e",
};
const STATES: Record<string, Gates> = {
  closed: { solved: [], act2: true },
  grove: { solved: ["groveStream", "groveLilies"], act2: true, cleared: ["forest1", "grove"] },
  open: { solved: ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame", "groveStream", "groveLilies", "canopyVines", "canopyRope"], forest: true, volcano: true, act2: true, cleared: [...STAGES], secrets: ["emberThicket", "leafyStatues"] },
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

it("preserves every original mouth-A ground query when the new mouth-B pocket is removed", () => {
  withoutPockets(CAVE_MOUTHS.slice(1), () => {
    for (const [name, gates] of Object.entries(STATES)) expect(digest(gates), name).toBe(GOLDEN[name]);
  });
}, 120_000);

it("differs from the ground before layers only by the two cave-mouth pockets", () => {
  withoutPockets(CAVE_MOUTHS, () => {
    for (const [name, gates] of Object.entries(STATES)) expect(digest(gates), name).toBe(BEFORE_LAYERS[name]);
  });
}, 120_000);
