/** Controller review map. Run with node scripts/lowland-map.mjs. */
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";

const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
try {
  const world = await server.ssrLoadModule("/src/game/world/lowland.ts");
  const { HAZARDS } = await server.ssrLoadModule("/src/game/world/hazards.ts");
  const colors = { forest1: "#688650", camp: "#a0a370", grove: "#6c9b70", canopy: "#a79264", causeway: "#a9a18a", coast: "#c0b58c", port: "#c9bf9a" };
  const shape = (s, fill, opacity = 1) => {
    const style = `fill="${fill}" opacity="${opacity}"`;
    if (s.kind === "rect") return `<rect x="${s.x0}" y="${s.z0}" width="${s.x1 - s.x0}" height="${s.z1 - s.z0}" ${style}/>`;
    if (s.kind === "disc") return `<circle cx="${s.x}" cy="${s.z}" r="${s.r}" ${style}/>`;
    return `<polyline points="${s.pts.map(p => p.join(",")).join(" ")}" fill="none" stroke="${fill}" stroke-width="${s.w * 2}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"/>`;
  };
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="928" height="1552" viewBox="19 -344 116 194"><rect x="19" y="-344" width="116" height="194" fill="#223d3c"/>`];
  for (const zone of Object.values(world.ZONES)) for (const s of zone.walk) parts.push(shape(s, colors[zone.id]));
  for (const h of HAZARDS.filter(h => h.world === "home")) {
    parts.push(shape(h.shape, h.kind === "fall" ? "#312b47" : "#348fa2"));
    for (const safe of h.safe ?? []) parts.push(shape(safe, "#d9c899"));
  }
  parts.push(`<polygon points="${world.MESA_OUTLINE.map(p => p.join(",")).join(" ")}" fill="#8d7769" stroke="#e1c4a0" stroke-width=".3"/>`);
  for (const s of world.lowlandSolids()) {
    if (s.kind === "circle") parts.push(`<circle cx="${s.x}" cy="${s.z}" r="${s.r}" fill="#453b31"/>`);
    else if (s.kind === "capsule") parts.push(`<path d="M${s.ax},${s.az}L${s.bx},${s.bz}" stroke="#453b31" stroke-width="${s.r * 2}" stroke-linecap="round"/>`);
    else parts.push(`<rect x="${s.x - s.hx}" y="${s.z - s.hz}" width="${s.hx * 2}" height="${s.hz * 2}" fill="#453b31" transform="rotate(${-s.yaw * 180 / Math.PI} ${s.x} ${s.z})"/>`);
  }
  for (const e of world.ENEMY_SPAWNS) parts.push(`<circle cx="${e.x}" cy="${e.z}" r=".4" fill="#ef6252"/>`);
  for (const c of world.CHESTS) parts.push(`<circle cx="${c.x}" cy="${c.z}" r=".45" fill="#ffda68"/>`);
  for (const [text, x, z] of [["FLOODED GROVE", 28, -218], ["ANCIENT CANOPY", 88, -218], ["MESA", 72, -215], ["North ↑", 23, -337]])
    parts.push(`<text x="${x}" y="${z}" font-family="sans-serif" font-size="1.7" fill="white">${text}</text>`);
  parts.push(`<text x="23" y="-153" font-family="sans-serif" font-size="1.4" fill="white">Walk shapes • dark brown solids • purple voids • blue ponds • red enemies • gold treasure</text></svg>`);
  mkdirSync(".tmp/maps", { recursive: true });
  writeFileSync(".tmp/maps/lowland.svg", parts.join("\n"));
  console.log("Wrote .tmp/maps/lowland.svg");
} finally {
  await server.close();
}
