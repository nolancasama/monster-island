/** Reproducible Cloud Isle measurements: plan-view walkable floor (m²) per
 * area and the shortest walked route dock → beacon through each branch.
 * 0.5 m grid, player radius .35 m, every gate open. The baseline below was
 * measured with this sampler at f108ed9 (before the expansion). */
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";
const BASELINE = { total: 3133.5, routeCanopy: 195.8, routeGrotto: 200.8 };
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, logLevel: "error" });
try {
  const m = await server.ssrLoadModule("/src/game/world/cloudisle.ts");
  const g = { cleared: [...m.CLOUD_STAGES, "windfallJunction"], solved: [...m.CLOUD_PUZZLES], tunnelOpen: true, observatoryLamps: ["leafy", "bubbo", "puff", "ember"] };
  const S = .5, R = .35;
  // Sample bounds come from the zone shapes themselves, so a moved or grown island is covered.
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const zone of Object.values(m.CLOUD_ZONES)) for (const s of zone.walk) {
    const b = s.kind === "rect" ? [s.x0, s.x1, s.z0, s.z1] : s.kind === "disc" ? [s.x - s.r, s.x + s.r, s.z - s.r, s.z + s.r]
      : [Math.min(...s.pts.map(p => p[0])) - s.w, Math.max(...s.pts.map(p => p[0])) + s.w, Math.min(...s.pts.map(p => p[1])) - s.w, Math.max(...s.pts.map(p => p[1])) + s.w];
    x0 = Math.min(x0, b[0]); x1 = Math.max(x1, b[1]); z0 = Math.min(z0, b[2]); z1 = Math.max(z1, b[3]);
  }
  x0 = Math.floor(x0) - 1; z0 = Math.floor(z0) - 1;
  const nx = Math.ceil((x1 + 1 - x0) / S), nz = Math.ceil((z1 + 1 - z0) / S);
  const walk = new Uint8Array(nx * nz), per = {};
  let total = 0;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * S, z = z0 + j * S;
    if (!m.cloudWalkable(x, z, g, R)) continue;
    walk[j * nx + i] = 1; total += S * S;
    const a = m.cloudZoneAt(x, z) ?? "?"; per[a] = (per[a] ?? 0) + S * S;
  }
  const cell = (p) => {
    const i = Math.round((p.x - x0) / S), j = Math.round((p.z - z0) / S);
    if (walk[j * nx + i]) return j * nx + i;
    let best = -1, d = Infinity; // nearest walkable sample if the anchor is on a cut edge
    for (let k = 0; k < walk.length; k++) if (walk[k]) { const e = Math.hypot(k % nx - i, Math.floor(k / nx) - j); if (e < d) { d = e; best = k; } }
    return best;
  };
  // Dijkstra over the 8-connected walkable grid (diagonals only when both sides are walkable).
  const dist = (from) => {
    const out = new Float64Array(walk.length).fill(Infinity), heap = [[0, from]];
    out[from] = 0;
    while (heap.length) {
      let bi = 0; for (let k = 1; k < heap.length; k++) if (heap[k][0] < heap[bi][0]) bi = k;
      const [d, c] = heap[bi]; heap[bi] = heap[heap.length - 1]; heap.pop();
      if (d > out[c]) continue;
      const ci = c % nx, cj = Math.floor(c / nx);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= nx || j >= nz || !walk[j * nx + i]) continue;
        if (di && dj && (!walk[cj * nx + i] || !walk[j * nx + ci])) continue;
        const n = j * nx + i, nd = d + S * Math.hypot(di, dj);
        if (nd < out[n]) { out[n] = nd; heap.push([nd, n]); }
      }
    }
    return out;
  };
  const dock = dist(cell(m.CLOUD_SPAWNS.cloudDock)), beacon = cell({ x: m.BEACON.x, z: m.BEACON.z });
  const via = (area) => { const c = cell(m.CLOUD_SPAWNS[area]); return dock[c] + dist(c)[beacon]; };
  const report = { total, per, routeCanopy: +via("skyrootCanopy").toFixed(1), routeGrotto: +via("thunderGrotto").toFixed(1), baseline: BASELINE };
  report.areaRatio = +(total / BASELINE.total).toFixed(3);
  mkdirSync(".tmp", { recursive: true });
  writeFileSync(".tmp/cloud-area-report.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await server.close();
}
