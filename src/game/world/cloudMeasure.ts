import * as current from "./cloudisle";
export const CLOUD_BASELINE = { total: 3133.5, routeCanopy: 195.8, routeGrotto: 200.8, dockJunction: 100.4 };
/** Shared 0.5m/.35m sampler, including no-corner-cutting route distances. */
export function measureCloudArea(m: typeof current = current) {
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
  const walk = new Uint8Array(nx * nz), per: Record<string, number> = {};
  let total = 0;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * S, z = z0 + j * S;
    if (!m.cloudWalkable(x, z, g, R)) continue;
    walk[j * nx + i] = 1; total += S * S;
    const a = m.cloudZoneAt(x, z) ?? "?"; per[a] = (per[a] ?? 0) + S * S;
  }
  const cell = (p: { x: number; z: number }) => {
    const i = Math.round((p.x - x0) / S), j = Math.round((p.z - z0) / S);
    if (walk[j * nx + i]) return j * nx + i;
    let best = -1, d = Infinity; // nearest walkable sample if the anchor is on a cut edge
    for (let k = 0; k < walk.length; k++) if (walk[k]) { const e = Math.hypot(k % nx - i, Math.floor(k / nx) - j); if (e < d) { d = e; best = k; } }
    return best;
  };
  // Dijkstra over the 8-connected walkable grid (diagonals only when both sides are walkable).
  const dist = (from: number, avoid?: string) => {
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
        if (avoid && m.cloudZoneAt(x0 + i * S, z0 + j * S) === avoid) continue;
        if (di && dj && (!walk[cj * nx + i] || !walk[j * nx + ci])) continue;
        const n = j * nx + i, nd = d + S * Math.hypot(di, dj);
        if (nd < out[n]) { out[n] = nd; heap.push([nd, n]); }
      }
    }
    return out;
  };
  const dock = dist(cell(m.CLOUD_SPAWNS.cloudDock)), beacon = cell({ x: m.BEACON.x, z: m.BEACON.z });
  const via = (area: "skyrootCanopy" | "thunderGrotto") => { const c = cell(m.CLOUD_SPAWNS[area]); return dock[c] + dist(c, area === "skyrootCanopy" ? "thunderGrotto" : "skyrootCanopy")[beacon]; };

  return { total, per, routeCanopy: +via("skyrootCanopy").toFixed(1), routeGrotto: +via("thunderGrotto").toFixed(1),
    dockJunction: +dock[cell(m.CLOUD_SPAWNS.windfallJunction)].toFixed(1),
    observatoryViaCanopy: Number.isFinite(dist(cell(m.CLOUD_SPAWNS.cloudDock), "thunderGrotto")[cell(m.OBSERVATORY.entrance)]),
    observatoryViaGrotto: Number.isFinite(dist(cell(m.CLOUD_SPAWNS.cloudDock), "skyrootCanopy")[cell(m.OBSERVATORY.entrance)]),
    barricadePassable: m.cloudWalkable(m.RAIDER_BARRICADE.x, m.RAIDER_BARRICADE.z, g, R),
    baseline: CLOUD_BASELINE, areaRatio: +(total / CLOUD_BASELINE.total).toFixed(3) };
}
