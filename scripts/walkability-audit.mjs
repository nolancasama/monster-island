/** Walkability review: the walkable mask over height-shaded ground, on foot and mounted, plus m² per zone.
 * Run with node scripts/walkability-audit.mjs [outfile]. Green = walks on foot and mounted, yellow = on foot only. */
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";

const out = process.argv[2] ?? ".tmp/walkability.svg";
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
try {
  const world = await server.ssrLoadModule("/src/game/world/lowland.ts");
  const { blocked, PLAYER_R } = await server.ssrLoadModule("/src/game/world/collision.ts");
  const { STAGES, lowlandY, zoneAt, ZONE_ORDER, ENEMY_SPAWNS, CHESTS } = world;
  const gates = { solved: ["groveLilies", "canopyVines", "canopyRope"], act2: true, cleared: STAGES };
  const MOUNTED_R = .55, step = .5, parts = [], area = Object.fromEntries(ZONE_ORDER.map(id => [id, 0]));
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="928" height="1552" viewBox="19 -344 116 194" shape-rendering="crispEdges"><rect x="19" y="-344" width="116" height="194" fill="#20383a"/>`);
  for (let z = -344; z < -150; z += step) for (let x = 19; x < 135; x += step) {
    const cx = x + step / 2, cz = z + step / 2, y = lowlandY(cx, cz);
    const shade = Math.round(Math.max(25, Math.min(205, 70 + (y - 2) * 16)));
    const foot = !blocked(cx, cz, PLAYER_R, gates);
    const mounted = foot && !blocked(cx, cz, MOUNTED_R, gates);
    const fill = mounted ? `rgb(90,${shade + 30},90)` : foot ? `rgb(${shade + 60},${shade + 45},40)` : `rgb(${shade},${shade},${shade})`;
    parts.push(`<rect x="${x}" y="${z}" width="${step}" height="${step}" fill="${fill}"/>`);
    if (foot) { const id = zoneAt(cx, cz); if (id) area[id] += step * step; }
  }
  for (const e of ENEMY_SPAWNS) parts.push(`<circle cx="${e.x}" cy="${e.z}" r=".45" fill="#ef6252"/>`);
  for (const c of CHESTS) parts.push(`<circle cx="${c.x}" cy="${c.z}" r=".4" fill="${c.secret ? "#b06bff" : "#ffda68"}"/>`);
  parts.push("</svg>");
  mkdirSync(out.replace(/\/[^/]*$/, ""), { recursive: true });
  writeFileSync(out, parts.join(""));
  console.table(area);
  console.log("Wrote", out);
} finally {
  await server.close();
}
