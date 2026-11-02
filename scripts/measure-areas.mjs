/** Reproducible reachable-floor measurements (metres squared).
 * Same 0.5 m collision sampler and flood fill as measureAreas in
 * expansion-area.test.ts, player radius .35 m, all puzzles and exits open. */
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
try {
  const { isWalkable, moveCircle, PLAYER_R } = await server.ssrLoadModule("/src/game/world/collision.ts");
  const { CLIFF_ROPE, STAGES, zoneAt } = await server.ssrLoadModule("/src/game/world/lowland.ts");
  const { SECRET_IDS } = await server.ssrLoadModule("/src/game/world/elementObjects.ts");
  const before = { forest1: 286, grove: 757, canopy: 407.75, causeway: 600.75, coast: 250 };
  const after = {};
  const gates = { solved: ["groveLilies", "canopyVines", "canopyRope"], secrets: SECRET_IDS, act2: true, cleared: STAGES };
  const start = [Math.round(CLIFF_ROPE.foot.x * 2), Math.round(CLIFF_ROPE.foot.z * 2)];
  const reachable = new Set([start.join(",")]), queue = [start];
  while (queue.length) {
    const [i, j] = queue.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj, key = `${ni},${nj}`, x = ni / 2, z = nj / 2;
      if (reachable.has(key) || x < 20 || x >= 134 || z < -338 || z >= -153.6 || !isWalkable(x, z, gates, PLAYER_R)) continue;
      const p = moveCircle(i / 2, j / 2, x, z, PLAYER_R, gates);
      if (Math.hypot(p.x - x, p.z - z) > .05) continue;
      reachable.add(key); queue.push([ni, nj]);
    }
  }
  for (let x = 20; x < 134; x += 0.5)
    for (let z = -338; z < -153.6; z += 0.5) {
      const zone = zoneAt(x, z);
      if (zone && reachable.has(`${x * 2},${z * 2}`) && isWalkable(x, z, gates, PLAYER_R)) after[zone] = (after[zone] ?? 0) + 0.25;
    }
  const report = STAGES.map((zone) => ({ zone, before: before[zone], after: after[zone], ratio: +(after[zone] / before[zone]).toFixed(3) }));
  mkdirSync(".tmp", { recursive: true });
  writeFileSync(".tmp/area-report.json", JSON.stringify(report, null, 2));
  console.table(report);
} finally {
  await server.close();
}
