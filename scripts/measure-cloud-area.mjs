/** Same sampler as the expansion unit test; no HTTP listener. */
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, logLevel: "error" });
try {
  const { measureCloudArea } = await server.ssrLoadModule("/src/game/world/cloudMeasure.ts");
  const report = measureCloudArea();
  mkdirSync(".tmp", { recursive: true });
  writeFileSync(".tmp/cloud-area-report.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} finally { await server.close(); }
