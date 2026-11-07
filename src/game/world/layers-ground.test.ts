import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { BASIN, CAVE_MOUTH, ZONES, lowlandWalkable, STAGES, zoneAt, type WalkShape } from "./lowland";
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
/** The current ground: slice D's cave-mouth approach pocket is its only change. */
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

it("preserves every ground query on the complete 0.5 m BASIN grid", () => {
  for (const [name, gates] of Object.entries(STATES)) {
    const d = digest(gates);
    if (!GOLDEN[name]) console.log(`GROUND_GOLDEN ${name} ${d}`);
    else expect(d, name).toBe(GOLDEN[name]);
  }
}, 120_000);

it("differs from the ground before layers only by the cave mouth's pocket", () => {
  const walk = ZONES.grove.walk;
  const i = walk.findIndex((sh: WalkShape) => sh.kind === "rect" && sh.x1 === CAVE_MOUTH.groundX1 && sh.z0 === CAVE_MOUTH.z0);
  expect(i).toBeGreaterThanOrEqual(0);
  const [pocket] = walk.splice(i, 1);
  try {
    for (const [name, gates] of Object.entries(STATES)) expect(digest(gates), name).toBe(BEFORE_LAYERS[name]);
  } finally {
    walk.splice(i, 0, pocket);
  }
}, 120_000);
