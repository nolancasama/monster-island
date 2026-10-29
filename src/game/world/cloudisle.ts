import type { Text, Vec2 } from "../types";
import type { SolidShape } from "./island";
import { nearestOnTrail, type WalkShape } from "./lowland";

/** Cloud Isle is a separate world. North/up-mountain is +z. New slices append
 * zones and routes here; closed route mouths never imply playable ground. */
export type CloudArea = "cloudDock" | "stormbreakCoast" | "hiddenHollow" | "backTunnel" | "windfallJunction";
export type CloudAreaId = CloudArea;
export const CLOUD_AREAS: CloudAreaId[] = ["cloudDock", "stormbreakCoast", "hiddenHollow", "backTunnel", "windfallJunction"];
export const CLOUD_STAGES = ["stormbreakCoast"] as const;
export type CloudStageId = typeof CLOUD_STAGES[number];
export const CLOUD_PUZZLES = ["coastWindmill", "coastCrate"] as const;
export type CloudPuzzleId = typeof CLOUD_PUZZLES[number];
export type CloudEnemyKind = "stormCrab" | "windSprite" | "raiderDrone" | "thunderBeetle";
export interface CloudGates { cleared?: readonly string[]; solved?: readonly string[]; tunnelOpen?: boolean }
const rect = (x0: number, x1: number, z0: number, z1: number): WalkShape => ({ kind: "rect", x0, x1, z0, z1 });
const disc = (x: number, z: number, r: number): WalkShape => ({ kind: "disc", x, z, r });
const trail = (pts: Array<[number, number]>, w: number): WalkShape => ({ kind: "trail", pts, w });
export const CLOUD_DOCK = { spawn: { x: 0, z: 1 }, gull: { x: -2.2, z: 2.5 }, rest: { x: 1.8, z: 1.5 }, boat: { x: 0, z: -8 } };
export const HOLLOW = {
  entrance: { x: -10, z: 50 }, center: { x: -13, z: 57 },
  tala: { x: -12, z: 54.5 }, bo: { x: -17, z: 58 }, kiko: { x: -10, z: 59 },
  rest: { x: -17, z: 61 }, fire: { x: -16, z: 56 }, tunnel: { x: -15, z: 64 },
};
export const CLOUD_SPAWNS: Record<CloudArea, Vec2> = {
  cloudDock: CLOUD_DOCK.spawn, stormbreakCoast: { x: 0, z: 19 }, hiddenHollow: { x: -13, z: 55 },
  backTunnel: { x: -17, z: 72 }, windfallJunction: { x: 0, z: 89 },
};
export const COAST_TRAIL: Array<[number, number]> = [[0, 6], [0, 16], [3, 25], [-2, 35], [0, 44], [-5, 48], [-10, 50]];
export const COAST_SEA_BRIDGE = trail([[-12, 24], [-17, 30]], 1.05);
export const BACK_TUNNEL: Array<[number, number]> = [[-15, 62], [-17, 70], [-14, 76], [-7, 81], [0, 85]];
export const CLOUD_ZONES: Record<CloudArea, { id: CloudArea; name: Text; hostile: boolean; walk: WalkShape[] }> = {
  cloudDock: { id: "cloudDock", name: { en: "Cloud Isle Dock", ja: "雲の島の船着き場" }, hostile: false, walk: [rect(-5, 5, -3, 9), rect(-1.5, 1.5, -9, 0)] },
  stormbreakCoast: { id: "stormbreakCoast", name: { en: "Stormbreak Coast", ja: "嵐の海岸" }, hostile: true,
    walk: [trail(COAST_TRAIL, 4.6), disc(0, 20, 9), disc(2, 32, 10), rect(-9, 8, 36, 43), trail([[1, 40], [5, 48], [5, 60]], 2.4), trail([[-7, 24], [-13, 25], [-16, 29]], 2), disc(-17, 30, 3), trail([[9, 33], [14, 34], [17, 38]], 2), disc(17, 39, 3)] },
  hiddenHollow: { id: "hiddenHollow", name: { en: "Hidden Hollow", ja: "かくれ家の洞窟" }, hostile: false, walk: [trail([[-10, 48], [-12, 53]], 2.5), rect(-21, -5, 52, 64), disc(-13, 57, 7)] },
  backTunnel: { id: "backTunnel", name: { en: "Family's Back Tunnel", ja: "家族の裏トンネル" }, hostile: false, walk: [trail(BACK_TUNNEL, 2.2)] },
  windfallJunction: { id: "windfallJunction", name: { en: "Windfall Junction", ja: "風の分かれ道" }, hostile: true,
    walk: [disc(0, 90, 9), trail([[0, 93], [-9, 99]], 2.5), trail([[0, 93], [9, 99]], 2.5)] },
};
const ORDER: CloudArea[] = ["hiddenHollow", "backTunnel", "cloudDock", "windfallJunction", "stormbreakCoast"];
function inside(s: WalkShape, x: number, z: number, m: number): boolean {
  if (s.kind === "rect") return x >= s.x0 + m && x <= s.x1 - m && z >= s.z0 + m && z <= s.z1 - m;
  if (s.kind === "disc") return Math.hypot(x - s.x, z - s.z) <= s.r - m;
  return nearestOnTrail(s.pts, x, z).d <= s.w - m;
}
export function cloudZoneAt(x: number, z: number): CloudArea | null {
  return ORDER.find(id => CLOUD_ZONES[id].walk.some(s => inside(s, x, z, 0))) ?? null;
}
export const COAST_GATE = { x: 0, z: 44, half: 8, required: 6 };
export const RAIDER_BARRICADE = { x: 5, z: 57, half: 3.1 };
export const ROUTE_MOUTHS = [{ x: -10, z: 100, yaw: -.65 }, { x: 10, z: 100, yaw: .65 }];
export const OBSERVATORY = { x: 0, z: 137, y: 22 };
export const BEACON = { x: 0, z: 169, y: 37 };
const nearCut = (x: number, z: number, x0: number, x1: number, z0: number, z1: number, r: number) => x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r;
/** Includes all static collision. Radius-grown cuts close the whole gate,
 * including the edge approach on a mounted friend. */
export function cloudWalkable(x: number, z: number, g: CloudGates = {}, r = 0): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (!ORDER.some(id => CLOUD_ZONES[id].walk.some(s => inside(s, x, z, r)))) return false;
  if (!(g.cleared?.includes("stormbreakCoast") || g.cleared?.includes("coast")) && nearCut(x, z, -12, 12, 43.7, 44.5, r)) return false;
  if (!g.tunnelOpen && nearCut(x, z, -23, -7, 64, 65, r)) return false;
  if (nearCut(x, z, 1, 9, 56.5, 57.5, r)) return false;
  if (nearCut(x, z, -14.8, -12.5, 21, 32, r)
    && (!g.solved?.includes("coastWindmill") || !inside(COAST_SEA_BRIDGE, x, z, r))) return false;
  if (!g.solved?.includes("coastCrate") && nearCut(x, z, 13, 15, 30, 43, r)) return false;
  for (const s of CLOUD_SOLIDS) {
    if (s.kind === "circle" && Math.hypot(x - s.x, z - s.z) < s.r + r) return false;
    if (s.kind === "box") {
      const dx = x - s.x, dz = z - s.z, c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
      if (Math.abs(dx * c - dz * sn) < s.hx + r && Math.abs(dx * sn + dz * c) < s.hz + r) return false;
    }
  }
  return true;
}
const smooth = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t); };
export function cloudY(_x: number, z: number): number {
  if (z < 8) return .8;
  const coast = .8 + smooth((z - 8) / 36) * 3.2;
  if (z <= 64) return coast;
  return 4 + smooth((z - 64) / 22) * 7;
}
export const CLOUD_SOLIDS: readonly SolidShape[] = [
  { kind: "circle", x: -6, z: 18, r: .8 }, { kind: "circle", x: 8, z: 29, r: 1 },
  { kind: "circle", x: -5, z: 36, r: .8 }, { kind: "circle", x: HOLLOW.fire.x, z: HOLLOW.fire.z, r: .65 },
  { kind: "box", x: -19, z: 54, hx: 1.1, hz: .45, yaw: 0 },
  { kind: "box", x: -7, z: 61.5, hx: .7, hz: .5, yaw: 0 },
];
export const cloudSolids = () => CLOUD_SOLIDS;
export const CLOUD_OBSTACLE_PLACE = {
  coastWindmill: { x: -9, z: 25, face: { x: -11, z: 27 } },
  coastCrate: { x: 10, z: 34, face: { x: 12, z: 35 } },
};
export const CLOUD_ENEMY_SPAWNS: Array<Vec2 & { zone: CloudArea; kind: CloudEnemyKind }> = [
  { zone: "stormbreakCoast", kind: "stormCrab", x: -2, z: 16 },
  { zone: "stormbreakCoast", kind: "windSprite", x: 5, z: 21 },
  { zone: "stormbreakCoast", kind: "stormCrab", x: -3, z: 26 },
  { zone: "stormbreakCoast", kind: "windSprite", x: 4, z: 31 },
  { zone: "stormbreakCoast", kind: "stormCrab", x: -4, z: 38 },
  { zone: "stormbreakCoast", kind: "windSprite", x: 3, z: 40 },
];
export const CLOUD_CHESTS = [
  { id: "cloudSeaChest", x: -18, z: 30, yaw: .5, coins: 20, amber: 0, puzzle: "coastWindmill" as const },
  { id: "cloudCoveChest", x: 17, z: 40, yaw: -.5, coins: 20, amber: 1, puzzle: "coastCrate" as const },
  { id: "cloudJunctionChest", x: 5, z: 93, yaw: -.4, coins: 20, amber: 0 },
];
export const CLOUD_PICKUPS = [
  { id: "kikoBag", kind: "bag" as const, x: -17, z: 29 },
  { id: "junctionWood1", kind: "firewood" as const, x: -5, z: 88 },
  { id: "junctionWood2", kind: "firewood" as const, x: -7, z: 95 },
  { id: "junctionWood3", kind: "firewood" as const, x: 6, z: 96 },
  { id: "canopyMouthMoss", kind: "moss" as const, x: -9, z: 98 },
];
export const CLOUD_GUSTS = [{ x: -4, z: 20, w: 14, d: 3, dx: 1, dz: .2 }, { x: 2, z: 34, w: 15, d: 3, dx: -1, dz: .12 }];
export function cloudWindAt(x: number, z: number): Vec2 {
  const g = CLOUD_GUSTS.find(g => Math.abs(x - g.x) < g.w / 2 && Math.abs(z - g.z) < g.d / 2);
  return g ? { x: g.dx * 1.8, z: g.dz * 1.8 } : { x: 0, z: 0 };
}
/** Save projection never places the player beyond a closed story gate. */
export function projectCloudPosition(p: Vec2, g: CloudGates): Vec2 {
  return cloudNearestWalkable(p.x, p.z, .35, g);
}

export function cloudNearestWalkable(x: number, z: number, r: number, g: CloudGates): Vec2 {
  if (cloudWalkable(x, z, g, r)) return { x, z };
  if (!Number.isFinite(x) || !Number.isFinite(z)) return { ...CLOUD_DOCK.spawn };
  let best: Vec2 = { ...CLOUD_DOCK.spawn }, distance = Infinity;
  for (let pz = -8; pz <= 100; pz += .5) for (let px = -23; px <= 22; px += .5) {
    if (!cloudWalkable(px, pz, g, r)) continue;
    const d = Math.hypot(px - x, pz - z);
    if (d < distance) { best = { x: px, z: pz }; distance = d; }
  }
  return best;
}

/** Substeps prevent tunnelling through thin gates; axis sliding matches the
 * home world's movement without importing its collision dispatch. */
export function cloudMove(x0: number, z0: number, x1: number, z1: number, r: number, g: CloudGates, out: Vec2 = { x: x0, z: z0 }): Vec2 {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / .18));
  const dx = (x1 - x0) / n, dz = (z1 - z0) / n;
  let x = x0, z = z0;
  for (let i = 0; i < n; i++) {
    if (cloudWalkable(x + dx, z + dz, g, r)) { x += dx; z += dz; }
    else {
      if (cloudWalkable(x + dx, z, g, r)) x += dx;
      if (cloudWalkable(x, z + dz, g, r)) z += dz;
    }
  }
  out.x = x; out.z = z;
  return out;
}
