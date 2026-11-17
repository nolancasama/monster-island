import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { BASIN, CAVE_MOUTHS, ZONES, lowlandWalkable, STAGES, zoneAt } from "./lowland";
import { isWalkable, obstaclesFor, solidsFor, standY, type Gates } from "./collision";

/** SHA-256 fixtures of every ground query. IEEE-754 bytes preserve exact
 * heights; the shape JSON preserves the complete ordered solid definitions.
 * No rounded heights or tolerance comparisons. Re-recorded 2026-11-09 only
 * for the intended entrance ferry restoration: the deep channel/steeper bed,
 * restored tree/log/crate solids, dry central door approach and Forest-side
 * zone assignment. Door planes and cave pockets stay unchanged. Both
 * historical pocket variants include this new Grove layout.
 * Re-recorded 2026-11-17 only for the intended 2026-11-16 ground changes,
 * checked cell by cell against main: solid shop counters, the Seaside chest,
 * Pippa, the hero statue (its lamps gone), the four cover piles, the canopy
 * rope-approach grass, the lower pier deck and the raised rope bank.
 * Record on x64 (CI): arm64 V8 differs in the last bits of some heights. */
const BEFORE_LAYERS: Record<string, string> = {
  // Ground without mouth pockets, including the restored entrance stream.
  closed: "d04233f5dbe920cc95bc9bfe470baf6e8c51b94e0cdcee000d01ec5fc7c1286c",
  grove: "f69e6767fa17d3c4457a6b4eaf32a4309a0344f6096f592baaabc1ecd1c84364",
  open: "09832d7269d40bafa294d0ffe1567ac6e97a8a37594991557e1d8799719e3d42",
};
/** Mouth A ground, including the restored entrance stream. */
const GOLDEN: Record<string, string> = {
  closed: "1095647470548abc9221e71ed89f70743a58fd4fa4fed6c87e14d823a4cef63c",
  grove: "ecd33f5ffaba08dea21c8797b60c5c5f5d73426dfffc5ada1181ac5435502b6b",
  open: "919035eafd09823761adfa65d427085bf5b0d4b199ee187c63f656ca5d825f80",
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

it("matches the entrance-stream ground golden with the mouth-B pocket removed", () => {
  withoutPockets(CAVE_MOUTHS.slice(1), () => {
    expect(Object.fromEntries(Object.entries(STATES).map(([name, gates]) => [name, digest(gates)]))).toEqual(GOLDEN);
  });
}, 120_000);

it("matches the entrance-stream ground golden without either cave-mouth pocket", () => {
  withoutPockets(CAVE_MOUTHS, () => {
    expect(Object.fromEntries(Object.entries(STATES).map(([name, gates]) => [name, digest(gates)]))).toEqual(BEFORE_LAYERS);
  });
}, 120_000);
