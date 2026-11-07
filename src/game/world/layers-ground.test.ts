import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { BASIN, lowlandWalkable, STAGES, zoneAt } from "./lowland";
import { isWalkable, obstaclesFor, solidsFor, standY, type Gates } from "./collision";

/** SHA-256 fixtures recorded against the unchanged slice C queries before slice L.
 * IEEE-754 bytes preserve exact heights; the shape JSON preserves the complete
 * ordered solid definitions. No rounded heights or tolerance comparisons. */
const GOLDEN: Record<string, string> = {
  // Recorded at 405a5be (slice C), before any layer code existed.
  closed: "7c7a0b873e746f302a367b013149120afe610ce95207892e2084238f8dbe0624",
  grove: "8dcb2b9f8ee01ead6dfd92f80f2216daec62f93079007d4bc944a637958a2120",
  open: "248788df64985bf4c854a53e48cdf544e0796d4a30360ba56d788f2521746893",
};
const STATES: Record<string, Gates> = {
  closed: { solved: [], act2: true },
  grove: { solved: ["groveStream", "groveLilies"], act2: true, cleared: ["forest1", "grove"] },
  open: { solved: ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame", "groveStream", "groveLilies", "canopyVines", "canopyRope"], forest: true, volcano: true, act2: true, cleared: [...STAGES], secrets: ["emberThicket", "leafyStatues"] },
};

it("preserves every ground query on the complete 0.5 m BASIN grid", () => {
  for (const [name, gates] of Object.entries(STATES)) {
    const hash = createHash("sha256"), number = Buffer.allocUnsafe(8);
    // solidsFor has no position argument: its full result applies to every cell.
    hash.update(JSON.stringify(solidsFor(gates)));
    for (let z = BASIN.z0; z <= BASIN.z1; z += 0.5) {
      hash.update(JSON.stringify(obstaclesFor(gates, z)));
      for (let x = BASIN.x0; x <= BASIN.x1; x += 0.5) {
        hash.update(`${zoneAt(x, z) ?? "-"}:`);
        for (const r of [0, 0.35, 0.55]) {
          hash.update(lowlandWalkable(x, z, gates, r) ? "1" : "0");
          hash.update(isWalkable(x, z, gates, r) ? "1" : "0");
        }
        number.writeDoubleLE(standY(x, z, gates.solved));
        hash.update(number);
      }
    }
    const digest = hash.digest("hex");
    if (!GOLDEN[name]) console.log(`GROUND_GOLDEN ${name} ${digest}`);
    else expect(digest, name).toBe(GOLDEN[name]);
    expect(digest).toHaveLength(64);
  }
}, 120_000);
