import type { Text, Vec2 } from "../types";
import type { SolidShape } from "./island";
import type { CompanionId } from "../data/combat";
import type { AbilityId } from "../types";
import type { PhraseId } from "../logic/english";
import { nearestOnTrail, type WalkShape } from "./lowland";

/** Cloud Isle is a separate world. North/up-mountain is +z. New slices append
 * zones and routes here; closed route mouths never imply playable ground. */
export type CloudArea = "cloudDock" | "stormbreakCoast" | "hiddenHollow" | "backTunnel" | "windfallJunction" | "skyrootCanopy" | "thunderGrotto" | "observatoryApproach" | "ancientObservatory" | "stormBeacon";
export type CloudAreaId = CloudArea;
export const CLOUD_AREAS: CloudAreaId[] = ["cloudDock", "stormbreakCoast", "hiddenHollow", "backTunnel", "windfallJunction", "skyrootCanopy", "thunderGrotto", "observatoryApproach", "ancientObservatory", "stormBeacon"];
export const CLOUD_STAGES = ["stormbreakCoast", "skyrootCanopy", "thunderGrotto", "ancientObservatory"] as const;
export type CloudStageId = typeof CLOUD_STAGES[number];
export const CLOUD_PUZZLES = ["coastWindmill", "coastCrate", "canopyVine", "canopyGlide", "canopyGust", "grottoRaft", "grottoBoiler", "obsLeafy", "obsBubbo", "obsPuff", "obsEmber"] as const;
export const OBSERVATORY_PUZZLES = ["obsLeafy", "obsBubbo", "obsPuff", "obsEmber"] as const;
export type CloudPuzzleId = typeof CLOUD_PUZZLES[number];
export type CloudEnemyKind = "stormCrab" | "windSprite" | "raiderDrone" | "thunderBeetle";
export interface CloudGates { cleared?: readonly string[]; solved?: readonly string[]; tunnelOpen?: boolean; observatoryLamps?: readonly string[] }
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
  skyrootCanopy: { x: -20, z: 106 }, thunderGrotto: { x: 20, z: 106 }, observatoryApproach: { x: 0, z: 132 },
  ancientObservatory: { x: 0, z: 138 }, stormBeacon: { x: 0, z: 160 },
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
  skyrootCanopy: { id: "skyrootCanopy", name: { en: "Skyroot Canopy", ja: "空根の樹冠" }, hostile: true,
    walk: [trail([[-9, 99], [-20, 106]], 2.7), rect(-27, -13, 104, 126), trail([[-20, 124], [-10, 131], [0, 132]], 2.7), trail([[-26, 122], [-31, 123]], 2), disc(-32, 123, 3)] },
  thunderGrotto: { id: "thunderGrotto", name: { en: "Thunder Grotto", ja: "雷の洞窟" }, hostile: true,
    walk: [trail([[9, 99], [20, 106]], 2.7), rect(13, 27, 104, 126), trail([[20, 124], [10, 131], [0, 132]], 2.7), trail([[26, 122], [31, 123]], 2), disc(32, 123, 3)] },
  observatoryApproach: { id: "observatoryApproach", name: { en: "Ancient Observatory — Entrance", ja: "古代の天文台・入口" }, hostile: false, walk: [rect(-9, 9, 130, 134)] },
  ancientObservatory: { id: "ancientObservatory", name: { en: "Ancient Observatory", ja: "古代の天文台" }, hostile: true,
    walk: [rect(-2.6, 2.6, 132, 139), rect(-10, 10, 137, 154), rect(-2.6, 2.6, 152, 158)] },
  stormBeacon: { id: "stormBeacon", name: { en: "Storm Beacon", ja: "嵐の灯台" }, hostile: true,
    walk: [rect(-2.6, 2.6, 155, 161), disc(0, 169, 12)] },
};
const ORDER: CloudArea[] = ["hiddenHollow", "backTunnel", "cloudDock", "windfallJunction", "observatoryApproach", "stormBeacon", "ancientObservatory", "skyrootCanopy", "thunderGrotto", "stormbreakCoast"];
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
export const OBSERVATORY = { x: 0, z: 137, y: 22, entrance: { x: 0, z: 132 }, rest: { x: 3.8, z: 132 }, dial: { x: 0, z: 145.5 }, lift: { x: 0, z: 155 } };
export const BEACON = { x: 0, z: 169, y: 37 };
export const CLOUD_ROUTE_GATES = [
  { zone: "skyrootCanopy", x: -15, z: 127, half: 6, required: 6 },
  { zone: "thunderGrotto", x: 15, z: 127, half: 6, required: 6 },
] as const;
export const CLOUD_ROUTE_REQUIRED = { skyrootCanopy: ["canopyVine", "canopyGlide"], thunderGrotto: ["grottoRaft", "grottoBoiler"] } as const;
export const CLOUD_PUZZLE_BARRIERS = [
  { puzzle: "canopyVine", x0: -40, x1: -12, z0: 109.5, z1: 111.5 },
  { puzzle: "canopyGlide", x0: -40, x1: -12, z0: 118.5, z1: 120.5 },
  { puzzle: "grottoRaft", x0: 12, x1: 40, z0: 109.5, z1: 111.5 },
  { puzzle: "grottoBoiler", x0: 12, x1: 40, z0: 118.5, z1: 120.5 },
  { puzzle: "canopyGust", x0: -30.5, x1: -28, z0: 118, z1: 128 },
] as const;
export const CANOPY_GLIDE = { from: { x: -20, z: 117.4 }, to: { x: -20, z: 121.6 } };
export const CLOUD_ELECTRIC_PANELS = [
  { x: 17, z: 115, w: 3, d: 2, phase: 0 },
  { x: 23, z: 123, w: 3, d: 2, phase: 1.2 },
];
/** First 1.8 seconds are dark/safe, then .6 seconds of visible warning.
 * The entire 2.4 second safe window precedes a light 1.6 second pulse. */
export const electricPanelPhase = (time: number, phase = 0) => ((time + phase) % 4 + 4) % 4;
export const electricPanelActive = (time: number, phase = 0) => electricPanelPhase(time, phase) >= 2.4;
const nearCut = (x: number, z: number, x0: number, x1: number, z0: number, z1: number, r: number) => x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r;
/** Includes all static collision. Radius-grown cuts close the whole gate,
 * including the edge approach on a mounted friend. */
export function cloudWalkable(x: number, z: number, g: CloudGates = {}, r = 0): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (!ORDER.some(id => CLOUD_ZONES[id].walk.some(s => inside(s, x, z, r)))) return false;
  // The four persistent lamps raise the only route onto the summit platform.
  if (z > 154.5 - r && (!g.cleared?.includes("ancientObservatory")
    || !["leafy", "bubbo", "puff", "ember"].every(id => g.observatoryLamps?.includes(id)))) return false;
  if (!(g.cleared?.includes("stormbreakCoast") || g.cleared?.includes("coast")) && nearCut(x, z, -12, 12, 43.7, 44.5, r)) return false;
  if (!g.tunnelOpen && nearCut(x, z, -23, -7, 64, 65, r)) return false;
  if (nearCut(x, z, 1, 9, 56.5, 57.5, r)) return false;
  if (nearCut(x, z, -14.8, -12.5, 21, 32, r)
    && (!g.solved?.includes("coastWindmill") || !inside(COAST_SEA_BRIDGE, x, z, r))) return false;
  if (!g.solved?.includes("coastCrate") && nearCut(x, z, 13, 15, 30, 43, r)) return false;
  for (const b of CLOUD_PUZZLE_BARRIERS) if (!g.solved?.includes(b.puzzle) && nearCut(x, z, b.x0, b.x1, b.z0, b.z1, r)) return false;
  // Only the marked glide corridor crosses this gap after Puff helps. Normal
  // gameplay starts its scripted hop at the lip; there is no aerial steering.
  if (z > 118.5 - r && z < 120.5 + r && x < -12 && Math.abs(x - CANOPY_GLIDE.from.x) > 1.5 - r) return false;
  for (const gate of CLOUD_ROUTE_GATES) if (!g.cleared?.includes(gate.zone)
    && nearCut(x, z, gate.x < 0 ? -32 : 8, gate.x < 0 ? -8 : 32, 126.7, 127.3, r)) return false;
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
export function cloudY(x: number, z: number): number {
  if (z >= 160) return 37;
  if (z >= 154) return 22 + smooth((z - 154) / 6) * 15;
  if (z < 8) return .8;
  const coast = .8 + smooth((z - 8) / 36) * 3.2;
  if (z <= 64) return coast;
  if (z <= 99) return 4 + smooth((z - 64) / 22) * 7;
  // Both routes meet the same approach; the west rises early into branches,
  // while the east stays low in a cave before climbing at its far mouth.
  const rise = x < 0 ? smooth((z - 99) / 28) : smooth((z - 113) / 18);
  return 11 + rise * 11;
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
  canopyVine: { x: -20, z: 107.5, face: { x: -20, z: 110 } },
  canopyGlide: { ...CANOPY_GLIDE.from, face: { ...CANOPY_GLIDE.to } },
  canopyGust: { x: -26.4, z: 123, face: { x: -29, z: 123 } },
  grottoRaft: { x: 20, z: 107.5, face: { x: 20, z: 110 } },
  grottoBoiler: { x: 20, z: 117, face: { x: 20, z: 119 } },
  obsLeafy: { x: -5.5, z: 141, face: { x: -6.5, z: 142 } },
  obsBubbo: { x: 5.5, z: 141, face: { x: 6.5, z: 142 } },
  obsPuff: { x: -5.5, z: 149, face: { x: -6.5, z: 150 } },
  obsEmber: { x: 5.5, z: 149, face: { x: 6.5, z: 150 } },
};
export const CLOUD_PUZZLE_RULES: Record<CloudPuzzleId, { friend: CompanionId; need: AbilityId; command: PhraseId; noun: string; result: Text }> = {
  coastWindmill: { friend: "puff", need: "fly", command: "cmdBlow", noun: "the windmill crane", result: { en: "The windmill turns! The crane lowers a plank to the sea cave.", ja: "風車が回って、洞窟への橋が下りた！" } },
  coastCrate: { friend: "leafy", need: "grow", command: "cmdPull", noun: "the crate", result: { en: "The crate holds the plate! The side cove is open.", ja: "箱がスイッチに乗って、入り江が開いた！" } },
  canopyVine: { friend: "leafy", need: "grow", command: "cmdPull", noun: "the vine bridge", result: { en: "The vines swing the bridge into place!", ja: "つるが橋を引き寄せた！" } },
  canopyGlide: { friend: "puff", need: "fly", command: "cmdFly", noun: "the glide pad", result: { en: "Puff carries you to the other marked pad!", ja: "パフが向こうの目印まで運んでくれた！" } },
  canopyGust: { friend: "puff", need: "fly", command: "cmdBlow", noun: "the gust lane", result: { en: "The gust stops! The branch chest is within reach.", ja: "強い風が止まった！枝の宝箱へ進めるよ。" } },
  grottoRaft: { friend: "bubbo", need: "swim", command: "cmdSplash", noun: "the raft basin", result: { en: "The basin fills! The raft floats across the pool.", ja: "水がたまって、いかだが浮かんだ！" } },
  grottoBoiler: { friend: "ember", need: "fire", command: "cmdBurn", noun: "the old boiler", result: { en: "Steam lifts the gate! The upper tunnel is open.", ja: "蒸気で門が上がった！奥の道へ進もう。" } },
  obsLeafy: { friend: "leafy", need: "grow", command: "cmdPull", noun: "the observatory lever", result: { en: "The lever turns the gears! Leafy's dial lamp lights up.", ja: "レバーで歯車が動いた！リーフィのランプがついた。" } },
  obsBubbo: { friend: "bubbo", need: "swim", command: "cmdSplash", noun: "the observatory water wheel", result: { en: "The water wheel spins! Bubbo's dial lamp lights up.", ja: "水車が回った！バボのランプがついた。" } },
  obsPuff: { friend: "puff", need: "fly", command: "cmdBlow", noun: "the observatory turbine", result: { en: "The turbine spins! Puff's dial lamp lights up.", ja: "風車が回った！パフのランプがついた。" } },
  obsEmber: { friend: "ember", need: "fire", command: "cmdBurn", noun: "the observatory steam valve", result: { en: "Steam opens the valve! Ember's dial lamp lights up.", ja: "蒸気で弁が開いた！エンバーのランプがついた。" } },
};
export const CLOUD_ENEMY_SPAWNS: Array<Vec2 & { zone: CloudArea; kind: CloudEnemyKind }> = [
  { zone: "stormbreakCoast", kind: "stormCrab", x: -2, z: 16 },
  { zone: "stormbreakCoast", kind: "windSprite", x: 5, z: 21 },
  { zone: "stormbreakCoast", kind: "stormCrab", x: -3, z: 26 },
  { zone: "stormbreakCoast", kind: "windSprite", x: 4, z: 31 },
  { zone: "stormbreakCoast", kind: "stormCrab", x: -4, z: 38 },
  { zone: "stormbreakCoast", kind: "windSprite", x: 3, z: 40 },
  { zone: "windfallJunction", kind: "windSprite", x: -3, z: 88 },
  { zone: "windfallJunction", kind: "windSprite", x: 4, z: 91 },
  { zone: "windfallJunction", kind: "windSprite", x: 0, z: 95 },
  ...([-1, 1] as const).flatMap(side => [106, 114, 123].flatMap((z, i) => [
    { zone: side < 0 ? "skyrootCanopy" as const : "thunderGrotto" as const, kind: side < 0 ? "windSprite" as const : "stormCrab" as const, x: side * 17, z },
    { zone: side < 0 ? "skyrootCanopy" as const : "thunderGrotto" as const, kind: side < 0 ? "raiderDrone" as const : "thunderBeetle" as const, x: side * 24, z: z + (i === 2 ? 1 : .5) },
  ])),
  { zone: "ancientObservatory", kind: "windSprite", x: -4, z: 139 },
  { zone: "ancientObservatory", kind: "raiderDrone", x: 4, z: 142 },
  { zone: "ancientObservatory", kind: "thunderBeetle", x: -4, z: 148 },
  { zone: "ancientObservatory", kind: "windSprite", x: 4, z: 151 },
];
export const CLOUD_CHESTS = [
  { id: "cloudSeaChest", x: -18, z: 30, yaw: .5, coins: 20, amber: 0, puzzle: "coastWindmill" as const },
  { id: "cloudCoveChest", x: 17, z: 40, yaw: -.5, coins: 20, amber: 1, puzzle: "coastCrate" as const },
  { id: "cloudJunctionChest", x: 5, z: 93, yaw: -.4, coins: 20, amber: 0 },
  { id: "cloudCanopyChest", x: -32, z: 123, yaw: .4, coins: 30, amber: 1, puzzle: "canopyGust" as const },
  { id: "cloudCrystalChest", x: 32, z: 123, yaw: -.4, coins: 30, amber: 1 },
];
export const CLOUD_PICKUPS = [
  { id: "kikoBag", kind: "bag" as const, x: -17, z: 29 },
  { id: "junctionWood1", kind: "firewood" as const, x: -5, z: 88 },
  { id: "junctionWood2", kind: "firewood" as const, x: -7, z: 95 },
  { id: "junctionWood3", kind: "firewood" as const, x: 6, z: 96 },
  { id: "canopyMouthMoss", kind: "moss" as const, x: -9, z: 98 },
  { id: "canopyMoss", kind: "moss" as const, x: -25, z: 116 },
  { id: "grottoMoss", kind: "moss" as const, x: 25, z: 116 },
  { id: "canopyWood", kind: "firewood" as const, x: -24, z: 107 },
  { id: "grottoWood", kind: "firewood" as const, x: 24, z: 107 },
];
export const CLOUD_GUSTS = [{ x: -4, z: 20, w: 14, d: 3, dx: 1, dz: .2 }, { x: 2, z: 34, w: 15, d: 3, dx: -1, dz: .12 }];
export function cloudWindAt(x: number, z: number, solved: readonly string[] = []): Vec2 {
  if (!solved.includes("canopyGust") && x > -31 && x < -27 && z > 121 && z < 125) return { x: 2.4, z: 0 };
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
  for (let pz = -8; pz <= 181; pz += .5) for (let px = -36; px <= 36; px += .5) {
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
