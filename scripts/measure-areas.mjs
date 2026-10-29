/** Reproducible plan-view walkable-floor measurements (metres squared).
 * 0.5 m grid, player radius .35 m, all puzzle bridges and exits open.
 * Baseline: d820c8053815134b25e7b0552445440ea926e128, same sampler. */
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
try {
  const { isWalkable, PLAYER_R } = await server.ssrLoadModule("/src/game/world/collision.ts");
  const { STAGES, zoneAt } = await server.ssrLoadModule("/src/game/world/lowland.ts");
  const before = { forest1: 286, grove: 464.75, canopy: 236.75, causeway: 600.75, coast: 250 };
  const after = {};
  const gates = { solved: ["groveLilies", "canopyVines", "canopyRope", "causewayGate"], act2: true, cleared: STAGES };
  for (let x = 20; x < 134; x += 0.5)
    for (let z = -338; z < -153.6; z += 0.5) {
      const zone = zoneAt(x, z);
      if (zone && isWalkable(x, z, gates, PLAYER_R)) after[zone] = (after[zone] ?? 0) + 0.25;
    }
  const report = STAGES.map((zone) => ({ zone, before: before[zone], after: after[zone], ratio: +(after[zone] / before[zone]).toFixed(3) }));
  mkdirSync(".tmp", { recursive: true });
  writeFileSync(".tmp/area-report.json", JSON.stringify(report, null, 2));
  console.table(report);
} finally {
  await server.close();
}
