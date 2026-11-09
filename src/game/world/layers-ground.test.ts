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
 * historical pocket variants include this new Grove layout. */
const BEFORE_LAYERS: Record<string, string> = {
  // Ground without mouth pockets, including the restored entrance stream.
  closed: "75bf94a22ab0fcba6b1211a12b3b30200a56f1500a2a0b17916a5348477dc659",
  grove: "ca0adb216ec0b7e58a419a7c4b97932ea7e0f911087489a397b57b4b25129df4",
  open: "bf06fd3b0c21c154eb6c140b91656ba8a12c714647c80ecd1c2638ee9cdfd8fc",
};
/** Mouth A ground, including the restored entrance stream. */
const GOLDEN: Record<string, string> = {
  closed: "b8487bfa5e64f9241d30506ec9ef255fddd5ec29ec851304cb4d47aa92b04ee8",
  grove: "aaf1168b43926dc33012ac80c8a63b90bb20f1ee43d65c3f3042d8e844e310fb",
  open: "2f574a0f1ee6a749d399e3430b3ad1c90629814f6b3705825e09d7d34a470d2a",
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
