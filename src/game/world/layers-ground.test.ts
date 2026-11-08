import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { BASIN, CAVE_MOUTHS, ZONES, lowlandWalkable, STAGES, zoneAt } from "./lowland";
import { isWalkable, obstaclesFor, solidsFor, standY, type Gates } from "./collision";

/** SHA-256 fixtures of every ground query. IEEE-754 bytes preserve exact
 * heights; the shape JSON preserves the complete ordered solid definitions.
 * No rounded heights or tolerance comparisons. */
const BEFORE_LAYERS: Record<string, string> = {
  // Slice C ground without mouth pockets, re-recorded for the Act 2 door plane.
  closed: "e01a3ba9c38817dbab9f9bbb1936b657d8ac372ddba6760b9e1ecf50a5f22c98",
  grove: "0485065db0ed9aeb5550eebc9766570df09318cf0d01aa6705d07856f263515d",
  open: "9ec1480220e34795943ec431f115855ececb68b7366bf82d68bab8acf32aa1e6",
};
/** Mouth A ground, re-recorded for the Act 2 door plane. */
const GOLDEN: Record<string, string> = {
  closed: "df4f4f04bd085af3f5b845a435f2b794d503868963d906d73bf9d7df329f7b93",
  grove: "f7211a08d2bf30236afed8f414bebfd29d246192abcb2a79d2abaecb34715ad3",
  open: "90daa998fcdc5310583f2c1a99fe66af8a1fdf7da77ed10c13a8ceee8b7d474a",
};
const STATES: Record<string, Gates> = {
  // Keep the dark-mouth gate open here to isolate the intended zone-boundary
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

it("matches the door-plane ground golden with the mouth-B pocket removed", () => {
  withoutPockets(CAVE_MOUTHS.slice(1), () => {
    expect(Object.fromEntries(Object.entries(STATES).map(([name, gates]) => [name, digest(gates)]))).toEqual(GOLDEN);
  });
}, 120_000);

it("matches the door-plane ground golden without either cave-mouth pocket", () => {
  withoutPockets(CAVE_MOUTHS, () => {
    expect(Object.fromEntries(Object.entries(STATES).map(([name, gates]) => [name, digest(gates)]))).toEqual(BEFORE_LAYERS);
  });
}, 120_000);
